/**
 * Tests for the two anti-gaming hardening measures:
 *  - balance reconciliation (catches disposal via routes the API doesn't report)
 *  - sampling jitter (defeats "flicker quoting" against a predictable schedule)
 */
import { describe, expect, it, vi } from "vitest";
import { deriveJitterKey, plannedSampleTimes, sampleOffsetMs } from "../src/sampling.js";
import { sampleEpochLive } from "../src/runner.js";
import { scoreEpoch } from "../src/scoring/scorer.js";
import type { ScoringTerms } from "../src/scoring/types.js";
import type { EpochData, Sample } from "../src/sources/types.js";

const TERMS: ScoringTerms = {
  maxSpreadBps: 100,
  depthBandBps: 200,
  minDepthPerSideQuote: "10000000000", // 10,000 quote
  minUptimeBps: 9000,
  loanCapPerEpochBase: "1000000", // 1.0 base
  epochSecs: 120,
  sampleSecs: 30,
};

const GOOD: Sample = {
  publicBestBid: "1.0000",
  publicBestAsk: "1.0020",
  mmBids: [{ price: "0.9990", size: "20000" }],
  mmAsks: [{ price: "1.0030", size: "20000" }],
};

function epoch(extra: Partial<EpochData> = {}): EpochData {
  return { samples: [GOOD, GOOD, GOOD, GOOD], trades: [], withdrawals: [], ...extra };
}

describe("balance reconciliation", () => {
  it("passes a clean account whose balance matches its trades", () => {
    // opened 1000, sold 0.5 → expected close 999.5, actual 999.5
    const s = scoreEpoch(
      TERMS,
      epoch({
        trades: [{ side: "sell", baseQty: "0.5" }],
        startBaseBalance: "1000",
        endBaseBalance: "999.5",
      }),
    );
    expect(s.failReasons).not.toContain("BALANCE_LEAK");
    expect(s.unexplainedOutflowBase).toBe("0");
    expect(s.status).toBe("Pass");
  });

  it("catches tokens leaving with no trade or withdrawal to explain them", () => {
    // THE ATTACK: 300 base moved out internally (sub-account / spot→funding),
    // which never appears in withdrawal history. Trades and withdrawals look clean.
    const s = scoreEpoch(TERMS, epoch({ startBaseBalance: "1000", endBaseBalance: "700" }));
    expect(s.failReasons).toContain("BALANCE_LEAK");
    expect(s.status).toBe("Fail");
    expect(s.unexplainedOutflowBase).toBe("300000000"); // 300.000000 base, 1e6-scaled
  });

  it("counts the unexplained outflow toward the loan cap", () => {
    const s = scoreEpoch(TERMS, epoch({ startBaseBalance: "1000", endBaseBalance: "700" }));
    expect(s.failReasons).toContain("LOAN_CAP"); // 300 base >> 1.0 cap
  });

  it("tolerates fee-sized dust so ordinary activity never trips it", () => {
    // 0.5 short on a 1000 balance = 5 bps, inside the 10 bps tolerance.
    const s = scoreEpoch(TERMS, epoch({ startBaseBalance: "1000", endBaseBalance: "999.5" }));
    expect(s.failReasons).not.toContain("BALANCE_LEAK");
    expect(s.status).toBe("Pass");
  });

  it("is skipped entirely when balances are unavailable", () => {
    const s = scoreEpoch(TERMS, epoch());
    expect(s.unexplainedOutflowBase).toBe("0");
    expect(s.failReasons).not.toContain("BALANCE_LEAK");
  });

  it("does not punish an account that grew", () => {
    const s = scoreEpoch(TERMS, epoch({ startBaseBalance: "1000", endBaseBalance: "1200" }));
    expect(s.failReasons).not.toContain("BALANCE_LEAK");
  });
});

describe("sampling jitter", () => {
  const key = deriveJitterKey(new Uint8Array(32).fill(9));
  const jitter = { key, mandateId: 1, epoch: 0 };

  it("is deterministic and reproducible for audit", () => {
    expect(sampleOffsetMs(jitter, 3, 30)).toBe(sampleOffsetMs(jitter, 3, 30));
  });

  it("always lands inside the sample window", () => {
    for (let i = 0; i < 50; i += 1) {
      const off = sampleOffsetMs(jitter, i, 30);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(30_000);
    }
  });

  it("is unpredictable: differs by index, epoch and mandate", () => {
    expect(sampleOffsetMs(jitter, 0, 30)).not.toBe(sampleOffsetMs(jitter, 1, 30));
    expect(sampleOffsetMs(jitter, 0, 30)).not.toBe(sampleOffsetMs({ ...jitter, epoch: 1 }, 0, 30));
    expect(sampleOffsetMs(jitter, 0, 30)).not.toBe(sampleOffsetMs({ ...jitter, mandateId: 2 }, 0, 30));
  });

  it("needs the enclave key: a different seed gives a different schedule", () => {
    const other = { ...jitter, key: deriveJitterKey(new Uint8Array(32).fill(1)) };
    expect(plannedSampleTimes(0, 4, 30, jitter)).not.toEqual(plannedSampleTimes(0, 4, 30, other));
  });

  it("keeps one sample per window, strictly increasing", () => {
    const times = plannedSampleTimes(0, 8, 30, jitter);
    for (let i = 0; i < times.length; i += 1) {
      expect(times[i]!).toBeGreaterThanOrEqual(i * 30_000);
      expect(times[i]!).toBeLessThan((i + 1) * 30_000);
      if (i > 0) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    }
  });

  it("falls back to an exact cadence when no jitter is configured", () => {
    expect(plannedSampleTimes(1000, 3, 30)).toEqual([1000, 31_000, 61_000]);
  });
});

describe("sampleEpochLive scheduling", () => {
  it("takes one sample per window at the jittered times, and reads balances", async () => {
    let clock = 0;
    const takenAt: number[] = [];
    const market = {
      dataSource: () => "Live" as const,
      fetchSample: vi.fn().mockImplementation(async () => {
        takenAt.push(clock);
        return GOOD;
      }),
      fetchTrades: vi.fn().mockResolvedValue([]),
      fetchWithdrawals: vi.fn().mockResolvedValue([]),
      fetchBaseBalance: vi.fn().mockResolvedValue("1000"),
    };
    const jitter = { key: deriveJitterKey(new Uint8Array(32).fill(7)), mandateId: 5, epoch: 2 };

    const data = await sampleEpochLive(
      market as never,
      { expectedSamples: 4, sampleSecs: 30, window: { startTime: 0, endTime: 1 }, jitter },
      { sleep: async (ms) => void (clock += ms), now: () => clock },
    );

    expect(data.samples).toHaveLength(4);
    expect(takenAt).toEqual(plannedSampleTimes(0, 4, 30, jitter));
    expect(data.startBaseBalance).toBe("1000");
    expect(data.endBaseBalance).toBe("1000");
  });

  it("still works when the exchange won't give a balance (check disabled)", async () => {
    let clock = 0;
    const market = {
      dataSource: () => "Live" as const,
      fetchSample: vi.fn().mockResolvedValue(GOOD),
      fetchTrades: vi.fn().mockResolvedValue([]),
      fetchWithdrawals: vi.fn().mockResolvedValue([]),
      fetchBaseBalance: vi.fn().mockRejectedValue(new Error("not permitted")),
    };
    const data = await sampleEpochLive(
      market as never,
      { expectedSamples: 2, sampleSecs: 30, window: { startTime: 0, endTime: 1 } },
      { sleep: async (ms) => void (clock += ms), now: () => clock },
    );
    expect(data.samples).toHaveLength(2);
    expect(data.startBaseBalance).toBeUndefined();
  });
});
