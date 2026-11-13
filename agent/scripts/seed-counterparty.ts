/**
 * Adds a mandate with a GENUINELY DISTINCT market maker and project.
 *
 * Why this exists: `propose_mandate` makes the caller the market maker and
 * takes the project from the terms, so one account can sit on both sides. Every
 * mandate seeded so far did exactly that (`seed.ts` signs everything as the
 * master account), which means the published record — honest Pass, dumping
 * Fail — has no independent counterparty anywhere in it. The web app now
 * discloses that, but disclosure is not the fix; a real counterparty is.
 *
 * This script therefore signs with TWO keys:
 *   - MM_*       proposes the mandate and becomes the market maker
 *   - SPONSOR_*  is the contract owner and the project, and co-signs it
 * The contract only accepts `cosign_mandate` from an allowlisted account that
 * the terms actually name as the project, so the co-signature is meaningful:
 * the MM could not have produced it.
 *
 * DRY RUN BY DEFAULT. It reads live state, prints every call it would make,
 * and broadcasts nothing until you pass `--send`.
 *
 *   cd agent
 *   npx tsx scripts/seed-counterparty.ts           # show the plan, change nothing
 *   npx tsx scripts/seed-counterparty.ts --send    # broadcast
 *
 * Env (agent/.env, as written by scripts/make-env.ts, plus two lines you add):
 *   AGENT_CONTRACT_ID, SPONSOR_ACCOUNT_ID, SPONSOR_PRIVATE_KEY   (owner/project)
 *   MM_ACCOUNT_ID, MM_PRIVATE_KEY                                (market maker)
 *
 * Idempotent: if a mandate already exists with this exact MM/project pair and
 * account label, it reports it and exits without proposing a second one.
 */
import "dotenv/config";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const GAS = BigInt("300000000000000");
const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";
const AGENT_URL = process.env.AGENT_URL ?? "";
const LABEL = process.env.MANDATE_LABEL ?? "mm-independent";
const SEND = process.argv.includes("--send");

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in agent/.env`);
  return v;
}

const contractId = env("AGENT_CONTRACT_ID");
const projectId = env("SPONSOR_ACCOUNT_ID");
const mmId = env("MM_ACCOUNT_ID");

const provider = new JsonRpcProvider({ url: RPC });

async function rpc<T>(params: Record<string, unknown>): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "seed", method: "query", params }),
  });
  const body = (await res.json()) as { result?: Record<string, unknown>; error?: unknown };
  const err = body.error ?? (body.result as { error?: unknown } | undefined)?.error;
  if (!body.result || err) throw new Error(JSON.stringify(err ?? res.status));
  return body.result as T;
}

async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const { result } = await rpc<{ result: number[] }>({
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result).toString("utf8")) as T;
}

interface Mandate {
  id: string;
  mm: string;
  project: string;
  account_label: string;
  status: string;
}

/** Balance in NEAR, two decimals, read live — nothing about cost is hardcoded. */
async function balanceNear(accountId: string): Promise<string> {
  try {
    const { amount } = await rpc<{ amount: string }>({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    return (Number(BigInt(amount) / BigInt("10000000000000000000000")) / 100).toFixed(2);
  } catch {
    return "does not exist";
  }
}

function terms(now: number) {
  return {
    project: projectId,
    exchange: "binance",
    pair: "TOKEN_USDT",
    account_label: LABEL,
    max_spread_bps: 100,
    depth_band_bps: 200,
    min_depth_per_side_quote: "10000000000",
    min_uptime_bps: 9000,
    loan_cap_per_epoch_base: "1000000",
    epoch_secs: 120,
    sample_secs: 30,
    start_ts: String(now),
    end_ts: String(now + 1200),
  };
}

async function main(): Promise<void> {
  if (mmId === projectId)
    throw new Error(
      `MM_ACCOUNT_ID and SPONSOR_ACCOUNT_ID are both ${mmId} — that is the very problem this script fixes. Point MM_ACCOUNT_ID at a different funded account.`,
    );

  console.log(`Contract   ${contractId}  via ${RPC}`);
  console.log(`Market maker  ${mmId}        ${await balanceNear(mmId)} NEAR`);
  console.log(`Project/owner ${projectId}  ${await balanceNear(projectId)} NEAR\n`);

  const info = await view<{ owner_id?: string }>("get_contract_info");
  if (info.owner_id && info.owner_id !== projectId)
    throw new Error(
      `SPONSOR_ACCOUNT_ID is ${projectId} but the contract owner is ${info.owner_id}. Only the owner can allowlist a project, so run this with the owner's key.`,
    );

  const mandates = await view<Mandate[]>("list_mandates", { from_index: 0, limit: 200 });
  const already = mandates.find((m) => m.mm === mmId && m.project === projectId && m.account_label === LABEL);
  if (already) {
    console.log(
      `Nothing to do: mandate ${already.id} already pairs ${mmId} with ${projectId} (${already.status}).`,
    );
    return;
  }
  console.log(`Existing mandates: ${mandates.length}`);
  for (const m of mandates)
    console.log(
      `  #${m.id}  mm=${m.mm}  project=${m.project}${m.mm === m.project ? "   <- same account, no counterparty" : ""}`,
    );

  const allowlisted = await view<boolean>("is_project_allowlisted", { account_id: projectId });
  console.log(`\n${projectId} allowlisted as a project: ${allowlisted}`);

  const plan: Array<[string, string, Record<string, unknown>]> = [];
  if (!allowlisted)
    plan.push([projectId, "set_project_allowlisted", { account_id: projectId, allowed: true }]);
  plan.push([mmId, "propose_mandate", { terms: terms(Math.floor(Date.now() / 1000)) }]);
  plan.push([projectId, "cosign_mandate", { id: "<the id propose_mandate returns>" }]);

  console.log("\nCalls to make:");
  for (const [signer, method, args] of plan)
    console.log(`  ${signer} → ${method}(${JSON.stringify(args).slice(0, 110)}…)`);

  if (!SEND) {
    console.log("\nDry run — nothing was broadcast. Re-run with --send to do it for real.");
    return;
  }

  const signerFor = (accountId: string, key: string) =>
    new Account(accountId, provider, new KeyPairSigner(KeyPair.fromString(key as `ed25519:${string}`)));
  const project = signerFor(projectId, env("SPONSOR_PRIVATE_KEY"));
  const mm = signerFor(mmId, env("MM_PRIVATE_KEY"));

  if (!allowlisted) {
    console.log(`\nAllowlisting ${projectId}…`);
    await project.callFunction({
      contractId,
      methodName: "set_project_allowlisted",
      args: { account_id: projectId, allowed: true },
      gas: GAS,
    });
  }

  console.log(`Proposing as ${mmId}…`);
  const id = await mm.callFunction<string>({
    contractId,
    methodName: "propose_mandate",
    args: { terms: terms(Math.floor(Date.now() / 1000)) },
    gas: GAS,
  });
  console.log(`  mandate ${id} proposed`);

  console.log(`Co-signing as ${projectId}…`);
  await project.callFunction({ contractId, methodName: "cosign_mandate", args: { id }, gas: GAS });

  const stored = await view<Mandate | null>("get_mandate", { id });
  console.log(
    `\nOn chain now: #${id}  mm=${stored?.mm}  project=${stored?.project}  status=${stored?.status}`,
  );
  console.log(`  https://testnet.nearblocks.io/address/${contractId}`);
  console.log(`  /mandate/${id}`);

  if (AGENT_URL) {
    console.log(`\nAsking the agent at ${AGENT_URL} to score it…`);
    const res = await fetch(`${AGENT_URL}/api/run-replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate_id: Number(id), fixture: process.env.FIXTURE ?? "honest-mm" }),
    });
    const body = (await res.json()) as { submitted?: number; statuses?: string[]; error?: string };
    if (!res.ok || body.error) throw new Error(`agent run-replay failed: ${body.error ?? res.status}`);
    console.log(`  ${body.submitted} verdict(s): ${body.statuses?.join(", ")}`);
  } else {
    console.log("\nNo verdicts yet: AGENT_URL is unset, so nothing was asked to score this.");
    console.log("Only the registered agent may submit verdicts, so start the enclave and then run:");
    console.log(`  AGENT_URL=<cvm url> FIXTURE=honest-mm npx tsx scripts/seed-counterparty.ts --send`);
    console.log("(the mandate already exists, so that run only scores it)");
  }
  console.log("\nRe-capture the evidence bundle afterwards: npm run evidence");
}

void main().catch((e) => {
  console.error("\nseed-counterparty failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
