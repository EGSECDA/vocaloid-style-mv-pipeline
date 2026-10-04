# tegaki-mv project

A Vocaloid-style 手書き (tegaki) lyric MV project made from the **vocaloid-style-mv-pipeline** template (author: **NikusonP**,
MIT licence). Every frame is drawn by a deterministic front-end engine (Canvas2D scenes + a transparent lyric layer +
a foreground layer + a WebGL2 post pass), rendered headless by Playwright and encoded by ffmpeg. The film is code:
`engine/timeline.js` is the edit, and re-rendering always gives the same frames.

> `scripts/new_project.py` copies the template's `PROJECT_README.md` to the new project as `README.md` (this file).
> The method (concept, assets, storyboard, review) lives in the skill: `SKILL.md` and `references/*.md`.

## 1. Setup (once per project; safe to re-run)

| OS | command (from this folder) |
|---|---|
| Windows | `powershell -ExecutionPolicy Bypass -File setup.ps1` |
| macOS / Linux / Git Bash | `./setup.sh` (or `bash setup.sh`) |
| any (Node) | `npm run setup` |

Setup installs Playwright (`npm install`), the Python packages (`requirements.txt`), downloads the fonts into
`engine/fonts/` (~260 MB, Google Fonts, OFL), clones [JIZURA 字面](https://github.com/852wa/JIZURA) into
`vendor/JIZURA` and builds `jizura/app/jizura_engine.js`, then runs the environment check. Options:

| PowerShell | bash | what |
|---|---|---|
| `-Lyrics` | `--lyrics` | also install the lyric-transcription packages (faster-whisper, onnxruntime, …) |
| `-FontsFrom DIR` | `--fonts-from DIR` | copy the fonts from another project's `engine/fonts` instead of downloading |
| `-SkipPip` `-SkipFonts` `-SkipCheck` `-NoWebGL` | `--skip-pip` `--skip-fonts` `--skip-check` `--no-webgl` | skip a step |

Check the machine any time: `python tools/check_env.py --webgl` (REQUIRED vs OPTIONAL, project state, and the WebGL
renderer of the render browser — it must name your GPU, not SwiftShader / WARP / llvmpipe).
On macOS / Linux use `python3` wherever this file says `python`.

## 2. Smoke test: the demo film (no song, no art needed)

```bash
python demo/make_demo_song.py                    # synthesizes audio/song.wav (24 s, 128 BPM, original)
cp demo/lyrics_demo.lrc analysis/lyrics_mv.lrc   # Windows: copy demo\lyrics_demo.lrc analysis\lyrics_mv.lrc
cp demo/sections_demo.json analysis/sections.json   # optional: curated section labels for the demo
python tools/analyze_audio.py                    # -> analysis/audio.json, envelope_30fps.json, overview.png
node tools/stills.mjs --times 1,3.5,8.4,10,12.5,13.6,18.4,19.5,21.2,23.3 --sheet smoke   # -> render/stills/smoke.jpg
node tools/render_final.mjs --name demo          # -> render/demo.mp4 (about 30 s on an RTX 3080)
node tools/render_final.mjs --name demo_vertical --url engine/vertical.html --selector canvas#vout --width 1080 --height 1920
python tools/review_sheets.py render/demo.mp4 --step 1 --out render/review
```

The default `engine/timeline.js` is that demo: 「蛍火」 (HOTARUBI), eleven shots built only from procedural scenes
and the JIZURA lyric layer. Look at `render/stills/smoke.jpg`: a night sky with a firefly light igniting, star
trails, a vortex, kanji slams, fireflies forming 蛍, a dawn and a violet end card mean the machine renders correctly
(the kit's `docs/images/demo_sheet.jpg` is the reference). See `demo/README.md`.

## 3. Making the MV for your song

Put the song at `audio/song.wav` (scaffold with `--song` does this) and work through the phases of the skill
(`SKILL.md`; details and acceptance criteria in `references/01-workflow.md`):

| phase | what you produce | main commands / files |
|---|---|---|
| Listen | beat grid, bars, sections, stops, impacts | `python tools/analyze_audio.py`; look at `analysis/overview.png`; curate `analysis/sections_auto.json` → `analysis/sections.json`, re-run |
| Lyrics | `analysis/lyrics_mv.lrc` (official text, sung-onset times, JIZURA markup `/` `*…*` `!` `[間奏]`) | `references/03-audio-and-lyrics.md`; transcription / alignment only for timings: `tools/transcribe_*.py` (setup `-Lyrics`) |
| Concept | `docs/CONCEPT.md` | `references/02-creative-direction.md` |
| Assets | `assets/char/*.png` (RGBA), `assets/bg/*.png` | `python tools/imagegen.py <jobs.jsonl> --out-dir assets/char` (Codex CLI), `tools/alpha_matte.py`; `references/04-asset-generation.md` |
| Storyboard → edit | `docs/STORYBOARD.md`, `engine/timeline.js` | `references/05-engine.md` (scenes, args, post, transitions) |
| Build | new scenes in `engine/scenes/*.js`, JIZURA plans + curation, optional Blender shots | `references/06-jizura.md`, `references/07-blender-3d.md` (`python tools/blender_run.py blender/shots/<shot>.py`) |
| Review | stills → contact sheets → full render → review sheets, 2–3 passes | `node tools/stills.mjs`, `python tools/review_sheets.py`, `node tools/jz_cuts_at.mjs <times>`; `references/09-qa-and-lessons.md` |
| Deliver | 16:9 master, share encode, 9:16 vertical | `node tools/render_final.mjs --name mv`; `references/08-render-and-delivery.md` |

### Editing `engine/timeline.js`

Keep the structure of the demo timeline and replace its shots:

- `Z.TITLE`, `Z.TITLE_SUB`, `Z.CREDIT` at the top: the title and the exact credit line (ask the artist), used by the
  HUD, the end card and the vertical header / footer.
- Inside `Z.setup(audio)`: `B(n)` = start of bar *n* (the bar numbers of `audio.json` / `sections.json`), `nb(t)` =
  nearest beat. Cut on bar starts at section changes and on `nb(lyric onset)` inside sections; never compute
  times from the BPM.
- `shot(id, t0, t1, scene, args, { lyric, plan, post, trans, text, hud })` — one call per shot, ids `s01…` in film order.
- JIZURA plans (`main`, `cf` centre-free, `noir`, `mono`) and the curation deny-lists: change them per film and
  re-check the stills (any change re-rolls the cuts). Find a bad lyric frame with `node tools/jz_cuts_at.mjs 12.5 main`.
- `Z.LOOK_DEFAULT` / `Z.LOOKS` (per section label), `Z.globalFX` (flashes, kick shake), `Z.hud`.
- `Z.VERTICAL_CFG`: which shots keep the whole 16:9 composition in the 9:16 version, the plan map and header text.
- `window.__zankoMeta.duration`: the render length (song end + end-card tail).

Test a scene in isolation with its own timeline: `engine/tests/<name>.js` and
`node tools/stills.mjs --url "engine/index.html?tl=tests/<name>.js" --times …`.

## 4. Command reference

| npm script | command | what |
|---|---|---|
| `npm run check` | `python tools/check_env.py` | environment + project state (`--webgl` probes the GPU) |
| `npm run env` | `node tools/kit_env.mjs` / `python tools/kit_env.py` | resolved paths and executables |
| `npm run analyze` | `python tools/analyze_audio.py` | audio analysis |
| `npm run stills -- --times 1,5` | `node tools/stills.mjs --times 1,5 --sheet s` | stills + contact sheet in `render/stills/` |
| `npm run render` | `node tools/render_final.mjs --name mv` | full 16:9 render + audio → `render/mv.mp4` |
| `npm run render:preview` | `… --preview` | half-resolution quick render |
| `npm run render:vertical` | `… --url engine/vertical.html --selector canvas#vout --width 1080 --height 1920` | 9:16 version |
| `npm run jizura:build` | `node tools/build_jizura_bundle.mjs` | rebuild the JIZURA bundle after updating `vendor/JIZURA` |
| `npm run fonts` | `python tools/fetch_fonts.py` | (re)download fonts |

Every tool prints its options with `--help`. Without an NVIDIA GPU add `--codec x264` to `render_final.mjs`.

## 5. Environment variables

| variable | default | used for |
|---|---|---|
| `BROWSER_CHANNEL` | `msedge` (Windows), `chrome` (elsewhere); `chromium` = Playwright's own | render browser |
| `BROWSER_ANGLE` | `d3d11` (Windows), `metal` (macOS), Chromium default (Linux); `none` | GPU backend for WebGL |
| `PYTHON` | `python` / `python3` / `py -3` | Node tools that call Python, setup |
| `FFMPEG`, `FFPROBE` | `ffmpeg`, `ffprobe` on PATH | encode / mux / probes |
| `JIZURA_DIR` | `vendor/JIZURA` | an existing JIZURA clone |
| `BLENDER`, `CODEX_BIN` | auto-detected | Blender shots, image generation |
| `FONT_DIRS`, `TORCH_DEPS_DIR`, `GITHUB_TOKEN` | — | Blender fonts, forced-alignment deps, font-download rate limit |

## 6. Troubleshooting

- **WebGL renderer is SwiftShader / WARP** (`check_env.py --webgl`): renders are ~10× slower. Update the GPU driver,
  try `BROWSER_ANGLE=gl` (or `vulkan`, `d3d11`), or another `BROWSER_CHANNEL`.
- **Browser fails to launch**: install Edge or Chrome, or `npx playwright install chromium` and `BROWSER_CHANNEL=chromium`.
- **`setup.ps1` cannot be loaded** (execution policy): run it as `powershell -ExecutionPolicy Bypass -File setup.ps1`.
- **Font download hits the GitHub rate limit**: set `GITHUB_TOKEN`, or `-FontsFrom` / `--fonts-from` another project.
- **No network for JIZURA**: clone it elsewhere and set `JIZURA_DIR`, then `node tools/build_jizura_bundle.mjs`.
- **Frames differ between render workers / flicker at 1/3 and 2/3 of the film**: something in a scene depends on
  wall-clock time, unseeded randomness or state from the previous frame (`references/05-engine.md`).
- A tool prints `1 page errors/warnings`: read the line above it (missing asset path, JIZURA plan name …).

## 7. Credits and licences

- Engine, scenes, tools, demo song and demo lyrics: vocaloid-style-mv-pipeline by **NikusonP**, MIT licence. The demo lyrics
  (`demo/lyrics_demo.lrc`) and the synthesized demo song are original and free to use.
- [JIZURA 字面](https://github.com/852wa/JIZURA) © 852wa, MIT — fetched by setup, not vendored; keep
  `jizura/app/JIZURA_LICENSE.txt` with any bundle you redistribute.
- Fonts: Google Fonts families under the SIL Open Font License (`engine/fonts/OFL_*.txt`).
- Your song, lyrics and generated art belong to their authors: credit them on screen and in your README.

---
Author: **NikusonP** · vocaloid-style-mv-pipeline (MIT)
