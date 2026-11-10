import type { MandateTerms } from "./types.js";

/**
 * Canonical JSON of the terms, in the exact field order the contract's
 * `MandateTerms` struct serializes (serde declaration order). JSON.stringify
 * preserves insertion order for string keys and emits no spaces, matching
 * serde_json, so `sha256(canonicalTerms(t))` equals the contract's terms_hash.
 */
export function canonicalTerms(t: MandateTerms): string {
  const ordered = {
    project: t.project,
    exchange: t.exchange,
    pair: t.pair,
    account_label: t.account_label,
    max_spread_bps: t.max_spread_bps,
    depth_band_bps: t.depth_band_bps,
    min_depth_per_side_quote: t.min_depth_per_side_quote,
    min_uptime_bps: t.min_uptime_bps,
    loan_cap_per_epoch_base: t.loan_cap_per_epoch_base,
    epoch_secs: t.epoch_secs,
    sample_secs: t.sample_secs,
    start_ts: t.start_ts,
    end_ts: t.end_ts,
  };
  return JSON.stringify(ordered);
}

/** sha256 hex of the canonical terms, matching the on-chain terms_hash. */
export async function termsHash(t: MandateTerms): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalTerms(t));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
