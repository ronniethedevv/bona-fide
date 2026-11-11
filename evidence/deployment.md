# Deployment record — NEAR testnet

Deployed 11 November 2026 with the Shade Agent CLI (`shade deploy`,
`environment: local`), from the config committed in
[`deployment.yaml`](../deployment.yaml).

| Role | Account | Link |
|---|---|---|
| Contract | `bona-fide-rt2.testnet` | [NearBlocks](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet) |
| Owner / master (deployer, demo project + MM) | `experiment-still.testnet` | [NearBlocks](https://testnet.nearblocks.io/address/experiment-still.testnet) |
| Registered agent (local mode) | `e3056536582c2c77e1ad9cb976cf5b4c95fe2dedd5ee95efec3e7237c7f2f8b4` | [NearBlocks](https://testnet.nearblocks.io/address/e3056536582c2c77e1ad9cb976cf5b4c95fe2dedd5ee95efec3e7237c7f2f8b4) |

## Init parameters

```json
{
  "requires_tee": false,
  "attestation_expiration_time_ms": 604800000,
  "owner_id": "experiment-still.testnet"
}
```

`requires_tee: false` because this is the local-mode deployment; the agent's
registration carries the mock local attestation. The TEE deployment flips
`environment: TEE` in the same config and approves the real Phala dstack
measurements instead.

## What was seeded

Run by [`agent/scripts/seed.ts`](../agent/scripts/seed.ts) against the running
agent, as the master account (owner, project and MM in one, for the demo):

| Mandate | Fixture | Outcome on-chain |
|---|---|---|
| `0` (`mm-honest`) | [`fixtures/replay/honest-mm.json`](../fixtures/replay/honest-mm.json) | 2 verdicts: **Pass, Pass** |
| `1` (`mm-dumping`) | [`fixtures/replay/dumping-mm.json`](../fixtures/replay/dumping-mm.json) | 1 verdict: **Fail** (loan cap exceeded) |

The raw on-chain state behind this table — contract info, the registered
agent, both mandates and every verdict — is captured block-stamped in
[`live/`](./live/) and regenerates with `npm run evidence`.

## Notes for reproducers

- Deploying fresh costs only faucet NEAR: the master account needs
  `funding_amount` (10) + ~0.2 for fees; the testnet faucet caps at 2 NEAR per
  request, so a fresh `shade auth set near testnet create-new` account needs a
  few top-ups. The full path, including the WSL keyring recipe, is in
  [`DEPLOY.md`](../DEPLOY.md).
- First-time agent registration costs ~0.31 NEAR from the agent account
  (an access key plus a 0.01 NEAR storage deposit); the bootstrap tops the
  agent up from the master automatically.
