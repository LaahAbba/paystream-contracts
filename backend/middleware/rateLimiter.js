const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

function retryAfterSeconds(ms) {
  return Math.ceil(ms / 1000);
}

function createIpRateLimiter() {
  // 100 requests per minute per IP
  const opts = {
    storeClient: redisClient,
    points: 100,
    duration: 60,
    keyPrefix: 'rl_ip'
  };
  const rl = new RateLimiterRedis(opts);

  return {
    rl,
    middleware: async (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      try {
        await rl.consume(key, 1);
        return next();
      } catch (rejRes) {
        const retry = retryAfterSeconds(rejRes.msBeforeNext || 0);
        res.set('Retry-After', String(retry));
        return res.status(429).json({ error: 'Too Many Requests', retry_after: retry });
      }
    }
  };
}

function createWalletRateLimiter() {
  // 30 requests per minute per wallet for write endpoints
  const opts = {
    storeClient: redisClient,
    points: 30,
    duration: 60,
    keyPrefix: 'rl_wallet'
  };
  const rl = new RateLimiterRedis(opts);

  return {
    rl,
    middleware: async (req, res, next) => {
      const wallet = req.headers['x-wallet-address'];
      if (!wallet) {
        return res.status(400).json({ error: 'Missing X-Wallet-Address header' });
      }
      try {
        await rl.consume(wallet, 1);
        return next();
      } catch (rejRes) {
        const retry = retryAfterSeconds(rejRes.msBeforeNext || 0);
        res.set('Retry-After', String(retry));
        return res.status(429).json({ error: 'Too Many Requests', retry_after: retry });
      }
    }
  };
}

async function closeRedis() {
  await redisClient.quit();
}

module.exports = { createIpRateLimiter, createWalletRateLimiter, closeRedis };
