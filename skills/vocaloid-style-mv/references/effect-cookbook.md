# Effect cookbook — a menu to recombine, not a look

Contents: 0 How to use this menu · 1 Timing conventions · 2 Palette system · 3 Typography system · 4 Recipes (T type · B character · K camera · L light & colour · E editing & transitions · F texture · G particles & motifs) · 5 Safety · 6 Anti-patterns

Condensed from the 残光 style bible ([examples/zanko/STYLE_RESEARCH.md](https://github.com/EGSECDA/vocaloid-style-mv-pipeline/blob/main/examples/zanko/STYLE_RESEARCH.md) in the kit repo — not inside the installed skill; 94 recipes with GLSL/JS sketches). Every recipe names the **existing engine hook** where there is one (05-engine.md), otherwise a 1–3 line implementation. The 残光 examples (railway crossing, sunset, embers) are *instances*: re-skin each recipe with your own song's motifs — the crossing lamps become a lighthouse, a metronome, a hospital monitor; the barrier arm becomes a shoji door, a page turn, a falling curtain.

---

## 0. How to use this menu

1. From the concept (02-creative-direction.md) pick **3–5 master motifs** with one meaning each (残光: circle = light/memory; crack/shard = the broken sky and heart; a vermilion thread = her ribbon). At most **3 motifs per shot**.
2. Pick recipes that *express* those motifs; skip the rest. A recipe used once with intent beats ten used as decoration.
3. **Budget outside the climaxes: one screen effect + one decoration per shot.** Grain and paper/boil stay on all the time — they glue AI art, procedural graphics and 3D into one film.
4. **Escalate by section**: each section unlocks new tools; the last chorus brings back chorus-1 ideas "on fire" plus one move nobody has seen yet. Keep **≥ 3 full holds** (≥ 2 bars, almost no motion) — stillness is what makes the bursts read.
5. **Transitions come from inside the scene** (a circle in shot A becomes the circle of shot B; a barrier, a train or a page wipes the frame).
6. End on an idea, not a fade.

## 1. Timing conventions

- **Koma (drawn cadence)**: drawn things (characters, type reveals, line boil, loops) on **2s** = 12 fps (`Z.quant(t, 12)`, `S.tq`, char `q: 12`) or 3s = 8 fps for tired, dragging moments; camera, light, particles and grain on 1s (full rate). Switching drawn layers from 12 to full rate on a chorus downbeat makes the motion "open up".
- **Beat sync**: always real `beats[]`/`downbeats[]` (tempo drifts; 03-audio-and-lyrics.md). Cuts land on the beat frame or one frame before it; flashes *on* the beat frame; lyrics appear 0.1–0.2 s before the vocal onset (JIZURA `typeset` does 0.2 s); a stroke-order write-on *finishes* on the onset; the hook starts on its pickup and the visual hit lands on the downbeat.
- **Easing presets**: expo-out `cubic-bezier(.16,1,.3,1)` for entrances, expo-in `(.7,0,.84,0)` for exits, sine in-out for camera drifts, `back-out(1.4–1.7)` for pops, **hold-to-snap** (`Z.ease.snap`: 90 % over 85 % of the time, then snap) for impacts, **stepped ease** (ease, then quantise time to 12 fps) for a drawn feel.
- **Determinism**: every generator is `f(t, seed)`; feedback effects (afterimage buffers, slit-scan) need pre-roll frames when a worker starts mid-film.

## 2. Palette system

**Roles** (one palette = one mood; 6–8 colours): `ink` (darkest, used for line colour instead of black) → `shadow` → `mid` → `accent` (≤ 8 % of frame area except キメ frames) → `hot` → `glow` (additive light) → `highlight`; plus an **afterimage** colour (the complement of the glow, for negatives and ghosts) and a **duotone pair** (ink ↔ glow, contrast ≥ 7:1 for type). The gradient-map stops must rise monotonically in luminance.

The five 残光 palettes, as a worked example of a colour script (dusk → night → alarm → blue hour → memory):

| id | name / use | gradient map (dark → light) | accent · afterimage |
|---|---|---|---|
| P1 | 逢魔が時 magic hour — title, choruses, peaks | `#140B1E #3A1745 #7A2350 #C8373A #F0663A #FFA552 #FFE3B0` | `#C8373A` · `#39C6E0` |
| P2 | 残照 lingering glow vs night — verses (split tone) | `#0B1524 #1E3552 #3F6284 #D8542A #F4A640 #E9D9B8` | `#D8542A` · `#2F7BD9` |
| P3 | 踏切 crossing alarm — tension (posterised tritone) | `#0A0A0C` < .39 ≤ `#E5102E` < .71 ≤ `#F3F1EA` (+ caution `#FFC21A`) | `#FFC21A` · `#00E0C8` |
| P4 | 蛍火 blue hour + fireflies — quiet, bridge, after | `#050F16 #0C2233 #17405A #2F6B6A #9BD86A #DDFF7A #F6FFE0` | `#DDFF7A` · `#C04BD8` |
| P5 | 褪色 faded photograph — memory, flashbacks | `#241C1A #4A3B35 #7D6A5E #B79C8B #D8C7AE #EFE6D6` (+ shadows → `#9CC2C0`, highlights → `#C98D86`) | `#C98D86` · `#6FA9A6` |

Global neutrals: flash white `#FFFFFF` (1-frame flashes only), sumi `#111014`, paper `#F4EFE6`. Engine extras: `night`, `ember`, `dawn`, `mono` and the high-key `day` ramps.

**Make your own** (every film — P1–P5 are 残光's dusk/night ramps): edit `PALETTES` in `tools/style_palette_sheet.py` (`id 'P1_name'`, `roles`, `gradmap [[k, hex]…]`, `duotone`, `accent`, `afterimage`), run `python tools/style_palette_sheet.py` → `assets/style/palettes.json`, OKLab-interpolated 256×1 LUTs (`luts/<id>.png`, `<id>_duo.png`) and `docs/style_palettes.png` (look at it; it previews on a built-in dusk scene, `--plate assets/bg/<plate>.png` previews on one of your own backgrounds instead). In shots: `post: { lutA: 'P2', lutMix: 0.25 }`; cross-blend `lutA/lutB/lutBlend`. ≤ 5 palettes fit the 16-row LUT atlas (two rows each, gradient map + duotone, beside the five built-in ramps).

**Daylight palettes** (high-key): a sunny plate lives in the top half of the ramp (luma 0.55–1.0), so put ≥ 3 stops above 0.6 and the sky hue at 0.65–0.85; a dusk ramp maps that range to orange and cream. Ink = deep navy or teal, never black. Accent = one saturated warm colour (coral, red, sunflower). Example (all three rise monotonically in luminance):
- `P1_mahiru` 真昼 noon: `[[0,'#0E2A47'],[.30,'#1F5E8C'],[.50,'#2C8FC4'],[.68,'#6CC4F0'],[.84,'#BFE8FA'],[.94,'#FFF6D6'],[1,'#FFFFFF']]`, accent `#FF5A3C`, afterimage `#3CB4FF`
- `P2_nami` 波 sea: `[[0,'#06222E'],[.28,'#0B4F63'],[.50,'#138A8F'],[.70,'#3CC6C0'],[.88,'#9BEBD8'],[1,'#E8FFF6']]`
- `P3_yuunagi` 夕凪 evening calm: `[[0,'#2A1838'],[.25,'#6A2E5A'],[.48,'#C9506A'],[.68,'#FF8C5A'],[.86,'#FFC77A'],[1,'#FFF1D0']]`

Keep `lutMix` 0.08–0.25 on daylight plates. The rest of a bright film's settings (bloom, lyric schemes, fx colours): 02-creative-direction.md §13.

**Choreography rules**: one palette per shot; palette changes on cuts or through a *motivated* scrub (sunset, a lamp switching on); inversion is motivated (the retina after a bright event), never random; line colour = the palette's ink, pure black only for hard-cut black frames; `lutMix` 0.1–0.35 pulls AI art into the palette without flattening it.

## 3. Typography system

| role | fonts in `engine/fonts` (Z.FONT key) | carries |
|---|---|---|
| R1 Monument (huge single kanji, title) | Zen Old Mincho 900 (`minchoHeavy`), Kaisei Tokumin 800 (`tokumin`) | 110–160 % frame height, cropped (見切れ); one per shot |
| R2 Lyric mincho (default voice) | Shippori Mincho B1 500–800 (`mincho`), Noto Serif JP variable (`serif`) | feeling: verses, vertical lines |
| R3 Lyric gothic (impact) | Dela Gothic One (`dela`), Zen Kaku Gothic New 700/900 (`gothic`), Noto Sans JP variable (`sans`) | slams, alarms; weight animation |
| R4 Hand (memory, inner voice) | Klee One 400/600 (`hand`), Yuji Syuku brush (`brush`) | captions, diaries, one brush word |
| R5 Signal (LED, station, HUD) | DotGothic16 (`dot`) | counters, timecode, HUD |
| R6 Ruby / small annotation | Zen Kaku Gothic New 500, Noto Sans JP 500 | ruby at 0.45–0.5 em, credits |
| Chinese lyrics | Noto Sans SC / Noto Serif SC variable | same roles |

Scale at 1080p: monument 1200–1700 px · hero word 200–300 · horizontal lyric 96–120 (leading 1.35) · vertical lyric 84–104 (column pitch 1.6 em) · secondary/English 38–44 · HUD 20–24 at 60–70 % opacity. Particles (は が を に の も…) at 72–80 % of the line size; line-initial character 115–130 %. **≤ 3 families per section, ≤ 2 weights per shot; never synthesise bold/italic for CJK** (load the real weight). Title-safe 90 % for readable lyrics; 縦書き for verses and introspection, 横書き for choruses, a vertical × horizontal cross for キメ frames; centre-free bands (JIZURA `centerFree`) when the face is the point. Main lines stay ≥ max(0.7 s, 0.09 s × characters). Vertical text in Canvas2D: rotate ー―…〜（）「」 90°, move 、。 to the upper right (+0.5 em, −0.5 em), nudge small kana (+0.1 em, −0.1 em) — `D.vtext` handles the basics.

## 4. Recipes

Each row: recipe · what the viewer sees · how (engine hooks in **bold**). IDs follow `STYLE_RESEARCH.md`; T21–T22, B14, K12–K13, E16–E17 and G11–G13 are additions that map directly onto library scenes.

### T · Typography & lyric motion
| recipe | look | how |
|---|---|---|
| T01 一画ずつ stroke-order write-on | the character writes itself, then settles into the font glyph | KanjiVG strokes (CC BY-SA, credit it) as `Path2D`, `setLineDash([drawn, len+1])` per stroke, 60–120 ms/stroke; crossfade 3 frames to `fillText`. Last stroke ends on the vocal onset |
| T02 一文字ずつ per-mora pop | glyphs pop in (0 → 1.12 → 1, y +8 %) with a stagger | per-glyph `backOut(1.4)` over 4–6 frames on 12 fps; stagger from `lyrics.json chars[].start` |
| T03 巨大一文字 monument kanji | one kanji at 110–160 % height, cropped, a wall not a word | **`kanjiSlam`** (one glyph per beat, spring kicks; `sky: 'sunset'`\|`'night'`\|`'day'`), `titleRiff` (`glyphs: [first, second]`); or a glyph mask filled with the scene (`source-in`) |
| T05 縦書きの滝 vertical cascade | columns slide down into place right to left | `D.vtext` per column, expo-out 10 frames, columns staggered by 8th notes |
| T07 細→太 weight bloom | a word grows from hairline to black while held | variable Noto Serif/Sans JP: `ctx.font = (100+800·e) + " 120px 'Noto Serif JP'"`, re-centre each frame |
| T08 文字化け→解読 scramble decode | random glyphs resolve left to right into the line | pool of theme kanji + kana, cycle at 12 fps, resolution front `p·(n+2)−2` (used in `titleRiff` HUD) |
| T09 語ごとスラム word slam | words slam in 3 → 1 in 2 frames with a 1-frame flash and shake | anticipation (0.97 the frame before), overshoot 0.98 → 1, `post.zoomBlur` on the slam frame |
| T13 残像文字 afterimage type | leaving words keep a complementary ghost that drifts and fades | draw the outgoing word in the palette's `afterimage` colour, offset 1–2 px, alpha `e^(−lt/1.2)` on the text layer |
| T14 灰になる文字 ember dissolve | a glyph burns from one edge into rising embers | rejection-sample 400–1500 points in the glyph mask; points behind a noisy burn front become `D.embers`-style particles |
| T15 断ち割り split kanji | a slash cuts the glyph; halves slide apart revealing the next word | clip with two half-planes, ±6 % along the normal, expo-out; 3-frame additive cut line |
| T17 柱・ノンブル HUD meta-type | tiny corner type: timecode, bar counter, section, ♩= | **`Z.hud(ctx, S)`** in the timeline (DotGothic16, 50 % opacity, beat tick squares) |
| T19 カラオケ塗り karaoke fill | ghost line pre-shown, fill sweeps per mora | outline + fill layers, fill clipped by a rect whose edge follows `chars[].start` with a 6 px feather |
| T21 quiet card | one small line on black, nothing else, silence | **`typeCard` mode `quiet`**, `post: {boil: 0}`; `paper` (background colour) + `ruleColor` for a paper-white or sky-coloured card |
| T22 lyric tunnel | the camera flies through rings of lyric text toward a light | **`tunnel`** (line rings on beats 1 & 3, crossing time = onset) |

### B · Character & illustration (budget idioms)
| recipe | look | how |
|---|---|---|
| B01 一枚絵カメラ multiplane | one illustration feels like a camera move | **`illust`** `bgFrom/bgTo` + `layers` (parallax cut-outs: `offset/z`), slow push 1.00 → 1.08 over 8 bars |
| B02 線ゆれ line boil | contours re-traced every other frame | **`post.boil`** 0.7–1.6 px at 12 fps (8 fps when dragging); 0 on clean typography |
| B07 逆光シルエット rim silhouette | ink-dark figure with a glowing sun-side rim | char `sil: '#140B1E'` + `rim: {color, off}`; rim `+0.3·pulse` in choruses |
| B08 目・手・口 extreme close-ups | eye, hand, mouth — one per beat | dedicated close-up generations; cut per beat for 1–2 bars, then hold |
| B09 揺れもの hair & ribbon sway | strands lag and overshoot | char `wave {amp, from 0.25–0.4, speed, q: 12}`; bigger `amp` in choruses (30+) |
| B12 影の独立 independent shadow | the long shadow lags a beat and acts on its own | silhouette skewed onto the ground plane (`ctx.transform(1,0,skew,−len,…)`), track delayed by exactly 1 beat (残光 `longShadow` fx) |
| B13 拍ポーズ pose-per-beat | 4–8 key poses switch on beats with zoom kicks | **`burst`** (one composed mini-shot per beat), or char `in` per beat; 2-frame smear between poses |
| B14 text behind the singer | the lyric passes behind her body | char `front: true` (foreground layer) + a centre-free lyric plan |

### K · Camera & space
| recipe | look | how |
|---|---|---|
| K01 拍ズーム beat zoom | a tiny push every beat, bigger on downbeats | `illust` **`beatZoom`** 0.008 (verse) – 0.03 (chorus); `1 + a·pulse(t,12)` |
| K02 クラッシュズーム crash zoom | violent 3-frame zoom with radial blur | scale 1 → 1.6 over the last 3 frames before a downbeat, `post.zoomBlur` peaking 0.3 |
| K03 ダッチ振り dutch swing | horizon tilts ±4–8°, flips per bar | rotate about centre with hold-to-snap, 6 % overscan (`bgFrom/bgTo.rot`) |
| K04 手持ち handheld drift | slight organic float, never shaky-cam | `Z.fbm1(t·0.35, seed)·A`, A = 0.2–0.5 % of height; roll 0.3°; full frame rate |
| K12 kick shake | the frame jolts only on kicks | **`Z.globalFX`**: `P.shake = rnds(q)·5·env.low(t)^3` during choruses only (on 12 fps) |
| K13 3D camera travel | flythroughs, orbits, crane-ups | Blender sequence via **`seq`** (07-blender-3d.md) |

### L · Light & colour
| recipe | look | how |
|---|---|---|
| L01 gradient-map grade | every source recoloured into one ramp | **`post.lutA/lutMix`**; `lutB/lutBlend` scrubs; duotone rows `P1_duo` |
| L02 motivated inversion | the negative for a frame/beat after a bright event | **`post.invert`** on downbeats only, ≤ 2/s |
| L03 補色残像 negative afterimage | a complementary ghost stays where a bright thing was | static: **`afterimage`** scene (the title lockup's negative); dynamic: max-decay accumulation FBO of bright pixels, draw the complement where light is gone, retention `0.02^(1/(fps·s))`; needs pre-roll |
| L04 光漏れ light leak | warm blobs bleed in from an edge | fbm radial gradients screened at the edge (`seq` `overlay.leak`) |
| L06 光芒 god rays | shafts from a low sun | cheap: **`D.rays`** / fx `rays`; real: radial sampling of an occlusion mask (64 taps, normalised, decay 0.965) |
| L07 bloom | soft wide glow on lamps, embers, white type | **`post.bloom`** 0.3–0.7, `bloomThreshold` 0.6–0.9, `beatBloom`; the bright-pass keys on max(R, G, B), so daylight plates need `bloom` 0.1–0.2 and `bloomThreshold` 0.9–0.95 or the whole sky blooms |
| L08 time-of-day scrub | golden hour → blue hour continuously; lamps switch on | one `alt(t)` curve drives `lutBlend`, sun y, shadow length and lamp thresholds |

### E · Editing & transitions
| recipe | look | how |
|---|---|---|
| E01 cut grammar | a rhythm felt, not noticed | chorus shots 0.9–2 s, verse 2.5–5 s (at 160+ BPM think in beats: chorus shots of 2–4 beats); cut on `nb(onset)` / `B(n)` |
| E02 flash frame | 1 frame white, 1 at 40 % | **`post.flash`** / `Z.globalFX` list of big downbeats; trans `flash` |
| E04 stutter & freeze (止め) | the last frames repeat, then freeze while grain keeps moving | **`ref` mode `freeze`** (desaturate, crack, split), `fall` `freeze` windows from `audio.stops` |
| E05 コマ割り manga panels | 2–4 slanted panels, staggered openings, collapse | **`panels`** |
| E06 circle iris / match cut | sun → lamp → 。 → firefly cut on identical position and size | trans **`iris`** `{cx, cy}` at the shared circle; `irisClose` |
| E07 墨ワイプ ink wipe | ink blooms outward revealing the next shot | trans **`ink`** |
| E10 暗転 smash to black | hard black at a vocal break or the dead stop | trans **`black`**, `post.fade` 1 on stop frames (`Z.INTRO.black`) |
| E11 barrier wipe | a striped arm swings down and wipes the next shot in | trans **`barrier`** (re-skin: door, page, curtain) |
| E12 train pass | a train strobes through; windows show the next scene | **`train`** scene; window pitch so windows pass on 8th notes |
| E16 rewind / melt | the previous shot rewinds (VHS) or melts down | **`ref` modes `rewind`, `melt`** |
| E17 shatter | the frame breaks into falling shards | trans **`shatter`**; `skyShatter` scene for a painted sky |

### F · Texture & finish
| recipe | look | how |
|---|---|---|
| F01 grain + vignette | living film grain, soft falloff — the glue | **`post.grain`** 0.05–0.09 (re-seeded 24/s), `post.vignette` 0.25–0.6 (daylight: grain ≈ 0.04, vignette ≤ 0.15 — a dark falloff reads as dusk) |
| F02 paper | drawing-paper tooth under everything | baked fbm + fibres, multiply / soft-light 20–50 %, offset jumps on cuts (`meta.js` paper texture) |
| F03 halftone | manga screentone dots | `D.halftone(rect, step, fn)`; dot pitch 8 → 12 px on downbeats |
| F04 chromatic aberration | red/blue fringes toward the edges | **`post.ca`**, `beatCA` 1.5–5 in choruses; `textCa` on the text layer |
| F07 slice glitch | horizontal slices jump for 1–3 frames | **`post.glitch`** 0..1 driven by a snare onset or a decaying spike at a bar |
| F12 コマ打ち posterise time | drawn layers step at 12/8 fps, camera smooth | `Z.quant(t, 12)` before evaluating a layer; never quantise camera or grain |

### G · Particles & motifs (closed-form, deterministic)
| recipe | look | how |
|---|---|---|
| G01 火の粉 embers | sparks rise, flicker, cool white → amber → red | **`D.embers` / fx `embers`** `{n, area, color, rise, size, wind}`; more and windier per section |
| G02 蛍 fireflies | slow chartreuse points swelling and fading | **`D.fireflies`**; flash once per bar, phases converging until all flash on the last downbeat |
| G03 光の塵 dust in light | drifting specks in light shafts | **`D.dust`** (+ `rays` behind) |
| G04 alternating lamps | two lamps alternate per beat with bloom | small elements only; beat index parity → which lamp (残光 `lamps` fx, `train`, Blender shot B) |
| G13 feathers / petals | drawn shapes falling | **`D.feathers`** `{n, size, color, line}` (two layers: light and ink) |
| G07 rings per beat | concentric arcs from a speaker, a mouth, a lamp | stroked arcs, radius ∝ age, alpha 1 − age/1.8, one per beat (残光 `soundRings`) |
| G11 rain | streaks + splashes | **`D.rain`** `{n, angle, speed, len}`; **`wetFloor`** for words falling into puddles |
| G12 cracks | glowing fracture lines spreading from an impact | **`D.crackNet` + `D.cracks`** / fx `cracks {at, dur}`; `heart` for a breaking object |

## 5. Safety (photosensitivity, ITU-R BT.1702 spirit)

- ≤ 3 full-frame luminance flashes per second. Count in beats: at ~130 BPM 8th-note flashing (≈ 4.3/s) is too fast — quarter notes at most, for ≤ 2 bars; at ≥ 150 BPM quarter notes are already 2.5–3/s, so flash on half notes at most, for ≤ 2 bars. Per-beat cut scenes (`kanjiSlam`, `burst`) change the frame on every beat — at fast tempos use `burst` with `every: 2` and keep `kanjiSlam` to ≤ 2 bars.
- No saturated-red full-frame flicker; strobe lamps as small elements (< 10 % of the frame).
- Fast-moving high-contrast stripes, rings or spirals < 25 % of the screen.
- Keep the luminance jump between consecutive burst cuts < 50 %; subliminal inserts ≤ 1 per 4 bars.
- Let one place own full-frame flashes (the post pass / `Z.globalFX`), and switch JIZURA's own flashes off (`fx.flash: false`).

## 6. Anti-patterns

- Preset glitch on every beat; effects on the hi-hat (accent the vocal, not the percussion grid); constant camera shake.
- Rainbow or unmotivated colour; pure black lines on warm scenes; pure black anywhere except hard-cut frames.
- Centred text in every shot; faux bold/italic CJK; horizontal punctuation in vertical text; stretched glyphs; AI-drawn text in images.
- Mismatched character designs between generations (always reuse the master + character sentence).
- A fade-out ending when the song ends hard.
- Unseeded randomness (breaks parallel rendering).
- Copying 残光's palette, motifs and set pieces wholesale — the point is a different film built with the same craft.

---
Author: **NikusonP** · vocaloid-style-mv-pipeline (MIT)
