var assert = require('assert');
var CoinbaseClient = require('../../lib/coinbase');
var config = require('../config/config');

var client = new CoinbaseClient({
    apiKey: config.COINBASE_API_KEY,
    apiSecret: config.COINBASE_API_SECRET,
    accountId: config.COINBASE_ACCOUNT_ID,
    apiVersion: config.COINBASE_API_VERSION,
    maxPages: parseInt(config.COINBASE_MAX_PAGES, 10) || undefined
});

assert(config.COINBASE_API_KEY, 'Missing Coinbase API key');
assert(config.COINBASE_API_SECRET, 'Missing Coinbase API secret');
assert(config.COINBASE_ACCOUNT_ID, 'Missing Coinbase account identifier');

module.exports = client;
