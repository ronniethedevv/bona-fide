/**
 * Source of the 32-byte seed the enclave keypair is derived from.
 *
 * In the TEE the seed comes from the dstack-provided key (socket at
 * `/var/run/dstack.sock`), which is deterministic per app measurement, so the
 * enclave keypair — and the published public key — survive restarts (R2). For
 * local development and tests the seed is read from an env var instead.
 */
import { existsSync } from "node:fs";
import { DstackClient } from "@phala/dstack-sdk";

const DSTACK_SOCKET = "/var/run/dstack.sock";
const KEY_PATH = "bona-fide/enclave-x25519";

export async function getEnclaveSeed(env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  // Local/dev override takes precedence so tests never touch the socket.
  if (env.ENCLAVE_SEED_HEX) {
    const bytes = Buffer.from(env.ENCLAVE_SEED_HEX, "hex");
    if (bytes.length !== 32) {
      throw new Error("ENCLAVE_SEED_HEX must decode to exactly 32 bytes");
    }
    return new Uint8Array(bytes);
  }

  // Inside the TEE: derive a stable key from dstack.
  if (existsSync(DSTACK_SOCKET)) {
    const client = new DstackClient();
    const res = await client.getKey(KEY_PATH, "key-intake");
    return res.key.slice(0, 32);
  }

  throw new Error(
    "No enclave seed: set ENCLAVE_SEED_HEX (32-byte hex) for local dev, " +
      "or run inside the TEE where the dstack socket is available.",
  );
}
