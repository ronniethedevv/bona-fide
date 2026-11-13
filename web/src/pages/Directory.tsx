import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../near/contract.js";
import { bpsToPercent, formatTimestampMs } from "../near/format.js";
import type { Mandate, MmListing, MmSummary } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";

interface Row {
  listing: MmListing;
  /** The projects that co-signed this market maker's mandates. */
  vouchers: string[];
  /** True when a mandate names the same account as both sides. */
  selfCosigned: boolean;
}

function total(s: MmSummary): number {
  return s.pass + s.fail + s.missed + s.outage;
}
function passPct(s: MmSummary): string {
  const t = total(s);
  return t === 0 ? "—" : bpsToPercent(Math.round((s.pass / t) * 10000));
}

async function loadRows(): Promise<Row[]> {
  const [mms, mandates] = await Promise.all([api.listMms(), api.listMandates()]);
  return (mms as MmListing[]).map((listing) => {
    const mine = (mandates as Mandate[]).filter((m) => m.mm === listing.account_id);
    return {
      listing,
      vouchers: [...new Set(mine.map((m) => m.project))],
      selfCosigned: mine.some((m) => m.project === m.mm),
    };
  });
}

export function Directory() {
  const { loading, error, data } = useAsync<Row[]>(loadRows, []);
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => (data ?? []).filter((r) => r.listing.account_id.toLowerCase().includes(q.toLowerCase())),
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

      {/* Say plainly what being listed here does and does not mean. */}
      <p className="notice">
        An account appears here once an <strong>allowlisted project co-signed an engagement</strong> with it.
        That is a counterparty vouching for a deal — it is <strong>not</strong> an identity check, and anyone
        may propose a mandate naming themselves as the market maker.
      </p>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">Could not load the directory: {error}</p>}
      {!loading && !error && rows.length === 0 && <p className="muted">No market makers yet.</p>}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Vouched for by</th>
                <th className="num">Engagements</th>
                <th className="num">Epochs scored</th>
                <th className="num">Pass rate</th>
                <th className="num">Loan-safety fails</th>
                <th>Last verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ listing: r, vouchers, selfCosigned }) => (
                <tr key={r.account_id}>
                  <td>
                    <Link to={`/mm/${r.account_id}`}>{r.account_id}</Link>
                  </td>
                  <td className="mono">
                    {vouchers.length === 0 ? <span className="muted">—</span> : vouchers.join(", ")}
                    {selfCosigned && (
                      <div
                        className="caveat"
                        title="A mandate names this account as both the market maker and the project, so no independent party vouched for it."
                      >
                        self-co-signed
                      </div>
                    )}
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
