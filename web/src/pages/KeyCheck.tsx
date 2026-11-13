import { useMemo, useState } from "react";
import { SimulatedBadge } from "../components/SimulatedBadge.js";
import { CANNED_KEYS, checkPermissions, type PermissionCheck } from "../keycheck.js";

const REASON_TEXT: Record<string, string> = {
  TRADE_ENABLED: "This key can trade — rejected.",
  WITHDRAW_ENABLED: "This key can withdraw or transfer — rejected.",
  INVALID: "Not a verifiable read-only key — rejected.",
};

export function KeyCheck() {
  const [id, setId] = useState(CANNED_KEYS[1]!.id); // default to a trade key
  const selected = useMemo(() => CANNED_KEYS.find((k) => k.id === id)!, [id]);
  const [result, setResult] = useState<PermissionCheck | null>(null);

  return (
    <section>
      <div className="page-head">
        <h1>Try the key check</h1>
        <SimulatedBadge />
      </div>
      <p className="notice">
        This runs BonaFide's read-only permission check against <strong>canned exchange responses</strong> —
        no real key, no exchange account. It is exactly the check the enclave runs on a submitted key.
      </p>

      <div className="form form-narrow">
        <label className="field">
          <span>Pretend the exchange says this key is…</span>
          <select className="search" value={id} onChange={(e) => { setId(e.target.value); setResult(null); }}>
            {CANNED_KEYS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <div className="hash-preview">
          <span className="card-label">Canned GET /sapi/v1/account/apiRestrictions</span>
          <pre className="mono">{JSON.stringify(selected.restrictions, null, 2)}</pre>
        </div>

        <button className="btn" onClick={() => setResult(checkPermissions(selected.restrictions))}>
          Run the check
        </button>
      </div>

      {result?.ok && <p className="ok">Accepted — read-only. The enclave would hold this key.</p>}
      {result && !result.ok && <p className="error">{REASON_TEXT[result.reason]}</p>}
    </section>
  );
}
