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

export const CONFIG = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  // Replace with your deployed contract ID after running deploy-testnet.sh
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  // Default payment token — Stellar USDC (Circle) on testnet.
  // Switch to USDC.mainnet when deploying to production.
  defaultToken: import.meta.env.VITE_TOKEN_ADDRESS ?? USDC.testnet,
};
