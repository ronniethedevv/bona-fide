/**
 * Re-approve the TEE agent's measurements with the REAL rtmr values from the
 * running CVM's attestation, then remove the stale entry they replace.
 *
 * Why this exists: the Shade CLI bundles measurement tables per dstack
 * version, and Phala's KMS can retire those versions before the CLI catches
 * up (observed: CLI ≤2.4.0 knows 0.5.8/0.5.7; Phala KMS 2026-11 requires
 * 0.5.12+). Deploying with a placeholder entry lets the CVM boot; this script
 * then swaps in the measurements the enclave actually reports, which is the
 * same owner-approves-what-they-verified model the normal flow uses.
 *
 * Usage (from agent/, with ../.env filled, owner key = SPONSOR_*):
 *   npx tsx scripts/fix-measurements.ts <mrtd> <rtmr0> <rtmr1> <rtmr2> \
 *       [key_provider_event_digest] [app_compose_hash]
 *
 * The four rtmr values are 96-char hex strings from the CVM's attestation
 * (Phala dashboard → the CVM → Attestation / TCB details). The optional
 * fifth (96-hex) and sixth (64-hex) args are the key-provider event digest
 * and the compose hash from the quote's RTMR3 event log; when omitted they
 * are reused from the entry already approved on-chain (which is only right
 * if the CLI that approved it computed them for the same KMS + compose).
 */
import "dotenv/config";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const GAS = BigInt("300000000000000");
const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";

interface FullMeasurementsHex {
  rtmrs: { mrtd: string; rtmr0: string; rtmr1: string; rtmr2: string };
  key_provider_event_digest: string;
  app_compose_hash_payload: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

const [mrtd, rtmr0, rtmr1, rtmr2, digestArg, composeArg] = process.argv.slice(2);
const hex96 = /^[0-9a-f]{96}$/i;
const hex64 = /^[0-9a-f]{64}$/i;
if (
  ![mrtd, rtmr0, rtmr1, rtmr2].every((v) => v !== undefined && hex96.test(v)) ||
  (digestArg !== undefined && !hex96.test(digestArg)) ||
  (composeArg !== undefined && !hex64.test(composeArg))
) {
  console.error(
    "Usage: npx tsx scripts/fix-measurements.ts <mrtd> <rtmr0> <rtmr1> <rtmr2> [key_provider_event_digest(96hex)] [app_compose_hash(64hex)]",
  );
  process.exit(1);
}

const contractId = env("AGENT_CONTRACT_ID");

async function view<T>(method: string): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from("{}").toString("base64"),
      },
    }),
  });
  const json = (await res.json()) as { result?: { result?: number[] }; error?: unknown };
  if (!json.result?.result) throw new Error(`view ${method} failed: ${JSON.stringify(json.error ?? json)}`);
  return JSON.parse(Buffer.from(json.result.result).toString()) as T;
}

async function main(): Promise<void> {
  const approved = await view<FullMeasurementsHex[]>("get_approved_measurements");
  if (approved.length === 0)
    throw new Error("No approved measurements on the contract — run `shade deploy` first.");
  // Explicit args win; otherwise reuse what is already approved on-chain.
  const key_provider_event_digest = (digestArg ?? approved[0].key_provider_event_digest).toLowerCase();
  const app_compose_hash_payload = (composeArg ?? approved[0].app_compose_hash_payload).toLowerCase();

  const real: FullMeasurementsHex = {
    rtmrs: {
      mrtd: mrtd.toLowerCase(),
      rtmr0: rtmr0.toLowerCase(),
      rtmr1: rtmr1.toLowerCase(),
      rtmr2: rtmr2.toLowerCase(),
    },
    key_provider_event_digest,
    app_compose_hash_payload,
  };

  const master = new Account(
    env("SPONSOR_ACCOUNT_ID"),
    new JsonRpcProvider({ url: RPC }),
    new KeyPairSigner(KeyPair.fromString(env("SPONSOR_PRIVATE_KEY") as `ed25519:${string}`)),
  );

  console.log(`Approving real measurements on ${contractId}…`);
  await master.callFunction({
    contractId,
    methodName: "approve_measurements",
    args: { measurements: real },
    gas: GAS,
  });

  const stale = approved.filter((m) => JSON.stringify(m) !== JSON.stringify(real));
  for (const m of stale) {
    console.log(`Removing stale entry (rtmr0 ${m.rtmrs.rtmr0.slice(0, 12)}…)`);
    await master.callFunction({
      contractId,
      methodName: "remove_measurements",
      args: { measurements: m },
      gas: GAS,
    });
  }

  const after = await view<FullMeasurementsHex[]>("get_approved_measurements");
  console.log(`Done. Approved entries now: ${after.length}`);
  console.log(
    "The agent in the CVM registers on its next restart/retry. Watch the CVM logs on the Phala dashboard.",
  );
}

void main().catch((e) => {
  console.error("fix-measurements failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
