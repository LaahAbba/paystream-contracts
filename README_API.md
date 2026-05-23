# PayStream REST API

A REST API wrapper for PayStream smart contracts, enabling teams that cannot use JavaScript SDK directly to interact with PayStream protocol.

## Features

- **Complete Contract Coverage**: Endpoints for all stream and token contract functions
- **API Key Authentication**: Secure access via configurable API keys
- **Rate Limiting**: Built-in protection against abuse
- **OpenAPI Documentation**: Auto-generated API documentation
- **Comprehensive Error Handling**: Consistent error responses
- **Input Validation**: Request validation for all endpoints

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Configure your environment variables in `.env`:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# API Keys (comma-separated for multiple keys)
API_KEYS=your-api-key-here,another-api-key

# Stellar Configuration
STELLAR_NETWORK=testnet
STREAM_CONTRACT_ID=your-stream-contract-id
TOKEN_CONTRACT_ID=your-token-contract-id

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. Start server:
```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3000`

### Health and Readiness Probes

The API exposes unauthenticated probe endpoints for runtime monitoring:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Returns process health, uptime, start time, timestamp, and API version |
| GET | `/ready` | Checks configured dependencies and returns `503` when Soroban RPC or an optional database dependency is unavailable |

`/ready` checks Soroban RPC via `SOROBAN_RPC_URL`. If `DATABASE_URL` is configured, it also opens a short TCP connection to that database endpoint before reporting ready.

### API Documentation

Once the server is running, visit `http://localhost:3000/api-docs` to explore the interactive OpenAPI documentation.

## Authentication

All API endpoints require authentication via an `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" \
     http://localhost:3000/api/streams/count
```

## API Endpoints

### Streams

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/streams/create` | Create a new salary stream |
| POST | `/api/streams/create-batch` | Create multiple streams atomically |
| POST | `/api/streams/{id}/withdraw` | Withdraw claimable tokens |
| POST | `/api/streams/{id}/top-up` | Add funds to a stream |
| POST | `/api/streams/{id}/pause` | Pause a stream |
| POST | `/api/streams/{id}/resume` | Resume a paused stream |
| POST | `/api/streams/{id}/cancel` | Cancel a stream |
| POST | `/api/streams/{id}/update-rate` | Update stream rate |
| GET | `/api/streams/{id}` | Get stream information |
| GET | `/api/streams/{id}/claimable` | Get claimable amount |
| GET | `/api/streams/by-employer/{address}` | Get streams by employer |
| GET | `/api/streams/by-employee/{address}` | Get streams by employee |
| GET | `/api/streams/count` | Get total stream count |

### Tokens

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tokens/total-supply` | Get total token supply |
| GET | `/api/tokens/balance/{address}` | Get token balance |
| POST | `/api/tokens/transfer` | Transfer tokens |
| POST | `/api/tokens/approve` | Approve token spending |
| POST | `/api/tokens/transfer-from` | Transfer on behalf |
| POST | `/api/tokens/mint` | Mint new tokens |
| POST | `/api/tokens/add-minter` | Add minter role |
| POST | `/api/tokens/remove-minter` | Remove minter role |
| GET | `/api/tokens/is-minter/{address}` | Check minter status |
| POST | `/api/tokens/burn` | Burn tokens |
| POST | `/api/tokens/burn-from` | Burn on behalf |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/initialize` | Initialize contract |
| POST | `/api/admin/propose-admin` | Propose new admin |
| POST | `/api/admin/accept-admin` | Accept admin role |
| POST | `/api/admin/pause-contract` | Pause contract |
| POST | `/api/admin/unpause-contract` | Unpause contract |
| POST | `/api/admin/set-min-deposit` | Set minimum deposit |
| POST | `/api/admin/set-protocol-fee` | Set protocol fee |
| POST | `/api/admin/set-max-streams` | Set max streams per employer |
| POST | `/api/admin/upgrade` | Upgrade contract |
| POST | `/api/admin/migrate` | Migrate contract |
| GET | `/api/admin/admin-nonce` | Get admin nonce |
| GET | `/api/admin/max-streams` | Get max streams limit |

### Governance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/governance/propose` | Propose parameter change |
| POST | `/api/governance/vote` | Vote on proposal |
| POST | `/api/governance/tally/{id}` | Tally votes |
| POST | `/api/governance/execute/{id}` | Execute proposal |
| GET | `/api/governance/proposal/{id}` | Get proposal info |
| GET | `/api/governance/pause-history/{id}` | Get pause history |
| POST | `/api/governance/propose-employer-transfer` | Propose employer transfer |
| POST | `/api/governance/accept-employer-transfer` | Accept employer transfer |

## Example Usage

### Create a Stream

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "employer": "GD5...",
    "employee": "GB7...",
    "token_address": "CC7...",
    "deposit": "1000000",
    "rate_per_second": "100",
    "stop_time": 0,
    "cooldown_period": 0,
    "cliff_time": 0
  }' \
  http://localhost:3000/api/streams/create
```

### Get Stream Information

```bash
curl -H "X-API-Key: your-api-key" \
     http://localhost:3000/api/streams/1
```

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

### Common Error Codes

- `MISSING_API_KEY` - No API key provided
- `INVALID_API_KEY` - Invalid API key
- `VALIDATION_ERROR` - Request validation failed
- `CONTRACT_ERROR` - Smart contract execution failed
- `RATE_LIMIT_EXCEEDED` - Too many requests

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default**: 100 requests per 15 minutes per IP
- **Configurable**: Set via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (Unix timestamp)

## Security

- **API Key Authentication**: All endpoints require valid API keys
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against abuse
- **HTTPS**: Use HTTPS in production
- **Environment Variables**: Sensitive data in environment variables

## Support

For issues and questions:
- Create an issue in repository
- Email: support@paystream.example

## License

Apache License 2.0 - see LICENSE file for details.
