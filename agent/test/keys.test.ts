import { describe, expect, it } from "vitest";
import { deriveEnclaveKeypair, publicKeyHex } from "../src/keys/keypair.js";
import { KeyIntakeError, openSealedKey, type KeyPayload } from "../src/keys/intake.js";
import { KeyStore } from "../src/keys/store.js";
import { getSodium } from "../src/keys/sodium.js";
import { BinanceReadOnlyClient, type Transport } from "../src/exchange/binance.js";

const CANARY_KEY = "CANARY_APIKEY_7f3a9c21b5e04d8f";
const CANARY_SECRET = "CANARY_SECRET_d41d8cd98f00b204e9800998ecf8427e";

async function sealTo(publicKey: Uint8Array, payload: KeyPayload): Promise<string> {
  const sodium = await getSodium();
  const cipher = sodium.crypto_box_seal(sodium.from_string(JSON.stringify(payload)), publicKey);
  return sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL);
}

describe("enclave keypair", () => {
  it("is deterministic for a given seed", async () => {
    const seed = new Uint8Array(32).fill(7);
    const a = await deriveEnclaveKeypair(seed);
    const b = await deriveEnclaveKeypair(seed);
    expect(await publicKeyHex(a)).toBe(await publicKeyHex(b));
    expect((await publicKeyHex(a)).length).toBe(64);
  });

  it("rejects a non-32-byte seed", async () => {
    await expect(deriveEnclaveKeypair(new Uint8Array(16))).rejects.toThrow();
  });
});

describe("sealed-box intake", () => {
  it("round-trips a sealed payload", async () => {
    const kp = await deriveEnclaveKeypair(new Uint8Array(32).fill(3));
    const payload: KeyPayload = { api_key: CANARY_KEY, api_secret: CANARY_SECRET, mandate_id: 5 };
    const opened = await openSealedKey(await sealTo(kp.publicKey, payload), kp);
    expect(opened).toEqual(payload);
  });

  it("rejects garbage ciphertext as INVALID", async () => {
    const kp = await deriveEnclaveKeypair(new Uint8Array(32).fill(9));
    await expect(openSealedKey("!!!not-base64!!!", kp)).rejects.toBeInstanceOf(KeyIntakeError);
  });

  it("rejects a payload sealed to a different key", async () => {
    const kp = await deriveEnclaveKeypair(new Uint8Array(32).fill(1));
    const other = await deriveEnclaveKeypair(new Uint8Array(32).fill(2));
    const sealed = await sealTo(other.publicKey, {
      api_key: CANARY_KEY,
      api_secret: CANARY_SECRET,
      mandate_id: 1,
    });
    await expect(openSealedKey(sealed, kp)).rejects.toBeInstanceOf(KeyIntakeError);
  });
});

// Invariant I3: no key or secret appears in logs, errors, or stored summaries.
describe("I3 — canary never leaks", () => {
  it("keeps the secret out of logs, errors and serialization", async () => {
    const kp = await deriveEnclaveKeypair(new Uint8Array(32).fill(42));
    const payload = await openSealedKey(
      await sealTo(kp.publicKey, { api_key: CANARY_KEY, api_secret: CANARY_SECRET, mandate_id: 2 }),
      kp,
    );

    const store = new KeyStore();
    store.set(payload.mandate_id, { apiKey: payload.api_key, apiSecret: payload.api_secret });

    // Capture everything written to the console while we exercise an error path.
    const logs: string[] = [];
    const original = { log: console.log, error: console.error, warn: console.warn };
    for (const k of ["log", "error", "warn"] as const) {
      console[k] = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    }

    let thrownString = "";
    try {
      const failing: Transport = async () => ({ status: 401, body: '{"code":-2015,"msg":"Invalid API-key"}' });
      const client = new BinanceReadOnlyClient({ transport: failing, now: () => 1 });
      try {
        await client.getApiRestrictions({ apiKey: payload.api_key, apiSecret: payload.api_secret });
      } catch (err) {
        // A real agent would log the error — make sure doing so leaks nothing.
        console.error("verdict run failed:", err);
        thrownString = String(err) + ((err as Error).stack ?? "");
      }
    } finally {
      Object.assign(console, original);
    }

    const haystack = [...logs, thrownString, JSON.stringify(store), String(store)].join("\n");
    expect(haystack).not.toContain(CANARY_SECRET);
    expect(haystack).not.toContain(CANARY_KEY);
    // Sanity: the credential really is retrievable in memory.
    expect(store.get(2)?.apiSecret).toBe(CANARY_SECRET);
  });
});
