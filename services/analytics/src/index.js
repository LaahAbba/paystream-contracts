// SPDX-License-Identifier: Apache-2.0
"use strict";

require("dotenv").config();
const http = require("http");
const { Horizon } = require("@stellar/stellar-sdk");

const {
  HORIZON_URL = "https://horizon-testnet.stellar.org",
  CONTRACT_ID,
  PORT = "3001",
  CACHE_TTL_SECONDS = "60",
} = process.env;

if (!CONTRACT_ID) {
  console.error("CONTRACT_ID is required");
  process.exit(1);
}

const server = new Horizon.Server(HORIZON_URL);
const CACHE_TTL_MS = Number(CACHE_TTL_SECONDS) * 1000;

let cache = null;
let cacheExpiry = 0;

/**
 * Walk all pages of contract events for CONTRACT_ID and compute aggregate stats.
 * @returns {{ totalStreams, totalValueLocked, totalWithdrawn, activeStreamCount }}
 */
async function computeStats() {
  const stats = {
    totalStreams: 0,
    totalValueLocked: BigInt(0),
    totalWithdrawn: BigInt(0),
    activeStreamCount: 0,
  };

  // Track per-stream state to compute TVL and active count
  const streams = new Map(); // streamId -> { deposit, withdrawn, status }

  let page = await server
    .contractEvents()
    .forContract(CONTRACT_ID)
    .order("asc")
    .limit(200)
    .call();

  while (true) {
    for (const record of page.records ?? []) {
      const topics = record.topic ?? [];
      const type = String(topics[0]?.value ?? topics[0] ?? "");
      const streamId = String(topics[1]?.value ?? topics[1] ?? "");
      const data = record.value?.value ?? record.value;

      switch (type) {
        case "created": {
          stats.totalStreams += 1;
          const deposit = BigInt(data?.[2] ?? 0); // rate_per_second used as proxy; deposit not in event
          streams.set(streamId, { deposit, withdrawn: BigInt(0), status: "Active" });
          break;
        }
        case "withdraw": {
          const amount = BigInt(data?.[1] ?? 0);
          stats.totalWithdrawn += amount;
          if (streams.has(streamId)) {
            streams.get(streamId).withdrawn += amount;
          }
          break;
        }
        case "topup": {
          const amount = BigInt(data?.[1] ?? 0);
          if (streams.has(streamId)) {
            streams.get(streamId).deposit += amount;
          }
          break;
        }
        case "status": {
          const status = String(data ?? "");
          if (streams.has(streamId)) {
            streams.get(streamId).status = status;
          }
          break;
        }
      }
    }

    if ((page.records ?? []).length < 200) break;
    page = await page.next();
  }

  // TVL = sum of (deposit - withdrawn) for Active streams
  for (const s of streams.values()) {
    if (s.status === "Active") {
      stats.activeStreamCount += 1;
      const locked = s.deposit - s.withdrawn;
      if (locked > BigInt(0)) stats.totalValueLocked += locked;
    }
  }

  return {
    totalStreams: stats.totalStreams,
    totalValueLocked: stats.totalValueLocked.toString(),
    totalWithdrawn: stats.totalWithdrawn.toString(),
    activeStreamCount: stats.activeStreamCount,
  };
}

async function getStats() {
  const now = Date.now();
  if (cache && now < cacheExpiry) return cache;
  cache = await computeStats();
  cacheExpiry = now + CACHE_TTL_MS;
  return cache;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.method !== "GET" || req.url !== "/analytics") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const stats = await getStats();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    });
    res.end(JSON.stringify({ ...stats, cachedUntil: new Date(cacheExpiry).toISOString() }));
  } catch (err) {
    console.error("Analytics error:", err.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch analytics" }));
  }
});

httpServer.listen(Number(PORT), () => {
  console.log(`PayStream analytics API listening on port ${PORT}`);
  console.log(`  Contract : ${CONTRACT_ID}`);
  console.log(`  Horizon  : ${HORIZON_URL}`);
  console.log(`  Cache TTL: ${CACHE_TTL_SECONDS}s`);
  console.log(`  Endpoint : GET http://localhost:${PORT}/analytics`);
});
