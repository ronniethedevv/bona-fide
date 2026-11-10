import type { ExchangeCredential } from "./intake.js";

/**
 * In-memory store of accepted credentials, keyed by mandate id. Credentials live
 * only in enclave memory and are never serialized, logged, or persisted to disk
 * in plaintext (invariant I3). The class deliberately has no toJSON / toString.
 */
export class KeyStore {
  readonly #creds = new Map<number, ExchangeCredential>();

  set(mandateId: number, cred: ExchangeCredential): void {
    this.#creds.set(mandateId, cred);
  }

  get(mandateId: number): ExchangeCredential | undefined {
    return this.#creds.get(mandateId);
  }

  has(mandateId: number): boolean {
    return this.#creds.has(mandateId);
  }

  /** Drop a credential (e.g. after rejection, revocation, or mandate end). */
  drop(mandateId: number): void {
    this.#creds.delete(mandateId);
  }

  get size(): number {
    return this.#creds.size;
  }
}
