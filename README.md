# BonaFide

Market makers prove they kept their deals — inside a sealed enclave, so no one sees their book.

> The agent can't move money, so there's nothing to contain.

**Chain:** NEAR testnet · **Contract:** [`bona-fide-rt2.testnet`](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet) · **Stack:** Shade Agents (NEAR × Phala dstack TEE) · **License:** Apache-2.0

**Built at** [NEAR HACKATHON](https://nearhackathon.com), entirely within the event window · **Tracks:** Privacy & Private AI (confidential computation in a TEE — the book never leaves the enclave) · AI Security & Defense (an agent given money to watch, and no keys to move it)

**It's not a mock.** The contract is deployed and seeded: mandate `0` (an honest
market maker) carries two on-chain **Pass** verdicts, and mandate `1` (a market
maker that dumped loaned tokens) carries an on-chain **Fail** — submitted by a
[registered agent](https://testnet.nearblocks.io/address/e3056536582c2c77e1ad9cb976cf5b4c95fe2dedd5ee95efec3e7237c7f2f8b4),
accepted by a contract that takes verdicts from no one else, recorded
append-only. Every claim in this paragraph regenerates from chain state with
one command, `npm run evidence`, and the captured, block-stamped responses are
committed in [`evidence/`](./evidence/). The hosted web app is live at
**[bona-fide-mm.vercel.app](https://bona-fide-mm.vercel.app)**.

---

## The problem

Token projects hire market makers to keep their markets liquid, and often lend
them tokens to do it. Two things go wrong, constantly: the market maker misses
the agreed KPIs — spread, depth, uptime — and the project cannot prove it; or
the market maker quietly sells the loaned tokens. The incumbent answer is a
grading service that requires the market maker to hand its order book to a
third party. Large firms tolerate that; small ones stay invisible or exposed.

In market making, the book *is* the strategy. Asking someone to publish it so
they can be trusted is asking them to stop being a market maker.

## What BonaFide does — the life of one mandate

1. **Co-sign the terms on NEAR.** The market maker proposes an *Engagement
   Mandate* — token pair, exchange, KPI bounds, loan cap, dates. The terms are
   hashed, both parties see the hash, and the allowlisted project co-signs.
   From here the rules cannot drift: every verdict binds to that hash.
2. **Hand over a key that cannot spend.** The MM creates a **read-only**
   exchange key and pastes it into the app, where it is encrypted *in the
   browser* to a public key that exists only inside a TEE. Nobody — including
   us — sees it in transit.
3. **The enclave rejects dangerous keys on sight.** Before the key is ever
   used, the agent queries the exchange for the key's real permissions. Trade
   or withdrawal rights → rejected (`TRADE_ENABLED`), dropped, never stored.
4. **Sampling the MM can't predict.** Each epoch, the agent reads the account
   at pseudo-random moments derived from the enclave's key — reproducible for
   audit, unknowable in advance — so quoting only when watched doesn't work.
5. **Plain code decides.** A deterministic scorer computes spread, depth,
   uptime, net sells, withdrawals, and a balance reconciliation that catches
   tokens leaving by routes the trade log never shows (`BALANCE_LEAK`). Eight
   pre-sign guards then stand between the score and the signature.
6. **The record can't be quietly edited.** The contract accepts verdicts only
   from registered agents running approved, attested code; verdicts are
   append-only; and if an epoch's verdict never arrives, *anyone* may record
   the miss. Silence is visible.

> **AI may propose; deterministic code decides; the log can't be quietly edited.**

## Why "read-only" is the whole security story

Most agentic-finance security is about safely letting an agent *spend*. Bona
Fide's agent never spends — it only reads and signs attestations — so the
entire fund-movement attack surface is gone, not guarded:

- **Isolation** — no root wallet enters the agent; its only credential is a
  read-only exchange key sealed to the enclave.
- **Whitelisting at the protocol level** — the exchange client exposes **only
  GET**; there is no order or withdrawal code to trick into running.
- **Deterministic guards** — nothing is signed unless the mandate matches, the
  epoch has closed, the metrics are in range, the data source is recorded, and
  the agent's code is still approved.
- **Attestation** — the contract refuses verdicts from code whose measurements
  the owner hasn't approved, so the guards can't be bypassed by swapping code.

Even a fully compromised enclave is a *privacy* incident, never a theft: the
key it holds cannot move funds. The full attack-by-attack analysis — defended,
mitigated, and honestly accepted — is in
[`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md).

## How it works

```mermaid
graph LR
  MM["MM browser\nseals read-only key\nto the enclave"] -->|sealed key| Agent
  subgraph TEE["Shade Agent (TEE)"]
    Agent["permission check\njittered sampling\ndeterministic scorer\n8 pre-sign guards"]
  end
  Agent -->|read-only GET| Ex["Exchange"]
  Agent -->|signed verdict| C["NEAR contract\nattestation-gated\nappend-only"]
  P["Project + MM wallets"] -->|propose · co-sign| C
  W["Web app"] -->|view calls| C
```

Component detail, sequence diagrams, and a file-by-file map:
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## What is real in this deployment, and what is simulated

Stated plainly, because it matters:

| Thing | Status |
|---|---|
| Contract, mandates, co-signing, verdicts, missed-epoch recording | **Real, live on testnet** — [`bona-fide-rt2.testnet`](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet), recomputable via `npm run evidence` |
| Verdict submission gated to a registered agent | **Real** — the seeded verdicts were accepted only after registration + whitelist; unregistered callers are refused |
| Deterministic scorer, jitter, balance reconciliation, guards | **Real code** — 88 agent tests + 18 contract tests in CI, property-based, mutation-checked, cross-checked against an independent implementation |
| Market data behind the seeded verdicts | **Simulated** — committed replay fixtures, labelled with an amber **SIMULATED DATA** badge in the app; scoring of them is re-executable by anyone (`npm run demo:replay`) |
| Read-only key check | **Real logic**; demonstrated against canned Binance responses (labelled), since the live check needs a real exchange key |
| TEE attestation | **Real, live on testnet** — a second deployment, [`bona-fide-tee1.testnet`](https://testnet.nearblocks.io/address/bona-fide-tee1.testnet), runs `requires_tee: true` on Phala Cloud (Intel TDX, dstack 0.5.12). The contract verified a genuine hardware quote, registered the enclave agent (non-zero measurements, real platform id, enclave key published), and then **accepted that agent's verdicts**: the deterministic scorer ran *inside the enclave* and its Pass/Pass and Fail(`LOAN_CAP`) are recorded on-chain. Block-stamped in [`evidence/live-tee/`](./evidence/live-tee/). The market data behind them is still the committed replay fixtures (the row above), and the first deployment keeps the local-attestation record. **The quote expires on 19 Nov 2026** — `attestation_expiration_time_ms` is 7 days, so the contract stops accepting this agent unless it re-attests from inside the enclave. That is the design working: an attestation describes a moment, not a permanent badge. The verdicts it signed were accepted while it was valid and the record is append-only, so they stand, and the landing page says so once the date passes |

## How to check this without trusting us

Clicking around our app proves nothing: we wrote it, and it could render
anything we like. So this list is ordered by **how little you have to take on
faith**, starting where we are not in the loop at all. Our app is last, on
purpose.

Every command below was run before it was written down.

**1. Read the chain directly. Nothing of ours in the path.**

A public NEAR testnet RPC, no tooling to install:

```bash
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"query","params":{
    "request_type":"call_function","finality":"final",
    "account_id":"bona-fide-rt2.testnet","method_name":"list_mandates",
    "args_base64":"eyJmcm9tX2luZGV4IjowLCJsaW1pdCI6NTB9"}}'
```

`args_base64` is base64 of `{"from_index":0,"limit":50}`, and the reply's
`result.result` is the JSON response as an array of byte values — decode it, or
read the same state in a browser on
[NearBlocks](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet).
The same call with `get_verdicts` (`{"id":"1","from_epoch":0,"limit":50}`) and
`get_agents` (`{}`) returns the rest. Any NEAR CLI will do the same thing —
check its own syntax, since it changes between versions.

What you get back is public state on a chain we do not control: three
mandates, their verdicts, and the registered agent.

**2. Read what the contract will and will not accept.**

The guarantees live in [`contract/src/`](./contract/), enforced, rather than in
prose like this paragraph:

- `submit_verdict` takes nothing from an account that is not a registered,
  attested agent — and rejects a verdict whose terms hash does not match the
  mandate it claims to score.
- A verdict for an `(id, epoch)` that already exists is rejected, never
  overwritten. That is what "append-only" means here.
- `cosign_mandate` requires an allowlisted project that the terms themselves
  name, so the co-signature cannot come from the market maker.

`cargo test --manifest-path contract/Cargo.toml` runs 22 tests, five of them
over exactly those three rules (`submit_verdict_rejects_non_agent`,
`submit_verdict_happy_and_no_overwrite`,
`submit_verdict_rejects_terms_hash_mismatch`, `cosign_requires_allowlist`,
`cosign_only_named_project`). Read them and decide for yourself whether the
state in step 1 could have been produced another way.

**3. Recompute the verdicts yourself.**

```bash
git clone https://github.com/ronniethedevv/bona-fide && cd bona-fide
npm --prefix agent install          # this step needs the network; the next does not
npm run demo:replay
```

prints:

```
  honest-mm    epoch 0: Pass  |  epoch 1: Pass
  dumping-mm   epoch 0: Fail (LOAN_CAP)

  Key permission check (canned exchange responses):
    read-only key   → ACCEPTED
    trade key       → REJECTED (TRADE_ENABLED)
    withdraw key    → REJECTED (WITHDRAW_ENABLED)
```

No wallet, no exchange account. Compare it against what step 1 returned.
Matching output does not prove we are honest — it proves the code in this
repository is the code that produced the record, which is the part worth
checking.

**4. Recompute the published evidence from chain state.**

```bash
CONTRACT_ID=bona-fide-rt2.testnet npm run evidence
git diff evidence/live
```

Every file in [`evidence/live/`](./evidence/live/) is rewritten from the live
contract and stamped with the block it was read at. A clean diff means what we
committed is what the chain says. A dirty one means we are wrong and you should
believe the chain.

**5. Check the attestation — and what it does not cover.**

[`bona-fide-tee1.testnet`](https://testnet.nearblocks.io/address/bona-fide-tee1.testnet)
runs `requires_tee: true`. `get_agents` on it returns the measurements the
contract verified, the platform id, and `valid_until_ms`. From that you can
confirm the contract accepted a hardware quote and that its measurements match
an approved entry.

You cannot confirm from there that those measurements correspond to *this*
source — that needs a reproducible dstack build of the agent image. We say so
rather than implying the chain settles it. The same listing also shows an agent
whose `validity` is `Invalid(InvalidMeasurements)`: that is the contract
refusing code whose measurements were not approved, left in place because it is
evidence the gate works.

**6. Then, if you like, open the app.**

[bona-fide-mm.vercel.app](https://bona-fide-mm.vercel.app) is a readable view
of steps 1 and 5. It is the least load-bearing item on this list.

### What this demo does not show

Stated here rather than left for you to find:

- **The market data is committed replay fixtures, not a live exchange.**
  Verdicts are labelled `SIMULATED DATA` in the app and `Replay` on chain. The
  scorer, the contract and the attestation are real; the order book is test
  data.
- **Two of the three mandates are self-dealt** — the same account is market
  maker and co-signing project. Only `#2` has an independent counterparty. The
  directory flags the other two itself.
- **Nothing is identity-bound yet.** The binding fields went live with the
  state migration and every mandate reads `account_verified: false`, because no
  attested agent has yet seen a read-only key for a committed account. That
  needs a key from a **production** exchange account: Binance Spot Testnet
  serves no `/sapi/*` endpoints at all, so the read-only permission check
  cannot run there, and the agent rejects a key it could not verify rather than
  binding one it could not check.
- **The TEE attestation expires 19 Nov 2026.** After that the contract stops
  accepting that agent. The verdicts it already signed stand: they were
  accepted while it was valid, and the record is append-only.

[Trust limits](#trust-limits-read-these) covers what a verdict cannot prove
even when all of the above checks out.

**Run the whole thing yourself.** [`DEPLOY.md`](./DEPLOY.md) is the complete
path on faucet NEAR, WSL keyring quirks included, and
[`docs/CVM-RUNBOOK.md`](./docs/CVM-RUNBOOK.md) is the operational guide for the
attested agent — including the mistakes that cost us NEAR, written down so they
cost you nothing.

## Components

| Part | What it is |
|---|---|
| [`contract/`](./contract/) | Rust (near-sdk), extends the Shade Agent template: mandates, project allowlist, attestation-gated agent registry, append-only verdicts, `record_missed`. |
| [`agent/`](./agent/) | TypeScript Shade Agent: enclave keypair, sealed-box key intake, GET-only exchange client, read-only permission check, jittered sampling, deterministic scorer, pre-sign guards, signed submission. |
| [`web/`](./web/) | Vite + React, no backend: directory, MM profiles, mandate timelines, create/co-sign, in-browser key sealing. |
| [`fixtures/replay/`](./fixtures/replay/) | The honest / dumping / outage / key-revoked scenarios the demo scores. |

**NEAR technology used:** Shade Agents (attested off-chain compute whose output
the contract verifies), a near-sdk contract as the registry and append-only
record, and wallet-selector for in-browser signing.

## Scoring, and how we know it is right

The exact rules — every definition, boundary, and rounding decision — are
specified in [`docs/SCORING.md`](./docs/SCORING.md), which also publishes what
a verdict proves *and what it does not*, plus the known adversarial findings as
a v2 backlog. Determinism is asserted as a property, not assumed: fast-check
property tests over adversarial inputs, an independently written reference
implementation compared case-by-case, and mutation checks that prove the suite
fails when the scorer is deliberately broken. The metrics mirror how real
market-maker obligations are written (two-sided quotes within X bps, minimum
size per side, present Y% of the time).

## Trust limits (read these)

- **Hardware trust:** if the TEE is broken, the book could leak. Keys are
  **read-only**, so funds can't move regardless.
- **Attestation, not re-execution.** Replay verdicts are publicly re-computable
  (`npm run demo:replay`). *Live* verdicts are deterministic but computed over
  samples only the enclave saw — publishing the raw data would leak the book,
  which is the point of the product. You verify a live verdict by checking that
  **approved, attested code** produced it, not by recomputing it yourself.
- **The exchange is a trusted oracle.** We attest our computation over what the
  exchange reported; we cannot prove the exchange reported truthfully.
- **One key shows one account.** The record proves what happened in the
  committed account. Balance reconciliation catches value leaving it by
  unreported routes (internal transfers), but it cannot prove the MM has no
  other accounts.
- **The project allowlist is owner-controlled** in this phase.

## Exchange

v1 uses **Binance** spot, read-only. Binance exposes a key's own permissions
via `GET /sapi/v1/account/apiRestrictions` — itself a read-only call — so the
enclave can reject a trade- or withdraw-enabled key before first use. That
endpoint is what makes "reject a dangerous key on sight" enforceable rather
than aspirational.

## Roadmap

- **Identity binding** — NEAR identity ↔ exchange account, privacy-preserving
  (salted enclave-held fingerprints; Sybil-resistant). Not a slide: built,
  tested, and merged ([PR #18](https://github.com/ronniethedevv/bona-fide/pull/18),
  [`docs/identity-binding.md`](./docs/identity-binding.md)) — and **migrated onto
  the live contract** ([tx `2eFn4xY7gWyi…`](https://testnet.nearblocks.io/txns/2eFn4xY7gWyiQS14kRK2a5ePAnXW5V8ZhwveTF4qnnta)),
  so every mandate on `bona-fide-rt2.testnet` now carries the binding fields.
  What is left is a binding itself: a mandate shows as verified only once an
  attested agent has seen a working read-only key for the committed account and
  called `attest_account_binding`. Nothing was marked verified by the migration.
- NEAR AI Cloud explainer for failed epochs (a private note from the metrics).
- Paid detailed lookups (HTTP 402).
- Chain Signatures mirror of summaries to other chains.

## Documentation

| Document | What's in it |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The three parts, the epoch sequence, trust boundaries, file-by-file map. |
| [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md) | 22 attacks: defence, enforcement point, honest status for each. |
| [`docs/SCORING.md`](./docs/SCORING.md) | The scoring specification, assurance method, industry references, published gaps. |
| [`evidence/`](./evidence/) | Deployment record + block-stamped chain state behind every claim. |
| [`DEPLOY.md`](./DEPLOY.md) | Reproduce the deployment end to end on testnet. |
| [`docs/FOR-PROJECTS.md`](./docs/FOR-PROJECTS.md) | The same system from the token project's side: the sequence, why the market maker proposes and you co-sign, and how to read a verdict. |
| [`docs/CVM-RUNBOOK.md`](./docs/CVM-RUNBOOK.md) | Operating the attested agent: what to stop before changing what, approving the enclave's own measurements, and the failures that cost us NEAR. |
| [`docs/demo-script.md`](./docs/demo-script.md) · [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) | The demo video script and the submission checklist. |

## Develop

```bash
bash scripts/dev-setup.sh              # Rust wasm target + Node deps
cd contract && cargo test              # 18 tests
cd agent && npm ci && npm test         # 88 tests
cd web && npm ci && npm run build
```

CI runs rustfmt, clippy (`-D warnings`), both test suites, the web build, and a
guard that no AI context file is ever tracked — on every push and PR.

## Originality and license

Built for this hackathon on the
[Shade Agent template](https://github.com/NearDeFi/shade-agent-template)
(Apache-2.0), which provides the agent↔contract attestation plumbing; the
mandate registry, verdict record, scorer, guards, key intake, exchange layer,
and web app were written for this project. License:
[Apache-2.0](./LICENSE).
