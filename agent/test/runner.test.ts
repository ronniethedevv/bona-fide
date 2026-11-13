import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { VerdictInput } from "../src/contract.js";
import {
  GuardRejection,
  guardedSubmit,
  runReplay,
  sampleEpochLive,
  type GuardFacts,
  type VerdictSink,
} from "../src/runner.js";
import type { ScoringTerms } from "../src/scoring/types.js";
import { loadReplayFixture, ReplaySource } from "../src/sources/replay.js";
import { SourceAuthError } from "../src/sources/types.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/replay", import.meta.url));

const TERMS: ScoringTerms = {
  maxSpreadBps: 100,
  depthBandBps: 200,
  minDepthPerSideQuote: "10000000000",
  minUptimeBps: 9000,
  loanCapPerEpochBase: "1000000",
  epochSecs: 120,
  sampleSecs: 30,
};

const META = { termsHash: "a".repeat(64), codehash: "deadbeef" };

async function source(name: string): Promise<ReplaySource> {
  return new ReplaySource(await loadReplayFixture(name, FIXTURES_DIR));
}

describe("runReplay (P3.3)", () => {
  it("passes honest, fails dumping, flags outage — all labelled Replay", async () => {
    const [honest] = await runReplay(await source("honest-mm"), TERMS, META);
    expect(honest!.status).toBe("Pass");
    expect(honest!.data_source).toBe("Replay");

    const [dump] = await runReplay(await source("dumping-mm"), TERMS, META);
    expect(dump!.status).toBe("Fail");
    expect(dump!.fail_reasons).toContain("LOAN_CAP");

    const [outage] = await runReplay(await source("outage"), TERMS, META);
    expect(outage!.status).toBe("Outage");
  });

  it("records a revoked key as KEY_REVOKED for that epoch", async () => {
    const verdicts = await runReplay(await source("key-revoked"), TERMS, META);
    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]!.status).toBe("Pass");
    expect(verdicts[1]!.status).toBe("Fail");
    expect(verdicts[1]!.fail_reasons).toEqual(["KEY_REVOKED"]);
  });
});

describe("sampleEpochLive (P3.3)", () => {
  const window = { startTime: 0, endTime: 1 };
  const okSample = {
    publicBestBid: "1.00",
    publicBestAsk: "1.02",
    mmBids: [{ price: "0.99", size: "20000" }],
    mmAsks: [{ price: "1.03", size: "20000" }],
  };

  it("collects N samples sampleSecs apart then reads trades/withdrawals", async () => {
    const market = {
      dataSource: () => "Live" as const,
      fetchSample: vi.fn().mockResolvedValue(okSample),
      fetchTrades: vi.fn().mockResolvedValue([{ side: "sell", baseQty: "0.1" }]),
      fetchWithdrawals: vi.fn().mockResolvedValue([]),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    const data = await sampleEpochLive(
      market as never,
      { expectedSamples: 3, sampleSecs: 30, window },
      { sleep },
    );
    expect(data.samples).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2); // no sleep after the last sample
    expect(data.trades).toHaveLength(1);
    expect(data.serverErrors).toBeUndefined();
  });

  it("flags serverErrors and drops a sample on a non-auth failure", async () => {
    const market = {
      dataSource: () => "Live" as const,
      fetchSample: vi
        .fn()
        .mockResolvedValueOnce(okSample)
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValueOnce(okSample),
      fetchTrades: vi.fn().mockResolvedValue([]),
      fetchWithdrawals: vi.fn().mockResolvedValue([]),
    };
    const data = await sampleEpochLive(
      market as never,
      { expectedSamples: 3, sampleSecs: 1, window },
      {
        sleep: async () => {},
      },
    );
    expect(data.samples).toHaveLength(2);
    expect(data.serverErrors).toBe(true);
  });

  it("aborts the epoch when the key is revoked", async () => {
    const market = {
      dataSource: () => "Live" as const,
      fetchSample: vi.fn().mockRejectedValue(new SourceAuthError()),
      fetchTrades: vi.fn(),
      fetchWithdrawals: vi.fn(),
    };
    await expect(
      sampleEpochLive(
        market as never,
        { expectedSamples: 2, sampleSecs: 1, window },
        { sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(SourceAuthError);
  });
});

describe("guardedSubmit (P3.2 + P3.4)", () => {
  const verdict: VerdictInput = {
    status: "Pass",
    uptime_bps: 9500,
    median_spread_bps: 30,
    min_bid_depth_quote: "12000000000",
    min_ask_depth_quote: "12000000000",
    net_sells_base: "0",
    withdrawals_base: "0",
    coverage_bps: 10000,
    fail_reasons: [],
    terms_hash: "a".repeat(64),
    codehash: "deadbeef",
    data_source: "Replay",
  };
  const facts: GuardFacts = {
    mandateExists: true,
    mandateActive: true,
    termsHashMatches: true,
    epochClosed: true,
    verdictAlreadyExists: false,
    agentApproved: true,
  };

  it("submits only when guards pass", async () => {
    const sink: VerdictSink = { submitVerdict: vi.fn().mockResolvedValue(undefined) };
    await guardedSubmit(sink, 1, 0, verdict, facts);
    expect(sink.submitVerdict).toHaveBeenCalledWith(1, 0, verdict);
  });

  it("throws GuardRejection and does not submit when a guard fails", async () => {
    const sink: VerdictSink = { submitVerdict: vi.fn() };
    await expect(guardedSubmit(sink, 1, 0, verdict, { ...facts, epochClosed: false })).rejects.toBeInstanceOf(
      GuardRejection,
    );
    expect(sink.submitVerdict).not.toHaveBeenCalled();
  });
});
