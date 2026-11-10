import { describe, expect, it } from "vitest";
import { checkPermissions } from "../src/exchange/permissions.js";

const READ_ONLY = {
  enableReading: true,
  enableSpotAndMarginTrading: false,
  enableMargin: false,
  enableFutures: false,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
};

// Invariant I2: a key with any trade, transfer or withdraw right is never accepted.
describe("checkPermissions (I2)", () => {
  it("accepts a strictly read-only key", () => {
    expect(checkPermissions(READ_ONLY)).toEqual({ ok: true });
  });

  it.each([
    ["enableWithdrawals", "WITHDRAW_ENABLED"],
    ["enableInternalTransfer", "WITHDRAW_ENABLED"],
    ["permitsUniversalTransfer", "WITHDRAW_ENABLED"],
    ["enableSpotAndMarginTrading", "TRADE_ENABLED"],
    ["enableMargin", "TRADE_ENABLED"],
    ["enableFutures", "TRADE_ENABLED"],
  ])("rejects when %s is enabled → %s", (field, reason) => {
    expect(checkPermissions({ ...READ_ONLY, [field]: true })).toEqual({ ok: false, reason });
  });

  it("reports fund-movement before trading when both are set", () => {
    expect(
      checkPermissions({ ...READ_ONLY, enableSpotAndMarginTrading: true, enableWithdrawals: true }),
    ).toEqual({ ok: false, reason: "WITHDRAW_ENABLED" });
  });

  it.each([
    ["reading disabled", { ...READ_ONLY, enableReading: false }],
    ["reading missing", { enableSpotAndMarginTrading: false }],
    ["not an object", 42],
    ["null", null],
  ])("treats %s as INVALID", (_label, input) => {
    expect(checkPermissions(input)).toEqual({ ok: false, reason: "INVALID" });
  });
});
