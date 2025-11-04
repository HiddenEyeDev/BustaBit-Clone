'use strict';

var crypto = require('crypto');
var querystring = require('querystring');
var request = require('request');

function CoinbaseClient(options) {
    options = options || {};

    if (!options.apiKey)
        throw new Error('Coinbase API key is required');
    if (!options.apiSecret)
        throw new Error('Coinbase API secret is required');
    if (!options.accountId)
        throw new Error('Coinbase account identifier is required');

    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.accountId = options.accountId;
    this.apiVersion = options.apiVersion || '2023-10-01';
    this.apiBase = options.apiBase || 'https://api.coinbase.com';
    this.timeout = options.timeout || 30000;
    this.maxPages = options.maxPages || 5;
}

CoinbaseClient.prototype._request = function(method, path, opts, callback) {
    opts = opts || {};
    var params = opts.params || {};
    var body = opts.body || null;

    var requestPath = path;

    var hasParams = params && Object.keys(params).length > 0;
    if (hasParams) {
        var query = querystring.stringify(params);
        if (query) {
            requestPath += (requestPath.indexOf('?') === -1 ? '?' : '&') + query;
        }
    }

    var hasBody = typeof body !== 'undefined' && body !== null;
    var bodyString = '';
    if (hasBody) {
        bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    }

    var timestamp = Math.floor(Date.now() / 1000).toString();
    var message = timestamp + method.toUpperCase() + requestPath + bodyString;
    var signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');

    var requestOptions = {
        method: method,
        url: this.apiBase + requestPath,
        headers: {
            'CB-ACCESS-KEY': this.apiKey,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'CB-VERSION': this.apiVersion,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        timeout: this.timeout
    };

    if (hasBody && method !== 'GET') {
        requestOptions.body = bodyString;
    }

    request(requestOptions, function(err, response, responseBody) {
        if (err) return callback(err);

        var parsed;
        try {
            parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (ex) {
            return callback(new Error('Unable to parse Coinbase response: ' + ex.message));
        }

        if (response.statusCode >= 400) {
            var errorMessage = 'Coinbase API error';
            var errorCode;

            if (parsed && parsed.errors && parsed.errors.length > 0) {
                errorMessage = parsed.errors.map(function(e) {
                    if (typeof e === 'string') return e;
                    if (e && e.message) return e.message;
                    if (e && e.id) return e.id;
                    return 'Unknown error';
                }).join(', ');

                if (parsed.errors[0] && parsed.errors[0].id)
                    errorCode = parsed.errors[0].id;
            } else if (parsed && parsed.error) {
                errorMessage = parsed.error;
            }

            var apiError = new Error(errorMessage);
            apiError.statusCode = response.statusCode;
            if (errorCode)
                apiError.code = errorCode;
            return callback(apiError);
        }

        callback(null, parsed);
    });
};

CoinbaseClient.prototype._paginate = function(path, params, maxPages, callback) {
    var self = this;
    var results = [];
    var pagesFetched = 0;
    var limitPages = maxPages || this.maxPages;

    function handle(nextPath, nextParams) {
        if (!nextPath)
            return callback(null, results);

        if (pagesFetched >= limitPages)
            return callback(null, results);

        pagesFetched += 1;

        self._request('GET', nextPath, { params: nextParams }, function(err, res) {
            if (err) return callback(err);

            if (res && Array.isArray(res.data))
                results = results.concat(res.data);

            var pagination = res && res.pagination ? res.pagination : null;
            if (pagination && pagination.next_uri) {
                handle(pagination.next_uri, null);
            } else {
                callback(null, results);
            }
        });
    }

    handle(path, params);
};

CoinbaseClient.prototype.listTransactions = function(options, callback) {
    options = options || {};
    var params = {};
    if (options.limit)
        params.limit = options.limit;

    var maxPages = options.maxPages || this.maxPages;
    var path = '/v2/accounts/' + this.accountId + '/transactions';
    this._paginate(path, params, maxPages, callback);
};

CoinbaseClient.prototype.getAddressTransactions = function(addressId, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    if (!addressId)
        return callback(new Error('Address identifier required'));

    var params = {};
    if (options.limit)
        params.limit = options.limit;

    var maxPages = options.maxPages || this.maxPages;
    var path = '/v2/accounts/' + this.accountId + '/addresses/' + addressId + '/transactions';
    this._paginate(path, params, maxPages, callback);
};

CoinbaseClient.prototype.createAddress = function(label, callback) {
    var body = {};
    if (label)
        body.name = label;

    var path = '/v2/accounts/' + this.accountId + '/addresses';
    this._request('POST', path, { body: body }, function(err, res) {
        if (err) return callback(err);
        callback(null, res && res.data ? res.data : res);
    });
};

CoinbaseClient.prototype.send = function(options, callback) {
    options = options || {};
    if (!options.to)
        return callback(new Error('Destination address required'));
    if (!options.amount)
        return callback(new Error('Amount required'));

    var body = {
        type: 'send',
        to: options.to,
        amount: options.amount,
        currency: options.currency || 'BTC'
    };

    if (options.description)
        body.description = options.description;

    if (options.twoFactorToken)
        body.two_factor_token = options.twoFactorToken;

    var path = '/v2/accounts/' + this.accountId + '/transactions';
    this._request('POST', path, { body: body }, function(err, res) {
        if (err) return callback(err);
        callback(null, res && res.data ? res.data : res);
    });
};

module.exports = CoinbaseClient;
