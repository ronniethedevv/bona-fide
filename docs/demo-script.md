# Demo video — script & shot list (~2 minutes)

Goal: show the pitch — a Shade Agent inspects market makers inside a sealed box,
and a NEAR contract keeps their track record — in three concrete beats.

## Setup before recording
- Hosted app open at the Directory, with seeded testnet mandates visible
  (honest MM already Passing, dumping MM already Failing).
- A terminal in the repo root.
- Keep an amber **SIMULATED DATA** badge visible to be upfront that demo data is replay.

## Shot list

| # | Time | Screen | Say / show |
|---|------|--------|------------|
| 1 | 0:00–0:18 | Directory | "Projects pay market makers to keep markets liquid — and can't prove they did the job without seeing their book. BonaFide proves it inside a sealed enclave. And unlike most finance agents, this one never trades or moves funds — it only reads and signs attestations, so there's nothing to steal." Point at the MM list with pass rates. |
| 2 | 0:15–0:35 | Honest MM → mandate | Open the honest MM's mandate. Scroll the **epoch timeline** — all green **Pass**. Click a cell: show uptime, spread, depth, net sells within the loan cap. "Every epoch, attested code scored the real account read-only and signed the verdict on-chain." |
| 3 | 0:35–0:55 | Dumping MM → mandate | Open the dumping MM. Timeline shows a red **Fail**. Click it: `LOAN_CAP`, net sells above the cap. "This MM dumped loaned tokens — the record catches it. Permanent, append-only." |
| 4 | 0:55–1:15 | Try the key check | Pick "Trade-enabled key", run it → **rejected (`TRADE_ENABLED`)**. Then the read-only key → accepted. "The enclave checks the key's real permissions before first use. A key that can trade or withdraw is rejected on sight — funds can never move." |
| 5 | 1:15–1:35 | Terminal | `npm run demo:replay` — show honest → Pass, dumping → Fail/`LOAN_CAP`, and the key-check lines. "Same scorer, runnable by anyone, no exchange account." |
| 6 | 1:35–1:55 | Connect-key screen | Show the copy: "encrypted in this browser to a key that only exists inside the enclave." "The MM's key is sealed in the browser — we never see it." |
| 7 | 1:55–2:05 | Pattern slide | "AI may propose; deterministic code decides; the log can't be quietly edited. Trust no longer depends on size, or on handing over your book." |

## Lines to land
- "Most agentic-finance security is about safely letting an agent spend. Ours never spends — it only reads and attests. The fund-movement attack surface is gone."
- "Read-only keys only — funds can't move even if the enclave is compromised."
- "Deterministic guards sit between the agent and every signature — AI may propose, but code decides."
- "The contract only accepts verdicts from approved, attested code."
- "A missing verdict is itself recorded as a miss."

## Don'ts
- Don't claim live-exchange data where replay is used — the badge stays on.
- Don't show any key or secret on screen.
