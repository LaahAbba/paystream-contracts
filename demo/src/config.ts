import { Networks } from "@stellar/stellar-sdk";

/**
 * Well-known USDC (Circle) contract addresses on Stellar.
 * Source: https://developers.circle.com/stablecoins/stellar-usdc
 *
 * Testnet:  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
 * Mainnet:  GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 */
export const USDC = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
} as const;

/** Whether the app is running against mainnet (vs testnet). */
const IS_MAINNET = import.meta.env.VITE_NETWORK === "mainnet";

export const CONFIG = {
  rpcUrl: IS_MAINNET
    ? "https://soroban.stellar.org"
    : "https://soroban-testnet.stellar.org",
  networkPassphrase: IS_MAINNET ? Networks.PUBLIC : Networks.TESTNET,
  // Replace with your deployed contract ID after running deploy-testnet.sh
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  // Default payment token — Stellar USDC (Circle) on testnet.
  // Switch to USDC.mainnet when deploying to production.
  defaultToken: import.meta.env.VITE_TOKEN_ADDRESS ?? USDC.testnet,
  isMainnet: IS_MAINNET,
};

// ─── Issue #239: Stellar Explorer URLs ───────────────────────────────────────

const EXPLORER_BASE = IS_MAINNET
  ? "https://stellar.expert/explorer/public"
  : "https://stellar.expert/explorer/testnet";

/** Link to a transaction on stellar.expert */
export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

/** Link to an account (address) on stellar.expert */
export function explorerAccountUrl(address: string): string {
  return `${EXPLORER_BASE}/account/${address}`;
}

/** Link to a contract on stellar.expert */
export function explorerContractUrl(contractId: string): string {
  return `${EXPLORER_BASE}/contract/${contractId}`;
}
