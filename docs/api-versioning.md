# API Versioning Migration Guide

**Issue:** [#253](https://github.com/Vera3289/paystream-contracts/issues/253)

PayStream REST API now uses explicit versioning to allow breaking changes without disrupting existing clients.

---

## What Changed

All API routes are now prefixed with `/v1/`:

| Old (deprecated) | New (v1) |
|---|---|
| `/api/streams` | `/v1/api/streams` |
| `/api/tokens` | `/v1/api/tokens` |
| `/api/admin` | `/v1/api/admin` |
| `/api/governance` | `/v1/api/governance` |
| `/users` | `/v1/users` |

---

## Response Headers

All responses now include:

- **`X-API-Version: v1`** — current API version
- **`X-API-Deprecated: true`** (legacy routes only) — signals the endpoint is deprecated
- **`X-API-Deprecation-Notice`** (legacy routes only) — migration instructions

---

## Migration Steps

### 1. Update Base URL

Change your API client base URL from:

```js
const BASE_URL = 'https://api.paystream.example/api';
```

to:

```js
const BASE_URL = 'https://api.paystream.example/v1/api';
```

### 2. Update All Endpoint Calls

**Before:**
```js
fetch('/api/streams/create', { method: 'POST', ... });
fetch('/api/streams/123', { method: 'GET', ... });
fetch('/users/me', { method: 'GET', ... });
```

**After:**
```js
fetch('/v1/api/streams/create', { method: 'POST', ... });
fetch('/v1/api/streams/123', { method: 'GET', ... });
fetch('/v1/users/me', { method: 'GET', ... });
```

### 3. Test

Run your integration tests against the new `/v1/` endpoints. Legacy endpoints still work but will return deprecation headers.

---

## Backward Compatibility

Legacy unversioned routes (`/api/streams`, `/users`, etc.) **still work** but are deprecated. They return:

- `X-API-Deprecated: true`
- `X-API-Deprecation-Notice: This endpoint is deprecated. Migrate to /v1/ — see https://github.com/Vera3289/paystream-contracts/blob/main/docs/api-versioning.md`

**Deprecation timeline:**

- **Now:** Legacy routes work with deprecation warnings
- **v2.0.0 (TBD):** Legacy routes will be removed

---

## Example: Migrating a Client

### Before (unversioned)

```js
const response = await fetch('https://api.paystream.example/api/streams/123', {
  headers: {
    'X-API-Key': 'your-api-key',
  },
});
const stream = await response.json();
```

### After (v1)

```js
const response = await fetch('https://api.paystream.example/v1/api/streams/123', {
  headers: {
    'X-API-Key': 'your-api-key',
  },
});
const stream = await response.json();

// Optional: check version header
console.log(response.headers.get('X-API-Version')); // "v1"
```

---

## Future Versions

When breaking changes are needed, we will:

1. Release a new version (e.g., `/v2/`)
2. Keep `/v1/` routes working for at least one major version
3. Document migration steps in this guide

---

## Questions?

- Open an issue: [github.com/Vera3289/paystream-contracts/issues](https://github.com/Vera3289/paystream-contracts/issues)
- Email: `support@paystream.example`
