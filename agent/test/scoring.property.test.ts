/**
 * Property-based tests for the scorer (invariant I4, "top notch" assurance).
 *
 * These do not check specific examples — they assert laws that must hold for
 * EVERY input fast-check can generate, including adversarial ones (crossed
 * books, empty sides, zero sizes, no samples). Plus a cross-check against an
 * independent reference implementation.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { scoreEpoch } from "../src/scoring/scorer.js";
import type { ScoringTerms } from "../src/scoring/types.js";
import type { EpochData } from "../src/sources/types.js";
import { referenceScore } from "./reference-scorer.js";

const price = fc.integer({ min: 1, max: 2_000_000 }).map((n) => (n / 10_000).toFixed(4));
const size = fc.integer({ min: 0, max: 100_000 }).map((n) => String(n));
const level = fc.record({ price, size });

const sample = fc.record({
  publicBestBid: price,
  publicBestAsk: price, // may be below the bid — a crossed public book is allowed input
  mmBids: fc.array(level, { maxLength: 3 }),
  mmAsks: fc.array(level, { maxLength: 3 }),
});

const qty = fc.integer({ min: 0, max: 100_000 }).map((n) => (n / 100).toFixed(2));
const trade = fc.record({ side: fc.constantFrom("buy" as const, "sell" as const), baseQty: qty });

const baseEpochArb = fc.record({
  samples: fc.array(sample, { maxLength: 6 }),
  trades: fc.array(trade, { maxLength: 5 }),
  withdrawals: fc.array(fc.record({ baseQty: qty }), { maxLength: 3 }),
  serverErrors: fc.boolean(),
});

/**
 * Half the generated epochs carry opening/closing balances, so balance
 * reconciliation is exercised: `delta` > 0 is an unexplained outflow (a leak),
 * <= 0 is a clean or over-funded account.
 */
const epochArb: fc.Arbitrary<EpochData> = baseEpochArb.chain((e) =>
  fc.oneof(
    fc.constant(e as EpochData),
    fc
      .tuple(
        fc.integer({ min: 0, max: 1_000_000 }).map((n) => n / 100),
        fc.integer({ min: -5_000, max: 5_000 }).map((n) => n / 100),
      )
      .map(([open, delta]) => {
        let buys = 0;
        let sells = 0;
        for (const t of e.trades) {
          if (t.side === "sell") sells += Number(t.baseQty);
          else buys += Number(t.baseQty);
        }
        let w = 0;
        for (const x of e.withdrawals) w += Number(x.baseQty);
        const expectedClose = open + buys - sells - w;
        return {
          ...e,
          startBaseBalance: open.toFixed(2),
          endBaseBalance: (expectedClose - delta).toFixed(2),
        } as EpochData;
      }),
  ),
);

const termsArb: fc.Arbitrary<ScoringTerms> = fc.record({
  maxSpreadBps: fc.integer({ min: 0, max: 5_000 }),
  depthBandBps: fc.integer({ min: 0, max: 1_000 }),
  minDepthPerSideQuote: fc.integer({ min: 0, max: 50_000 }).map((n) => String(n * 1_000_000)),
  minUptimeBps: fc.integer({ min: 0, max: 10_000 }),
  loanCapPerEpochBase: fc.integer({ min: 0, max: 1_000 }).map((n) => String(n * 1_000_000)),
  sampleSecs: fc.constant(30),
  epochSecs: fc.integer({ min: 1, max: 8 }).map((k) => k * 30),
});

describe("scorer properties (I4)", () => {
  it("never throws on any well-formed input", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        scoreEpoch(terms, epoch);
      }),
    );
  });

  it("is deterministic: same input → identical output", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        expect(scoreEpoch(terms, epoch)).toEqual(scoreEpoch(terms, epoch));
      }),
    );
  });

  it("keeps every reported value in a signable range (pre-sign guard #3)", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        const s = scoreEpoch(terms, epoch);
        expect(s.coverageBps).toBeGreaterThanOrEqual(0);
        expect(s.coverageBps).toBeLessThanOrEqual(10_000);
        expect(s.uptimeBps).toBeGreaterThanOrEqual(0);
        expect(s.uptimeBps).toBeLessThanOrEqual(10_000);
        expect(s.medianSpreadBps).toBeGreaterThanOrEqual(0);
        expect(s.medianSpreadBps).toBeLessThanOrEqual(1_000_000);
        for (const v of [s.minBidDepthQuote, s.minAskDepthQuote, s.netSellsBase, s.withdrawalsBase]) {
          expect(v).toMatch(/^\d+$/); // non-negative integer string
        }
      }),
    );
  });

  it("uptime never exceeds coverage (an unobserved sample is never 'ok')", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        const s = scoreEpoch(terms, epoch);
        expect(s.uptimeBps).toBeLessThanOrEqual(s.coverageBps);
      }),
    );
  });

  it("is monotone in the spread bound: a looser max spread never lowers uptime", () => {
    fc.assert(
      fc.property(termsArb, epochArb, fc.integer({ min: 0, max: 5_000 }), (terms, epoch, bump) => {
        const tight = scoreEpoch(terms, epoch);
        const loose = scoreEpoch({ ...terms, maxSpreadBps: terms.maxSpreadBps + bump }, epoch);
        expect(loose.uptimeBps).toBeGreaterThanOrEqual(tight.uptimeBps);
      }),
    );
  });

  it("is monotone in the depth floor: a lower minimum depth never lowers uptime", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        const strict = scoreEpoch(terms, epoch);
        const relaxed = scoreEpoch({ ...terms, minDepthPerSideQuote: "0" }, epoch);
        expect(relaxed.uptimeBps).toBeGreaterThanOrEqual(strict.uptimeBps);
      }),
    );
  });

  it("is monotone in the loan cap: raising the cap never introduces LOAN_CAP", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        const strict = scoreEpoch(terms, epoch);
        if (!strict.failReasons.includes("LOAN_CAP")) return;
        const huge = scoreEpoch({ ...terms, loanCapPerEpochBase: "999999999999999" }, epoch);
        expect(huge.failReasons).not.toContain("LOAN_CAP");
      }),
    );
  });

  it("net sells respond correctly to trades: a buy never increases them", () => {
    fc.assert(
      fc.property(termsArb, epochArb, qty, (terms, epoch, extra) => {
        const before = BigInt(scoreEpoch(terms, epoch).netSellsBase);
        const after = BigInt(
          scoreEpoch(terms, { ...epoch, trades: [...epoch.trades, { side: "buy", baseQty: extra }] })
            .netSellsBase,
        );
        expect(after <= before).toBe(true);
      }),
    );
  });
});

describe("cross-check against an independent implementation", () => {
  it("agrees with the reference scorer", () => {
    fc.assert(
      fc.property(termsArb, epochArb, (terms, epoch) => {
        const mine = scoreEpoch(terms, epoch);
        const ref = referenceScore(terms, epoch);

        // Pure counting — must match exactly.
        expect(mine.coverageBps).toBe(ref.coverageBps);
        expect(mine.medianSpreadBps).toBe(ref.medianSpreadBps);

        // Uptime may differ by at most one sample, where a depth comparison sits
        // exactly on the boundary and float vs fixed-point round differently.
        const oneSample = Math.ceil(10_000 / Math.floor(terms.epochSecs / terms.sampleSecs));
        expect(Math.abs(mine.uptimeBps - ref.uptimeBps)).toBeLessThanOrEqual(oneSample);

        // Magnitudes: compare within a small relative tolerance.
        const close = (scaled: string, plain: number): void => {
          const a = Number(scaled) / 1e6;
          expect(Math.abs(a - plain)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(plain) * 1e-9));
        };
        close(mine.minBidDepthQuote, ref.minBidDepthQuote);
        close(mine.minAskDepthQuote, ref.minAskDepthQuote);
        close(mine.netSellsBase, ref.netSellsBase);
        close(mine.withdrawalsBase, ref.withdrawalsBase);
        close(mine.unexplainedOutflowBase, ref.unexplainedOutflowBase);

        // Both must agree on whether the account leaked.
        const mineLeaked = mine.failReasons.includes("BALANCE_LEAK");
        const refLeaked = ref.failReasons.includes("BALANCE_LEAK");
        expect(mineLeaked).toBe(refLeaked);

        // Status must agree whenever the uptime figures agree.
        if (mine.uptimeBps === ref.uptimeBps) expect(mine.status).toBe(ref.status);
      }),
    );
  });
});
