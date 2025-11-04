var async = require('async');
var CoinbaseClient = require('../lib/coinbase');
var db = require('./src/db');

var POLL_INTERVAL = parseInt(process.env.COINBASE_POLL_INTERVAL || '20000', 10);
if (isNaN(POLL_INTERVAL) || POLL_INTERVAL < 5000)
    POLL_INTERVAL = 20000;

var MAX_TRACKED_TRANSACTIONS = parseInt(process.env.COINBASE_MAX_TRACKED || '1000', 10);
if (isNaN(MAX_TRACKED_TRANSACTIONS) || MAX_TRACKED_TRANSACTIONS < 100)
    MAX_TRACKED_TRANSACTIONS = 1000;

var coinbaseClient = new CoinbaseClient({
    apiKey: process.env.COINBASE_API_KEY,
    apiSecret: process.env.COINBASE_API_SECRET,
    accountId: process.env.COINBASE_ACCOUNT_ID,
    apiVersion: process.env.COINBASE_API_VERSION,
    maxPages: parseInt(process.env.COINBASE_MAX_PAGES || '5', 10) || 5
});

var processedTransactions = Object.create(null);
var processedOrder = [];

function trackProcessed(id) {
    processedTransactions[id] = true;
    processedOrder.push(id);

    while (processedOrder.length > MAX_TRACKED_TRANSACTIONS) {
        var oldest = processedOrder.shift();
        delete processedTransactions[oldest];
    }
}

function untrack(id) {
    if (!processedTransactions[id])
        return;

    delete processedTransactions[id];
    var index = processedOrder.indexOf(id);
    if (index !== -1)
        processedOrder.splice(index, 1);
}

function extractTransactionHash(tx) {
    if (tx && tx.network) {
        if (tx.network.hash)
            return tx.network.hash;
        if (tx.network.transaction_hash)
            return tx.network.transaction_hash;
    }
    return tx && tx.id ? tx.id : null;
}

function extractTransactionAddress(tx) {
    if (!tx)
        return null;

    if (tx.address)
        return tx.address;

    if (tx.to) {
        if (Array.isArray(tx.to) && tx.to.length > 0) {
            var candidate = tx.to[0];
            if (candidate) {
                if (typeof candidate === 'string')
                    return candidate;
                if (candidate.address)
                    return candidate.address;
            }
        } else if (tx.to.address) {
            return tx.to.address;
        }
    }

    if (tx.details) {
        if (tx.details.coinbase_address)
            return tx.details.coinbase_address;
        if (tx.details.to && tx.details.to.address)
            return tx.details.to.address;
    }

    return null;
}

function isIncomingBitcoin(tx) {
    if (!tx || !tx.amount)
        return false;

    var currency = tx.amount.currency || tx.amount.currency_code || tx.amount.currencyCode;
    if (currency && currency.toUpperCase() !== 'BTC')
        return false;

    var value = parseFloat(tx.amount.amount || tx.amount.value || tx.amount);
    if (isNaN(value) || value <= 0)
        return false;

    if (tx.status && tx.status.toLowerCase() !== 'completed')
        return false;

    return true;
}

function processTransactions(transactions, callback) {
    var tasks = [];

    transactions.forEach(function(tx) {
        if (!isIncomingBitcoin(tx))
            return;

        var txid = extractTransactionHash(tx);
        if (!txid || processedTransactions[txid])
            return;

        var address = extractTransactionAddress(tx);
        if (!address)
            return;

        processedTransactions[txid] = true;

        tasks.push(function(cb) {
            var amount = parseFloat(tx.amount.amount || tx.amount.value || tx.amount);

            db.addDepositByAddress(address, txid, amount, function(err) {
                if (err) {
                    untrack(txid);
                    return cb(err);
                }

                trackProcessed(txid);
                cb();
            });
        });
    });

    async.parallelLimit(tasks, 3, callback);
}

function poll() {
    coinbaseClient.listTransactions({ limit: 100 }, function(err, transactions) {
        if (err) {
            console.error('Unable to fetch Coinbase transactions:', err.message || err);
            return schedule();
        }

        processTransactions(transactions || [], function(processErr) {
            if (processErr)
                console.error('Error processing Coinbase transactions:', processErr.message || processErr);

            schedule();
        });
    });
}

function schedule() {
    setTimeout(poll, POLL_INTERVAL);
}

console.log('Starting Coinbase deposit watcher with interval', POLL_INTERVAL, 'ms');
poll();
