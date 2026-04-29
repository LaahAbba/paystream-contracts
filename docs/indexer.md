# PayStream Event Indexer Guide

This guide explains how to set up an event indexer to track PayStream contract events using Stellar Horizon or a custom listener.

## Event Overview

All PayStream events are emitted via Soroban's `env.events().publish()`. Each event has:

- **Topics** — a tuple identifying the event type and optionally the stream ID
- **Data** — a tuple or scalar value with event-specific fields

### Complete Event Schema

| Event | Topic | Data |
|---|---|---|
| `created` | `("created", stream_id)` | `(employer, employee, rate_per_second)` |
| `withdraw` | `("withdraw", stream_id)` | `(employee, amount)` |
| `status` | `("status", stream_id)` | `StreamStatus` |
| `topup` | `("topup", stream_id)` | `(employer, amount)` |
| `paused` (stream) | `("paused", stream_id)` | `(employer, employee, paused_at)` |
| `resumed` | `("resumed", stream_id)` | `(employer, employee, resumed_at)` |
| `paused` (contract) | `("paused",)` | `bool` |
| `nearexhst` | `("nearexhst", stream_id)` | `(employer, threshold_days)` |
| `ratechng` | `("ratechng", stream_id)` | `(old_rate, new_rate)` |
| `emp_prop` | `("emp_prop", stream_id)` | `(old_employer, new_employer)` |
| `emp_acc` | `("emp_acc", stream_id)` | `(old_employer, new_employer)` |
| `propcreat` | `("propcreat", proposal_id)` | `proposal_id` |
| `propexec` | `("propexec", proposal_id)` | `proposal_id` |

### `StreamStatus` values

- `Active`
- `Paused`
- `Cancelled`
- `Exhausted`

---

## Option 1: Horizon Event Streaming

Stellar Horizon exposes a `/transactions` and `/effects` endpoint. For Soroban contract events, use the `/contract_events` endpoint (Horizon v2.28+).

```bash
# Stream all events for the PayStream contract
curl -N "https://horizon-testnet.stellar.org/contract_events\
?contract_id=<STREAM_CONTRACT_ID>\
&cursor=now\
&order=asc"
```

Each event in the response has the shape:

```json
{
  "type": "contract",
  "contract_id": "C...",
  "topic": ["AAAADwAAAAdjcmVhdGVkAA==", "AAAABQAAAAEAAAAA"],
  "value": "..."
}
```

Topics and values are XDR-encoded. Use the Stellar SDK to decode them.

---

## Option 2: Custom Event Listener (JavaScript)

Save as `scripts/event-listener.js` and run with Node.js.

```javascript
// scripts/event-listener.js
// Listens for PayStream contract events via Horizon SSE and logs decoded payloads.
// Usage: STREAM_CONTRACT_ID=C... node scripts/event-listener.js

import { Contract, Networks, SorobanRpc, xdr } from "@stellar/stellar-sdk";
import EventSource from "eventsource";

const CONTRACT_ID = process.env.STREAM_CONTRACT_ID;
const RPC_URL =
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const HORIZON_URL =
  process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";

if (!CONTRACT_ID) {
  console.error("Set STREAM_CONTRACT_ID env var");
  process.exit(1);
}

// Decode a single XDR ScVal to a JS primitive
function decodeVal(scVal) {
  switch (scVal.switch().name) {
    case "scvSymbol":
      return scVal.sym().toString();
    case "scvU64":
      return Number(scVal.u64().toBigInt());
    case "scvI128":
      return scVal.i128().lo().toBigInt();
    case "scvAddress":
      return scVal.address().toString();
    case "scvBool":
      return scVal.b();
    case "scvVec":
      return scVal.vec().map(decodeVal);
    default:
      return scVal.toXDR("base64");
  }
}

function decodeEvent(raw) {
  const topics = raw.topic.map((t) =>
    decodeVal(xdr.ScVal.fromXDR(t, "base64"))
  );
  const data = decodeVal(xdr.ScVal.fromXDR(raw.value, "base64"));
  return { topics, data };
}

const url =
  `${HORIZON_URL}/contract_events` +
  `?contract_id=${CONTRACT_ID}&cursor=now&order=asc`;

console.log(`Listening for PayStream events on contract ${CONTRACT_ID}...`);

const es = new EventSource(url);

es.addEventListener("message", (e) => {
  try {
    const raw = JSON.parse(e.data);
    const { topics, data } = decodeEvent(raw);
    const [eventName, streamId] = topics;
    console.log(
      JSON.stringify({ event: eventName, stream_id: streamId, data }, null, 2)
    );
  } catch (err) {
    console.error("Failed to decode event:", err.message);
  }
});

es.addEventListener("error", (e) => {
  console.error("SSE error:", e);
});
```

### Dependencies

```bash
npm install @stellar/stellar-sdk eventsource
```

### Running

```bash
STREAM_CONTRACT_ID=C... node scripts/event-listener.js
```

---

## Option 3: Soroban RPC `getEvents` (polling)

For environments without SSE support, poll `getEvents` via the Soroban RPC:

```javascript
import { SorobanRpc, xdr } from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server(
  process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"
);

async function pollEvents(contractId, startLedger) {
  const result = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [contractId] }],
  });
  for (const event of result.events) {
    const topics = event.topic.map((t) => xdr.ScVal.fromXDR(t, "base64"));
    console.log(topics[0].sym().toString(), event.value);
  }
  return result.latestLedger;
}
```

---

## Indexing Recommendations

- **Persist cursor/ledger** — store the last processed ledger sequence so restarts don't reprocess events.
- **Filter by topic** — use Horizon's `topic` filter parameter to subscribe to specific event types (e.g., only `withdraw` events).
- **Handle reorgs** — Stellar finalises quickly but store `transaction_hash` alongside indexed events for deduplication.
- **Rate limits** — Horizon public endpoints are rate-limited; use a dedicated RPC node for production indexers.

---

## Example: Filtering Only `withdraw` Events

```bash
curl -N "https://horizon-testnet.stellar.org/contract_events\
?contract_id=<STREAM_CONTRACT_ID>\
&topic1=AAAADwAAAAh3aXRoZHJhdwA=\
&cursor=now&order=asc"
```

The `topic1` value is the base64-XDR encoding of the symbol `"withdraw"`. Generate it with:

```javascript
import { xdr } from "@stellar/stellar-sdk";
const encoded = xdr.ScVal.scvSymbol("withdraw").toXDR("base64");
console.log(encoded);
```
