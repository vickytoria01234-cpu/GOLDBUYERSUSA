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
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';
// Base URL of the static frontend, used to build absolute coin logo URLs so the
// frontend's generateServerSideDefaultIcons() produces real icon srcs instead of
// `undefined` (which caused GET /undefined 404).
const WEB_URL = process.env.WEB_URL || 'https://goldbuyersusa-web.onrender.com';

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
	coins: {
		btc: {
			symbol: 'btc', fullname: 'Bitcoin', display_name: 'BTC', code: 'btc',
			increment_unit: 0.0001, min: 0.001, logo: `${WEB_URL}/assets/images/btc-icon.svg`,
			type: 'blockchain',
			network: 'btc', allow_deposit: true, allow_withdrawal: true, verified: true,
			meta: { color: '#F7931A', decimal_points: 8, supply: '21000000' }
		},
		eth: {
			symbol: 'eth', fullname: 'Ethereum', display_name: 'ETH', code: 'eth',
			increment_unit: 0.0001, min: 0.001, logo: `${WEB_URL}/assets/images/eth-icon.svg`,
			type: 'blockchain',
			network: 'eth', allow_deposit: true, allow_withdrawal: true, verified: true,
			meta: { color: '#627EEA', decimal_points: 18, supply: '120000000' }
		},
		usdt: {
			symbol: 'usdt', fullname: 'Tether', display_name: 'USDT', code: 'usdt',
			increment_unit: 0.01, min: 0.01, logo: `${WEB_URL}/assets/images/tusd-icon.svg`,
			type: 'fiat',
			network: 'eth', allow_deposit: true, allow_withdrawal: true, verified: true,
			meta: { color: '#26A17B', decimal_points: 6 }
		},
		xht: {
			symbol: 'xht', fullname: 'Hollaex Token', display_name: 'XHT', code: 'xht',
			increment_unit: 0.0001, min: 0.001, logo: `${WEB_URL}/assets/images/hollaex-icon-01.svg`,
			type: 'blockchain',
			network: 'eth', allow_deposit: true, allow_withdrawal: true, verified: true,
			meta: { color: '#0066FF', decimal_points: 18, supply: '200000000' }
		}
	},
	pairs: {
		'btc-usdt': {
			pair_base: 'btc', pair_2: 'usdt', increment_price: 0.01,
			min_price: 0.01, max_price: 1000000, min_size: 0.001, max_size: 1000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 }
		},
		'eth-usdt': {
			pair_base: 'eth', pair_2: 'usdt', increment_price: 0.01,
			min_price: 0.01, max_price: 100000, min_size: 0.001, max_size: 10000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 }
		},
		'xht-usdt': {
			pair_base: 'xht', pair_2: 'usdt', increment_price: 0.0001,
			min_price: 0.0001, max_price: 10000, min_size: 0.001, max_size: 100000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 }
		}
	},
	tiers: { 1: { id: 1, name: 'basic', description: 'Basic tier', level: 1 } },
	valuations_assets: {},
	info: {
		name: 'GOLDBUYERSUSA', active: true, status: true, is_trial: false,
		type: 'exchange', plan: 'crypto', dark: true, version: '2.19.0',
		description: 'Gold Buyers USA Exchange', initialized: exchangeInitialized,
		expiry: '2030-12-31T00:00:00Z'
	},
	color: {
		dark: {
			base_background: '#1a1a2e', base_top_bar_navigation: '#16213e',
			base_secondary_navigation_bar: '#0f3460', base_wallet_sidebar_and_popup: '#1a1a2e',
			base_footer: '#0f0f0f', labels_important_active_labels_text_graphics: '#e1e2d8',
			labels_secondary_inactive_label_text_graphics: '#a0a0a0', labels_fields: '#191919',
			labels_inactive_button: '#535353',
			trading_selling_related_elements: '#ee4036',
			trading_buying_related_elements: '#00a69c',
			specials_buttons_links_and_highlights: '#0066b4',
			specials_chat_messages: '#98ccb2', specials_my_username_in_chat: '#ffff00',
			specials_checks_okay_done: '#008000', specials_pending_waiting_caution: '#F6921E',
			specials_notifications_alerts_warnings: '#ed1c24'
		}
	},
	sections: {}, interface: {}, icons: {}, strings: {},
	links: {}, captcha: {}, defaults: {}, features: {}, meta: {},
	injected_values: [], injected_html: {}, black_list_countries: [],
	onramp: {}, offramp: {}, plugins: {}, user_meta: {}, user_payments: []
});

// Minimal /v2/constants response. The frontend's getConfigs() destructures this
// (web/src/index.js:130-150) and calls Object.keys(constants.pairs) at line 210,
// so it MUST contain `pairs`, `coins`, `icons`, `api_name`, etc. as objects.
// NOTE: broker/quicktrade/user_payments MUST be arrays (reducers call .forEach).
const DEFAULT_CONSTANTS = {
	api_name: 'GOLDBUYERSUSA',
	coins: {
		btc: { symbol: 'btc', fullname: 'Bitcoin', display_name: 'BTC', code: 'btc',
			increment_unit: 0.0001, min: 0.001, type: 'blockchain', allow_deposit: true,
			logo: `${WEB_URL}/assets/images/btc-icon.svg`,
			allow_withdrawal: true, verified: true, meta: { color: '#F7931A' } },
		eth: { symbol: 'eth', fullname: 'Ethereum', display_name: 'ETH', code: 'eth',
			increment_unit: 0.0001, min: 0.001, type: 'blockchain', allow_deposit: true,
			logo: `${WEB_URL}/assets/images/eth-icon.svg`,
			allow_withdrawal: true, verified: true, meta: { color: '#627EEA' } },
		usdt: { symbol: 'usdt', fullname: 'Tether', display_name: 'USDT', code: 'usdt',
			increment_unit: 0.01, min: 0.01, type: 'fiat', allow_deposit: true,
			logo: `${WEB_URL}/assets/images/tusd-icon.svg`,
			allow_withdrawal: true, verified: true, meta: { color: '#26A17B' } },
		xht: { symbol: 'xht', fullname: 'Hollaex Token', display_name: 'XHT', code: 'xht',
			increment_unit: 0.0001, min: 0.001, type: 'blockchain', allow_deposit: true,
			logo: `${WEB_URL}/assets/images/hollaex-icon-01.svg`,
			allow_withdrawal: true, verified: true, meta: { color: '#0066FF' } }
	},
	pairs: {
		'btc-usdt': { pair_base: 'btc', pair_2: 'usdt', increment_price: 0.01,
			min_price: 0.01, max_price: 1000000, min_size: 0.001, max_size: 1000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 } },
		'eth-usdt': { pair_base: 'eth', pair_2: 'usdt', increment_price: 0.01,
			min_price: 0.01, max_price: 100000, min_size: 0.001, max_size: 10000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 } },
		'xht-usdt': { pair_base: 'xht', pair_2: 'usdt', increment_price: 0.0001,
			min_price: 0.0001, max_price: 10000, min_size: 0.001, max_size: 100000,
			increment_size: 0.001, maker_fees: { '1': 0.002 }, taker_fees: { '1': 0.002 } }
	},
	icons: {},
	tiers: { 1: { id: 1, name: 'basic', description: 'Basic tier', level: 1 } },
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

// Tickers (hit by getTickers in web/src/actions/appActions.js:480; reducer spreads payload as object).
app.get('/v2/ticker/all', (req, res) => {
	const now = Date.now();
	const hour = 3600000;
	const tickers = {};
	['btc-usdt', 'eth-usdt', 'xht-usdt'].forEach((pair) => {
		const base = pair === 'btc-usdt' ? 67500 : pair === 'eth-usdt' ? 3450 : 0.211;
		const open = +(base * (0.97 + Math.random() * 0.04)).toFixed(pair === 'xht-usdt' ? 4 : 2);
		const close = +(base * (0.97 + Math.random() * 0.04)).toFixed(pair === 'xht-usdt' ? 4 : 2);
		const high = +(Math.max(open, close) * (1 + Math.random() * 0.015)).toFixed(pair === 'xht-usdt' ? 4 : 2);
		const low = +(Math.min(open, close) * (1 - Math.random() * 0.015)).toFixed(pair === 'xht-usdt' ? 4 : 2);
		const baseVol = pair === 'btc-usdt' ? 2300 : pair === 'eth-usdt' ? 15600 : 236900;
		const volume = +(baseVol * (0.85 + Math.random() * 0.3)).toFixed(pair === 'xht-usdt' ? 1 : 2);
		tickers[pair] = { close, open, high, low, volume };
	});
	res.json(tickers);
});

// Tiers (hit by requestTiers in appActions.js:739; reducer stores payload as config_level object).
app.get('/v2/tiers', (req, res) => {
	res.json({ 1: { id: 1, name: 'basic', description: 'Basic tier', level: 1, maker_fees: 0.002, taker_fees: 0.002 } });
});

// Sparkline charts (hit by getSparklines in chartAction.js:65; uses Object.entries(data).forEach).
// MUST be an object keyed by pair — never an array or null.
app.get('/v2/charts', (req, res) => {
	const from = parseInt(req.query.from) || Math.floor(Date.now() / 1000) - 86400;
	const to = parseInt(req.query.to) || Math.floor(Date.now() / 1000);
	const result = {};
	const pairPrices = { 'btc-usdt': 67500, 'eth-usdt': 3450, 'xht-usdt': 0.211 };
	Object.entries(pairPrices).forEach(([pair, basePrice]) => {
		const candles = [];
		let price = basePrice * 0.97;
		for (let t = from; t < to; t += 3600) {
			const open = price;
			const change = (Math.random() - 0.48) * basePrice * 0.02;
			const close = open + change;
			const high = Math.max(open, close) + Math.random() * basePrice * 0.005;
			const low = Math.min(open, close) - Math.random() * basePrice * 0.005;
			candles.push({ close: +close.toFixed(2), open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), time: t });
			price = close;
		}
		result[pair] = candles;
	});
	res.json(result);
});

// Oracle prices (hit by getPrices in assetActions.js:41; uses Object.keys(prices)).
app.get('/v2/oracle/prices', (req, res) => {
	res.json({ btc: 67500, eth: 3450, usdt: 1, xht: 0.211 });
});

// Mini charts (hit by getMiniCharts in chartAction.js:122; uses Object.keys(data).forEach).
// MUST be an object keyed by symbol — never an array or null.
app.get('/v2/minicharts', (req, res) => {
	const now = Math.floor(Date.now() / 1000);
	const from = now - 86400;
	const assets = (req.query.assets || '').split(',').filter(Boolean);
	const pairPrices = { btc: 67500, eth: 3450, xht: 0.211, usdt: 1 };
	const result = {};
	const symbols = assets.length ? assets.map(a => a.split('-')[0]) : Object.keys(pairPrices);
	symbols.forEach((sym) => {
		const base = pairPrices[sym] || 1;
		const points = [];
		let price = base * 0.97;
		for (let t = from; t < now; t += 3600) {
			price += (Math.random() - 0.48) * base * 0.02;
			points.push({ price: +price.toFixed(2), quote: 'usdt', symbol: sym, time: t });
		}
		result[sym] = points;
	});
	res.json(result);
});

// ----------------------------------------------------------------------------
// Trading data — orderbook, recent trades, balance, and the TradingView UDF feed.
// These make the trade view render as a real exchange instead of an empty shell.
// ----------------------------------------------------------------------------
const PAIR_BASE_PRICE = { 'btc-usdt': 67500, 'eth-usdt': 3450, 'xht-usdt': 0.211 };

const buildOrderbook = (pair) => {
	const base = PAIR_BASE_PRICE[pair] || 1;
	const dp = pair === 'xht-usdt' ? 4 : 2;
	const asks = [];
	const bids = [];
	for (let i = 1; i <= 20; i++) {
		const askPrice = +(base * (1 + i * 0.0006)).toFixed(dp);
		const bidPrice = +(base * (1 - i * 0.0006)).toFixed(dp);
		const size = +(Math.random() * (pair === 'xht-usdt' ? 5000 : 2)).toFixed(4);
		asks.push([askPrice, size]);
		bids.push([bidPrice, +(Math.random() * (pair === 'xht-usdt' ? 5000 : 2)).toFixed(4)]);
	}
	return { asks, bids, timestamp: new Date().toISOString() };
};

const buildTrades = (pair) => {
	const base = PAIR_BASE_PRICE[pair] || 1;
	const dp = pair === 'xht-usdt' ? 4 : 2;
	const out = [];
	for (let i = 0; i < 30; i++) {
		out.push({
			size: +(Math.random() * (pair === 'xht-usdt' ? 5000 : 1.5)).toFixed(4),
			price: +(base * (0.998 + Math.random() * 0.004)).toFixed(dp),
			side: Math.random() > 0.5 ? 'buy' : 'sell',
			timestamp: new Date(Date.now() - i * 45000).toISOString()
		});
	}
	return out;
};

// Orderbook — supports /v2/orderbooks (all pairs) and /v2/orderbook?symbol=btc-usdt.
app.get('/v2/orderbooks', (req, res) => {
	const out = {};
	Object.keys(PAIR_BASE_PRICE).forEach((p) => { out[p] = buildOrderbook(p); });
	res.json(out);
});

app.get('/v2/orderbook', (req, res) => {
	const pair = req.query.symbol || 'btc-usdt';
	res.json({ [pair]: buildOrderbook(pair) });
});

// Public recent trades.
app.get('/v2/trades', (req, res) => {
	const pair = req.query.symbol;
	if (pair) return res.json({ [pair]: buildTrades(pair) });
	const out = {};
	Object.keys(PAIR_BASE_PRICE).forEach((p) => { out[p] = buildTrades(p); });
	res.json(out);
});

// Authenticated user endpoints — empty but correctly shaped.
app.get('/v2/user/balance', (req, res) => {
	res.json({
		btc_balance: 0, btc_available: 0,
		eth_balance: 0, eth_available: 0,
		usdt_balance: 0, usdt_available: 0,
		xht_balance: 0, xht_available: 0,
		updated_at: new Date().toISOString()
	});
});

app.get('/v2/user/trades', (req, res) => { res.json({ count: 0, data: [] }); });
app.get('/v2/orders', (req, res) => { res.json({ count: 0, data: [] }); });
app.get('/v2/user/deposits', (req, res) => { res.json({ count: 0, data: [] }); });
app.get('/v2/user/withdrawals', (req, res) => { res.json({ count: 0, data: [] }); });

// TradingView UDF datafeed (the chart widget calls these).
app.get('/v2/udf/config', (req, res) => {
	res.json({
		supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W'],
		supports_group_request: false, supports_marks: false,
		supports_search: true, supports_timescale_marks: false
	});
});

app.get('/v2/udf/symbols', (req, res) => {
	const symbol = req.query.symbol || 'btc-usdt';
	res.json({
		name: symbol, ticker: symbol, description: symbol.toUpperCase(),
		type: 'crypto', session: '24x7', timezone: 'Etc/UTC',
		minmov: 1, pricescale: symbol === 'xht-usdt' ? 10000 : 100,
		has_intraday: true, has_daily: true, has_weekly_and_monthly: true,
		supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W'],
		volume_precision: 4, data_status: 'streaming'
	});
});

app.get('/v2/udf/history', (req, res) => {
	const symbol = req.query.symbol || 'btc-usdt';
	const base = PAIR_BASE_PRICE[symbol] || 1;
	const from = parseInt(req.query.from) || Math.floor(Date.now() / 1000) - 86400;
	const to = parseInt(req.query.to) || Math.floor(Date.now() / 1000);
	const step = 3600;
	const t = [], o = [], h = [], l = [], c = [], v = [];
	let price = base * 0.97;
	for (let ts = from; ts < to; ts += step) {
		const open = price;
		const close = open + (Math.random() - 0.48) * base * 0.02;
		t.push(ts);
		o.push(+open.toFixed(4));
		c.push(+close.toFixed(4));
		h.push(+(Math.max(open, close) * 1.003).toFixed(4));
		l.push(+(Math.min(open, close) * 0.997).toFixed(4));
		v.push(+(Math.random() * 100).toFixed(4));
		price = close;
	}
	if (!t.length) return res.json({ s: 'no_data' });
	res.json({ s: 'ok', t, o, h, l, c, v });
});

// User logins (hit by getUserLogins in userAction.js:351; action reads body.data.count directly
// and reducer calls .concat(payload.data) — MUST contain count (number) and data (array)).
app.get('/v2/user/logins', (req, res) => {
	res.json({ count: 0, data: [] });
});

// Admin role (hit by Roles/action.js:28; frontend does response.data.map — MUST be an array).
app.get('/v2/admin/role', (req, res) => {
	res.json({ data: [] });
});

// User profile (hit by userAction.js:15; guarded by value.data.id check).
app.get('/v2/user', (req, res) => {
	res.json({ id: null });
});

// Admin exchange (hit by AdminFinancials/action.js:68; consumer reads exchange.id).
app.get('/v2/admin/exchange', (req, res) => {
	res.json({ id: 1, name: 'GOLDBUYERSUSA', coins: ['btc', 'eth', 'usdt', 'xht'], pairs: ['btc-usdt', 'eth-usdt', 'xht-usdt'] });
});

// Admin coins/network (hit by AdminFinancials/action.js:44; AppWrapper:340 reads res.data.data).
app.get('/v2/admin/coins/network', (req, res) => {
	res.json({ data: [
		{ id: 'btc', symbol: 'btc', fullname: 'Bitcoin', active: true, allow_deposit: true, allow_withdrawal: true },
		{ id: 'eth', symbol: 'eth', fullname: 'Ethereum', active: true, allow_deposit: true, allow_withdrawal: true },
		{ id: 'usdt', symbol: 'usdt', fullname: 'Tether', active: true, allow_deposit: true, allow_withdrawal: true },
		{ id: 'xht', symbol: 'xht', fullname: 'Hollaex Token', active: true, allow_deposit: true, allow_withdrawal: true }
	] });
});

// Admin pairs/network (hit by AdminFinancials/action.js:48; AppWrapper:350 reads res.data.data).
app.get('/v2/admin/pairs/network', (req, res) => {
	res.json({ data: [
		{ id: 'btc-usdt', pair_base: 'btc', pair_2: 'usdt', active: true, enabled: true },
		{ id: 'eth-usdt', pair_base: 'eth', pair_2: 'usdt', active: true, enabled: true },
		{ id: 'xht-usdt', pair_base: 'xht', pair_2: 'usdt', active: true, enabled: true }
	] });
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

// ----------------------------------------------------------------------------
// WebSocket /stream — accepts connections, replies to heartbeat pings, sends
// no real data. Prevents the frontend's Socket.js from endlessly reconnecting
// and spamming console with 404 errors. The client sends
// {"op":"ping"} via ws-heartbeat; we reply {"op":"pong"} to keep the socket alive.
// ----------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
	const { pathname } = new URL(request.url, `http://${request.headers.host}`);
	if (pathname === '/stream') {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit('connection', ws, request);
		});
	} else {
		socket.destroy();
	}
});

wss.on('connection', (ws) => {
	ws.on('message', (raw) => {
		try {
			const msg = JSON.parse(raw);
			if (msg.op === 'ping') {
				ws.send(JSON.stringify({ op: 'pong' }));
			}
		} catch (_) {}
	});
});
