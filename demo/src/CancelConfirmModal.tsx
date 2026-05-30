// SPDX-License-Identifier: Apache-2.0
import React, { useState, useId } from "react";

interface CancelConfirmModalProps {
  streamId: string;
  /** Claimable amount the employee will receive (in stroops). */
  earnedStroops: bigint;
  /** Remaining deposit the employer will get back (in stroops). */
  refundStroops: bigint;
  onConfirm: () => void;
  onClose: () => void;
}

function fmtXlm(stroops: bigint): string {
  return (Number(stroops) / 10_000_000).toFixed(4);
}

/**
 * CancelConfirmModal — replaces window.confirm for stream cancellation.
 * Shows earned / refund amounts and requires the user to type "CANCEL"
 * before the confirm button becomes active.
 */
export function CancelConfirmModal({
  streamId,
  earnedStroops,
  refundStroops,
  onConfirm,
  onClose,
}: CancelConfirmModalProps) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const confirmed = typed === "CANCEL";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    /* Backdrop */
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      onKeyDown={handleKeyDown}
    >
      <div className="modal-box">
        <h2 id="cancel-modal-title" className="modal-title">
          Cancel Stream #{streamId}?
        </h2>
        <p className="modal-warning">
          ⚠️ This action is <strong>irreversible</strong>.
        </p>

        {/* Summary */}
        <dl className="modal-summary">
          <div className="modal-summary-row">
            <dt>Employee receives</dt>
            <dd className="modal-earned">{fmtXlm(earnedStroops)} XLM</dd>
          </div>
          <div className="modal-summary-row">
            <dt>Employer refund</dt>
            <dd>{fmtXlm(refundStroops)} XLM</dd>
          </div>
        </dl>

        {/* Confirmation input */}
        <div className="field">
          <label htmlFor={inputId} className="field-label">
            Type <strong>CANCEL</strong> to confirm
          </label>
          <input
            id={inputId}
            className={`input${confirmed ? "" : typed ? " input-error" : ""}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="CANCEL"
            autoComplete="off"
            aria-describedby="cancel-hint"
          />
          <span id="cancel-hint" className="field-hint">
            This will immediately settle the stream on-chain.
          </span>
        </div>

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Abort
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={!confirmed}
            aria-disabled={!confirmed}
          >
            Confirm Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
