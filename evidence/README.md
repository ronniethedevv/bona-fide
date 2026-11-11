# Evidence

Nothing in this directory is hand-written where it could be machine-read. It
exists so a claim in the README can be checked without running the stack or
trusting the authors.

| Item | What it proves | How to re-check it |
|---|---|---|
| [`deployment.md`](./deployment.md) | Which accounts exist, who deployed what, and when. | Every account links to its NearBlocks page. |
| [`live/`](./live/) | The on-chain state behind every published claim: the registered agent, the co-signed mandates, and each epoch's verdict — raw JSON-RPC responses, each stamped with the block it was read at. | `npm run evidence` regenerates the whole directory from chain state; diff it against what is committed. |
| [`screenshots/`](./screenshots/) | What the web app renders over that state. | Run the web app against `bona-fide-rt2.testnet` and compare. |

Two caveats, stated rather than buried:

- **The replay verdicts were computed from committed fixtures**, not live
  exchange data, and the web app marks them with an amber **SIMULATED DATA**
  badge. What the chain proves is that a registered agent scored those inputs
  deterministically and the contract recorded the result append-only. The
  fixtures themselves ship in [`fixtures/replay/`](../fixtures/replay/), so the
  scoring of them is re-executable by anyone: `npm run demo:replay`.
- **This deployment runs in local (non-TEE) mode** (`requires_tee: false`),
  so the registered agent's attestation is the mock local attestation, not a
  Phala TDX quote. The TEE path is the same deploy pipeline with
  `environment: TEE` in [`deployment.yaml`](../deployment.yaml); its status is
  tracked in the README's "What is real today" table.
