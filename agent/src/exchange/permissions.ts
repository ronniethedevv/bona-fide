/**
 * Layer-2 permission check (invariant I2).
 *
 * Binance exposes an API key's own permissions via a read-only GET:
 *   GET /sapi/v1/account/apiRestrictions
 * We accept a key only when it can read and can do nothing else. A key with any
 * trade, transfer or withdraw right is rejected before first use.
 */

/** Rejection codes returned to the browser on the connect-key screen. */
export type RejectionReason = "TRADE_ENABLED" | "WITHDRAW_ENABLED" | "INVALID";

export type PermissionCheck = { ok: true } | { ok: false; reason: RejectionReason };

/** Shape of the Binance apiRestrictions response (fields we care about). */
export interface ApiRestrictions {
  enableReading?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  permitsUniversalTransfer?: boolean;
}

/**
 * Classify an apiRestrictions response. Fund-movement rights
 * (withdraw / transfer) outrank trade rights in the reported reason, and a key
 * that cannot even read, or whose response is malformed, is `INVALID`.
 */
export function checkPermissions(response: unknown): PermissionCheck {
  if (typeof response !== "object" || response === null) {
    return { ok: false, reason: "INVALID" };
  }
  const r = response as Record<string, unknown>;

  const flag = (k: string): boolean => r[k] === true;
  const present = (k: string): boolean => typeof r[k] === "boolean";

  // Must explicitly report reading enabled.
  if (!present("enableReading") || !flag("enableReading")) {
    return { ok: false, reason: "INVALID" };
  }

  if (flag("enableWithdrawals") || flag("enableInternalTransfer") || flag("permitsUniversalTransfer")) {
    return { ok: false, reason: "WITHDRAW_ENABLED" };
  }

  if (flag("enableSpotAndMarginTrading") || flag("enableMargin") || flag("enableFutures")) {
    return { ok: false, reason: "TRADE_ENABLED" };
  }

  return { ok: true };
}
