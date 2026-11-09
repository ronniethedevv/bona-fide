# Bona Fide

Let market makers prove they kept their deals — inside a sealed enclave, so no
one sees their book.

Market makers give a **read-only** exchange API key to a Shade Agent running in a
TEE. Each epoch the agent reads the committed account, scores it with
deterministic code against an on-chain **Engagement Mandate**, and submits a
signed verdict to a NEAR contract. The contract only accepts verdicts from
attested, approved agent code, and the record is append-only. A public page shows
each market maker's track record.

> Design pattern: **AI may propose; deterministic code decides; the log can't be
> quietly edited.** Scoring is plain code, verdicts are signed by attested code,
> and the on-chain record is append-only.

## Status

Early development (hackathon build). This repo is being built in phases:

| Area | Path | Stack |
|---|---|---|
| NEAR contract | `contract/` | Rust, near-sdk 5.26.1 (extends the Shade Agent template) |
| Shade Agent | `agent/` | TypeScript (ESM), Hono, `@neardefi/shade-agent-js` |
| Web app | `web/` | Vite 7 + React 19 + TypeScript |
| Replay fixtures | `fixtures/replay/` | simulated MM data, always labelled `Replay` |

A full **How to test** guide (for judges, no exchange account needed) lands with
the demo phase.

## Develop

```bash
# one-time bootstrap (Rust wasm target + Node deps)
bash scripts/dev-setup.sh

# contract
cd contract && cargo test && cargo check --target wasm32-unknown-unknown

# agent
cd agent && npm ci && npm run typecheck && npm test

# web
cd web && npm ci && npm run build
```

## Security posture

- The exchange client makes **read (GET) requests only** — it can never place,
  cancel, transfer or withdraw.
- Keys are encrypted in the browser to a key that only exists inside the enclave,
  and a key with any trade/transfer/withdraw permission is rejected before use.
- Scores are computed by deterministic code; no AI model decides or alters a score.

Built on the [Shade Agent template](https://github.com/NearDeFi/shade-agent-template)
(Apache-2.0).

## License

Apache-2.0.
