// SPDX-License-Identifier: Apache-2.0

/**
 * Stream form validation utilities for employer salary stream creation.
 * Provides comprehensive client-side validation for all form fields.
 */

import { StrKey } from "@stellar/stellar-sdk";

/**
 * Validation errors for stream creation form
 */
export interface StreamFormErrors {
  employee?: string;
  token?: string;
  deposit?: string;
  rate?: string;
  stopTime?: string;
  depositVsRate?: string;
}

/**
 * Fee estimate for stream creation
 */
export interface FeeEstimate {
  baseFee: number; // in stroops
  totalFee: number; // in stroops
  totalFeeXlm: number; // in XLM
  estimatedDuration: string;
  estimatedDurationSeconds: number;
}

const BASE_FEE_STROOPS = 100_000; // 0.01 XLM
const STROOPS_PER_XLM = 10_000_000;

/**
 * Validates a Stellar address format
 * @param address - The address to validate
 * @returns true if valid Stellar address, false otherwise
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  try {
    // Check if it's a valid public key (starts with G) or contract ID (starts with C)
    return StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContractId(address);
  } catch {
    return false;
  }
}

/**
 * Validates the deposit amount
 * @param deposit - Deposit amount in XLM
 * @returns error message if invalid, undefined if valid
 */
export function validateDeposit(deposit: string): string | undefined {
  if (!deposit || !deposit.trim()) {
    return "Deposit is required";
  }

  const dep = parseFloat(deposit);
  if (isNaN(dep)) {
    return "Deposit must be a valid number";
  }

  if (dep <= 0) {
    return "Deposit must be greater than 0";
  }

  // Check for reasonable upper limit (e.g., 1 billion XLM)
  if (dep > 1_000_000_000) {
    return "Deposit amount is too large";
  }

  return undefined;
}

/**
 * Validates the rate per second
 * @param rate - Rate in stroops per second
 * @returns error message if invalid, undefined if valid
 */
export function validateRate(rate: string): string | undefined {
  if (!rate || !rate.trim()) {
    return "Rate is required";
  }

  const r = parseFloat(rate);
  if (isNaN(r)) {
    return "Rate must be a valid number";
  }

  if (r <= 0) {
    return "Rate must be greater than 0";
  }

  // Check for reasonable upper limit
  if (r > 1_000_000_000) {
    return "Rate is too large";
  }

  return undefined;
}

/**
 * Validates that deposit is sufficient for the rate
 * @param deposit - Deposit in XLM
 * @param rate - Rate in stroops per second
 * @returns error message if invalid, undefined if valid
 */
export function validateDepositVsRate(deposit: string, rate: string): string | undefined {
  const dep = parseFloat(deposit);
  const r = parseFloat(rate);

  if (isNaN(dep) || isNaN(r) || dep <= 0 || r <= 0) {
    return undefined; // Let individual field validators handle these
  }

  // Convert deposit to stroops
  const depositStroops = dep * STROOPS_PER_XLM;

  // Check if deposit is at least 1 second worth of streaming
  if (depositStroops < r) {
    return `Deposit must be at least ${(r / STROOPS_PER_XLM).toFixed(6)} XLM to stream for 1 second at this rate`;
  }

  return undefined;
}

/**
 * Validates the employee address
 * @param address - Employee address
 * @returns error message if invalid, undefined if valid
 */
export function validateEmployeeAddress(address: string): string | undefined {
  if (!address || !address.trim()) {
    return "Employee address is required";
  }

  if (!isValidStellarAddress(address)) {
    return "Invalid Stellar address format (must start with G for public key)";
  }

  return undefined;
}

/**
 * Validates the token contract address
 * @param address - Token contract address
 * @returns error message if invalid, undefined if valid
 */
export function validateTokenAddress(address: string): string | undefined {
  if (!address || !address.trim()) {
    return "Token contract ID is required";
  }

  if (!isValidStellarAddress(address)) {
    return "Invalid contract address format (must start with C for contract)";
  }

  return undefined;
}

/**
 * Validates the stop time
 * @param stopTime - Unix timestamp or "0" for indefinite
 * @returns error message if invalid, undefined if valid
 */
export function validateStopTime(stopTime: string): string | undefined {
  if (!stopTime || stopTime === "0") {
    return undefined; // 0 means indefinite, which is valid
  }

  const st = parseInt(stopTime, 10);
  if (isNaN(st)) {
    return "Stop time must be a valid number";
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (st <= nowSec) {
    return "Stop time must be in the future";
  }

  return undefined;
}

/**
 * Validates the entire form
 * @param employee - Employee address
 * @param token - Token contract address
 * @param deposit - Deposit in XLM
 * @param rate - Rate in stroops per second
 * @param stopTime - Stop time (unix timestamp or "0")
 * @returns object with validation errors
 */
export function validateStreamForm(
  employee: string,
  token: string,
  deposit: string,
  rate: string,
  stopTime: string
): StreamFormErrors {
  const errors: StreamFormErrors = {};

  const employeeError = validateEmployeeAddress(employee);
  if (employeeError) errors.employee = employeeError;

  const tokenError = validateTokenAddress(token);
  if (tokenError) errors.token = tokenError;

  const depositError = validateDeposit(deposit);
  if (depositError) errors.deposit = depositError;

  const rateError = validateRate(rate);
  if (rateError) errors.rate = rateError;

  const stopTimeError = validateStopTime(stopTime);
  if (stopTimeError) errors.stopTime = stopTimeError;

  // Cross-field validation
  if (!depositError && !rateError) {
    const depositVsRateError = validateDepositVsRate(deposit, rate);
    if (depositVsRateError) errors.depositVsRate = depositVsRateError;
  }

  return errors;
}

/**
 * Calculates the estimated duration of a stream
 * @param deposit - Deposit in XLM
 * @param rate - Rate in stroops per second
 * @returns formatted duration string
 */
export function calculateStreamDuration(deposit: string, rate: string): string | null {
  const dep = parseFloat(deposit);
  const r = parseFloat(rate);

  if (!dep || !r || dep <= 0 || r <= 0) return null;

  // Convert deposit to stroops
  const depositStroops = dep * STROOPS_PER_XLM;
  const seconds = depositStroops / r;

  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)}h`;
  return `~${(seconds / 86400).toFixed(1)} days`;
}

/**
 * Calculates fee estimate for stream creation
 * @param deposit - Deposit in XLM
 * @param rate - Rate in stroops per second
 * @returns fee estimate
 */
export function calculateFeeEstimate(deposit: string, rate: string): FeeEstimate | null {
  const dep = parseFloat(deposit);
  const r = parseFloat(rate);

  if (!dep || !r || dep <= 0 || r <= 0) return null;

  // Convert deposit to stroops
  const depositStroops = dep * STROOPS_PER_XLM;
  const seconds = depositStroops / r;

  // Base fee for transaction
  const baseFee = BASE_FEE_STROOPS;

  // Total fee (currently just base fee, can be extended for additional fees)
  const totalFee = baseFee;
  const totalFeeXlm = totalFee / STROOPS_PER_XLM;

  return {
    baseFee,
    totalFee,
    totalFeeXlm,
    estimatedDuration: calculateStreamDuration(deposit, rate) || "Unknown",
    estimatedDurationSeconds: Math.floor(seconds),
  };
}

/**
 * Formats a number as XLM with proper decimal places
 * @param stroops - Amount in stroops
 * @returns formatted XLM string
 */
export function formatXlm(stroops: bigint | number): string {
  const num = typeof stroops === "bigint" ? Number(stroops) : stroops;
  return (num / STROOPS_PER_XLM).toFixed(7).replace(/\.?0+$/, "");
}

/**
 * Converts XLM to stroops
 * @param xlm - Amount in XLM
 * @returns amount in stroops
 */
export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * STROOPS_PER_XLM));
}
