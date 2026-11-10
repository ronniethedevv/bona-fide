import { z } from "zod";
import type { EnclaveKeypair } from "./keypair.js";
import { getSodium } from "./sodium.js";

/** The plaintext the browser seals to the enclave public key. */
export const KeyPayloadSchema = z.object({
  api_key: z.string().min(1),
  api_secret: z.string().min(1),
  mandate_id: z.number().int().nonnegative(),
});
export type KeyPayload = z.infer<typeof KeyPayloadSchema>;

/** A credential held only in enclave memory. */
export interface ExchangeCredential {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export type IntakeErrorCode = "INVALID" | "TRADE_ENABLED" | "WITHDRAW_ENABLED";

/** An error that carries a rejection code but never a secret. */
export class KeyIntakeError extends Error {
  constructor(public readonly code: IntakeErrorCode) {
    super(code);
    this.name = "KeyIntakeError";
  }
}

/**
 * Open a libsodium sealed box (anonymous sender) addressed to the enclave
 * keypair and validate the plaintext. Throws `KeyIntakeError("INVALID")` on any
 * decryption/parse failure — the message never contains key material.
 */
export async function openSealedKey(
  sealedBase64: string,
  keypair: EnclaveKeypair,
): Promise<KeyPayload> {
  const sodium = await getSodium();
  let openedBytes: Uint8Array | null = null;
  try {
    const cipher = sodium.from_base64(sealedBase64, sodium.base64_variants.ORIGINAL);
    openedBytes = sodium.crypto_box_seal_open(cipher, keypair.publicKey, keypair.privateKey);
  } catch {
    throw new KeyIntakeError("INVALID");
  }
  if (!openedBytes) {
    throw new KeyIntakeError("INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sodium.to_string(openedBytes));
  } catch {
    throw new KeyIntakeError("INVALID");
  }
  const result = KeyPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new KeyIntakeError("INVALID");
  }
  return result.data;
}
