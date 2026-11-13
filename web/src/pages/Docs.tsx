import { Link } from "react-router-dom";
import { BackLink } from "../components/BackLink.js";
import { CONTRACT_ID } from "../near/config.js";
import { TEE, truncHex, validUntilLabel } from "../near/tee.js";

const REPO = "https://github.com/ronniethedevv/bona-fide";

/**
 * Reference page: the words this app uses, what a verdict means, and which
 * parts of the demo are real.
 *
 * Written for someone who has opened the app and hit a term they do not know,
 * so it defines things in the order they are met rather than the order they
 * matter. Everything here is checkable: the ids are links to the chain and the
 * detail lives in the repository.
 */
function Term({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{word}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function Docs() {
  return (
    <section>
      <BackLink to="/directory" label="All market makers" />
      <h1>Docs</h1>
      <p className="lede">
        A token project lends tokens to a market maker and agrees how they will quote. BonaFide checks whether
        that happened, without anyone having to see the market maker&rsquo;s order book, and writes the result
        somewhere neither side can edit.
      </p>

      <h2>The words</h2>
      <dl className="terms">
        <Term word="Mandate">
          One engagement between a market maker and a project. It holds the agreed terms, both accounts, and a
          hash of those terms. Proposed by the market maker, then co-signed by the project.
        </Term>
        <Term word="Co-sign">
          The project&rsquo;s signature on a mandate. Only the account the terms name can give it, and only if
          the contract owner has allowlisted that account. Nothing is scored until it happens, which is why a
          listing without one means very little.
        </Term>
        <Term word="Epoch">
          The scoring window, 120 seconds in this demo. One verdict covers one epoch. Real engagements would
          use hours or days.
        </Term>
        <Term word="Verdict">
          The scored result for one epoch: a status, the numbers behind it, and the terms hash it was judged
          against. Once on chain it is never replaced, so a bad epoch cannot be edited away later.
        </Term>
        <Term word="Spread">
          The gap between the best bid and the best ask, in basis points. One basis point is a hundredth of a
          percent. A tight spread is the market maker doing the job; a wide one means worse prices for
          everybody trading that pair.
        </Term>
        <Term word="Depth">
          How much is actually quoted on each side within a band around the mid price. Quoting a tight spread
          for a trivial size is a common way to look compliant while providing nothing.
        </Term>
        <Term word="Uptime">
          The share of samples where quotes met the terms. Pulling quotes when the market turns is the
          behaviour this catches.
        </Term>
        <Term word="Loan cap">
          The most of the loaned token the market maker may sell in one epoch. Projects lend tokens for
          liquidity, not to be sold into the market, and breaching this is the failure that matters most.
        </Term>
        <Term word="Net sells">
          Sales minus purchases of the loaned token over the epoch, measured against the loan cap.
        </Term>
        <Term word="Coverage">
          How much of the epoch was actually observed. Low coverage means the record for that epoch is thin,
          and it is reported rather than hidden.
        </Term>
        <Term word="Terms hash">
          A SHA-256 hash of the agreed terms, fixed when the mandate is created. Every verdict carries it, so
          a verdict can always be traced to the exact terms it judged.
        </Term>
        <Term word="Read-only key">
          An exchange API key that can look but not act. BonaFide asks the exchange what a key is allowed to
          do and refuses anything that can trade, withdraw, or transfer. You can watch that check run on the{" "}
          <Link to="/key-check">key check</Link> page.
        </Term>
        <Term word="Enclave">
          A region of a machine the operator cannot read into, backed by the CPU. The key is sealed to it in
          the browser, so the only place the key exists in the clear is inside hardware nobody can open.
        </Term>
        <Term word="Attestation">
          A signed statement from the CPU about which code is running. The contract checks it before accepting
          a verdict, so trusting a verdict means trusting the hardware and a hash, not the operator.
        </Term>
        <Term word="Measurement">
          The hash of that code. The contract stores the measurements it will accept, and an agent whose
          measurements do not match is refused even if everything else about it looks right.
        </Term>
      </dl>

      <h2>Reading a verdict</h2>
      <dl className="terms">
        <Term word="Pass">Every metric met the terms for that epoch.</Term>
        <Term word="Fail">
          At least one did not, and the reasons are listed. <span className="mono">LOAN_CAP</span> is the
          serious one: more of the loaned token was sold than agreed.
        </Term>
        <Term word="Outage">
          The key stopped working or the exchange could not be reached. Often honest, but it is also what
          stopping the scoring would look like, so it is recorded rather than ignored.
        </Term>
        <Term word="Missed">
          An epoch with no verdict after the grace period. Anyone can record one, so silence does not read as
          a clean record.
        </Term>
      </dl>

      <h2>What is real here, and what is not</h2>
      <p className="notice">
        The scorer, the contract, the attestation and the permission check are real and running on NEAR
        testnet. The market data behind these verdicts is committed replay fixtures, not a live exchange,
        which is why verdicts carry a <strong>SIMULATED DATA</strong> badge. Nothing on this site is a mockup:
        every number is read from the chain when the page loads.
      </p>

      <h2>The deployments</h2>
      <dl className="terms">
        <Term word="Record contract">
          <span className="mono">{CONTRACT_ID || "not configured"}</span> holds the mandates, the verdicts and
          the market-maker summaries this app reads.
        </Term>
        <Term word="Attested contract">
          <span className="mono">{TEE.contractId}</span> runs with attestation required. It verified a real{" "}
          {TEE.hardware} quote from an enclave on {TEE.runtime}, measurement{" "}
          <span className="mono">{truncHex(TEE.mrtd)}</span>, then accepted verdicts that enclave produced.
          That quote is accepted until {validUntilLabel()}, after which the agent has to attest again. The
          verdicts it already signed stand.
        </Term>
      </dl>

      <h2>Checking any of this yourself</h2>
      <p className="lede">
        You do not have to believe this page. The contracts are public state on a chain nobody here controls,
        the scorer runs offline on committed fixtures, and the repository explains how to recompute both.
      </p>
      <ul className="stack">
        <li>
          <a href={`${REPO}#how-to-check-this-without-trusting-us`} target="_blank" rel="noreferrer">
            How to check this without trusting us
          </a>
          , ordered by how little you have to take on faith.
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/FOR-PROJECTS.md`} target="_blank" rel="noreferrer">
            For token projects
          </a>
          , the same system from the counterparty&rsquo;s side.
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/SCORING.md`} target="_blank" rel="noreferrer">
            The scoring specification
          </a>
          , every definition and boundary, including what a verdict does not prove.
        </li>
        <li>
          <a href={`${REPO}/blob/main/docs/THREAT-MODEL.md`} target="_blank" rel="noreferrer">
            The threat model
          </a>
          , the attacks considered and where each is stopped.
        </li>
        <li>
          <a href={`${REPO}/tree/main/evidence`} target="_blank" rel="noreferrer">
            The evidence bundle
          </a>
          , block-stamped chain state behind every claim.
        </li>
      </ul>
    </section>
  );
}
