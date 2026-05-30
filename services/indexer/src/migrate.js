// SPDX-License-Identifier: Apache-2.0
// Run once to create the indexer schema: node src/migrate.js
"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await pool.query(`
    -- Cursor: tracks the last successfully processed ledger sequence.
    -- Used to resume after restart and to detect missed blocks.
    CREATE TABLE IF NOT EXISTS indexer_cursor (
      id          BOOLEAN PRIMARY KEY DEFAULT TRUE,  -- singleton row
      last_ledger BIGINT  NOT NULL DEFAULT 0
    );
    INSERT INTO indexer_cursor (id, last_ledger) VALUES (TRUE, 0)
      ON CONFLICT (id) DO NOTHING;

    -- All indexed contract events.
    CREATE TABLE IF NOT EXISTS stream_events (
      id              BIGSERIAL PRIMARY KEY,
      ledger_sequence BIGINT      NOT NULL,
      tx_hash         TEXT        NOT NULL,
      event_type      TEXT        NOT NULL,   -- 'created','withdraw','topup', etc.
      stream_id       BIGINT,                 -- NULL for contract-level events
      raw_topics      JSONB       NOT NULL,
      raw_data        JSONB       NOT NULL,
      indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      -- Deduplication: one row per (tx_hash, event_type, stream_id)
      UNIQUE (tx_hash, event_type, stream_id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_stream_id   ON stream_events (stream_id);
    CREATE INDEX IF NOT EXISTS idx_events_event_type  ON stream_events (event_type);
    CREATE INDEX IF NOT EXISTS idx_events_ledger      ON stream_events (ledger_sequence);

    -- Webhook registrations (#249)
    CREATE TABLE IF NOT EXISTS webhooks (
      id          UUID PRIMARY KEY,
      url         TEXT NOT NULL,
      address     TEXT NOT NULL,
      secret      TEXT NOT NULL,
      events      TEXT[] NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_address ON webhooks (address);

    -- Idempotency keys (#267)
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id              BIGSERIAL PRIMARY KEY,
      key             TEXT        NOT NULL,
      address         TEXT        NOT NULL,
      request_body    JSONB       NOT NULL,
      response_status INTEGER     NOT NULL,
      response_body   JSONB       NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (key, address)
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys (key, address);
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at);
  `);
  console.log("Migration complete.");
  await pool.end();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
