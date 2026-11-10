/**
 * Verdict submission (P3.4). Orchestration is a pure loop over an injectable
 * sink, so it is fully testable; the real sink calls the contract's
 * `submit_verdict` through the attested Shade Agent client.
 */
import type { ShadeClient } from "@neardefi/shade-agent-js";
import type { VerdictInput } from "./contract.js";
import type { VerdictSink } from "./runner.js";

const SUBMIT_GAS = BigInt("300000000000000"); // 300 TGas

/** Submit a sequence of verdicts for consecutive epochs starting at `fromEpoch`. */
export async function submitVerdicts(
  sink: VerdictSink,
  mandateId: number,
  verdicts: VerdictInput[],
  opts: { fromEpoch?: number } = {},
): Promise<void> {
  const from = opts.fromEpoch ?? 0;
  for (let i = 0; i < verdicts.length; i += 1) {
    await sink.submitVerdict(mandateId, from + i, verdicts[i]!);
  }
}

/**
 * A sink backed by the Shade Agent client. The agent signs with its TEE-derived
 * key, so the contract accepts the verdict only while the agent's attested code
 * is approved (I5). `mandate_id` is a U64 → sent as a string.
 */
export function shadeVerdictSink(agent: Pick<ShadeClient, "call">): VerdictSink {
  return {
    async submitVerdict(mandateId, epoch, verdict) {
      await agent.call({
        methodName: "submit_verdict",
        args: { mandate_id: String(mandateId), epoch, verdict },
        gas: SUBMIT_GAS,
      });
    },
  };
}
