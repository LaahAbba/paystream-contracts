// SPDX-License-Identifier: Apache-2.0
import React from "react";
import type { Stream } from "@paystream/sdk";
import { StreamStatusBadge, StreamStatus } from "./StreamStatusBadge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(4);
}

/** Human-readable rate — shows XLM/s for high rates, XLM/min for slow ones. */
function formatRate(stroopsPerSec: bigint): string {
  const xlmPerSec = Number(stroopsPerSec) / 10_000_000;
  if (xlmPerSec >= 0.01) return `${xlmPerSec.toFixed(4)} XLM/s`;
  const xlmPerMin = xlmPerSec * 60;
  if (xlmPerMin >= 0.01) return `${xlmPerMin.toFixed(4)} XLM/min`;
  return `${stroopsPerSec.toString()} stroops/s`;
}

function formatTs(ts: bigint): string {
  if (ts === 0n) return "Indefinite";
  return new Date(Number(ts) * 1000).toLocaleString();
}

function isoTs(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString();
}

// ─── Explorer URL helpers ────────────────────────────────────────────────────

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet";

function explorerAccountUrl(address: string): string {
  return `${EXPLORER_BASE}/account/${address}`;
}

function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

// ─── ExplorerLink (#239) ──────────────────────────────────────────────────────

interface ExplorerLinkProps {
  href: string;
  label: string;
  children: React.ReactNode;
}

function ExplorerLink({ href, label, children }: ExplorerLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="explorer-link"
    >
      {children}
    </a>
  );
}

// ─── MetricItem ───────────────────────────────────────────────────────────────

interface MetricItemProps {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
  live?: boolean;
}

function MetricItem({ label, value, sublabel, highlight, live }: MetricItemProps) {
  return (
    <div className={`ssc-metric${highlight ? " ssc-metric--hi" : ""}`}>
      <dt className="ssc-metric-label">
        {label}
        {live && (
          <span
            className="ssc-live-dot"
            aria-hidden="true"
            title="Live — updates every 5 s"
          />
        )}
      </dt>
      <dd
        className="ssc-metric-value"
        aria-live={live ? "polite" : undefined}
        aria-atomic={live ? "true" : undefined}
      >
        {value}
        {sublabel && <span className="ssc-metric-sub">{sublabel}</span>}
      </dd>
    </div>
  );
}

// ─── StreamStatusCard ─────────────────────────────────────────────────────────

export interface StreamStatusCardProps {
  /** The stream object returned by the SDK. */
  stream: Stream;
  /** Live claimable amount in stroops, updated by polling. */
  claimable?: bigint;

  // ── Action callbacks (all optional — omit what's not relevant) ──
  /** Employee: withdraw all claimable tokens. */
  onWithdraw?: () => void;
  /** Employer: pause an Active stream. */
  onPause?: () => void;
  /** Employer: resume a Paused stream. */
  onResume?: () => void;
  /** Employer: cancel an Active or Paused stream. */
  onCancel?: () => void;
  /** Show inline transaction history panel. */
  onShowHistory?: () => void;
  /** Export history as CSV download. */
  onExportCsv?: () => void;
  /** Employer: top up the stream with more XLM. */
  onShowTopUp?: () => void;
  /**
   * Optional last transaction hash — shown as an explorer link (#239).
   * Pass the hash returned by submitTransaction after any action.
   */
  lastTxHash?: string | null;

  // ── Loading state ──
  /** True while any transaction is in flight (disables all buttons). */
  loading?: boolean;
  /**
   * The specific action currently loading.
   * One of: "withdraw" | "pause" | "resume" | "cancel"
   */
  actionLoading?: string | null;

  /**
   * Optional content rendered below the action buttons (e.g. history panel).
   * Passed as React children.
   */
  children?: React.ReactNode;
}

/**
 * StreamStatusCard — reusable component that shows a stream's full state:
 * status badge, rate, deposit, withdrawn, claimable (live), progress bar,
 * timing info, and action buttons.
 *
 * All interactive elements carry unique IDs and ARIA attributes for
 * accessibility. The metric grid is responsive (2 → 4 columns).
 */
export function StreamStatusCard({
  stream,
  claimable = 0n,
  onWithdraw,
  onPause,
  onResume,
  onCancel,
  onShowHistory,
  onExportCsv,
  onShowTopUp,
  lastTxHash = null,
  loading = false,
  actionLoading = null,
  children,
}: StreamStatusCardProps) {
  const key = stream.id.toString();

  // Derived values
  const locked =
    stream.deposit > stream.withdrawn ? stream.deposit - stream.withdrawn : 0n;
  const progress =
    stream.deposit > 0n
      ? Math.min(100, Number((stream.withdrawn * 100n) / stream.deposit))
      : 0;

  // Per-action busy flags
  const withdrawing = actionLoading === "withdraw";
  const pausing     = actionLoading === "pause";
  const resuming    = actionLoading === "resume";
  const cancelling  = actionLoading === "cancel";
  const anyBusy     = loading || !!actionLoading;

  // Which actions render
  const showWithdraw = !!onWithdraw && stream.status === "Active";
  const showPause    = !!onPause && stream.status === "Active";
  const showResume   = !!onResume && stream.status === "Paused";
  const showCancel   = !!onCancel && (stream.status === "Active" || stream.status === "Paused");
  const showTopUp    = !!onShowTopUp && (stream.status === "Active" || stream.status === "Paused");
  const showHistory  = !!onShowHistory;
  const showCsv      = !!onExportCsv;
  const hasActions   = showWithdraw || showPause || showResume || showCancel || showTopUp || showHistory || showCsv;

  // onCancel is called directly; the parent is responsible for showing a
  // confirmation modal (CancelConfirmModal) before invoking this callback.
  const handleCancel = () => onCancel!();

  return (
    <article
      className={`ssc-card ssc-status-${stream.status.toLowerCase()}`}
      aria-label={`Stream ${key}, status: ${stream.status}`}
      id={`stream-card-${key}`}
    >
      {/* ── Header ── */}
      <header className="ssc-header">
        <div className="ssc-title-row">
          <h3 className="ssc-stream-id">Stream #{key}</h3>
          <StreamStatusBadge status={stream.status as StreamStatus} />
        </div>
        <p className="ssc-employee">
          <span className="ssc-field-label">Employee:</span>{" "}
          <ExplorerLink
            href={explorerAccountUrl(stream.employee)}
            label={`View employee account ${stream.employee} on Stellar Explorer`}
          >
            <code title={stream.employee} aria-label={`Employee address: ${stream.employee}`}>
              {stream.employee.slice(0, 6)}…{stream.employee.slice(-4)}
            </code>
          </ExplorerLink>
        </p>
        <p className="ssc-employee">
          <span className="ssc-field-label">Employer:</span>{" "}
          <ExplorerLink
            href={explorerAccountUrl(stream.employer)}
            label={`View employer account ${stream.employer} on Stellar Explorer`}
          >
            <code title={stream.employer} aria-label={`Employer address: ${stream.employer}`}>
              {stream.employer.slice(0, 6)}…{stream.employer.slice(-4)}
            </code>
          </ExplorerLink>
        </p>
      </header>

      {/* ── Metrics grid ── */}
      <dl className="ssc-metrics">
        <MetricItem
          label="Rate"
          value={formatRate(stream.ratePerSecond)}
          sublabel={`${stream.ratePerSecond.toString()} stroops/s`}
        />
        <MetricItem
          label="Total Deposit"
          value={`${formatXlm(stream.deposit)} XLM`}
        />
        <MetricItem
          label="Withdrawn"
          value={`${formatXlm(stream.withdrawn)} XLM`}
        />
        <MetricItem
          label="Claimable Now"
          value={`${formatXlm(claimable)} XLM`}
          highlight
          live={stream.status === "Active"}
        />
      </dl>

      {/* ── Progress bar ── */}
      <div className="ssc-progress-section">
        <div
          className="ssc-progress-track"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress.toFixed(1)}% of deposit paid out`}
        >
          <div
            className={`ssc-progress-fill ssc-fill-${stream.status.toLowerCase()}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="ssc-progress-labels" aria-hidden="true">
          <span>🔒 Locked: <strong>{formatXlm(locked)} XLM</strong></span>
          <span className="muted">{progress.toFixed(1)}% paid out</span>
        </div>
      </div>

      {/* ── Timing row ── */}
      <div className="ssc-times">
        <span>
          <span className="ssc-field-label">Started:</span>{" "}
          {stream.startTime > 0n ? (
            <time dateTime={isoTs(stream.startTime)}>
              {formatTs(stream.startTime)}
            </time>
          ) : (
            <span>—</span>
          )}
        </span>
        <span>
          <span className="ssc-field-label">Stops:</span>{" "}
          {stream.stopTime === 0n ? (
            <span>Indefinite</span>
          ) : (
            <time dateTime={isoTs(stream.stopTime)}>
              {formatTs(stream.stopTime)}
            </time>
          )}
        </span>
      </div>

      {/* ── Action buttons ── */}
      {hasActions && (
        <div
          className="ssc-actions"
          role="group"
          aria-label={`Actions for stream ${key}`}
        >
          {showWithdraw && (
            <button
              className="btn"
              onClick={onWithdraw}
              disabled={anyBusy}
              aria-busy={withdrawing}
              aria-label={`Withdraw claimable tokens from stream ${key}`}
              id={`withdraw-btn-${key}`}
            >
              {withdrawing ? "Withdrawing…" : "💸 Withdraw"}
            </button>
          )}

          {showPause && (
            <button
              className="btn btn-warning btn-sm"
              onClick={onPause}
              disabled={anyBusy}
              aria-busy={pausing}
              aria-label={`Pause stream ${key}`}
              id={`pause-btn-${key}`}
            >
              {pausing ? "Pausing…" : "⏸ Pause"}
            </button>
          )}

          {showResume && (
            <button
              className="btn btn-success btn-sm"
              onClick={onResume}
              disabled={anyBusy}
              aria-busy={resuming}
              aria-label={`Resume stream ${key}`}
              id={`resume-btn-${key}`}
            >
              {resuming ? "Resuming…" : "▶ Resume"}
            </button>
          )}

          {showCancel && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleCancel}
              disabled={anyBusy}
              aria-busy={cancelling}
              aria-label={`Cancel stream ${key}`}
              id={`cancel-btn-${key}`}
            >
              {cancelling ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}

          {showTopUp && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onShowTopUp}
              disabled={anyBusy}
              aria-label={`Top up stream ${key}`}
              id={`topup-btn-${key}`}
            >
              ➕ Top Up
            </button>
          )}

          {showHistory && (
            <button
              className="btn btn-secondary"
              onClick={onShowHistory}
              aria-label={`View transaction history for stream ${key}`}
              id={`history-btn-${key}`}
            >
              📋 History
            </button>
          )}

          {showCsv && (
            <button
              className="btn btn-secondary"
              onClick={onExportCsv}
              aria-label={`Export transaction history for stream ${key} as CSV`}
              id={`csv-btn-${key}`}
            >
              ⬇ CSV
            </button>
          )}
        </div>
      )}

      {/* ── Expandable slot (e.g. inline history panel) ── */}
      {children}

      {/* ── Last transaction link (#239) ── */}
      {lastTxHash && (
        <div className="ssc-last-tx">
          <span className="ssc-field-label">Last tx:</span>{" "}
          <ExplorerLink
            href={explorerTxUrl(lastTxHash)}
            label={`View transaction ${lastTxHash} on Stellar Explorer`}
          >
            <code>{lastTxHash.slice(0, 8)}…{lastTxHash.slice(-6)}</code>
          </ExplorerLink>
        </div>
      )}
    </article>
  );
}
