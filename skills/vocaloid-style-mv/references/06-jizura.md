# 06 — JIZURA 字面 as the lyric layer

Contents: 1 What it is · 2 How it's wired in · 3 Plans · 4 Styles · 5 Curation (deny-lists) · 6 Character shots & text-behind · 7 Debugging · 8 Vertical 9:16 · 9 Licence

## 1. What it is

[JIZURA 字面](https://github.com/852wa/JIZURA) (MIT, Copyright (c) 2026 hakoniwa) is a browser app that auto-builds 文字PV lyric-motion videos: give it lyrics (+ LRC times) and a song, and it plans cuts from ~860 parts in 10 groups (layout, enter, hold, exit, decor, treat, bg, cam, fx, trans) and 27 styles, with beat-snapping, 2コマ打ち, chromatic ghosts and transparent front/back export. We use its **engine** (not its UI) as a deterministic lyric layer inside our renderer.

## 2. How it's wired in

- `setup` clones the repo to `vendor/JIZURA`; `node tools/build_jizura_bundle.mjs` concatenates `src/*.js` (minus the UI) into `jizura/app/jizura_engine.js` — byte-for-byte the upstream engine, no patches.
- `jizura/app/jizura_adapter.js` exposes `window.JZ`:
  ```js
  JZ.setAudio({ duration, beats, energy: null, energyRate: 0 });   // our librosa beat grid, not JIZURA's detector
  await JZ.addPlan('main', projectSettings);                        // builds J.plan(project, audio), loads fonts
  JZ.drawPlan('main', ctx, t, 'front');                             // 'front' | 'back' | 'transparent' | 'normal'
  JZ.cutsOf('main');                                                // planned cuts (layout/enter/exit/… per cut)
  ```
  Rendering is a pure function of `t`: the planner is seeded; the renderer's only `Math.random` use is at construction (grain/paper), and every page seeds `Math.random` before the bundle loads, so all render workers draw identical frames.
- `engine/core/main.js` draws the active shot's plan into the **text layer** after the scene (`shot.lyric`: `'front'` default, `'full'` = JIZURA's own backgrounds, `'backfront'`, `'none'`, or `{plan, mode}`).

## 3. Plans

A plan = one JIZURA project. Make several and pick per shot (`shot.plan`):

```js
const common = { lyrics: lrc, fps: 30, res: 1080, aspect: '16:9', seed: 2609,
  unify: true,      // 統一感: repeated lines come back with the same treatment, キメ lines, morphs
  typeset: true,    // 文字整列: kana tracking, small particles, text 0.2 s before the voice
  extra: true, wa: false, horror: false,          // part sets: extra on, 和風 props off, horror off
  enabled,                                        // curated part pool (§5)
  colors: { accentOn: true, accent: '#FFA552', ghostA: '#39C6E0', ghostB: '#C8373A' },  // palette accent + ghost colours
  schemes: 'dark',                                // adapter option: only dark-background schemes (§4)
  fx: { motion: 0.7, glitch: 0.45, chroma: 0.6, decor: 0.45, density: 0.5, texture: 0.5, flash: false, koma: 12, hud: 'off' } };
await JZ.addPlan('main', { ...common, style: 'gold', mood: 'emotional' });                 // verses / default
await JZ.addPlan('cf',   { ...common, style: 'gold', mood: 'emotional', centerFree: true }); // character shots
await JZ.addPlan('noir', { ...common, style: 'noir', mood: 'glitch' });                      // pre-chorus tension
await JZ.addPlan('mono', { ...common, style: 'mono', mood: 'graphic', seed: 2610 });         // last chorus
```
- Lyrics: LRC with markup — `/` forces a cut break, `*word*` emphasis (bigger, impact parts), trailing `!` = キメ line (flash + shake), `[間奏]` = instrumental line (keeps the previous line from lingering).
- Remove `[ti:]` from the LRC unless you want JIZURA's own title card.
- Turn JIZURA's own flashes off (`flash: false`) and let the engine's post pass own full-frame flashes, so the 3-flashes-per-second rule is enforced in one place.
- Changing the part pool or seed **re-rolls every cut** in that plan — re-review after any curation change.

## 4. Styles

Probe styles as transparent front layers over a dark frame before choosing:
```bash
node tools/jizura_probe.mjs --style gold --lrc analysis/lyrics_mv.lrc --times 18.5,25.2,36,63.5 --modes front --out jizura/probe_styles
```
Findings from 残光 (night-heavy film): **gold** (金夜: ivory/gold mincho) = elegant default; **noir** (white + cyan/amber ghosts, glitch layouts) = tension; **mono** (white mincho, strong RGB split) = climax; **ocean** works for blue scenes; **sumi / crimson** draw *dark ink text* → invisible on night scenes.
Many styles include a light-background "swap" scheme whose text is dark; the adapter option `schemes: 'dark'` remaps every cut to a dark-background scheme (luminance < 0.25).

## 5. Curation (deny-lists)

Random parts must be curated for the film's tone. The engine builds `enabled` from JIZURA's registries: a part stays on only if its moods include `emotional | calm | editorial | glitch`, it is not horror (`hr*`), and it is not on a deny-list. The 残光 deny-lists (adapt per film):

| group | denied | why |
|---|---|---|
| layout | crossword, keycaps, slotMachine, stickerBomb, bubble(s), chat, notification, searchBar, ticket, priceTag, nameTag, stickyNotes, karuta, ema, tanzaku, omikuji, chochin, noren, shoji, kakejiku, stationSign, routeMap, calendar, newspaper, vinyl, cassette, polaroid, postcard, letterPaper, genkou, panels, splitScreen, splitHalves, subtitleBar, tile, kaleido, **wall, cylinder, cube** (opaque 3D boxes), and other pop/novelty objects | gimmicks, or opaque plates that cover the scene in front mode |
| cam | **knCardFlip, knTiltKick, knReadPan, knShearKick, knRushIn**, knJumpCut, jelly, bounce | kinetic cameras wrap the whole cut in an **opaque card** → full yellow/black frames over the picture |
| decor | UI gimmicks (cursorClick, windowChrome, progressBar, likeCounter…), 和 props (kamon, seigaiha, chochin…), confetti/hearts/memphis, **tyColophon** ("SCENE/CUT" slate), **tyTextRule**, dateStamp, tyTypeScale | off-tone or draw plates/blocks |
| fx | panelWipe, irisTrans, doors, blindsTrans, splitSlide, gridRepeat, white/blackFrame, strobe, colorBars, invert, flash, bloomFlash, kaleido, posterize, … | full-frame effects belong to our post pass (and photosensitivity budget) |
| treat | boxed, marker, sticker, circled, rainbow, chrome, splitColor, knWordPlate | pop plates |
| enter / exit | bubbles, stickerPeel, crumple, loadingBar, tokoroten / balloonOff, crumpleOut, peelOff | comic motion |
| bg (only `full` mode) | argyle, tartan, polka, checker, retroGrid, kaleidoscope, fireworks, sunburst, seigaiha, asanoha, … | pattern backgrounds clash with illustrated shots |

Dump the registry (names, moods) with `node tools/jizura_parts.mjs` → `jizura/parts.json` when building a new deny-list.

## 6. Character shots & text-behind

- **Centre-free plan** (`centerFree: true`, JIZURA 中央を空ける): lyrics split into left/right bands (or top/bottom on tall frames) — use for any shot where the character's face/action is the point (kneeling and gathering, bust shots, singing).
- **Text behind the character**: put the character in the foreground layer (`illust` char `front: true`; custom scenes draw into `S.fg` with the same transform). The lyric passes behind her; this was one of the strongest looks (hero chorus shots, the run in front of a giant 「わたしは行くよ」).
- Shots whose scene *is* the typography (kanji slams, type cards, tunnels, title/end cards) use `lyric: 'none'`.

## 7. Debugging

- A lyric frame looks wrong → find the cut: `node tools/jz_cuts_at.mjs 25.5,37.5,45.0 main` prints layout / enter / hold / exit / decor / treat / bg / cam / fx per plan at those times. Deny the culprit part, re-render the stills.
- Typical culprits we hit: full yellow frame (knTiltKick card), "SCENE 48 / CUT 121" slate (tyColophon), white extruded box (wall), empty grey frame (mono plan in `full` mode during a gap with no lyric — replace with an illustrated shot), lyric over a face (switch the shot to `cf` or put the character in front).

## 8. Vertical 9:16

`engine/vertical.js` builds plans at `aspect: '9:16'` with `centerFree: true, centerDir: 'tb'` from the 16:9 plans' projects, so JIZURA re-typesets every line natively for the tall frame (top/bottom bands around the picture band). The 16:9 engine runs with `Z.NO_LYRICS` so lyrics are not baked into the picture. See `08-render-and-delivery.md`.

## 9. Licence

JIZURA is MIT (the repository is github.com/852wa/JIZURA; its LICENSE reads "Copyright (c) 2026 hakoniwa"). The kit fetches it at setup and does not vendor it; keep `jizura/app/JIZURA_LICENSE.txt` with any built bundle you redistribute, and credit it.
