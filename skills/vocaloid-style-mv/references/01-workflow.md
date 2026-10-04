# 01 — Workflow: from song to delivered MV

Contents: 0 Setup · 1 Listen · 2 Concept · 3 Assets · 4 Storyboard & timeline · 5 Build · 6 Review · 7 Deliver · Time budget · Parallelising · File conventions

All commands run from the **project root** (the folder created by `<skill>/scripts/new_project.py`; `<skill>` = the folder containing `SKILL.md`). Paths below are relative to it.

---

## 0. Setup

```bash
python <skill>/scripts/check_env.py                       # what's installed (REQUIRED vs OPTIONAL)
python <skill>/scripts/new_project.py my-mv --song song.wav --lyrics lyrics.txt \
       --title <title> --title-sub <Latin subtitle> --artist <artist> --credit "Music / Lyrics / Movie：<artist>" --setup
cd my-mv
```
`--title` / `--title-sub` / `--artist` / `--credit` set `Z.TITLE`, `Z.TITLE_SUB`, `Z.ARTIST`, `Z.CREDIT` in `engine/timeline.js` (HUD, end card, 9:16 header and footer). `--credit` alone also sets the artist (the text after the credit's last colon); `--title` alone empties the demo subtitle.
`--setup` runs `setup.ps1` / `setup.sh`: npm install (Playwright), pip install, font download (`tools/fetch_fonts.py` → `engine/fonts/`), `git clone` of JIZURA into `vendor/JIZURA` checked out at the tested commit `fc16bfe` (set the environment variable `JIZURA_REF` to another branch / tag / sha, e.g. `JIZURA_REF=main`, to follow upstream; a local `JIZURA_DIR` still wins), `node tools/build_jizura_bundle.mjs` → `jizura/app/jizura_engine.js`. Plain-text lyrics (no timestamps) need the alignment stack: add `--setup-args "-Lyrics"` (bash `"--lyrics"`) and install CPU torch into `vendor/pydeps_torch` (03 §9).

**Smoke test (recommended on a new machine) — in a throwaway project scaffolded without `--song`** (`python <skill>/scripts/new_project.py _smoke --setup`; it prints the steps), never in the film's project: the demo writes `audio/song.wav` and overwrites `analysis/lyrics_mv.lrc` and `analysis/sections.json`. In `_smoke`: `python demo/make_demo_song.py` → copy `demo/lyrics_demo.lrc` to `analysis/lyrics_mv.lrc` and `demo/sections_demo.json` to `analysis/sections.json` → `python tools/analyze_audio.py` → `node tools/stills.mjs --times 1,3.5,8.4,10,12.5,13.6,18.4,19.5,21.2,23.3 --sheet smoke` → look at `render/stills/smoke.jpg` (the full list, with the 16:9 and 9:16 renders, is in the project's `README.md` §2). If WebGL reports SwiftShader instead of the GPU, fix that first (GPU flags / browser channel) — software rendering is ~10× slower. Run the smoke test before scaffolding the film and the film's project can reuse its fonts: `--setup-args "-FontsFrom ../_smoke/engine/fonts"` (bash `--fonts-from`; sibling folders).

Acceptance: `window.ready` resolves with `renderer` naming the real GPU; a still renders in < 0.5 s.

## 1. Listen (analysis)

```bash
python tools/analyze_audio.py                 # audio/song.wav → analysis/audio.json, envelope_30fps.json, overview.png, sections_auto.json
```
- Open `analysis/overview.png` and **look at it**: waveform, energy, beats, section boundaries. Section labels are semi-manual (automatic grouping is unreliable on compressed masters): copy `analysis/sections_auto.json` to `analysis/sections.json`, fix boundaries / labels / groups by ear and by the plot, and re-run `analyze_audio.py` (it uses `sections.json` when present). `--bpm-range LO,HI` if the tempo octave is wrong.
- Note the special events: chorus downbeats, stops (silence gaps), post-chorus hits (biggest energy jumps), the final cut (dead stop or fade). These become your signature moments.
- Lyrics: get the **official text** from the user. Only transcribe when none exists (`references/03-audio-and-lyrics.md`). Use transcription/forced alignment for *timings* and keep the official *text*. Watch for lines the ASR missed entirely (残光's final "救って、救って" was absent from every pass).
- Write `analysis/lyrics_mv.lrc` — one display line per official line, LRC time = sung onset, JIZURA markup (`/` cut break, `*emph*`, trailing `!` for キメ lines, `[間奏]` for long instrumental gaps).

Acceptance: beats look right on the overview; every lyric line has a time within ±0.15 s of the onset; sections labelled.

## 2. Concept

Read `references/02-creative-direction.md`. Produce `docs/CONCEPT.md` (≈1 page):
thesis (one sentence about what the song is *about* visually), logline, emotional arc per section, colour script, master shapes + motifs (with meanings), character bible summary, 5–10 signature moments mapped to times, ending idea, what makes this film *different* from the 残光 example.

**Checkpoint:** summarise to the user in a few lines.

## 3. Assets

Read `references/04-asset-generation.md`.
1. Character bible `docs/CHARACTER.md` (hair/eyes/outfit/signature item/motion prop/palette) + a shared **style block**.
2. Three master candidates → pick → `assets/char/REF_master.png`. **Checkpoint:** contact sheet.
3. Poses (from the storyboard's needs: close-ups, back view, hands, signature props, dynamic poses, emotional beats) → `assets/char/*.png` (RGBA). Two takes for hard poses.
4. Locations (from the lyrics' imagery + the colour script) → `assets/bg/*.png`. Generate the time-of-day variants your colour script needs for the 2–3 key locations (e.g. noon / golden hour / night). A LUT can shift a plate's mood, but light sources (sun position, cast shadows, lamps, windows) must be painted.
5. Props (transparent) for symbolic objects.

```bash
python tools/imagegen.py assets/char/jobs_core.jsonl --out-dir assets/char --concurrency 8
```
Acceptance: every image viewed; character recognisably identical across poses; no green fringes; nothing imitates an existing character.

## 4. Storyboard & timeline

1. `docs/STORYBOARD.md`: a table — `# | time | lyric | scene | content` — one row per shot (60–80 shots for a 3–4 min song; chorus shots 0.9–2 s, verse shots 2.5–5 s, a few long holds). Think in beats when the tempo is high: at 160+ BPM chorus shots of 2–4 beats; per-beat scenes cut every beat (0.33–0.37 s), so run `burst` with `every: 2` and keep `kanjiSlam` (one slam per beat) to ≤ 2 bars. Map each lyric line to an image that *answers* it (see 02 §5). Mark the signature moments.
2. `engine/timeline.js`: the edit. Start from the template's commented demo timeline (「蛍火」): keep its structure — film identity (`Z.TITLE`, `Z.TITLE_SUB`, `Z.ARTIST`, `Z.CREDIT`), helpers, JIZURA plans + curation, HUD, global FX, `Z.VERTICAL_CFG` — and replace the shots with your storyboard. The demo is a night film: re-tune every night-specific value that does not fit your film's key (palette consts, `Z.LOOK_DEFAULT`, JIZURA `schemes`, HUD colours, the 9:16 surround; 02 §13). Helpers inside `Z.setup(audio)`:
   - `B(n)` = start of bar *n* using the bar numbers of `audio.json` / `sections.json` (`bars[].index`; songs with a pickup have a bar 0, songs without don't — look the bar up by index, not by array position);
   - `nb(t)` = nearest beat to `t` (snap lyric onsets to the grid).
   ```js
   shot('s12', nb(47.00), nb(50.87), 'fall', { char: A + 'fall.png' }, { plan: 'noir', trans: { type: 'black', dur: 0.3 }, post: { bloom: 0.5 } });
   ```
   Cut on lyric onsets snapped to beats (`nb(lyricTime)`) inside sections, and on bar starts (`B(n)`) at section changes. Give every shot an id (`s01…`), a JIZURA lyric plan (`main`/`cf`/`noir`/… or `lyric:'none'` when the scene's own typography carries the line), post params, and a transition when it's motivated.
3. Render stills at every shot's midpoint immediately, even with placeholder scenes — an animatic of stills reveals pacing problems early.

## 5. Build

- **Scene library first**: `references/05-engine.md` lists every scene in `engine/scenes/*.js` with args. Most shots are `illust` (background + camera move + characters + fx). Adapt existing special scenes before writing new ones.
- **New scenes** for the song's signature moments (a new song needs new metaphors: rain → ink, light → fireflies, broken glass → paper, etc.). One file per area, registered with `Z.scene(name, {preload, init, draw})`.
- **JIZURA**: plans per section + curation (`references/06-jizura.md`).
- **3D**: 1–2 Blender sequences for the instrumental showcases (`references/07-blender-3d.md`); run them with `python tools/blender_run.py blender/shots/<shot>.py -- --mode full --res 100` (it finds Blender; `--res 100` = true 1080p).
- Each scene author keeps a test timeline `engine/tests/<name>.js` and renders stills with `node tools/stills.mjs --url "engine/index.html?tl=tests/<name>.js" --times …`.

## 6. Review (the quality loop)

```bash
node tools/stills.mjs --times <midpoints of all shots> --out render/stills/pass1 --sheet pass1
node tools/render_final.mjs --name mv                       # full render + audio (≈4 min on RTX 3080)
python tools/review_sheets.py render/mv.mp4 --step 1.8 --out render/review1
```
Read every sheet. Use `references/09-qa-and-lessons.md` (checklist + failure modes). Query JIZURA when a lyric frame looks wrong: `node tools/jz_cuts_at.mjs 196.8,203.5 main`. Fix → re-render → re-review. Two or three passes is normal.

## 7. Deliver

`references/08-render-and-delivery.md`: 16:9 master, share encode, 9:16 vertical (`engine/vertical.html`, configured by `Z.VERTICAL_CFG` in the timeline: which shots keep their full 16:9 composition, plan map, header text, lyric `schemes` and the `ambience` tint of the surround), 720p previews, credits (title lockup + outro + end card + README), optional upload. Report: file list with sizes, durations, what was verified, what is uncertain (e.g. transcribed lyric lines).

---

## Time budget (measured on 残光: 3:46 song, RTX 3080, Windows 11)

| step | time |
|---|---|
| audio analysis | 35–60 s |
| lyric transcription (multi-pass + separation + alignment) | 30–60 min (skip with official lyrics + alignment only) |
| one generated image | 30–110 s; 8–10 in parallel; ~45 images ≈ 10–15 min |
| Blender EEVEE 1080p toon + line art | ≈0.7 s/frame; 7 s shot ≈ 3 min |
| still (engine, incl. PNG encode) | 0.1–0.45 s |
| full render 6796 frames 1080p, 3 workers | ≈4 min (≈30 fps); vertical ≈3.5 min |
| x264 CRF 19 share encode (slow) | ≈2–4 min each |

## Parallelising

- Split scene work by file (`intro.js`, `typo.js`, `glass.js`, …) — one owner each, plus their own test timeline. Shared core files (`engine/core/*`, `index.html`, `timeline.js`) belong to the lead.
- Asset batches and Blender shots run independently of scene code.
- Long agent runs can stop on usage limits: have agents write files early and often; after an interruption, review what's on disk before re-running anything (in 残光 all seven scene modules were complete on disk even though every agent "failed" before reporting).

## File conventions

```
audio/song.wav                       analysis/{audio.json, envelope_30fps.json, lyrics_mv.lrc}
assets/char/*.png (RGBA, trimmed)    assets/bg/*.png (opaque 16:9)    assets/style/{palettes.json, luts/}
docs/{CONCEPT.md, CHARACTER.md, STORYBOARD.md}
engine/timeline.js                   engine/scenes/*.js               engine/tests/*.js
blender/shots/*.py → blender/renders/<shot>/f_####.jpg
render/{stills/, review*/, <name>.mp4}
```
