/** Types mirroring the contract's view results. */

export type MandateStatus = "Proposed" | "Active" | "Completed" | "Cancelled";
export type VerdictStatus = "Pass" | "Fail" | "Outage" | "Missed";
export type DataSource = "Live" | "Replay";

export interface MmSummary {
  engagements: number;
  pass: number;
  fail: number;
  missed: number;
  outage: number;
  last_verdict_ms: string;
}

export interface MmListing {
  account_id: string;
  summary: MmSummary;
}

export interface Mandate {
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
  status: MandateStatus;
  terms_hash: string;
}

export interface Verdict {
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
  submitted_at: string;
}

export interface EpochVerdict {
  epoch: number;
  verdict: Verdict;
}

/** The terms a market maker proposes (input to propose_mandate + terms hash). */
export interface MandateTerms {
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
}
