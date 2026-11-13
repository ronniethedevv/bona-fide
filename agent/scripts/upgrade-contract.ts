/**
 * Upgrade a deployed BonaFide contract in place, preserving the record.
 *
 * `update_contract` takes RAW bytes — 8 bytes of gas (u64 LE) followed by the
 * wasm — not JSON, so this builds the transaction by hand. The contract then
 * deploys the code and calls `migrate` in the same transaction.
 *
 * Why an upgrade and not a fresh deployment: the live contract holds the demo
 * record (mandates, verdicts, summaries, the agent registration). Redeploying
 * elsewhere would abandon it. The migration rewrites every mandate into the
 * current layout and leaves everything else untouched.
 *
 * DRY RUN BY DEFAULT:
 *   cd agent
 *   npx tsx scripts/upgrade-contract.ts                     # inspect, change nothing
 *   npx tsx scripts/upgrade-contract.ts --send              # deploy + migrate
 *   npx tsx scripts/upgrade-contract.ts --wasm path/to.wasm # non-default binary
 *
 * Env: AGENT_CONTRACT_ID, SPONSOR_ACCOUNT_ID, SPONSOR_PRIVATE_KEY (must be the
 * contract owner — `update_contract` is owner-only).
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";

const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";
/** Total gas for the transaction, and the slice handed to `migrate`. */
const TOTAL_GAS = BigInt("300000000000000"); // 300 TGas
const MIGRATE_TGAS = BigInt(process.env.MIGRATE_TGAS ?? "100");
const SEND = process.argv.includes("--send");
const wasmFlag = process.argv.indexOf("--wasm");
const wasmArg = wasmFlag === -1 ? undefined : process.argv[wasmFlag + 1];
const DEFAULT_WASM = "../contract/out/bona_fide_contract.wasm";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in agent/.env`);
  return v;
}

const contractId = env("AGENT_CONTRACT_ID");
const ownerId = env("SPONSOR_ACCOUNT_ID");

async function rpc<T>(params: Record<string, unknown>): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "upgrade", method: "query", params }),
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

interface Mandate { id: string; mm: string; status: string; account_verified?: boolean }

const near = (yocto: string | bigint) => (Number(BigInt(yocto) / BigInt("10000000000000000000000")) / 100).toFixed(2);

/** Read the whole record so it can be compared before and after. */
async function snapshot(): Promise<{ mandates: Mandate[]; verdicts: number[]; agents: number }> {
  const mandates = await view<Mandate[]>("list_mandates", { from_index: 0, limit: 200 });
  const verdicts: number[] = [];
  for (const m of mandates)
    verdicts.push((await view<unknown[]>("get_verdicts", { id: m.id, from_epoch: 0, limit: 200 })).length);
  const agents = (await view<unknown[]>("get_agents", {})).length;
  return { mandates, verdicts, agents };
}

async function main(): Promise<void> {
  const wasmPath = path.resolve(process.cwd(), wasmArg ?? DEFAULT_WASM);
  if (!existsSync(wasmPath))
    throw new Error(`No wasm at ${wasmPath}. Pass --wasm <path>, or see contract/out/README.md for how to build one.`);
  const code = readFileSync(wasmPath);
  const codeSha = createHash("sha256").update(code).digest("hex");

  const info = await view<{ owner_id: string }>("get_contract_info");
  const account = await rpc<{ amount: string; storage_usage: number; code_hash: string }>({
    request_type: "view_account",
    finality: "final",
    account_id: contractId,
  });

  console.log(`Contract   ${contractId}`);
  console.log(`Owner      ${info.owner_id}   (signing as ${ownerId})`);
  console.log(`Balance    ${near(account.amount)} NEAR`);
  console.log(`New wasm   ${wasmPath}`);
  console.log(`           ${code.length} bytes, sha256 ${codeSha}`);

  if (info.owner_id !== ownerId)
    throw new Error(`update_contract is owner-only: the owner is ${info.owner_id}, not ${ownerId}.`);

  // Storage is staked at 1e19 yocto per byte. Deploying bigger code than the
  // account can stake fails the whole transaction, so check before spending gas.
  const storageDelta = BigInt(code.length - account.storage_usage) * BigInt("10000000000000000000");
  if (storageDelta > 0n) {
    console.log(`Storage    +${near(storageDelta)} NEAR to stake (code grows by ${code.length - account.storage_usage} bytes)`);
    if (BigInt(account.amount) < storageDelta * 2n)
      throw new Error(`${contractId} needs more balance to stake the larger code. Fund it, then re-run.`);
  } else {
    console.log(`Storage    code shrinks by ${account.storage_usage - code.length} bytes — no extra stake needed`);
  }

  const before = await snapshot();
  console.log(`\nRecord now: ${before.mandates.length} mandate(s), ${before.verdicts.reduce((a, b) => a + b, 0)} verdict(s), ${before.agents} agent(s)`);

  // The migration reads every mandate as the OLD layout, so it must not run on
  // a contract that already carries the new fields — that would read past them
  // and silently drop the bindings. The contract cannot detect this itself
  // (both layouts share a map header), so the check lives here.
  const alreadyMigrated = before.mandates.some((m) => m.account_verified !== undefined);
  if (alreadyMigrated)
    throw new Error(
      "This contract already returns `account_verified` — it has been migrated.\n" +
        "  Re-running the migration would read the new fields as old bytes and lose the bindings.\n" +
        "  To deploy different code to an already-migrated contract, use a build whose migrate() is a no-op.",
    );
  for (const m of before.mandates) console.log(`  #${m.id} ${m.mm} ${m.status}`);

  if (!SEND) {
    console.log(`\nWould call update_contract on ${contractId}: deploy ${code.length} bytes, then migrate with ${MIGRATE_TGAS} TGas.`);
    console.log("Dry run — nothing was broadcast. Re-run with --send to do it for real.");
    return;
  }

  // Raw input: 8-byte little-endian gas for the chained migrate(), then the wasm.
  const gasPrefix = Buffer.alloc(8);
  gasPrefix.writeBigUInt64LE(MIGRATE_TGAS);
  const args = new Uint8Array(Buffer.concat([gasPrefix, code]));

  const owner = new Account(
    ownerId,
    new JsonRpcProvider({ url: RPC }),
    new KeyPairSigner(KeyPair.fromString(env("SPONSOR_PRIVATE_KEY") as `ed25519:${string}`)),
  );

  console.log("\nDeploying + migrating… (one transaction; this can take a minute)");
  const outcome = await owner.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall("update_contract", args, TOTAL_GAS, BigInt(0))],
  });
  console.log(`  tx ${outcome.transaction.hash}`);
  console.log(`  https://testnet.nearblocks.io/txns/${outcome.transaction.hash}`);

  const after = await snapshot();
  const verdictsBefore = before.verdicts.reduce((a, b) => a + b, 0);
  const verdictsAfter = after.verdicts.reduce((a, b) => a + b, 0);
  console.log(`\nRecord after: ${after.mandates.length} mandate(s), ${verdictsAfter} verdict(s), ${after.agents} agent(s)`);
  for (const m of after.mandates) console.log(`  #${m.id} ${m.mm} ${m.status} account_verified=${m.account_verified}`);

  const ok =
    after.mandates.length === before.mandates.length &&
    verdictsAfter === verdictsBefore &&
    after.agents === before.agents &&
    after.mandates.every((m) => m.account_verified === false);
  if (!ok) {
    console.error("\nThe record does NOT match what was there before. Do not proceed; capture this output.");
    process.exit(1);
  }
  console.log("\nMigrated. Every mandate and verdict survived, and identity binding is now live:");
  console.log("  an attested agent can call attest_account_binding, and the app will show a verified mandate.");
  console.log("\nRe-capture the evidence bundle: CONTRACT_ID=" + contractId + " npm run evidence");
}

void main().catch((e) => {
  console.error("\nupgrade-contract failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
