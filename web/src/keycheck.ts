/**
 * Browser copy of the agent's read-only permission check (I2), for the simulated
 * "try the key check" panel (P5.3). Runs entirely on canned exchange responses —
 * no real key, no agent, no network — so judges can see a trade-enabled key
 * rejected without an exchange account.
 */
export type RejectionReason = "TRADE_ENABLED" | "WITHDRAW_ENABLED" | "INVALID";
export type PermissionCheck = { ok: true } | { ok: false; reason: RejectionReason };

export interface ApiRestrictions {
  enableReading?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  permitsUniversalTransfer?: boolean;
}

export function checkPermissions(response: unknown): PermissionCheck {
  if (typeof response !== "object" || response === null) return { ok: false, reason: "INVALID" };
  const r = response as Record<string, unknown>;
  const flag = (k: string): boolean => r[k] === true;
  if (typeof r.enableReading !== "boolean" || !flag("enableReading")) return { ok: false, reason: "INVALID" };
  if (flag("enableWithdrawals") || flag("enableInternalTransfer") || flag("permitsUniversalTransfer")) {
    return { ok: false, reason: "WITHDRAW_ENABLED" };
  }
  if (flag("enableSpotAndMarginTrading") || flag("enableMargin") || flag("enableFutures")) {
    return { ok: false, reason: "TRADE_ENABLED" };
  }
  return { ok: true };
}

const READ_ONLY: ApiRestrictions = {
  enableReading: true,
  enableSpotAndMarginTrading: false,
  enableMargin: false,
  enableFutures: false,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
};

export interface CannedKey {
  id: string;
  label: string;
  restrictions: ApiRestrictions;
}

export const CANNED_KEYS: CannedKey[] = [
  { id: "read", label: "Read-only key (good)", restrictions: READ_ONLY },
  {
    id: "trade",
    label: "Trade-enabled key",
    restrictions: { ...READ_ONLY, enableSpotAndMarginTrading: true },
  },
  { id: "withdraw", label: "Withdraw-enabled key", restrictions: { ...READ_ONLY, enableWithdrawals: true } },
];
