# 09 — QA: review loop, checklist, failure modes we hit

Contents: 1 The loop · 2 Checklist · 3 Failure modes & fixes (visual) · 4 Pipeline & tooling pitfalls · 5 Working with agents

## 1. The loop

1. **Stills at shot midpoints** (fast, minutes): `node tools/stills.mjs --times <list> --out render/stills/passN --sheet passN`, then read the sheet image. For vertical: `--url engine/vertical.html --canvas vout` (the sheet keeps the 9:16 aspect).
2. **Dense stills where something moves** (transitions, stops, beat cuts): `--range 200:203.5:0.25`.
3. **Full render** (~4 min): `node tools/render_final.mjs --name mv`.
4. **Review sheets** from the MP4: `python tools/review_sheets.py render/mv.mp4 --step 1.8 --out render/reviewN` (5×5 timestamped frames per sheet). Portrait videos work the same (216×384 thumbnails): `python tools/review_sheets.py render/mv_vertical.mp4 --step 1.8 --out render/reviewN_v`.
5. Fix → re-render → re-review. Expect 2–3 full passes. Any change to a JIZURA plan's part pool re-rolls all its cuts, so re-check the whole film after curation edits.

A sampled black/odd frame in a sheet may be a *designed* beat (e.g. a 溜め black before the riff). Before "fixing", render dense stills around it.

## 2. Checklist (per pass)

- [ ] Lyrics readable for ≥ max(0.7 s, 0.09 s × characters); no light text on bright skies; nothing important hidden under the HUD.
- [ ] No lyric over the character's face/action in intimate shots (use the centre-free plan or text-behind).
- [ ] No opaque plates/cards/blocks from JIZURA covering the picture (see 06 §5).
- [ ] No dead air: no shot that is just black/grey without intent while the music plays.
- [ ] Exposure: bright scenes (dawn, flashes, white characters) not blown out — check bloom, glow fx, LUT mix and exposure together.
- [ ] Bright / daylight film (02 §13): lyrics in dark text wherever the sky is light (`schemes: 'light'` or `colors.enabled`, 06 §4); no milky bloom (threshold ≥ 0.9); no dusk tints leaking from scene and fx defaults (amber rims, `#140B1E` ink, the 残光 palettes, `kanjiSlam` without `sky: 'day'`); no additive particles clipping to white; no white flashes on white frames (use a colour flash or `invert`); the 9:16 surround and bands match the film's key (`Z.VERTICAL_CFG.ambience` / `schemes`).
- [ ] Flashes ≤ 3 per second; no saturated red full-frame flicker; fast stripes/spirals < 25 % of the frame.
- [ ] Cuts on beats/onsets; big hits on chorus downbeats; stops used (freeze/black/hold); the ending lands on the final cut.
- [ ] Character identical across shots; no green fringes; no cropped heads unless intended.
- [ ] Colour script reads: each section's palette is distinct and the arc is visible in the contact sheets.
- [ ] Transitions motivated (match shapes, barrier arms, shatter on impact), not decorative noise.
- [ ] Credits present (title lockup, outro, end card, 9:16 header artist and footer) and spelled exactly as given — no leftover demo title, subtitle or artist (`Z.TITLE`, `Z.TITLE_SUB`, `Z.ARTIST`, `Z.CREDIT`).
- [ ] Vertical version: graphic shots keep full composition; lyrics in the bands; header/footer not colliding.

## 3. Failure modes & fixes (visual) — all happened on 残光

| symptom | cause | fix |
|---|---|---|
| Crossword grid / mahjong-tile lyrics / speech-bubble pills | JIZURA pop/novelty layouts | curation deny-list (06 §5) |
| Full **yellow** or **black** frame with a lyric on it | JIZURA kinetic cameras (`knTiltKick`, `knCardFlip`, …) draw the cut as an opaque card | deny `kn*` cams |
| "SCENE 48 / CUT 121" slate, yellow highlighter boxes | `tyColophon`, `tyTextRule`, `marker`-type parts | deny |
| White extruded 3D box over a dark scene | layout `wall` (also `cylinder`, `cube`) | deny |
| Lyrics invisible at night | style scheme with a light background → dark text | `schemes: 'dark'` in the adapter; prefer gold/noir/mono |
| Giant lyric covers the kneeling girl (key action) | default plan | centre-free plan (`plan: 'cf'`) for that shot |
| Runner hidden behind a giant lyric | character drawn in the scene layer | also draw her into `S.fg` with the scene's transform (`S.fg.setTransform(ctx.getTransform())`) |
| 4 s of near-black / empty grey frames | JIZURA `full` mode during a lyric gap | replace with an illustrated shot; reserve `full` for dense typography moments |
| Dawn shots washed out, face blown | glow fx + screen tint + LUT + bloom stacked | lower glow (≈0.3), drop the screen tint, `bloom 0.3`, `bloomThreshold 0.8`, `exposure −0.12` |
| Climax burst wraps back to a night cut before the dawn shot | 7 beats, 6 cuts in the list | match cut count to beats; end the list on the target look |
| Burst never shifts night→dawn | arg name mismatch (`dawn: true` vs `grade: 'night2dawn'`) | read the scene's header comment for exact args |
| Glass cracks overpower the verse | full-intensity fx in a quiet section | scale fx per section (verse < chorus) |
| Over-busy pre-chorus | JIZURA noir + glitch + our CA | accept for tension, but keep the character readable |
| Vertical: title glyphs cropped | 6:5 centre crop on graphic shots | list graphic shots in `Z.VERTICAL_CFG.full` (whole 16:9 composition in the band) |
| Vertical: blurred ghost of title text in the ambience | ambience is a blurred copy of the frame | darken the ambience extra on FULL shots |

## 4. Pipeline & tooling pitfalls

| area | pitfall | fix |
|---|---|---|
| Codex images | worker can't see the generated file path → runner reports failure | read `~/.codex/generated_images/<thread_id>/` using the thread id from `codex exec --json` (tools/imagegen.py) |
| Codex images | `-i <FILE>...` swallows the positional prompt | pass the prompt on stdin (`-`) |
| Codex images | "lying down, seen from above" came back standing | make 2 takes of unusual poses; describe camera + body orientation very explicitly; check every image |
| JSON from PowerShell | UTF-8 **BOM** breaks `json.loads` | read with `utf-8-sig` |
| PowerShell | `$args` is reserved; `@('-vf', $x + ':flags')` splits wrongly (`,` binds tighter than `+`); string `.Replace` with `` `r`n `` misses LF files | use other names; parenthesise; prefer exact Edit tools or Python for file edits |
| Lyrics (ASR) | Whisper hallucinates 「ご視聴ありがとうございました」 on silence; misses lines; homophones (救って/掬って) | official lyrics as text, ASR/alignment only for timings; listen-check by aligning against the vocal stem |
| Lyrics | timings drift 0.3–0.7 s between a quick pass and forced alignment | re-time shot boundaries to aligned onsets (`nb(t)`) once alignment lands |
| Audio | fixed BPM assumption | tempo drifts; always use `audio.json` beats/bars |
| Engine | scene registry defined after scene files load | registries live in `core/util.js` (loads first) |
| Engine | WebGL in headless falls back to SwiftShader | Edge/Chrome channel + `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`; check `renderer` in `window.ready` |
| Render | progress can't be seen when output is piped | sample segment sizes / network or GPU counters, or tee the output |
| Upload | an ad link matched a loose URL regex → script stopped while the last file was at 47 % | strict pattern `https://NN.gigafile.nu/MMDD-<hash>`; verify each link's page (name + size) before sending |

## 5. Working with agents

- Give each agent **disjoint file ownership**, a test timeline, and the instruction to look at its own stills and iterate ≥3 times.
- Agents can be stopped by usage/session limits mid-run. They had written all scene files to disk before stopping; the lead reviewed, integrated and finished directly instead of re-running everything. Check the disk before re-running.
- The lead keeps the core (`engine/core`, `timeline.js`, `index.html`) and the creative direction; agents build scenes, assets and 3D.
- Visual review stays with the lead: read the contact sheets yourself before declaring anything done.
