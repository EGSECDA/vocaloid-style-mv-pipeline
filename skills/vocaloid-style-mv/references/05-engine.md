# 05 — The engine: architecture, API, scene library

Contents: 1 Architecture · 2 Hard rules (determinism, performance) · 3 The timeline (`engine/timeline.js`) · 4 Scene API · 5 Drawing toolkit · 6 Transitions · 7 Post pass and LUTs · 8 Scene library catalogue · 9 Writing a new scene · 10 Porting checklist (song-specific constants) · 11 Pitfalls

---

## 1. Architecture

`engine/index.html` loads, in order: seeded `Math.random` shim → `../jizura/app/jizura_engine.js` + `jizura_adapter.js` → `core/util.js` → `core/assets.js` → `core/gl.js` → `core/draw.js` → `core/trans.js` → `scenes/scenes.js` → scene files (`intro typo glass dark night memory meta`) → the timeline (`timeline.js`, or `?tl=tests/<file>.js`) → `core/main.js`. `engine/vertical.html` is the same stack (`?tl=` included) plus `Z.NO_LYRICS = Z.VERTICAL = true` and `vertical.js` (see 08).

Contract used by the renderer: `window.ready` (Promise → `{duration, fps, renderer, shots, assets}`), `window.renderFrame(t)` (async, draws song time `t` into `<canvas id="out">`), `window.__zankoMeta` (`{duration, fps}`; the timeline must set `duration`).

Per frame (1920×1080, 30 fps):

```
active shot(s) at t ──► scene.draw(ctx, S) ─► SCENE layer (Canvas2D, opaque)      ─┐
                        └─ S.fg  ───────────► FOREGROUND layer (transparent)        │  WebGL2 post (gl.js):
JIZURA plan (shot.lyric) ─► TEXT layer (transparent) ◄─ shot.text(ctx,S) ◄─ Z.hud   ├─► comp: scene → boil, glitch, zoom blur, CA,
                                                                                    │   palette LUT, grade; + text (opt. textCa);
                                                                                    │   + fg (same boil + grade)
                                                                                    └─► bloom (3 levels) → flash, invert,
                                                                                        vignette, grain, fade, letterbox, dither
```
- Line boil, glitch, zoom blur, CA and LUTs touch the **scene** layer; the **text** layer stays crisp on top; the **foreground** layer (characters drawn in front of the lyrics) gets the same boil and grade as the scene, but sits *above* the text — the "lyric passes behind the singer" look.
- During a transition (`[t0, t0+trans.dur]` of the incoming shot) both shots render into separate canvases, the transition function blends them, post params are interpolated (`inOutSine`; different `lutA`s cross-blend via `lutB/lutBlend`), and the lyric layer follows the **incoming** shot.

## 2. Hard rules

- **Pure function of time.** No `Date.now()`/`performance.now()` in visuals, no unseeded randomness. Use `Z.rnd(...ints)` [0,1), `Z.rnds` [−1,1), `Z.rng(seed)` (mulberry32 stream with `.range .pick .sign`), `Z.noise1(x, seed)`, `Z.fbm1(x, seed, oct)`, `S.rng(seed)` (seeded per shot). Particles are closed-form in `t` (`D.embers`); if a simulation is unavoidable, integrate from the shot start with fixed `dt` (残光 `fall`). Workers seek to arbitrary frames: a scene may be entered at any `t` and must not carry state between frames except caches of immutable data (offscreen art keyed by args).
- The render page seeds `Math.random` once per frame (`__zankoSeed(f)`), so third-party code (JIZURA's textures) stays identical across workers — but don't rely on draw order.
- **Bitmap warm-up.** Chromium rasterises the *first* draw of an ImageBitmap differently (measured up to 78/255 on sprite edges). `meta.js` draws every preloaded image once at 4 scales in its `init`; it only runs if a meta scene (`panels`, `burst`, `ref`, `seq`) is in the timeline. If yours has none, move that warm-up into `main.js` after `Z.preload` — otherwise frames can differ at worker seams.
- Draw only inside 1920×1080; `save()/restore()` around state; reset `globalCompositeOperation`, `filter`, `globalAlpha`. `Z.scratch[0..2]` are shared 1920×1080 temp canvases — use them only inside one synchronous draw, never across `await`.
- **Hand-drawn timing**: drawn/character motion on 12 fps (`Z.quant(t, 12)`, `S.tq`, `S.ltq`, char `q: 12`); camera, light, particles on full time.
- **Performance**: target < 40 ms per frame (残光 averaged ≈ 6 ms render per frame; readback dominates). `ctx.filter = 'blur()'` on large canvases is expensive — blur small canvases or cache pre-blurred art. No `getImageData` per frame except on tiny canvases. Prefer `drawImage` of cached sprites.

## 3. The timeline (`engine/timeline.js`)

```js
(() => { const Z = window.Z, D = Z.draw, E = Z.ease; const A = 'assets/char/', BG = 'assets/bg/';
  Z.TITLE = '<title>'; Z.TITLE_SUB = '<romaji>'; Z.ARTIST = '<artist>';   // new_project.py --title / --title-sub / --artist
  Z.CREDIT = 'Music / Lyrics / Movie：<artist>';                           // new_project.py --credit
  Z.setup = async (audio) => {
    const lastBar = audio.bars.length ? audio.bars[audio.bars.length - 1].index : 0;
    const B = n => { const b = audio.bars.find(x => x.index === n); return b ? b.start : n > lastBar ? audio.music_cut : 0; };   // by bars[].index, never array position
    const nb = t => audio.beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), audio.beats[0] ?? t);
    Z.LOOK_DEFAULT = { boil: 1.1, bloom: 0.3, bloomThreshold: 0.72, grain: 0.06, vignette: 0.35, lutMix: 0 };   // night / dusk; daylight values: §7
    // JIZURA: JZ.setAudio(...); await JZ.addPlan('main', {...}); ...           (06-jizura.md)
    const S = []; const shot = (id, t0, t1, scene, args, extra = {}) => S.push(Object.assign({ id, t0, t1, scene, args }, extra));
    shot('s04', B(10), nb(20.76), 'illust', { bg: BG + 'bg_sky.png', bgFrom: { zoom: 1.28, y: -0.7 }, bgTo: { zoom: 1.12, y: 0.55 },
      chars: [{ img: A + 'back_sunset.png', front: true, x: 880, y: 1330, h: 1180, rim: { color: '#FFA552' }, in: { dur: 1.4, dy: 160 } }] },
      { trans: { type: 'iris', dur: 0.55, cx: 960, cy: 540 }, post: { lutA: 'P1', lutMix: 0.18 } });
    Z.SHOTS = S;
    window.__zankoMeta.duration = audio.music_cut + 3;   // song + afterimage tail (mux pads the audio)
  };
})();
```
**Shot object**: `{ id, t0, t1, scene, args, lyric, plan, post, trans, text, hud }`
- `lyric`: `'front'` (default: JIZURA's front layer over the scene) · `'full'` (JIZURA's own backgrounds too — covers the scene) · `'backfront'` · `'none'` · `{plan, mode}` · or `S => …`. `plan`: JIZURA plan name (default `'main'`).
- `post`: object or `S => object`, merged over `Z.LOOK_DEFAULT` (+ `Z.LOOKS[section.look]` if you define looks and `Z.sectionAt`).
- `trans`: `{type, dur, …params, post?: (k, P) => {}}` — transition *into* this shot, occupying `[t0, t0+dur]`.
- `text: (ctx, S) => {}` custom typography on the text layer (after JIZURA). `hud: false` hides `Z.hud` for this shot.

**Globals the timeline may define**: `Z.LOOK_DEFAULT`, `Z.LOOKS` + `Z.sectionAt(t)` (section-based looks; also feeds `S.section`), `Z.globalFX(P, t)` (mutate post params every frame — 残光 used it for six big-downbeat flashes and a kick-driven shake `5·env.low(t)^3` during choruses only), `Z.hud(ctx, S)` (small corner typography on the text layer; skipped when `Z.VERTICAL`), `Z.CREDIT` (used by the title lockup and the vertical footer), `Z.VERTICAL_CFG` (the 9:16 build: §10, 08 §5). The template timeline also keeps the film's identity in `Z.TITLE`, `Z.TITLE_SUB` (HUD, end card, vertical header) and `Z.ARTIST` (artist name in the 9:16 header); `new_project.py --title --title-sub --artist --credit` writes them. `Z.NO_LYRICS` disables the lyric layer (vertical build).

Edit conventions that worked: shot ids `s01…` in film order (insert `s52b` rather than renumbering); cuts on `nb(lyric onset)` inside sections and `B(n)` at section changes; 60–80 shots for 3–4 min; chorus shots 0.9–2 s, verse shots 2.5–5 s, a few long holds.

## 4. Scene API

```js
Z.scene('name', {
  preload: (args) => ['assets/char/x.png', ...],   // every image used (decoded before frame 0); read with Z.imgSync(path)
  init: async () => {},                             // once per scene name used in the timeline (fonts: document.fonts.load)
  draw(ctx, S) {},                                  // may be async (image sequences)
});
```
`S = { t, lt, dur, p, shot, args, W:1920, H:1080, clock, env, section, tq, ltq, rng(seed), fg }` — `t` song time; `lt = t − shot.t0` (can exceed `dur` while the next shot's transition runs); `p = clamp(lt/dur)`; `tq/ltq` 12 fps-quantised; `fg` = the foreground canvas context (falls back to `ctx` during transitions). Clock and envelope: 03-audio-and-lyrics §5.

Helpers: `Z.img(p)` (async decode, cached) · `Z.imgSync(p)` · `Z.seqFrame(pattern, n)` (LRU of 48 decoded frames, `f_####.jpg` patterns) · `Z.canvas(w,h)` · `Z.tinted(img, color, key)` (cached flat-colour copy) · `Z.fx(ctx, S, fxSpec)` and `Z.drawChar(ctx, S, charSpec)` (the `illust` building blocks, usable in any scene) · **meta helpers**: `Z.shotById(id)`, `Z.renderShot(id, t, ctx)` (draw another shot's scene at time t), `Z.drawSceneAs(name, ctx, t, args, t0, t1)` (draw any scene as if it were a shot), `Z.stateFor(shot, t)`, `Z.activeShots(t)`.

Math/easing: `Z.clamp lerp inv remap smooth fract quant hex rgba mix3 TAU`, `Z.tween(t, t0, t1, a, b, ease)`, `Z.ease.{linear, in/out/inOut Quad|Cubic|Sine|Expo, outQuart, inQuart, outBack, inBack, outElastic, snap}` (`snap` = creep to 90 % over 85 % of the time, then snap). Several scene files also define CSS cubic-bezier curves (`EZ.out = bezier(.16,1,.3,1)` entrances, `EZ.in = (.7,0,.84,0)` exits).

## 5. Drawing toolkit (`Z.draw`, alias `D`)

- Framing: `D.cover(ctx, img, {zoom, x, y, rot}, alpha)` (x/y in −1..1 of the spare margin), `D.viewLerp(a, b, k)`, `D.shake(t, amp, fps=24, seed)`.
- Characters: `D.sprite(ctx, img, x, y, h, {anchor:[.5,1], rot, flip, sway, breathe, t, phase, alpha, wave:{amp, freq 2.2, speed 3.2, from .25, q}})` — `wave` is a hair-wind strip warp (keep `from` 0.25–0.4 so the face doesn't bend); `D.silhouette(…, color)`, `D.rim(…, color, [dx,dy])`.
- Light: `D.glow(ctx, x, y, r, color, a)` (additive radial), `D.disc`, `D.rays(ctx, x, y, n, len, color, a, t, seed)`.
- Particles (closed-form): `D.embers(ctx, t, {n 80, seed, area:[x0,y0,x1,y1], color '#FFA552', rise 120, size 3, alpha, wind})`, `D.fireflies({n 40, area, color '#DDFF7A', size 3, alpha})`, `D.rain({n 260, angle .18, speed 1900, len 60, color, width 1.4})`, `D.dust({n 70, color})`, `D.feathers({n 14, size, color, line})`.
- Glass: `D.crackNet(seed, cx, cy, n=22, reach=1100)` → cached polylines; `D.cracks(ctx, lines, prog, {glow, core, width, alpha})`.
- Type: `Z.FONT` = `mincho` Shippori Mincho B1 · `minchoHeavy` Zen Old Mincho · `tokumin` Kaisei Tokumin · `serif` Noto Serif JP · `gothic` Zen Kaku Gothic New · `dela` Dela Gothic One · `sans` Noto Sans JP · `hand` Klee One · `brush` Yuji Syuku · `dot` DotGothic16 (Noto Sans/Serif **SC** are also fetched for Chinese). `D.font(ctx, size, fam, weight)`, `D.vtext(ctx, text, x, yTop, {size, fam, weight, pitch, color, stroke, reveal, glow})` (縦書き), `D.htext(ctx, text, x, y, {size, fam, weight, color, stroke, glow, align, reveal, spacing, jitter, scaleIn})`. Await real weights in `init` (`document.fonts.load('800 100px "Shippori Mincho B1"', chars)`) so frame 0 never falls back.
- Overlays: `D.fill(ctx, color, a, comp)`, `D.vgrad(ctx, [[k, color]…], a, comp, rect)`, `D.halftone(ctx, rect, step, fn, color)`.

## 6. Transitions (`core/trans.js`; on the incoming shot: `trans: {type, dur, …}`)

| type | params | look |
|---|---|---|
| `cut` | — | hard cut (also the default with no `trans`) |
| `xfade` | — | sine crossfade |
| `flash` | `color '#FFF4DC'` | A brightens to colour, B emerges |
| `black` | — | dip to black |
| `iris` | `cx, cy, color` | B in a growing circle with a fading ring — match-cut circles (sun → lamp → 。) |
| `irisClose` | `cx, cy` | A shrinks into a circle |
| `barrier` | `px, py` | striped crossing arm sweeps down from a left pivot, wiping B in |
| `wipe` | `angle −0.35, color '#C8373A'` | diagonal hard wipe with a coloured edge |
| `slices` | `n 9` | horizontal slices slide in alternately |
| `push` | `dx −1, dy 0` | A slides out, B in |
| `zoom` | — | A scales up and fades, B scales in from 0.4 |
| `ink` | `seed` | B through growing organic ink blobs |
| `shatter` | `cx, cy, seed` | A breaks into triangles that fall away |

New: `Z.transition('name', (ctx, A, B, k, o) => {})` — draw the blend of canvases A, B at k∈[0,1]; `o` = the trans spec + `{t, W, H}`.

## 7. Post pass and LUTs (`core/gl.js`; per shot `post: {…}` or `post: S => ({…})`)

| param (default) | meaning |
|---|---|
| `boil` 1.2 px, `boilFps` 12 | hand-drawn line boil (low-freq displacement re-seeded 12×/s); 0 for clean typography shots |
| `lutA`, `lutB`, `lutBlend`, `lutMix` 0 | palette gradient map (luma → ramp), blend between two ramps, amount (残光 shots: 0.08–0.55) |
| `exposure` 0, `contrast` 1, `saturation` 1, `lift [0,0,0]`, `gain [1,1,1]` | grade (scene + fg) |
| `ca` 0 px, `beatCA` | radial chromatic aberration; `beatCA` adds `beatCA·pulse(t,9)` automatically |
| `textCa` 0 | horizontal RGB split on the text layer |
| `glitch` 0..1, `glitchSeed` | horizontal slice displacement (seed auto 24/s) |
| `zoomBlur` 0, `zoomCenter [.5,.5]` | radial zoom blur (14 taps) |
| `bloom` 0.35, `bloomThreshold` 0.72, `beatBloom` | bright pass + 3-level blur, added back — the bright pass keys on max(R,G,B), so at 0.72 every pixel of a blue sky or white cloud blooms and a daylight frame turns milky: on daylight plates use `bloom` 0.1–0.2, `bloomThreshold` 0.9–0.95, `beatBloom` ≤ 0.1, `vignette` ≤ 0.15 and no `exposure` pushes in `Z.globalFX` (e.g. `Z.LOOK_DEFAULT = { boil: 1.0, bloom: 0.15, bloomThreshold: 0.93, grain: 0.04, vignette: 0.1, lutMix: 0 }`) |
| `flash` 0, `flashColor [1,1,1]` | mix to colour (keep ≤ 3 full-frame flashes/s) |
| `invert` 0, `vignette` 0.35, `grain` 0.06 (re-seeded 24/s), `fade` 0 (to black), `letterbox` 0..1 (2.39:1 bars), `shake [x,y]` px, `textOpacity` 1 | finish |

LUT names: every palette in `assets/style/palettes.json` gets two rows — `P1`, `P1_duo` (also the full id `P1_oumagatoki`) … `P5` — plus hand-built ramps `night`, `ember`, `dawn`, `mono`, `day` (high-key daylight: navy → sky blue → white). The atlas is **256×16 rows** (`LUT_ROWS = 16`): 5 palettes × 2 + 5 ramps = 15; with more than 5 palettes raise `LUT_ROWS` and the LUT texture height (`gl.js`) and the atlas canvas height (`main.js`) together. The shipped `P1`–`P5` are 残光's dusk/night ramps: a high-key frame lives in the top third of the ramp, so `P1` turns a blue sky (luma ≈ 0.76) orange — build your own palettes for a bright film. Palette ids must look like `P<n>_<name>` (the short name is the part before `_`). New palettes: edit `PALETTES` in `tools/style_palette_sheet.py` and run it (writes `palettes.json`, OKLab-interpolated LUT PNGs and a contact sheet on a built-in dusk scene; `--plate assets/bg/<plate>.png` previews them on one of your own backgrounds instead); add ramps in `buildLutAtlas()` in `main.js`.

## 8. Scene library catalogue (`engine/scenes/*.js`, 24 scenes)

Shot ids refer to 残光's `examples/zanko/timeline.js`. The case study is in the kit repo only, not in the installed skill folder — online: https://github.com/EGSECDA/vocaloid-style-mv-pipeline/tree/main/examples/zanko (raw file: https://raw.githubusercontent.com/EGSECDA/vocaloid-style-mv-pipeline/main/examples/zanko/timeline.js). Reuse classes:
- **generic (args only)**: `illust`, `solid`, `jz`, `panels` (`gutterColor`, `keyline`), `burst` (`grade` knows only `'night2dawn'`), `ref`, `seq`, `converge`, `afterimage` (pass `text`/`sub`/`credit`/`color`/`char`), `memories`;
- **generic once the daylight args are set (bright films)**: `kanjiSlam` (`sky: 'day'` or a real `bg`; otherwise it paints a dusk or night sky), `typeCard` (`paper`, `quiet` mode);
- **reusable once you pass your strings**: `titleRiff` (`glyphs`, `ruby`, `sub`, `hud` — otherwise it slams 残 / 光 and prints 残光's HUD; its sun disc and dusk palette stay);
- **残光 set pieces** with hard-coded strings, glyphs or image landmarks (§10) — rewrite them for your film rather than re-skinning: `ember`, `tunnel`, `wetFloor`, `train`, `heart`, `skyShatter`, `thread`, `fall`, `flame`, `ink`, `road`.

Scene defaults are 残光 dusk colours (ink `#140B1E`, amber rims and glows `#FFA552`): pass your palette's colours.

**`scenes.js` — base**
| scene | what | args (defaults) | 残光 |
|---|---|---|---|
| `illust` | the workhorse: background with camera move + cut-out characters + fx | `bg`, `bgFrom {zoom 1.06}`, `bgTo {zoom 1.12}`, `bgEase 'inOutSine'`, `beatZoom`, `shake`; or `grad [[k,c]…]` / `color`; `tint [{color, a .5, comp 'multiply'}]`, `overlayGrad/overlayA/overlayComp`, `layers [{img, x,y,h, x2,y2,h2, anchor [.5,.5], alpha, rot, ease}]` (parallax cut-outs), `fxBack [...]`, `chars [...]`, `fx [...]`, `vignette` | 26 shots (s04, s05, s07–s11, s14, s17, s21, s26–s28, s30, s34–s36, s42, s47, s52b, s57, s58, s58b, s60, s62, s63) |
| `solid` | flat colour / gradient + optional embers/fireflies | `color` or `grad`, `embers {...}`, `fireflies {...}` | — |
| `jz` | full-frame JIZURA 文字PV (its own backgrounds) | `plan` | s13 |

`illust` char spec: `{img, x, y, h, x2, y2, h2, ease 'inOutSine', anchor [.5,1], flip, front (draw into S.fg), sway .012, breathe 1, phase, wave {amp 10, from .3, q 12} | false, q (koma fps), rim {color, off [7,−3]}, sil '#hex', shadow {a .5, dx 30, dy, color}, alpha, rot, in {at, dur .5, dx, dy, ds, rot, ease 'outExpo', alpha}, out {at, dur .4, dx, dy, ds, ease 'inExpo'}, beatBump, glowAt [fx, fy, fr] (fractions of h), glowColor, glowA}`.
fx specs (`fxBack`/`fx`, or `Z.fx`): `embers`, `fireflies`, `rain`, `dust`, `feathers` (options as in §5), `rays {x, y, n 18, len 1400, color, a .18, seed}`, `glow {x, y, r, color, a .8, beat}`, `cracks {seed, x, y, n 22, reach 1100, prog | at, dur 1.2, width, alpha, glow, core}`, `grad {stops, a, comp}`, `fill {color, a, comp}`, `custom {fn(ctx, S)}`. The 残光 timeline builds custom fx as small factories: long cast shadow, light sweeps (train windows), sinking sun with a 残光 ring, glyph-shaped firefly swarm, sound rings per beat, heart glow, falling tear, crossing lamps pinned to background coordinates (`bgPt(S, u, v)` maps image-normalised coordinates through the current cover view).

**`intro.js` — light that opens and closes the film** (helpers `Z.INTRO.post.<scene>(S)`, `Z.INTRO.black(S)`)
| scene | what | args | 残光 |
|---|---|---|---|
| `ember` | `breathe`: one ember breathing with the envelope, black micro-stops · `ignite`: ember → ring of fire on the low hit, beat rings, cracks · `collapse`: the dawn world implodes into one point | `mode`, `stops [[t0,t1]…]`, `flares`, `thumps`, `blackFrom`, `crackAt`, `ring 176`, `bg` (collapse), `keys`, `grain` | s01, s02, s65 |
| `titleRiff` | title sequence on the riff: sun disc, monument glyphs slam on accents, HUD corners, silhouette in the sun, lockup; `outro` variant recaps 8–12 earlier frames per beat | `variant 'intro'\|'outro'`, `recap [{bg, char, view, h, cy}]`, `char`, `sky`, `cues {sun, hud, zan, ko, split, sil, lock, exit}` (beat indices), `exit`, `final`, `glyphs ['残','光']` (the two slammed glyphs), `ruby ['ざん','こう']` (reading per glyph in the lockup; `false` = none), `sub 'afterglow'` (lockup line), `hud {title, when, bpm, geo, place, len}` (the six HUD corner strings; defaults are 残光's) | s03, s64 |
| `converge` | every motif spirals into one point → white-out | `seed`, `whiteAt` (default shot end) | s51 |
| `afterimage` | the negative of the title lockup fading on the retina + credit | `text '残光'`, `sub`, `credit`, `color '#39C6E0'`, `char` | s66 (end card) |

**`typo.js` — typographic set pieces** (`Z.typo.post.{kanjiSlam, typeCard, tunnel}`)
| scene | what | args | 残光 |
|---|---|---|---|
| `kanjiSlam` | monument kanji slammed per beat behind a singer, damped-spring camera kicks, ink/light speed lines, rim-lit character, optional fire | `glyphs ['救','って',…]` (one per beat), `char`, `bg`, `variant 'default'\|'night'\|'hand'`, `fire`, `sky 'sunset'\|'night'\|'day'` (set by the variant: `'sunset'`, or `'night'` for the `night` variant; `'day'` keeps the plate as painted — no dusk multiply, no low sun — and `Z.typo.post.kanjiSlam` then adds no palette LUT and little bloom), `skyGrad [[k, c]…]` (the `'day'` sky when `bg` is null; default a blue daylight gradient), any preset field (`charX/Y/H`, `face [fx,fy]`, `color`, `fam`, `weight`, `rim`, `slots`, `frames`, `wind`, `lines`) | s16, s38, s52, s56 |
| `typeCard` | `quiet`: one small mincho line typed in on black (or `paper`) with a vermilion hairline · `flicker`: glitching word per beat building to white | `lines`, `mode`, `size 42`, `fam 'mincho'`, `weight 500`, `color`, `paper` (background colour; default near-black; on a light paper the text defaults to ink and `Z.typo.post.typeCard` drops the bloom; `flicker` is additive light, keep its paper dark), `ruleColor` (hairline colour, default vermilion), `vertical`, `rule`, `sub`, `lead .1`, `stagger`, `fade .6`, `gap .36`, `x`, `y` | s29, s37 |
| `tunnel` | one-take push through rings of lyric text (beats 1 & 3), dial and Latin rings, toward a light that blooms | `words [5]`, `plan [[t, word]…]`, `toward 'dawn'`, `f 820`, `v0 3.1`, `v1 9.5`, `fadeIn`, `reveal` | s61 |

**`glass.js` — glass heart and shattering sky**
| scene | what | args | 残光 |
|---|---|---|---|
| `heart` | `shatter`: radial fracture, slow-motion burst · `gather`: shards drift back into her hands (fireflies if the bg says so) · `burn`: shards on fire · `sun`: embers and shards spiral into a reborn sun | `mode`, `heart`, `char`, `bg`, `breakBeat`, `x 960`, `y 470`, `charX/charY/charH`, `n 24`, `fuseBeat 2`, `sunX/sunY/sunR` | s18, s19, s40, s53, s54 |
| `skyShatter` | the painted sky cracks and falls away in bands per beat, revealing night; silhouette figure | `bg`, `char`, `night '#070b1c'`, `seed`, `impact`, `releaseBeat 1`, `bands 5` | s39 |

**`dark.js` — night-side set pieces** (12 fps drawn motion)
| scene | what | args | 残光 |
|---|---|---|---|
| `thread` | wrist ribbon unravels into one travelling thread toward a far light; holds on the stop, whips on the accent | `hand`, `light [x,y]`, `stops`, `kickAt`, `arriveAt`, `handX/Y/H/Rot` | s06 |
| `fall` | falling toward a square of dawn; light streaks; time-freeze on audio stops | `char`, `freeze [[t0,t1]]` (default: stops in the shot), `pulse`, `vp [x,y]`, `speed`, `h` | s12 |
| `flame` | cupped hands with a breathing flame (`breathe`/`grow`), or a face lit from below (`dark`) | `mode`, `img`, `face`, `stops`, `flameAt`, `zoomAt`, `zoomTo`, `igniteAt`, `faceAt`, `facePos` | s15, s31, s50 |
| `ink` | sumi tendrils curl around her in a pale fog void, lurching per beat | `char`, `seed 7`, `h`, `x 960`, `y 992` | s46 |

**`night.js` — rain, wet floor, passing train** (`Z.night.post.{fall, count, train}`)
| scene | what | args | 残光 |
|---|---|---|---|
| `wetFloor` | `fall`: glowing words fall like drops (one landing per beat), splash, perspective ripples · `count`: top-down puddle, one drop per beat, DotGothic counter + HUD | `mode`, `bg`, `words`, `spots`, `heroSpot`, `lead`, `heroAt`, `from`/`to` views, `shimmer`, `hudColor`, `hudAlpha` | s24, s25 |
| `train` | night crossing, lamps alternating per beat, a train strobes through with her images in lit windows, freezes on the stop, leaves streaks | `bg`, `chars`/`windowChars`, `freeze [t0,t1]`, `exitAt`, `side`, `hero`, `heroX`, `cars`, `shutter .5`, `taps 7` | s33 |

**`memory.js`**
| scene | what | args | 残光 |
|---|---|---|---|
| `memories` | faded polaroids drop onto a desk on beats, captions write themselves (Klee One), window light leaves, prints burn from the edges; the photo with her burns last | `photos [{bg, caption, date, view, char}]`, `char`, `charIn`, `order`, `dropBeats [0,2,4,6,7,8]`, `burnBeats`, `pushAt`, `endZoom 1.9`, `seed 45` | s45 |
| `road` | `tear`: a glass tear falls in slow motion, splash, a line of light races to the horizon, the road of light opens · `run`: tracking shot of her running on the glowing road, slow-mo, freeze | `mode`, `char`, `impact`, `horizon`, `open`, `dolly` (default: beats 3/6/8/12 after the shot start), `slowAt`, `freezeAt`, `freezeStyle 'photo'` | s48, s49 |

**`meta.js` — scenes about other shots** (private buffers per nesting depth)
| scene | what | args | 残光 |
|---|---|---|---|
| `panels` | manga コマ割り: slanted ink gutters, staggered 8th-note openings, per-beat punch-ins, collapse into one panel | `panels [{bg\|img, view, viewTo, char, charX/Y/H, flip, tone, lines 'focus'\|'speed', punch, alt, lamps, tint, fx, fxBack, illust:{…}}]`, `collapseAt`, `hero`, `gutter 22`, `margin 22`, `gutterColor`, `keyline`, `openAt`, `openDur .36`, `order`, `layout`, `collapseDur .2`, `collapseZoom .045`, `shake 7` | s20, s41 |
| `burst` | one composed mini-shot per beat: framing, character pop, smear, flash, speed lines; optional night→dawn grade | `cuts [{bg, view, viewTo, char, charX/Y/H, flip, rim, tint, dir, lamps}]`, `every 1`, `lead 1/30`, `flash 'alt'\|'all'\|'none'\|[k…]`, `flashColor`, `speed`, `grade null\|'night2dawn'`, `roll .018` | s55, s59 |
| `ref` | re-renders another shot: `freeze` (desaturate, crack, split), `rewind` (VHS, OSD), `melt` (columns drip, cool to blue) | `shot`, `mode`, `at`; freeze: `live`, `crackAt`, `crackXY`, `crackAngle`, `desat .88`, `push`, `jitter`, `split 8`; rewind: `span 3`, `from`, `follow`, `hold .1`, `fps 15`, `osd`; melt: `meltAt`, `meltEnd`, `cols`, `depth`, `drip`, `seed`, `rate` | s22, s43, s32 |
| `seq` | Blender image sequence in sync with song time | `pattern 'blender/renders/A/f_####.jpg'`, `t0` (shot t0), `fps 30`, `frames`, `offset 0`, `rate 1`, `view`, `prefetch 2`, `overlay {leak, flash, letterbox, introFlash, vignette, grade}` | s23, s44 |

## 9. Writing a new scene

```js
/* scenes/rain_glass.js — 'rainGlass' {bg, char, drops=60, seed=5}: drops run down a window over a blurred city, she is behind the glass */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease, W = 1920, H = 1080;
  const cache = new Map();                                   // immutable art only, keyed by args
  const blurred = (path) => { let c = cache.get(path); if (c) return c;
    const img = Z.imgSync(path); c = Z.canvas(W / 4, H / 4); const x = c.getContext('2d');
    x.filter = 'blur(6px)'; x.drawImage(img, 0, 0, W / 4, H / 4); cache.set(path, c); return c; };
  Z.scene('rainGlass', {
    preload: a => [a.bg, a.char].filter(Boolean),
    init: async () => { await document.fonts.load('700 100px "Shippori Mincho B1"', '雨'); },
    draw(ctx, S) {
      const a = S.args, t = S.t, n = a.drops ?? 60, seed = a.seed ?? 5;
      ctx.drawImage(blurred(a.bg), 0, 0, W, H);                                      // background (cached blur)
      const zoom = 1 + 0.015 * S.clock.pulse(t, 8);                                  // camera: full time + beat breath
      if (a.char) Z.drawChar(ctx, S, { img: a.char, x: 960, y: 1100, h: 1000 * zoom, sil: '#140B1E', rim: { color: '#9CC2C0' } });
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {                                                  // closed-form drops: pure function of t
        const life = 2 + 3 * Z.rnd(i, seed), k = Z.fract((t + Z.rnd(i, seed + 1) * life) / life);
        const x = W * Z.rnd(i, seed + 2), y = -40 + (H + 80) * E.inQuad(k);
        D.glow(ctx, x, y, 10 + 8 * Z.rnd(i, seed + 3), '#BFD4FF', 0.5 * Math.sin(Math.PI * k));
      }
      ctx.restore();
      const tq = S.tq;                                                               // drawn element on 12 fps
      if (S.lt > 0.5) D.vtext(S.fg, '雨', 1650, 180, { size: 140, color: '#F4EFE6', reveal: Z.clamp((tq - S.shot.t0 - 0.5) / 0.4) });
    },
  });
})();
```
Then: add `<script src="scenes/rain_glass.js"></script>` to `index.html` **and** `vertical.html`; write a test timeline; render stills; **look at them**; iterate.
```js
// engine/tests/rain.js
(() => { const Z = window.Z; Z.setup = async () => {
  Z.LOOK_DEFAULT = { boil: 1.1, bloom: 0.3, grain: 0.05, vignette: 0.3 };
  Z.SHOTS = [{ id: 'x', t0: 62.53, t1: 66.26, scene: 'rainGlass', lyric: 'none', args: { bg: 'assets/bg/bg_wetstreet.png', char: 'assets/char/back_sunset.png' } }];
  window.__zankoMeta.duration = 66.26; }; })();
```
```bash
node tools/stills.mjs --url "engine/index.html?tl=tests/rain.js" --times 62.6,63.4,64.8,66.0 --out render/tests/rain --sheet rain
node tools/render_frames.mjs --url "engine/index.html?tl=tests/rain.js" --start 62.5 --end 66.2 --mode blob --out render/tests/rain.mp4 --audio audio/song.wav
```
Use the real song times the scene is meant for (beats, stops and lyric onsets then line up). `stills.mjs` prints ms per frame and any page errors. Checklist for a new scene: renders identically when entered mid-shot (render one still at `t0+2` in a fresh page and compare with the clip), < 40 ms per frame, drawn motion on 12 fps, beat-locked accents on real beats, fonts loaded in `init`, no text over the face (or use `S.fg` + a centre-free lyric plan), header comment documenting args.

## 10. Porting checklist (song-specific constants)

The library was written for 残光; before reusing a scene with new assets, check:
- `core/main.js`: default `__zankoMeta.duration` (224.32) — set it in your timeline.
- **Image-pixel landmarks** tied to specific PNGs: `dark.js` `HR` (hand_reach pivot/ribbon tail), `FALL` (fall pivot/ribbon), `FLAME_AT` (flame core per image — or pass `flameAt`); `glass.js` kneeling-pose anchor points (chest shard, picking hand); `night.js` `WET` (horizon/vanishing point of bg_wetstreet), `FALL_HERO`, `LAMPS`/`ARM_LAMPS` (lamp lenses on bg_crossing_night); `meta.js` crossing-lamp positions; `memory.js` face position in turn_smile; `typo.js` `SLAM` presets (`face`, `charX/Y/H`). Measure the new image's pixels and override.
- **Hard-coded 残光 literals (not args — edit the file or write your own scene)**: `ember`'s typed '残光 / ZANKŌ' (`intro.js`); `tunnel`'s `LATIN` rings and railway crossbucks (`typo.js`); `wetFloor count`'s 23:41 timecode and 'RAIN 7.5mm/h 水面観測' (`night.js`).
- **残光 defaults you override with args**: `titleRiff` `glyphs` (残 / 光), `ruby` (ざん / こう), `sub` ('afterglow') and `hud` (title, DUSK / DAWN line, BPM 131, coordinates, 踏切 No.7, 03:44); `ember` `stops`, `flares`, `thumps`, `crackAt` (残光 intro micro-stops — pass from `audio.stops`); `train` `freeze [116.76,116.93]`, `exitAt 117.85`; `tunnel` words; `typeCard` default line and black paper; `kanjiSlam` dusk sky (`sky`); `afterimage` `text` / `sub` / `credit` / `color`; default asset paths (`assets/char/REF_master.png`, `bg_sky.png`, …) everywhere.
- The timeline's `Z.VERTICAL_CFG` (08 §5): `full` shot ids, `planMap`, header `title` / `sub` / `artist` (the template passes `Z.TITLE`, `Z.TITLE_SUB`, `Z.ARTIST`), `credits: [t0, t1]` (when the header and the `Z.CREDIT` footer show), `schemes` (lyric schemes of the 9:16 plans, default `'dark'`) and `ambience` (`[r, g, b]` tint over the blurred 9:16 surround, default `[10, 6, 18]`). Fields you leave out fall back to the 残光 values in `vertical.js` (`full` s01–s03 s64–s66, credits 17.6 s → 223.54 s).
- The timeline's `Z.hud` and `Z.globalFX` (flash list, chorus windows).

## 11. Pitfalls

- A character with `front: true` is drawn into the scene layer during transitions (no fg canvas then), so the lyric briefly passes in front of her — keep transitions into text-behind shots short.
- `lyric: 'full'` covers the scene with JIZURA's backgrounds; during gaps without a lyric it can show an empty frame — use an illustrated shot there.
- Typographic scenes (slams, cards, tunnel, title, end card) need `lyric: 'none'` or the JIZURA layer doubles the text.
- `ctx.filter` blur on full-frame canvases, per-frame `getImageData`, or rebuilding art every frame → 100+ ms frames. Cache.
- Unseeded randomness or state carried across frames → flicker at the 3 worker seams (frames 1/3 and 2/3 of the film).
- Fonts not awaited in `init` → frame 0 or the first frame after a seek renders with a fallback font.
- `Z.scratch` used across an `await` (e.g. inside an async `seq` draw) gets overwritten by another draw.
- Boil on clean typography looks dirty: `post: { boil: 0 }` for type cards and end cards.
- More than 5 palettes → LUT rows overflow the 16-row atlas silently (§7: 2 rows per palette + 5 ramps). A misspelt `lutA` name also fails silently (falls back to row 0 = the first palette).

---
Author: **NikusonP** · vocaloid-style-mv-pipeline (MIT)
