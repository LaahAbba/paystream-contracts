# PayStream Architecture

## Storage Tiers

The Stream Contract uses Soroban's three storage tiers:

| Tier | Keys | TTL management |
|---|---|---|
| Instance | Config, Admin, StreamCount, AllowedTokens, … | Lives with the contract instance; no explicit TTL needed |
| Persistent | Stream(id), EmployerStreams, EmployeeStreams, PauseHistory, Proposal, Voted | Explicit TTL — extended on every read and write |
| Temporary | (not used) | — |

## TTL Strategy (#289)

Soroban persistent storage entries expire if their TTL (time-to-live, measured in ledgers) reaches zero. PayStream extends TTLs proactively on every read and write so that active stream data never expires.

### Constants (`contracts/stream/src/storage.rs`)

| Constant | Default value | Meaning |
|---|---|---|
| `TTL_THRESHOLD` | 6 307 200 ledgers (~365 days at 5 s/ledger) | Minimum remaining TTL before an extension is triggered |
| `TTL_EXTEND_TO` | 12 614 400 ledgers (~730 days at 5 s/ledger) | Target TTL after extension |
| `TTL_WARN_THRESHOLD` | 518 400 ledgers (~30 days at 5 s/ledger) | Threshold below which a monitoring alert should fire |

### How it works

1. **On write** (`save_stream`, `index_employer_stream`, `index_employee_stream`, `add_pause_event`): after persisting the entry, `extend_ttl` is called with `(TTL_THRESHOLD, TTL_EXTEND_TO)`. Soroban only performs the extension when the current TTL is below `TTL_THRESHOLD`, so the call is a no-op for recently-written entries.

2. **On read** (`load_stream`): if the entry exists, `extend_ttl` is called immediately. This ensures that even read-only operations (e.g. `claimable`, `get_stream`) keep the entry alive.

3. **Warn when TTL is low**: off-chain monitoring (indexer or cron job) should query the current TTL of each `Stream(id)` entry and alert when it falls below `TTL_WARN_THRESHOLD` (~30 days). This gives operators time to trigger a write (e.g. a no-op `top_up`) before the entry expires.

### Adjusting TTL for different networks

Stellar Mainnet and Testnet may have different ledger close times. To adjust:

1. Change `TTL_THRESHOLD` and `TTL_EXTEND_TO` in `contracts/stream/src/storage.rs`.
2. Rebuild and redeploy the contract.

A ledger-to-days conversion: `days = ledgers × close_time_seconds / 86400`.

## Multi-Network Support (#260)

The backend supports testnet and mainnet simultaneously. Network selection is controlled by the `X-Network` request header (values: `testnet`, `mainnet`). When the header is absent the backend defaults to `testnet` in development and `mainnet` in production.

Each network has its own RPC endpoint and database schema:

| Variable | Purpose |
|---|---|
| `TESTNET_RPC_URL` | Soroban RPC for testnet |
| `MAINNET_RPC_URL` | Soroban RPC for mainnet |
| `TESTNET_STREAM_CONTRACT_ID` | Stream contract on testnet |
| `MAINNET_STREAM_CONTRACT_ID` | Stream contract on mainnet |
| `TESTNET_DATABASE_URL` | Postgres connection string for testnet schema |
| `MAINNET_DATABASE_URL` | Postgres connection string for mainnet schema |

See `.env.example` for the full list of variables.

## Blue-Green Deployment (#301)

Zero-downtime deployments are achieved with a blue-green strategy:

1. Two identical API environments (`blue` and `green`) run behind a load balancer.
2. The inactive slot receives the new release.
3. An automated health check (`/health`) must return HTTP 200 before traffic is switched.
4. Traffic is switched by updating the load balancer target (or DNS CNAME).
5. Instant rollback: switch the load balancer back to the previous slot.

See `scripts/deploy-blue-green.sh` and `.github/workflows/deploy-blue-green.yml` for the implementation.
