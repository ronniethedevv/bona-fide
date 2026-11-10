import { getSodium } from "./sodium.js";

export interface EnclaveKeypair {
  /** X25519 public key (32 bytes) — published on-chain for the browser to seal to. */
  readonly publicKey: Uint8Array;
  /** X25519 secret key (32 bytes) — never leaves the enclave, never logged. */
  readonly privateKey: Uint8Array;
}

/**
 * Derive the enclave's X25519 keypair deterministically from a 32-byte seed.
 *
 * In a TEE the seed comes from the dstack-provided key (see `seed.ts`), so the
 * published public key is stable across restarts (R2). Same seed → same keypair.
 */
export async function deriveEnclaveKeypair(seed: Uint8Array): Promise<EnclaveKeypair> {
  if (seed.length !== 32) {
    throw new Error("enclave seed must be exactly 32 bytes");
  }
  const sodium = await getSodium();
  const kp = sodium.crypto_box_seed_keypair(seed);
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** Hex of the public key, for publishing to the contract (`register_agent`). */
export async function publicKeyHex(kp: EnclaveKeypair): Promise<string> {
  const sodium = await getSodium();
  return sodium.to_hex(kp.publicKey);
}
