import { useState } from "react";
import { BackLink } from "../components/BackLink.js";
import { useParams } from "react-router-dom";
import { resolveEnclavePubkey } from "../near/contract.js";
import { AGENT_ID, AGENT_URL } from "../near/config.js";
import { sealKey } from "../near/sealbox.js";
import { useAsync } from "../hooks/useAsync.js";

type Result = { kind: "accepted" } | { kind: "rejected"; reason: string } | { kind: "error"; message: string };

const REASON_TEXT: Record<string, string> = {
  TRADE_ENABLED: "This key can trade. Create a read-only key.",
  WITHDRAW_ENABLED: "This key can withdraw or transfer. Create a read-only key.",
  INVALID: "The key could not be verified as read-only.",
};

export function ConnectKey() {
  const { id = "" } = useParams();
  const pubkey = useAsync<string | null>(() => resolveEnclavePubkey(AGENT_ID), [AGENT_ID]);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pubkey.data) return;
    setBusy(true);
    setResult(null);
    try {
      const sealed = await sealKey(pubkey.data, {
        api_key: apiKey,
        api_secret: apiSecret,
        mandate_id: Number(id),
      });
      // The plaintext key never leaves the browser unencrypted; clear it now.
      setApiKey("");
      setApiSecret("");
      const res = await fetch(`${AGENT_URL}/api/intake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandate_id: Number(id), sealed }),
      });
      const body = (await res.json()) as { accepted?: boolean; reason?: string };
      if (body.accepted) setResult({ kind: "accepted" });
      else setResult({ kind: "rejected", reason: body.reason ?? "INVALID" });
    } catch (e2: unknown) {
      setResult({ kind: "error", message: e2 instanceof Error ? e2.message : String(e2) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <BackLink to={`/mandate/${id}`} label={`Mandate #${id}`} />
      <h1>Connect key — mandate #{id}</h1>
      <p className="lede">
        Create a key with <strong>read permissions only</strong> — BonaFide rejects keys that can trade or
        withdraw. It is encrypted in this browser to a key that exists only inside the enclave, so we never
        see it.
      </p>

      {pubkey.loading && <p className="muted">Fetching the enclave key…</p>}
      {pubkey.error && (
        <p className="error">Could not read the enclave key from the contract. {pubkey.error}</p>
      )}
      {!pubkey.loading && !pubkey.data && (
        <p className="notice notice-status">
          No attested agent has published an enclave key on this deployment yet, so a key cannot be sealed
          to one.
        </p>
      )}

      {pubkey.data && !AGENT_URL && (
        <p className="notice notice-status">
          Key intake is offline for this deployment — the enclave is not currently reachable, so there is
          nowhere to send a key. The record below is unaffected.
        </p>
      )}

      {pubkey.data && AGENT_URL && (
        <form className="form form-narrow" onSubmit={submit} autoComplete="off">
          <label className="field">
            <span>API key</span>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" required />
          </label>
          <label className="field">
            <span>API secret</span>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Encrypting…" : "Encrypt in browser & submit"}
          </button>
        </form>
      )}

      {result?.kind === "accepted" && <p className="ok">Accepted — the key is read-only and now held in the enclave.</p>}
      {result?.kind === "rejected" && (
        <p className="error">Rejected ({result.reason}): {REASON_TEXT[result.reason] ?? "Not a read-only key."}</p>
      )}
      {result?.kind === "error" && <p className="error">Submission failed: {result.message}</p>}

    </section>
  );
}
