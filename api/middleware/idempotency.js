// SPDX-License-Identifier: Apache-2.0
/**
 * Idempotency Middleware (#267)
 *
 * Supports Idempotency-Key header to safely retry failed write requests.
 * Caches responses for 24 hours.
 */

const crypto = require('crypto');
const dbService = require('../services/dbService');

/**
 * Generates a hash of the request body for comparison.
 */
function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
}

const idempotencyMiddleware = async (req, res, next) => {
  const key = req.header('Idempotency-Key');
  const address = req.stellarAddress; // Populated by authMiddleware

  if (!key) {
    return next();
  }

  // Only support for write methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  if (!address) {
    // If auth failed, authMiddleware would have caught it.
    // But if it's a public endpoint (unlikely for write), we skip idempotency.
    return next();
  }

  try {
    if (dbService.pool) {
      // 1. Check if key already exists
      const { rows } = await dbService.pool.query(
        'SELECT request_body, response_status, response_body, created_at FROM idempotency_keys WHERE key = $1 AND address = $2',
        [key, address]
      );

      if (rows.length > 0) {
        const cached = rows[0];
        const bodyHash = hashBody(req.body);
        const cachedHash = hashBody(cached.request_body);

        // 2. Validate body hasn't changed
        if (bodyHash !== cachedHash) {
          return res.status(422).json({
            error: 'Idempotency key reused with different request body',
            code: 'IDEMPOTENCY_BODY_MISMATCH',
          });
        }

        // 3. Return cached response
        return res.status(cached.response_status).json(cached.response_body);
      }
    }

    // 4. Wrap res.json to capture and store the response
    const originalJson = res.json;
    res.json = function (body) {
      const responseStatus = res.statusCode;
      
      // Store in background to not block the user response
      if (dbService.pool && responseStatus < 500) {
        dbService.pool.query(
          'INSERT INTO idempotency_keys (key, address, request_body, response_status, response_body) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [key, address, req.body, responseStatus, body]
        ).catch(err => console.error('[Idempotency] Failed to store key:', err));
      }

      return originalJson.call(this, body);
    };

    next();
  } catch (err) {
    console.error('[Idempotency] Middleware error:', err);
    next();
  }
};

module.exports = idempotencyMiddleware;
