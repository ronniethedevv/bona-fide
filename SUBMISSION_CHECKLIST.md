# Submission checklist — NEAR HACKATHON

Working list against the official rules
([nearhackathon.com/HACKATHON.md](https://nearhackathon.com/HACKATHON.md) —
re-read it before submitting; it can change). **Development ends
2026-11-14T23:59:00Z.** One submission per project, sent only after the team
confirms the exact payload. Everything on this list is free: testnet NEAR from
the faucet, hosting on a free static tier, and the TEE step inside Phala's
free trial credit.

## Done — verifiable now

- [x] Contract live on NEAR testnet: [`bona-fide-rt2.testnet`](https://testnet.nearblocks.io/address/bona-fide-rt2.testnet) (owner `experiment-still.testnet`).
- [x] Agent registered and whitelisted; enclave public key published on-chain.
- [x] Demo seeded on-chain: mandate `0` honest → **Pass, Pass**; mandate `1` dumping → **Fail**.
- [x] Scoring hardening merged: TEE-keyed sampling jitter, balance-leak reconciliation ([#8](https://github.com/ronniethedevv/bona-fide/pull/8)).
- [x] Deploy/bootstrap reliability fixes merged ([#14](https://github.com/ronniethedevv/bona-fide/pull/14)).
- [x] CI green on `main`: 18 contract tests, 88 agent tests, clippy `-D warnings`, web build, no-context guard.
- [x] Docs set: README (machine-readable "do X → see Y" judge path, per the rules) · ARCHITECTURE · THREAT-MODEL · SCORING · DEPLOY · evidence/.
- [x] LICENSE file committed (Apache-2.0) — required by Q-014.
- [x] Live evidence bundle committed: [`evidence/live/`](./evidence/live/) —
      block-stamped JSON-RPC responses for every public view method, captured
      at blocks 277238990–277238992. Re-check with
      `npm --prefix agent install && npm run evidence` and diff.

## Remaining — in order

- [x] **Web app hosted** (Vercel free tier, pure static, reads NEAR from the
      browser): <https://bona-fide-mm.vercel.app> — linked from the README.
      Q-012: keep it up through 2026-11-18, ideally 2026-11-25.
- [ ] **TEE burst on Phala** (fits comfortably in the $5 trial credit). The
      attestation lands **on-chain permanently**, so the paid CVM only needs to
      run for the deploy + seeding — hours, not weeks:
      1. Create a free Docker Hub account; set `build_docker_image.tag` in
         `deployment.yaml`.
      2. Set `environment: TEE`; `shade plan`, then `shade deploy` (builds the
         image, approves the **real** dstack measurements, deploys to Phala).
      3. Re-seed through the hosted agent; run `npm run evidence` so the real
         attestation is captured block-stamped.
      4. **Stop the CVM in the Phala dashboard.** The on-chain record — real
         measurements approved, verdicts accepted from the attested agent —
         survives it. Update the README's "What is real" table accordingly.
      ⚠️ **Never enable auto-topup on Phala** — a card is on file and this
      project spends no money. Prepaid balance running out just stops the CVM;
      that is fine.
- [ ] **Screenshots** into `evidence/screenshots/` (they double as X-post
      media): the Directory; the honest mandate's green timeline; the dumping
      mandate's red `LOAN_CAP` timeline; the key check rejecting
      `TRADE_ENABLED`.
- [ ] **Demo video** (~2 min) from [`docs/demo-script.md`](./docs/demo-script.md) —
      per Q-012, the video is what makes the demo judgeable if the hosted app
      is ever down.
- [ ] **The X demo post** (the team publishes it themselves). It must say the
      project was built at NEAR HACKATHON, tag **@NEARProtocol** and
      **#NEARHackathon** (optionally @NearLegion, @NearBuilders), and attach the
      video or screenshots. Draft to edit:
      > Projects hire market makers and can't prove they kept the deal — not
      > without seeing their book. Bona Fide, built at NEAR HACKATHON: the MM
      > hands a read-only key to a sealed TEE, deterministic code scores every
      > epoch, and a @NEARProtocol contract keeps the verdicts append-only.
      > The agent can't move money, so there's nothing to steal. Pass and Fail,
      > live on testnet — repo + demo below. What would you want scored?
      > #NEARHackathon
- [ ] **Mainnet payout account** — create a NEAR *mainnet* account in any
      wallet (free; named like `yourname.near` or implicit). The rules forbid
      anyone creating or inventing it on the team's behalf.
- [ ] **Confirm the submission fields** (the team decides every one; nothing is
      guessed): project name (suggest: `Bona Fide`), lead name, contact email,
      team size (`1`), tracks (suggest: `privacy`, `security`), payout account,
      repo URL (`https://github.com/ronniethedevv/bona-fide`), demo post URL,
      idea text 20–2000 chars (draft below), consent read verbatim.
      > Draft idea text: "Token projects hire market makers and lend them
      > tokens, then can't prove KPIs were kept or loans weren't dumped — the
      > incumbent fix is handing your order book to a third party. Bona Fide is
      > a Shade Agent on NEAR: the MM gives a read-only exchange key, sealed in
      > the browser to a key that exists only inside a Phala TEE. Deterministic
      > code samples the account at TEE-jittered moments, scores spread, depth,
      > uptime, net sells and balance leaks against co-signed on-chain terms,
      > and submits signed verdicts that the NEAR contract accepts only from
      > approved, attested code — append-only, with missed epochs recordable by
      > anyone. The agent holds no spend authority at all, so the entire
      > fund-movement attack surface is gone rather than guarded."
- [ ] **Make sure the repository is public** before the deadline (judges and
      the AI screeners cannot open a private one).
- [ ] **Delete the `context` branch** before submission (development scratch,
      guarded out of `main` by CI; it must not ship).
- [ ] Final cold-judge pass: someone who has never seen the repo follows
      "How to judge this fastest" and gets through steps 1–4 without help.
- [ ] **Submit once**: print the full JSON payload, get an explicit yes from
      the team, POST to the applications API, keep the `requestId`. Mistakes
      afterwards go through
      [request-changes](https://nearhackathon.com/request-changes) — never a
      second submission.

## Judge reproduction path (no secrets, no wallet)

```bash
git clone https://github.com/ronniethedevv/bona-fide && cd bona-fide
npm run demo:replay                      # recompute the verdicts offline
npm --prefix agent install && npm run evidence   # recompute the chain evidence
```

Then open the hosted app → Directory → the Pass and Fail timelines, and
**Try the key check** → `TRADE_ENABLED` rejected.
