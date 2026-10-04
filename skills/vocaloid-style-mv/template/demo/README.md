# demo — 「蛍火」 (HOTARUBI), the procedural smoke-test film

Everything needed to prove that a fresh install renders end to end, without a real song and without generated art.

| file | what |
|---|---|
| `make_demo_song.py` | synthesizes `audio/song.wav`: 24 s, 128 BPM, 48 kHz stereo (numpy + soundfile, deterministic) |
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
node tools/render_final.mjs --name demo
```

When you start your own film, delete `analysis/sections.json` and `analysis/lyrics_mv.lrc` from the demo run (or
scaffold a fresh project with `--song` / `--lyrics`) so the demo data does not leak into the new analysis.

The demo song and lyrics are original work for this kit and free to use. Author: **NikusonP** (MIT).
