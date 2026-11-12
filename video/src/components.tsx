import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import clips from "./clips.json";

/** Fade in, hold, fade out — the only transition this film uses. */
export function useFade(inFrames = 14, outFrames = 14): number {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return Math.min(
    interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
}

/** Ruled-ledger ground, the same motif the product uses. */
export function Ledger({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(to bottom, ${theme.border} 1px, transparent 1px)`,
          backgroundSize: "100% 64px",
          opacity: 0.5,
          maskImage: "linear-gradient(to bottom, transparent, #000 20%, #000 80%, transparent)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: theme.mono,
        fontSize: 22,
        letterSpacing: "0.26em",
        textTransform: "uppercase",
        color: theme.muted,
      }}
    >
      {children}
    </div>
  );
}

export function TitleCard({ title, kicker }: { title: string; kicker: string }) {
  const frame = useCurrentFrame();
  const opacity = useFade(18, 16);
  const rise = interpolate(frame, [0, 28], [26, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rule = interpolate(frame, [14, 46], [0, 560], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Ledger>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          paddingLeft: 150,
          opacity,
          transform: `translateY(${rise}px)`,
        }}
      >
        <Eyebrow>{kicker}</Eyebrow>
        <div
          style={{
            fontFamily: theme.serif,
            fontSize: 132,
            lineHeight: 1.02,
            color: theme.text,
            marginTop: 28,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div style={{ height: 1, width: rule, background: theme.border, marginTop: 44 }} />
      </AbsoluteFill>
    </Ledger>
  );
}

/** A single sentence, given the room to be read. */
export function Statement({ lines, accent }: { lines: string[]; accent?: string }) {
  const frame = useCurrentFrame();
  const opacity = useFade();
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 150px", opacity }}>
        {lines.map((line, i) => {
          const start = i * 10;
          const o = interpolate(frame, [start, start + 22], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(frame, [start, start + 22], [18, 0], {
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: theme.serif,
                fontSize: 76,
                lineHeight: 1.22,
                color: i === lines.length - 1 && accent ? accent : theme.text,
                opacity: o,
                transform: `translateY(${y}px)`,
              }}
            >
              {line}
            </div>
          );
        })}
      </AbsoluteFill>
    </Ledger>
  );
}

/** Real product footage, with a caption that says what you are looking at. */
export function ClipScene({
  name,
  eyebrow,
  caption,
}: {
  name: string;
  eyebrow: string;
  caption: string;
}) {
  const frame = useCurrentFrame();
  const opacity = useFade(12, 12);
  const available = (clips.available as string[]).includes(name);
  const scale = interpolate(frame, [0, 240], [1, 1.035], { extrapolateRight: "clamp" });
  const capOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity }}>
      {available ? (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <OffthreadVideo src={staticFile(`clips/${name}.mp4`)} muted />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            fontFamily: theme.mono,
            fontSize: 28,
            color: theme.muted,
          }}
        >
          {`clips/${name}.mp4 — run \`npm run capture\``}
        </AbsoluteFill>
      )}

      {/* scrim so the caption always reads, whatever is behind it */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to top, rgba(11,12,12,0.96) 0%, rgba(11,12,12,0.72) 18%, transparent 42%)",
        }}
      />
      <AbsoluteFill
        style={{ justifyContent: "flex-end", padding: "0 110px 86px", opacity: capOpacity }}
      >
        <Eyebrow>{eyebrow}</Eyebrow>
        <div
          style={{
            fontFamily: theme.serif,
            fontSize: 62,
            lineHeight: 1.2,
            color: theme.text,
            marginTop: 18,
            maxWidth: 1400,
          }}
        >
          {caption}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** The offline check, typed out. */
export function TerminalScene() {
  const frame = useCurrentFrame();
  const opacity = useFade();
  const cmd = "npm run demo:replay";
  const typed = cmd.slice(0, Math.max(0, Math.floor(interpolate(frame, [12, 54], [0, cmd.length], { extrapolateRight: "clamp" }))));
  const out: Array<[string, string]> = [
    ["honest-mm     epoch 0: ", "Pass"],
    ["honest-mm     epoch 1: ", "Pass"],
    ["dumping-mm    epoch 0: ", "Fail (LOAN_CAP)"],
  ];
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 150px", opacity }}>
        <Eyebrow>Anyone can re-run the scorer</Eyebrow>
        <div
          style={{
            marginTop: 30,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            overflow: "hidden",
            maxWidth: 1360,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "18px 28px",
              borderBottom: `1px solid ${theme.border}`,
              background: theme.panel2,
              fontFamily: theme.mono,
              fontSize: 18,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: theme.muted,
            }}
          >
            <span>Offline check</span>
            <span>no wallet · no network</span>
          </div>
          <div style={{ padding: "32px 28px", fontFamily: theme.mono, fontSize: 30, lineHeight: 2 }}>
            <div style={{ color: theme.text }}>
              <span style={{ color: theme.muted }}>$ </span>
              {typed}
              {frame < 60 && frame % 20 < 10 ? "▌" : ""}
            </div>
            <div style={{ height: 24 }} />
            {out.map(([label, verdict], i) => {
              const at = 78 + i * 22;
              const o = interpolate(frame, [at, at + 14], [0, 1], { extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ opacity: o, color: theme.muted }}>
                  {label}
                  <span style={{ color: verdict.startsWith("Pass") ? theme.pass : theme.fail }}>
                    {verdict}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </Ledger>
  );
}

/** The attestation, revealed row by row, as the record it is. */
export function AttestScene({ rows }: { rows: Array<[string, string]> }) {
  const frame = useCurrentFrame();
  const opacity = useFade();
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 150px", opacity }}>
        <Eyebrow>Verified by the hardware, not by us</Eyebrow>
        <div
          style={{
            fontFamily: theme.serif,
            fontSize: 64,
            color: theme.text,
            margin: "22px 0 38px",
          }}
        >
          The contract takes verdicts from attested code only.
        </div>
        <div
          style={{
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            overflow: "hidden",
            maxWidth: 1400,
          }}
        >
          {rows.map(([label, value], i) => {
            const at = 18 + i * 14;
            const o = interpolate(frame, [at, at + 16], [0, 1], { extrapolateRight: "clamp" });
            const x = interpolate(frame, [at, at + 16], [-14, 0], {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 40,
                  padding: "22px 32px",
                  borderBottom: i === rows.length - 1 ? "none" : `1px solid ${theme.border}`,
                  opacity: o,
                  transform: `translateX(${x}px)`,
                }}
              >
                <span
                  style={{
                    fontFamily: theme.mono,
                    fontSize: 19,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: theme.muted,
                  }}
                >
                  {label}
                </span>
                <span style={{ fontFamily: theme.mono, fontSize: 26, color: theme.text }}>
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Ledger>
  );
}

export function EndCard({ url, repo }: { url: string; repo: string }) {
  const opacity = useFade(16, 20);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [8, 40], [0, 700], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <div style={{ fontFamily: theme.serif, fontSize: 118, color: theme.text }}>Bona Fide</div>
        <div style={{ height: 1, width: rule, background: theme.border, margin: "34px 0" }} />
        <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.text2, letterSpacing: "0.04em" }}>
          {url}
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.muted, marginTop: 16 }}>
          {repo}
        </div>
        <div
          style={{
            fontFamily: theme.mono,
            fontSize: 18,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: theme.muted,
            marginTop: 54,
          }}
        >
          Built at NEAR Hackathon · NEAR testnet
        </div>
      </AbsoluteFill>
    </Ledger>
  );
}
