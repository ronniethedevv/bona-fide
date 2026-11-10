# Bona Fide

Let market makers prove they kept their deals — inside a sealed enclave, so no one sees their book.

**Most agentic-finance security is about safely letting an agent _spend_. Bona Fide's agent never spends — it only _reads_ and _signs attestations_, so the whole fund-movement attack surface is gone.** It's scoped permissioning taken to its limit: a read-only exchange key, held in a TEE, with a deterministic guard layer between the agent and every signature. The agent can't move money, so there's nothing to contain.

---

## How to test

> Live app: **`<LIVE_APP_URL>`** · Contract: **`<CONTRACT_ID>`** (NEAR testnet)
> _(filled in once deployed — see [DEPLOY.md](./DEPLOY.md))_

You do **not** need a market-making account or an exchange key to see this working.

### 1. See existing verdicts (no wallet needed)
1. Open the live app.
2. On the **Directory**, click a market maker (e.g. the seeded honest MM or dumping MM).
3. Open a mandate and click a cell in the **epoch timeline** — green **Pass**, red **Fail** (with reasons like `LOAN_CAP`), grey **Outage**, hatched **Missed**. Replay data wears an amber **SIMULATED DATA** badge.

### 2. Try the key check (no key needed)
Open **Try the key check**. Pick "Trade-enabled key" and run it — the enclave's read-only permission check rejects it on sight (`TRADE_ENABLED`). The read-only key is accepted. All on canned exchange responses, labelled simulated.

### 3. Run a fresh replay scoring (no wallet, no deploy)
```bash
git clone <this repo> && cd bona-fide
npm run demo:replay
```
This scores the honest and dumping fixtures with the real scorer and prints the verdicts (honest → Pass, dumping → Fail/`LOAN_CAP`), plus the key-check results. Fully offline.

### 4. Get a NEAR testnet account (to co-sign or create a mandate)
- Create one at a testnet wallet (e.g. MyNearWallet testnet) or with `near create-account <name>.testnet --useFaucet` (near-cli-rs).
- Connect it in the app (top right). As the **market maker** you can create a mandate (`/new`) — the terms hash is shown before you sign. As the **named, allowlisted project** you can co-sign to activate it.

### 5. (Optional) Connect a real read-only key
On a mandate, open **Connect key**. Create a **read-only** key on your exchange, paste it, and it is encrypted in your browser to the enclave's key before it leaves the page. A key that can trade or withdraw is rejected.

---

## What it is

Token projects hire market makers to keep their markets liquid, often lending them tokens. Two things go wrong: MMs miss agreed KPIs (spread, depth, uptime) and projects can't prove it, or MMs dump the loaned tokens. The incumbent grading tool only scores MMs that hand their book to a third party — small MMs are invisible or exposed.

Bona Fide fixes the trust problem without the exposure:

1. **Engagement Mandate** — the MM and project co-sign terms on NEAR (token, exchange, account, KPI bounds, loan cap, dates).
2. **Sealed inspection** — the MM gives a **read-only** exchange key to a **Shade Agent** running in a TEE. The key is encrypted in the browser to a key that only exists inside the enclave.
3. **Deterministic scoring** — each epoch the agent reads the committed account read-only, scores it with plain code against the mandate, and submits a **signed verdict** to the contract.
4. **Attested, append-only record** — the contract only accepts verdicts from agents running **approved, attested code**. Verdicts are permanent; a missing one becomes a recorded miss.

> **AI may propose; deterministic code decides; the log can't be quietly edited.**
> Scoring is plain code, verdicts are signed by attested code, and the on-chain record is append-only.

## How it works

```
[MM browser] --(seal key to enclave pubkey)--> [Shade Agent in TEE] --read-only GET--> [exchange]
[Shade Agent] --(submit_verdict, as attested agent)--> [bona-fide contract on NEAR] <--(views)-- [web app]
```

- **contract/** — Rust (near-sdk), extends the Shade Agent template: mandates, the project allowlist, agent registration + published enclave key, append-only verdicts, missed-epoch recording.
- **agent/** — TypeScript Shade Agent: enclave keypair, sealed-box key intake, a **GET-only** exchange client, the read-only permission check, the deterministic scorer, pre-sign guards, and verdict submission.
- **web/** — Vite + React: directory, profiles, mandate timelines, create/co-sign, connect-key.

The exact scoring rules — every definition, boundary and rounding decision, how
they're verified, and how they relate to exchange market-maker programmes — are
specified in **[docs/SCORING.md](./docs/SCORING.md)**.

### Scoped permissioning, taken to its safest form

The emerging playbook for autonomous agents in finance is: isolate root keys, sign inside a TEE, whitelist what the agent can touch, and put a deterministic guard between the agent's output and any signature. Bona Fide applies all four — and removes the hardest part by giving the agent **no spend authority at all**:

- **Isolation:** root wallets never enter the agent. The only credential it holds is a read-only exchange key, sealed to a key that exists only inside the enclave.
- **Whitelisting / Guard Mode:** the exchange client exposes **only GET** requests (I1), and a key with any trade/transfer/withdraw right is rejected before first use (I2).
- **Deterministic output guards:** a set of pure pre-sign checks runs between the scorer and the signature — nothing is signed unless the mandate matches, the epoch has closed, metrics are in range, the data source is recorded, and the agent's code is still approved.
- **Attested code:** the contract accepts a verdict only from an agent whose measurements are approved, so the guards can't be bypassed by swapping the code.

## NEAR components used

- **Shade Agents** (NEAR × Phala dstack TEE) — attested off-chain code whose output the contract verifies.
- **NEAR smart contract** (near-sdk) — the mandate registry and the append-only verdict record.
- **NEAR wallet selector** — project/MM signing in the browser.

## Trust limits (read these)

- **Hardware trust:** if the TEE is broken, the book could leak. Keys are **read-only**, so funds can't move regardless.
- **One key shows one account.** The record proves what happened in the committed account, not that the MM has no others.
- **The project allowlist is owner-controlled** in this phase.

## Exchange

v1 uses **Binance** spot (read-only). Binance exposes an API key's own permissions via a read-only `GET /sapi/v1/account/apiRestrictions`, so the enclave can reject a trade/withdraw-enabled key before first use — the core "reject a dangerous key on sight" guarantee.

## Roadmap

- NEAR AI Cloud explainer for failed epochs (private note from metrics).
- Paid detailed lookups (HTTP 402).
- Chain Signatures mirror of summaries to other chains.
- A Midnight / zero-knowledge variant.

## Develop

```bash
bash scripts/dev-setup.sh              # Rust wasm target + Node deps
cd contract && cargo test              # 14 tests
cd agent && npm ci && npm test         # 57 tests
cd web && npm ci && npm run build
```

Built on the [Shade Agent template](https://github.com/NearDeFi/shade-agent-template) (Apache-2.0). License: Apache-2.0.
