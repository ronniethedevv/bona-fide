/**
 * Finds where each sentence starts inside every voiceover clip, so the picture
 * can be cued to the narration instead of drifting against it.
 *
 *   node scripts/analyze-vo.mjs
 *
 * Runs ffmpeg's silencedetect over public/vo/*.mp3 and writes src/cues.json:
 * for each clip, the start time (seconds, relative to the clip) of each spoken
 * run. Scenes with the same number of lines as cues will hang their lines off
 * these; everything else falls back to even spacing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VO = join(ROOT, "public", "vo");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
/** Quieter than this, for longer than this, counts as a gap between sentences. */
const NOISE_DB = process.env.VO_NOISE_DB ?? "-34dB";
const MIN_GAP = process.env.VO_MIN_GAP ?? "0.32";

if (!existsSync(VO)) {
  console.log("no public/vo directory yet — nothing to analyse");
  process.exit(0);
}

const files = readdirSync(VO).filter((f) => /\.(mp3|wav|m4a)$/i.test(f)).sort();
if (files.length === 0) {
  console.log("no voiceover clips in public/vo — scenes will use their planned lengths");
}

const cues = {};
for (const file of files) {
  let log = "";
  try {
    execFileSync(
      FFMPEG,
      ["-hide_banner", "-nostats", "-i", join(VO, file), "-af", `silencedetect=noise=${NOISE_DB}:d=${MIN_GAP}`, "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (e) {
    log = String(e.stderr ?? "");
  }
  // ffmpeg writes silencedetect results to stderr even on success
  if (!log) {
    try {
      log = execFileSync(
        "sh",
        ["-c", `${FFMPEG} -hide_banner -nostats -i '${join(VO, file)}' -af silencedetect=noise=${NOISE_DB}:d=${MIN_GAP} -f null - 2>&1`],
      ).toString();
    } catch (e) {
      log = String(e.stdout ?? "");
    }
  }

  const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  // Speech starts at 0 (unless the clip opens with silence) and after each gap.
  const opensQuiet = /silence_start:\s*0(\.0+)?\b/.test(log);
  const starts = opensQuiet ? ends : [0, ...ends];
  cues[file] = starts.map((s) => Number(s.toFixed(3)));
  console.log(`  ${file}: ${cues[file].length} sentence start(s)`);
}

writeFileSync(join(ROOT, "src", "cues.json"), JSON.stringify(cues, null, 2) + "\n");
console.log(`\nwrote src/cues.json for ${files.length} clip(s)`);
