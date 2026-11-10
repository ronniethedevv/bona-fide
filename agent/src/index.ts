/**
 * Bona Fide Shade Agent entry point.
 *
 * On start it registers the attested agent, publishes the enclave's X25519
 * public key (`set_enc_pubkey`), and serves a small HTTP surface (health, and —
 * in a later phase — key intake and the simulated key-check panel). The scoring
 * runner and verdict submission live in `runner.ts` / `submit.ts`.
 *
 * Built on the Shade Agent template (NearDeFi/shade-agent-template @ 816b75b)
 * via `@neardefi/shade-agent-js`. No keys or secrets are ever logged (I3).
 */
import { serve } from "@hono/node-server";
import { ShadeClient } from "@neardefi/shade-agent-js";
import { Hono } from "hono";
import { deriveEnclaveKeypair, publicKeyHex, type EnclaveKeypair } from "./keys/keypair.js";
import { getEnclaveSeed } from "./keys/seed.js";

const SUBMIT_GAS = BigInt("300000000000000");

const app = new Hono();
app.get("/", (c) => c.json({ service: "bona-fide-agent", status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok" }));

export { app };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/**
 * Register the attested agent and publish its enclave public key. Returns the
 * client and keypair so the runner can read mandates and submit verdicts.
 */
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

  // Register (local mode needs the account whitelisted first; TEE mode is direct).
  for (;;) {
    const whitelisted = await agent.isWhitelisted();
    if (whitelisted === null || whitelisted) {
      if (await agent.register()) break;
    }
    // eslint-disable-next-line no-console
    console.log("waiting to be whitelisted:", agent.accountId());
    await new Promise((r) => setTimeout(r, 10_000));
  }

  // Publish the enclave public key so browsers can seal keys to it.
  const keypair = await deriveEnclaveKeypair(await getEnclaveSeed());
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
