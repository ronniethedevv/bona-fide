/**
 * Data-source types shared by the live and replay sources. Everything is plain
 * data in decimal strings so the Phase-3 scorer stays pure and float-free (I4).
 */
import { z } from "zod";

export type DataSourceKind = "Live" | "Replay";

/** A single price level, decimal strings. */
export const PriceLevelSchema = z.object({ price: z.string(), size: z.string() });
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

/** One sample of the public book + the MM's own open orders. */
export const SampleSchema = z.object({
  publicBestBid: z.string(),
  publicBestAsk: z.string(),
  mmBids: z.array(PriceLevelSchema),
  mmAsks: z.array(PriceLevelSchema),
});
export type Sample = z.infer<typeof SampleSchema>;

export const TradeSchema = z.object({
  side: z.enum(["buy", "sell"]),
  baseQty: z.string(),
});
export type Trade = z.infer<typeof TradeSchema>;

export const WithdrawalSchema = z.object({ baseQty: z.string() });
export type Withdrawal = z.infer<typeof WithdrawalSchema>;

/** Everything the scorer needs for one epoch. */
export const EpochDataSchema = z.object({
  samples: z.array(SampleSchema),
  trades: z.array(TradeSchema),
  withdrawals: z.array(WithdrawalSchema),
  /** The exchange returned an auth error (key revoked) during this epoch. */
  authError: z.boolean().optional(),
  /** Some samples were lost to exchange/server errors (drives Outage vs Fail). */
  serverErrors: z.boolean().optional(),
});
export type EpochData = z.infer<typeof EpochDataSchema>;

/** Thrown when the exchange rejects the credential mid-epoch (→ KEY_REVOKED). */
export class SourceAuthError extends Error {
  constructor() {
    super("exchange auth error");
    this.name = "SourceAuthError";
  }
}

/**
 * One interface, two implementations (live, replay). The scorer never knows
 * which it is reading; the data source is recorded separately on-chain (I9).
 */
export interface EpochSource {
  dataSource(): DataSourceKind;
  /** Number of epochs this source can serve. */
  epochCount(): number;
  /** Samples expected per epoch = epochSecs / sampleSecs. */
  expectedSamples(): number;
  /** Read one epoch. Throws {@link SourceAuthError} if the key was revoked. */
  readEpoch(epoch: number): Promise<EpochData>;
}
