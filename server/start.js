'use strict';

// Minimal startup server for Render.
// Binds the port immediately with health + kit endpoints.
// Does NOT load heavy modules (hollaex-tools-lib, swagger-tools, init.js)
// to avoid OOM on the 512MB free tier.
// The exchange must be initialized separately (via CLI/seeder).

process.on('uncaughtException', (err) => {
	console.error('[uncaughtException]', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
	console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
});

const http = require('http');
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());

// Default kit config (serves the frontend even when exchange is uninitialized)
const DEFAULT_KIT = {
	coins: {},
	pairs: {},
	tiers: {},
	valuations_assets: {},
	info: {
		name: 'GOLDBUYERSUSA',
		active: true,
		type: '',
		dark: true,
		version: '2.19.0',
		description: 'Gold Buyers USA Exchange',
		initialized: false
	},
	color: {
		primary: '#ffffff',
		secondary: '#ffffff',
		background: '#1a1a1a'
	},
	sections: {},
	interface: {},
	icons: {},
	strings: {},
	links: {},
	captcha: {},
	defaults: {},
	features: {},
	meta: {},
	injected_values: [],
	injected_html: {},
	black_list_countries: [],
	onramp: {},
	offramp: {},
	plugins: {},
	user_meta: {}
};

app.get('/v2/health', (req, res) => {
	res.json({ name: 'GOLDBUYERSUSA', status: 'ok', initialized: false });
});

app.get('/v2/kit', (req, res) => {
	res.json(DEFAULT_KIT);
});

app.get('/', (req, res) => {
	res.redirect('/v2/health');
});

// Catch-all: return JSON for any unmatched /v2/* route so the frontend
// doesn't crash trying to parse HTML 404 pages as JSON.
app.use('/v2/*', (req, res) => {
	res.json({ message: 'Not configured', initialized: false });
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`[start] Server listening on ${HOST}:${PORT}`);
});
