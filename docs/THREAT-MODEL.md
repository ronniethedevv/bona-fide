# Threat model

Every attack we considered, what stands in its way, where that defence lives in
the code, and — honestly — whether it is defended, mitigated, accepted, or
still open. A scoring system whose gaps are published is worth more than one
that claims to have none; the deeper analysis behind the scoring rows is
[`SCORING.md`](./SCORING.md) §8–9.

**Status key** — **Defended:** a mechanism blocks it. **Mitigated:** made
visible or expensive, not impossible. **Accepted:** a stated limit of the
design. **v2:** fix specified, not yet built. **Staged:** working code exists
on a branch ([PR #7](https://github.com/ronniethedevv/bona-fide/pull/7)), held
out of v1 on purpose.

## 1. Funds and keys

| # | Attack | Defence | Enforced in | Status |
|---|---|---|---|---|
| 1 | Compromised or malicious agent moves the MM's funds | The agent cannot express a write: the exchange client has **only GET methods** — there is no order, transfer, or withdrawal code to reach (invariant I1) | [`agent/src/exchange/binance.ts`](../agent/src/exchange/binance.ts) | **Defended** |
| 2 | MM supplies a key that can trade or withdraw (by mistake or as a setup) | The enclave queries the key's real permissions before first use and rejects anything beyond read-only (`TRADE_ENABLED`); a rejected key is dropped, never stored (invariant I2) | [`agent/src/exchange/verify.ts`](../agent/src/exchange/verify.ts), [`permissions.ts`](../agent/src/exchange/permissions.ts) | **Defended** |
| 3 | Key intercepted between the MM's browser and the agent | The key is sealed in the browser to the enclave's X25519 public key (published on-chain by the registered agent); only code inside the enclave can open it | [`web/src/`](../web/src/) sealing, [`agent/src/keys/intake.ts`](../agent/src/keys/intake.ts) | **Defended** |
| 4 | Key or book data leaks out of the agent | Keys live only in enclave memory (never serialized, never logged — invariant I3); verdicts carry aggregate metrics, never samples | [`agent/src/keys/store.ts`](../agent/src/keys/store.ts), [`agent/src/submit.ts`](../agent/src/submit.ts) | **Defended** |
| 5 | The TEE itself is broken | The book could leak. Funds still cannot move, because the only credential inside is read-only — the blast radius is privacy, never money | design property (rows 1–2) | **Accepted**, stated in the README |

## 2. Gaming the score

| # | Attack | Defence | Enforced in | Status |
|---|---|---|---|---|
| 6 | **Flicker quoting** — quote only at the moments you know will be sampled (epoch start and `sample_secs` are public on-chain) | Each sample lands at a TEE-keyed pseudo-random offset inside its window: unpredictable to the MM, reproducible for audit | [`agent/src/sampling.ts`](../agent/src/sampling.ts) | **Defended** |
| 7 | **Dump through the back door** — move loaned tokens out by internal transfer (spot→funding, sub-accounts), which trade and withdrawal records never show | Balance reconciliation: `expected_close = open + buys − sells − withdrawals`; an unexplained shortfall beyond 10 bps is flagged `BALANCE_LEAK` and counts toward the loan cap | [`agent/src/scoring/scorer.ts`](../agent/src/scoring/scorer.ts) | **Defended** |
| 8 | **Outage as shelter** — induce exchange errors (e.g. exhaust rate limits) to turn a failing epoch into a grey `Outage` | Outage counts are public on every MM profile, so the pattern is visible; distinguishing rate-limit errors from 5xx and a terminate-after-N-outages right are specified for v2 | [`docs/SCORING.md`](./SCORING.md) §9.1 | **Mitigated**, v2 specified |
| 9 | **Band-edge stuffing** — token size at the touch, bulk at the band edge: passes the spread and depth tests while thin where it matters | Specified fix: minimum top-of-book size and multi-band depth; parameter additions under the same trust model | [`docs/SCORING.md`](./SCORING.md) §9.2 | **v2** |
| 10 | **Mid-mandate rule swap** — a scorer update changes the rules after co-signing | Every verdict records the codehash that produced it, so a swap is detectable; snapshotting the approved measurement into the mandate at co-sign (prevention) is specified for v2 | [`contract/src/verdicts.rs`](../contract/src/verdicts.rs) | **Mitigated**, v2 specified |
| 11 | MM runs the "real" activity in a different account than the committed one | Out of scope for a verdict by design: a verdict proves the committed account, not the MM's whole existence. Binding the NEAR identity to the exchange account (salted, enclave-held fingerprints; Sybil-resistant) is built, tested and merged ([PR #18](https://github.com/ronniethedevv/bona-fide/pull/18)); it takes effect on a deployment once `agent/scripts/upgrade-contract.ts` has migrated it | [`docs/SCORING.md`](./SCORING.md) §8; [`docs/identity-binding.md`](./identity-binding.md) | **Accepted** in v1, **Merged** |
| 12 | The exchange itself reports false data | We attest our computation over what the venue reported; we cannot prove the venue's honesty. Stated plainly rather than implied away | [`docs/SCORING.md`](./SCORING.md) §8 | **Accepted**, stated |

## 3. The on-chain record

| # | Attack | Defence | Enforced in | Status |
|---|---|---|---|---|
| 13 | Anyone submits a verdict | `submit_verdict` requires the caller to be a registered agent with an unexpired attestation and currently-approved measurements | [`contract/src/verdicts.rs`](../contract/src/verdicts.rs) | **Defended** |
| 14 | Agent submits for the wrong mandate, a reopened epoch, or absurd metrics | The contract checks `terms_hash`, epoch range, and metric bounds; the agent independently refuses to sign unless all **8 pre-sign guards** pass (mandate active, terms match, epoch closed, no existing verdict, metrics in range, data source recorded, code still approved) | [`contract/src/verdicts.rs`](../contract/src/verdicts.rs), [`agent/src/guards/index.ts`](../agent/src/guards/index.ts) | **Defended** (both sides) |
| 15 | Rewrite history — edit or delete an inconvenient verdict | There is no update or delete path; verdicts are append-only | [`contract/src/verdicts.rs`](../contract/src/verdicts.rs) | **Defended** |
| 16 | Hide a bad epoch by never submitting | After `epoch_end + grace`, **anyone** may call `record_missed`; silence becomes a permanent, visible record | [`contract/src/verdicts.rs`](../contract/src/verdicts.rs) `record_missed` | **Defended** |
| 17 | Fake mandate terms after signing | Terms are hashed (`terms_hash`) at proposal and shown before either party signs; verdicts bind to the hash | [`contract/src/mandates.rs`](../contract/src/mandates.rs) | **Defended** |
| 18 | A hostile "project" spams or impersonates | Projects must be allowlisted before a mandate can activate; the allowlist is owner-controlled in this phase | [`contract/src/owner.rs`](../contract/src/owner.rs) | **Accepted** centralization for v1, stated |

## 4. Infrastructure and process

| # | Attack | Defence | Enforced in | Status |
|---|---|---|---|---|
| 19 | Scorer is subtly wrong (the quiet killer) | The spec is published; fast-check property tests assert scoring laws over adversarial inputs; an independent second implementation is compared case-by-case; the suite is **mutation-checked** (deliberately broken scorers make it fail) | [`docs/SCORING.md`](./SCORING.md) §6, `agent/test/` | **Defended**, 80 tests in CI |
| 20 | Dependency or toolchain drift changes behaviour | Lockfiles committed; contract pinned to `rust-version 1.86` with an MSRV-aware resolver; CI runs fmt, clippy `-D warnings`, and both suites on every push | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | **Defended** |
| 21 | Verdicts quietly computed from the wrong kind of data | Every verdict records its `data_source` (`Live` or `Replay`); the web app badges replay-backed records **SIMULATED DATA**; a missing source fails guard 4 | [`agent/src/guards/index.ts`](../agent/src/guards/index.ts), web badge | **Defended** |
| 22 | Local-mode agent passed off as TEE-attested | This deployment is explicit: `requires_tee: false`, mock attestation, agent whitelisted by the owner — published in [`evidence/deployment.md`](../evidence/deployment.md) and the README's "what is real today" table. The TEE path is the same pipeline with `environment: TEE` | [`deployment.yaml`](../deployment.yaml), evidence | **Accepted** for the demo, stated loudly |

## What we do not claim

- No zero-knowledge proofs anywhere: live verdicts rest on **attestation, not
  re-execution** (a verifier checks *which code* computed them, not the
  computation itself). Replay verdicts are the opposite: fully re-executable
  by anyone from committed fixtures.
- No protection against an MM with accounts we were never shown (row 11), and
  no proof of exchange honesty (row 12).
- No gas- or timing-side-channel analysis has been done on any path.
