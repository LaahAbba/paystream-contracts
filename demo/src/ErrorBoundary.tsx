// SPDX-License-Identifier: Apache-2.0
import React from "react";

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the fallback heading (e.g. "Employer Dashboard"). */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary — catches render errors in its subtree, logs them to the
 * console (ready for a future monitoring hook), and shows a fallback UI with
 * a retry button.
 *
 * Use at the top level (wrapping <App />) and per-route panel for isolation.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for future monitoring integration (e.g. Sentry)
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const { label = "This section" } = this.props;
      return (
        <div className="eb-fallback" role="alert" aria-live="assertive">
          <span className="eb-icon" aria-hidden="true">⚠️</span>
          <h2 className="eb-heading">{label} encountered an error</h2>
          <p className="eb-message">{this.state.error.message}</p>
          <button className="btn" onClick={this.retry}>
            ↺ Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
