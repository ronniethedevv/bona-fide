import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../near/contract.js";
import { bps, bpsToPercent, formatQuote, formatUnixSecs, shortHash } from "../near/format.js";
import { SimulatedBadge } from "../components/SimulatedBadge.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { EpochVerdict, Mandate } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";

export function MandatePage() {
  const { id = "" } = useParams();
  const state = useAsync<{ mandate: Mandate | null; verdicts: EpochVerdict[] }>(
    async () => {
      const [mandate, verdicts] = await Promise.all([api.getMandate(id), api.getVerdicts(id)]);
      return { mandate, verdicts };
    },
    [id],
  );
  const [selected, setSelected] = useState<EpochVerdict | null>(null);

  if (state.loading) return <p className="muted">Loading…</p>;
  if (state.error) return <p className="error">{state.error}</p>;
  const m = state.data?.mandate;
  if (!m) return <p className="muted">Mandate not found.</p>;

  const verdicts = state.data?.verdicts ?? [];
  const simulated = verdicts.some((v) => v.verdict.data_source === "Replay");

  return (
    <section>
      <div className="page-head">
        <h1>
          Mandate #{m.id} <StatusBadge status={m.status} />
        </h1>
        {simulated && <SimulatedBadge />}
      </div>

      <div className="grid-2">
        <dl className="terms">
          <dt>Market maker</dt>
          <dd className="mono">
            <Link to={`/mm/${m.mm}`}>{m.mm}</Link>
          </dd>
          <dt>Project</dt>
          <dd className="mono">{m.project}</dd>
          <dt>Exchange / pair</dt>
          <dd>
            {m.exchange} · {m.pair} <span className="muted">({m.account_label})</span>
          </dd>
          <dt>Max spread</dt>
          <dd>{bps(m.max_spread_bps)}</dd>
          <dt>Min depth / side</dt>
          <dd>{formatQuote(m.min_depth_per_side_quote)} quote (±{m.depth_band_bps / 100}%)</dd>
          <dt>Min uptime</dt>
          <dd>{bpsToPercent(m.min_uptime_bps)}</dd>
          <dt>Loan cap / epoch</dt>
          <dd>{formatQuote(m.loan_cap_per_epoch_base)} base</dd>
          <dt>Epoch / sample</dt>
          <dd>
            {m.epoch_secs}s / {m.sample_secs}s
          </dd>
          <dt>Window</dt>
          <dd>
            {formatUnixSecs(m.start_ts)} → {formatUnixSecs(m.end_ts)}
          </dd>
          <dt>Terms hash</dt>
          <dd className="mono" title={m.terms_hash}>
            {shortHash(m.terms_hash)}
          </dd>
        </dl>

        <div>
          <div className="actions">
            {m.status === "Proposed" && <Link to={`/mandate/${m.id}/cosign`} className="btn">Co-sign</Link>}
            <Link to={`/mandate/${m.id}/key`} className="btn btn-ghost">
              Connect key
            </Link>
          </div>

          <h2>Epoch timeline</h2>
          {verdicts.length === 0 ? (
            <p className="muted">No verdicts yet.</p>
          ) : (
            <div className="timeline">
              {verdicts.map((ev) => (
                <button
                  key={ev.epoch}
                  className={`cell cell-${ev.verdict.status.toLowerCase()}`}
                  title={`Epoch ${ev.epoch}: ${ev.verdict.status}`}
                  onClick={() => setSelected(ev)}
                >
                  {ev.epoch}
                </button>
              ))}
            </div>
          )}

          {selected && <EpochDetail ev={selected} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </section>
  );
}

function EpochDetail({ ev, onClose }: { ev: EpochVerdict; onClose: () => void }) {
  const v = ev.verdict;
  return (
    <div className="detail">
      <div className="detail-head">
        <strong>
          Epoch {ev.epoch} <StatusBadge status={v.status} />
        </strong>
        {v.data_source === "Replay" && <SimulatedBadge />}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="terms">
        <dt>Uptime</dt>
        <dd>{bpsToPercent(v.uptime_bps)}</dd>
        <dt>Coverage</dt>
        <dd>{bpsToPercent(v.coverage_bps)}</dd>
        <dt>Median spread</dt>
        <dd>{bps(v.median_spread_bps)}</dd>
        <dt>Min bid / ask depth</dt>
        <dd>
          {formatQuote(v.min_bid_depth_quote)} / {formatQuote(v.min_ask_depth_quote)}
        </dd>
        <dt>Net sells / withdrawals</dt>
        <dd>
          {formatQuote(v.net_sells_base)} / {formatQuote(v.withdrawals_base)} base
        </dd>
        {v.fail_reasons.length > 0 && (
          <>
            <dt>Fail reasons</dt>
            <dd>{v.fail_reasons.join(", ")}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
