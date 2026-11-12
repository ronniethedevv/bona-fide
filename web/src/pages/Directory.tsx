import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../near/contract.js";
import { bpsToPercent, formatTimestampMs } from "../near/format.js";
import type { MmListing, MmSummary } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";

function total(s: MmSummary): number {
  return s.pass + s.fail + s.missed + s.outage;
}
function passPct(s: MmSummary): string {
  const t = total(s);
  return t === 0 ? "—" : bpsToPercent(Math.round((s.pass / t) * 10000));
}

export function Directory() {
  const { loading, error, data } = useAsync<MmListing[]>(() => api.listMms(), []);
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => (data ?? []).filter((r) => r.account_id.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  return (
    <section>
      <div className="page-head">
        <h1>Market makers</h1>
        <input
          className="search"
          placeholder="Search by account"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">Could not load the directory: {error}</p>}
      {!loading && !error && rows.length === 0 && <p className="muted">No market makers yet.</p>}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Engagements</th>
              <th className="num">Epochs scored</th>
              <th className="num">Pass rate</th>
              <th className="num">Loan-safety fails</th>
              <th>Last verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_id}>
                <td>
                  <Link to={`/mm/${r.account_id}`}>{r.account_id}</Link>
                </td>
                <td className="num">{r.summary.engagements}</td>
                <td className="num">{total(r.summary)}</td>
                <td className="num">{passPct(r.summary)}</td>
                <td className="num">{r.summary.fail}</td>
                <td>{formatTimestampMs(r.summary.last_verdict_ms)}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
