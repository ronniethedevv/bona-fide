import { JsonRpcProvider } from "near-api-js";
import { CONTRACT_ID, RPC_URL } from "./config.js";
import type { EpochVerdict, Mandate, MandateTerms, MmListing, MmSummary } from "./types.js";

const provider = new JsonRpcProvider({ url: RPC_URL });

function toBase64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Read-only view call against the Bona Fide contract. */
export async function view<T>(methodName: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!CONTRACT_ID) throw new Error("VITE_CONTRACT_ID is not set");
  const res = await provider.query<{ result: number[] }>({
    request_type: "call_function",
    account_id: CONTRACT_ID,
    method_name: methodName,
    args_base64: toBase64(JSON.stringify(args)),
    finality: "optimistic",
  });
  const text = new TextDecoder().decode(new Uint8Array(res.result));
  return JSON.parse(text) as T;
}

export const api = {
  listMms: (from = 0, limit = 100) =>
    view<MmListing[]>("list_mms", { from_index: from, limit }),
  getMmSummary: (account_id: string) =>
    view<MmSummary | null>("get_mm_summary", { account_id }),
  listMandates: (from = 0, limit = 200) =>
    view<Mandate[]>("list_mandates", { from_index: from, limit }),
  getMandate: (id: string) => view<Mandate | null>("get_mandate", { id }),
  getVerdicts: (id: string, from_epoch = 0, limit = 500) =>
    view<EpochVerdict[]>("get_verdicts", { id, from_epoch, limit }),
  getAgentPubkey: (account_id: string) =>
    view<string | null>("get_agent_pubkey", { account_id }),
  isProjectAllowlisted: (account_id: string) =>
    view<boolean>("is_project_allowlisted", { account_id }),
};

export const CALL_GAS = "30000000000000"; // 30 TGas

export function proposeArgs(terms: MandateTerms) {
  return { methodName: "propose_mandate", args: { terms } };
}
export function cancelArgs(id: string) {
  return { methodName: "cancel_mandate", args: { id } };
}
export function cosignArgs(id: string) {
  return { methodName: "cosign_mandate", args: { id } };
}
