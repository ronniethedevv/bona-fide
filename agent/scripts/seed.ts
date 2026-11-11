/**
 * Seeds the deployed contract with the demo: an honest mandate and a dumping
 * mandate, both co-signed and scored, so the record shows a Pass and a Fail.
 *
 * Signs owner / market-maker / project calls as the master account (read from
 * .env), then asks the running agent to score each fixture and submit the
 * verdicts on-chain (POST /api/run-replay — only the registered agent may
 * submit, which the contract enforces).
 *
 * Prerequisites, all in a shade-env shell:
 *   1. `npx tsx scripts/make-env.ts`  (writes .env)
 *   2. agent running: `npm run dev`   (register it with `shade whitelist`)
 *   3. `npx tsx scripts/seed.ts`
 */
import "dotenv/config";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const GAS = BigInt("300000000000000"); // 300 TGas
const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";
const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:3000";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env — run scripts/make-env.ts first`);
  return v;
}

const contractId = env("AGENT_CONTRACT_ID");
const masterId = env("SPONSOR_ACCOUNT_ID");
const privateKey = env("SPONSOR_PRIVATE_KEY");

const now = Math.floor(Date.now() / 1000);
function terms(label: string) {
  return {
    project: masterId, // master is owner + project for the demo
    exchange: "binance",
    pair: "TOKEN_USDT",
    account_label: label,
    max_spread_bps: 100,
    depth_band_bps: 200,
    min_depth_per_side_quote: "10000000000", // 10,000 quote
    min_uptime_bps: 9000,
    loan_cap_per_epoch_base: "1000000", // 1.0 base
    epoch_secs: 120,
    sample_secs: 30,
    start_ts: String(now),
    end_ts: String(now + 1200), // 10 epochs of headroom
  };
}

async function runReplayOnAgent(mandateId: string, fixture: string): Promise<void> {
  const res = await fetch(`${AGENT_URL}/api/run-replay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mandate_id: Number(mandateId), fixture }),
  });
  const body = (await res.json()) as { submitted?: number; statuses?: string[]; error?: string };
  if (!res.ok || body.error) throw new Error(`agent run-replay failed: ${body.error ?? res.status}`);
  console.log(`  mandate ${mandateId} (${fixture}) → ${body.submitted} verdict(s): ${body.statuses?.join(", ")}`);
}

async function main(): Promise<void> {
  const master = new Account(masterId, new JsonRpcProvider({ url: RPC }), new KeyPairSigner(KeyPair.fromString(privateKey as `ed25519:${string}`)));
  const call = (methodName: string, args: Record<string, unknown>) =>
    master.callFunction({ contractId, methodName, args, gas: GAS });

  console.log(`Allowlisting project ${masterId}…`);
  await call("set_project_allowlisted", { account_id: masterId, allowed: true });

  console.log("Proposing + co-signing the honest mandate…");
  const honestId = (await master.callFunction<string>({ contractId, methodName: "propose_mandate", args: { terms: terms("mm-honest") }, gas: GAS }));
  await call("cosign_mandate", { id: honestId });

  console.log("Proposing + co-signing the dumping mandate…");
  const dumpId = (await master.callFunction<string>({ contractId, methodName: "propose_mandate", args: { terms: terms("mm-dumping") }, gas: GAS }));
  await call("cosign_mandate", { id: dumpId });

  console.log("Scoring + submitting verdicts via the agent…");
  await runReplayOnAgent(honestId, "honest-mm");
  await runReplayOnAgent(dumpId, "dumping-mm");

  console.log("\nDone. View the mandates:");
  console.log(`  honest  → /mandate/${honestId}`);
  console.log(`  dumping → /mandate/${dumpId}`);
  console.log(`  directory → the ${masterId} profile`);
}

void main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
