// SPDX-License-Identifier: Apache-2.0
"use strict";

require("dotenv").config();
const { Horizon } = require("@stellar/stellar-sdk");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { Pool } = require("pg");

const {
  HORIZON_URL = "https://horizon-testnet.stellar.org",
  CONTRACT_ID,
  DATABASE_URL,
  WEBHOOK_URL,
  WEBHOOK_SECRET = "legacy-secret",
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM = "notifications@paystream.example",
  POLL_INTERVAL_MS = "5000",
  WATCH_EVENTS = "created,withdraw,status,paused,cancelled",
} = process.env;

if (!CONTRACT_ID) {
  console.error("CONTRACT_ID is required");
  process.exit(1);
}

const watchSet = new Set(WATCH_EVENTS.split(",").map((e) => e.trim()));
const server = new Horizon.Server(HORIZON_URL);
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

// Optional SMTP transport
const mailer =
  SMTP_HOST && SMTP_USER
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

/** Sign payload with HMAC SHA-256 (#249) */
function signPayload(payload, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

/** Dispatch webhook with exponential backoff retry (#249) */
async function dispatchWebhook(url, payload, secret, attempt = 1) {
  const MAX_ATTEMPTS = 5;
  const signature = signPayload(payload, secret);

  try {
    await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-PayStream-Signature": signature,
      },
      timeout: 5000,
    });
    console.log(`[Webhook] Delivered to ${url}`);
  } catch (err) {
    console.error(`[Webhook] Delivery failed to ${url} (Attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.pow(2, attempt) * 1000;
      setTimeout(() => dispatchWebhook(url, payload, secret, attempt + 1), delay);
    }
  }
}

/** Send webhooks to all registered listeners (#249) */
async function notifyWebhooks(eventType, payload, addresses) {
  // 1. Legacy global webhook
  if (WEBHOOK_URL) {
    dispatchWebhook(WEBHOOK_URL, payload, WEBHOOK_SECRET);
  }

  // 2. Registered webhooks
  if (!pool) return;

  try {
    const eventMapping = {
      created: "stream_created",
      withdraw: "withdrawn",
      paused: "paused",
      cancelled: "cancelled",
    };
    const mappedEvent = eventMapping[eventType];
    if (!mappedEvent) return;

    const { rows } = await pool.query(
      "SELECT url, secret FROM webhooks WHERE address = ANY($1) AND $2 = ANY(events)",
      [addresses, mappedEvent]
    );

    for (const row of rows) {
      dispatchWebhook(row.url, payload, row.secret);
    }
  } catch (err) {
    console.error("[Webhook] DB fetch failed:", err.message);
  }
}

/** Send an email if SMTP is configured. */
async function sendEmail({ to, subject, text }) {
  if (!mailer || !to) return;
  try {
    await mailer.sendMail({ from: EMAIL_FROM, to, subject, text });
  } catch (err) {
    console.error("Email delivery failed:", err.message);
  }
}

/** Derive notification recipients and message from a parsed event. */
function buildNotification(event) {
  const { type, streamId, data } = event;
  const base = { streamId, type };

  switch (type) {
    case "created": {
      const [employer, employee, rate] = data;
      return {
        ...base,
        employer,
        employee,
        subject: `PayStream: New stream #${streamId} created`,
        text: `Stream #${streamId} created.\nEmployer: ${employer}\nEmployee: ${employee}\nRate: ${rate} tokens/s`,
        notifyAddresses: [employer, employee],
      };
    }
    case "withdraw": {
      const [employee, amount] = data;
      return {
        ...base,
        employee,
        amount,
        subject: `PayStream: Withdrawal from stream #${streamId}`,
        text: `Employee ${employee} withdrew ${amount} tokens from stream #${streamId}.`,
        notifyAddresses: [employee],
      };
    }
    case "paused": {
      const [employer, employee, paused_at] = data;
      return {
        ...base,
        employer,
        employee,
        paused_at,
        subject: `PayStream: Stream #${streamId} paused`,
        text: `Stream #${streamId} was paused by ${employer} at ${paused_at}.`,
        notifyAddresses: [employer, employee],
      };
    }
    case "cancelled": {
      const [employer, employee, refund, employee_payout] = data;
      return {
        ...base,
        employer,
        employee,
        refund,
        employee_payout,
        subject: `PayStream: Stream #${streamId} cancelled`,
        text: `Stream #${streamId} was cancelled by ${employer}. Refund: ${refund}, Employee Payout: ${employee_payout}.`,
        notifyAddresses: [employer, employee],
      };
    }
    case "status": {
      const status = data;
      return {
        ...base,
        status,
        subject: `PayStream: Stream #${streamId} status → ${status}`,
        text: `Stream #${streamId} status changed to ${status}.`,
        notifyAddresses: [],
      };
    }
    default:
      return { ...base, notifyAddresses: [] };
  }
}

/** Parse a raw Horizon contract event record into a structured object. */
function parseEvent(record) {
  try {
    const topics = record.topic ?? [];
    const type = topics[0]?.value ?? topics[0];
    const streamId = topics[1]?.value ?? topics[1] ?? null;
    const data = record.value?.value ?? record.value ?? null;
    return { type: String(type), streamId, data };
  } catch {
    return null;
  }
}

let cursor = "now";

async function poll() {
  try {
    const result = await server
      .contractEvents()
      .forContract(CONTRACT_ID)
      .cursor(cursor)
      .limit(50)
      .call();

    for (const record of result.records ?? []) {
      cursor = record.paging_token;
      const event = parseEvent(record);
      if (!event || !watchSet.has(event.type)) continue;

      console.log(`[${new Date().toISOString()}] Event: ${event.type} stream=${event.streamId}`);

      const notification = buildNotification(event);
      const payload = { ...notification, timestamp: new Date().toISOString() };

      await notifyWebhooks(event.type, payload, notification.notifyAddresses || []);
      await sendEmail({
        to: notification.notifyAddresses?.join(","),
        subject: notification.subject,
        text: notification.text,
      });
    }
  } catch (err) {
    console.error("Poll error:", err.message);
  }
}

console.log(`PayStream notification service started`);
console.log(`  Contract : ${CONTRACT_ID}`);
console.log(`  Horizon  : ${HORIZON_URL}`);
console.log(`  Watching : ${[...watchSet].join(", ")}`);
console.log(`  Webhook  : ${WEBHOOK_URL || "(disabled)"}`);
console.log(`  Email    : ${mailer ? EMAIL_FROM : "(disabled)"}`);

// Initial poll then recurring interval
poll();
setInterval(poll, Number(POLL_INTERVAL_MS));
