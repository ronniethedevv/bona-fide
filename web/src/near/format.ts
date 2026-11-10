/** Display formatters (ui_context.md). Fixed-point via BigInt — no float drift. */

/** A 1e6-scaled integer string → a decimal string with `decimals` places. */
export function fromScaled(scaled: string, decimals = 2): string {
  let neg = false;
  let s = scaled.trim();
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  const SCALE = 1_000_000n;
  let v: bigint;
  try {
    v = BigInt(s || "0");
  } catch {
    return scaled;
  }
  const whole = v / SCALE;
  const frac = v % SCALE;
  const fracStr = frac.toString().padStart(6, "0").slice(0, decimals);
  const out = decimals > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  return neg ? `-${out}` : out;
}

/** Depth/loan in quote or base units with grouping, 2 decimals. */
export function formatQuote(scaled: string): string {
  const [whole, frac] = fromScaled(scaled, 2).split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Basis points → percent with 1 decimal (e.g. 9500 → "95.0%"). */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export function bps(n: number): string {
  return `${n} bps`;
}

export function formatTimestampMs(ms: string): string {
  const n = Number(ms);
  if (!n) return "—";
  return new Date(n).toLocaleString();
}

/** Unix seconds (string) → locale date. */
export function formatUnixSecs(secs: string): string {
  const n = Number(secs);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleDateString();
}

export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}
