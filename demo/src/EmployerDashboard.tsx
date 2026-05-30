// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { useEmployerDashboard } from "./useEmployerDashboard";
import { StreamStatusCard } from "./StreamStatusCard";
import { CancelConfirmModal } from "./CancelConfirmModal";
import { StreamCardSkeleton } from "./StreamCardSkeleton";
import type { Stream } from "@paystream/sdk";
import type { FiatCurrency, TokenPricingMetadata } from "./useFiatPrice";

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

// StreamCard removed — replaced by shared <StreamStatusCard />

// ─── EmployerDashboard ────────────────────────────────────────────────────────

interface EmployerDashboardProps {
  /** Optional public key from an already-connected wallet in the parent. */
  walletPublicKey?: string | null;
  fiatCurrency?: FiatCurrency;
  getTokenPrice?: (token: string) => number | undefined;
  getTokenLabel?: (token: string) => string;
}

export function EmployerDashboard({
  walletPublicKey,
  fiatCurrency,
  getTokenPrice,
  getTokenLabel,
}: EmployerDashboardProps) {
  const {
    publicKey,
    streams,
    stats,
    loading,
    actionLoading,
    error,
    scanned,
    chainTotal,
    lastTxHashes,
    connect,
    refresh,
    handleAction,
    handleTopUp,
  } = useEmployerDashboard(walletPublicKey);

  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [topUpStreamId, setTopUpStreamId] = React.useState<bigint | null>(null);
  const [topUpAmount, setTopUpAmount] = React.useState<string>("");
  const [cancelStream, setCancelStream] = React.useState<Stream | null>(null);

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

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <section
        className="db-connect-screen card"
        aria-labelledby="db-connect-heading"
      >
        <div className="db-connect-inner">
          <div className="db-connect-icon" aria-hidden="true">💼</div>
          <h2 id="db-connect-heading">Employer Dashboard</h2>
          <p className="db-connect-desc">
            Connect your Freighter wallet to view and manage all streams you've
            created — pause, resume, or cancel in one place.
          </p>
          <button
            onClick={connect}
            disabled={loading}
            className="btn btn-lg"
            aria-busy={loading}
            id="db-connect-btn"
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
    <div className="employer-dashboard" id="employer-dashboard">
      {/* ── Dashboard top bar ── */}
      <div className="db-topbar">
        <div>
          <h2 className="db-title">Employer Dashboard</h2>
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
          aria-label="Refresh dashboard data"
          id="db-refresh-btn"
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
      <div className="db-stat-grid" role="list" aria-label="Stream statistics">
        <StatCard id="stat-total"   label="Total Streams" value={stats.total}                          icon="📊" accentVar="--stat-blue"   />
        <StatCard id="stat-active"  label="Active"         value={stats.active}                         icon="✅" accentVar="--stat-green"  />
        <StatCard id="stat-paused"  label="Paused"         value={stats.paused}                         icon="⏸" accentVar="--stat-amber"  />
        <StatCard id="stat-locked"  label="Total Locked"   value={`${stats.totalLockedXlm.toFixed(2)} XLM`} icon="🔒" accentVar="--stat-purple" />
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
                id={`filter-${opt.value}`}
              >
                {opt.label}
                <span className="db-filter-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Loading skeletons (initial load and refetch) ── */}
      {loading && streams.length === 0 && (
        <div className="db-stream-list" aria-busy="true" aria-label="Loading streams">
          <StreamCardSkeleton />
          <StreamCardSkeleton />
          <StreamCardSkeleton />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && streams.length === 0 && (
        <div className="db-empty card" role="status">
          <span className="db-empty-icon" aria-hidden="true">📭</span>
          <p>No streams found for your address.</p>
          <p className="muted">
            Create your first stream using the <strong>Stream Demo</strong> tab.
          </p>
        </div>
      )}

      {/* ── Stream cards ── */}
      {filtered.length > 0 && (
        <div
          className="db-stream-list"
          role="list"
          aria-label="Your employer streams"
          aria-live="polite"
          aria-busy={loading}
        >
          {filtered.map((s) => {
            const k = s.id.toString();
            // Map the "action-streamId" string to a simple action name
            const streamActionLoading =
              actionLoading === `pause-${k}`   ? "pause"
              : actionLoading === `resume-${k}`  ? "resume"
              : actionLoading === `cancel-${k}`  ? "cancel"
              : actionLoading === `topup-${k}`   ? "topup"
              : null;
              
            const isToppingUp = topUpStreamId === s.id;
            
            const handleTopUpSubmit = async (e: React.FormEvent) => {
              e.preventDefault();
              try {
                const amountStroops = BigInt(Math.floor(parseFloat(topUpAmount) * 10_000_000));
                if (amountStroops <= 0n) return;
                if (!window.confirm(`Top up stream #${k} with ${topUpAmount} XLM?`)) return;
                
                await handleTopUp(s.id, amountStroops);
                setTopUpStreamId(null);
                setTopUpAmount("");
              } catch (err) {
                // error is handled by the hook
              }
            };
            
            // Calculate new estimated end time if we topped up by topUpAmount
            let newEndTime = null;
            if (isToppingUp && topUpAmount && !isNaN(parseFloat(topUpAmount))) {
              const amountStroops = BigInt(Math.floor(parseFloat(topUpAmount) * 10_000_000));
              if (amountStroops > 0n && s.ratePerSecond > 0n && s.status !== "Cancelled") {
                const newDeposit = s.deposit + amountStroops;
                const remainingToWithdraw = newDeposit - s.withdrawn;
                const secondsRemaining = Number(remainingToWithdraw / s.ratePerSecond);
                const baseTime = s.status === "Active" ? BigInt(Math.floor(Date.now() / 1000)) : s.startTime; // very rough estimation for paused
                newEndTime = new Date((Number(baseTime) + secondsRemaining) * 1000).toLocaleString();
              }
            }

            return (
              <StreamStatusCard
                key={k}
                stream={s}
                lastTxHash={lastTxHashes[k] ?? null}
                actionLoading={streamActionLoading}
                onPause={() => handleAction("pause", s.id)}
                onResume={() => handleAction("resume", s.id)}
                onCancel={() => setCancelStream(s)}
                onShowTopUp={() => {
                  setTopUpStreamId(isToppingUp ? null : s.id);
                  setTopUpAmount("");
                }}
              >
                {/* Inline Top-up Form (#225) */}
                {isToppingUp && (
                  <form
                    className="history-panel"
                    onSubmit={handleTopUpSubmit}
                    aria-label={`Top up stream ${k}`}
                  >
                    <h3>Top Up Stream #{k}</h3>
                    <dl className="topup-summary">
                      <div className="topup-summary-row">
                        <dt>Current deposit</dt>
                        <dd>{(Number(s.deposit) / 10_000_000).toFixed(4)} XLM</dd>
                      </div>
                      {topUpAmount && !isNaN(parseFloat(topUpAmount)) && parseFloat(topUpAmount) > 0 && (
                        <div className="topup-summary-row topup-summary-new">
                          <dt>New total</dt>
                          <dd>
                            {((Number(s.deposit) / 10_000_000) + parseFloat(topUpAmount)).toFixed(4)} XLM
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="form-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        placeholder="Additional amount (XLM)"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        required
                        disabled={!!actionLoading}
                        aria-label="Top-up amount in XLM"
                        style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
                      />
                      <button
                        type="submit"
                        className="btn btn-success"
                        disabled={!!actionLoading || !topUpAmount || parseFloat(topUpAmount) <= 0}
                        aria-busy={streamActionLoading === "topup"}
                      >
                        {streamActionLoading === "topup" ? "Confirming…" : "Confirm Top Up"}
                      </button>
                    </div>
                    {newEndTime && (
                      <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
                        Estimated new end time: <strong>{newEndTime}</strong>
                      </p>
                    )}
                  </form>
                )}
              </StreamStatusCard>
            );
          })}
        </div>
      )}

      {/* ── Cancel confirmation modal (#236) ── */}
      {cancelStream && (
        <CancelConfirmModal
          streamId={cancelStream.id.toString()}
          earnedStroops={(cancelStream.deposit > cancelStream.withdrawn
            ? cancelStream.deposit - cancelStream.withdrawn
            : 0n) as bigint}
          refundStroops={cancelStream.withdrawn}
          onConfirm={() => {
            handleAction("cancel", cancelStream.id);
            setCancelStream(null);
          }}
          onClose={() => setCancelStream(null)}
        />
      )}
    </div>
  );
}
