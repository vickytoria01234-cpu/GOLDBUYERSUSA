'use strict';

// Startup server for Render.
// Binds the port immediately with basic routes, then loads the full app
// (swagger routes, controllers, etc.) in the background.
// If the full app crashes, the health/kit endpoints still respond.

process.on('uncaughtException', (err) => {
	console.error('[uncaughtException]', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
	console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
});

const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(morgan('combined'));

// Default kit config (used when exchange is not yet initialized)
const DEFAULT_KIT = {
	info: {
		name: 'GOLDBUYERSUSA',
		active: false,
		type: 'crypto',
		dark: true,
		version: '2.19.0'
	},
	color: {
		primary: '#ffffff',
		secondary: '#ffffff',
		background: '#1a1a1a'
	},
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
	links: {}
};

// Basic routes — always available
app.get('/v2/health', (req, res) => {
	res.json({ name: 'GOLDBUYERSUSA', status: 'ok', initialized: false });
});

app.get('/v2/kit', (req, res) => {
	res.json(DEFAULT_KIT);
});

app.get('/', (req, res) => {
	res.redirect('/v2/health');
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`[start] Server listening on ${HOST}:${PORT}`);
});

// Now load the full application (swagger routes, controllers) in background
setTimeout(() => {
	try {
		console.log('[start] loading full application...');
		const { logEntryRequest, stream, logger } = require('./config/logger');
		const { domainMiddleware } = require('./config/middleware');
		const swaggerDoc = require('./api/swagger/swagger');
		const swaggerTools = require('swagger-tools');
		const swaggerUi = require('swagger-ui-express');
		const bodyParser = require('body-parser');

		app.use(logEntryRequest);
		app.use(domainMiddleware);

		const options = {
			customSiteTitle: 'API Explorer'
		};

		app.use(`${swaggerDoc.basePath}/admin`, bodyParser.json({ limit: '6mb' }));

		try {
			swaggerTools.initializeMiddleware(swaggerDoc, function (middleware) {
				app.use(middleware.swaggerMetadata());
				app.use(middleware.swaggerValidator({ validateResponse: true }));
				app.use(middleware.swaggerRouter({
					useStubs: true,
					controllers: './api/controllers'
				}));
				app.use('/api/explorer', swaggerUi.serve, swaggerUi.setup(swaggerDoc, options));
				app.use('/api-explorer', swaggerUi.serve, swaggerUi.setup(swaggerDoc, options));
				console.log('[start] swagger middleware loaded successfully');
			});
		} catch (swaggerErr) {
			console.error('[start] swagger middleware error:', swaggerErr && swaggerErr.message ? swaggerErr.message : swaggerErr);
		}

		// Run checkStatus to populate configuration from DB
		const { checkStatus } = require('./init');
		checkStatus()
			.then(() => {
				console.log('[start] exchange initialized successfully');
				// Override /v2/kit to return real config now
				app.get('/v2/kit', (req, res) => {
					try {
						const toolsLib = require('hollaex-tools-lib');
						res.json(toolsLib.getKitConfig());
					} catch (e) {
						res.json(DEFAULT_KIT);
					}
				});
			})
			.catch((err) => {
				console.error('[start] checkStatus error:', err && err.message ? err.message : err);
				console.log('[start] server running in unconfigured mode — exchange needs initialization');
			});
	} catch (e) {
		console.error('[start] full app load error:', e && e.message ? e.message : e);
		console.log('[start] continuing with basic routes only');
	}
}, 1000);
