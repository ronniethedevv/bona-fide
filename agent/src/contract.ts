/**
 * Types mirroring the NEAR contract's inputs/outputs, and the mapping from a
 * deterministic {@link EpochScore} to the on-chain `VerdictInput`.
 */
import type { EpochScore } from "./scoring/types.js";
import type { ScoringTerms } from "./scoring/types.js";

export type VerdictStatus = "Pass" | "Fail" | "Outage" | "Missed";
export type DataSource = "Live" | "Replay";

/** Argument shape of the contract's `submit_verdict` (snake_case, U128 as strings). */
export interface VerdictInput {
  status: VerdictStatus;
  uptime_bps: number;
  median_spread_bps: number;
  min_bid_depth_quote: string;
  min_ask_depth_quote: string;
  net_sells_base: string;
  withdrawals_base: string;
  coverage_bps: number;
  fail_reasons: string[];
  terms_hash: string;
  codehash: string;
  data_source: DataSource;
}

/** The on-chain Mandate fields the agent needs (as returned by `get_mandate`). */
export interface MandateView {
  id: string;
  mm: string;
  project: string;
  exchange: string;
  pair: string;
  account_label: string;
  max_spread_bps: number;
  depth_band_bps: number;
  min_depth_per_side_quote: string;
  min_uptime_bps: number;
  loan_cap_per_epoch_base: string;
  epoch_secs: number;
  sample_secs: number;
  start_ts: string;
  end_ts: string;
  status: string;
  terms_hash: string;
}

/** Extract the scorer's view of a mandate's terms. */
export function scoringTerms(m: MandateView): ScoringTerms {
  return {
    maxSpreadBps: m.max_spread_bps,
    depthBandBps: m.depth_band_bps,
    minDepthPerSideQuote: m.min_depth_per_side_quote,
    minUptimeBps: m.min_uptime_bps,
    loanCapPerEpochBase: m.loan_cap_per_epoch_base,
    epochSecs: m.epoch_secs,
    sampleSecs: m.sample_secs,
  };
}

export interface VerdictMeta {
  termsHash: string;
  codehash: string;
  dataSource: DataSource;
}

/** Map a computed score to the contract's verdict input. */
export function toVerdictInput(score: EpochScore, meta: VerdictMeta): VerdictInput {
  return {
    status: score.status,
    uptime_bps: score.uptimeBps,
    median_spread_bps: score.medianSpreadBps,
    min_bid_depth_quote: score.minBidDepthQuote,
    min_ask_depth_quote: score.minAskDepthQuote,
    net_sells_base: score.netSellsBase,
    withdrawals_base: score.withdrawalsBase,
    coverage_bps: score.coverageBps,
    fail_reasons: score.failReasons,
    terms_hash: meta.termsHash,
    codehash: meta.codehash,
    data_source: meta.dataSource,
  };
}

/** The verdict recorded when the exchange revoked the key mid-epoch (KEY_REVOKED). */
export function keyRevokedVerdict(meta: VerdictMeta): VerdictInput {
  return {
    status: "Fail",
    uptime_bps: 0,
    median_spread_bps: 0,
    min_bid_depth_quote: "0",
    min_ask_depth_quote: "0",
    net_sells_base: "0",
    withdrawals_base: "0",
    coverage_bps: 0,
    fail_reasons: ["KEY_REVOKED"],
    terms_hash: meta.termsHash,
    codehash: meta.codehash,
    data_source: meta.dataSource,
  };
}
