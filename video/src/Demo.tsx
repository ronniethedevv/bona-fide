import { Audio, interpolate, Sequence, Series, staticFile } from "remotion";
import {
  AttestScene,
  ClipScene,
  EndCard,
  Statement,
  TerminalScene,
  TitleCard,
  type SceneProps,
} from "./components";
import type { SceneId } from "./scenes";
import type { DemoProps } from "./timing";
import { theme } from "./theme";

/** What each scene says. Lengths live in timing.ts; content lives here. */
const CONTENT: Record<SceneId, (p: SceneProps & { clip?: string }) => React.ReactNode> = {
  title: (p) => <TitleCard {...p} kicker="NEAR · Shade Agent · Intel TDX" title="Bona Fide" />,
  problem: (p) => (
    <Statement {...p} lines={["Token projects lend their treasury", "to market makers — and cannot prove", "the deal was kept."]} />
  ),
  landing: (p) => (
    <ClipScene {...p} eyebrow="The proposition" caption="Score the deal inside sealed hardware. The order book never leaves." />
  ),
  directory: (p) => (
    <ClipScene {...p} eyebrow="A public record" caption="Every market maker, every epoch scored, out in the open." />
  ),
  pass: (p) => (
    <ClipScene {...p} eyebrow="An honest mandate" caption="Spread, depth, uptime, loan discipline — measured, signed, on-chain." />
  ),
  fail: (p) => (
    <ClipScene {...p} eyebrow="A broken one" caption="This market maker dumped loaned tokens. LOAN_CAP. Permanent, append-only." />
  ),
  keycheck: (p) => (
    <ClipScene {...p} eyebrow="Before the first read" caption="A key that can trade or withdraw is rejected on sight." />
  ),
  readonly: (p) => (
    <Statement
      {...p}
      accent={theme.text2}
      lines={["Most agentic finance guards an agent", "that can spend. This one never spends —", "so there is nothing to steal."]}
    />
  ),
  terminal: (p) => <TerminalScene {...p} />,
  attest: (p) => (
    <AttestScene
      {...p}
      rows={[
        ["Hardware", "Intel TDX"],
        ["Runtime", "dstack 0.5.12 · Phala Cloud"],
        ["Contract", "bona-fide-tee1.testnet"],
        ["Code measurement", "7fe60787…1409173"],
        ["Agent", "ebc92895…20e592 · Valid"],
      ]}
    />
  ),
  closing: (p) => (
    <Statement {...p} lines={["AI may propose.", "Deterministic code decides.", "The log cannot be quietly edited."]} />
  ),
  end: (p) => <EndCard {...p} url="bona-fide-mm.vercel.app" repo="github.com/ronniethedevv/bona-fide" />,
};

export function Demo({ scenes, music }: DemoProps) {
  const total = scenes.reduce((a, s) => a + s.durationInFrames, 0);
  return (
    <>
      {music ? (
        <Audio
          src={staticFile(music)}
          loop
          // Sits under the narration, and gets out of the way at both ends.
          volume={(f) =>
            interpolate(f, [0, 45, total - 60, total], [0, 0.12, 0.12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          }
        />
      ) : null}

      <Series>
        {scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
            {s.vo ? (
              <Sequence from={s.voStartFrame}>
                <Audio src={staticFile(s.vo)} />
              </Sequence>
            ) : null}
            {CONTENT[s.id]({ dur: s.durationInFrames, voStart: s.voStartFrame, cues: s.cues, clip: s.clip })}
          </Series.Sequence>
        ))}
      </Series>
    </>
  );
}
