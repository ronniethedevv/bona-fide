/** Network + contract configuration, from Vite env (VITE_*). */
export type NetworkId = "testnet" | "mainnet";

export const NETWORK: NetworkId = (import.meta.env.VITE_NEAR_NETWORK as NetworkId) ?? "testnet";

/** The deployed Bona Fide contract account id. */
export const CONTRACT_ID: string = import.meta.env.VITE_CONTRACT_ID ?? "";

/** The agent account id whose enclave key the browser seals to. */
export const AGENT_ID: string = import.meta.env.VITE_AGENT_ID ?? "";

/** Base URL of the hosted agent's key-intake endpoint. */
export const AGENT_URL: string = import.meta.env.VITE_AGENT_URL ?? "";

export const RPC_URL =
  NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org";

export const WALLET_FALLBACK_URL =
  NETWORK === "mainnet" ? "https://app.mynearwallet.com" : "https://testnet.mynearwallet.com";
