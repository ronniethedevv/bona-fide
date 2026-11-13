import { useEffect, useMemo, useState } from "react";
import { BackLink } from "../components/BackLink.js";import { useNavigate } from "react-router-dom";
import { termsHash } from "../near/terms.js";
import type { MandateTerms } from "../near/types.js";
import { useWallet } from "../near/WalletContext.js";

/** Human decimal (e.g. "10000.5") → 1e6-scaled integer string. */
function scaleToE6(human: string): string {
  const [whole, frac = ""] = human.trim().split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  const combined = `${whole || "0"}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

function toUnix(dtLocal: string): string {
  const ms = Date.parse(dtLocal);
  return Number.isNaN(ms) ? "0" : String(Math.floor(ms / 1000));
}

export function NewMandate() {
  const { accountId, signIn, call } = useWallet();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    project: "",
    exchange: "binance",
    pair: "TOKEN_USDT",
    account_label: "mm-main",
    max_spread_bps: 50,
    depth_band_bps: 200,
    min_depth_per_side_quote: "10000",
    min_uptime_bps: 9000,
    loan_cap_per_epoch_base: "1",
    epoch_secs: 600,
    sample_secs: 30,
    start: "",
    end: "",
  });
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const terms = useMemo<MandateTerms>(
    () => ({
      project: form.project.trim(),
      exchange: form.exchange.trim(),
      pair: form.pair.trim(),
      account_label: form.account_label.trim(),
      max_spread_bps: Number(form.max_spread_bps),
      depth_band_bps: Number(form.depth_band_bps),
      min_depth_per_side_quote: scaleToE6(form.min_depth_per_side_quote),
      min_uptime_bps: Number(form.min_uptime_bps),
      loan_cap_per_epoch_base: scaleToE6(form.loan_cap_per_epoch_base),
      epoch_secs: Number(form.epoch_secs),
      sample_secs: Number(form.sample_secs),
      start_ts: toUnix(form.start),
      end_ts: toUnix(form.end),
    }),
    [form],
  );

  useEffect(() => {
    void termsHash(terms).then(setHash);
  }, [terms]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await call("propose_mandate", { terms });
      navigate(`/mm/${accountId}`);
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  if (!accountId) {
    return (
      <section>
        <BackLink to="/directory" label="All market makers" />
        <h1>Create mandate</h1>
        <p className="muted">Connect your wallet (you become the market maker).</p>
        <button className="btn" onClick={signIn}>
          Connect wallet
        </button>
      </section>
    );
  }

  return (
    <section>
      <BackLink to="/directory" label="All market makers" />
      <h1>Create mandate</h1>
      <form className="form" onSubmit={submit}>
        <Field label="Project account">
          <input value={form.project} onChange={set("project")} placeholder="project.testnet" required />
        </Field>
        <Field label="Exchange">
          <input value={form.exchange} onChange={set("exchange")} />
        </Field>
        <Field label="Pair">
          <input value={form.pair} onChange={set("pair")} />
        </Field>
        <Field label="Account label">
          <input value={form.account_label} onChange={set("account_label")} />
        </Field>
        <Field label="Max spread (bps)">
          <input type="number" value={form.max_spread_bps} onChange={set("max_spread_bps")} />
        </Field>
        <Field label="Depth band (bps)">
          <input type="number" value={form.depth_band_bps} onChange={set("depth_band_bps")} />
        </Field>
        <Field label="Min depth / side (quote)">
          <input value={form.min_depth_per_side_quote} onChange={set("min_depth_per_side_quote")} />
        </Field>
        <Field label="Min uptime (bps)">
          <input type="number" value={form.min_uptime_bps} onChange={set("min_uptime_bps")} />
        </Field>
        <Field label="Loan cap / epoch (base)">
          <input value={form.loan_cap_per_epoch_base} onChange={set("loan_cap_per_epoch_base")} />
        </Field>
        <Field label="Epoch (secs)">
          <input type="number" value={form.epoch_secs} onChange={set("epoch_secs")} />
        </Field>
        <Field label="Sample (secs)">
          <input type="number" value={form.sample_secs} onChange={set("sample_secs")} />
        </Field>
        <Field label="Start">
          <input type="datetime-local" value={form.start} onChange={set("start")} required />
        </Field>
        <Field label="End">
          <input type="datetime-local" value={form.end} onChange={set("end")} required />
        </Field>

        <div className="hash-preview">
          <span className="card-label">Terms hash (sign this)</span>
          <code>{hash}</code>
        </div>

        {err && <p className="error">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Propose mandate"}
        </button>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
