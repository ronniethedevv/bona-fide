/**
 * Records the real app, scripted, into clips the Remotion video composites.
 *
 * No mockups: every frame of product footage in the demo comes from this
 * script driving the deployed (or locally previewed) web app.
 *
 *   BASE_URL=http://127.0.0.1:4173 node scripts/capture-clips.mjs
 *   node scripts/capture-clips.mjs            # defaults to the hosted app
 *
 * Frames come from the Chrome DevTools screencast (real motion, including
 * smooth scrolling) and are assembled by ffmpeg against their own timestamps,
 * so a still moment stays still instead of being compressed away.
 *
 * Writes public/clips/*.mp4 and rewrites src/clips.json so the composition
 * knows which clips exist (a missing clip renders as a labelled placeholder
 * rather than failing the render).
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "clips");
const BASE = process.env.BASE_URL ?? "https://bona-fide-mm.vercel.app";
const SIZE = { width: 1440, height: 810 }; // 16:9, scaled up in the composition so UI text reads large
/** This container ships Chromium at a fixed path; override elsewhere. */
const EXECUTABLE = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

/**
 * Hold on the current state for real time.
 *
 * The screencast only emits a frame when something repaints, so a still hold
 * would otherwise vanish from the timeline entirely. Nudge an imperceptible
 * repaint a few times a second so the dwell is actually recorded.
 */
const settle = async (page, ms = 1200) => {
  const STEP = 400;
  for (let waited = 0; waited < ms; waited += STEP) {
    await page.waitForTimeout(Math.min(STEP, ms - waited));
    await page
      .evaluate(() => {
        document.body.style.opacity = document.body.style.opacity === "0.999" ? "1" : "0.999";
      })
      .catch(() => {});
  }
};

/** Smooth-scroll so the footage reads as a human browsing, not a jump cut. */
async function glide(page, to, ms = 1400) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), to);
  await page.waitForTimeout(ms);
}

const CLIPS = [
  {
    // Long enough to carry the narration, and paced like someone reading.
    name: "landing",
    run: async (page) => {
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await settle(page, 2600);
      await glide(page, 520, 2400);
      await glide(page, 1180, 2400);
      await glide(page, 1900, 2400);
      await settle(page, 1600);
    },
  },
  {
    name: "directory",
    run: async (page) => {
      await page.goto(BASE + "/directory", { waitUntil: "networkidle" });
      await settle(page, 2800);
      const row = page.locator("table.table tbody tr").first();
      if (await row.count()) {
        await row.hover();
        await settle(page, 2200);
      }
      const search = page.locator("input.search");
      if (await search.count()) {
        await search.click();
        await search.type("experiment", { delay: 110 });
        await settle(page, 2400);
      }
    },
  },
  {
    name: "mandate-pass",
    run: async (page) => {
      await page.goto(BASE + "/mandate/0", { waitUntil: "networkidle" });
      await settle(page, 2800);
      const cells = page.locator(".timeline .cell");
      const n = await cells.count();
      if (n > 0) {
        await cells.nth(0).click();
        await settle(page, 3600);
      }
      if (n > 1) {
        await cells.nth(1).click();
        await settle(page, 3600);
      }
      await settle(page, 1400);
    },
  },
  {
    name: "mandate-fail",
    run: async (page) => {
      await page.goto(BASE + "/mandate/1", { waitUntil: "networkidle" });
      await settle(page, 3000);
      const cells = page.locator(".timeline .cell");
      if (await cells.count()) {
        await cells.first().click();
        // Hold on LOAN_CAP: this is the shot the whole film is built around.
        await settle(page, 6500);
      }
      await settle(page, 1600);
    },
  },
  {
    name: "keycheck",
    run: async (page) => {
      await page.goto(BASE + "/key-check", { waitUntil: "networkidle" });
      await settle(page, 2400);
      const run = page.getByRole("button", { name: /run the check/i });
      await run.click(); // defaults to a trade-enabled key -> rejected
      await settle(page, 3600);
      const select = page.locator("select");
      const options = await select.locator("option").allTextContents();
      const readOnly = options.findIndex((t) => /read.?only/i.test(t));
      await select.selectOption({ index: readOnly >= 0 ? readOnly : 0 });
      await settle(page, 1600);
      await run.click();
      await settle(page, 3400);
    },
  },
];

/** Record one scripted flow to an mp4, preserving real-time pacing. */
async function record(browser, clip) {
  const work = join(OUT, `.tmp-${clip.name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const ctx = await browser.newContext({ viewport: SIZE, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {
      /* session closed mid-flight */
    }
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: SIZE.width,
    maxHeight: SIZE.height,
    everyNthFrame: 1,
  });

  try {
    await clip.run(page);
  } catch (e) {
    console.error(`  ! ${clip.name}: ${e instanceof Error ? e.message : e}`);
  }

  await cdp.send("Page.stopScreencast").catch(() => {});
  await page.waitForTimeout(250);
  await ctx.close();

  if (frames.length < 2) {
    rmSync(work, { recursive: true, force: true });
    return null;
  }

  // Write the frames, then a concat list whose durations are the real gaps.
  const lines = [];
  frames.forEach((f, i) => {
    const file = join(work, `f${String(i).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    const next = frames[i + 1];
    // The screencast only emits on change, so a still moment arrives as one
    // frame with a long gap after it. Keep that gap: it IS the dwell time.
    const dur = next ? Math.min(Math.max(next.ts - f.ts, 1 / 60), 8) : 0.8;
    lines.push(`file '${file}'`, `duration ${dur.toFixed(4)}`);
  });
  lines.push(`file '${join(work, `f${String(frames.length - 1).padStart(6, "0")}.jpg`)}'`);
  const listFile = join(work, "frames.txt");
  writeFileSync(listFile, lines.join("\n") + "\n");

  const dest = join(OUT, `${clip.name}.mp4`);
  execFileSync(
    FFMPEG,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-r", "30",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p",
      dest,
    ],
    { stdio: "inherit" },
  );
  rmSync(work, { recursive: true, force: true });
  const seconds = Number(
    execFileSync(FFPROBE, [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest,
    ]).toString().trim(),
  );
  console.log(`  ✓ clips/${clip.name}.mp4  (${frames.length} frames, ${seconds.toFixed(2)}s)`);
  return seconds;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const made = [];
  const durations = {};

  for (const clip of CLIPS) {
    const seconds = await record(browser, clip);
    if (seconds !== null) {
      made.push(clip.name);
      durations[clip.name] = seconds;
    }
  }

  await browser.close();
  writeFileSync(
    join(ROOT, "src", "clips.json"),
    JSON.stringify({ source: BASE, capturedAt: new Date().toISOString(), available: made, durations }, null, 2) + "\n",
  );
  console.log(`\n${made.length}/${CLIPS.length} clips captured from ${BASE}`);
}

main().catch((e) => {
  console.error("capture failed:", e);
  process.exit(1);
});
