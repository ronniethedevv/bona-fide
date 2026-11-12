# Demo video

A [Remotion](https://remotion.dev) composition: titles and captions over **real,
scripted footage of the deployed app** — no mockups, no screen-recording by hand.

```bash
npm install
npm run capture   # drives the live app and records clips -> public/clips/*.mp4
npm run render    # composites -> out/bona-fide-demo.mp4
npm run studio    # edit interactively
```

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
