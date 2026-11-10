# exchange/ (P2.2, P2.3)

Read-only exchange access. **GET requests only** — never order, cancel, transfer
or withdraw (invariant I1). Pending the Phase 0 exchange decision (R3), this holds:

- `<exchange>.ts` — read-only REST client exporting only GET helpers.
- `permissions.ts` — permission check that rejects any key with trade, transfer
  or withdraw rights before first use (invariant I2), returning a rejection code
  (`TRADE_ENABLED`, `WITHDRAW_ENABLED`, `INVALID`).
