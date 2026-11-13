# Screenshots

Captured from the built app against the live contract
(`bona-fide-rt2.testnet`) — not mockups, and not hand-edited. Regenerate them
by running the app and taking the same four views; every number in them is a
view call away from being checked against the chain.

| File | What it shows |
|---|---|
| `1-directory.png` | The directory, with the column naming the project that co-signed each engagement, and the flag on the account that co-signed its own. |
| `2-mandate-pass.png` | An honest mandate: epoch timeline green, metrics inside the epoch. |
| `3-mandate-fail.png` | The dumping mandate: epoch 0 **Fail**, `LOAN_CAP`, net sells 8.40 base against a 1.00 cap. |
| `4-keycheck-rejected.png` | The read-only permission check rejecting a trade-enabled key. |

The `SIMULATED DATA` badges are in the product, not added for the screenshots:
the market data behind these verdicts is the committed replay fixtures. The
scorer, the contract and the attestation are real.
