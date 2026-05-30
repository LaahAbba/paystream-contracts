// SPDX-License-Identifier: Apache-2.0
/**
 * Issue #230 – Batch stream creation UI.
 *
 * Allows employers to create multiple streams in a single on-chain transaction
 * using the create_streams_batch contract function.
 */
import React, { useId, useState, useCallback } from "react";
import {
  PayStreamClient,
  connectFreighter,
  freighterSignTransaction,
  isFreighterConnected,
  type StreamParams,
} from "@paystream/sdk";
import { CONFIG, explorerTxUrl } from "./config";

const client = new PayStreamClient(CONFIG);
const STROOP = 10_000_000;

// ─── Row types ────────────────────────────────────────────────────────────────

interface RowData {
  id: string;
  employee: string;
  deposit: string;
  rate: string;
  stopTime: string;
}

interface RowErrors {
  employee?: string;
  deposit?: string;
  rate?: string;
  stopTime?: string;
}

function emptyRow(): RowData {
  return {
    id: crypto.randomUUID(),
    employee: "",
    deposit: "10",
    rate: "1",
    stopTime: "0",
  };
}

function validateRow(row: RowData): RowErrors {
  const errors: RowErrors = {};
  if (!row.employee.trim()) errors.employee = "Required";
  const dep = parseFloat(row.deposit);
  if (isNaN(dep) || dep <= 0) errors.deposit = "Must be > 0";
  const r = parseFloat(row.rate);
  if (isNaN(r) || r <= 0) errors.rate = "Must be > 0";
  if (row.stopTime !== "0" && row.stopTime !== "") {
    const st = parseInt(row.stopTime, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(st) || st <= nowSec) errors.stopTime = "Must be future or 0";
  }
  return errors;
}

// ─── RowInput helper ──────────────────────────────────────────────────────────

function RowInput({
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        className={`input${error ? " input-error" : ""}`}
        style={{ minWidth: 0 }}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
      />
      {error && (
        <span role="alert" className="field-error" style={{ fontSize: 11 }}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── BatchCreateStreams ───────────────────────────────────────────────────────

interface BatchCreateStreamsProps {
  walletPublicKey?: string | null;
}

export function BatchCreateStreams({ walletPublicKey }: BatchCreateStreamsProps) {
  const [publicKey, setPublicKey] = useState<string | null>(walletPublicKey ?? null);
  const [rows, setRows] = useState<RowData[]>([emptyRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);
  const token = CONFIG.defaultToken;

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ok = await isFreighterConnected();
      if (!ok) {
        setError("Freighter is not installed. Get it at https://freighter.app");
        return;
      }
      const pk = await connectFreighter();
      setPublicKey(pk);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateRow = (id: string, field: keyof Omit<RowData, "id">, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    if (submitted) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        const updated = { ...row, [field]: value };
        setRowErrors((prev) => ({ ...prev, [id]: validateRow(updated) }));
      }
    }
  };

  const totalDeposit = rows.reduce((sum, r) => {
    const dep = parseFloat(r.deposit);
    return sum + (isNaN(dep) ? 0 : dep);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setSuccessTxHash(null);

    // Validate all rows
    const errors: Record<string, RowErrors> = {};
    let hasErrors = false;
    for (const row of rows) {
      const errs = validateRow(row);
      errors[row.id] = errs;
      if (Object.keys(errs).length > 0) hasErrors = true;
    }
    setRowErrors(errors);
    if (hasErrors || !publicKey) return;

    setLoading(true);
    setError(null);
    try {
      const params: StreamParams[] = rows.map((r) => ({
        employee: r.employee.trim(),
        token,
        deposit: BigInt(Math.round(parseFloat(r.deposit) * STROOP)),
        ratePerSecond: BigInt(Math.round(parseFloat(r.rate))),
        stopTime: BigInt(r.stopTime || "0"),
      }));

      const xdrStr = await client.createStreamsBatch(publicKey, params);
      const signed = await freighterSignTransaction(xdrStr, CONFIG.networkPassphrase);
      const txHash = await client.submitTransaction(signed);
      setSuccessTxHash(txHash);
      setRows([emptyRow()]);
      setSubmitted(false);
      setRowErrors({});
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <section className="card" aria-labelledby="batch-connect-heading">
        <h2 id="batch-connect-heading">Batch Create Streams</h2>
        <p className="muted">Connect your Freighter wallet to create multiple streams at once.</p>
        <button onClick={connect} disabled={loading} className="btn" aria-busy={loading}>
          {loading ? "Connecting…" : "Connect Freighter"}
        </button>
        {error && <div role="alert" className="error-banner" style={{ marginTop: 12 }}>⚠️ {error}</div>}
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="batch-heading">
      <h2 id="batch-heading">Batch Create Streams</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Create multiple streams in a single transaction. Token: <code>{token.slice(0, 6)}…{token.slice(-4)}</code>
      </p>

      {error && <div role="alert" className="error-banner">⚠️ {error}</div>}

      {successTxHash && (
        <div className="success-banner" role="status" aria-live="polite">
          ✅ Batch created!{" "}
          <a
            href={explorerTxUrl(successTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="explorer-link"
          >
            View transaction ↗
          </a>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate aria-label="Batch create streams">
        {/* Column headers */}
        <div className="batch-header-row" aria-hidden="true">
          <span style={{ flex: 3 }}>Employee address</span>
          <span style={{ flex: 1.5 }}>Deposit (XLM)</span>
          <span style={{ flex: 1.5 }}>Rate (stroops/s)</span>
          <span style={{ flex: 1.5 }}>Stop time</span>
          <span style={{ width: 32 }} />
        </div>

        <div role="list" aria-label="Stream rows">
          {rows.map((row, idx) => {
            const errs = rowErrors[row.id] ?? {};
            const rowNum = idx + 1;
            return (
              <div
                key={row.id}
                role="listitem"
                className="batch-row"
                aria-label={`Stream row ${rowNum}`}
              >
                <RowInput
                  value={row.employee}
                  onChange={(v) => updateRow(row.id, "employee", v)}
                  placeholder="G… employee address"
                  error={errs.employee}
                  disabled={loading}
                  ariaLabel={`Row ${rowNum} employee address`}
                />
                <RowInput
                  value={row.deposit}
                  onChange={(v) => updateRow(row.id, "deposit", v)}
                  placeholder="10"
                  type="number"
                  error={errs.deposit}
                  disabled={loading}
                  ariaLabel={`Row ${rowNum} deposit in XLM`}
                />
                <RowInput
                  value={row.rate}
                  onChange={(v) => updateRow(row.id, "rate", v)}
                  placeholder="1"
                  type="number"
                  error={errs.rate}
                  disabled={loading}
                  ariaLabel={`Row ${rowNum} rate in stroops per second`}
                />
                <RowInput
                  value={row.stopTime}
                  onChange={(v) => updateRow(row.id, "stopTime", v)}
                  placeholder="0"
                  type="number"
                  error={errs.stopTime}
                  disabled={loading}
                  ariaLabel={`Row ${rowNum} stop time unix timestamp`}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1 || loading}
                  aria-label={`Remove stream row ${rowNum}`}
                  style={{ alignSelf: "flex-start", marginTop: 1 }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div className="batch-footer">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={addRow}
            disabled={loading}
            aria-label="Add another stream row"
          >
            + Add row
          </button>

          <div className="batch-total" aria-live="polite">
            Total deposit required:{" "}
            <strong>{totalDeposit.toFixed(4)} XLM</strong>
            {" "}across {rows.length} stream{rows.length !== 1 ? "s" : ""}
          </div>
        </div>

        <button
          type="submit"
          className="btn"
          disabled={loading}
          aria-busy={loading}
          style={{ marginTop: 16 }}
        >
          {loading ? "Submitting…" : `Create ${rows.length} Stream${rows.length !== 1 ? "s" : ""}`}
        </button>
      </form>
    </section>
  );
}
