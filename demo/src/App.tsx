// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useId } from "react";
import { usePayStream } from "./usePayStream";
import { useTransactionHistory } from "./useTransactionHistory";
import { CONFIG } from "./config";
import { useFiatPrices, AVAILABLE_FIAT_CURRENCIES, getTokenPricingMetadata } from "./useFiatPrice";
import { useStreamTemplates, DEFAULT_TEMPLATES, StreamTemplate } from "./useStreamTemplates";
import { exportAllHistory } from "./csvExport";
import { EmployerDashboard } from "./EmployerDashboard";
import { EmployeeDashboard } from "./EmployeeDashboard";
import { StreamStatusCard } from "./StreamStatusCard";
import { BatchCreateStreams } from "./BatchCreateStreams";
import { ErrorBoundary } from "./ErrorBoundary";

const STROOP = 10_000_000n; // 1 XLM in stroops

// ─── Dark mode ───────────────────────────────────────────────────────────────

function useDarkMode(): [boolean, () => void] {
  // Issue #240: Initialize to false (safe SSR default) and read localStorage
  // only after mount to avoid hydration mismatches.
  const [dark, setDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Runs client-side only — safe to access window/localStorage here.
    const stored = localStorage.getItem("paystream-dark");
    const prefersDark =
      stored !== null
        ? stored === "true"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefersDark);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("paystream-dark", String(dark));
  }, [dark, mounted]);

  // Respond to OS-level changes when no manual override has been set
  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("paystream-dark") === null) setDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mounted]);

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

type AppView = "demo" | "dashboard" | "employee" | "batch";

export default function App() {
  const [dark, toggleDark] = useDarkMode();
  const [view, setView] = useState<AppView>("demo");
  const { publicKey, streams, claimableAmounts, error, loading, connect, loadStream, createStream, withdraw } =
    usePayStream();
  const history = useTransactionHistory();

  // Wallet modal state
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Create stream form state
  const [employee, setEmployee] = useState("");
  const [token, setToken] = useState(CONFIG.defaultToken);
  const [deposit, setDeposit] = useState("10");
  const [rate, setRate] = useState("1");
  const [stopTime, setStopTime] = useState("0");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const {
    fiatCurrency,
    setFiatCurrency,
    getPriceForToken,
    loading: priceLoading,
    error: priceError,
    lastUpdated,
  } = useFiatPrices();

  // Load stream form state
  const [lookupId, setLookupId] = useState("");

  // Transaction history panel
  const [historyStreamId, setHistoryStreamId] = useState<bigint | null>(null);
  // CSV date-range filter (#233)
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");

  // Stream templates (#117)
  const { templates, save: saveTemplate, remove: removeTemplate } = useStreamTemplates();
  const [templateName, setTemplateName] = useState("");

  const handleWalletConnect = async (walletType: "freighter") => {
    if (walletType === "freighter") {
      await connect();
    }
  };

  const applyTemplate = (tpl: StreamTemplate) => {
    setEmployee("");
    setToken(tpl.token);
    setDeposit(tpl.deposit);
    setRate(tpl.rate);
    setStopTime(tpl.stopTime);
    setSubmitted(false);
    setFormErrors({});
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    saveTemplate({ name: templateName.trim(), token, deposit, rate, stopTime });
    setTemplateName("");
  };

  const duration = estimatedDuration(deposit, rate);

  const VIEWS: AppView[] = ["demo", "dashboard", "employee"];

  const handleTabKeyDown = (e: React.KeyboardEvent, current: AppView) => {
    const idx = VIEWS.indexOf(current);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setView(VIEWS[(idx + 1) % VIEWS.length]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setView(VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setView(VIEWS[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setView(VIEWS[VIEWS.length - 1]);
    }
  };

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

  const handleExportCsv = async (streamId: bigint) => {
    const stream = streams.find((s) => s.id === streamId);
    const range =
      csvFrom || csvTo
        ? { from: csvFrom ? new Date(csvFrom) : undefined, to: csvTo ? new Date(csvTo) : undefined }
        : undefined;
    await exportAllHistory(
      streamId,
      async (cursor) => {
        // Re-use the Horizon fetch logic from useTransactionHistory by calling
        // the hook's fetchHistory and reading the internal cursor. Since the hook
        // manages its own state we replicate the fetch inline here for a clean
        // one-shot export without mutating the panel's displayed records.
        const PAGE_SIZE = 200; // larger page for export efficiency
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), order: "desc" });
        if (cursor) params.set("cursor", cursor);
        const HORIZON_BASE = "https://horizon-testnet.stellar.org";
        const res = await fetch(`${HORIZON_BASE}/accounts/${streamId}/operations?${params}`);
        if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
        const data = await res.json() as {
          _embedded: { records: Array<Record<string, unknown>> };
        };
        const ops = data._embedded.records;
        const records = ops.map((op) => ({
          id: String(op.id),
          timestamp: String(op.created_at ?? ""),
          type: String(op.type ?? "").replace(/_/g, " "),
          amount: typeof op.amount === "string" ? `${op.amount} XLM` : null,
        }));
        const lastToken = ops.length > 0 ? String(ops[ops.length - 1].paging_token ?? "") : null;
        return { records, nextCursor: ops.length === PAGE_SIZE ? lastToken : null };
      },
      range,
      stream?.employee ?? "",
      stream?.token ?? ""
    );
  };

  const getTokenLabel = (token: string) => {
    const meta = getTokenPricingMetadata(token);
    if (meta) return meta.symbol;
    return token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token;
  };

  // Re-validate on change after first submit attempt
  useEffect(() => {
    if (submitted) setFormErrors(validateForm(employee, token, deposit, rate, stopTime));
  }, [employee, token, deposit, rate, stopTime, submitted]);

  return (
    <div className="app-root" id="main-content">
      {/* ── Header ── */}
      <header className="app-header" role="banner">
        <h1>💸 PayStream Demo</h1>
        <div className="header-right">
          <p className="subtitle">Testnet — real-time salary streaming on Stellar</p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <WalletButton
              publicKey={publicKey}
              loading={loading}
              onClick={() => setWalletModalOpen(true)}
            />
            <button
              onClick={toggleDark}
              className="toggle-btn"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={dark}
            >
              {dark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Wallet Modal ── */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        onConnect={handleWalletConnect}
        loading={loading}
        error={error}
      />

      {/* ── View tabs ── */}
      <nav className="view-tabs" role="tablist" aria-label="Application views">
        <button
          role="tab"
          id="tab-demo"
          aria-selected={view === "demo"}
          aria-controls="panel-demo"
          className={`tab-btn${view === "demo" ? " tab-active" : ""}`}
          onClick={() => setView("demo")}
          onKeyDown={(e) => handleTabKeyDown(e, "demo")}
        >
          🖥 Stream Demo
        </button>
        <button
          role="tab"
          id="tab-dashboard"
          aria-selected={view === "dashboard"}
          aria-controls="panel-dashboard"
          className={`tab-btn${view === "dashboard" ? " tab-active" : ""}`}
          onClick={() => setView("dashboard")}
          onKeyDown={(e) => handleTabKeyDown(e, "dashboard")}
        >
          💼 Employer Dashboard
        </button>
        <button
          role="tab"
          id="tab-employee"
          aria-selected={view === "employee"}
          aria-controls="panel-employee"
          className={`tab-btn${view === "employee" ? " tab-active" : ""}`}
          onClick={() => setView("employee")}
          onKeyDown={(e) => handleTabKeyDown(e, "employee")}
        >
          💳 Employee Earnings
        </button>
        <button
          role="tab"
          id="tab-batch"
          aria-selected={view === "batch"}
          aria-controls="panel-batch"
          className={`tab-btn${view === "batch" ? " tab-active" : ""}`}
          onClick={() => setView("batch")}
        >
          📋 Batch Create
        </button>
      </nav>

      {/* ── Batch Create panel ── */}
      <div
        role="tabpanel"
        id="panel-batch"
        aria-labelledby="tab-batch"
        hidden={view !== "batch"}
      >
        <ErrorBoundary label="Batch Create">
          <BatchCreateStreams walletPublicKey={publicKey} />
        </ErrorBoundary>
      </div>

      {/* ── Employer Dashboard panel ── */}
      <div
        role="tabpanel"
        id="panel-dashboard"
        aria-labelledby="tab-dashboard"
        hidden={view !== "dashboard"}
      >
        <ErrorBoundary label="Employer Dashboard">
          <EmployerDashboard walletPublicKey={publicKey} />
        </ErrorBoundary>
      </div>

      {/* ── Employee Earnings panel ── */}
      <div
        role="tabpanel"
        id="panel-employee"
        aria-labelledby="tab-employee"
        hidden={view !== "employee"}
      >
        <ErrorBoundary label="Employee Earnings">
          <EmployeeDashboard walletPublicKey={publicKey} />
        </ErrorBoundary>
      </div>

      {/* ── Demo panel ── */}
      <main
        id="panel-demo"
        role="tabpanel"
        aria-labelledby="tab-demo"
        hidden={view !== "demo"}
      >
        <ErrorBoundary label="Stream Demo">
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

        {/* ── Fiat settings ── */}
        <section className="card" aria-labelledby="fiat-settings-heading">
          <h2 id="fiat-settings-heading">Fiat Currency</h2>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="fiat-currency" className="field-label">
              Preferred currency
            </label>
            <select
              id="fiat-currency"
              className="input"
              value={fiatCurrency}
              onChange={(e) => setFiatCurrency(e.target.value as any)}
            >
              {AVAILABLE_FIAT_CURRENCIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-hint">
              Saved in browser settings. Prices refresh every 60 seconds.
            </p>
            {priceError && (
              <p role="alert" className="field-error">
                Unable to update prices: {priceError}
              </p>
            )}
            {!priceError && (
              <p className="field-hint">
                Last updated {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "…"}.
                {priceLoading ? " Updating…" : ""}
              </p>
            )}
          </div>
        </section>

        {/* ── Error banner ── */}
        {error && (
          <div role="alert" aria-live="assertive" className="error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* ── Stream Templates (#117) ── */}
        <section className="card" aria-labelledby="templates-heading">
          <h2 id="templates-heading">Stream Templates</h2>
          {templates.length === 0 && (
            <p className="muted">No saved templates. Fill the form below and save it as a template for quick reuse.</p>
          )}
          {templates.length > 0 && (
            <ul className="stream-list" role="list">
              {templates.map((tpl) => (
                <li key={tpl.id} className="stream-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span><strong>{tpl.name}</strong> — {tpl.deposit} deposit · {tpl.rate} stroops/s</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => applyTemplate(tpl)} aria-label={`Apply template ${tpl.name}`}>
                      Apply
                    </button>
                    <button className="btn btn-secondary" onClick={() => removeTemplate(tpl.id)} aria-label={`Delete template ${tpl.name}`}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Save current form as template</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <label htmlFor="template-name" className="sr-only">Template name</label>
              <input
                id="template-name"
                className="input"
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                aria-label="Template name"
              />
              <button className="btn" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                Save
              </button>
            </div>
          </details>
        </section>

        {/* ── Create Stream ── */}
        <section className="card" aria-labelledby="create-heading">
          <h2 id="create-heading">Create Stream</h2>
          <StreamCreationForm
            defaultToken={CONFIG.defaultToken}
            onSubmit={createStream}
            loading={loading}
            walletConnected={!!publicKey}
          />
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
                  <li key={key} className="stream-item">
                    <StreamStatusCard
                      stream={s}
                      claimable={claimable}
                      tokenSymbol={getTokenLabel(s.token)}
                      fiatCurrency={fiatCurrency}
                      tokenPrice={getPriceForToken(s.token) ?? null}
                      onWithdraw={
                        s.status === "Active" && publicKey === s.employee
                          ? () => withdraw(s.id)
                          : undefined
                      }
                      onShowHistory={() => handleShowHistory(s.id)}
                      onExportCsv={() => handleExportCsv(s.id)}
                      loading={loading}
                    >
                      {/* Inline history panel */}
                      {historyStreamId === s.id && (
                        <div
                          id={`history-${key}`}
                          className="history-panel"
                          role="region"
                          aria-label={`Transaction history for stream ${key}`}
                        >
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
                          {history.records.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div className="csv-range-row">
                                <label>
                                  From
                                  <input
                                    type="date"
                                    value={csvFrom}
                                    onChange={(e) => setCsvFrom(e.target.value)}
                                    max={csvTo || undefined}
                                    aria-label="Export date range start"
                                  />
                                </label>
                                <label>
                                  To
                                  <input
                                    type="date"
                                    value={csvTo}
                                    onChange={(e) => setCsvTo(e.target.value)}
                                    min={csvFrom || undefined}
                                    aria-label="Export date range end"
                                  />
                                </label>
                              </div>
                              <button
                                onClick={() => handleExportCsv(s.id)}
                                className="btn btn-secondary"
                                aria-label={`Export all history for stream ${key} as CSV`}
                              >
                                ⬇ Export as CSV
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </StreamStatusCard>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        </ErrorBoundary>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(4);
}
