import { Link, useParams } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { api } from "../near/contract.js";
import { bpsToPercent } from "../near/format.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { Mandate, MmSummary } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";

function pct(n: number, total: number): string {
  return total === 0 ? "—" : bpsToPercent(Math.round((n / total) * 10000));
}

export function MmProfile() {
  const { account = "" } = useParams();
  const state = useAsync<{ summary: MmSummary | null; mandates: Mandate[] }>(
    async () => {
      const [summary, mandates] = await Promise.all([api.getMmSummary(account), api.listMandates()]);
      return { summary, mandates: mandates.filter((m) => m.mm === account) };
    },
    [account],
  );

  const total = state.data?.summary
    ? state.data.summary.pass + state.data.summary.fail + state.data.summary.missed + state.data.summary.outage
    : 0;
  const s = state.data?.summary;

  return (
    <section>
      <BackLink to="/directory" label="All market makers" />
      <h1 className="mono">{account}</h1>
      {state.loading && <p className="muted">Loading…</p>}
      {state.error && <p className="error">{state.error}</p>}

      {s && (
        <div className="cards">
          <Card label="Engagements" value={String(s.engagements)} />
          <Card label="Pass" value={pct(s.pass, total)} tone="pass" />
          <Card label="Fail" value={pct(s.fail, total)} tone="fail" />
          <Card label="Missed" value={pct(s.missed, total)} tone="missed" />
          <Card label="Outage" value={pct(s.outage, total)} tone="outage" />
        </div>
      )}

      <h2>Mandates</h2>
      {state.data && state.data.mandates.length === 0 && <p className="muted">No mandates.</p>}
      <ul className="list">
        {state.data?.mandates.map((m) => (
          <li key={m.id}>
            <Link to={`/mandate/${m.id}`}>
              #{m.id} · {m.pair} · {m.exchange}
            </Link>
            <StatusBadge status={m.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`card${tone ? ` card-${tone}` : ""}`}>
      <div className="card-value">{value}</div>
      <div className="card-label">{label}</div>
    </div>
  );
}
