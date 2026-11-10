/**
 * Pre-sign guards (P3.2). Nothing is signed unless all pass (architecture.md).
 * Pure checks over already-fetched facts, so they are trivially testable; the
 * runner gathers the facts (contract reads) and calls this before submitting.
 */
import type { VerdictInput } from "../contract.js";

export interface GuardContext {
  /** Guard 1 — mandate exists, is Active, and terms_hash matches our copy. */
  mandateExists: boolean;
  mandateActive: boolean;
  termsHashMatches: boolean;
  /** Guard 2 — the epoch has closed and has no verdict yet. */
  epochClosed: boolean;
  verdictAlreadyExists: boolean;
  /** Guard 5 — the agent's codehash/measurements are still approved. */
  agentApproved: boolean;
  /** The verdict about to be signed (for guard 3 + 4). */
  verdict: VerdictInput;
}

export type GuardResult = { ok: true } | { ok: false; violations: string[] };

const MAX_BPS = 1_000_000;

function isNonNegativeIntString(s: string): boolean {
  return /^\d+$/.test(s);
}

/** Guard 3 — metric values are within sane ranges; no negative depth. */
function metricsInRange(v: VerdictInput): boolean {
  return (
    v.coverage_bps >= 0 &&
    v.coverage_bps <= 10_000 &&
    v.uptime_bps >= 0 &&
    v.uptime_bps <= 10_000 &&
    v.median_spread_bps >= 0 &&
    v.median_spread_bps <= MAX_BPS &&
    isNonNegativeIntString(v.min_bid_depth_quote) &&
    isNonNegativeIntString(v.min_ask_depth_quote) &&
    isNonNegativeIntString(v.net_sells_base) &&
    isNonNegativeIntString(v.withdrawals_base)
  );
}

export function runPreSignGuards(ctx: GuardContext): GuardResult {
  const violations: string[] = [];

  if (!ctx.mandateExists) violations.push("MANDATE_MISSING");
  if (!ctx.mandateActive) violations.push("MANDATE_NOT_ACTIVE");
  if (!ctx.termsHashMatches) violations.push("TERMS_HASH_MISMATCH");
  if (!ctx.epochClosed) violations.push("EPOCH_NOT_CLOSED");
  if (ctx.verdictAlreadyExists) violations.push("VERDICT_EXISTS");
  if (!metricsInRange(ctx.verdict)) violations.push("METRIC_OUT_OF_RANGE");
  if (ctx.verdict.data_source !== "Live" && ctx.verdict.data_source !== "Replay") {
    violations.push("DATA_SOURCE_UNRECORDED");
  }
  if (!ctx.agentApproved) violations.push("AGENT_NOT_APPROVED");

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
