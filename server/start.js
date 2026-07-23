'use strict';

// Minimal startup server for Render health-check.
// Binds the port immediately, then loads the full app.
// If the full app crashes, the health endpoint still responds.

const http = require('http');
const express = require('express');

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(require('cors')());

// Health check — always responds 200
app.get('/v2/health', (req, res) => {
	res.json({ name: 'GOLDBUYERSUSA', status: 'ok', initialized: false });
});
app.get('/', (req, res) => {
	res.redirect('/v2/health');
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
	console.log(`[start] Server listening on ${HOST}:${PORT}`);
});

// Now try to load the full application (non-blocking — won't kill the server)
process.on('uncaughtException', (err) => {
	console.error('[uncaughtException]', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
	console.error('[unhandledRejection]', reason && reason.message ? reason.message : reason);
});

// Attempt to initialize the full app in the background
setTimeout(() => {
	try {
		const { checkStatus } = require('./init');
		checkStatus()
			.then(() => {
				console.log('[start] exchange initialized successfully');
			})
			.catch((err) => {
				console.error('[start] checkStatus error:', err && err.message ? err.message : err);
			});
	} catch (e) {
		console.error('[start] init load error:', e && e.message ? e.message : e);
	}
}, 1000);
