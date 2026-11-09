/**
 * Source of the 32-byte seed the enclave keypair is derived from.
 *
 * In production the seed comes from the dstack-provided TEE key (mounted at
 * `/var/run/dstack.sock`), which is deterministic per app measurement, so the
 * enclave keypair — and therefore the published public key — survives restarts
 * (R2). That integration is wired via `@neardefi/shade-agent-js` in the runner
 * (P3.3). For local development and tests the seed is read from an env var.
 */
export function getEnclaveSeed(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const hex = env.ENCLAVE_SEED_HEX;
  if (!hex) {
    throw new Error(
      "No enclave seed: set ENCLAVE_SEED_HEX (32-byte hex) for local dev, " +
        "or run inside the TEE where the dstack seed is provided.",
    );
  }
  const bytes = Buffer.from(hex, "hex");
  if (bytes.length !== 32) {
    throw new Error("ENCLAVE_SEED_HEX must decode to exactly 32 bytes");
  }
  return new Uint8Array(bytes);
}
