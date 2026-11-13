/**
 * `npm run demo:replay` — scores the honest and dumping replay fixtures with the
 * demo mandate terms and prints the verdicts that would be recorded on-chain.
 *
 * This is the offline dry-run: it proves the scoring story with no chain and no
 * exchange account. The on-chain version (propose → co-sign → submit, printing
 * the mandate page URL) runs after the contract is deployed and seeded (P5.2);
 * it needs AGENT_CONTRACT_ID + VITE_CONTRACT_ID set.
 */
import { runDemoScenarios, type DemoResult } from "../src/demo.js";
import type { VerdictInput } from "../src/contract.js";

function line(label: string, verdicts: VerdictInput[]): void {
  const cells = verdicts
    .map((v, e) => `epoch ${e}: ${v.status}${v.fail_reasons.length ? ` (${v.fail_reasons.join(",")})` : ""}`)
    .join("  |  ");
  // eslint-disable-next-line no-console
  console.log(`  ${label.padEnd(12)} ${cells}`);
}

async function main(): Promise<void> {
  const r: DemoResult = await runDemoScenarios();
  // eslint-disable-next-line no-console
  console.log("\nBonaFide — replay dry-run (simulated data, scored by the real scorer)\n");
  line("honest-mm", r.honest);
  line("dumping-mm", r.dumping);
  // eslint-disable-next-line no-console
  console.log("\n  Key permission check (canned exchange responses):");
  // eslint-disable-next-line no-console
  console.log(`    read-only key   → ${r.readOnlyKey.ok ? "ACCEPTED" : "rejected"}`);
  // eslint-disable-next-line no-console
  console.log(`    trade key       → ${r.tradeKey.ok ? "accepted" : `REJECTED (${r.tradeKey.reason})`}`);
  // eslint-disable-next-line no-console
  console.log(
    `    withdraw key    → ${r.withdrawKey.ok ? "accepted" : `REJECTED (${r.withdrawKey.reason})`}`,
  );
  // eslint-disable-next-line no-console
  console.log("\n  To record these on testnet, deploy the contract (see DEPLOY.md) and run with env set.\n");
}

void main();
