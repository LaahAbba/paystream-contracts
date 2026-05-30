// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef } from "react";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletType: "freighter") => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * Modal for wallet connection.
 * Currently supports Freighter, with extensibility for other Stellar wallets.
 */
export function WalletModal({ isOpen, onClose, onConnect, loading, error }: WalletModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleConnect = async (walletType: "freighter") => {
    try {
      await onConnect(walletType);
      onClose();
    } catch {
      // Error is handled by parent component
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="wallet-modal"
      onClick={handleBackdropClick}
      onCancel={onClose}
    >
      <div className="wallet-modal-content">
        <div className="wallet-modal-header">
          <h2>Connect Wallet</h2>
          <button
            className="wallet-modal-close"
            onClick={onClose}
            aria-label="Close wallet connection modal"
          >
            ✕
          </button>
        </div>

        <div className="wallet-modal-body">
          <p className="wallet-modal-description">
            Select a wallet to connect to PayStream. We support Stellar wallets that are compatible with the Freighter extension.
          </p>

          {error && (
            <div className="wallet-modal-error" role="alert">
              <span aria-hidden="true">⚠️</span>
              {error}
            </div>
          )}

          <div className="wallet-options">
            <button
              className="wallet-option"
              onClick={() => handleConnect("freighter")}
              disabled={loading}
              aria-busy={loading}
            >
              <div className="wallet-option-icon">🔐</div>
              <div className="wallet-option-content">
                <div className="wallet-option-name">Freighter</div>
                <div className="wallet-option-description">
                  {loading ? "Connecting..." : "Browser extension wallet for Stellar"}
                </div>
              </div>
              {loading && <span className="wallet-option-spinner" aria-hidden="true"></span>}
            </button>

            <div className="wallet-options-note">
              <p>
                Don't have a wallet? <a href="https://freighter.app" target="_blank" rel="noopener noreferrer">
                  Install Freighter
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="wallet-modal-footer">
          <button
            className="wallet-modal-button-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
