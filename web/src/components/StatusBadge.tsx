import type { MandateStatus, VerdictStatus } from "../near/types.js";

type Status = VerdictStatus | MandateStatus;

/** Colour always paired with a text label (ui_context.md). Missed is hatched. */
export function StatusBadge({ status }: { status: Status }) {
  const cls = `badge badge-${status.toLowerCase()}`;
  return (
    <span className={cls} role="status">
      {status}
    </span>
  );
}
