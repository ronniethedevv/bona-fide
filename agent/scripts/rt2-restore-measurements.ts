/**
 * One-off repair for bona-fide-rt2.testnet (the live demo contract).
 *
 * On 2026-11-12, fix-measurements.ts was accidentally run against rt2 (stale
 * agent/.env): it removed rt2's all-zeros local-mode approved-measurements
 * entry and added a hybrid entry (TEE rtmrs + zero digest/compose). The
 * registered agent, mandates, and verdicts were untouched. This script
 * restores the original state: re-approve the zeros entry, remove the hybrid.
 *
 * Run from agent/ with the OLD rt2 env (owner = the rt2 contract owner):
 *   DOTENV_CONFIG_PATH=.env.rt2-backup npx tsx scripts/rt2-restore-measurements.ts
 */
import "dotenv/config";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";

const GAS = BigInt("300000000000000");
const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";
const CONTRACT = "bona-fide-rt2.testnet";

const ZEROS = {
  rtmrs: {
    mrtd: "0".repeat(96),
    rtmr0: "0".repeat(96),
    rtmr1: "0".repeat(96),
    rtmr2: "0".repeat(96),
  },
  key_provider_event_digest: "0".repeat(96),
  app_compose_hash_payload: "0".repeat(64),
};

/** The hybrid entry the mishap added: real TEE rtmrs, zero digest/compose. */
const HYBRID = {
  rtmrs: {
    mrtd: "7fe60787222bd394cb516abca2435f22f035ab2cc9c0a4b4b3b148e46297f3d931a237b72f359052c6e657d8c1409173",
    rtmr0: "68102e7b524af310f7b7d426ce75481e36c40f5d513a9009c046e9d37e31551f0134d954b496a3357fd61d03f07ffe96",
    rtmr1: "4ae609807c765916a31d724786ed74bcb97e168a9d937b04936aeef2015c907eba5ac352c6bcd749c246fd62ffb659ec",
    rtmr2: "764489f277a8540189761e72b4238ba36d4d647e11bd958d8ab5522af2a4867b0ff63e06b0c4967f1857236244040a5d",
  },
  key_provider_event_digest: "0".repeat(96),
  app_compose_hash_payload: "0".repeat(64),
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in the env file`);
  return v;
}

async function main(): Promise<void> {
  const signer = env("SPONSOR_ACCOUNT_ID");
  const master = new Account(
    signer,
    new JsonRpcProvider({ url: RPC }),
    new KeyPairSigner(KeyPair.fromString(env("SPONSOR_PRIVATE_KEY") as `ed25519:${string}`)),
  );
  console.log(`Restoring measurements on ${CONTRACT} as ${signer}…`);
  await master.callFunction({ contractId: CONTRACT, methodName: "approve_measurements", args: { measurements: ZEROS }, gas: GAS });
  console.log("Re-approved the all-zeros local-mode entry.");
  try {
    await master.callFunction({ contractId: CONTRACT, methodName: "remove_measurements", args: { measurements: HYBRID }, gas: GAS });
    console.log("Removed the hybrid entry.");
  } catch (e) {
    console.log("Hybrid entry already absent (fine):", e instanceof Error ? e.message.slice(0, 120) : e);
  }
  console.log("Done. rt2 is back to its original approved-measurements state.");
}

void main().catch((e) => {
  console.error("rt2 restore failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
