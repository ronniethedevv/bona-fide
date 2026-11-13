/**
 * Generates the voiceover clips from vo-script.json with ElevenLabs.
 *
 *   node scripts/generate-vo.mjs            # only clips that don't exist yet
 *   node scripts/generate-vo.mjs --force    # regenerate everything
 *   VOICE_ID=... node scripts/generate-vo.mjs
 *
 * The API key is injected into requests to api.elevenlabs.io by this
 * environment's proxy — it is never read, stored or printed here. Requests go
 * through curl rather than fetch: Node's fetch ignores HTTPS_PROXY, so the
 * injection (and the host allowance that comes with it) would be bypassed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "vo");
const API = "https://api.elevenlabs.io/v1";
const MODEL = process.env.VO_MODEL ?? "eleven_multilingual_v2";
const FORCE = process.argv.includes("--force");

/** Narrators that suit a serious technical piece, best first. */
const PREFERRED = ["george", "river", "matilda", "roger", "alice"];

function curl(args) {
  return execFileSync("curl", ["-sS", "--max-time", "120", ...args], { maxBuffer: 64 * 1024 * 1024 });
}

function pickVoice() {
  if (process.env.VOICE_ID) return { voice_id: process.env.VOICE_ID, name: "(from VOICE_ID)" };
  const voices = JSON.parse(curl([`${API}/voices`]).toString()).voices ?? [];
  if (voices.length === 0) throw new Error("the account has no voices available");
  for (const want of PREFERRED) {
    const hit = voices.find((v) => (v.name ?? "").toLowerCase().includes(want));
    if (hit) return hit;
  }
  return voices[0];
}

/**
 * Respellings applied to the TTS input only — never to vo-script.json, which
 * stays the real text for anyone reading along.
 *
 * "BonaFide" is read by the model as the Latin phrase it comes from, giving
 * "bona fee-day". The name is pronounced BOH-nuh-fyde, so the model is handed
 * a spelling that gets there.
 */
const PRONUNCIATION = [
  // Read as the Latin phrase the name comes from: "bona fee-day".
  [/\bBonaFide\b/g, "Bonafyde"],
  // Both uses in the script are the adjective (/laɪv/ — "live on testnet",
  // "the live agent"), which the model otherwise reads as the verb.
  [/\blive\b/g, "laiv"],
];

const forSpeech = (text) => PRONUNCIATION.reduce((t, [re, to]) => t.replace(re, to), text);

function speak(voiceId, text, dest) {
  const body = JSON.stringify({
    text: forSpeech(text),
    model_id: MODEL,
    // Steady and deliberate: this is narration over data, not performance.
    voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
  });
  const out = curl([
    "-X",
    "POST",
    "-H",
    "content-type: application/json",
    "-H",
    "accept: audio/mpeg",
    "--data-binary",
    body,
    "-w",
    "%{http_code}",
    "-o",
    dest,
    `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
  ])
    .toString()
    .trim();
  if (out !== "200") {
    const detail = existsSync(dest) ? readFileSync(dest, "utf8").slice(0, 300) : "";
    throw new Error(`HTTP ${out} ${detail}`);
  }
}

const script = JSON.parse(readFileSync(join(ROOT, "vo-script.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

const voice = pickVoice();
console.log(`voice: ${voice.name} (${voice.voice_id})\nmodel: ${MODEL}\n`);

let made = 0;
const only = process.argv.slice(2);
for (const [id, text] of Object.entries(script)) {
  if (only.length && !only.includes(id)) continue;
  const dest = join(OUT, `${id}.mp3`);
  if (!FORCE && existsSync(dest)) {
    console.log(`  = ${id}.mp3 (exists)`);
    continue;
  }
  try {
    speak(voice.voice_id, text, dest);
    made += 1;
    console.log(`  ✓ ${id}.mp3  ${text.length} chars`);
  } catch (e) {
    console.error(`  ! ${id}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n${made} clip(s) generated into public/vo`);
