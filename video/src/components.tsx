import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { theme } from "./theme";

/**
 * Fade in, hold, fade out. Takes the scene's own length — deriving it from the
 * composition would mean a scene only ever faded out at the end of the film.
 */
function useFade(dur: number, inF = 12, outF = 14): number {
  const frame = useCurrentFrame();
  return Math.min(
    interpolate(frame, [0, inF], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [dur - outF, dur], [1, 0], { extrapolateLeft: "clamp" }),
  );
}

export interface SceneProps {
  dur: number;
  /** Frame the narration starts on; visual beats hang off this. */
  voStart: number;
  /** Sentence starts in frames, measured from the narration itself. */
  cues?: number[];
}

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

export function TitleCard({ dur, voStart, title, kicker }: SceneProps & { title: string; kicker: string }) {
  const frame = useCurrentFrame();
  const opacity = useFade(dur, 16, 16);
  const rise = interpolate(frame, [0, 28], [26, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rule = interpolate(frame, [voStart, voStart + 32], [0, 560], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Ledger>
      <AbsoluteFill
        style={{ justifyContent: "center", paddingLeft: 150, opacity, transform: `translateY(${rise}px)` }}
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

/**
 * A sentence, revealed line by line across the scene it was given — so the
 * lines land with the narration however long that narration turns out to be.
 */
export function Statement({
  dur,
  voStart,
  cues,
  lines,
  accent,
}: SceneProps & { lines: string[]; accent?: string }) {
  const frame = useCurrentFrame();
  const opacity = useFade(dur);
  const span = Math.max(dur - voStart - 24, lines.length * 10);
  const step = span / (lines.length + 1);
  // When the narration has as many sentences as this scene has lines, each
  // line lands on its own sentence instead of on a guessed rhythm.
  const synced = cues !== undefined && cues.length === lines.length;
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 150px", opacity }}>
        {lines.map((line, i) => {
          const start = synced ? (cues as number[])[i] : voStart + i * step;
          const o = interpolate(frame, [start, start + 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const y = interpolate(frame, [start, start + 20], [18, 0], {
            extrapolateLeft: "clamp",
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

export function ClipScene({
  dur,
  voStart,
  clip,
  eyebrow,
  caption,
}: SceneProps & { clip?: string; eyebrow: string; caption: string }) {
  const frame = useCurrentFrame();
  const opacity = useFade(dur, 10, 12);
  const scale = interpolate(frame, [0, dur], [1, 1.03], { extrapolateRight: "clamp" });
  const cap = interpolate(frame, [voStart, voStart + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity }}>
      {clip ? (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} muted />
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
          missing footage — run `npm run capture`
        </AbsoluteFill>
      )}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(11,12,12,0.96) 0%, rgba(11,12,12,0.74) 18%, transparent 44%)",
        }}
      />
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 110px 86px", opacity: cap }}>
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

export function TerminalScene({ dur, voStart }: SceneProps) {
  const frame = useCurrentFrame();
  const opacity = useFade(dur);
  const cmd = "npm run demo:replay";
  const typeEnd = voStart + Math.min(42, dur * 0.3);
  const typed = cmd.slice(
    0,
    Math.max(
      0,
      Math.floor(
        interpolate(frame, [voStart, typeEnd], [0, cmd.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    ),
  );
  const out: Array<[string, string]> = [
    ["honest-mm     epoch 0: ", "Pass"],
    ["honest-mm     epoch 1: ", "Pass"],
    ["dumping-mm    epoch 0: ", "Fail (LOAN_CAP)"],
  ];
  const outStart = typeEnd + 12;
  const outStep = Math.max(10, (dur - outStart - 20) / out.length);

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
              {frame < typeEnd && frame % 20 < 10 ? "▌" : ""}
            </div>
            <div style={{ height: 24 }} />
            {out.map(([label, verdict], i) => {
              const at = outStart + i * outStep;
              const o = interpolate(frame, [at, at + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
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

export function AttestScene({ dur, voStart, rows }: SceneProps & { rows: Array<[string, string]> }) {
  const frame = useCurrentFrame();
  const opacity = useFade(dur);
  const step = Math.max(9, (dur - voStart - 40) / rows.length);
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 150px", opacity }}>
        <Eyebrow>Verified by the hardware, not by us</Eyebrow>
        <div style={{ fontFamily: theme.serif, fontSize: 64, color: theme.text, margin: "22px 0 38px" }}>
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
            const at = voStart + i * step;
            const o = interpolate(frame, [at, at + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const x = interpolate(frame, [at, at + 14], [-14, 0], {
              extrapolateLeft: "clamp",
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
                <span style={{ fontFamily: theme.mono, fontSize: 26, color: theme.text }}>{value}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Ledger>
  );
}

export function EndCard({ dur, voStart, url, repo }: SceneProps & { url: string; repo: string }) {
  const opacity = useFade(dur, 16, 20);
  const frame = useCurrentFrame();
  const rule = interpolate(frame, [voStart, voStart + 34], [0, 700], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <Ledger>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity }}>
        <div style={{ fontFamily: theme.serif, fontSize: 118, color: theme.text }}>BonaFide</div>
        <div style={{ height: 1, width: rule, background: theme.border, margin: "34px 0" }} />
        <div style={{ fontFamily: theme.mono, fontSize: 28, color: theme.text2, letterSpacing: "0.04em" }}>
          {url}
        </div>
        <div style={{ fontFamily: theme.mono, fontSize: 22, color: theme.muted, marginTop: 16 }}>{repo}</div>
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
