// SPDX-License-Identifier: Apache-2.0
import React from "react";

interface WalletButtonProps {
  publicKey: string | null;
  loading: boolean;
  onClick: () => void;
}

/**
 * Wallet connection button for the navbar.
 * Shows "Connect Wallet" when disconnected, or truncated address when connected.
 */
export function WalletButton({ publicKey, loading, onClick }: WalletButtonProps) {
  const truncateAddress = (address: string): string => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  return (
    <button
      className="wallet-button"
      onClick={onClick}
      disabled={loading}
      aria-label={publicKey ? `Connected wallet: ${publicKey}` : "Connect wallet"}
      title={publicKey || "Connect wallet"}
    >
      {loading ? (
        <>
          <span className="wallet-button-spinner" aria-hidden="true"></span>
          Connecting...
        </>
      ) : publicKey ? (
        <>
          <span className="wallet-button-indicator" aria-hidden="true">●</span>
          {truncateAddress(publicKey)}
        </>
      ) : (
        <>
          <span aria-hidden="true">🔗</span>
          Connect Wallet
        </>
      )}
    </button>
  );
}
