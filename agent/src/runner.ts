/**
 * Runner (P3.3). Turns a data source into per-epoch verdicts and gates each one
 * through the pre-sign guards before it is signed. Replay assembles whole
 * scripted epochs; live samples over time then closes the epoch.
 */
import { keyRevokedVerdict, toVerdictInput, type VerdictInput, type VerdictMeta } from "./contract.js";
import { runPreSignGuards, type GuardContext } from "./guards/index.js";
import { type JitterConfig, plannedSampleTimes } from "./sampling.js";
import { scoreEpoch } from "./scoring/scorer.js";
import type { ScoringTerms } from "./scoring/types.js";
import type { LiveMarket, TimeWindow } from "./sources/live.js";
import type { ReplaySource } from "./sources/replay.js";
import { type EpochData, type Sample, SourceAuthError } from "./sources/types.js";

/** Score one epoch's data into a verdict input (KEY_REVOKED handled by callers). */
export function verdictForEpoch(terms: ScoringTerms, data: EpochData, meta: VerdictMeta): VerdictInput {
  return toVerdictInput(scoreEpoch(terms, data), meta);
}

/** Produce one verdict per epoch from a replay source. */
export async function runReplay(
  source: ReplaySource,
  terms: ScoringTerms,
  meta: Omit<VerdictMeta, "dataSource">,
): Promise<VerdictInput[]> {
  const fullMeta: VerdictMeta = { ...meta, dataSource: "Replay" };
  const out: VerdictInput[] = [];
  for (let epoch = 0; epoch < source.epochCount(); epoch += 1) {
    try {
      const data = await source.readEpoch(epoch);
      out.push(verdictForEpoch(terms, data, fullMeta));
    } catch (err) {
      if (err instanceof SourceAuthError) {
        out.push(keyRevokedVerdict(fullMeta));
      } else {
        throw err;
      }
    }
  }
  return out;
}

export interface SamplingDeps {
  sleep: (ms: number) => Promise<void>;
  /** Clock, injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Live epoch: take one sample inside each of `expectedSamples` windows — at a
 * TEE-derived, unpredictable offset within the window when `jitter` is supplied
 * (see sampling.ts) — then read the epoch's trades and withdrawals, plus the
 * base-token balance at open and close for reconciliation.
 *
 * A revoked key aborts the epoch (→ KEY_REVOKED); other read failures lose that
 * sample and flag serverErrors (→ Outage path). Balance reads are best-effort:
 * if either is unavailable, reconciliation is simply skipped.
 */
export async function sampleEpochLive(
  market: LiveMarket,
  params: {
    expectedSamples: number;
    sampleSecs: number;
    window: TimeWindow;
    jitter?: JitterConfig;
  },
  deps: SamplingDeps,
): Promise<EpochData> {
  const now = deps.now ?? Date.now;
  const samples: Sample[] = [];
  let serverErrors = false;

  const startBaseBalance = await readBalance(market);

  const schedule = plannedSampleTimes(now(), params.expectedSamples, params.sampleSecs, params.jitter);
  for (const target of schedule) {
    const wait = target - now();
    if (wait > 0) await deps.sleep(wait);
    try {
      samples.push(await market.fetchSample());
    } catch (err) {
      if (err instanceof SourceAuthError) throw err;
      serverErrors = true;
    }
  }

  const trades = await market.fetchTrades(params.window);
  const withdrawals = await market.fetchWithdrawals(params.window);
  const endBaseBalance = await readBalance(market);

  return {
    samples,
    trades,
    withdrawals,
    ...(serverErrors ? { serverErrors: true } : {}),
    ...(startBaseBalance !== undefined ? { startBaseBalance } : {}),
    ...(endBaseBalance !== undefined ? { endBaseBalance } : {}),
  };
}

/** Best-effort base-token balance read; undefined disables reconciliation. */
async function readBalance(market: LiveMarket): Promise<string | undefined> {
  try {
    return await market.fetchBaseBalance();
  } catch (err) {
    if (err instanceof SourceAuthError) throw err;
    return undefined;
  }
}

/** Facts the runner must gather (from the contract) before signing a verdict. */
export type GuardFacts = Omit<GuardContext, "verdict">;

export interface VerdictSink {
  submitVerdict(mandateId: number, epoch: number, verdict: VerdictInput): Promise<void>;
}

export class GuardRejection extends Error {
  constructor(public readonly violations: string[]) {
    super(`pre-sign guards failed: ${violations.join(", ")}`);
    this.name = "GuardRejection";
  }
}

/** Run the pre-sign guards; submit only if all pass, else throw GuardRejection. */
export async function guardedSubmit(
  sink: VerdictSink,
  mandateId: number,
  epoch: number,
  verdict: VerdictInput,
  facts: GuardFacts,
): Promise<void> {
  const result = runPreSignGuards({ ...facts, verdict });
  if (!result.ok) throw new GuardRejection(result.violations);
  await sink.submitVerdict(mandateId, epoch, verdict);
}
