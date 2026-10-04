# 08 — Rendering, review tooling, delivery

Contents: 1 Deliverables · 2 `tools/render_frames.mjs` (the renderer) · 3 Final render + audio mux (`tools/render_final.mjs`) · 4 Encodes (master, share, previews) · 5 Vertical 9:16 re-layout · 6 Review tooling · 7 Optional upload · 8 Portability · 9 Pitfalls

All commands run from the project root. Environment knobs (read by `tools/kit_env.mjs` / `kit_env.py`; `node tools/kit_env.mjs` prints the resolved values): `BROWSER_CHANNEL` (default `msedge` on Windows, else `chrome`; `chromium` = Playwright's bundled build), `BROWSER_ANGLE` (default `d3d11` on Windows, `metal` on macOS, none elsewhere), `FFMPEG`, `FFPROBE`, `PYTHON`.

---

## 1. Deliverables (what 残光 shipped, 3:46 at 30 fps)

| file | format | size |
|---|---|---|
| `render/<name>.mp4` | **master 16:9** 1920×1080, H.264 NVENC VBR CQ 16 (~32 Mb/s), AAC 320 k / 48 kHz, BT.709 tags, faststart | ≈ 870 MB |
| `render/<name>_share.mp4` | 16:9 upload version, libx264 `slow` CRF 19 (~13 Mb/s), AAC 256 k | ≈ 370 MB |
| `render/<name>_vertical.mp4` | **master 9:16** 1080×1920, same settings as the 16:9 master | ≈ 720 MB |
| `render/<name>_vertical_share.mp4` | 9:16 upload version, CRF 19 (~7.5 Mb/s) | ≈ 210 MB |
| `render/<name>_preview720.mp4`, `<name>_vertical_preview720.mp4` | 1280×720 / 720×1280, CRF 25 `medium`, AAC 160 k | ≈ 70 / 50 MB |
| `render/<name>_stats.json` | render statistics (per-worker ms per frame, fps, GPU) | |

Credits on screen (title lockup, outro, end card, vertical footer) and in the README: ask the user for the exact credit line (残光: 「Music / Lyrics / Movie：NikusonP」, set once as `Z.CREDIT` in the timeline) and the artist name for the 9:16 header (`Z.ARTIST`); `new_project.py --credit … --artist …` writes both.

## 2. `tools/render_frames.mjs` (the renderer)

Drives any page that exposes `window.ready` (Promise) and `window.renderFrame(t)` through headless Edge/Chrome **with the GPU**, captures every frame and pipes it into ffmpeg. Frame `n` (absolute) always shows `t = n / fps`; the range is `[round(start·fps), round(end·fps))`.

```bash
node tools/render_frames.mjs --url engine/index.html --out render/test.mp4 --start 62.5 --end 66 --mode blob --workers 1
node tools/render_frames.mjs --url "engine/index.html?tl=tests/rain.js" --start 62.5 --end 66.2 --mode blob --out render/tests/rain.mp4 --audio audio/song.wav
node tools/render_frames.mjs --url engine/index.html --out render/frames/ --start 70 --end 71        # a directory = PNG sequence
```
Main options (`--help` for all): `--url` · `--start/--end` (seconds, `375f` frames, or `m:ss.xxx`; default end = `window.__zankoMeta.duration`) · `--fps 30` · `--width/--height` · `--out` (.mp4/.mkv/.mov or a directory) · `--workers N` (contiguous segments in parallel) · `--browsers M` · `--channel` · `--mode` · `--codec nvenc|x264|hevc|none` · `--cq 17` · `--crf 15` · `--preset` · `--audio` + `--audio-offset` · `--preview` (half resolution, NVENC p3 CQ 23) · `--selector canvas` · `--stats FILE` · `--keep-parts` · `--allow-software` · `--verbose`.

Capture modes:
| mode | how | notes |
|---|---|---|
| **`blob`** | `canvas.toBlob(PNG)` in the page → POST to the local server → ffmpeg `image2pipe` | **used for 残光**; works for WebGL and 2D canvases, robust |
| `raw` (default) | `gl.readPixels` → raw RGBA → ffmpeg `rawvideo` (vflip) | WebGL canvas only |
| `rawpbo` | async readback through 3 pixel-pack buffers + fences | WebGL only |
| `rawvf` | `VideoFrame.copyTo` RGBA | 2D or WebGL |
| `webcodecs` | in-page H.264 `VideoEncoder` (`--wc-bitrate`) | no ffmpeg encode quality control |
| `dataurl`, `cdpshot`, `screenshot` | debugging fall-backs | slow |

Measured (RTX 3080, Edge, ANGLE D3D11, 6796 frames): **blob, 3 workers → 30.9 fps** at 1920×1080 (render ≈ 5.4–6.0 ms/frame, PNG readback ≈ 85–90 ms/frame, ffmpeg write ≈ 2.3 ms; 220 s render + 1 s mux); the 9:16 build ran at **36.4 fps** (render ≈ 7 ms, readback ≈ 72 ms). Readback dominates, so more workers help until the GPU or CPU saturates (3 was the sweet spot); page load ≈ 3 s per worker.

What it does for determinism and quality:
- Injects a per-frame reseedable `Math.random` (`__zankoSeed(f)` before every frame) on top of the page's own seeded shim.
- Aborts if the page is software-rendered (SwiftShader / WARP / llvmpipe) unless `--allow-software` — software WebGL is ~10× slower and can differ.
- Explicit **BT.709 limited-range** RGB→YUV conversion (`scale=out_color_matrix=bt709:out_range=tv`; swscale's default would be BT.601) and BT.709 container tags.
- NVENC: `h264_nvenc -preset p7 -tune hq -rc vbr -cq <cq> -b:v 0 -maxrate 120M -bufsize 240M -profile:v high -spatial-aq 1 -temporal-aq 1 -aq-strength 8 -rc-lookahead 32 -bf 3 -b_ref_mode middle -g <2·fps> -pix_fmt yuv420p`. x264 fallback: `-preset slow -crf <crf> -tune film -profile:v high -g <2·fps> -keyint_min <2·fps> -sc_threshold 0`.
- Each worker writes a segment; segments are concatenated with `-c copy` (keyframe interval = segment start by construction) and the audio is muxed (`-ss start+offset`, `apad` to the video length, AAC 320 k 48 kHz).

## 3. Final render + audio mux (`tools/render_final.mjs`)

```bash
node tools/render_final.mjs --name mv                                  # 16:9 master, end = page duration (~4 min)
node tools/render_final.mjs --name mv --preview                        # half-res check of the whole film
node tools/render_final.mjs --name mv_vertical --url engine/vertical.html --selector canvas#vout --width 1080 --height 1920
node tools/render_final.mjs --name mv --codec x264                     # no NVIDIA GPU
```
(`powershell -File tools\render_final.ps1 …` forwards to the same script; old `-Workers 3 -Preview` spellings are accepted.) Options: `--workers 3 --start 0 --end <s> --name mv --preview --url --selector canvas#out --width --height --fps 30 --codec nvenc --cq 16 --audio audio/song.wav --no-audio`.

Steps: `render_frames.mjs --mode blob --codec nvenc --cq 16 --stats render/<name>_stats.json` → `render/<name>_video.mp4` (picture only) → mux, equivalent to:
```bash
ffmpeg -y -i render/mv_video.mp4 -ss 0 -i audio/song.wav -filter_complex "[1:a]apad=whole_dur=226.54[a]" \
       -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 320k -ar 48000 -t 226.54 -movflags +faststart render/mv.mp4
```
`apad=whole_dur` pads the song with silence to the video length: 残光's song stops dead at 223.54 s (reverb to 224.32), the film runs to **226.54 s** for a 3 s afterimage end card. Never edit the WAV to add the tail. Duration comes from `--end`, else from the stats file, else ffprobe; the page's duration is `window.__zankoMeta.duration` (set it in the timeline).

## 4. Encodes (master, share, previews)

The master comes out of `render_final.mjs` (NVENC CQ 16, ≈ 32 Mb/s at 1080p30: visually lossless for grain + boil, which eat bits). Upload and preview versions are re-encoded from the master:

```bash
# share / upload version: x264 slow CRF 19, AAC 256k (~2–4 min each)
ffmpeg -i render/mv.mp4 -vf "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
       -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart render/mv_share.mp4
# 720p preview (use scale=720:-2 for the vertical one)
ffmpeg -i render/mv.mp4 -vf "scale=1280:-2,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
       -c:v libx264 -preset medium -crf 25 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart render/mv_preview720.mp4
# verify
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate:format=duration,size -of compact render/mv_share.mp4
```
`setparams` keeps the full BT.709 tags (with FFmpeg 8 the output flags alone leave primaries/transfer "unknown", which some players then guess wrong). Same commands with `mv_vertical` for 9:16. Report to the user: file list with sizes, durations (all ≈ song + tail), codec lines from ffprobe.

## 5. Vertical 9:16 re-layout (`engine/vertical.html` + `engine/vertical.js`)

Not a crop: the 16:9 engine renders each frame **without lyrics** (`Z.NO_LYRICS = Z.VERTICAL = true`, HUD off) into the hidden `#out`, then `vertical.js` composes a 1080×1920 frame on `#vout`:
1. **Ambience**: the central 607×1080 of the frame drawn into a 120×214 canvas, scaled to full bleed with `blur(10px) saturate(1.25)`, tinted by a vertical gradient of `Z.VERTICAL_CFG.ambience` (`[r, g, b]`, default `[10, 6, 18]` = near-black violet; alpha 0.78 → 0.35 → 0.8) — colour without detail. A daylight film wants a light tint (e.g. `[236, 244, 250]`).
2. **Picture band**: a **6:5 centre crop** of the 16:9 frame (`sx 312, sw 1296, sh 1080`) at full width, `y 510…1410` (1080×900), with a soft shadow, hairline frame rules and tick marks. Most character shots are composed for the centre, so 6:5 keeps the subject; check every shot anyway.
3. **FULL-composition shots** (purely graphic: ember intro, title, outro lockup, end card — 残光 `s01 s02 s03 s64 s65 s66`): the whole 16:9 frame at full width (1080×608, `y 656`), ambience covered by a second, denser layer of the tint so the typography doesn't echo. List them in `Z.VERTICAL_CFG.full` in your timeline.
4. **Lyrics re-typeset natively at 9:16**: at boot, every 16:9 JIZURA plan is cloned with `{aspect: '9:16', res: 1080, centerFree: true, centerDir: 'tb'}` (中央を空ける with top/bottom bands around the picture) and the scheme set `Z.VERTICAL_CFG.schemes` (default `'dark'`; `'light'` for dark text on a light ambience — 06 §4), mapped by `Z.VERTICAL_CFG.planMap` (default `{main: 'v_main', cf: 'v_main', noir: 'v_noir', mono: 'v_mono'}`); shots with `lyric: 'none'` stay without lyrics (their typography is in the picture). JIZURA re-plans the cuts for the tall frame, so the lyric layout is native, not a scaled overlay.
5. **Header / footer**: small title, romanised subtitle, artist (`Z.VERTICAL_CFG.title` / `sub` / `artist` — the template passes `Z.TITLE`, `Z.TITLE_SUB`, `Z.ARTIST`) and timecode at the top, credit line (`Z.CREDIT`; nothing when it is empty) and a progress hairline at the bottom, faded in/out between `Z.VERTICAL_CFG.credits: [t0, t1]`, around the film's title and end card (残光: 17.6 s → 223.54 s).

Render and check:
```bash
node tools/stills.mjs --url engine/vertical.html --canvas vout --times 20,63,131,184,212 --out render/stills/v --sheet v
node tools/render_final.mjs --name mv_vertical --url engine/vertical.html --selector canvas#vout --width 1080 --height 1920
```
To adapt: set `Z.VERTICAL_CFG = { full, planMap, title, sub, artist, credits: [t0, t1], schemes, ambience }` in `engine/timeline.js` (inside `Z.setup`; fields you leave out fall back to the 残光 values in `vertical.js`). Edit `vertical.js` only to change the crop if your shots are composed off-centre (per-shot crop offsets are an easy extension: a map `id → sx`). `engine/vertical.html?tl=tests/<file>.js` loads a test timeline, like `index.html`.

## 6. Review tooling

| tool | use |
|---|---|
| `node tools/stills.mjs --times 1,5.5,12 [--url …] [--out render/stills] [--sheet name] [--canvas out]` / `--range a:b:step` | PNG per time + a 4-column contact sheet `<out>/<sheet>.jpg` (480×270 tiles, timestamps; 9:16 frames: 6 columns of 225×400). Prints ms per frame and every page error/warning. 0.1–0.45 s per still. Use shot midpoints for an animatic, 3–4 times per new scene. `--canvas vout` for the vertical page. |
| `python tools/review_sheets.py render/mv.mp4 --step 1.5 --out render/review1 [--start --end --cols 5]` | contact sheets of a rendered video: one 384×216 thumbnail (216×384 for a 9:16 video) every `step` s, `cols×cols` per sheet, `m:ss.xx` labels — 残光: 7 sheets per pass at 1.5 s. Read every sheet. |
| `python tools/review_sheets.py render/mv_vertical.mp4 --step 1.5 --out render/review_v` | portrait videos get 216×384 thumbnails automatically (or a denser strip: `ffmpeg -v error -i render/mv_vertical.mp4 -vf "fps=1/3,scale=144:256,tile=16x3:padding=4:color=black" -q:v 3 render/review_v/vsheet_%02d.jpg` — 48 frames per sheet, 2 sheets for 3:46) |
| `node tools/jz_cuts_at.mjs 196.8,203.5 main` | which JIZURA parts a lyric frame uses (06-jizura) |
| `ffmpeg -ss 62.4 -i render/mv.mp4 -frames:v 12 render/check/f_%02d.png` | a burst of consecutive frames to check motion, seams, flashes |

Review order that worked: stills at every shot midpoint (pacing, composition) → fix → `--preview` full render → review sheets → fix → full master → review sheets (16:9 and vertical) → spot-check the worker seams (frames at 1/3 and 2/3 of the duration, e.g. `ffmpeg -ss <t>` around them) and every flash for the photosensitivity rule (≤ 3 full-frame flashes per second).

## 7. Optional upload (`tools/gigafile_upload.mjs`)

Uploading publishes the video to a public file-sharing site — run it **only when the owner of the video explicitly asked for a share link**, and tell them what will be uploaded first.
```bash
node tools/gigafile_upload.mjs --days 30 render/mv.mp4 render/mv_vertical.mp4 render/mv_share.mp4 render/mv_vertical_share.mp4
```
It opens gigafile.nu headless, sets the retention (`--days`, the site offers fixed choices such as 7/14/30/60/100), uploads all files, waits until every file has a link (polls every 5 s, up to 3 h; prints progress), then clicks **まとめる** to bundle them into one link. Links are accepted only if they match `^https?://\d+\.gigafile\.nu/\d{4}-[0-9a-z]{10,}$` (so page text or ads can't be mistaken for a result). Output: `render/gigafile_links.json` (`bundle`, `files[]`, `names[]`, `expiry`, `uploadedAt`) and the links on stdout. Hand the user the bundle link, the per-file links and the expiry date. Web pages change: if the selectors (`#file_lifetime`, `#file_list`, `#matomete_btn`) stop matching, the script times out rather than reporting wrong links.

## 8. Portability

- **Windows** (primary): Edge + ANGLE D3D11 + NVENC, as measured above.
- **macOS**: `BROWSER_CHANNEL=chrome` (default off Windows), ANGLE `metal` (default); no NVENC → `--codec x264` (expect a few fps slower; the x264 encode runs in parallel per worker).
- **Linux**: Chrome or Playwright Chromium (`npx playwright install chromium`, `BROWSER_CHANNEL=chromium`); check the `[gpu]` line — headless Linux often falls back to SwiftShader; try `BROWSER_ANGLE=vulkan` or `gl`, and only use `--allow-software` for short tests. NVENC works with NVIDIA drivers + an ffmpeg built with nvenc.
- Always read the `[gpu] … renderer` line at the start of a render.

## 9. Pitfalls

- `--end` missing and the timeline did not set `window.__zankoMeta.duration` → the engine default (the 残光 duration) is used. Set it.
- Muxing the audio with `-shortest` or without `apad` cuts the end card; editing the WAV shifts every sync point.
- Seams between workers: any non-determinism shows as a jump exactly at the segment boundaries — check them on every full render (05 §2).
- Software rendering, a busy GPU (Blender, other agents, a game) or a sleeping laptop multiply render time; the GPU should be idle during finals.
- Wrong selector for the vertical page (`canvas#vout`) → you record the hidden 16:9 canvas, rescaled.
- Share encodes without colour tags look slightly different in some players; keep `setparams` (§4).
- Don't upload anything without the owner's explicit OK (§7).

---
Author: **NikusonP** · vocaloid-style-mv-pipeline (MIT)
