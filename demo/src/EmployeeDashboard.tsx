// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { useEmployeeDashboard } from "./useEmployeeDashboard";
import { StreamStatusCard } from "./StreamStatusCard";
import { useTransactionHistory } from "./useTransactionHistory";
import { exportAllHistory } from "./csvExport";

// ─── Utilities ────────────────────────────────────────────────────────────────

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  id: string;
  label: string;
  value: string | number;
  icon: string;
  accentVar: string;
}

function StatCard({ id, label, value, icon, accentVar }: StatCardProps) {
  return (
    <div
      className="db-stat-card"
      style={{ "--db-accent": `var(${accentVar})` } as React.CSSProperties}
      role="listitem"
      aria-labelledby={id}
    >
      <span className="db-stat-icon" aria-hidden="true">{icon}</span>
      <span className="db-stat-value" id={id}>{value}</span>
      <span className="db-stat-label">{label}</span>
    </div>
  );
}

// ─── EmployeeDashboard ────────────────────────────────────────────────────────

interface EmployeeDashboardProps {
  /** Optional public key from an already-connected wallet in the parent. */
  walletPublicKey?: string | null;
}

export function EmployeeDashboard({ walletPublicKey }: EmployeeDashboardProps) {
  const {
    publicKey,
    streams,
    claimableAmounts,
    stats,
    loading,
    actionLoading,
    error,
    scanned,
    chainTotal,
    connect,
    refresh,
    withdraw,
  } = useEmployeeDashboard(walletPublicKey);

  const history = useTransactionHistory();
  const [historyStreamId, setHistoryStreamId] = React.useState<bigint | null>(null);

  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const filtered =
    statusFilter === "all"
      ? streams
      : streams.filter((s) => s.status.toLowerCase() === statusFilter);

  const scanMax = Math.min(chainTotal, 200);
  const scanPct = scanMax > 0 ? Math.min(100, Math.round((scanned / scanMax) * 100)) : 0;

  const FILTER_OPTIONS = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "cancelled", label: "Cancelled" },
    { value: "exhausted", label: "Exhausted" },
  ];

  const handleShowHistory = (streamId: bigint) => {
    if (historyStreamId === streamId) {
      setHistoryStreamId(null);
    } else {
      setHistoryStreamId(streamId);
      history.reset();
      history.fetchHistory(streamId);
    }
  };

  const handleExportCsv = async (streamId: bigint) => {
    await exportAllHistory(streamId, async (cursor) => {
      const PAGE_SIZE = 200;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), order: "desc" });
      if (cursor) params.set("cursor", cursor);
      const HORIZON_BASE = "https://horizon-testnet.stellar.org";
      const res = await fetch(`${HORIZON_BASE}/accounts/${streamId}/operations?${params}`);
      if (!res.ok) throw new Error(`Horizon error: ${res.status}`);
      const data = await res.json() as { _embedded: { records: Array<Record<string, unknown>> } };
      const ops = data._embedded.records;
      const records = ops.map((op) => ({
        id: String(op.id),
        timestamp: String(op.created_at ?? ""),
        type: String(op.type ?? "").replace(/_/g, " "),
        amount: typeof op.amount === "string" ? `${op.amount} XLM` : null,
      }));
      const lastToken = ops.length > 0 ? String(ops[ops.length - 1].paging_token ?? "") : null;
      return { records, nextCursor: ops.length === PAGE_SIZE ? lastToken : null };
    });
  };

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <section
        className="db-connect-screen card"
        aria-labelledby="emp-connect-heading"
      >
        <div className="db-connect-inner">
          <div className="db-connect-icon" aria-hidden="true">💳</div>
          <h2 id="emp-connect-heading">Employee Earnings</h2>
          <p className="db-connect-desc">
            Connect your Freighter wallet to view streams paying you, and withdraw your real-time earnings with one click.
          </p>
          <button
            onClick={connect}
            disabled={loading}
            className="btn btn-lg"
            aria-busy={loading}
            id="emp-connect-btn"
          >
            {loading ? "Connecting…" : "Connect Freighter"}
          </button>
          {error && (
            <div role="alert" className="error-banner" style={{ marginTop: 16 }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <div className="employer-dashboard" id="employee-dashboard">
      {/* ── Dashboard top bar ── */}
      <div className="db-topbar">
        <div>
          <h2 className="db-title">Employee Earnings</h2>
          <p className="db-subtitle">
            <code title={publicKey}>{truncateAddr(publicKey)}</code>
            {" · "}
            {streams.length} stream{streams.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="btn btn-secondary"
          aria-busy={loading}
          aria-label="Refresh earnings data"
          id="emp-refresh-btn"
        >
          {loading ? "Scanning…" : "↻ Refresh"}
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div role="alert" aria-live="assertive" className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* ── Scan progress ── */}
      {loading && chainTotal > 0 && (
        <div
          className="db-scan-progress"
          role="status"
          aria-label={`Scanning streams: ${scanned} of ${scanMax}`}
          aria-live="polite"
        >
          <div className="db-scan-track">
            <div className="db-scan-fill" style={{ width: `${scanPct}%` }} />
          </div>
          <span className="db-scan-label">
            Scanning on-chain streams… {scanned}/{scanMax}
          </span>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="db-stat-grid" role="list" aria-label="Earnings statistics">
        <StatCard id="emp-stat-total"   label="Total Streams" value={stats.total}                          icon="📊" accentVar="--stat-blue"   />
        <StatCard id="emp-stat-active"  label="Active"         value={stats.active}                         icon="✅" accentVar="--stat-green"  />
        <StatCard id="emp-stat-withdrawn" label="Total Withdrawn" value={`${stats.totalWithdrawnXlm.toFixed(2)} XLM`} icon="🏦" accentVar="--stat-purple" />
        <StatCard id="emp-stat-claimable" label="Ready to Claim" value={`${stats.totalClaimableXlm.toFixed(4)} XLM`} icon="💸" accentVar="--stat-amber"  />
      </div>

      {/* ── Filter bar ── */}
      {streams.length > 0 && (
        <div
          className="db-filter-bar"
          role="group"
          aria-label="Filter streams by status"
        >
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt.value === "all"
                ? streams.length
                : streams.filter((s) => s.status.toLowerCase() === opt.value).length;
            return (
              <button
                key={opt.value}
                className={`db-filter-btn${statusFilter === opt.value ? " db-filter-active" : ""}`}
                onClick={() => setStatusFilter(opt.value)}
                aria-pressed={statusFilter === opt.value}
                id={`emp-filter-${opt.value}`}
              >
                {opt.label}
                <span className="db-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && streams.length === 0 && (
        <div className="db-empty card" role="status">
          <span className="db-empty-icon" aria-hidden="true">📭</span>
          <p>No incoming streams found.</p>
          <p className="muted">
            You don't have any streams paying to this address.
          </p>
        </div>
      )}

      {/* ── Stream cards ── */}
      {filtered.length > 0 && (
        <div
          className="db-stream-list"
          role="list"
          aria-label="Your incoming streams"
          aria-live="polite"
          aria-busy={loading}
        >
          {filtered.map((s) => {
            const k = s.id.toString();
            const claimable = claimableAmounts[k] ?? 0n;
            const withdrawLoading = actionLoading === `withdraw-${k}` ? "withdraw" : null;
            return (
              <StreamStatusCard
                key={k}
                stream={s}
                claimable={claimable}
                actionLoading={withdrawLoading}
                onWithdraw={s.status === "Active" ? () => withdraw(s.id) : undefined}
                onShowHistory={() => handleShowHistory(s.id)}
                onExportCsv={() => handleExportCsv(s.id)}
                loading={loading}
              >
                {/* Inline history panel */}
                {historyStreamId === s.id && (
                  <div
                    id={`emp-history-${k}`}
                    className="history-panel"
                    role="region"
                    aria-label={`Transaction history for stream ${k}`}
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
                      <button
                        onClick={() => handleExportCsv(s.id)}
                        className="btn btn-secondary"
                        style={{ marginTop: 8 }}
                        aria-label={`Export all history for stream ${k} as CSV`}
                      >
                        Export all as CSV
                      </button>
                    )}
                  </div>
                )}
              </StreamStatusCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
