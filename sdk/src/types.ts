// SPDX-License-Identifier: Apache-2.0

/** Status of a salary stream, mirroring the on-chain enum. */
export type StreamStatus = "Active" | "Paused" | "Cancelled" | "Exhausted";

/** Full stream state returned by get_stream. */
export interface Stream {
  id: bigint;
  employer: string;
  employee: string;
  token: string;
  deposit: bigint;
  withdrawn: bigint;
  ratePerSecond: bigint;
  startTime: bigint;
  stopTime: bigint;
  lastWithdrawTime: bigint;
  cooldownPeriod: bigint;
  status: StreamStatus;
  locked: boolean;
  cliffTime: bigint;
  pausedAt: bigint;
}

/** Parameters for a single stream in a batch create call. */
export interface StreamParams {
  employee: string;
  token: string;
  deposit: bigint;
  ratePerSecond: bigint;
  stopTime: bigint;
  cliffTime: bigint;
}

/** Options passed to PayStreamClient constructor. */
export interface PayStreamClientOptions {
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Network passphrase (e.g. Networks.TESTNET). */
  networkPassphrase: string;
  /** Deployed stream contract ID. */
  contractId: string;
}
