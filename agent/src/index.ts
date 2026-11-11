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
const keyStore = new KeyStore();
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

  keyStore.set(payload.mandate_id, { apiKey: payload.api_key, apiSecret: payload.api_secret });
  return c.json({ accepted: true });
});

export { app };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/** Register the attested agent and publish its enclave public key. */
export async function bootstrap(): Promise<{ agent: ShadeClient; keypair: EnclaveKeypair }> {
  const agent = await ShadeClient.create({
    networkId: (process.env.NEAR_NETWORK as "testnet" | "mainnet") ?? "testnet",
    agentContractId: requireEnv("AGENT_CONTRACT_ID"),
    sponsor: {
      accountId: requireEnv("SPONSOR_ACCOUNT_ID"),
      privateKey: requireEnv("SPONSOR_PRIVATE_KEY"),
    },
  });

  // eslint-disable-next-line no-console
  console.log("agent account:", agent.accountId());
  if ((await agent.balance()) < 0.2) await agent.fund(0.3);

  for (;;) {
    const whitelisted = await agent.isWhitelisted();
    if (whitelisted === null || whitelisted) {
      if (await agent.register()) break;
    }
    // eslint-disable-next-line no-console
    console.log("waiting to be whitelisted:", agent.accountId());
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const keypair = await deriveEnclaveKeypair(await getEnclaveSeed());
  enclaveKeypair = keypair;
  agentClient = agent;
  await agent.call({
    methodName: "set_enc_pubkey",
    args: { enc_pubkey: await publicKeyHex(keypair) },
    gas: SUBMIT_GAS,
  });

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
