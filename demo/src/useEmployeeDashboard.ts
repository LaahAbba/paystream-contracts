// SPDX-License-Identifier: Apache-2.0
import { useState, useCallback, useEffect, useRef } from "react";
import {
  PayStreamClient,
  connectFreighter,
  freighterSignTransaction,
  isFreighterConnected,
  pollClaimable,
  type Stream,
  type PollHandle,
} from "@paystream/sdk";
import { CONFIG } from "./config";

const client = new PayStreamClient(CONFIG);

const MAX_SCAN = 200;

export interface EmployeeStats {
  total: number;
  active: number;
  totalWithdrawnXlm: number;
  totalClaimableXlm: number;
}

export function useEmployeeDashboard(seedPublicKey?: string | null) {
  const [publicKey, setPublicKey] = useState<string | null>(seedPublicKey ?? null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [claimableAmounts, setClaimableAmounts] = useState<Record<string, bigint>>({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [chainTotal, setChainTotal] = useState(0);

  const pollHandles = useRef<Record<string, PollHandle>>({});

  // Clean up pollers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollHandles.current).forEach((handle) => handle.unsubscribe());
      pollHandles.current = {};
    };
  }, []);

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
  const loadDashboard = useCallback(async (employeeKey: string) => {
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
          const streamId = BigInt(i);
          const stream = await client.getStream(streamId);
          if (stream.employee === employeeKey) {
            found.push(stream);
            setStreams([...found]);

            // Start polling for claimable amount
            const key = streamId.toString();
            if (!pollHandles.current[key] && stream.status === "Active") {
              pollHandles.current[key] = pollClaimable(
                client,
                streamId,
                5000,
                (amount) => setClaimableAmounts((prev) => ({ ...prev, [key]: amount })),
                (err) => console.error("pollClaimable error:", err)
              );
            } else if (stream.status !== "Active") {
              // For non-active streams, fetch claimable once
              const amount = await client.claimable(streamId);
              setClaimableAmounts((prev) => ({ ...prev, [key]: amount }));
            }
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

  // Auto-load when a public key is set
  useEffect(() => {
    if (publicKey) loadDashboard(publicKey);
  }, [publicKey, loadDashboard]);

  const refresh = useCallback(() => {
    if (publicKey) loadDashboard(publicKey);
  }, [publicKey, loadDashboard]);

  // ── Stream actions ────────────────────────────────────────────────────────
  const withdraw = useCallback(
    async (streamId: bigint) => {
      if (!publicKey) return;
      const key = streamId.toString();
      setActionLoading(`withdraw-${key}`);
      setError(null);
      try {
        const xdrStr = await client.withdraw(publicKey, streamId);
        const signed = await freighterSignTransaction(xdrStr, CONFIG.networkPassphrase);
        await client.submitTransaction(signed);

        // Refresh the affected stream
        const updated = await client.getStream(streamId);
        setStreams((prev) => prev.map((s) => (s.id === streamId ? updated : s)));
        
        // Refresh claimable manually once after withdraw
        const amount = await client.claimable(streamId);
        setClaimableAmounts((prev) => ({ ...prev, [key]: amount }));
      } catch (e) {
        setError(String(e));
      } finally {
        setActionLoading(null);
      }
    },
    [publicKey]
  );

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const stats: EmployeeStats = streams.reduce<EmployeeStats>(
    (acc, s) => {
      acc.total++;
      if (s.status === "Active") acc.active++;

      acc.totalWithdrawnXlm += Number(s.withdrawn) / 10_000_000;
      
      const claimable = claimableAmounts[s.id.toString()] ?? 0n;
      acc.totalClaimableXlm += Number(claimable) / 10_000_000;
      return acc;
    },
    {
      total: 0, active: 0, totalWithdrawnXlm: 0, totalClaimableXlm: 0,
    }
  );

  return {
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
  };
}
