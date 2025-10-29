const { Pool } = require('pg');
const crypto = require('crypto');

// ---- Database configuration ----
const DB_CONFIG = {
  user: 'bustabit',
  password: 'supersecret',
  host: '127.0.0.1',
  port: 5432,
  database: 'bustabit',
  max: 10,      // max concurrent connections
  ssl: false
};

// ---- Settings ----
const OFFSET = 1e6;
const TOTAL_GAMES = 1e6;    // adjust for production/testing
const BATCH_SIZE = 1000;     // number of inserts per batch
let serverSeed = 'lol1230';

// ---- Helper: generate game hash ----
function genGameHash(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

// ---- Initialize DB pool ----
const pool = new Pool(DB_CONFIG);

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_hashes (
      game_id BIGINT PRIMARY KEY,
      hash TEXT NOT NULL
    )
  `);
}

// ---- Get last inserted game_id for resume ----
async function getLastGameId() {
  const res = await pool.query('SELECT MAX(game_id) AS last_id FROM game_hashes');
  return res.rows[0].last_id || (OFFSET - 1);
}

// ---- Insert a batch of hashes ----
async function insertBatch(startId, batchCount, startingSeed) {
  let seed = startingSeed;
  const values = [];

  for (let i = 0; i < batchCount; i++) {
    seed = genGameHash(seed);
    values.push(`(${startId + i + 1}, '${seed}')`);
  }

  const query = `INSERT INTO game_hashes(game_id, hash) VALUES ${values.join(',')}`;
  await pool.query(query);

  return seed;
}

// ---- Main population loop ----
async function populate() {
  await ensureTable();
  let lastId = await getLastGameId();
  let remaining = TOTAL_GAMES - (lastId - OFFSET + 1);

  console.log(`🌱 Starting from game_id ${lastId + 1}, ${remaining} remaining...`);

  while (remaining > 0) {
    const batch = Math.min(BATCH_SIZE, remaining);
    serverSeed = await insertBatch(lastId, batch, serverSeed);
    lastId += batch;
    remaining -= batch;

    const processed = TOTAL_GAMES - remaining;
    const pct = ((processed / TOTAL_GAMES) * 100).toFixed(2);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Processed: ${processed}/${TOTAL_GAMES} (${pct}%)`);
  }

  console.log('\n✅ Done! Final server seed:', serverSeed);
  await pool.end();
}

// ---- Run ----
populate().catch(err => {
  console.error('❌ Error during population:', err);
  pool.end();
});
