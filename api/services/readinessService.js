const net = require('net');
const tls = require('tls');

const DEFAULT_TIMEOUT_MS = 3000;

const HEALTHY_RPC_STATUSES = new Set(['healthy', 'ok', 'pass', 'up']);

const defaultSorobanRpcUrl = () => {
  if (process.env.SOROBAN_RPC_URL) {
    return process.env.SOROBAN_RPC_URL;
  }

  return process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://rpc.mainnet.stellar.org'
    : 'https://soroban-testnet.stellar.org';
};

const redactUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch (error) {
    return rawUrl;
  }
};

const formatError = (error) => ({
  message: error.message,
});

const withTimeout = async (task, timeoutMs, timeoutMessage) => {
  const timeout = new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    task
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });

  return timeout;
};

const checkSorobanRpc = async (timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const rpcUrl = defaultSorobanRpcUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'readiness',
        method: 'getHealth',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RPC health check returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || 'RPC health check failed');
    }

    const rpcStatus = String(payload.result?.status || payload.result || '').toLowerCase();
    if (rpcStatus && !HEALTHY_RPC_STATUSES.has(rpcStatus)) {
      throw new Error(`RPC reported ${rpcStatus}`);
    }

    return {
      name: 'sorobanRpc',
      status: 'ok',
      url: redactUrl(rpcUrl),
      rpcStatus: rpcStatus || 'ok',
    };
  } catch (error) {
    return {
      name: 'sorobanRpc',
      status: 'error',
      url: redactUrl(rpcUrl),
      error: formatError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const defaultPortForProtocol = (protocol) => {
  const ports = {
    'postgres:': 5432,
    'postgresql:': 5432,
    'mysql:': 3306,
    'mariadb:': 3306,
    'mongodb:': 27017,
    'redis:': 6379,
    'rediss:': 6379,
  };

  return ports[protocol];
};

const connectToDatabaseEndpoint = (databaseUrl, timeoutMs) => {
  const url = new URL(databaseUrl);
  const port = Number(url.port || defaultPortForProtocol(url.protocol));

  if (!url.hostname || !port) {
    throw new Error('DATABASE_URL must include a host and a supported port');
  }

  const socketFactory = url.protocol === 'rediss:' ? tls.connect : net.connect;

  return new Promise((resolve, reject) => {
    const socket = socketFactory({
      host: url.hostname,
      port,
      timeout: timeoutMs,
    });

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.once('connect', () => {
      cleanup();
      resolve();
    });

    socket.once('timeout', () => {
      cleanup();
      reject(new Error('Database connection timed out'));
    });

    socket.once('error', (error) => {
      cleanup();
      reject(error);
    });
  });
};

const checkDatabase = async (timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      name: 'database',
      status: 'skipped',
      reason: 'DATABASE_URL is not configured',
    };
  }

  try {
    await withTimeout(
      connectToDatabaseEndpoint(databaseUrl, timeoutMs),
      timeoutMs,
      'Database connection timed out'
    );

    return {
      name: 'database',
      status: 'ok',
      url: redactUrl(databaseUrl),
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'error',
      url: redactUrl(databaseUrl),
      error: formatError(error),
    };
  }
};

const checkReadiness = async () => {
  const checks = await Promise.all([checkSorobanRpc(), checkDatabase()]);
  const ready = checks.every((check) => check.status !== 'error');

  return {
    ready,
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
};

module.exports = {
  checkReadiness,
  checkSorobanRpc,
  checkDatabase,
};
