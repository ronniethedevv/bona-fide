# CVM runbook

Everything about running the attested agent, written after doing it the hard
way. Read §0 and §1 before touching anything: the two expensive mistakes in
this project were both avoidable, and both cost NEAR.

---

## 0. Updating your clone when PRs are merged

You hit this every time, so here it is once, properly.

```bash
cd ~/bona-fide
git status --short
```

Read the two columns. A letter in the **first** column is staged, in the
**second** is unstaged, and `??` is untracked. Then:

```bash
# 1. Throw away local edits to files you do not own (evidence/ is regenerated).
git checkout -- evidence/

# 2. Untracked files that main now tracks will block the pull. Delete them;
#    main's copies are the ones you want.
#    (e.g. after the counterparty mandate: evidence/live/verdicts-mandate-2.json)

# 3. Park the files that ARE yours — the Phala config carries your CVM
#    settings, which exist nowhere else.
git stash push -m "phala config" -- deployment.yaml docker-compose.yaml

# 4. Fast-forward. --ff-only refuses to invent a merge commit.
git pull --ff-only origin main

# 5. Put your config back, then drop the parked copy.
git checkout 'stash@{0}' -- deployment.yaml docker-compose.yaml
git stash drop

git status --short     # should show only deployment.yaml + docker-compose.yaml
```

Your `.env` files are gitignored and are never touched by any of this.

If step 4 says **"divergent branches"**, you are not on `main`:
`git branch --show-current`, then `git checkout main` and retry.

---

## 1. Rules that cost NEAR when broken

1. **Stop the CVM before changing approved measurements.** A running agent
   retries registration in a loop, and the Shade bootstrap derives a *new*
   agent account each attempt, funding each one. That is how ~12 NEAR
   disappeared in one afternoon. Stop first, change, then start.
2. **Approve the new compose hash before booting**, not after. Changing the
   CVM's environment changes `app_compose_hash`, and the contract rejects a
   quote whose compose hash is not approved. Stage with
   `scripts/phala-stage-seed-env.mjs`, approve, *then* start.
3. **Check which contract your `.env` points at** before running any script
   that writes. `fix-measurements.ts` was once run against the live demo
   contract because `agent/.env` was stale; it took a repair script to undo.
   Every write script prints the contract id first — read that line.
4. **Auto-topup stays OFF** in Phala. A bootstrap loop with auto-topup on is an
   open tap.

## Funding, before you start

| account | role | top up to |
|---|---|---|
| `command-hay.testnet` | Shade master; funds each agent account | **~15 NEAR** |
| `experiment-still.testnet` | rt2 owner; gas only | 3 NEAR is fine |

Faucet: <https://near-faucet.io/> (10 NEAR per request, repeatable).

---

## 2. Decide which job you are doing

Three different things get called "the CVM work". They have very different
costs.

| Goal | Needs the CVM? | Needs an exchange key? | Cost |
|---|---|---|---|
| **A.** Verdicts on mandate `#2` (the counterparty one) | no | no | ~0 |
| **B.** A mandate showing `account_verified: true` | no | **yes** | ~0 |
| **C.** The same, but attested by real TDX hardware | **yes** | yes | NEAR + Phala credit |

**A and B do not need Phala at all.** `bona-fide-rt2.testnet` runs
`requires_tee: false`, so the owner can whitelist a locally-run agent and that
agent can submit verdicts and attest bindings. If the deadline is close, do A
and B, and treat C as a stretch.

The honest framing if you only do A and B: the *attested* record on
`bona-fide-tee1.testnet` already exists and is unchanged. rt2 is the local-mode
deployment and always was.

---

## 3. Job A — verdicts on mandate #2

```bash
cd ~/bona-fide/agent
```

**1. Point `.env` at rt2 and give it the owner key.** `nano .env` (never `cp`
over it — that has wiped a filled file before):

```
AGENT_CONTRACT_ID=bona-fide-rt2.testnet
SPONSOR_ACCOUNT_ID=experiment-still.testnet
SPONSOR_PRIVATE_KEY=ed25519:...        # from .env.rt2-backup
```

**2. Start the agent.**

```bash
npm run dev
```

It derives an agent account, prints it, and waits: `waiting to be whitelisted:
<account>`. Copy that account id.

**3. Whitelist it** (owner-only; rt2 is local-mode so this method exists):

```bash
near call bona-fide-rt2.testnet whitelist_agent_for_local \
  '{"account_id":"<the account it printed>"}' --accountId experiment-still.testnet
```

Use whatever NEAR CLI you have — check its syntax, it changes between versions.
The agent picks it up on its next retry and registers itself.

**4. Score mandate #2:**

```bash
AGENT_URL=http://localhost:3000 FIXTURE=honest-mm \
  DOTENV_CONFIG_PATH=.env npx tsx scripts/seed-counterparty.ts --send
```

The mandate already exists, so this only scores it.

**5. Re-capture evidence and push:**

```bash
cd .. && CONTRACT_ID=bona-fide-rt2.testnet npm run evidence
git add evidence && git commit -m "evidence: verdicts on the counterparty mandate" && git push
```

---

## 4. Job B — a verified mandate (identity binding)

This is the one that lights up `account_verified`. It needs **a real read-only
exchange key**, because the binding is the enclave attesting that it saw a
working key for a specific account. Nothing fakes that.

**You need a production read-only key. There is no testnet substitute.**

Binance Spot Testnet (`testnet.binance.vision`) serves **only `/api/*`** — the
entire `/sapi/*` namespace is absent, and Binance documents this explicitly.
The read-only gate is `GET /sapi/v1/account/apiRestrictions`, so on testnet it
cannot be called at all: intake rejects the key before it ever reaches the
binding step. Spot Demo Mode has the same limitation.

What testnet *is* good for, if you want to exercise the plumbing: the signing
is identical (HMAC-SHA256 over the query string, `X-MBX-APIKEY`, `timestamp`,
`recvWindow`), `GET /api/v3/account` does return a numeric `uid`, and keys
default to no `TRADE` permission. So `EXCHANGE_BASE_URL` remains useful for
testing everything except the one check that matters here.

So Job B needs a key from a **production** Binance account:

- A zero balance is fine — `apiRestrictions` only needs a valid key.
- Create the key with **read permission only**: no spot/margin trading, no
  withdrawals, no universal transfer. The agent re-checks this and rejects
  anything else, but do not hand it a key that could trade.
- Account creation requires KYC. If that is not something you want to do for a
  hackathon demo, **skip Job B**. The record then keeps saying
  `account_verified: false`, which is true, and the README says why.

> **Do not loosen the check to make the demo work.** The obvious shortcut —
> skipping `apiRestrictions` when the host does not serve it — would have the
> enclave attest "this key is read-only" when it had verified no such thing.
> That is the one claim this project exists to make. A dark badge is worth more
> than a lit one that means nothing.

With the agent from §3 still running:

1. Build the web app pointing at the agent:
   ```bash
   cd ~/bona-fide/web
   VITE_CONTRACT_ID=bona-fide-rt2.testnet VITE_AGENT_URL=http://localhost:3000 npm run build
   npx vite preview --port 4173
   ```
2. Open `http://localhost:4173/mandate/2/key`. The offline notice is gone,
   because the agent is reachable; the form is there.
3. Paste the read-only key and secret. The browser seals them to the enclave
   key — they are encrypted before they leave the page.
4. The agent verifies the key is read-only, reads the account uid, and calls
   `attest_account_binding` with `HMAC(fpKey, "tag:<uid>:2")`.
5. Reload `/mandate/2`. It should show the verified marker, and
   `get_mandate` should return `account_verified: true` with a 64-hex
   `account_tag`.

**What goes on chain is the tag, never the uid.** It is salted per mandate, so
the same exchange account in two mandates produces unrelated tags.

If intake returns `ACCOUNT_CLAIMED`, a different NEAR account already bound
that exchange account — that is the Sybil guard doing its job.

---

## 5. Job C — the attested path on tee1

Only worth it if A and B are done and you have time and credit.

**Before you start:** `command-hay.testnet` at ~15 NEAR, auto-topup **off**,
and read §1 again.

1. **Start the CVM** in the Phala dashboard. Watch the serial log until the
   agent prints its account.
2. **Read the real measurements** from the CVM's attestation (dashboard → the
   CVM → Attestation / TCB details): `mrtd`, `rtmr0`, `rtmr1`, `rtmr2`, and
   from the RTMR3 event log the `key_provider_event_digest` and
   `app_compose_hash`.
3. **Stop the CVM.** (Rule 1.)
4. **Approve them:**
   ```bash
   cd ~/bona-fide/agent
   # .env must point at bona-fide-tee1.testnet with command-hay as sponsor
   npx tsx scripts/fix-measurements.ts <mrtd> <rtmr0> <rtmr1> <rtmr2> \
     <key_provider_event_digest> <app_compose_hash>
   ```
   It prints the contract id first. **Read it.**
5. **Start the CVM again.** The agent registers on its next retry.
6. If you are changing the CVM's environment (e.g. enabling seeding), stage it
   with `npx node scripts/phala-stage-seed-env.mjs`, which prints the new
   `preview_compose_hash` and the exact `fix-measurements` command — approve
   that hash **before** booting.

### Known traps

- **dstack version.** The Shade CLI bundles measurement tables for versions
  Phala's KMS has retired (CLI ≤2.4.0 knows 0.5.8/0.5.7; KMS 2026-11 wants
  0.5.12+). `deployment.yaml` will be rejected with "dstack_version X is not
  supported". The workaround this project used: deploy from the Phala wizard
  with a supported image, then approve the enclave's own reported measurements
  with `fix-measurements.ts`.
- **`key_provider_event_digest` from an older CLI will not match.** Read it
  from the running CVM's TCB event log, not from what the CLI computed.
- **WSL networking.** `npm ERR_SSL_CIPHER_OPERATION_FAILED` or `ETIMEDOUT`
  during a Docker build is an MTU problem, not a registry problem:
  ```bash
  sudo ip link set dev eth0 mtu 1400
  # /etc/docker/daemon.json: {"mtu":1400}
  # From Windows PowerShell (admin), persistent:
  #   netsh interface ipv4 set subinterface "vEthernet (WSL)" mtu=1400 store=persistent
  ```
  Node 24 also failed where Node 22 worked.

### When you are done

**Stop the CVM.** The on-chain record survives it; a running CVM does not stop
costing. The attestation on tee1 expires 19 Nov 2026 either way, and the
verdicts it signed remain valid because the record is append-only.
