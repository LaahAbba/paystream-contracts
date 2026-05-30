// SPDX-License-Identifier: Apache-2.0

/**
 * Hook for live-updating employee claimable balance ticker.
 * Displays a counter that increases every second based on the stream's rate.
 */

import { useState, useEffect, useRef } from "react";
import type { Stream } from "@paystream/sdk";

/**
 * Calculates the current claimable balance at a given timestamp.
 * 
 * @param stream - The stream object with rate and timing info
 * @param baseClaimable - The base claimable amount from the last poll (in stroops)
 * @param currentTimeSeconds - Current time in seconds (unix timestamp)
 * @returns Current claimable amount in stroops
 */
function calculateCurrentClaimable(
  stream: Stream,
  baseClaimable: bigint,
  currentTimeSeconds: number
): bigint {
  // Only calculate accrual if stream is active
  if (stream.status !== "Active") {
    return baseClaimable;
  }

  // If stream hasn't started yet, return base claimable
  if (stream.startTime > 0n && Number(stream.startTime) > currentTimeSeconds) {
    return baseClaimable;
  }

  // If stream has ended, return base claimable
  if (stream.stopTime > 0n && Number(stream.stopTime) <= currentTimeSeconds) {
    return baseClaimable;
  }

  // Calculate seconds elapsed since last withdraw
  const lastWithdrawSeconds = Number(stream.lastWithdrawTime);
  const elapsedSeconds = currentTimeSeconds - lastWithdrawSeconds;

  // Calculate additional accrual: elapsed time × rate per second
  const additionalAccrual = BigInt(elapsedSeconds) * stream.ratePerSecond;

  return baseClaimable + additionalAccrual;
}

/**
 * Hook that provides a live-updating claimable balance ticker.
 * Updates every second, stops when stream is not active.
 *
 * @param stream - The stream object
 * @param baseClaimable - The base claimable amount from polling (in stroops)
 * @returns Live claimable amount in stroops that updates every second
 */
export function useBalanceTicker(
  stream: Stream,
  baseClaimable: bigint
): bigint {
  const [tickingBalance, setTickingBalance] = useState<bigint>(baseClaimable);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // If stream is not active, just show the base claimable
    if (stream.status !== "Active") {
      setTickingBalance(baseClaimable);
      return;
    }

    // Calculate and set initial value
    const now = Math.floor(Date.now() / 1000);
    setTickingBalance(calculateCurrentClaimable(stream, baseClaimable, now));

    // Set up interval to update every second
    intervalRef.current = setInterval(() => {
      const currentTime = Math.floor(Date.now() / 1000);
      setTickingBalance(calculateCurrentClaimable(stream, baseClaimable, currentTime));
    }, 1000);

    // Cleanup on unmount or dependency change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [stream.status, stream.ratePerSecond, stream.startTime, stream.stopTime, stream.lastWithdrawTime, baseClaimable]);

  return tickingBalance;
}
