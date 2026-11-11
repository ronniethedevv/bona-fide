/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEAR_NETWORK?: string;
  readonly VITE_CONTRACT_ID?: string;
  readonly VITE_AGENT_ID?: string;
  readonly VITE_AGENT_URL?: string;
  readonly VITE_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
