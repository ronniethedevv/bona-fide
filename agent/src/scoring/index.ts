/**
 * Deterministic scoring — Phase 0 placeholder.
 *
 * The real scorer (P3.1) is a set of pure functions: plain data in, plain data
 * out, no I/O, no network, no keys, no AI. All arithmetic uses integers or
 * fixed-point decimal strings (decimal.js) — never floats (see architecture.md,
 * invariant I4). Nothing here decides a verdict yet.
 */

/** Marker for the scoring module version. Pure and deterministic by construction. */
export const SCORING_VERSION = "0.0.0-phase0" as const;
