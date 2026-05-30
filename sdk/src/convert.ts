// SPDX-License-Identifier: Apache-2.0

import { xdr, scValToNative } from "@stellar/stellar-sdk";
import type { Stream, StreamStatus } from "./types.js";

/** Convert a raw ScVal map (from get_stream) into a typed Stream object. */
export function scValToStream(val: xdr.ScVal): Stream {
  const native = scValToNative(val) as Record<string, unknown>;
  return {
    id: BigInt(native["id"] as string | number),
    employer: native["employer"] as string,
    employee: native["employee"] as string,
    token: native["token"] as string,
    deposit: BigInt(native["deposit"] as string | number),
    withdrawn: BigInt(native["withdrawn"] as string | number),
    ratePerSecond: BigInt(native["rate_per_second"] as string | number),
    startTime: BigInt(native["start_time"] as string | number),
    stopTime: BigInt(native["stop_time"] as string | number),
    lastWithdrawTime: BigInt(native["last_withdraw_time"] as string | number),
    cooldownPeriod: BigInt(native["cooldown_period"] as string | number),
    status: native["status"] as StreamStatus,
    locked: native["locked"] as boolean,
    cliffTime: BigInt(native["cliff_time"] as string | number),
    pausedAt: BigInt(native["paused_at"] as string | number),
  };
}
