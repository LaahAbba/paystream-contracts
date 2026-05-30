// SPDX-License-Identifier: Apache-2.0
import React from "react";

export type StreamStatus = "Active" | "Paused" | "Cancelled" | "Exhausted";

interface StreamStatusBadgeProps {
  status: StreamStatus;
}

const STATUS_DESCRIPTIONS: Record<StreamStatus, string> = {
  Active: "The stream is currently running and tokens are being distributed.",
  Paused: "The stream has been temporarily stopped by the employer.",
  Cancelled: "The stream has been permanently terminated.",
  Exhausted: "The stream has reached its full deposit and is no longer active.",
};

/**
 * Reusable badge component for stream statuses.
 * Includes a tooltip with a description of the status.
 */
export function StreamStatusBadge({ status }: StreamStatusBadgeProps) {
  const description = STATUS_DESCRIPTIONS[status];
  
  return (
    <div className="status-badge-container">
      <span
        className={`status-badge status-${status.toLowerCase()}`}
        aria-label={`Status: ${status}`}
        role="status"
      >
        {status}
        <span className="status-tooltip" aria-hidden="true">
          {description}
        </span>
      </span>
      <span className="sr-only">Status description: {description}</span>
    </div>
  );
}
