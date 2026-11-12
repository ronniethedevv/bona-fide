# Voiceover

One clip per scene. The film re-times itself around whatever you record — you
do **not** need to hit the target lengths, they are only a guide for pacing.

1. Record or generate twelve clips.
2. Save them in `video/public/vo/` with exactly these filenames.
3. `npm run analyze` — finds each sentence's start so the picture cues to it.
4. `npm run render`.

The text below is paste-ready: read it exactly as written. Nothing in brackets,
no stage directions — anything written here gets spoken.

| File | Target | Script |
|---|---|---|
| `vo-01-title.mp3` | ~4s | Bona Fide. Proof that a market maker kept its word. |
| `vo-02-problem.mp3` | ~7s | Token projects lend their treasury to market makers, and then they hope. Proving the deal was kept usually means handing over your order book. |
| `vo-03-landing.mp3` | ~6s | Bona Fide scores the deal inside sealed hardware. The book never leaves the enclave. Only the verdict does. |
| `vo-04-directory.mp3` | ~5s | Every market maker, every epoch scored, in public. |
| `vo-05-pass.mp3` | ~7s | This is an honest mandate. Spread, depth, uptime and loan discipline, measured every epoch and signed on chain. |
| `vo-06-fail.mp3` | ~7s | And this one broke. The market maker dumped loaned tokens, so the epoch fails on loan cap. The record is permanent, and append only. |
| `vo-07-keycheck.mp3` | ~8s | Before the first read, the enclave asks the exchange what the key is allowed to do. A key that can trade or withdraw is rejected on sight. |
| `vo-08-readonly.mp3` | ~7s | Most agentic finance is about safely letting an agent spend. This one never spends. The fund movement attack surface is gone, not guarded. |
| `vo-09-terminal.mp3` | ~8s | You do not have to take our word for any of it. Clone the repository and run the scorer yourself. Same code, same verdicts, no wallet and no exchange account. |
| `vo-10-attest.mp3` | ~9s | The live agent runs inside Intel TDX on Phala Cloud. The contract verifies the hardware quote, and accepts verdicts only from code whose measurements are approved on chain. |
| `vo-11-closing.mp3` | ~6s | AI may propose. Deterministic code decides. And the log cannot be quietly edited. |
| `vo-12-end.mp3` | ~5s | Bona Fide. Built at the NEAR hackathon, and live on testnet. |

## Recording notes

- Pause clearly between sentences — about half a second. `analyze` detects those
  gaps and uses them to land each on-screen line on its own sentence.
- Record somewhere quiet and close to the mic; the detector keys off silence.
- Any of mp3, wav or m4a works.
- A missing clip is not an error: that scene simply keeps its planned length.

## Music

Optional. Drop a bed at `video/public/music/bed.mp3` and it plays under the whole
film at 12%, fading in and out at the ends. Use something you have the right to
use — the submission is public.
