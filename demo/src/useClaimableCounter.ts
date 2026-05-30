// SPDX-License-Identifier: Apache-2.0

/**
 * Hook for live-updating claimable balance counter.
 * Updates every second based on rate_per_second and last_withdraw_time.
 * Stops ticking when stream is paused or cancelled.
 */

import { useState, useEffect, useRef } from "react";
import type { Stream } from "@paystream/sdk";

/**
 * Calculates the claimable amount at a given timestamp.
 * @param stream - The stream object
 * @param baseClaimable - The base claimable amount from polling (in stroops)
 * @param currentTime - Current time in seconds (unix timestamp)
 * @returns Claimable amount in stroops
 */
function calculateClaimableAtTime(
  stream: Stream,
  baseClaimable: bigint,
  currentTime: number
): bigint {
  // If stream is not active, don't add any additional accrual
  if (stream.status !== "Active") {
    return baseClaimable;
  }

  // If stream hasn't started yet, return base claimable
  if (stream.startTime > 0n && Number(stream.startTime) > currentTime) {
    return baseClaimable;
  }

  // If stream has stopped, return base claimable
  if (stream.stopTime > 0n && Number(stream.stopTime) <= currentTime) {
    return baseClaimable;
  }

  // Calculate time elapsed since last withdraw
  const lastWithdrawTime = Number(stream.lastWithdrawTime);
  const timeSinceLastWithdraw = currentTime - lastWithdrawTime;

  // Calculate additional accrual since the base claimable was calculated
  // Base claimable is calculated at a specific point in time (from polling)
  // We add the accrual from that point to now
  const additionalAccrual = BigInt(timeSinceLastWithdraw) * stream.ratePerSecond;

  return baseClaimable + additionalAccrual;
}

/**
 * Hook that provides a live-updating claimable balance counter.
 * Updates every second, stops when stream is paused or cancelled.
 *
 * @param stream - The stream object
 * @param baseClaimable - The base claimable amount from polling (in stroops)
 * @returns Live claimable amount in stroops
 */
export function useClaimableCounter(
  stream: Stream,
  baseClaimable: bigint
): bigint {
  const [liveClaimable, setLiveClaimable] = useState<bigint>(baseClaimable);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only set up interval if stream is active
    if (stream.status !== "Active") {
      setLiveClaimable(baseClaimable);
      return;
    }

    // Update immediately with current time
    const now = Math.floor(Date.now() / 1000);
    lastUpdateRef.current = now;
    setLiveClaimable(calculateClaimableAtTime(stream, baseClaimable, now));

    // Set up interval to update every second
    intervalRef.current = setInterval(() => {
      const currentTime = Math.floor(Date.now() / 1000);
      setLiveClaimable(calculateClaimableAtTime(stream, baseClaimable, currentTime));
    }, 1000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [stream.status, stream.ratePerSecond, stream.startTime, stream.stopTime, stream.lastWithdrawTime, baseClaimable]);

  return liveClaimable;
}
