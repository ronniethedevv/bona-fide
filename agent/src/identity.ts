/**
 * Identity binding (staged, post-v1). Lets the enclave attest that an MM's NEAR
 * account controls the committed exchange account — without ever revealing the
 * account's UID, and without publishing a cross-mandate-linkable identifier.
 *
 * Privacy model:
 *  - The on-chain `account_tag` is `HMAC(fpKey, "tag:<uid>:<mandateId>")` — a
 *    one-way commitment, salted per mandate, so two mandates on the same account
 *    produce unrelated tags (no public correlation) and the UID is never exposed.
 *  - `fpKey` is derived from the enclave's TEE seed, so only attested code can
 *    compute a tag; the UID can't be brute-forced out of a tag.
 *  - A *global* fingerprint (not salted per mandate) is used ONLY inside the
 *    enclave for de-duplication (one account can't back two MM identities). It
 *    never leaves the enclave, so no correlatable id is ever on-chain.
 */
import { createHmac } from "node:crypto";

/** Derive the HMAC key for fingerprints from the enclave seed (stays in-TEE). */
export function deriveFpKey(seed: Uint8Array): Buffer {
  return createHmac("sha256", Buffer.from(seed)).update("bona-fide/account-fp/v1").digest();
}

/** Per-mandate, salted commitment to the account UID — this is what goes on-chain. */
export function accountTag(fpKey: Buffer, uid: string, mandateId: number): string {
  return createHmac("sha256", fpKey).update(`tag:${uid}:${mandateId}`).digest("hex");
}

/** Global fingerprint for enclave-only de-duplication — never published. */
export function globalFingerprint(fpKey: Buffer, uid: string): string {
  return createHmac("sha256", fpKey).update(`global:${uid}`).digest("hex");
}

export type ClaimResult = "ok" | "conflict";

/**
 * Enclave-private registry mapping an account's global fingerprint to the MM
 * (NEAR account) that first bound it. Rejects a second, different MM claiming
 * the same account. In-memory for now; production seals it to the TEE so it
 * survives restarts (R2).
 */
export class AccountRegistry {
  readonly #byFp = new Map<string, string>();

  claim(globalFp: string, mm: string): ClaimResult {
    const existing = this.#byFp.get(globalFp);
    if (existing !== undefined && existing !== mm) return "conflict";
    this.#byFp.set(globalFp, mm);
    return "ok";
  }

  get size(): number {
    return this.#byFp.size;
  }
}
