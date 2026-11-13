import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BinanceReadOnlyClient, ExchangeError, type Transport } from "../src/exchange/binance.js";

const CRED = { apiKey: "KEY123", apiSecret: "SECRET456" };

interface Captured {
  url: string;
  headers: Record<string, string>;
}

function capturing(status: number, body: string): { transport: Transport; calls: Captured[] } {
  const calls: Captured[] = [];
  const transport: Transport = async ({ url, headers }) => {
    calls.push({ url, headers: { ...headers } });
    return { status, body };
  };
  return { transport, calls };
}

// Invariant I1: the exchange client exposes only GET requests.
describe("binance client (I1) — GET only", () => {
  it("contains no write HTTP methods in its code", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/exchange/binance.ts", import.meta.url)), "utf8");
    // Strip comments/prose first — the check is about invoked methods, not docs.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(POST|PUT|DELETE|PATCH)\b/);
    // The only HTTP-method literal is the hardcoded GET in the transport.
    const methods = [...code.matchAll(/method:\s*["']([A-Z]+)["']/g)].map((m) => m[1]);
    expect(methods).toEqual(["GET"]);
  });
});

describe("binance signing", () => {
  it("signs the query and sends the key in a header, never the secret in the URL", async () => {
    const { transport, calls } = capturing(200, "{}");
    const client = new BinanceReadOnlyClient({ transport, now: () => 1700000000000, recvWindow: 5000 });
    await client.getApiRestrictions(CRED);

    expect(calls).toHaveLength(1);
    const { url, headers } = calls[0]!;
    expect(headers["X-MBX-APIKEY"]).toBe("KEY123");
    expect(url).not.toContain("SECRET456");

    // Recompute the signature over the query string and confirm it matches.
    const [, qs] = url.split("?");
    const params = qs!.split("&");
    const sigParam = params.find((p) => p.startsWith("signature="))!;
    const signed = params.filter((p) => !p.startsWith("signature=")).join("&");
    const expected = createHmac("sha256", CRED.apiSecret).update(signed).digest("hex");
    expect(sigParam).toBe(`signature=${expected}`);
    expect(signed).toContain("timestamp=1700000000000");
    expect(signed).toContain("recvWindow=5000");
  });

  it("does not authenticate the public order book", async () => {
    const { transport, calls } = capturing(200, '{"bids":[["1.0","5"]],"asks":[["1.1","5"]]}');
    const client = new BinanceReadOnlyClient({ transport });
    const depth = await client.getDepth("TOKENUSDT", 5);
    expect(depth.bids[0]).toEqual(["1.0", "5"]);
    expect(calls[0]!.headers["X-MBX-APIKEY"]).toBeUndefined();
    expect(calls[0]!.url).not.toContain("signature=");
  });

  it("throws an auth-flagged ExchangeError on 401 without leaking the secret", async () => {
    const { transport } = capturing(401, '{"code":-2015,"msg":"Invalid API-key"}');
    const client = new BinanceReadOnlyClient({ transport, now: () => 1 });
    try {
      await client.getMyTrades(CRED, "TOKENUSDT");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeError);
      const e = err as ExchangeError;
      expect(e.isAuthError).toBe(true);
      expect(e.message).not.toContain("SECRET456");
    }
  });
});
