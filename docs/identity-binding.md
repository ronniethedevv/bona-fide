# Identity binding

Links a market maker's **NEAR account** to the **exchange account** it actually
runs, so a BonaFide track record is a *credential the MM owns* ("this NEAR
identity provably controls this exchange account, and here's its record") rather
than an unverified claim — **without exposing the account to anyone**.

**Status: merged** ([PR #18](https://github.com/ronniethedevv/bona-fide/pull/18)).
The contract carries `account_verified` and `account_tag`, `attest_account_binding`
is callable by an attested agent, and the agent binds at key intake. It builds on
the existing contract + agent with no changes to the read-only / no-trade
guarantees.

Two fields were added to `Mandate`, and Borsh has no field tags, so a contract
deployed before the merge cannot read its own mandates under the new code. The
upgrade path is `agent/scripts/upgrade-contract.ts`, which deploys and runs
`migrate` in one transaction, then verifies every mandate and verdict survived.
**`bona-fide-rt2.testnet` — the deployment the app reads — has been migrated**
([tx `2eFn4xY7gWyi…`](https://testnet.nearblocks.io/txns/2eFn4xY7gWyiQS14kRK2a5ePAnXW5V8ZhwveTF4qnnta)): all three mandates
and their verdicts came through, and every mandate now carries
`account_verified: false`. The fields are live; no mandate is bound yet.
`bona-fide-tee1.testnet` has not been migrated, so its mandates still have no
such fields and the badge stays dark there — which is the honest display, not a
bug.

A mandate becomes verified only when an attested agent that saw a working
read-only key calls `attest_account_binding`. Nothing in the migration marks
anything verified retroactively.

The key has to come from a **production** exchange account. Binance Spot
Testnet serves only `/api/*`; the read-only permission check is a `/sapi/*`
call, so on testnet it cannot run and intake rejects the key. Skipping the
check when the host does not offer it would have the enclave attest that a key
is read-only without having verified it — the single claim this design exists
to support — so the agent refuses instead, and a mandate stays unverified.

## Why it's possible here

The enclave already holds the verified read-only key and is the only party that
sees the real account. So it is the natural notary: it can attest a binding that
nobody else could forge, and it never has to reveal what it saw.

## The mechanism

1. At key intake, after the read-only permission check passes, the enclave reads
   a **stable account identifier** — Binance exposes a numeric `uid` on
   `GET /api/v3/account`, a signed USER_DATA endpoint a read-only key can call
   (R8). No non-read action is ever taken (I1 holds).
2. It computes two one-way values with an HMAC key derived from its TEE seed:
   - **`account_tag = HMAC(fpKey, "tag:<uid>:<mandateId>")`** — posted on-chain
     via `attest_account_binding`, which only an attested agent can call. It is
     salted **per mandate**, so the same account in two mandates yields unrelated
     tags, and the raw `uid` is never on-chain or reversible.
   - **`globalFingerprint = HMAC(fpKey, "global:<uid>")`** — kept **only inside
     the enclave**, used to de-duplicate (one account can't back two MM
     identities). It is never published, so no cross-mandate-linkable id exists
     on-chain.
3. The contract marks the mandate `account_verified`, and stores the tag
   immutably — a later binding must match, so the committed account cannot be
   swapped mid-mandate without the record showing it.

## What it unlocks

- **Verified reputation / unified identity.** The NEAR profile now carries
  "proven control of exchange account(s) + this record" — portable across clients.
- **Sybil / dedup resistance.** The same exchange account can't be claimed by two
  NEAR identities (enclave rejects the second with `ACCOUNT_CLAIMED`).
- **Account-swap detection.** The on-chain tag is immutable per mandate; a swap
  attempt is rejected.

## MM privacy (a first-class constraint)

- **The book never leaves the enclave** — unchanged; only aggregate metrics are
  on-chain.
- **The account UID is never published.** On-chain there is only a one-way HMAC
  under a TEE-held key — not reversible, not brute-forceable (the key is secret
  and the UID space is large).
- **No public cross-mandate correlation.** The on-chain tag is salted per
  mandate, so observers can't tell that two mandates — or two NEAR identities —
  share an exchange account. De-duplication is done **privately inside the
  enclave**; the correlatable global fingerprint never leaves the TEE.
- **UI shows only a boolean** ("✓ verified account"), never the tag or any
  account detail.

Trade-off, stated plainly: because dedup happens inside the enclave, the public
can't independently verify it — they trust the attested code, exactly as they do
for the verdicts. And this proves *control of a read-only key to the account*,
not active control; a stronger proof would need a non-read action, which the
read-only rule forbids. That is the correct ceiling for this design.

## Production note

The enclave's dedup registry is in-memory in this branch; production seals it to
the TEE so it survives restarts and (if the agent fleet grows) is shared across
attested instances (R2).
