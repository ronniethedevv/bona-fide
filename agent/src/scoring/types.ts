/**
 * Scoring types. All on-chain-bound magnitudes are fixed-point integers scaled
 * by 1e6 and carried as decimal strings — never floats (invariant I4). Basis
 * points (spread, uptime, coverage) are plain integers in [0, …].
 */

/** The mandate terms the scorer needs. Depth/loan values are 1e6-scaled strings. */
export interface ScoringTerms {
  maxSpreadBps: number;
  depthBandBps: number;
  /** Minimum depth per side, in quote units, fixed-point 1e6 (decimal string). */
  minDepthPerSideQuote: string;
  minUptimeBps: number;
  /** Loan cap per epoch, base units, fixed-point 1e6 (decimal string). */
  loanCapPerEpochBase: string;
  epochSecs: number;
  sampleSecs: number;
}

export type ScoreStatus = "Pass" | "Fail" | "Outage";

/** The scorer's output — exactly the metric fields of an on-chain verdict. */
export interface EpochScore {
  status: ScoreStatus;
  uptimeBps: number;
  medianSpreadBps: number;
  /** 1e6-scaled quote units. */
  minBidDepthQuote: string;
  minAskDepthQuote: string;
  /** 1e6-scaled base units, clamped at ≥ 0 (the contract field is unsigned). */
  netSellsBase: string;
  withdrawalsBase: string;
  coverageBps: number;
  /** Codes such as UPTIME, LOAN_CAP (KEY_REVOKED is set by the runner). */
  failReasons: string[];
}
