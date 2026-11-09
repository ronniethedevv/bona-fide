import { BinanceReadOnlyClient, type BinanceCredential } from "./binance.js";
import { checkPermissions, type PermissionCheck } from "./permissions.js";

/**
 * Fetch a key's permissions read-only and classify them. If the permissions
 * endpoint itself cannot be read, the key is rejected as `INVALID` rather than
 * trusted. No write call is ever attempted (invariants I1 + I2).
 */
export async function verifyKeyReadOnly(
  client: BinanceReadOnlyClient,
  cred: BinanceCredential,
): Promise<PermissionCheck> {
  let restrictions: unknown;
  try {
    restrictions = await client.getApiRestrictions(cred);
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  return checkPermissions(restrictions);
}
