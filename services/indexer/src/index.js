// SPDX-License-Identifier: Apache-2.0
// PayStream stream event indexer (#247)
//
// Polls Soroban RPC every POLL_INTERVAL_MS for new contract events,
// stores them in PostgreSQL, and exposes a query API on PORT.
"use strict";

require("dotenv").config();
const http = require("http");
const { SorobanRpc, xdr } = require("@stellar/stellar-sdk");
const { Pool } = require("pg");
const { Worker } = require("bullmq");
const { indexerQueue, connection } = require("./queue");

const {
  SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org",
  STREAM_CONTRACT_ID,
  DATABASE_URL,
  POLL_INTERVAL_MS = "5000",
  PORT = "3002",
} = process.env;

if (!STREAM_CONTRACT_ID) { console.error("STREAM_CONTRACT_ID is required"); process.exit(1); }
if (!DATABASE_URL)        { console.error("DATABASE_URL is required");        process.exit(1); }

const rpc  = new SorobanRpc.Server(SOROBAN_RPC_URL);
const pool = new Pool({ connectionString: DATABASE_URL });

// ---------------------------------------------------------------------------
// Worker for processing indexing jobs
// ---------------------------------------------------------------------------

const worker = new Worker(
  "indexer",
  async (job) => {
    const { ledger, txHash, eventType, streamId, topics, data } = job.data;
    console.log(`[Job ${job.id}] Indexing event ${eventType} for stream #${streamId}`);

    try {
      await pool.query(
        `INSERT INTO stream_events
           (ledger_sequence, tx_hash, event_type, stream_id, raw_topics, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_hash, event_type, stream_id) DO NOTHING`,
        [ledger, txHash, eventType, streamId, JSON.stringify(topics), JSON.stringify(data)]
      );
    } catch (err) {
      console.error("DB insert error:", err.message);
      throw err; // Trigger retry
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[Job ${job.id}] Event indexed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`[Job ${job.id}] Failed: ${err.message}`);
});

// ---------------------------------------------------------------------------
// XDR decoding helpers
// ---------------------------------------------------------------------------

function decodeScVal(val) {
  if (!val) return null;
  switch (val.switch().name) {
    case "scvSymbol":  return val.sym().toString();
    case "scvU64":     return String(val.u64().toBigInt());
    case "scvI128":    return String((BigInt(val.i128().hi().toString()) << 64n) | BigInt(val.i128().lo().toString()));
    case "scvAddress": return val.address().toString();
    case "scvBool":    return val.b();
    case "scvVec":     return val.vec().map(decodeScVal);
    default:           return val.toXDR("base64");
  }
}

function parseEvent(raw) {
  const topics = (raw.topic || []).map((t) => decodeScVal(xdr.ScVal.fromXDR(t, "base64")));
  const data   = decodeScVal(xdr.ScVal.fromXDR(raw.value?.xdr || raw.value, "base64"));
  const eventType = String(topics[0] ?? "unknown");
  // stream_id is the second topic for per-stream events; absent for contract-level events
  const streamId  = topics[1] != null && !isNaN(Number(topics[1])) ? Number(topics[1]) : null;
  return { eventType, streamId, topics, data };
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

async function getLastLedger() {
  const { rows } = await pool.query("SELECT last_ledger FROM indexer_cursor WHERE id = TRUE");
  return rows[0] ? Number(rows[0].last_ledger) : 0;
}

async function setLastLedger(ledger) {
  await pool.query(
    "UPDATE indexer_cursor SET last_ledger = $1 WHERE id = TRUE",
    [ledger]
  );
}

// ---------------------------------------------------------------------------
// Indexing loop
// ---------------------------------------------------------------------------

async function indexEvents() {
  const lastLedger = await getLastLedger();

  // getEvents requires startLedger > 0; use 1 on first run.
  const startLedger = lastLedger > 0 ? lastLedger + 1 : 1;

  let result;
  try {
    result = await rpc.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [STREAM_CONTRACT_ID] }],
    });
  } catch (err) {
    // RPC may return "startLedger too old" if we're behind by more than the
    // retention window — advance cursor to the latest ledger to recover.
    if (err.message && err.message.includes("startLedger")) {
      const info = await rpc.getLatestLedger();
      console.warn(`Cursor too old, advancing to ledger ${info.sequence}`);
      await setLastLedger(info.sequence);
    } else {
      console.error("getEvents error:", err.message);
    }
    return;
  }

  const events = result.events || [];
  let maxLedger = lastLedger;

  for (const raw of events) {
    const ledger = Number(raw.ledger);
    const txHash = raw.txHash || raw.transaction_hash || "";
    const { eventType, streamId, topics, data } = parseEvent(raw);

    await indexerQueue.add(
      `index-${txHash}-${eventType}-${streamId}`,
      { ledger, txHash, eventType, streamId, topics, data }
    );

    if (ledger > maxLedger) maxLedger = ledger;
  }

  // Advance cursor even if no events — prevents re-scanning the same range.
  const latestLedger = Number(result.latestLedger ?? maxLedger);
  if (latestLedger > lastLedger) {
    await setLastLedger(latestLedger);
  }

  if (events.length > 0) {
    console.log(`Indexed ${events.length} event(s) up to ledger ${latestLedger}`);
  }
}

// ---------------------------------------------------------------------------
// Query API
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // GET /events?stream_id=<n>&event_type=<t>&limit=<n>&offset=<n>
  if (req.method === "GET" && url.pathname === "/events") {
    const streamId   = url.searchParams.get("stream_id");
    const eventType  = url.searchParams.get("event_type");
    const limit      = Math.min(parseInt(url.searchParams.get("limit")  || "50", 10), 200);
    const offset     = parseInt(url.searchParams.get("offset") || "0", 10);

    const conditions = [];
    const params     = [];
    if (streamId)  { params.push(Number(streamId));  conditions.push(`stream_id = $${params.length}`); }
    if (eventType) { params.push(eventType);          conditions.push(`event_type = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    try {
      const { rows } = await pool.query(
        `SELECT id, ledger_sequence, tx_hash, event_type, stream_id, raw_topics, raw_data, indexed_at
         FROM stream_events ${where}
         ORDER BY ledger_sequence ASC, id ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      sendJson(res, 200, { events: rows, count: rows.length });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /status
  if (req.method === "GET" && url.pathname === "/status") {
    try {
      const lastLedger = await getLastLedger();
      const { rows }   = await pool.query("SELECT COUNT(*) AS total FROM stream_events");
      sendJson(res, 200, { lastIndexedLedger: lastLedger, totalEvents: Number(rows[0].total) });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const INTERVAL = parseInt(POLL_INTERVAL_MS, 10);

server.listen(Number(PORT), () => {
  console.log(`PayStream indexer API listening on port ${PORT}`);
  console.log(`  Contract : ${STREAM_CONTRACT_ID}`);
  console.log(`  RPC      : ${SOROBAN_RPC_URL}`);
  console.log(`  Poll     : every ${INTERVAL}ms`);
});

// Run immediately then on interval
indexEvents().catch(console.error);
setInterval(() => indexEvents().catch(console.error), INTERVAL);
