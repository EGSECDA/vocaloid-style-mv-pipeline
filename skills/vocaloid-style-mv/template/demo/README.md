# demo — 「蛍火」 (HOTARUBI), the procedural smoke-test film

Everything needed to prove that a fresh install renders end to end, without a real song and without generated art.

| file | what |
|---|---|
| `make_demo_song.py` | synthesizes `audio/song.wav`: 24 s, 128 BPM, 48 kHz stereo (numpy + soundfile, deterministic); never replaces a different `audio/song.wav` (your song) unless `--force` |
| `lyrics_demo.lrc` | eight original Japanese lines about light and night, timed to the song's lead phrases, with JIZURA markup |
| `sections_demo.json` | curated section table (intro / verse / pre-chorus / chorus / post-chorus) → copy to `analysis/sections.json` |

The song: bar 0 is near silence (pad swell, one bell); bars 1–4 verse; bars 5–6 pre-chorus with a riser, a snare
roll and a half-beat stop; bars 7–10 chorus (full drums, side-chained pad, high lead); bar 11 post-chorus; a dead
stop at 22.5 s. `tools/analyze_audio.py` finds 128.1 BPM, 12 bars (numbered 1–12 in `audio.json`, the pre-chorus
stop at 12.83 s and the final cut at 22.51 s).

The film is the default `engine/timeline.js` (its header lists the eleven shots). It uses only procedural scenes
(`typeCard`, `illust` with gradients and custom fx, `converge`, `kanjiSlam` without character art, `afterimage`)
plus the JIZURA lyric layer, so it also shows how the pieces of a real timeline fit together.

```bash
python demo/make_demo_song.py
cp demo/lyrics_demo.lrc analysis/lyrics_mv.lrc
cp demo/sections_demo.json analysis/sections.json
python tools/analyze_audio.py
node tools/stills.mjs --times 1,3.5,8.4,10,12.5,13.6,18.4,19.5,21.2,23.3 --sheet smoke
node tools/render_final.mjs --name demo
```

Run these steps in a throwaway project scaffolded **without** `--song` (`python <skill>/scripts/new_project.py
_smoke --setup`), never in your film's project: they write `audio/song.wav`, `analysis/lyrics_mv.lrc` and
`analysis/sections.json`. Scaffold the film separately with `--song` / `--lyrics`; it can reuse the smoke project's
fonts (`--setup-args "-FontsFrom ../_smoke/engine/fonts"`, bash `"--fonts-from ../_smoke/engine/fonts"`).

The demo song and lyrics are original work for this kit and free to use. Author: **NikusonP** (MIT).
