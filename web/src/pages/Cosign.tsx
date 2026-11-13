import { useState } from "react";
import { BackLink } from "../components/BackLink.js";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../near/contract.js";
import { bps, bpsToPercent, formatQuote, shortHash } from "../near/format.js";
import type { Mandate } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";
import { useWallet } from "../near/WalletContext.js";

export function Cosign() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { accountId, signIn, call } = useWallet();
  const state = useAsync<{ mandate: Mandate | null; allowlisted: boolean }>(
    async () => {
      const mandate = await api.getMandate(id);
      const allowlisted = mandate ? await api.isProjectAllowlisted(mandate.project) : false;
      return { mandate, allowlisted };
    },
    [id],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (state.loading)
    return (
      <section>
        <BackLink to={`/mandate/${id}`} label={`Mandate #${id}`} />
        <p className="muted">Loading…</p>
      </section>
    );
  const m = state.data?.mandate;
  if (!m)
    return (
      <section>
        <BackLink to="/directory" label="All market makers" />
        <p className="muted">Mandate #{id} is not on this contract.</p>
      </section>
    );

  const isProject = accountId === m.project;
  const canSign = isProject && state.data?.allowlisted && m.status === "Proposed";

  async function cosign() {
    setErr(null);
    setBusy(true);
    try {
      await call("cosign_mandate", { id });
      navigate(`/mandate/${id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <BackLink to={`/mandate/${m.id}`} label={`Mandate #${m.id}`} />
      <h1>Co-sign mandate #{m.id}</h1>
      <p className="muted">
        Review the terms and hash. Co-signing activates the mandate and starts the record.
      </p>

      <dl className="terms">
        <dt>Market maker</dt>
        <dd className="mono">{m.mm}</dd>
        <dt>Project</dt>
        <dd className="mono">{m.project}</dd>
        <dt>Exchange / pair</dt>
        <dd>
          {m.exchange} · {m.pair}
        </dd>
        <dt>Max spread</dt>
        <dd>{bps(m.max_spread_bps)}</dd>
        <dt>Min depth / side</dt>
        <dd>{formatQuote(m.min_depth_per_side_quote)} quote</dd>
        <dt>Min uptime</dt>
        <dd>{bpsToPercent(m.min_uptime_bps)}</dd>
        <dt>Loan cap / epoch</dt>
        <dd>{formatQuote(m.loan_cap_per_epoch_base)} base</dd>
        <dt>Terms hash</dt>
        <dd className="mono" title={m.terms_hash}>
          {shortHash(m.terms_hash)}
        </dd>
      </dl>

      {m.status !== "Proposed" && <p className="muted">This mandate is {m.status}.</p>}
      {!accountId && (
        <button className="btn" onClick={signIn}>
          Connect the project wallet
        </button>
      )}
      {accountId && !isProject && (
        <p className="error">Connected as {accountId}; only the named project ({m.project}) can co-sign.</p>
      )}
      {accountId && isProject && !state.data?.allowlisted && (
        <p className="error">This project is not allowlisted by the contract owner yet.</p>
      )}
      {err && <p className="error">{err}</p>}
      {canSign && (
        <button className="btn" onClick={() => void cosign()} disabled={busy}>
          {busy ? "Signing…" : "Co-sign and activate"}
        </button>
      )}
    </section>
  );
}
