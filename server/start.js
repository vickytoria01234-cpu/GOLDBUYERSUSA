'use strict';

// Minimal startup server for Render.
// Binds the port immediately with health + kit + constants + plugins endpoints.
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

// Default kit config (serves the frontend even when exchange is uninitialized).
// info.initialized: false tells the frontend to route to the Init/Setup screen
// rather than trying to render the full exchange (which would crash without
// seeded data). This is the "working but uninitialized" state.
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
	user_meta: {},
	user_payments: {}
};

// Minimal /v2/constants response. The frontend's getConfigs() destructures this
// (web/src/index.js:130-150) and calls Object.keys(constants.pairs) at line 210,
// so it MUST contain `pairs`, `coins`, `icons`, `api_name`, etc. as objects.
// Returning {message:'Not configured'} here crashed the frontend with
// "Cannot convert undefined or null to object" from Object.keys(undefined).
const DEFAULT_CONSTANTS = {
	api_name: 'GOLDBUYERSUSA',
	coins: {},
	pairs: {},
	icons: {},
	tiers: {},
	valuation_assets: {},
	transactionLimits: {},
	broker: false,
	quicktrade: {},
	fiat: {},
	user_payments: {}
};

app.get('/v2/health', (req, res) => {
	res.json({ name: 'GOLDBUYERSUSA', status: 'ok', initialized: false });
});

app.get('/v2/kit', (req, res) => {
	res.json(DEFAULT_KIT);
});

app.get('/v2/constants', (req, res) => {
	res.json(DEFAULT_CONSTANTS);
});

// Plugins endpoint (hit by requestPlugins() in web/src/index.js:292).
// Must return { data: [] } shape so the frontend destructures cleanly.
app.get('/plugins', (req, res) => {
	res.json({ data: [] });
});

// Announcements endpoint (hit by getAnnouncementDetails when logged in).
app.get('/v2/announcements', (req, res) => {
	res.json({ data: [] });
});

app.get('/', (req, res) => {
	res.redirect('/v2/health');
});

// Catch-all: return JSON for any unmatched route so the frontend doesn't
// crash trying to parse HTML 404 pages as JSON.
app.use((req, res) => {
	res.status(404).json({ message: 'Not configured', initialized: false });
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`[start] Server listening on ${HOST}:${PORT}`);
});
