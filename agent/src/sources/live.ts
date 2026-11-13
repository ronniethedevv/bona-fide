/**
 * Live market adapter (P2.2 wiring). Reads a committed account from Binance
 * through the read-only client — GET only (I1) — and maps the responses into the
 * scorer's plain-data shapes. An exchange auth error surfaces as
 * {@link SourceAuthError} so the epoch is scored `KEY_REVOKED`.
 *
 * The runner (P3.3) drives `fetchSample` every `sample_secs` and calls
 * `fetchTrades` / `fetchWithdrawals` at epoch close to assemble an `EpochData`;
 * `ReplaySource` is its scripted counterpart.
 */
import { Decimal } from "decimal.js";
import { z } from "zod";
import { BinanceReadOnlyClient, type BinanceCredential, ExchangeError } from "../exchange/binance.js";
import { type DataSourceKind, type Sample, SourceAuthError, type Trade, type Withdrawal } from "./types.js";

// Documented Binance Spot response shapes (only the fields we read).
const DepthSchema = z.object({
  bids: z.array(z.tuple([z.string(), z.string()])),
  asks: z.array(z.tuple([z.string(), z.string()])),
});
const OpenOrderSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  price: z.string(),
  origQty: z.string(),
});
const MyTradeSchema = z.object({ qty: z.string(), isBuyer: z.boolean() });
const WithdrawSchema = z.object({ amount: z.string(), coin: z.string() });

export interface TimeWindow {
  startTime: number;
  endTime: number;
}

export class LiveMarket {
  constructor(
    private readonly client: BinanceReadOnlyClient,
    private readonly cred: BinanceCredential,
    private readonly symbol: string,
    private readonly base: string,
  ) {}

  dataSource(): DataSourceKind {
    return "Live";
  }

  /** One point-in-time sample: public best bid/ask + the MM's open orders. */
  async fetchSample(): Promise<Sample> {
    const [depthRaw, ordersRaw] = await this.#guardAuth(() =>
      Promise.all([this.client.getDepth(this.symbol, 5), this.client.getOpenOrders(this.cred, this.symbol)]),
    );
    const depth = DepthSchema.parse(depthRaw);
    const orders = z.array(OpenOrderSchema).parse(ordersRaw);
    const bestBid = depth.bids[0]?.[0] ?? "0";
    const bestAsk = depth.asks[0]?.[0] ?? "0";
    return {
      publicBestBid: bestBid,
      publicBestAsk: bestAsk,
      mmBids: orders.filter((o) => o.side === "BUY").map((o) => ({ price: o.price, size: o.origQty })),
      mmAsks: orders.filter((o) => o.side === "SELL").map((o) => ({ price: o.price, size: o.origQty })),
    };
  }

  /** The MM's own trades of the base token in a window. */
  async fetchTrades(window: TimeWindow): Promise<Trade[]> {
    const raw = await this.#guardAuth(() => this.client.getMyTrades(this.cred, this.symbol, window));
    return z
      .array(MyTradeSchema)
      .parse(raw)
      .map((t) => ({ side: t.isBuyer ? ("buy" as const) : ("sell" as const), baseQty: t.qty }));
  }

  /** Base-token withdrawals from the account in a window. */
  async fetchWithdrawals(window: TimeWindow): Promise<Withdrawal[]> {
    const raw = await this.#guardAuth(() =>
      this.client.getWithdrawHistory(this.cred, { coin: this.base, ...window }),
    );
    return z
      .array(WithdrawSchema)
      .parse(raw)
      .filter((w) => w.coin === this.base)
      .map((w) => ({ baseQty: w.amount }));
  }

  /**
   * Free + locked balance of the base token, for epoch reconciliation. Read
   * from the same read-only account endpoint; no extra permission needed.
   */
  async fetchBaseBalance(): Promise<string> {
    const account = await this.#guardAuth(() => this.client.getAccount(this.cred));
    const row = (account.balances ?? []).find((b) => b.asset === this.base);
    if (!row) return "0";
    return new Decimal(row.free).plus(new Decimal(row.locked)).toFixed();
  }

  async #guardAuth<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ExchangeError && err.isAuthError) {
        throw new SourceAuthError();
      }
      throw err;
    }
  }
}
