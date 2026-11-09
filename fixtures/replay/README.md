# Replay fixtures (P2.4)

Simulated market-maker data for the demo and tests. **Never** contains real
account data. Data read from here is always labelled `Replay` on-chain and in the
UI (invariant I9).

Planned fixtures:

- `honest-mm/` — meets spread, depth and uptime; stays under the loan cap → Pass.
- `dumping-mm/` — sells loaned tokens above the cap → Fail (`LOAN_CAP`).
- `key-revoked/` — the exchange returns an auth error mid-epoch → Fail (`KEY_REVOKED`).
- `outage/` — exchange/server errors drop coverage below 90% → Outage.
