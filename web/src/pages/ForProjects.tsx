import { Link } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { api } from "../near/contract.js";
import { formatUnixSecs } from "../near/format.js";
import type { Mandate } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";
import { useWallet } from "../near/WalletContext.js";

const DOC = "https://github.com/ronniethedevv/bona-fide/blob/main/docs/FOR-PROJECTS.md";

/**
 * The project's side of the app.
 *
 * Everything else here is built around the market maker: they propose, they
 * connect a key, the record is theirs. The project's whole job is one decision
 * — co-sign this engagement or do not — and until now there was nowhere to see
 * what was waiting on them. A market maker can name any account as the project
 * without asking it, so this is also where an account finds out it has been
 * named.
 */
function Flow() {
  return (
    <ol className="flow">
      <li>
        <strong>Agree the terms</strong> with the market maker: spread, depth, uptime, how much of the loaned
        token may be sold per epoch.
      </li>
      <li>
        <strong>They propose the mandate</strong>, naming your account as the project. They do this, not you —
        whoever proposes is recorded as the market maker.
      </li>
      <li>
        <strong>You co-sign.</strong> Nothing is scored until you do, and only the named account can. That
        co-signature is what makes the record mean anything.
      </li>
      <li>
        <strong>They connect a read-only key</strong> to the enclave, and verdicts appear one per epoch.
      </li>
    </ol>
  );
}

export function ForProjects() {
  const { accountId, signIn } = useWallet();
  const state = useAsync<{ mandates: Mandate[]; allowlisted: boolean }>(async () => {
    if (!accountId) return { mandates: [], allowlisted: false };
    const [mandates, allowlisted] = await Promise.all([
      api.listMandates(),
      api.isProjectAllowlisted(accountId),
    ]);
    return {
      mandates: (mandates as Mandate[]).filter((m) => m.project === accountId),
      allowlisted,
    };
  }, [accountId]);

  const mine = state.data?.mandates ?? [];
  const waiting = mine.filter((m) => m.status === "Proposed");
  const running = mine.filter((m) => m.status !== "Proposed");

  return (
    <section>
      <BackLink to="/directory" label="All market makers" />
      <h1>For projects</h1>
      <p className="lede">
        You are the counterparty, not the subject. The market maker builds a record; your co-signature is what
        makes it worth reading.{" "}
        <a href={DOC} target="_blank" rel="noreferrer">
          The longer version
        </a>
        .
      </p>

      <Flow />

      {!accountId && (
        <>
          <p className="notice notice-status">
            Connect your project wallet to see the mandates that name you, including any proposed without
            asking you first.
          </p>
          <button className="btn" onClick={signIn}>
            Connect the project wallet
          </button>
        </>
      )}

      {accountId && state.loading && <p className="muted">Loading…</p>}
      {accountId && state.error && <p className="error">{state.error}</p>}

      {accountId && !state.loading && !state.error && (
        <>
          <p className="notice notice-status">
            {state.data?.allowlisted
              ? `${accountId} is allowlisted and can co-sign.`
              : `${accountId} is not on the project allowlist, so co-signing will be refused. The allowlist is controlled by the contract owner in this phase.`}
          </p>

          <h2>Waiting for your co-signature</h2>
          {waiting.length === 0 ? (
            <p className="muted">Nothing is waiting on you.</p>
          ) : (
            <>
              <p className="notice">
                A market maker named your account when proposing these. Naming an account does not involve it:
                nothing is scored, and no engagement is counted, until you co-sign. If you did not agree to
                one of these, leave it alone.
              </p>
              <ul className="stack">
                {waiting.map((m) => (
                  <li key={m.id}>
                    <Link to={`/mandate/${m.id}`}>Mandate #{m.id}</Link> ·{" "}
                    <span className="mono">{m.mm}</span> · {m.exchange} {m.pair} · ends{" "}
                    {formatUnixSecs(m.end_ts)}{" "}
                    <Link to={`/mandate/${m.id}/cosign`} className="btn btn-sm">
                      Review and co-sign
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Engagements you co-signed</h2>
          {running.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="stack">
              {running.map((m) => (
                <li key={m.id}>
                  <Link to={`/mandate/${m.id}`}>Mandate #{m.id}</Link> <StatusBadge status={m.status} /> ·{" "}
                  <span className="mono">{m.mm}</span> · {m.exchange} {m.pair}
                  {m.mm === m.project && (
                    <div className="caveat">
                      you are on both sides of this one — no independent counterparty
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
