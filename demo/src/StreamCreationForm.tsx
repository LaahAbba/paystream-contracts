// SPDX-License-Identifier: Apache-2.0
import React, { useState, useEffect, useId } from "react";
import {
  validateStreamForm,
  calculateFeeEstimate,
  calculateStreamDuration,
  StreamFormErrors,
  FeeEstimate,
  xlmToStroops,
} from "./streamFormValidation";

interface StreamCreationFormProps {
  defaultToken: string;
  onSubmit: (employee: string, token: string, deposit: bigint, rate: bigint, stopTime: bigint) => Promise<void>;
  loading: boolean;
  walletConnected: boolean;
}

/**
 * Form component for employers to create new salary streams.
 * Includes comprehensive client-side validation and fee estimation.
 */
export function StreamCreationForm({
  defaultToken,
  onSubmit,
  loading,
  walletConnected,
}: StreamCreationFormProps) {
  // Form state
  const [employee, setEmployee] = useState("");
  const [token, setToken] = useState(defaultToken);
  const [deposit, setDeposit] = useState("");
  const [rate, setRate] = useState("");
  const [stopTime, setStopTime] = useState("0");

  // Validation state
  const [errors, setErrors] = useState<StreamFormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // Fee estimate state
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [duration, setDuration] = useState<string | null>(null);

  // Generate unique IDs for form fields
  const employeeId = useId();
  const tokenId = useId();
  const depositId = useId();
  const rateId = useId();
  const stopTimeId = useId();

  // Re-validate on change after first submit attempt
  useEffect(() => {
    if (submitted) {
      const newErrors = validateStreamForm(employee, token, deposit, rate, stopTime);
      setErrors(newErrors);
    }
  }, [employee, token, deposit, rate, stopTime, submitted]);

  // Update fee estimate and duration when deposit or rate changes
  useEffect(() => {
    if (deposit && rate) {
      const estimate = calculateFeeEstimate(deposit, rate);
      setFeeEstimate(estimate);

      const dur = calculateStreamDuration(deposit, rate);
      setDuration(dur);
    } else {
      setFeeEstimate(null);
      setDuration(null);
    }
  }, [deposit, rate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const newErrors = validateStreamForm(employee, token, deposit, rate, stopTime);
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      const depositBigInt = xlmToStroops(parseFloat(deposit));
      const rateBigInt = BigInt(Math.round(parseFloat(rate)));
      const stopTimeBigInt = BigInt(stopTime || "0");

      await onSubmit(employee, token, depositBigInt, rateBigInt, stopTimeBigInt);

      // Reset form on success
      setEmployee("");
      setToken(defaultToken);
      setDeposit("");
      setRate("");
      setStopTime("0");
      setSubmitted(false);
      setErrors({});
    } catch (err) {
      // Error is handled by parent component
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Create a new salary stream">
      {/* Employee Address Field */}
      <div className="field">
        <label htmlFor={employeeId} className="field-label">
          Employee Address <span aria-hidden="true">*</span>
        </label>
        <input
          id={employeeId}
          type="text"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          placeholder="G... (Stellar public key)"
          className={`input${errors.employee ? " input-error" : ""}`}
          aria-required="true"
          aria-invalid={!!errors.employee}
          aria-describedby={errors.employee ? `${employeeId}-err` : undefined}
          disabled={loading}
        />
        {errors.employee && (
          <span id={`${employeeId}-err`} role="alert" className="field-error">
            {errors.employee}
          </span>
        )}
        <p className="field-hint">The Stellar public key of the employee receiving the stream</p>
      </div>

      {/* Token Contract ID Field */}
      <div className="field">
        <label htmlFor={tokenId} className="field-label">
          Token Contract ID <span aria-hidden="true">*</span>
        </label>
        <input
          id={tokenId}
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="C... (Stellar contract ID)"
          className={`input${errors.token ? " input-error" : ""}`}
          aria-required="true"
          aria-invalid={!!errors.token}
          aria-describedby={errors.token ? `${tokenId}-err` : undefined}
          disabled={loading}
        />
        {errors.token && (
          <span id={`${tokenId}-err`} role="alert" className="field-error">
            {errors.token}
          </span>
        )}
        <p className="field-hint">The SEP-41 token contract ID (e.g., USDC on Stellar)</p>
      </div>

      {/* Deposit Field */}
      <div className="field">
        <label htmlFor={depositId} className="field-label">
          Deposit (XLM) <span aria-hidden="true">*</span>
        </label>
        <input
          id={depositId}
          type="number"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          placeholder="0.00"
          min="0"
          step="any"
          className={`input${errors.deposit ? " input-error" : ""}`}
          aria-required="true"
          aria-invalid={!!errors.deposit}
          aria-describedby={errors.deposit ? `${depositId}-err` : undefined}
          disabled={loading}
        />
        {errors.deposit && (
          <span id={`${depositId}-err`} role="alert" className="field-error">
            {errors.deposit}
          </span>
        )}
        <p className="field-hint">Total amount to lock in the stream</p>
      </div>

      {/* Rate Field */}
      <div className="field">
        <label htmlFor={rateId} className="field-label">
          Rate (stroops/sec) <span aria-hidden="true">*</span>
        </label>
        <input
          id={rateId}
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="0"
          min="0"
          step="1"
          className={`input${errors.rate ? " input-error" : ""}`}
          aria-required="true"
          aria-invalid={!!errors.rate}
          aria-describedby={errors.rate ? `${rateId}-err` : undefined}
          disabled={loading}
        />
        {errors.rate && (
          <span id={`${rateId}-err`} role="alert" className="field-error">
            {errors.rate}
          </span>
        )}
        <p className="field-hint">Amount streamed per second (1 XLM = 10,000,000 stroops)</p>
      </div>

      {/* Stop Time Field */}
      <div className="field">
        <label htmlFor={stopTimeId} className="field-label">
          Stop Time (unix timestamp)
        </label>
        <input
          id={stopTimeId}
          type="number"
          value={stopTime}
          onChange={(e) => setStopTime(e.target.value)}
          placeholder="0"
          min="0"
          step="1"
          className={`input${errors.stopTime ? " input-error" : ""}`}
          aria-invalid={!!errors.stopTime}
          aria-describedby={errors.stopTime ? `${stopTimeId}-err` : undefined}
          disabled={loading}
        />
        {errors.stopTime && (
          <span id={`${stopTimeId}-err`} role="alert" className="field-error">
            {errors.stopTime}
          </span>
        )}
        <p className="field-hint">Leave as 0 for indefinite stream, or set a future timestamp to auto-stop</p>
      </div>

      {/* Cross-field validation error */}
      {errors.depositVsRate && (
        <div role="alert" className="error-banner">
          ⚠️ {errors.depositVsRate}
        </div>
      )}

      {/* Fee Estimate Section */}
      {feeEstimate && (
        <div className="fee-estimate-section" role="region" aria-label="Fee estimate">
          <h3 className="fee-estimate-title">Fee Estimate</h3>
          <div className="fee-estimate-grid">
            <div className="fee-estimate-item">
              <span className="fee-estimate-label">Base Fee:</span>
              <span className="fee-estimate-value">{feeEstimate.totalFeeXlm.toFixed(7)} XLM</span>
            </div>
            <div className="fee-estimate-item">
              <span className="fee-estimate-label">Estimated Duration:</span>
              <span className="fee-estimate-value">{feeEstimate.estimatedDuration}</span>
            </div>
            <div className="fee-estimate-item">
              <span className="fee-estimate-label">Total Deposit:</span>
              <span className="fee-estimate-value">{parseFloat(deposit).toFixed(7)} XLM</span>
            </div>
            <div className="fee-estimate-item">
              <span className="fee-estimate-label">Total Cost:</span>
              <span className="fee-estimate-value" style={{ fontWeight: "bold", color: "var(--status-active)" }}>
                {(parseFloat(deposit) + feeEstimate.totalFeeXlm).toFixed(7)} XLM
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Duration Hint */}
      {duration && (
        <p className="duration-hint" aria-live="polite">
          ⏱ Estimated stream duration: <strong>{duration}</strong>
        </p>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || !walletConnected}
        className="btn"
        aria-busy={loading}
      >
        {loading ? "Creating Stream…" : "Create Stream"}
      </button>

      {!walletConnected && (
        <p className="field-hint">Connect your wallet to create a stream.</p>
      )}
    </form>
  );
}
