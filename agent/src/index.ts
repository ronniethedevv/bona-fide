/**
 * Bona Fide Shade Agent entry point.
 *
 * On start it registers the attested agent, publishes the enclave's X25519
 * public key (`set_enc_pubkey`), and serves HTTP: health + the key-intake
 * endpoint (`POST /api/intake`), which opens a sealed key, runs the read-only
 * permission check, and either holds it in enclave memory or returns a rejection
 * code. Scoring + submission live in `runner.ts` / `submit.ts`.
 *
 * Built on the Shade Agent template via `@neardefi/shade-agent-js`. No keys or
 * secrets are ever logged (I3).
 */
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") dotenv.config();
import { serve } from "@hono/node-server";
import { ShadeClient } from "@neardefi/shade-agent-js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { BinanceReadOnlyClient } from "./exchange/binance.js";
import { verifyKeyReadOnly } from "./exchange/verify.js";
import { AccountRegistry, accountTag, deriveFpKey, globalFingerprint } from "./identity.js";
import { KeyIntakeError, openSealedKey } from "./keys/intake.js";
import { deriveEnclaveKeypair, publicKeyHex, type EnclaveKeypair } from "./keys/keypair.js";
import { getEnclaveSeed } from "./keys/seed.js";
import { KeyStore } from "./keys/store.js";
import { scoringTerms, type MandateView } from "./contract.js";
import { runReplay } from "./runner.js";
import { ReplaySource, loadReplayFixture } from "./sources/replay.js";
import { shadeVerdictSink, submitVerdicts } from "./submit.js";

const SUBMIT_GAS = BigInt("300000000000000");

// Enclave-only state (never serialized/logged).
let enclaveKeypair: EnclaveKeypair | null = null;
let agentClient: ShadeClient | null = null;
let fpKey: Buffer | null = null; // HMAC key for account fingerprints (TEE-derived)
const keyStore = new KeyStore();
const registry = new AccountRegistry();
const exchange = new BinanceReadOnlyClient();

const IntakeBody = z.object({ mandate_id: z.number().int().nonnegative(), sealed: z.string().min(1) });

const app = new Hono();
app.use("/api/*", cors());
app.get("/", (c) => c.json({ service: "bona-fide-agent", status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok", keys: keyStore.size }));

const RunReplayBody = z.object({ mandate_id: z.number().int().nonnegative(), fixture: z.string().min(1) });

/**
 * Demo seeding (SEED_ENABLED=true): score a replay fixture against an existing
 * Active mandate and submit the verdicts on-chain. Only the registered agent can
 * submit (the contract enforces it), and it only reads bundled fixtures, so this
 * is the real runner path wired to a chosen fixture. Off unless explicitly enabled.
 */
app.post("/api/run-replay", async (c) => {
  if (process.env.SEED_ENABLED !== "true") return c.json({ error: "seeding disabled" }, 403);
  if (!agentClient) return c.json({ error: "agent not ready" }, 503);
  let body: z.infer<typeof RunReplayBody>;
  try {
    body = RunReplayBody.parse(await c.req.json());
  } catch {
    return c.json({ error: "invalid body" }, 400);
  }
  const mandate = (await agentClient.view<Record<string, unknown>>({
    methodName: "get_mandate",
    args: { id: String(body.mandate_id) },
  })) as unknown as MandateView | null;
  if (!mandate) return c.json({ error: "mandate not found" }, 404);

  const source = new ReplaySource(await loadReplayFixture(body.fixture));
  const verdicts = await runReplay(source, scoringTerms(mandate), {
    termsHash: mandate.terms_hash,
    codehash: "replay-local",
  });
  await submitVerdicts(shadeVerdictSink(agentClient), body.mandate_id, verdicts);
  return c.json({ submitted: verdicts.length, statuses: verdicts.map((v) => v.status) });
});

/** Receive a browser-sealed key, verify it is read-only, and hold or reject it. */
app.post("/api/intake", async (c) => {
  if (!enclaveKeypair) return c.json({ accepted: false, reason: "UNAVAILABLE" }, 503);

  let body: z.infer<typeof IntakeBody>;
  try {
    body = IntakeBody.parse(await c.req.json());
  } catch {
    return c.json({ accepted: false, reason: "INVALID" }, 400);
  }

  let payload;
  try {
    payload = await openSealedKey(body.sealed, enclaveKeypair);
  } catch (e) {
    return c.json({ accepted: false, reason: e instanceof KeyIntakeError ? e.code : "INVALID" });
  }

  const check = await verifyKeyReadOnly(exchange, {
    apiKey: payload.api_key,
    apiSecret: payload.api_secret,
  });
  if (!check.ok) {
    return c.json({ accepted: false, reason: check.reason }); // rejected key is dropped (never stored)
  }

  // Identity binding (best-effort): prove the MM controls this exchange account,
  // de-dupe against other MM identities, and attest a privacy-preserving tag.
  let verified = false;
  if (agentClient && fpKey) {
    try {
      const { uid } = await exchange.getAccount({ apiKey: payload.api_key, apiSecret: payload.api_secret });
      const uidStr = String(uid);
      const mandate = (await agentClient.view<Record<string, unknown>>({
        methodName: "get_mandate",
        args: { id: String(payload.mandate_id) },
      })) as { mm?: string } | null;
      if (mandate?.mm && registry.claim(globalFingerprint(fpKey, uidStr), mandate.mm) === "conflict") {
        return c.json({ accepted: false, reason: "ACCOUNT_CLAIMED" }); // another MM already bound this account
      }
      await agentClient.call({
        methodName: "attest_account_binding",
        args: { mandate_id: String(payload.mandate_id), account_tag: accountTag(fpKey, uidStr, payload.mandate_id) },
        gas: SUBMIT_GAS,
      });
      verified = true;
    } catch {
      verified = false; // binding is an enhancement; a verified read-only key is still held
    }
  }

  keyStore.set(payload.mandate_id, { apiKey: payload.api_key, apiSecret: payload.api_secret });
  return c.json({ accepted: true, verified });
});

export { app };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** True for errors worth retrying: RPC timeouts, resets, DNS blips, gateway errors. */
function isTransientRpcError(e: unknown): boolean {
  const msg = String((e as { message?: unknown })?.message ?? e);
  return /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|timed? ?out|50[234]/i.test(
    msg,
  );
}

/** Retry an RPC-backed call through transient network failures with a fixed backoff. */
async function withRpcRetry<T>(label: string, fn: () => Promise<T>, attempts = 40, delayMs = 5_000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientRpcError(e) || attempt >= attempts) throw e;
      // eslint-disable-next-line no-console
      console.log(`${label}: transient RPC error (attempt ${attempt}/${attempts}), retrying in ${delayMs / 1000}s`);
      await sleep(delayMs);
    }
  }
}

/** Register the attested agent and publish its enclave public key. */
export async function bootstrap(): Promise<{ agent: ShadeClient; keypair: EnclaveKeypair }> {
  // In local (non-TEE) mode the library derives a RANDOM agent account on every
  // start unless a derivationPath is set — which would orphan the previous
  // whitelist on each restart. Pin it so the account is stable across restarts.
  // In TEE mode the enclave-derived key is used and this path is ignored.
  const derivationPath =
    process.env.AGENT_DERIVATION_PATH ?? process.env.ENCLAVE_SEED_HEX ?? "bona-fide-local-agent";

  const agent = await withRpcRetry("ShadeClient.create", () =>
    ShadeClient.create({
      networkId: (process.env.NEAR_NETWORK as "testnet" | "mainnet") ?? "testnet",
      agentContractId: requireEnv("AGENT_CONTRACT_ID"),
      derivationPath,
      // numKeys must be >= 2 in deterministic (derivationPath) mode: with
      // numKeys=1 the library derives zero additional keys and its
      // `[].every(...) === true` makes the "all random" flag disagree with the
      // deterministically-derived first key, throwing in register(). Two keys
      // derives one real additional key so the flags agree (and lets the agent
      // rotate keys across concurrent submissions).
      numKeys: Number(process.env.AGENT_NUM_KEYS ?? "2"),
      sponsor: {
        accountId: requireEnv("SPONSOR_ACCOUNT_ID"),
        privateKey: requireEnv("SPONSOR_PRIVATE_KEY"),
      },
    }),
  );

  // eslint-disable-next-line no-console
  console.log("agent account:", agent.accountId());
  // First-time register also adds an access key and attaches a deposit, costing
  // ~0.31 NEAR, so keep the floor (and the top-up) comfortably above that or the
  // very first register() fails with NotEnoughBalance.
  const MIN_AGENT_BALANCE = Number(process.env.AGENT_MIN_BALANCE ?? "0.5");
  const AGENT_TOPUP = Number(process.env.AGENT_TOPUP ?? "0.5");
  if ((await withRpcRetry("balance", () => agent.balance())) < MIN_AGENT_BALANCE) {
    await withRpcRetry("fund", () => agent.fund(AGENT_TOPUP));
  }

  // The contract requires the register deposit to cover the agent record's
  // storage (STORAGE_BYTES_TO_REGISTER = 600 bytes = 0.006 NEAR). The library's
  // 0.005 default is too low, so attach 0.01 NEAR (matches the contract tests).
  const registerDeposit = process.env.AGENT_REGISTER_DEPOSIT_YOCTO ?? "10000000000000000000000";

  for (;;) {
    try {
      const whitelisted = await agent.isWhitelisted();
      if (whitelisted === null || whitelisted) {
        if (await agent.register({ deposit: registerDeposit })) break;
      }
    } catch (e) {
      if (!isTransientRpcError(e)) throw e;
      // eslint-disable-next-line no-console
      console.log("whitelist/register: transient RPC error, will retry");
    }
    // eslint-disable-next-line no-console
    console.log("waiting to be whitelisted:", agent.accountId());
    await sleep(10_000);
  }

  const seed = await getEnclaveSeed();
  const keypair = await deriveEnclaveKeypair(seed);
  enclaveKeypair = keypair;
  agentClient = agent;
  fpKey = deriveFpKey(seed);
  const encPubkey = await publicKeyHex(keypair);
  await withRpcRetry("set_enc_pubkey", () =>
    agent.call({
      methodName: "set_enc_pubkey",
      args: { enc_pubkey: encPubkey },
      gas: SUBMIT_GAS,
    }),
  );

  return { agent, keypair };
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? "3000");
  bootstrap()
    .then(() => {
      serve({ fetch: app.fetch, port });
      // eslint-disable-next-line no-console
      console.log(`bona-fide-agent listening on :${port}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("agent bootstrap failed:", err);
      process.exit(1);
    });
}
