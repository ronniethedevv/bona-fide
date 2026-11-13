import { Link } from "react-router-dom";
import { api } from "../near/contract.js";
import { TEE, truncHex, attestationIsCurrent, validUntilLabel } from "../near/tee.js";
import type { Mandate, MmListing } from "../near/types.js";
import { useAsync } from "../hooks/useAsync.js";

interface Totals {
  mms: number;
  mandates: number;
  epochs: number;
  passRate: string;
}

async function loadTotals(): Promise<Totals> {
  const [mms, mandates] = await Promise.all([api.listMms(), api.listMandates()]);
  const scored = (mms as MmListing[]).reduce(
    (acc, m) => {
      const s = m.summary;
      return { pass: acc.pass + s.pass, all: acc.all + s.pass + s.fail + s.missed + s.outage };
    },
    { pass: 0, all: 0 },
  );
  return {
    mms: mms.length,
    mandates: (mandates as Mandate[]).length,
    epochs: scored.all,
    passRate: scored.all === 0 ? "—" : `${Math.round((scored.pass / scored.all) * 100)}%`,
  };
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function Landing() {
  const { data } = useAsync<Totals>(loadTotals, []);
  const n = (v: number | undefined): string => (v === undefined ? "—" : String(v));

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Read-only keys · Sealed enclave · Append-only record</p>
          <h1>
            Proof a market maker <em>kept its word.</em>
          </h1>
          <p className="hero-sub">
            Token projects lend their treasury to market makers and hope. BonaFide scores the deal — spread,
            depth, uptime, loan discipline — inside sealed hardware and writes the verdict to NEAR. The order
            book never leaves the enclave.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-lg" to="/directory">
              Open the directory
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/mandate/1">
              See a failed mandate
            </Link>
          </div>

          <div className="terminal">
            <div className="terminal-bar">
              <span className="terminal-label">Offline check</span>
              <span className="terminal-tag">no wallet · no network</span>
            </div>
            <div className="terminal-body">
              <div className="term-cmd">npm run demo:replay</div>
              <div className="term-out">&nbsp;</div>
              <div className="term-out">
                honest-mm&nbsp;&nbsp;&nbsp;&nbsp;epoch 0: <span className="term-pass">Pass</span>
                &nbsp;&nbsp;|&nbsp;&nbsp;epoch 1: <span className="term-pass">Pass</span>
              </div>
              <div className="term-out">
                dumping-mm&nbsp;&nbsp;&nbsp;epoch 0: <span className="term-fail">Fail (LOAN_CAP)</span>
              </div>
            </div>
          </div>
          <p className="terminal-note">
            The real scorer, the committed scenarios, the same verdicts the chain holds. No wallet, no
            exchange account, no network.
          </p>
        </div>
      </section>

      <section className="stats-strip">
        <Stat value={n(data?.mms)} label="Market makers" />
        <Stat value={n(data?.mandates)} label="Mandates" />
        <Stat value={n(data?.epochs)} label="Epochs scored" />
        <Stat value={data?.passRate ?? "—"} label="Pass rate" />
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">The life of one mandate</p>
            <h2 className="section-title">Four steps, none of which require trusting us.</h2>
            <p className="section-sub">
              Every claim a market maker makes about its own performance is settled by code that neither side
              can quietly change.
            </p>
          </div>

          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>Co-sign the terms</h3>
              <p>
                The market maker proposes a mandate — pair, exchange, KPI bounds, loan cap, dates. The terms
                are hashed and the project co-signs. From then on every verdict binds to that hash, so the
                rules cannot drift.
              </p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>Hand over a key that cannot spend</h3>
              <p>
                A read-only exchange key, encrypted in the browser to a public key that exists only inside the
                enclave. Before first use the enclave asks the exchange what the key may do; trade or
                withdrawal rights are rejected on sight.
              </p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>Watch at moments nobody can predict</h3>
              <p>
                Each epoch is sampled at pseudo-random times derived from the enclave&rsquo;s own key —
                reproducible for an auditor, unknowable in advance. Quoting only when you are being watched
                stops working.
              </p>
            </div>
            <div className="step">
              <div className="step-num">04</div>
              <h3>Plain code decides</h3>
              <p>
                A deterministic scorer computes spread, depth, uptime, net sells and withdrawals, then
                reconciles the balance. The contract accepts verdicts only from approved, attested code, and
                if an epoch&rsquo;s verdict never arrives, anyone may record the miss.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <p className="eyebrow">Verification</p>
            <h2 className="section-title">Verified by the hardware, not by us.</h2>
            <p className="section-sub">
              A second deployment runs with attestation required. Its contract refuses any verdict whose code
              measurements the owner has not approved — so to trust a verdict you do not have to trust the
              operator, only Intel&rsquo;s attestation and a hash you can read on-chain yourself.
            </p>
            <p style={{ marginTop: 24 }}>
              <a href={TEE.explorer} target="_blank" rel="noreferrer">
                Inspect the record on NearBlocks →
              </a>
            </p>
          </div>

          <div className="record">
            <div className="record-head">
              <span className="record-title">Attested agent</span>
              {attestationIsCurrent() ? (
                <span className="pill pill-pass">Valid</span>
              ) : (
                <span
                  className="pill pill-simulated"
                  title="The quote has aged out. The verdicts it signed stay in the record."
                >
                  Expired
                </span>
              )}
            </div>
            <div className="record-row">
              <span className="record-label">Hardware</span>
              <span className="record-value">{TEE.hardware}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Runtime</span>
              <span className="record-value">{TEE.runtime}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Contract</span>
              <span className="record-value">{TEE.contractId}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Code measurement</span>
              <span className="record-value">{truncHex(TEE.mrtd)}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Platform</span>
              <span className="record-value">{truncHex(TEE.ppid, 8, 6)}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Agent</span>
              <span className="record-value">{truncHex(TEE.agentId)}</span>
            </div>
            <div className="record-row">
              <span className="record-label">Quote accepted until</span>
              <span className="record-value">{validUntilLabel()}</span>
            </div>
            <p className="record-note">
              {attestationIsCurrent()
                ? "An attestation describes a moment, not a permanent badge. This one expires, and the enclave has to re-attest to keep submitting."
                : "This quote has aged out, which is the design working rather than failing. The verdicts it signed were accepted while it was valid, and the record is append-only, so they stand."}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Who it is for</p>
            <h2 className="section-title">One record, three readers.</h2>
          </div>

          <div className="uc-grid">
            <div className="uc-card">
              <h3>Token projects</h3>
              <p>
                Stop taking the market maker&rsquo;s word for it. Commit the terms, read the verdicts, and see
                a missed epoch for exactly what it is.
              </p>
              <div className="uc-line">
                <span>Terms</span>
                <span>co-signed, hashed</span>
              </div>
              <div className="uc-line">
                <span>Loan cap</span>
                <span>enforced per epoch</span>
              </div>
              <div className="uc-line">
                <span>Silence</span>
                <span>recordable by anyone</span>
              </div>
            </div>

            <div className="uc-card">
              <h3>Market makers</h3>
              <p>
                Prove a track record without showing your book. A read-only key, a sealed enclave, and a
                record you own and can carry to the next negotiation.
              </p>
              <div className="uc-line">
                <span>Order book</span>
                <span>never leaves the TEE</span>
              </div>
              <div className="uc-line">
                <span>Key rights</span>
                <span>read-only, enforced</span>
              </div>
              <div className="uc-line">
                <span>Reputation</span>
                <span>portable, on-chain</span>
              </div>
            </div>

            <div className="uc-card">
              <h3>Everyone else</h3>
              <p>
                The scorer is open source and the verdicts are public. Recompute the demo scenarios offline,
                then check the attestation that signed the live ones.
              </p>
              <div className="uc-line">
                <span>Scorer</span>
                <span>Apache-2.0</span>
              </div>
              <div className="uc-line">
                <span>Verdicts</span>
                <span>append-only</span>
              </div>
              <div className="uc-line">
                <span>Evidence</span>
                <span>block-stamped</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Trust limits</p>
            <h2 className="section-title">What a verdict proves — and what it does not.</h2>
          </div>
          <div className="limits">
            <div className="limit">
              <h3>Attestation, not re-execution</h3>
              <p>
                Live verdicts are computed over samples only the enclave saw; publishing them would leak the
                book. You verify that approved, attested code produced the verdict — not by re-running it.
              </p>
            </div>
            <div className="limit">
              <h3>The exchange is a trusted oracle</h3>
              <p>
                We attest our computation over what the exchange reported. We cannot prove the exchange
                reported truthfully.
              </p>
            </div>
            <div className="limit">
              <h3>One key shows one account</h3>
              <p>
                Balance reconciliation catches value leaving by routes the trade log never shows, but it
                cannot prove the market maker has no other accounts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>Read the record.</h2>
        <p>
          Two mandates, three verdicts, one deliberate failure — live on NEAR testnet, and checkable without
          asking anyone&rsquo;s permission.
        </p>
        <div className="hero-cta" style={{ marginBottom: 0 }}>
          <Link className="btn btn-lg" to="/directory">
            Open the directory
          </Link>
          <Link className="btn btn-ghost btn-lg" to="/key-check">
            Try the key check
          </Link>
        </div>
      </section>
    </div>
  );
}
