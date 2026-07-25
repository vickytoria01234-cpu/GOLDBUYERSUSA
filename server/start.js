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
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// ----------------------------------------------------------------------------
// In-memory state. Flips to true after admin signup so /v2/kit and /v2/health
// report initialized: true, which lets the frontend route to /admin instead of
// looping back to /init.
// ----------------------------------------------------------------------------
let exchangeInitialized = false;
let adminCredentials = null; // { email, password }

// Build a JWT the frontend can decode (jwt-decode only base64-decodes; it does
// NOT verify the signature). The frontend's authReducer reads `scopes` (array
// including 'admin') and utils/token.js isAdmin() reads `sub.role`. Both must
// be present for the admin to be recognized and routed to /admin.
const buildToken = (email) => {
	const header = { alg: 'none', typ: 'JWT' };
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		sub: {
			email,
			role: 'admin',
			id: 1,
			is_admin: true,
			is_super_admin: true,
			is_supervisor: true,
			is_support: true,
			is_kyc: true,
			permissions: [],
			configs: []
		},
		scopes: ['admin'],
		exp: now + 24 * 60 * 60,
		iat: now
	};
	const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
	return `${b64(header)}.${b64(payload)}.`;
};

// Default kit config (serves the frontend even when exchange is uninitialized).
// info.initialized flips to true after admin signup.
const buildKit = () => ({
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
		initialized: exchangeInitialized
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
	user_payments: []
});

// Minimal /v2/constants response. The frontend's getConfigs() destructures this
// (web/src/index.js:130-150) and calls Object.keys(constants.pairs) at line 210,
// so it MUST contain `pairs`, `coins`, `icons`, `api_name`, etc. as objects.
// NOTE: broker/quicktrade/user_payments MUST be arrays (reducers call .forEach).
const DEFAULT_CONSTANTS = {
	api_name: 'GOLDBUYERSUSA',
	coins: {},
	pairs: {},
	icons: {},
	tiers: {},
	valuation_assets: {},
	transactionLimits: {},
	broker: [],
	quicktrade: [],
	fiat: {},
	user_payments: []
};

// ----------------------------------------------------------------------------
// Endpoints
// ----------------------------------------------------------------------------

app.get('/v2/health', (req, res) => {
	res.json({ name: 'GOLDBUYERSUSA', status: 'ok', initialized: exchangeInitialized });
});

app.get('/v2/kit', (req, res) => {
	res.json(buildKit());
});

app.get('/v2/constants', (req, res) => {
	res.json(DEFAULT_CONSTANTS);
});

// Plugins endpoint (hit by requestPlugins() in web/src/index.js:292).
app.get('/plugins', (req, res) => {
	res.json({ data: [] });
});

// Announcements endpoint (hit by getAnnouncementDetails when logged in).
app.get('/v2/announcements', (req, res) => {
	res.json({ data: [] });
});

// Admin signup - the Init wizard's step 4 calls POST /v2/admin/signup with
// { email, password }. On success it returns 201 { message: 'Success' } and
// the real server flips Status.initialized = true. We replicate that here
// in-memory so the wizard can complete and advance to the login step.
app.post('/v2/admin/signup', (req, res) => {
	const { email, password } = req.body || {};
	if (!email || !/@/.test(email)) {
		return res.status(400).json({ message: 'Provide a valid email' });
	}
	if (!password || password.length < 8) {
		return res.status(400).json({ message: 'Invalid password' });
	}
	if (exchangeInitialized) {
		return res.status(400).json({ message: 'Exchange is already initialized' });
	}
	adminCredentials = { email, password };
	exchangeInitialized = true;
	console.log(`[admin/signup] initial admin created: ${email}`);
	return res.status(201).json({ message: 'Success' });
});

// Login - the Init wizard's login step calls POST /v2/login with
// { email, password }. The real server returns 201 { token: '<jwt>' }. The
// frontend's storeLoginResult decodes the token client-side (no server
// verify call) and dispatches VERIFY_TOKEN_FULFILLED. The token MUST contain
// sub.role: 'admin' and scopes: ['admin'] for isAdmin() to return true.
app.post('/v2/login', (req, res) => {
	const { email, password } = req.body || {};
	if (!adminCredentials || adminCredentials.email !== email || adminCredentials.password !== password) {
		return res.status(401).json({ message: 'Invalid email or password' });
	}
	const token = buildToken(email);
	return res.status(201).json({ token });
});

// Verify-token - not strictly needed (storeLoginResult doesn't call it), but
// included for completeness so any future code that hits /v2/verify-token
// gets a 200 instead of a 404.
app.get('/v2/verify-token', (req, res) => {
	res.json({ valid: true });
});

// Logout - hit by requestLogout() in authAction.js:115.
app.get('/v2/logout', (req, res) => {
	res.json({ message: 'Success' });
});

app.get('/', (req, res) => {
	res.redirect('/v2/health');
});

// Catch-all: return JSON for any unmatched route so the frontend doesn't
// crash trying to parse HTML 404 pages as JSON.
app.use((req, res) => {
	res.status(404).json({ message: 'Not configured', initialized: exchangeInitialized });
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`[start] Server listening on ${HOST}:${PORT}`);
});
