/**
 * Sample scheduling (anti-gaming).
 *
 * Sampling at a fixed cadence is predictable: epoch start and `sample_secs` are
 * public on-chain, so a market maker could post quotes only around the moments
 * it knows will be observed ("flicker quoting") and pass uptime while providing
 * almost no real liquidity in between.
 *
 * Each sample is therefore taken at a pseudo-random offset inside its own
 * window. The offset is derived from the enclave's TEE key, so it is:
 *   - unpredictable to the MM (the key never leaves the enclave), and
 *   - deterministic and reproducible for audit (same key + mandate + epoch +
 *     index always yields the same schedule).
 *
 * Exactly `expected` samples are still taken, one per window, so coverage and
 * uptime arithmetic is unchanged.
 */
import { createHmac } from "node:crypto";

/** Derive the jitter key from the enclave seed. Never leaves the enclave. */
export function deriveJitterKey(seed: Uint8Array): Buffer {
  return createHmac("sha256", Buffer.from(seed)).update("bona-fide/sample-jitter/v1").digest();
}

export interface JitterConfig {
  key: Buffer;
  mandateId: number;
  epoch: number;
}

/**
 * Offset in milliseconds within the sample window `[0, sampleSecs * 1000)`.
 * Deterministic for a given (key, mandate, epoch, index).
 */
export function sampleOffsetMs(jitter: JitterConfig, index: number, sampleSecs: number): number {
  const windowMs = sampleSecs * 1000;
  if (windowMs <= 0) return 0;
  const digest = createHmac("sha256", jitter.key)
    .update(`${jitter.mandateId}:${jitter.epoch}:${index}`)
    .digest();
  // 6 bytes (<= 2^48) keeps modulo bias negligible for any realistic window.
  return digest.readUIntBE(0, 6) % windowMs;
}

/**
 * The planned sample times for an epoch, relative to `startMs`. Sample `i` lands
 * somewhere inside window `i`, so the schedule is strictly increasing.
 */
export function plannedSampleTimes(
  startMs: number,
  expectedSamples: number,
  sampleSecs: number,
  jitter?: JitterConfig,
): number[] {
  const windowMs = sampleSecs * 1000;
  const times: number[] = [];
  for (let i = 0; i < expectedSamples; i += 1) {
    const offset = jitter ? sampleOffsetMs(jitter, i, sampleSecs) : 0;
    times.push(startMs + i * windowMs + offset);
  }
  return times;
}
