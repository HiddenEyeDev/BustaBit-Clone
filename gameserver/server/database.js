const assert = require('assert');
const uuid = require('uuid');
const async = require('async');
const lib = require('./lib');
const { Pool, types } = require('pg');
const config = require('./config');

if (!config.DATABASE_URL) throw new Error('must set DATABASE_URL environment var');

console.log('DATABASE_URL: ', config.DATABASE_URL);

// Parse int8 and numeric properly
types.setTypeParser(20, val => val === null ? null : parseInt(val)); // int8
types.setTypeParser(1700, val => val === null ? null : parseFloat(val)); // numeric

// Create pool
const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 120000
});

pool.on('error', (err) => {
    console.error('POSTGRES EMITTED AN ERROR', err);
});

// Generic query
function query(text, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }
    pool.query(text, params, callback);
}

// Transaction helper
function runTransaction(runner, callback) {
    pool.connect((err, client, release) => {
        if (err) return callback(err);

        const rollback = (err) => {
            client.query('ROLLBACK', () => release());
            callback(err);
        };

        client.query('BEGIN', (err) => {
            if (err) return rollback(err);

            runner(client, (err, data) => {
                if (err) return rollback(err);

                client.query('COMMIT', (err) => {
                    release();
                    if (err) return rollback(err);
                    callback(null, data);
                });
            });
        });
    });
}

exports.query = query;
exports.getClient = runTransaction;

// --- Game functions ---

exports.getLastGameInfo = function(callback) {
    query('SELECT MAX(id) id FROM games', (err, results) => {
        if (err) return callback(err);
        assert(results.rows.length === 1);

        const id = results.rows[0].id;

        if (!id || id < 1e6) {
            return callback(null, {
                id: 1e6 - 1,
                hash: 'c1cfa8e28fc38999eaa888487e443bad50a65e0b710f649affa6718cfbfada4d'
            });
        }

        query('SELECT hash FROM game_hashes WHERE game_id = $1', [id], (err, results) => {
            if (err) return callback(err);
            assert(results.rows.length === 1);
            callback(null, { id, hash: results.rows[0].hash });
        });
    });
};

exports.getUserByName = function(username, callback) {
    assert(username);
    query('SELECT * FROM users WHERE lower(username) = lower($1)', [username], (err, result) => {
        if (err) return callback(err);
        if (result.rows.length === 0) return callback('USER_DOES_NOT_EXIST');
        assert(result.rows.length === 1);
        callback(null, result.rows[0]);
    });
};

exports.validateOneTimeToken = function(token, callback) {
    assert(token);
    query(
        'WITH t AS (UPDATE sessions SET expired = now() WHERE id = $1 AND ott = TRUE RETURNING *) ' +
        'SELECT * FROM users WHERE id = (SELECT user_id FROM t)',
        [token], (err, result) => {
            if (err) return callback(err);
            if (result.rowCount === 0) return callback('NOT_VALID_TOKEN');
            assert(result.rows.length === 1);
            callback(null, result.rows[0]);
        }
    );
};

// --- Transaction helpers ---
function addSatoshis(client, userId, amount, callback) {
    client.query(
        'UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2',
        [amount, userId],
        (err, res) => {
            if (err) return callback(err);
            assert(res.rowCount === 1);
            callback(null);
        }
    );
}

// --- Bets ---
exports.placeBet = function(amount, autoCashOut, userId, gameId, callback) {
    assert(typeof amount === 'number');
    assert(typeof autoCashOut === 'number');
    assert(typeof userId === 'number');
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');

    runTransaction((client, cb) => {
        async.parallel([
            cb2 => client.query(
                'UPDATE users SET balance_satoshis = balance_satoshis - $1 WHERE id = $2',
                [amount, userId], cb2
            ),
            cb2 => client.query(
                'INSERT INTO plays(user_id, game_id, bet, auto_cash_out) VALUES($1, $2, $3, $4) RETURNING id',
                [userId, gameId, amount, autoCashOut], cb2
            )
        ], (err, results) => {
            if (err) return cb(err);
            const playId = results[1].rows[0].id;
            cb(null, playId);
        });
    }, callback);
};

exports.cashOut = function(userId, playId, amount, callback) {
    assert(typeof userId === 'number');
    assert(typeof playId === 'number');
    assert(typeof amount === 'number');
    assert(typeof callback === 'function');

    runTransaction((client, cb) => {
        addSatoshis(client, userId, amount, (err) => {
            if (err) return cb(err);

            client.query(
                'UPDATE plays SET cash_out = $1 WHERE id = $2 AND cash_out IS NULL',
                [amount, playId],
                (err, result) => {
                    if (err) return cb(err);
                    if (result.rowCount !== 1)
                        return cb(new Error('Double cashout detected'));
                    cb(null);
                }
            );
        });
    }, callback);
};

// --- End Game ---
const endGameQuery =
    `WITH vals AS (
        SELECT unnest($1::bigint[]) as user_id,
               unnest($2::bigint[]) as play_id,
               unnest($3::bigint[]) as bonus
    ), p AS (
        UPDATE plays SET bonus = vals.bonus FROM vals WHERE id = vals.play_id RETURNING vals.user_id
    ), u AS (
        UPDATE users SET balance_satoshis = balance_satoshis + vals.bonus
        FROM vals WHERE id = vals.user_id RETURNING vals.user_id
    ) SELECT COUNT(*) count FROM p JOIN u ON p.user_id = u.user_id`;

exports.endGame = function(gameId, bonuses, callback) {
    assert(typeof gameId === 'number');
    assert(typeof callback === 'function');

    runTransaction((client, cb) => {
        client.query('UPDATE games SET ended = true WHERE id = $1', [gameId], (err) => {
            if (err) return cb(err);

            const userIds = [];
            const playIds = [];
            const bonusAmounts = [];

            bonuses.forEach(bonus => {
                assert(lib.isInt(bonus.user.id));
                assert(lib.isInt(bonus.playId));
                assert(lib.isInt(bonus.amount) && bonus.amount > 0);
                userIds.push(bonus.user.id);
                playIds.push(bonus.playId);
                bonusAmounts.push(bonus.amount);
            });

            if (userIds.length === 0) return cb();

            client.query(endGameQuery, [userIds, playIds, bonusAmounts], (err, result) => {
                if (err) return cb(err);
                if (result.rows[0].count !== userIds.length)
                    return cb(new Error('Mismatch row count'));
                cb();
            });
        });
    }, callback);
};

// --- Create Game ---
exports.createGame = function(gameId, callback) {
    assert(typeof gameId === 'number');

    query('SELECT hash FROM game_hashes WHERE game_id = $1', [gameId], (err, results) => {
        if (err) return callback(err);
        if (results.rows.length !== 1) return callback('NO_GAME_HASH');

        const hash = results.rows[0].hash;
        const gameCrash = lib.crashPointFromHash(hash);
        assert(lib.isInt(gameCrash));

        query('INSERT INTO games(id, game_crash) VALUES($1, $2)', [gameId, gameCrash], (err) => {
            if (err) return callback(err);
            callback(null, { crashPoint: gameCrash, hash });
        });
    });
};

// --- Bankroll ---
exports.getBankroll = function(callback) {
    query(
        `SELECT (
            (SELECT COALESCE(SUM(amount),0) FROM fundings) -
            (SELECT COALESCE(SUM(balance_satoshis),0) FROM users)
        ) AS profit`, (err, results) => {
            if (err) return callback(err);
            assert(results.rows.length === 1);
            const profit = results.rows[0].profit - 100e8;
            callback(null, Math.max(1e8, profit));
        }
    );
};

// --- Game History ---
exports.getGameHistory = function(callback) {
    const sql =
        `SELECT games.id game_id, game_crash, created,
                (SELECT hash FROM game_hashes WHERE game_id = games.id),
                (SELECT to_json(array_agg(to_json(pv)))
                    FROM (
                        SELECT username, bet, (100 * cash_out / bet) AS stopped_at, bonus
                        FROM plays JOIN users ON user_id = users.id
                        WHERE game_id = games.id
                    ) pv
                ) player_info
         FROM games
         WHERE games.ended = true
         ORDER BY games.id DESC
         LIMIT 10`;

    query(sql, (err, data) => {
        if (err) return callback(err);

        data.rows.forEach(row => {
            const oldInfo = row.player_info || [];
            const newInfo = row.player_info = {};
            oldInfo.forEach(play => {
                newInfo[play.username] = {
                    bet: play.bet,
                    stopped_at: play.stopped_at,
                    bonus: play.bonus
                };
            });
        });

        callback(null, data.rows);
    });
};
