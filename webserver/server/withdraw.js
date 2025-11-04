var assert = require('assert');
var coinbase = require('./coinbase_client');
var db = require('./database');
var request = require('request');
var config = require('../config/config');

// Doesn't validate
module.exports = function(userId, satoshis, withdrawalAddress, withdrawalId, callback) {
    var minWithdraw = config.MINING_FEE + 100;
    assert(typeof userId === 'number');
    assert(satoshis >= minWithdraw);
    assert(typeof withdrawalAddress === 'string');
    assert(typeof callback === 'function');

    db.makeWithdrawal(userId, satoshis, withdrawalAddress, withdrawalId, function (err, fundingId) {
        if (err) {
            if (err.code === '23514')
                callback('NOT_ENOUGH_MONEY');
            else if(err.code === '23505')
                callback('SAME_WITHDRAWAL_ID');
            else
                callback(err);
            return;
        }

        assert(fundingId);

        var amountToSend = (satoshis - config.MINING_FEE) / 1e8;
        var amountAsString = amountToSend.toFixed(8);

        coinbase.send({ to: withdrawalAddress, amount: amountAsString }, function (err, tx) {
            if (err) {
                if (err.code && err.code.toLowerCase() === 'insufficient_funds')
                    return callback('PENDING');
                return callback('FUNDING_QUEUED');
            }

            var hash = null;
            if (tx && tx.network) {
                hash = tx.network.hash || tx.network.transaction_hash || null;
            }

            if (!hash && tx && tx.id)
                hash = tx.id;

            db.setFundingsWithdrawalTxid(fundingId, hash, function (err) {
                if (err)
                    return callback(new Error('Could not set fundingId ' + fundingId + ' to ' + hash + ': \n' + err));

                callback(null);
            });
        });
    });
};