import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDemoScenarios } from "../src/demo.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/replay", import.meta.url));

// P5.1 — the demo story, proven in code (no chain, no exchange account).
describe("demo story", () => {
  it("honest passes, dumping fails on the loan cap, dangerous keys are rejected", async () => {
    const r = await runDemoScenarios(FIXTURES_DIR);

    // 1. Honest MM — every epoch passes.
    expect(r.honest.length).toBeGreaterThan(0);
    expect(r.honest.every((v) => v.status === "Pass")).toBe(true);

    // 2. Dumping MM — fails on the loan cap.
    expect(r.dumping[0]!.status).toBe("Fail");
    expect(r.dumping[0]!.fail_reasons).toContain("LOAN_CAP");

    // 3. Dangerous keys — rejected on sight by the read-only permission check.
    expect(r.readOnlyKey).toEqual({ ok: true });
    expect(r.tradeKey).toEqual({ ok: false, reason: "TRADE_ENABLED" });
    expect(r.withdrawKey).toEqual({ ok: false, reason: "WITHDRAW_ENABLED" });
  });
});
