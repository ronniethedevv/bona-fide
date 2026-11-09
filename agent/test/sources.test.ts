import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BinanceReadOnlyClient, type Transport } from "../src/exchange/binance.js";
import { LiveMarket } from "../src/sources/live.js";
import { loadReplayFixture, ReplaySource } from "../src/sources/replay.js";
import { SourceAuthError } from "../src/sources/types.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/replay", import.meta.url));
const SCENARIOS = ["honest-mm", "dumping-mm", "key-revoked", "outage"];

describe("replay source (P2.4, I9)", () => {
  it.each(SCENARIOS)("loads %s and labels it Replay", async (name) => {
    const source = new ReplaySource(await loadReplayFixture(name, FIXTURES_DIR));
    expect(source.dataSource()).toBe("Replay");
    expect(source.expectedSamples()).toBe(4); // 120s / 30s
    expect(source.epochCount()).toBeGreaterThanOrEqual(1);
  });

  it("serves honest-mm epoch data", async () => {
    const source = new ReplaySource(await loadReplayFixture("honest-mm", FIXTURES_DIR));
    const epoch = await source.readEpoch(0);
    expect(epoch.samples).toHaveLength(4);
    expect(epoch.samples[0]!.mmBids[0]!.size).toBe("20000");
  });

  it("surfaces a revoked key as SourceAuthError", async () => {
    const source = new ReplaySource(await loadReplayFixture("key-revoked", FIXTURES_DIR));
    await expect(source.readEpoch(1)).rejects.toBeInstanceOf(SourceAuthError);
  });

  it("outage epoch has fewer samples than expected", async () => {
    const source = new ReplaySource(await loadReplayFixture("outage", FIXTURES_DIR));
    const epoch = await source.readEpoch(0);
    expect(epoch.samples.length).toBeLessThan(source.expectedSamples());
    expect(epoch.serverErrors).toBe(true);
  });
});

describe("live market (GET-only mapping)", () => {
  const cred = { apiKey: "K", apiSecret: "S" };

  function clientReturning(byPath: Record<string, unknown>, status = 200): BinanceReadOnlyClient {
    const transport: Transport = async ({ url }) => {
      const path = new URL(url).pathname;
      return { status, body: JSON.stringify(byPath[path] ?? {}) };
    };
    return new BinanceReadOnlyClient({ transport, now: () => 1 });
  }

  it("maps depth + open orders into a sample", async () => {
    const client = clientReturning({
      "/api/v3/depth": { bids: [["1.00", "10"]], asks: [["1.02", "10"]] },
      "/api/v3/openOrders": [
        { side: "BUY", price: "0.99", origQty: "20000" },
        { side: "SELL", price: "1.03", origQty: "20000" },
      ],
    });
    const live = new LiveMarket(client, cred, "TOKENUSDT", "TOKEN");
    expect(live.dataSource()).toBe("Live");
    const sample = await live.fetchSample();
    expect(sample.publicBestBid).toBe("1.00");
    expect(sample.mmBids).toEqual([{ price: "0.99", size: "20000" }]);
    expect(sample.mmAsks).toEqual([{ price: "1.03", size: "20000" }]);
  });

  it("maps my trades into base-token trades", async () => {
    const client = clientReturning({
      "/api/v3/myTrades": [
        { qty: "5.0", isBuyer: false },
        { qty: "1.0", isBuyer: true },
      ],
    });
    const live = new LiveMarket(client, cred, "TOKENUSDT", "TOKEN");
    const trades = await live.fetchTrades({ startTime: 0, endTime: 1 });
    expect(trades).toEqual([
      { side: "sell", baseQty: "5.0" },
      { side: "buy", baseQty: "1.0" },
    ]);
  });

  it("turns an auth error into SourceAuthError", async () => {
    const transport: Transport = async () => ({ status: 403, body: '{"msg":"revoked"}' });
    const client = new BinanceReadOnlyClient({ transport, now: () => 1 });
    const live = new LiveMarket(client, cred, "TOKENUSDT", "TOKEN");
    await expect(live.fetchSample()).rejects.toBeInstanceOf(SourceAuthError);
  });
});
