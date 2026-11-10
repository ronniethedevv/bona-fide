import { describe, expect, it } from "vitest";
import { SCORING_VERSION } from "../src/scoring/index.js";

// Placeholder test so the agent test suite runs green in CI from Phase 0.
// Real scoring unit + property tests arrive in P3.1 (invariant I4).
describe("scoring (phase 0 placeholder)", () => {
  it("exposes a stable module version", () => {
    expect(SCORING_VERSION).toBe("0.0.0-phase0");
  });
});
