'use strict';

const { promisifyAll } = require('bluebird');
const redis = require('redis');
const config = require('../config/redis');
const { loggerRedis } = require('../config/logger');

promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

const client = redis.createClient(config.client);

client.on('ready', () => {
	if (loggerRedis) loggerRedis.info('Redis is ready');
});

client.on('connect', () => {
	if (loggerRedis) loggerRedis.verbose('Connect to redis');
	if (config.client.password) {
		client.auth(config.client.password, () => {
			if (loggerRedis) loggerRedis.verbose('Authenticated to redis');
		});
	}
});

client.on('error', (err) => {
	if (loggerRedis) loggerRedis.error('REDIS', err.message);
	if (loggerRedis) loggerRedis.error(err);
	// Do NOT exit — allow the HTTP server to keep serving health checks
	// even if Redis is temporarily unavailable.
});


module.exports = client;
