/**
 * An INDEPENDENT reference implementation of the epoch scoring rules, written
 * straight from the spec in `docs/SCORING.md` in a deliberately different style
 * (plain floats, simple loops — no decimal.js, no fixed-point). Test-only.
 *
 * Its job is to disagree with the production scorer if either one has a logic
 * error (wrong side filtered, inverted comparison, wrong denominator). Small
 * numeric differences are expected and tolerated by the cross-check; structural
 * differences are not.
 */
import type { EpochData } from "../src/sources/types.js";
import type { ScoringTerms } from "../src/scoring/types.js";

export interface ReferenceScore {
  status: "Pass" | "Fail" | "Outage";
  uptimeBps: number;
  coverageBps: number;
  medianSpreadBps: number;
  /** Plain quote units (NOT scaled). */
  minBidDepthQuote: number;
  minAskDepthQuote: number;
  /** Plain base units (NOT scaled). */
  netSellsBase: number;
  withdrawalsBase: number;
  unexplainedOutflowBase: number;
  failReasons: string[];
}

const SENTINEL = 1_000_000;

export function referenceScore(terms: ScoringTerms, epoch: EpochData): ReferenceScore {
  const expected = Math.floor(terms.epochSecs / terms.sampleSecs);
  const band = terms.depthBandBps / 10_000;
  const minDepth = Number(terms.minDepthPerSideQuote) / 1e6;
  const loanCap = Number(terms.loanCapPerEpochBase) / 1e6;

  let okCount = 0;
  const spreads: number[] = [];
  let minBid: number | null = null;
  let minAsk: number | null = null;

  for (const s of epoch.samples) {
    const mid = (Number(s.publicBestBid) + Number(s.publicBestAsk)) / 2;

    const bidPrices = s.mmBids.map((l) => Number(l.price));
    const askPrices = s.mmAsks.map((l) => Number(l.price));
    const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
    const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : null;

    let spread = SENTINEL;
    if (bestBid !== null && bestAsk !== null && mid > 0) {
      spread = Math.max(0, Math.floor(((bestAsk - bestBid) / mid) * 10_000));
      spreads.push(spread);
    }

    let bidDepth = 0;
    for (const l of s.mmBids) {
      if (Number(l.price) >= mid * (1 - band)) bidDepth += Number(l.price) * Number(l.size);
    }
    let askDepth = 0;
    for (const l of s.mmAsks) {
      if (Number(l.price) <= mid * (1 + band)) askDepth += Number(l.price) * Number(l.size);
    }
    minBid = minBid === null ? bidDepth : Math.min(minBid, bidDepth);
    minAsk = minAsk === null ? askDepth : Math.min(minAsk, askDepth);

    if (spread <= terms.maxSpreadBps && bidDepth >= minDepth && askDepth >= minDepth) okCount += 1;
  }

  const clamp = (n: number): number => Math.max(0, Math.min(10_000, n));
  const coverageBps = clamp(Math.floor((epoch.samples.length * 10_000) / expected));
  const uptimeBps = clamp(Math.floor((okCount * 10_000) / expected));

  let median = SENTINEL;
  if (spreads.length > 0) {
    const sorted = [...spreads].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    median = sorted.length % 2 === 1 ? sorted[m]! : Math.floor((sorted[m - 1]! + sorted[m]!) / 2);
  }

  let sells = 0;
  let buys = 0;
  for (const t of epoch.trades) {
    if (t.side === "sell") sells += Number(t.baseQty);
    else buys += Number(t.baseQty);
  }
  const net = Math.max(0, sells - buys);
  let withdrawals = 0;
  for (const w of epoch.withdrawals) withdrawals += Number(w.baseQty);

  // Balance reconciliation: unexplained base-token outflow beyond fee tolerance.
  let unexplained = 0;
  if (epoch.startBaseBalance !== undefined && epoch.endBaseBalance !== undefined) {
    const open = Number(epoch.startBaseBalance);
    const close = Number(epoch.endBaseBalance);
    const shortfall = open + buys - sells - withdrawals - close;
    const tolerance = Math.max((Math.abs(open) * 10) / 10_000, 0);
    if (shortfall > tolerance) unexplained = shortfall;
  }

  const uptimeOk = uptimeBps >= terms.minUptimeBps;
  const loanOk = net + withdrawals + unexplained <= loanCap;
  const balanceOk = unexplained <= 0;

  const failReasons: string[] = [];
  if (!uptimeOk) failReasons.push("UPTIME");
  if (!loanOk) failReasons.push("LOAN_CAP");
  if (!balanceOk) failReasons.push("BALANCE_LEAK");

  let status: ReferenceScore["status"];
  if (coverageBps < 9_000 && epoch.serverErrors === true) status = "Outage";
  else if (uptimeOk && loanOk && balanceOk) status = "Pass";
  else status = "Fail";

  return {
    status,
    uptimeBps,
    coverageBps,
    medianSpreadBps: Math.min(SENTINEL, median),
    minBidDepthQuote: minBid ?? 0,
    minAskDepthQuote: minAsk ?? 0,
    netSellsBase: net,
    withdrawalsBase: withdrawals,
    unexplainedOutflowBase: unexplained,
    failReasons: status === "Outage" ? [] : failReasons,
  };
}
