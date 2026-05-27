// SPDX-License-Identifier: Apache-2.0
/**
 * JWT Authentication Middleware (#245)
 *
 * Validates Bearer JWT tokens issued by POST /auth/verify.
 * Falls back to X-API-Key for backward compatibility.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-in-env';

/**
 * Verify a Bearer JWT token from the Authorization header.
 * Also accepts legacy X-API-Key for backward compatibility.
 */
const authMiddleware = (req, res, next) => {
  // 1. Try Bearer JWT
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.stellarAddress = payload.sub;
      return next();
    } catch (err) {
      return res.status(401).json({
        error: 'Invalid or expired JWT',
        code: 'INVALID_JWT',
      });
    }
  }

  // 2. Legacy X-API-Key fallback
  const apiKey = req.header('X-API-Key');
  if (apiKey) {
    const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
    if (validApiKeys.includes(apiKey)) {
      req.apiKey = apiKey;
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
  }

  return res.status(401).json({
    error: 'Authentication required. Use Bearer <jwt> or X-API-Key header.',
    code: 'MISSING_AUTH',
  });
};

module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
