/**
 * Deterministic epoch scorer (P3.1, invariant I4).
 *
 * Pure function: plain data in, plain data out. No I/O, no network, no keys, no
 * AI, no floats — all money math is decimal.js and the on-chain magnitudes come
 * out as 1e6-scaled integer strings. Mirrors the rules in architecture.md.
 */
import { Decimal } from "decimal.js";
import type { EpochData, PriceLevel } from "../sources/types.js";
import type { EpochScore, ScoringTerms } from "./types.js";

const SCALE = new Decimal(1_000_000); // 1e6 fixed-point
const BPS = new Decimal(10_000);
const OUTAGE_COVERAGE_BPS = 9_000; // coverage below 90% + server errors ⇒ Outage
/** Spread when a side is missing (no two-sided quote) — the guard cap. */
export const SPREAD_SENTINEL_BPS = 1_000_000;

// decimal.js defaults are deterministic; fix precision explicitly to be safe.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function bestBid(levels: PriceLevel[]): Decimal | null {
  let best: Decimal | null = null;
  for (const l of levels) {
    const p = new Decimal(l.price);
    if (best === null || p.gt(best)) best = p;
  }
  return best;
}

function bestAsk(levels: PriceLevel[]): Decimal | null {
  let best: Decimal | null = null;
  for (const l of levels) {
    const p = new Decimal(l.price);
    if (best === null || p.lt(best)) best = p;
  }
  return best;
}

/** Σ (price × size) × 1e6 for levels on the correct side of `threshold`. */
function sideDepthScaled(levels: PriceLevel[], threshold: Decimal, keepGte: boolean): Decimal {
  let sum = new Decimal(0);
  for (const l of levels) {
    const price = new Decimal(l.price);
    const keep = keepGte ? price.gte(threshold) : price.lte(threshold);
    if (keep) sum = sum.plus(price.times(new Decimal(l.size)));
  }
  return sum.times(SCALE).floor();
}

function median(values: number[]): number {
  if (values.length === 0) return SPREAD_SENTINEL_BPS;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.floor((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function clampBps(n: number): number {
  return Math.max(0, Math.min(10_000, n));
}

export function scoreEpoch(terms: ScoringTerms, epoch: EpochData): EpochScore {
  const expected = Math.floor(terms.epochSecs / terms.sampleSecs);
  if (expected <= 0) throw new Error("epochSecs must be a positive multiple of sampleSecs");

  const collected = epoch.samples.length;
  const coverageBps = clampBps(Math.floor((collected * 10_000) / expected));

  const minDepthScaled = new Decimal(terms.minDepthPerSideQuote);
  const loanCapScaled = new Decimal(terms.loanCapPerEpochBase);
  const band = new Decimal(terms.depthBandBps).div(BPS);

  let okCount = 0;
  const finiteSpreads: number[] = [];
  let minBidDepth: Decimal | null = null;
  let minAskDepth: Decimal | null = null;

  for (const s of epoch.samples) {
    const bid = new Decimal(s.publicBestBid);
    const ask = new Decimal(s.publicBestAsk);
    const mid = bid.plus(ask).div(2);
    const mmBid = bestBid(s.mmBids);
    const mmAsk = bestAsk(s.mmAsks);

    const twoSided = mmBid !== null && mmAsk !== null && mid.gt(0);
    let spreadBps = SPREAD_SENTINEL_BPS;
    if (twoSided) {
      spreadBps = mmAsk.minus(mmBid).div(mid).times(BPS).floor().toNumber();
      finiteSpreads.push(spreadBps);
    }

    const bidDepth = sideDepthScaled(s.mmBids, mid.times(new Decimal(1).minus(band)), true);
    const askDepth = sideDepthScaled(s.mmAsks, mid.times(new Decimal(1).plus(band)), false);
    minBidDepth = minBidDepth === null ? bidDepth : Decimal.min(minBidDepth, bidDepth);
    minAskDepth = minAskDepth === null ? askDepth : Decimal.min(minAskDepth, askDepth);

    const ok =
      spreadBps <= terms.maxSpreadBps &&
      bidDepth.gte(minDepthScaled) &&
      askDepth.gte(minDepthScaled);
    if (ok) okCount += 1;
  }

  const uptimeBps = clampBps(Math.floor((okCount * 10_000) / expected));

  // Trades: net sells of base = Σ sell − Σ buy; clamp at ≥ 0 for the unsigned field.
  let netSells = new Decimal(0);
  for (const t of epoch.trades) {
    const q = new Decimal(t.baseQty);
    netSells = t.side === "sell" ? netSells.plus(q) : netSells.minus(q);
  }
  const netSellsPos = Decimal.max(netSells, 0);
  let withdrawals = new Decimal(0);
  for (const w of epoch.withdrawals) withdrawals = withdrawals.plus(new Decimal(w.baseQty));

  const netSellsScaled = netSellsPos.times(SCALE).floor();
  const withdrawalsScaled = withdrawals.times(SCALE).floor();
  const loanUsedScaled = netSellsPos.plus(withdrawals).times(SCALE).floor();

  const uptimeOk = uptimeBps >= terms.minUptimeBps;
  const loanOk = loanUsedScaled.lte(loanCapScaled);

  const failReasons: string[] = [];
  if (!uptimeOk) failReasons.push("UPTIME");
  if (!loanOk) failReasons.push("LOAN_CAP");

  // Status precedence (architecture.md): KEY_REVOKED (runner) → Outage → Pass → Fail.
  let status: EpochScore["status"];
  if (coverageBps < OUTAGE_COVERAGE_BPS && epoch.serverErrors === true) {
    status = "Outage";
  } else if (uptimeOk && loanOk) {
    status = "Pass";
  } else {
    status = "Fail";
  }

  return {
    status,
    uptimeBps,
    medianSpreadBps: Math.min(SPREAD_SENTINEL_BPS, median(finiteSpreads)),
    minBidDepthQuote: (minBidDepth ?? new Decimal(0)).toFixed(0),
    minAskDepthQuote: (minAskDepth ?? new Decimal(0)).toFixed(0),
    netSellsBase: netSellsScaled.toFixed(0),
    withdrawalsBase: withdrawalsScaled.toFixed(0),
    coverageBps,
    failReasons: status === "Outage" ? [] : failReasons,
  };
}
