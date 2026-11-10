/**
 * The demo story, as runnable code (P5.1 / P5.4). Deterministic and offline —
 * proves the three beats without a chain or an exchange account:
 *   1. honest MM  → every epoch Pass
 *   2. dumping MM → epoch Fail (LOAN_CAP)
 *   3. trade/withdraw key → rejected by the permission check on sight
 */
import type { VerdictInput } from "./contract.js";
import { checkPermissions, type ApiRestrictions, type PermissionCheck } from "./exchange/permissions.js";
import { runReplay } from "./runner.js";
import type { ScoringTerms } from "./scoring/types.js";
import { loadReplayFixture, ReplaySource } from "./sources/replay.js";

export const DEMO_TERMS: ScoringTerms = {
  maxSpreadBps: 100,
  depthBandBps: 200,
  minDepthPerSideQuote: "10000000000", // 10,000.000000 quote
  minUptimeBps: 9000,
  loanCapPerEpochBase: "1000000", // 1.000000 base token
  epochSecs: 120,
  sampleSecs: 30,
};

export const DEMO_META = { termsHash: "demo-terms-hash", codehash: "demo-codehash" };

const READ_ONLY_KEY: ApiRestrictions = {
  enableReading: true,
  enableSpotAndMarginTrading: false,
  enableMargin: false,
  enableFutures: false,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
};
const TRADE_KEY: ApiRestrictions = { ...READ_ONLY_KEY, enableSpotAndMarginTrading: true };
const WITHDRAW_KEY: ApiRestrictions = { ...READ_ONLY_KEY, enableWithdrawals: true };

export interface DemoResult {
  honest: VerdictInput[];
  dumping: VerdictInput[];
  readOnlyKey: PermissionCheck;
  tradeKey: PermissionCheck;
  withdrawKey: PermissionCheck;
}

export async function runDemoScenarios(fixturesDir?: string): Promise<DemoResult> {
  const honestSrc = new ReplaySource(await loadReplayFixture("honest-mm", fixturesDir));
  const dumpingSrc = new ReplaySource(await loadReplayFixture("dumping-mm", fixturesDir));
  return {
    honest: await runReplay(honestSrc, DEMO_TERMS, DEMO_META),
    dumping: await runReplay(dumpingSrc, DEMO_TERMS, DEMO_META),
    readOnlyKey: checkPermissions(READ_ONLY_KEY),
    tradeKey: checkPermissions(TRADE_KEY),
    withdrawKey: checkPermissions(WITHDRAW_KEY),
  };
}
