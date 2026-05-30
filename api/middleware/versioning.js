// SPDX-License-Identifier: Apache-2.0
/**
 * API Versioning Middleware (#253)
 *
 * - Injects `X-API-Version` and `X-API-Deprecated` response headers.
 * - `X-API-Deprecated` is set only when the request hits a deprecated (legacy) route.
 */

const CURRENT_VERSION = 'v1';
const DEPRECATED_VERSIONS = new Set(['v0']);

/**
 * Attach version headers to every response.
 * Call this on all routes (versioned and legacy alike).
 */
const versionHeader = (req, res, next) => {
  res.setHeader('X-API-Version', CURRENT_VERSION);
  next();
};

/**
 * Mark a response as deprecated and advise migration.
 * Mount this on legacy (unversioned) route groups.
 */
const deprecationWarning = (req, res, next) => {
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader(
    'X-API-Deprecation-Notice',
    'This endpoint is deprecated. Migrate to /v1/ — see https://github.com/Vera3289/paystream-contracts/blob/main/docs/api-versioning.md'
  );
  next();
};

module.exports = { versionHeader, deprecationWarning, CURRENT_VERSION, DEPRECATED_VERSIONS };
