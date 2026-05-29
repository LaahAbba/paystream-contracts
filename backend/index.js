const http = require('http');
const express = require('express');
const { createIpRateLimiter, createWalletRateLimiter, closeRedis } = require('./middleware/rateLimiter');
const { pool } = require('./db/pool');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Multi-network support (#260)
// Resolve the active network config from the X-Network request header.
// Falls back to STELLAR_NETWORK env var, which defaults to 'testnet'.
// ---------------------------------------------------------------------------
const SUPPORTED_NETWORKS = ['testnet', 'mainnet'];
const DEFAULT_NETWORK = process.env.STELLAR_NETWORK || 'testnet';

function getNetworkConfig(req) {
  const requested = (req.headers['x-network'] || DEFAULT_NETWORK).toLowerCase();
  const network = SUPPORTED_NETWORKS.includes(requested) ? requested : DEFAULT_NETWORK;
  const prefix = network.toUpperCase();
  return {
    network,
    rpcUrl: process.env[`${prefix}_RPC_URL`],
    streamContractId: process.env[`${prefix}_STREAM_CONTRACT_ID`],
    tokenContractId: process.env[`${prefix}_TOKEN_CONTRACT_ID`],
    databaseUrl: process.env[`${prefix}_DATABASE_URL`],
  };
}

// Attach network config to every request so route handlers can use it.
app.use((req, _res, next) => {
  req.networkConfig = getNetworkConfig(req);
  next();
});

const ipLimiter = createIpRateLimiter();
const walletLimiter = createWalletRateLimiter();

// Public endpoint with per-IP limit
app.get('/public', ipLimiter.middleware, (req, res) => {
  res.json({ ok: true, from: 'public', network: req.networkConfig.network });
});

// Write endpoint with per-wallet limit (requires X-Wallet-Address header)
app.post('/write', ipLimiter.middleware, walletLimiter.middleware, (req, res) => {
  res.json({ ok: true, wrote: true, network: req.networkConfig.network });
});

const port = process.env.PORT || 3000;
let server;
let isShuttingDown = false;

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server) {
      return resolve();
    }
    server.close((err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[Backend Shutdown] ${signal} received, draining connections`);

  const forceExit = setTimeout(() => {
    console.error('[Backend Shutdown] Force exiting after 30 seconds');
    process.exit(1);
  }, 30000);

  try {
    await stopServer();
    await pool.end();
    await closeRedis();
    console.log('[Backend Shutdown] DB and Redis connections closed');
  } catch (error) {
    console.error('[Backend Shutdown] Error during shutdown', error);
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server = http.createServer(app);
server.listen(port, () => console.log(`API listening on ${port}`));

module.exports = app;
