const express = require('express');
const { createIpRateLimiter, createWalletRateLimiter } = require('./middleware/rateLimiter');
const { pool } = require('./db/pool');

const app = express();
app.use(express.json());

const ipLimiter = createIpRateLimiter();
const walletLimiter = createWalletRateLimiter();

// Public endpoint with per-IP limit
app.get('/public', ipLimiter.middleware, (req, res) => {
  res.json({ ok: true, from: 'public' });
});

// Write endpoint with per-wallet limit (requires X-Wallet-Address header)
app.post('/write', ipLimiter.middleware, walletLimiter.middleware, (req, res) => {
  res.json({ ok: true, wrote: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));

module.exports = app;
