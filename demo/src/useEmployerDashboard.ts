// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useEffect } from "react";
import {
  PayStreamClient,
  connectFreighter,
  freighterSignTransaction,
  isFreighterConnected,
  type Stream,
} from "@paystream/sdk";
import { CONFIG } from "./config";

const client = new PayStreamClient(CONFIG);

/** Maximum number of streams to scan (scan newest → oldest). */
const MAX_SCAN = 200;

export interface DashboardStats {
  total: number;
  active: number;
  paused: number;
  cancelled: number;
  exhausted: number;
  totalLockedXlm: number;
  totalDepositXlm: number;
  totalWithdrawnXlm: number;
}

export function useEmployerDashboard(seedPublicKey?: string | null) {
  const [publicKey, setPublicKey] = useState<string | null>(seedPublicKey ?? null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [chainTotal, setChainTotal] = useState(0);
  const [lastTxHashes, setLastTxHashes] = useState<Record<string, string>>({});

  // ── Connect wallet ────────────────────────────────────────────────────────
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

  // ── Scan streams ──────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async (employerKey: string) => {
    setLoading(true);
    setError(null);
    setStreams([]);
    setScanned(0);
    try {
      const count = await client.streamCount();
      const total = Number(count);
      setChainTotal(total);
      if (total === 0) return;

      const found: Stream[] = [];
      const start = Math.max(0, total - MAX_SCAN);

      for (let i = total - 1; i >= start; i--) {
        try {
          const stream = await client.getStream(BigInt(i));
          if (stream.employer === employerKey) {
            found.push(stream);
            setStreams([...found]);
          }
        } catch {
          // skip unreadable / missing streams
        }
        setScanned(total - i);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load when a public key is set (including seed)
  useEffect(() => {
    if (publicKey) loadDashboard(publicKey);
  }, [publicKey, loadDashboard]);

  const refresh = useCallback(() => {
    if (publicKey) loadDashboard(publicKey);
  }, [publicKey, loadDashboard]);

  // ── Stream actions ────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (action: "pause" | "resume" | "cancel", streamId: bigint) => {
      if (!publicKey) return;
      const key = `${action}-${streamId}`;
      setActionLoading(key);
      setError(null);
      try {
        let xdrStr: string;
        if (action === "pause") xdrStr = await client.pauseStream(publicKey, streamId);
        else if (action === "resume") xdrStr = await client.resumeStream(publicKey, streamId);
        else xdrStr = await client.cancelStream(publicKey, streamId);

        const signed = await freighterSignTransaction(xdrStr, CONFIG.networkPassphrase);
        const txHash = await client.submitTransaction(signed);
        setLastTxHashes((prev) => ({ ...prev, [streamId.toString()]: txHash }));

        // Refresh only the affected stream
        const updated = await client.getStream(streamId);
        setStreams((prev) => prev.map((s) => (s.id === streamId ? updated : s)));
      } catch (e) {
        setError(String(e));
      } finally {
        setActionLoading(null);
      }
    },
    [publicKey]
  );

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const stats: DashboardStats = streams.reduce<DashboardStats>(
    (acc, s) => {
      acc.total++;
      if (s.status === "Active") acc.active++;
      else if (s.status === "Paused") acc.paused++;
      else if (s.status === "Cancelled") acc.cancelled++;
      else if (s.status === "Exhausted") acc.exhausted++;

      const locked = Number(s.deposit - s.withdrawn) / 10_000_000;
      if (locked > 0) acc.totalLockedXlm += locked;
      acc.totalDepositXlm += Number(s.deposit) / 10_000_000;
      acc.totalWithdrawnXlm += Number(s.withdrawn) / 10_000_000;
      return acc;
    },
    {
      total: 0, active: 0, paused: 0, cancelled: 0, exhausted: 0,
      totalLockedXlm: 0, totalDepositXlm: 0, totalWithdrawnXlm: 0,
    }
  );

  const handleTopUp = useCallback(
    async (streamId: bigint, amountStroops: bigint) => {
      if (!publicKey) return;
      const key = `topup-${streamId}`;
      setActionLoading(key);
      setError(null);
      try {
        const xdrStr = await client.topUp(publicKey, streamId, amountStroops);
        const signed = await freighterSignTransaction(xdrStr, CONFIG.networkPassphrase);
        const txHash = await client.submitTransaction(signed);
        setLastTxHashes((prev) => ({ ...prev, [streamId.toString()]: txHash }));

        // Refresh only the affected stream
        const updated = await client.getStream(streamId);
        setStreams((prev) => prev.map((s) => (s.id === streamId ? updated : s)));
      } catch (e) {
        setError(String(e));
        throw e; // re-throw so UI can handle if needed
      } finally {
        setActionLoading(null);
      }
    },
    [publicKey]
  );

  return {
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
  };
}
