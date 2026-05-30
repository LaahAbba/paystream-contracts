const Redis = require('ioredis');

const STREAM_TTL = 10; // seconds

const metrics = { hits: 0, misses: 0 };

const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

client.on('error', (err) => {
  // Log but don't crash — cache is best-effort
  console.error('Redis error:', err.message);
});

const streamKey = (id) => `stream:${id}`;

async function getStream(id) {
  try {
    const val = await client.get(streamKey(id));
    if (val) {
      metrics.hits++;
      return JSON.parse(val);
    }
  } catch (_) { /* cache unavailable */ }
  metrics.misses++;
  return null;
}

async function setStream(id, data) {
  try {
    await client.set(streamKey(id), JSON.stringify(data), 'EX', STREAM_TTL);
  } catch (_) { /* cache unavailable */ }
}

async function invalidateStream(id) {
  try {
    await client.del(streamKey(id));
  } catch (_) { /* cache unavailable */ }
}

function getMetrics() {
  return { ...metrics };
}

module.exports = { getStream, setStream, invalidateStream, getMetrics };
