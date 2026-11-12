import { Series } from "remotion";
import {
  AttestScene,
  ClipScene,
  EndCard,
  Statement,
  TerminalScene,
  TitleCard,
} from "./components";
import { theme } from "./theme";

/** Scene lengths in frames at 30fps. Clip scenes never outrun their footage. */
export const SCENES = {
  title: 140,
  problem: 170,
  landing: 195,
  directory: 143,
  pass: 128,
  fail: 130,
  keycheck: 230,
  readonly: 170,
  terminal: 230,
  attest: 250,
  closing: 180,
  end: 150,
} as const;

export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);

export function Demo() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SCENES.title}>
        <TitleCard kicker="NEAR · Shade Agent · Intel TDX" title="Bona Fide" />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.problem}>
        <Statement
          lines={[
            "Token projects lend their treasury",
            "to market makers — and cannot prove",
            "the deal was kept.",
          ]}
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.landing}>
        <ClipScene
          name="landing"
          eyebrow="The proposition"
          caption="Score the deal inside sealed hardware. The order book never leaves."
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.directory}>
        <ClipScene
          name="directory"
          eyebrow="A public record"
          caption="Every market maker, every epoch scored, out in the open."
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.pass}>
        <ClipScene
          name="mandate-pass"
          eyebrow="An honest mandate"
          caption="Spread, depth, uptime, loan discipline — measured, signed, on-chain."
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.fail}>
        <ClipScene
          name="mandate-fail"
          eyebrow="A broken one"
          caption="This market maker dumped loaned tokens. LOAN_CAP. Permanent, append-only."
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.keycheck}>
        <ClipScene
          name="keycheck"
          eyebrow="Before the first read"
          caption="A key that can trade or withdraw is rejected on sight."
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.readonly}>
        <Statement
          lines={[
            "Most agentic finance guards an agent",
            "that can spend. This one never spends —",
            "so there is nothing to steal.",
          ]}
          accent={theme.text2}
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.terminal}>
        <TerminalScene />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.attest}>
        <AttestScene
          rows={[
            ["Hardware", "Intel TDX"],
            ["Runtime", "dstack 0.5.12 · Phala Cloud"],
            ["Contract", "bona-fide-tee1.testnet"],
            ["Code measurement", "7fe60787…1409173"],
            ["Agent", "ebc92895…20e592 · Valid"],
          ]}
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.closing}>
        <Statement
          lines={[
            "AI may propose.",
            "Deterministic code decides.",
            "The log cannot be quietly edited.",
          ]}
        />
      </Series.Sequence>

      <Series.Sequence durationInFrames={SCENES.end}>
        <EndCard url="bona-fide-mm.vercel.app" repo="github.com/ronniethedevv/bona-fide" />
      </Series.Sequence>
    </Series>
  );
}
