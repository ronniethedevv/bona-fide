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

## Music

The composition mixes a bed from `public/music/bed.mp3` when that file exists
and simply omits it when it does not, so a clone with no music still renders.

The track is **not committed** — it is licensed third-party audio and this
repository is public. Drop your own there before `npm run render`.

Level is set from measurement rather than taste: the bed supplied for the
submission cut is -11.4 LUFS against a -24.0 LUFS voiceover, i.e. already
louder than the voice, so the composition attenuates it to `0.025` (about
-32 dB), putting it ~19 dB under the narration. If you swap the track, measure
it — `ffmpeg -i public/music/bed.mp3 -af ebur128 -f null -` — and adjust the
volume in `src/Demo.tsx` to keep roughly that gap, rather than reusing the
number.
