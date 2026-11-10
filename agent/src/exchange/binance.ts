/**
 * Read-only Binance Spot client (invariant I1).
 *
 * Every helper issues a GET. There is no POST/PUT/DELETE and no order, cancel,
 * transfer or withdraw call anywhere in this module — a static test asserts it.
 * The single `transport` chokepoint hardcodes the GET method; callers cannot
 * change it. Signed requests put the key in the `X-MBX-APIKEY` header and sign
 * the query string with HMAC-SHA256; the signature and secret are never logged
 * or placed in thrown error messages.
 */
import { createHmac } from "node:crypto";
import type { ApiRestrictions } from "./permissions.js";

export interface BinanceCredential {
  readonly apiKey: string;
  readonly apiSecret: string;
}

/** A GET-only transport. Returns the HTTP status and raw body text. */
export type Transport = (request: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}) => Promise<{ status: number; body: string }>;

export interface BinanceClientOptions {
  baseUrl?: string;
  transport?: Transport;
  recvWindow?: number;
  now?: () => number;
}

/** An exchange error that carries status + exchange body, never request secrets. */
export class ExchangeError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Binance GET ${path} failed with status ${status}`);
    this.name = "ExchangeError";
  }

  /** True when the exchange rejected the credential (key revoked / invalid). */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 418;
  }
}

const DEFAULT_BASE_URL = "https://api.binance.com";

/** Default transport over global fetch. Method is fixed to GET. */
const fetchTransport: Transport = async ({ url, headers }) => {
  const res = await fetch(url, { method: "GET", headers });
  return { status: res.status, body: await res.text() };
};

export class BinanceReadOnlyClient {
  readonly #baseUrl: string;
  readonly #transport: Transport;
  readonly #recvWindow: number;
  readonly #now: () => number;

  constructor(options: BinanceClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#transport = options.transport ?? fetchTransport;
    this.#recvWindow = options.recvWindow ?? 5000;
    this.#now = options.now ?? Date.now;
  }

  /** GET /sapi/v1/account/apiRestrictions — the key's own permissions. */
  getApiRestrictions(cred: BinanceCredential): Promise<ApiRestrictions> {
    return this.#signedGet("/sapi/v1/account/apiRestrictions", {}, cred);
  }

  /** GET /api/v3/openOrders — the account's open orders for a symbol. */
  getOpenOrders(cred: BinanceCredential, symbol: string): Promise<unknown[]> {
    return this.#signedGet("/api/v3/openOrders", { symbol }, cred);
  }

  /** GET /api/v3/myTrades — the account's own trade history for a symbol. */
  getMyTrades(
    cred: BinanceCredential,
    symbol: string,
    params: { startTime?: number; endTime?: number; limit?: number } = {},
  ): Promise<unknown[]> {
    return this.#signedGet("/api/v3/myTrades", { symbol, ...params }, cred);
  }

  /** GET /sapi/v1/capital/withdraw/history — withdrawal records. */
  getWithdrawHistory(
    cred: BinanceCredential,
    params: { coin?: string; startTime?: number; endTime?: number } = {},
  ): Promise<unknown[]> {
    return this.#signedGet("/sapi/v1/capital/withdraw/history", params, cred);
  }

  /** GET /api/v3/depth — the public order book (no credential). */
  getDepth(symbol: string, limit = 100): Promise<{ bids: [string, string][]; asks: [string, string][] }> {
    return this.#publicGet("/api/v3/depth", { symbol, limit });
  }

  async #publicGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const query = toQuery(params);
    const url = `${this.#baseUrl}${path}${query ? `?${query}` : ""}`;
    return this.#doGet<T>(path, url, {});
  }

  async #signedGet<T>(
    path: string,
    params: Record<string, string | number>,
    cred: BinanceCredential,
  ): Promise<T> {
    const signedParams = { ...params, recvWindow: this.#recvWindow, timestamp: this.#now() };
    const query = toQuery(signedParams);
    const signature = createHmac("sha256", cred.apiSecret).update(query).digest("hex");
    const url = `${this.#baseUrl}${path}?${query}&signature=${signature}`;
    return this.#doGet<T>(path, url, { "X-MBX-APIKEY": cred.apiKey });
  }

  /** The single GET chokepoint. No other HTTP method is reachable from here. */
  async #doGet<T>(path: string, url: string, extraHeaders: Record<string, string>): Promise<T> {
    const { status, body } = await this.#transport({ url, headers: { ...extraHeaders } });
    if (status < 200 || status >= 300) {
      // Deliberately excludes the URL (which carries the signature) and the key.
      throw new ExchangeError(status, path, body.slice(0, 512));
    }
    return JSON.parse(body) as T;
  }
}

/** Deterministic query string (sorted keys) for stable signing. */
function toQuery(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
}
