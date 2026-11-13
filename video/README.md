# Demo video

A [Remotion](https://remotion.dev) composition: titles and captions over **real,
scripted footage of the deployed app** — no mockups, no screen-recording by hand.

```bash
npm install
npm run capture   # drives the live app and records clips -> public/clips/*.mp4
npm run vo        # generates narration from vo-script.json (ElevenLabs)
npm run analyze   # finds each sentence start -> src/cues.json
npm run render    # composites -> out/bona-fide-demo.mp4
npm run master    # loudness-normalises -> out/bona-fide-demo-master.mp4
npm run studio    # edit interactively
```

The narration drives the edit: `calculateMetadata` measures each clip in
`public/vo` and resizes its scene to fit (lead-in + speech + tail), so the
voiceover is never cut to fit the picture. Recorded narration can replace the
generated clips at the same filenames — nothing else changes.

`capture` points at <https://bona-fide-mm.vercel.app> by default; set `BASE_URL`
to record a local preview instead. It uses this container's Chromium
(`CHROMIUM_PATH`) and the system `ffmpeg` (`FFMPEG_PATH`), takes frames from the
Chrome DevTools screencast, and assembles them against their own timestamps so a
still moment stays still rather than being compressed away.

Clips and renders are gitignored; `src/clips.json` records which clips the last
capture produced, and a missing clip renders as a labelled placeholder rather
than failing the build.

Fonts (Newsreader, IBM Plex Sans/Mono) are bundled from npm, so rendering needs
no network access and is deterministic.
