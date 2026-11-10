/**
 * Deterministic scoring (P3.1). Pure functions only — plain data in, plain data
 * out, fixed-point decimal strings, no floats, no I/O, no AI (invariant I4).
 */
export { scoreEpoch, SPREAD_SENTINEL_BPS } from "./scorer.js";
export type { EpochScore, ScoreStatus, ScoringTerms } from "./types.js";

export const SCORING_VERSION = "1.0.0" as const;
