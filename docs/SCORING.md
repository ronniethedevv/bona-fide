# Scoring specification

The exact rules a Bona Fide verdict is computed from. This is the normative
document: the production scorer (`agent/src/scoring/scorer.ts`) and the
independent reference implementation (`agent/test/reference-scorer.ts`) are both
written from it, and a property test cross-checks them against each other.

Scoring is **pure and deterministic** — same inputs always produce the same
verdict, on any machine. No AI model is involved at any point.

---

## 1. Inputs

**Mandate terms** (co-signed on-chain, hashed into `terms_hash`):

| Term | Meaning |
|---|---|
| `max_spread_bps` | Widest acceptable MM quoted spread, in basis points |
| `depth_band_bps` | Half-width of the depth band around mid (200 = ±2%) |
| `min_depth_per_side_quote` | Minimum resting depth per side, **quote** units, fixed-point 1e6 |
| `min_uptime_bps` | Minimum fraction of samples meeting all quote obligations |
| `loan_cap_per_epoch_base` | Max net disposal of the base token per epoch, fixed-point 1e6 |
| `epoch_secs`, `sample_secs` | Epoch length and sampling interval (`epoch_secs` is a whole multiple of `sample_secs`) |

**Per sample** (every `sample_secs`): the public best bid/ask, and the committed
account's open orders on the pair (price and size per level).

**Per epoch:** the account's own trades (side, base quantity), base-token
withdrawals, and the base-token balance at epoch open and close (used for
reconciliation; optional — if unavailable, that check is skipped).

## 2. Arithmetic conventions

- All money arithmetic uses **fixed-point decimals** (decimal.js, 40 digits);
  **no floating point** anywhere in scoring.
- Quantities bound for the chain are integers scaled by **1e6** and carried as
  decimal strings (`U128` on-chain).
- Every division **floors** (rounds toward −∞). Basis-point values are integers.
- `coverage_bps` and `uptime_bps` are clamped to `[0, 10000]`.

## 3. Per-sample metrics

### Sampling schedule (anti-gaming)

Epoch start and `sample_secs` are public on-chain, so a fixed cadence is
predictable: a market maker could quote only around the moments it knows will be
observed ("flicker quoting") and pass uptime while providing little real
liquidity in between.

Each sample is therefore taken at a pseudo-random offset **inside its own
window**: offset `i` = `HMAC(jitter_key, mandate ‖ epoch ‖ i) mod (sample_secs ×
1000)`, where `jitter_key` is derived from the enclave's TEE key. That key never
leaves the enclave, so the schedule is **unpredictable to the MM** yet **exactly
reproducible for audit**. Exactly one sample is taken per window, so `expected`,
coverage and uptime arithmetic are unchanged.

Let `mid = (public_best_bid + public_best_ask) / 2` — the standard midpoint.

**MM best quotes.** `mm_best_bid = max(price)` over the account's bids;
`mm_best_ask = min(price)` over its asks. Either is `null` if that side is empty.

**Quoted spread.**
```
spread_bps = max(0, floor((mm_best_ask − mm_best_bid) / mid × 10000))
```
- If **either side is missing**, or `mid ≤ 0`, the spread is **infinite**,
  represented by the sentinel `1,000,000` bps. The sample can never be "ok".
- **Clamped at 0.** A self-crossed quote (ask < bid) cannot rest on a real
  order book; treating it as zero spread keeps the metric signable (a negative
  value would violate the pre-sign range guard) without rewarding it.

**Depth per side** (quote units, i.e. `price × size`):
```
bid_depth = Σ price × size   for bids where price ≥ mid × (1 − band)
ask_depth = Σ price × size   for asks where price ≤ mid × (1 + band)
band = depth_band_bps / 10000
```
- **Band boundaries are inclusive** (`≥` and `≤`): an order resting exactly on
  the band edge counts.
- Depth is converted to fixed-point by `floor(value × 1e6)` **before**
  comparison, so the comparison is exact integer arithmetic.

**Sample verdict.**
```
ok = spread_bps ≤ max_spread_bps
   AND bid_depth ≥ min_depth_per_side_quote
   AND ask_depth ≥ min_depth_per_side_quote
```
All three comparisons are **inclusive** — meeting the bound exactly passes.

## 4. Per-epoch metrics

```
expected  = floor(epoch_secs / sample_secs)
collected = number of samples actually obtained
coverage_bps = clamp(floor(collected × 10000 / expected))
uptime_bps   = clamp(floor(ok_count × 10000 / expected))
```

**The uptime denominator is `expected`, not `collected`.** A sample the agent
could not obtain is *not ok* — an agent that cannot observe cannot certify. This
is deliberate: using `collected` would let an outage silently inflate uptime.
It follows that `uptime_bps ≤ coverage_bps` always (an asserted property).

**Median spread.** The median over samples with a **finite** spread (one-sided
samples are excluded, since their spread is undefined rather than large). Even
counts take `floor(mean of the two middle values)`. If no sample had a finite
spread, the result is the sentinel `1,000,000`.

**Disposal of the loaned asset.**
```
net_sells   = Σ sell base_qty − Σ buy base_qty      (reported clamped at ≥ 0)
withdrawals = Σ withdrawal base_qty
loan_used   = max(net_sells, 0) + withdrawals
loan_ok     = loan_used ≤ loan_cap_per_epoch_base
```
`net_sells` is reported clamped at zero because the on-chain field is unsigned;
a net *buyer* reports `0`, which is correct for a cap on disposal.

**Balance reconciliation.** Trades and withdrawal records do not capture every
way base tokens can leave the committed account: an internal transfer (spot →
funding, a move to a sub-account) is performed on the exchange's website, where
the API key's permissions are irrelevant, and need not appear in withdrawal
history. So the balance is checked against the activity that should explain it:

```
expected_close = open_balance + buys − sells − withdrawals
shortfall      = expected_close − close_balance
tolerance      = open_balance × 10bps
unexplained    = shortfall > tolerance ? shortfall : 0
loan_used      = max(net_sells, 0) + withdrawals + unexplained
```

Any `unexplained > 0` adds the `BALANCE_LEAK` reason **and** counts toward the
loan cap — an unexplained outflow is disposal until proven otherwise. The 10 bps
tolerance absorbs trading fees charged in the base asset and dust rounding, so
ordinary activity never trips it. A balance that *grew* is never penalised. If
either balance is unavailable the check is skipped rather than guessed at.

`unexplained` is not a separate on-chain field; it is visible through
`BALANCE_LEAK` and its effect on the loan check.

## 5. Status

Evaluated in this order — **the first match wins**:

1. **`Fail` / `KEY_REVOKED`** — the exchange returned an auth error (the MM
   withdrew access). Decided by the runner, not the scorer.
2. **`Outage`** — `coverage_bps < 9000` **and** the gaps were exchange/server
   errors. No fail reasons are attached: the agent, not the MM, failed to
   observe.
3. **`Pass`** — `uptime_bps ≥ min_uptime_bps`, **and** `loan_ok`, **and** no
   unexplained outflow.
4. **`Fail`** — otherwise, listing every failing reason: `UPTIME`, `LOAN_CAP`,
   `BALANCE_LEAK`.

A missing verdict is not a status the scorer produces: if no verdict is
submitted before `epoch_end + grace`, anyone may record `Missed` on-chain.

## 6. How we know it is right

- **Determinism** is asserted as a property, not assumed.
- **Property-based tests** (fast-check, `scoring.property.test.ts`) assert laws
  over randomly generated inputs including adversarial ones (crossed books,
  empty sides, zero sizes, no samples): ranges stay signable, `uptime ≤
  coverage`, a looser spread bound never lowers uptime, a lower depth floor never
  lowers uptime, raising the loan cap never introduces `LOAN_CAP`, and a buy
  never increases net sells.
- **Independent cross-check:** a second implementation written from this spec in
  a different style (plain floats, no fixed-point) is compared against the
  production scorer on every generated case.
- **Mutation-checked:** the suite was verified to *fail* when the scorer is
  deliberately broken (inverting the ask-side depth filter; switching the uptime
  denominator to `collected`), so the tests are not vacuous.

## 7. Relationship to industry practice

These metrics deliberately mirror how market-making obligations are written in
practice. Useful references to check the method against:

- **Exchange liquidity-provider / market-maker programmes** (e.g. Binance, OKX,
  Kraken) state obligations as *two-sided quotes within X bps of mid, minimum
  size per side, present for Y% of the period* — the same three axes as
  `max_spread_bps`, `min_depth_per_side_quote`, `min_uptime_bps`.
- **Designated market-maker quoting obligations** (NYSE DMM; options
  market-maker rules) are the standard reference for quote-presence/uptime.
- **Market microstructure literature** for the canonical measures: Harris,
  *Trading and Exchanges*; O'Hara, *Market Microstructure Theory*; Hasbrouck,
  *Empirical Market Microstructure*.
- **Forgd's Market Maker Performance Index** is the closest existing comparable
  for grading crypto market makers.

### Known simplifications (stated, not hidden)

| We do | Richer practice | Why deferred |
|---|---|---|
| **Quoted** spread (best bid/ask) | **Effective/realised** spread vs. trade prices | Needs trade-level matching against the book |
| One depth band | Several bands (±0.5% / ±1% / ±2%) | One band keeps the mandate readable; multi-band is additive |
| **Median** spread | Time-weighted average, or percentiles | Median resists outliers and is cheap to verify |
| Fixed-interval sampling | Continuous time-weighted presence | Sampling is what a read-only API permits |

None of these change the integrity of a verdict — they change how rich it is.
Each can be added without altering the trust model, because the mandate pins the
exact rule set via `terms_hash`.

## 8. What a verdict proves — and what it does not

Being precise about this matters more than sounding strong.

**Replay verdicts are publicly re-executable.** The fixtures ship in the repo, so
anyone can run `npm run demo:replay` or the test suite and recompute the exact
same verdict. Determinism here is directly checkable by a stranger.

**Live verdicts are deterministic but not publicly re-executable.** They are
computed over samples only the enclave ever saw — necessarily, because
publishing the raw order-book and trade data would leak the market maker's book,
which is the entire thing this product protects. So the public does not verify a
live verdict by recomputing it; it verifies that **approved, attested code**
computed it, and that the code is the code published here. That is a different
guarantee, and we state it as such: *attestation, not re-execution.*

*(Possible later: the enclave retains an encrypted sample log, disclosable to a
named arbiter with the MM's consent, so a disputed epoch can be re-executed
without making the book public.)*

**The exchange is a trusted oracle.** We attest our computation over what the
exchange reported. We do not — and cannot — prove the exchange reported
truthfully. A compromised or dishonest venue feeding false order-book or trade
data would produce an honestly-computed verdict over dishonest inputs.

**One key shows one account.** The record proves what happened in the committed
account. Balance reconciliation now catches value leaving that account by
unreported routes, but it cannot prove the MM holds no other accounts.

## 9. Known adversarial findings (v2 backlog)

Named deliberately: an unexamined scoring system is worth less than one whose
gaps are published.

| # | Finding | Status |
|---|---|---|
| 1 | **Outage is a shelter.** `Outage` requires low coverage caused by server errors and is not a `Fail`, so an MM able to induce errors (e.g. exhausting account rate limits with its own parallel keys) could convert a bad epoch into a grey one. | Mitigated by visibility — outage counts are public on the MM profile, so a pattern is obvious. **v2:** distinguish rate-limit errors from 5xx, and let a project terminate after N outages. |
| 2 | **Band-edge stuffing.** Spread is measured at the best quote with *any* size, and depth counts anywhere inside the band. Token size at the touch plus bulk at the band edge can pass both tests while being thin where it matters. | **v2:** a minimum size at top-of-book, and/or multi-band depth (±0.5% / ±1% / ±2%). Parameter additions; same trust model. |
| 3 | **The algorithm is not pinned per mandate.** `terms_hash` pins the parameters and the approved codehash pins the algorithm, but the mandate does not record *which* codehash was approved when it was co-signed, so a mid-mandate scorer update scores later epochs under rules nobody signed. Detectable (every verdict records its codehash) but not prevented. | **v2:** snapshot the approved measurement into the mandate at co-sign and check it in `submit_verdict`. |
| 4 | **Non-atomic sampling.** Mid-price and the MM's orders are fetched milliseconds apart, so a fast-moving market adds noise to a sample. | Accepted — absorbed by the uptime threshold; not worth the complexity to fix. |
| 5 | **The cap is per-epoch by design.** Total permitted disposal is `cap × epochs`, i.e. a drip limit. | Accepted — this is usually what token-loan agreements want. The mandate UI should show the arithmetic so projects see the cumulative figure. |
