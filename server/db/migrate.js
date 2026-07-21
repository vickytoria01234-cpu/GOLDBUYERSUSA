'use strict';

// Self-contained Sequelize migration runner.
// Uses the `umzug` package (a production dependency) directly so that we do
// not depend on the `sequelize-cli` binary being installed.
//
// Usage:  node db/migrate.js
// Exits non-zero on failure so the process manager can surface it.

const path = require('path');
const Umzug = require('umzug');
const Sequelize = require('sequelize');

const config = require('../config/db')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(
	config.database,
	config.username,
	config.password,
	{
		host: config.host,
		port: config.port,
		dialect: config.dialect,
		dialectOptions: config.dialectOptions,
		logging: false,
		define: config.define
	}
);

const umzug = new Umzug({
	storage: 'sequelize',
	storageOptions: { sequelize },
	migrations: {
		params: [
			sequelize.getQueryInterface(),
			Sequelize
		],
		path: path.resolve(__dirname, 'migrations'),
		pattern: /^\d+[\w-]+\.js$/
	}
});

(async () => {
	console.log('[migrate] connecting to database...');
	await sequelize.authenticate();
	console.log('[migrate] database connection OK');

	const executed = await umzug.executed();
	console.log(`[migrate] ${executed.length} migration(s) already applied`);

	const pending = await umzug.pending();
	if (pending.length === 0) {
		console.log('[migrate] no pending migrations');
		await sequelize.close();
		return;
	}

	console.log(`[migrate] applying ${pending.length} pending migration(s)...`);
	await umzug.up();
	console.log('[migrate] all migrations applied successfully');
	await sequelize.close();
})().catch((err) => {
	console.error('[migrate] FAILED:', err && err.message ? err.message : err);
	process.exit(1);
});
