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

const SUBMIT_GAS = BigInt("300000000000000");

// Enclave-only state (never serialized/logged).
let enclaveKeypair: EnclaveKeypair | null = null;
let fpKey: Buffer | null = null; // HMAC key for account fingerprints (TEE-derived)
let agent: ShadeClient | null = null;
const keyStore = new KeyStore();
const registry = new AccountRegistry();
const exchange = new BinanceReadOnlyClient();

const IntakeBody = z.object({ mandate_id: z.number().int().nonnegative(), sealed: z.string().min(1) });

const app = new Hono();
app.use("/api/*", cors());
app.get("/", (c) => c.json({ service: "bona-fide-agent", status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok", keys: keyStore.size }));

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
  if (agent && fpKey) {
    try {
      const { uid } = await exchange.getAccount({ apiKey: payload.api_key, apiSecret: payload.api_secret });
      const uidStr = String(uid);
      const mandate = (await agent.view<Record<string, unknown>>({
        methodName: "get_mandate",
        args: { id: String(payload.mandate_id) },
      })) as { mm?: string } | null;
      if (mandate?.mm && registry.claim(globalFingerprint(fpKey, uidStr), mandate.mm) === "conflict") {
        return c.json({ accepted: false, reason: "ACCOUNT_CLAIMED" }); // another MM already bound this account
      }
      await agent.call({
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

/** Register the attested agent and publish its enclave public key. */
export async function bootstrap(): Promise<{ agent: ShadeClient; keypair: EnclaveKeypair }> {
  const client = await ShadeClient.create({
    networkId: (process.env.NEAR_NETWORK as "testnet" | "mainnet") ?? "testnet",
    agentContractId: requireEnv("AGENT_CONTRACT_ID"),
    sponsor: {
      accountId: requireEnv("SPONSOR_ACCOUNT_ID"),
      privateKey: requireEnv("SPONSOR_PRIVATE_KEY"),
    },
  });

  // eslint-disable-next-line no-console
  console.log("agent account:", client.accountId());
  if ((await client.balance()) < 0.2) await client.fund(0.3);

  for (;;) {
    const whitelisted = await client.isWhitelisted();
    if (whitelisted === null || whitelisted) {
      if (await client.register()) break;
    }
    // eslint-disable-next-line no-console
    console.log("waiting to be whitelisted:", client.accountId());
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const seed = await getEnclaveSeed();
  const keypair = await deriveEnclaveKeypair(seed);
  enclaveKeypair = keypair;
  fpKey = deriveFpKey(seed);
  agent = client;
  await client.call({
    methodName: "set_enc_pubkey",
    args: { enc_pubkey: await publicKeyHex(keypair) },
    gas: SUBMIT_GAS,
  });

  return { agent: client, keypair };
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
