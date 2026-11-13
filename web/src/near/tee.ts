/**
 * The TEE deployment's public attestation facts.
 *
 * These are not fetched from `CONTRACT_ID` (the app reads the demo deployment)
 * but from the hardware-attested one, so the landing page can show what the
 * enclave actually proved. Every value here is public and verifiable on-chain
 * or on the Phala dashboard; nothing secret lives in this file.
 *
 * Regenerate after a redeploy with:
 *   EVIDENCE_DIR=../evidence/live-tee CONTRACT_ID=<tee contract> npm run evidence
 * and copy the values out of evidence/live-tee/agents.json.
 */
export const TEE = {
  contractId: "bona-fide-tee1.testnet",
  /** The attested agent's NEAR account (implicit, derived in the enclave). */
  agentId: "ebc9289524e7ce19e8438e4a51bc00b8e60beb8b42f2e92ca91454716120e592",
  /** TDX measurement of the virtual firmware — the root of the code identity. */
  mrtd: "7fe60787222bd394cb516abca2435f22f035ab2cc9c0a4b4b3b148e46297f3d931a237b72f359052c6e657d8c1409173",
  /** The CPU platform the quote came from. */
  ppid: "62d54040cb9dfc08bb13006fa75ece56",
  hardware: "Intel TDX",
  runtime: "dstack 0.5.12 · Phala Cloud",
  /**
   * When the contract stops accepting this agent's quote. An attestation is a
   * statement about a moment, not a permanent badge: the contract expires one
   * after `attestation_expiration_time_ms` (7 days here) and the agent must
   * re-attest from inside the enclave to keep submitting. The verdicts it
   * already signed stay in the record either way — they were accepted while
   * the quote was valid, and the record is append-only.
   */
  validUntilMs: 1795111966844,
  explorer: "https://testnet.nearblocks.io/address/bona-fide-tee1.testnet",
} as const;

/** Whether the attested agent's quote is still accepted, as of now. */
export function attestationIsCurrent(now: number = Date.now()): boolean {
  return now < TEE.validUntilMs;
}

/** e.g. "19 Nov 2026" — the day the quote stops being accepted. */
export function validUntilLabel(): string {
  return new Date(TEE.validUntilMs).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** First and last n characters of a long hex id, e.g. 7fe60787…1409173. */
export function truncHex(hex: string, head = 8, tail = 7): string {
  return hex.length <= head + tail ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
