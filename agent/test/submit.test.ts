import { describe, expect, it, vi } from "vitest";
import type { VerdictInput } from "../src/contract.js";
import { shadeVerdictSink, submitVerdicts } from "../src/submit.js";
import type { VerdictSink } from "../src/runner.js";

function verdict(status: VerdictInput["status"]): VerdictInput {
  return {
    status,
    uptime_bps: 9500,
    median_spread_bps: 30,
    min_bid_depth_quote: "0",
    min_ask_depth_quote: "0",
    net_sells_base: "0",
    withdrawals_base: "0",
    coverage_bps: 10000,
    fail_reasons: [],
    terms_hash: "a".repeat(64),
    codehash: "deadbeef",
    data_source: "Replay",
  };
}

describe("submitVerdicts (P3.4)", () => {
  it("submits consecutive epochs from the offset, in order", async () => {
    const calls: Array<[number, number, string]> = [];
    const sink: VerdictSink = {
      submitVerdict: async (m, e, v) => {
        calls.push([m, e, v.status]);
      },
    };
    await submitVerdicts(sink, 7, [verdict("Pass"), verdict("Fail")], { fromEpoch: 3 });
    expect(calls).toEqual([
      [7, 3, "Pass"],
      [7, 4, "Fail"],
    ]);
  });
});

describe("shadeVerdictSink", () => {
  it("calls submit_verdict with a string mandate_id and the verdict", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    const sink = shadeVerdictSink({ call } as never);
    await sink.submitVerdict(42, 5, verdict("Pass"));
    expect(call).toHaveBeenCalledTimes(1);
    const arg = call.mock.calls[0]![0];
    expect(arg.methodName).toBe("submit_verdict");
    expect(arg.args.mandate_id).toBe("42");
    expect(arg.args.epoch).toBe(5);
    expect(arg.args.verdict.status).toBe("Pass");
  });
});
