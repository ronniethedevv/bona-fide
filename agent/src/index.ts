/**
 * Bona Fide Shade Agent — Phase 0 skeleton.
 *
 * This is a health-check server only. The real agent is built across Phases 2–3:
 *   keys/      enclave X25519 keypair (derived from the dstack-provided TEE key),
 *              sealed-box decryption of submitted keys        (P2.1)
 *   exchange/  read-only (GET-only) exchange client + permission check (P2.2, P2.3)
 *   sources/   live.ts and replay.ts behind one interface     (P2.4)
 *   scoring/   pure deterministic functions                   (P3.1)
 *   guards/    pre-sign checks                                 (P3.2)
 *   runner.ts  sampling loop and epoch close                  (P3.3)
 *   submit.ts  submit_verdict to the NEAR contract            (P3.4)
 *
 * Built on the Shade Agent template (NearDeFi/shade-agent-template @ 816b75b):
 * the agent identity and signing come from `@neardefi/shade-agent-js` ShadeClient.
 * No keys, secrets, or feature code live here yet.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ service: "bona-fide-agent", status: "ok", phase: 0 }));
app.get("/healthz", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? "3000");

// Only start listening when run directly (not when imported by tests).
if (process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line no-console
  console.log(`bona-fide-agent listening on :${port}`);
  serve({ fetch: app.fetch, port });
}

export { app };
