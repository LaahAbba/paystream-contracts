// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useId } from "react";
import { usePayStream } from "./usePayStream";
import { useTransactionHistory } from "./useTransactionHistory";
import { CONFIG } from "./config";

const STROOP = 10_000_000n; // 1 XLM in stroops

// ─── Dark mode ───────────────────────────────────────────────────────────────

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem("paystream-dark");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("paystream-dark", String(dark));
  }, [dark]);

  // Also respond to OS-level changes when no manual override has been set
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("paystream-dark") === null) setDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return [dark, () => setDark((d) => !d)];
}

// ─── Validation helpers ───────────────────────────────────────────────────────

interface FormErrors {
  employee?: string;
  token?: string;
  deposit?: string;
  rate?: string;
  stopTime?: string;
}

function validateForm(
  employee: string,
  token: string,
  deposit: string,
  rate: string,
  stopTime: string
): FormErrors {
  const errors: FormErrors = {};
  if (!employee.trim()) errors.employee = "Employee address is required";
  if (!token.trim()) errors.token = "Token contract ID is required";

  const dep = parseFloat(deposit);
  if (isNaN(dep) || dep <= 0) errors.deposit = "Deposit must be greater than 0";

  const r = parseFloat(rate);
  if (isNaN(r) || r <= 0) errors.rate = "Rate must be greater than 0";

  const st = parseInt(stopTime, 10);
  if (stopTime !== "0" && stopTime !== "") {
    const nowSec = Math.floor(Date.now() / 1000);
    if (isNaN(st) || st <= nowSec) errors.stopTime = "Stop time must be in the future (or 0 for indefinite)";
  }

  return errors;
}

function estimatedDuration(deposit: string, rate: string): string | null {
  const dep = parseFloat(deposit);
  const r = parseFloat(rate);
  if (!dep || !r || dep <= 0 || r <= 0) return null;
  // deposit is in XLM, rate is in stroops/sec → convert deposit to stroops
  const depositStroops = dep * 10_000_000;
  const seconds = depositStroops / r;
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)}h`;
  return `~${(seconds / 86400).toFixed(1)} days`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, toggleDark] = useDarkMode();
  const { publicKey, streams, claimableAmounts, error, loading, connect, loadStream, createStream, withdraw } =
    usePayStream();
  const history = useTransactionHistory();

  // Create stream form state
  const [employee, setEmployee] = useState("");
  const [token, setToken] = useState(CONFIG.defaultToken);
  const [deposit, setDeposit] = useState("10");
  const [rate, setRate] = useState("1");
  const [stopTime, setStopTime] = useState("0");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // Load stream form state
  const [lookupId, setLookupId] = useState("");

  // Transaction history panel
  const [historyStreamId, setHistoryStreamId] = useState<bigint | null>(null);

  const duration = estimatedDuration(deposit, rate);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const errors = validateForm(employee, token, deposit, rate, stopTime);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    await createStream(
      employee,
      token,
      BigInt(Math.round(parseFloat(deposit) * Number(STROOP))),
      BigInt(Math.round(parseFloat(rate))),
      BigInt(stopTime || "0")
    );
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;
    await loadStream(BigInt(lookupId));
  };

  const handleShowHistory = (streamId: bigint) => {
    setHistoryStreamId(streamId);
    history.reset();
    history.fetchHistory(streamId);
  };

  // Re-validate on change after first submit attempt
  useEffect(() => {
    if (submitted) setFormErrors(validateForm(employee, token, deposit, rate, stopTime));
  }, [employee, token, deposit, rate, stopTime, submitted]);

  return (
    <div className="app-root">
      {/* ── Header ── */}
      <header className="app-header" role="banner">
        <h1>💸 PayStream Demo</h1>
        <div className="header-right">
          <p className="subtitle">Testnet — real-time salary streaming on Stellar</p>
          <button
            onClick={toggleDark}
            className="toggle-btn"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={dark}
          >
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <main id="main-content">
        {/* ── Wallet ── */}
        <section className="card" aria-labelledby="wallet-heading">
          <h2 id="wallet-heading">Wallet</h2>
          {publicKey ? (
            <p>
              ✅ Connected:{" "}
              <code aria-label={`Connected wallet address: ${publicKey}`} style={{ wordBreak: "break-all" }}>
                {publicKey}
              </code>
            </p>
          ) : (
            <button onClick={connect} disabled={loading} className="btn" aria-busy={loading}>
              {loading ? "Connecting…" : "Connect Freighter"}
            </button>
          )}
        </section>

        {/* ── Error banner ── */}
        {error && (
          <div role="alert" aria-live="assertive" className="error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* ── Create Stream ── */}
        <section className="card" aria-labelledby="create-heading">
          <h2 id="create-heading">Create Stream</h2>
          <form onSubmit={handleCreate} noValidate aria-label="Create a new salary stream">
            <Field
              label="Employee address"
              value={employee}
              onChange={setEmployee}
              placeholder="G..."
              error={formErrors.employee}
              required
            />
            <Field
              label="Token contract ID"
              value={token}
              onChange={setToken}
              placeholder="C..."
              error={formErrors.token}
              required
            />
            <Field
              label="Deposit (XLM)"
              value={deposit}
              onChange={setDeposit}
              type="number"
              min="0"
              step="any"
              error={formErrors.deposit}
              required
            />
            <Field
              label="Rate (stroops/sec)"
              value={rate}
              onChange={setRate}
              type="number"
              min="0"
              step="1"
              error={formErrors.rate}
              required
            />
            <Field
              label="Stop time (unix timestamp, 0 = indefinite)"
              value={stopTime}
              onChange={setStopTime}
              type="number"
              min="0"
              step="1"
              error={formErrors.stopTime}
            />
            {duration && (
              <p className="duration-hint" aria-live="polite">
                ⏱ Estimated stream duration: <strong>{duration}</strong>
              </p>
            )}
            <button type="submit" disabled={loading || !publicKey} className="btn" aria-busy={loading}>
              {loading ? "Creating…" : "Create Stream"}
            </button>
            {!publicKey && (
              <p className="field-hint">Connect your wallet to create a stream.</p>
            )}
          </form>
        </section>

        {/* ── Load Stream ── */}
        <section className="card" aria-labelledby="load-heading">
          <h2 id="load-heading">Load Stream by ID</h2>
          <form onSubmit={handleLookup} style={{ display: "flex", gap: 8 }} aria-label="Load stream by ID">
            <label htmlFor="lookup-id" className="sr-only">Stream ID</label>
            <input
              id="lookup-id"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Stream ID"
              className="input"
              aria-label="Stream ID"
              type="number"
              min="0"
            />
            <button type="submit" disabled={loading} className="btn" aria-busy={loading}>
              {loading ? "Loading…" : "Load"}
            </button>
          </form>
        </section>

        {/* ── Stream List ── */}
        {streams.length > 0 && (
          <section className="card" aria-labelledby="streams-heading">
            <h2 id="streams-heading">Streams</h2>
            <ul className="stream-list" role="list">
              {streams.map((s) => {
                const key = s.id.toString();
                const claimable = claimableAmounts[key] ?? 0n;
                return (
                  <li key={key} className="stream-item" aria-label={`Stream ${key}`}>
                    <p>
                      <strong>Stream #{key}</strong> — <StatusBadge status={s.status} />
                    </p>
                    <p>Employee: <code>{s.employee}</code></p>
                    <p>Rate: <span aria-label={`${s.ratePerSecond.toString()} stroops per second`}>{s.ratePerSecond.toString()} stroops/sec</span></p>
                    <p>
                      Deposit: {formatXlm(s.deposit)} XLM &nbsp;|&nbsp; Withdrawn: {formatXlm(s.withdrawn)} XLM
                    </p>
                    <p>
                      🔴 Claimable now:{" "}
                      <strong aria-live="polite">{formatXlm(claimable)} XLM</strong>{" "}
                      <span className="muted">(live)</span>
                    </p>
                    <div className="stream-actions">
                      {s.status === "Active" && publicKey === s.employee && (
                        <button
                          onClick={() => withdraw(s.id)}
                          disabled={loading}
                          className="btn"
                          aria-label={`Withdraw from stream ${key}`}
                          aria-busy={loading}
                        >
                          Withdraw
                        </button>
                      )}
                      <button
                        onClick={() => handleShowHistory(s.id)}
                        className="btn btn-secondary"
                        aria-label={`View transaction history for stream ${key}`}
                        aria-expanded={historyStreamId === s.id}
                        aria-controls={`history-${key}`}
                      >
                        History
                      </button>
                    </div>

                    {/* ── Transaction History ── */}
                    {historyStreamId === s.id && (
                      <div id={`history-${key}`} className="history-panel" role="region" aria-label={`Transaction history for stream ${key}`}>
                        <h3>Transaction History</h3>
                        {history.error && (
                          <p role="alert" className="error-banner">{history.error}</p>
                        )}
                        {history.records.length === 0 && !history.loading && !history.error && (
                          <p className="muted">No transactions found.</p>
                        )}
                        {history.records.length > 0 && (
                          <table className="history-table" aria-label="Transaction history">
                            <thead>
                              <tr>
                                <th scope="col">Timestamp</th>
                                <th scope="col">Type</th>
                                <th scope="col">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.records.map((r) => (
                                <tr key={r.id}>
                                  <td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}</td>
                                  <td>{r.type}</td>
                                  <td>{r.amount ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {history.loading && <p aria-live="polite" aria-busy="true">Loading…</p>}
                        {history.hasMore && !history.loading && (
                          <button
                            onClick={() => history.loadMore(s.id)}
                            className="btn btn-secondary"
                            aria-label="Load more transactions"
                          >
                            Load more
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}{required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input${error ? " input-error" : ""}`}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        min={min}
        step={step}
      />
      {error && (
        <span id={errId} role="alert" className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`} aria-label={`Status: ${status}`}>
      {status}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(4);
}
