import _sodium from "libsodium-wrappers";

export interface KeyPayload {
  api_key: string;
  api_secret: string;
  mandate_id: number;
}

/**
 * Seal the exchange key to the enclave's X25519 public key, in the browser.
 * libsodium `crypto_box_seal` (anonymous sender) — only the enclave can open it.
 * The plaintext never leaves this function unencrypted.
 */
export async function sealKey(enclavePubkeyHex: string, payload: KeyPayload): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const pk = sodium.from_hex(enclavePubkeyHex);
  if (pk.length !== 32) throw new Error("enclave public key must be 32 bytes");
  const cipher = sodium.crypto_box_seal(sodium.from_string(JSON.stringify(payload)), pk);
  return sodium.to_base64(cipher, sodium.base64_variants.ORIGINAL);
}
