# sources/ (P2.4)

One interface, two implementations:

- `live.ts` — reads a committed account from the exchange, read-only.
- `replay.ts` — reads fixture files under `fixtures/replay/` (honest MM, dumping
  MM, key-revoked, exchange outage). Replay data is always labelled `Replay`
  on-chain and in the UI (invariant I9).
