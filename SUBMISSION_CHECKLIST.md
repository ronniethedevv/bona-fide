# Submission checklist

What is done, what remains, and who does it. Deadline: **14 November 2026**.
Everything on this list is free — testnet NEAR comes from the faucet, hosting
uses a free static tier, and the TEE step runs only on free trial credits.

## Done — verifiable now

- [x] Contract live on NEAR testnet: [`bona-fide-rt2.testnet`](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet) (owner `experiment-still.testnet`).
- [x] Agent registered and whitelisted; enclave public key published on-chain.
- [x] Demo seeded on-chain: mandate `0` honest → **Pass, Pass**; mandate `1` dumping → **Fail**.
- [x] Scoring hardening merged: TEE-keyed sampling jitter, balance-leak reconciliation ([#8](https://github.com/ronniethedevv/bona-fide/pull/8)).
- [x] Deploy/bootstrap reliability fixes merged ([#14](https://github.com/ronniethedevv/bona-fide/pull/14)).
- [x] CI green on `main`: 14 contract tests, 80 agent tests, clippy `-D warnings`, web build, no-context guard.
- [x] Docs set: README · ARCHITECTURE · THREAT-MODEL · SCORING · DEPLOY · evidence/.
- [x] LICENSE (Apache-2.0) committed.

## Remaining — in order

- [ ] **Generate the live evidence bundle** (one command, any machine):
      `npm --prefix agent install && npm run evidence`, then commit
      `evidence/live/`.
- [ ] **Host the web app** on a free static tier (GitHub Pages or Cloudflare
      Pages free plan — the build is pure static, reads NEAR from the browser,
      needs no server). Then replace the "hosted web app link lands here" line
      in the README with the URL.
- [ ] **TEE deployment on Phala** — *only if the Phala account shows free trial
      credits* (check the dashboard balance first; this project spends no
      money). If credits exist: set `environment: TEE` in `deployment.yaml`,
      `shade plan`, `shade deploy`, re-seed, and update the README's "What is
      real" table to real attestation. If not: the table already states local
      mode honestly — leave it.
- [ ] **Screenshots** into `evidence/screenshots/`: Directory, honest mandate
      timeline (green), dumping mandate timeline (red, `LOAN_CAP`), key check
      rejecting `TRADE_ENABLED`.
- [ ] **Demo video** (~2 min) from [`docs/demo-script.md`](./docs/demo-script.md).
- [ ] **Official judging criteria**: paste the hackathon's rubric link here and
      check the README maps to each criterion it names.
- [ ] **Delete the `context` branch** before submission (it is development
      scratch, guarded out of `main` by CI; it must not ship).
- [ ] Final cold-judge pass: a person who has never seen the repo follows
      "How to judge this fastest" and gets through steps 1–4 without help.

## Judge reproduction path (no secrets, no wallet)

```bash
git clone https://github.com/ronniethedevv/bona-fide && cd bona-fide
npm run demo:replay                      # recompute the verdicts offline
npm --prefix agent install && npm run evidence   # recompute the chain evidence
```

Then open the hosted app → Directory → the Pass and Fail timelines, and
**Try the key check** → `TRADE_ENABLED` rejected.
