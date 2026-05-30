// SPDX-License-Identifier: Apache-2.0

import {
  Contract,
  Networks,
  rpc,
  Transaction,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  Address,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { PayStreamClientOptions, Stream, StreamParams } from "./types.js";
import { scValToStream } from "./convert.js";

const TIMEOUT_SECONDS = 30;

/**
 * PayStreamClient wraps all PayStream Soroban contract functions with full
 * TypeScript types.
 *
 * Read-only calls (get_stream, claimable, stream_count) use simulateTransaction
 * and return values directly.
 *
 * Mutating calls return a prepared, unsigned transaction XDR string that the
 * caller must sign (e.g. with freighterSignTransaction) and submit via
 * submitTransaction.
 */
export class PayStreamClient {
  private readonly rpc: rpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly contractId: string;

  constructor(opts: PayStreamClientOptions) {
    this.rpc = new rpc.Server(opts.rpcUrl, { allowHttp: true });
    this.contract = new Contract(opts.contractId);
    this.networkPassphrase = opts.networkPassphrase;
    this.contractId = opts.contractId;
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Build a transaction calling `method` with `args`, simulate, and return XDR. */
  private async buildTx(
    callerPublicKey: string,
    method: string,
    args: xdr.ScVal[]
  ): Promise<string> {
    const account = await this.rpc.getAccount(callerPublicKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(TIMEOUT_SECONDS)
      .build();

    const simResult = await this.rpc.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }
    const prepared = rpc.assembleTransaction(
      tx,
      simResult
    ).build();
    return prepared.toXDR();
  }

  /** Simulate a read-only call and return the raw ScVal result. */
  private async simulateRead(
    method: string,
    args: xdr.ScVal[]
  ): Promise<xdr.ScVal> {
    const account = await this.rpc.getAccount(
      // Use a well-known testnet account for read-only sims; no auth needed.
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
    );
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(TIMEOUT_SECONDS)
      .build();

    const simResult = await this.rpc.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }
    const success = simResult as rpc.Api.SimulateTransactionSuccessResponse;
    if (!success.result) throw new Error("No result from simulation");
    return success.result.retval;
  }

  /**
   * Submit a signed transaction XDR and wait for confirmation.
   * @returns The transaction hash.
   */
  async submitTransaction(signedXdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(
      signedXdr,
      this.networkPassphrase
    ) as Transaction;
    const sendResult = await this.rpc.sendTransaction(tx);
    if (sendResult.status === "ERROR") {
      throw new Error(`Submit failed: ${JSON.stringify(sendResult.errorResult)}`);
    }
    const hash = sendResult.hash;
    // Poll for confirmation
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await this.rpc.getTransaction(hash);
      if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return hash;
      }
      if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${hash}`);
      }
    }
    throw new Error(`Transaction not confirmed after timeout: ${hash}`);
  }

  // ─── read-only ───────────────────────────────────────────────────────────────

  /** Read the full state of a stream by ID. */
  async getStream(streamId: bigint): Promise<Stream> {
    const val = await this.simulateRead("get_stream", [
      nativeToScVal(streamId, { type: "u64" }),
    ]);
    return scValToStream(val);
  }

  /** Query how many tokens the employee can withdraw right now. */
  async claimable(streamId: bigint): Promise<bigint> {
    const val = await this.simulateRead("claimable", [
      nativeToScVal(streamId, { type: "u64" }),
    ]);
    return BigInt(scValToNative(val) as string | number);
  }

  /** Query claimable amount at an arbitrary timestamp. */
  async claimableAt(streamId: bigint, timestamp: bigint): Promise<bigint> {
    const val = await this.simulateRead("claimable_at", [
      nativeToScVal(streamId, { type: "u64" }),
      nativeToScVal(timestamp, { type: "u64" }),
    ]);
    return BigInt(scValToNative(val) as string | number);
  }

  /** Total number of streams ever created. */
  async streamCount(): Promise<bigint> {
    const val = await this.simulateRead("stream_count", []);
    return BigInt(scValToNative(val) as string | number);
  }

  // ─── mutating (return unsigned tx XDR) ──────────────────────────────────────

  /**
   * Initialize the contract with an admin address.
   * Returns unsigned transaction XDR.
   */
  async initialize(admin: string): Promise<string> {
    return this.buildTx(admin, "initialize", [
      new Address(admin).toScVal(),
    ]);
  }

  /**
   * Create a salary stream. Returns unsigned transaction XDR.
   *
   * @param employer        - Employer public key (pays and signs)
   * @param employee        - Employee public key
   * @param tokenAddress    - SEP-41 token contract ID
   * @param deposit         - Total tokens to lock
   * @param ratePerSecond   - Tokens streamed per second
   * @param stopTime        - Hard stop timestamp (0 = indefinite)
   * @param cooldownPeriod  - Min seconds between withdrawals (0 = none)
   * @param cliffTime       - Timestamp before which nothing is claimable (0 = none)
   */
  async createStream(
    employer: string,
    employee: string,
    tokenAddress: string,
    deposit: bigint,
    ratePerSecond: bigint,
    stopTime: bigint,
    cooldownPeriod: bigint,
    cliffTime: bigint
  ): Promise<string> {
    return this.buildTx(employer, "create_stream", [
      new Address(employer).toScVal(),
      new Address(employee).toScVal(),
      new Address(tokenAddress).toScVal(),
      nativeToScVal(deposit, { type: "i128" }),
      nativeToScVal(ratePerSecond, { type: "i128" }),
      nativeToScVal(stopTime, { type: "u64" }),
      nativeToScVal(cooldownPeriod, { type: "u64" }),
      nativeToScVal(cliffTime, { type: "u64" }),
    ]);
  }

  /**
   * Create multiple streams atomically. Returns unsigned transaction XDR.
   */
  async createStreamsBatch(
    employer: string,
    params: StreamParams[]
  ): Promise<string> {
    const paramsScVal = xdr.ScVal.scvVec(
      params.map((p) =>
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("employee"),
            val: new Address(p.employee).toScVal(),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("token"),
            val: new Address(p.token).toScVal(),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("deposit"),
            val: nativeToScVal(p.deposit, { type: "i128" }),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("rate_per_second"),
            val: nativeToScVal(p.ratePerSecond, { type: "i128" }),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("stop_time"),
            val: nativeToScVal(p.stopTime, { type: "u64" }),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol("cliff_time"),
            val: nativeToScVal(p.cliffTime, { type: "u64" }),
          }),
        ])
      )
    );
    return this.buildTx(employer, "create_streams_batch", [
      new Address(employer).toScVal(),
      paramsScVal,
    ]);
  }

  /**
   * Employee withdraws all claimable tokens. Returns unsigned transaction XDR.
   */
  async withdraw(employee: string, streamId: bigint): Promise<string> {
    return this.buildTx(employee, "withdraw", [
      new Address(employee).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
    ]);
  }

  /**
   * Employer updates the rate of an active stream. Returns unsigned transaction XDR.
   */
  async updateRate(
    employer: string,
    streamId: bigint,
    newRate: bigint
  ): Promise<string> {
    return this.buildTx(employer, "update_rate", [
      new Address(employer).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
      nativeToScVal(newRate, { type: "i128" }),
    ]);
  }

  /**
   * Propose a new admin for the contract. Returns unsigned transaction XDR.
   */
  async proposeAdmin(currentAdmin: string, newAdmin: string): Promise<string> {
    return this.buildTx(currentAdmin, "propose_admin", [
      new Address(currentAdmin).toScVal(),
      new Address(newAdmin).toScVal(),
    ]);
  }

  /**
   * Accept the admin role. Returns unsigned transaction XDR.
   */
  async acceptAdmin(newAdmin: string): Promise<string> {
    return this.buildTx(newAdmin, "accept_admin", [
      new Address(newAdmin).toScVal(),
    ]);
  }

  /**
   * Pause the entire contract (Admin only). Returns unsigned transaction XDR.
   */
  async pauseContract(admin: string, nonce: bigint): Promise<string> {
    return this.buildTx(admin, "pause_contract", [
      new Address(admin).toScVal(),
      nativeToScVal(nonce, { type: "u64" }),
    ]);
  }

  /**
   * Unpause the entire contract (Admin only). Returns unsigned transaction XDR.
   */
  async unpauseContract(admin: string, nonce: bigint): Promise<string> {
    return this.buildTx(admin, "unpause_contract", [
      new Address(admin).toScVal(),
      nativeToScVal(nonce, { type: "u64" }),
    ]);
  }

  /**
   * Set the minimum deposit amount (Admin only). Returns unsigned transaction XDR.
   */
  async setMinDeposit(
    admin: string,
    nonce: bigint,
    amount: bigint
  ): Promise<string> {
    return this.buildTx(admin, "set_min_deposit", [
      new Address(admin).toScVal(),
      nativeToScVal(nonce, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    ]);
  }

  /**
   * Get the current admin nonce.
   */
  async adminNonce(): Promise<bigint> {
    const val = await this.simulateRead("admin_nonce", []);
    return BigInt(scValToNative(val) as string | number);
  }

  /**
   * Employer tops up an active stream. Returns unsigned transaction XDR.
   */
  async topUp(
    employer: string,
    streamId: bigint,
    amount: bigint
  ): Promise<string> {
    return this.buildTx(employer, "top_up", [
      new Address(employer).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    ]);
  }

  /**
   * Employer pauses an active stream. Returns unsigned transaction XDR.
   */
  async pauseStream(employer: string, streamId: bigint): Promise<string> {
    return this.buildTx(employer, "pause_stream", [
      new Address(employer).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
    ]);
  }

  /**
   * Employer resumes a paused stream. Returns unsigned transaction XDR.
   */
  async resumeStream(employer: string, streamId: bigint): Promise<string> {
    return this.buildTx(employer, "resume_stream", [
      new Address(employer).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
    ]);
  }

  /**
   * Employer cancels a stream. Returns unsigned transaction XDR.
   */
  async cancelStream(employer: string, streamId: bigint): Promise<string> {
    return this.buildTx(employer, "cancel_stream", [
      new Address(employer).toScVal(),
      nativeToScVal(streamId, { type: "u64" }),
    ]);
  }
}
