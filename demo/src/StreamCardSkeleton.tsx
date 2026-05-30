// SPDX-License-Identifier: Apache-2.0
import React from "react";

/**
 * StreamCardSkeleton — animated placeholder that mirrors the StreamStatusCard
 * layout. Shown during initial load and refetch; removed as soon as real data
 * arrives.
 */
export function StreamCardSkeleton() {
  return (
    <div className="ssc-card skel-card" aria-hidden="true">
      {/* Header row */}
      <div className="skel-header">
        <div className="skel-block skel-title" />
        <div className="skel-block skel-badge" />
      </div>

      {/* Metrics grid — 4 cells */}
      <div className="skel-metrics">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel-metric">
            <div className="skel-block skel-label" />
            <div className="skel-block skel-value" />
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="skel-progress-section">
        <div className="skel-block skel-bar" />
      </div>
    </div>
  );
}
