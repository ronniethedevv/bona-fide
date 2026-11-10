import { describe, expect, it } from "vitest";
import type { VerdictInput } from "../src/contract.js";
import { runPreSignGuards, type GuardContext } from "../src/guards/index.js";

const GOOD_VERDICT: VerdictInput = {
  status: "Pass",
  uptime_bps: 9500,
  median_spread_bps: 30,
  min_bid_depth_quote: "12000000000",
  min_ask_depth_quote: "12000000000",
  net_sells_base: "50000",
  withdrawals_base: "0",
  coverage_bps: 10000,
  fail_reasons: [],
  terms_hash: "a".repeat(64),
  codehash: "deadbeef",
  data_source: "Replay",
};

const GOOD_FACTS: Omit<GuardContext, "verdict"> = {
  mandateExists: true,
  mandateActive: true,
  termsHashMatches: true,
  epochClosed: true,
  verdictAlreadyExists: false,
  agentApproved: true,
};

describe("runPreSignGuards (P3.2)", () => {
  it("passes when every fact is good", () => {
    expect(runPreSignGuards({ ...GOOD_FACTS, verdict: GOOD_VERDICT })).toEqual({ ok: true });
  });

  it.each([
    [{ mandateExists: false }, "MANDATE_MISSING"],
    [{ mandateActive: false }, "MANDATE_NOT_ACTIVE"],
    [{ termsHashMatches: false }, "TERMS_HASH_MISMATCH"],
    [{ epochClosed: false }, "EPOCH_NOT_CLOSED"],
    [{ verdictAlreadyExists: true }, "VERDICT_EXISTS"],
    [{ agentApproved: false }, "AGENT_NOT_APPROVED"],
  ])("flags %o as %s", (patch, code) => {
    const result = runPreSignGuards({ ...GOOD_FACTS, ...patch, verdict: GOOD_VERDICT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain(code);
  });

  it("rejects out-of-range or negative metrics", () => {
    const bad: VerdictInput = { ...GOOD_VERDICT, min_bid_depth_quote: "-5", median_spread_bps: 2_000_000 };
    const result = runPreSignGuards({ ...GOOD_FACTS, verdict: bad });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("METRIC_OUT_OF_RANGE");
  });

  it("rejects an unrecorded data source", () => {
    const bad = { ...GOOD_VERDICT, data_source: "Guess" as unknown as "Live" };
    const result = runPreSignGuards({ ...GOOD_FACTS, verdict: bad });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("DATA_SOURCE_UNRECORDED");
  });
});
