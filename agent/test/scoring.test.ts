import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scoreEpoch } from "../src/scoring/scorer.js";
import type { ScoringTerms } from "../src/scoring/types.js";
import type { EpochData, Sample } from "../src/sources/types.js";
import { loadReplayFixture } from "../src/sources/replay.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/replay", import.meta.url));

const TERMS: ScoringTerms = {
  maxSpreadBps: 100,
  depthBandBps: 200,
  minDepthPerSideQuote: "10000000000", // 10,000.000000 quote
  minUptimeBps: 9000,
  loanCapPerEpochBase: "1000000", // 1.000000 base token
  epochSecs: 120,
  sampleSecs: 30,
};

async function epoch(name: string, index = 0): Promise<EpochData> {
  const fx = await loadReplayFixture(name, FIXTURES_DIR);
  return fx.epochs[index]!;
}

describe("scoreEpoch (P3.1)", () => {
  it("passes an honest epoch", async () => {
    const score = scoreEpoch(TERMS, await epoch("honest-mm"));
    expect(score.status).toBe("Pass");
    expect(score.coverageBps).toBe(10_000);
    expect(score.uptimeBps).toBe(10_000);
    expect(score.failReasons).toEqual([]);
    expect(score.medianSpreadBps).toBeLessThan(100);
  });

  it("fails a dumping epoch on the loan cap", async () => {
    const score = scoreEpoch(TERMS, await epoch("dumping-mm"));
    expect(score.status).toBe("Fail");
    expect(score.failReasons).toContain("LOAN_CAP");
    // net sells = 5.00 + 3.50 − 0.10 = 8.40 base; withdrawals = 2.00 base.
    expect(score.netSellsBase).toBe("8400000");
    expect(score.withdrawalsBase).toBe("2000000");
  });

  it("marks an outage epoch", async () => {
    const score = scoreEpoch(TERMS, await epoch("outage"));
    expect(score.status).toBe("Outage");
    expect(score.coverageBps).toBeLessThan(9_000);
    expect(score.failReasons).toEqual([]);
  });

  it("is deterministic: same input → same output (I4)", async () => {
    const data = await epoch("dumping-mm");
    expect(scoreEpoch(TERMS, data)).toEqual(scoreEpoch(TERMS, data));
  });

  it("counts a one-sided quote as not ok (infinite spread)", () => {
    const oneSided: Sample = {
      publicBestBid: "1.00",
      publicBestAsk: "1.02",
      mmBids: [{ price: "0.99", size: "20000" }],
      mmAsks: [], // no ask → spread infinite → not ok
    };
    const data: EpochData = { samples: [oneSided], trades: [], withdrawals: [] };
    const terms: ScoringTerms = { ...TERMS, epochSecs: 30, sampleSecs: 30 }; // expected = 1
    const score = scoreEpoch(terms, data);
    expect(score.uptimeBps).toBe(0);
    expect(score.status).toBe("Fail");
    expect(score.failReasons).toContain("UPTIME");
  });
});

// Property-style invariants over generated samples (determinism + bounds).
describe("scoreEpoch invariants (I4)", () => {
  function sample(i: number): Sample {
    const bid = 1 + ((i * 7) % 5) / 1000;
    const ask = bid + 0.002;
    return {
      publicBestBid: bid.toFixed(4),
      publicBestAsk: ask.toFixed(4),
      mmBids: [{ price: (bid - 0.001).toFixed(4), size: "20000" }],
      mmAsks: [{ price: (ask + 0.001).toFixed(4), size: "20000" }],
    };
  }

  it("keeps metrics in range and uptime ≤ coverage, deterministically", () => {
    for (let n = 0; n <= 4; n += 1) {
      const data: EpochData = {
        samples: Array.from({ length: n }, (_, i) => sample(i)),
        trades: [{ side: "sell", baseQty: "0.1" }],
        withdrawals: [],
      };
      const a = scoreEpoch(TERMS, data);
      const b = scoreEpoch(TERMS, data);
      expect(a).toEqual(b); // deterministic
      expect(a.coverageBps).toBeGreaterThanOrEqual(0);
      expect(a.coverageBps).toBeLessThanOrEqual(10_000);
      expect(a.uptimeBps).toBeLessThanOrEqual(a.coverageBps);
      expect(a.medianSpreadBps).toBeLessThanOrEqual(1_000_000);
      expect(/^\d+$/.test(a.minBidDepthQuote)).toBe(true);
      expect(/^\d+$/.test(a.netSellsBase)).toBe(true);
    }
  });
});
