> Archived working document from the 「残光」 project (Music / Lyrics / Movie：NikusonP). `<project>` = that project's root; commands and paths refer to its layout at the time. For the maintained, portable versions see `skills/vocaloid-style-mv/references/`.

# 残光 (Zankō / "Afterglow") — Visual-Language Research & Style Bible

> Scope: visual language for a full-length (3:44.32) Vocaloid-style 手書き / 文字PV lyric MV that must also work as a top-tier motion-design showreel.
> Audience: every agent or human building the piece (engine, JIZURA integration, asset generation with codex, Blender, render pipeline).
>
> Companion files (all re-runnable; the first three come from `tools/style_palette_sheet.py`):
> - `docs/style_palettes.png` — contact sheet: every palette applied as gradient map / duotone / inversion to a procedural dusk scene (railway crossing, power lines, low sun, long shadow).
> - `assets/style/palettes.json` — machine-readable palettes (roles, gradient stops, duotone pairs, luminance, contrast).
> - `assets/style/luts/<id>.png` and `<id>_duo.png` — 256×1 gradient-map LUTs (OKLab-interpolated), ready for `texture()` lookups in WebGL2 (§5.3). `assets/style/dusk_scene_gray.png` is the grey test scene.
> - `docs/style_fx_preview.png` — 16 of the cookbook shaders below, rendered for real in headless Chrome WebGL2 on the test scene (`tools/preview_style_fx.mjs`).
> - `tools/verify_style_snippets.mjs` — compiles every GLSL block and syntax/unit-tests every JS block in this file (§13.2).
>
> Facts this document relies on:
> - Sung language: **Japanese**. I checked this with faster-whisper small `detect_language`: ja at 0.98–0.997 on 5 offsets.
> - Timing comes from the audio-analysis agent's `analysis/audio.json` and `docs/AUDIO_MAP.md` (authoritative):
>   - Nominal tempo **130.5 BPM**, but it **drifts 128.3 → 132.4 BPM**. Always read `beats[]` and `downbeats[]` rather than assuming a grid.
>   - 486 beats, 122 downbeats. Downbeat = `beats[k]` with `k % 4 == 1`, because of a one-beat pickup at 0.49 s.
>   - The music **cuts dead at 223.54 s (3:43.54)** on the downbeat of bar 122. A reverb tail runs to 224.32 s. The ending must be designed as a cut, not a fade.
> - Canonical character: `docs/CHARACTER.md` (灯 Akari). §11.2 only adds motion and motif hooks to it.

---

## 0. TL;DR — twelve rules

1. **Thesis: 残光 = persistence of vision.** The sun has already set, but the sky still glows. The train has passed, but the crossing bell is still ringing. The word has been sung, but its afterimage stays on the retina. Every signature effect is some kind of *light that stays after its source is gone* (afterimage buffers, trails, embers, fireflies, film burn).
2. **At most three motifs per shot**, all from the motif bank (§4). One motif = one meaning. Keep it consistent for all 224 s.
3. **One colour system.** Everything goes through the five palettes (§5) as gradient maps or duotones. That includes AI-generated assets: generate grey values and colourise them in the engine.
4. **Type roles are fixed** (§6). Mincho carries feeling, gothic carries impact, handwriting carries memory, pixel/LED carries signals. Use at most three families per section, and never synthesise bold or italic for CJK.
5. **Mixed timing.** Anything drawn (characters, type reveals, line boil) moves on 2s (12 fps) or 3s (8 fps). Camera, light and particles move on 1s (24 fps). Lyrics appear 0.1–0.2 s before the vocal. Cuts land one frame before the beat.
6. **Budget outside the climaxes:** at most one screen effect and one decoration per shot (this is JIZURA's 文字整列 rule too). Grain and paper stay on at all times. They are what holds the piece together.
7. **Escalation is a budget, not a volume knob.** Each section unlocks new tools (§10). The final chorus brings back chorus-1 layouts "on fire" and adds one move the viewer hasn't seen yet.
8. **Transitions come from inside the scene.** Sun, crossing lamp, 「。」, iris and firefly are all circles, so they match-cut into each other. The crossing barrier and passing trains act as wipes.
9. **Stillness is a weapon.** Include at least three full holds (≥ 2 bars with no cuts and almost no motion). Contrast is what makes the bursts read as bursts.
10. **Photosensitivity.** Full-frame flashes ≤ 3 per second. No saturated-red full-frame flicker. High-contrast stripes and spirals cover < 25 % of the frame while they move fast (§7.6).
11. **End on the idea.** The music stops dead at **3:43.54** (223.54 s, the downbeat of bar 122). Hard-cut to black there. For the reverb tail (to 224.32 s) plus an optional 1.5–2.5 s of padded silence (added at mux time, never by editing `zanko.wav`), leave only the afterimage of the last lyric, glowing and fading.
12. **Deterministic.** Every visual is a pure function of song time `t` plus a seed, except for explicit feedback buffers, which get warm-up frames (§7.5). Any frame must be re-renderable.

---

## 1. Concept: what 「残光」 should look like

**Three kinds of light**, and the story moves from one to the next:

| Light | Examples | Emotional meaning | Section weight |
|---|---|---|---|
| **The source** (日) | low sun, golden hour, lens flare | the person/time that is leaving | intro → chorus 1 |
| **The remainder** (残光・残像) | afterglow sky, retinal afterimage, embers, film burn, long shadows | memory still burning after the loss | verse 2 → chorus 2 → bridge |
| **The substitutes** (灯) | crossing lamps, train windows, street lights, vending machine, fireflies | the artificial or small lights we live by afterwards | bridge → final chorus → outro |

**Time-of-day arc (colour script):** golden hour (P2/P1) → magic hour 逢魔が時 (P1, choruses 1–2) → a memory flash (P5, interlude) → the sunset happens on screen during the bridge (P1→P4) → blue hour and fireflies (P4, break 3) → the last chorus *rewinds the sunset* (P4→P1, §9 M9) → hard cut → only the afterimage (inverted P1).

**Structure metaphor, 線香花火 (senkō-hanabi):** a sparkler burns through five named stages that line up almost perfectly with a song's intensity arc. Use them as the intensity script, and literally as a particle effect (G08):
蕾 *tsubomi* (bud, intro) → 牡丹 *botan* (peony, verse/pre) → 松葉 *matsuba* (pine-needle sparks, chorus) → 柳 *yanagi* (willow, bridge/post-chorus) → 散り菊 *chiri-giku* (scattered chrysanthemum, outro). The glowing bead dropping off is the hard cut at 3:43.54.

**Kanji that carry the theme (use them as images, not only as text):**
- **影** means *shadow*, but classically also *light* (月影 = moonlight, 星影 = starlight, 火影 = firelight). The long evening shadow *is* the remaining light. Typeset 影 with ruby ひかり for the key line.
- **黄昏 (たそがれ)** comes from 誰そ彼 "who is that?". At dusk you can't recognise faces. Typeset 誰そ彼 with ruby たそがれ over a silhouette whose face is unreadable.
- **暗 = 日 + 音.** When the sun goes and only the sound remains, it becomes dark. This is a perfect radical-alchemy transition for a music video (§9 M12).
- **明 = 日 + 月.** At the dusk→night change, 明 splits apart: 日 sinks and 月 rises.
- **逢魔が時** is the hour of meeting demons/ghosts, the liminal time when memories show up.

---

## 2. Genre anatomy: what defines the 2020s ボカロMV / 手描きMV / V家手书 look

### 2.1 Taxonomy (which sub-genre we are borrowing from)

| Sub-genre | What it is | Lineage / examples | Cost | Our use |
|---|---|---|---|---|
| **文字PV / リリックモーション** | the lyrics are the main visual; kinetic typography on graphic backgrounds | niconico-era subtitle MVs (e.g. ryo「メルト」2007 and wowaka「ローリンガール」2010 showed lyrics under the picture) → AviUtl perspective/axis-rotation era → AE plugin era (CuttanaNir stroke order, Exte, RandomMotionNS) → JIZURA automation | low | backbone of all sections |
| **一枚絵MV (one illustration + motion)** | one or a few key illustrations, animated with camera, parallax, puppet warps, loops | the dominant indie format; "最近は一枚絵で文字だけ変わるタイプが多い" | low–mid | verses, character presence |
| **手描き / 手书 (fan hand-drawn animatic)** | originally a MAD genre: original *hand-drawn* visuals set to a song, often loose and on 2s/3s, with line boil, lip flaps and heavy lyric overlay. Sub-types: 原创手书, 描改手书 (retracing an existing PV with other characters), and 手书风PV (original songs adopting the tegaki look) | niconico 手描き → bilibili V家手书 | mid (lots of drawings) | character acting beats: close-ups, loops, silhouettes |
| **Cutout / procedural rig** | one illustration split into parts and rigged; motion driven by parameters | channel「メズマライザー」(2024) | mid (setup), cheap per shot | the singer's performance shots |
| **3DCG toon / hybrid** | 3D spaces rendered or composited to look drawn; painted BGs camera-mapped onto geometry | ぽぷりか (Yorushika MVs, Blender as main tool); MORIE「晴る」 | high | 3D crossing, train, city built from kanji (Blender) |

**Our blend:** 文字PV grammar (JIZURA-level vocabulary) + one-illustration character presence + tegaki acting inserts + two or three 3D set pieces. That mix is what reads as "V家手书" and still flexes motion-design craft.

### 2.2 Illustration style

- **Flat cel (アニメ塗り)** with 1–2 hard-edged shadow tones. Soft brush rendering is saved for the key art. Flat fills animate, recolour and gradient-map cleanly.
- **Line is the signature.** Use variable-width ink: a thick outer contour (≈ 3× the inner lines) and thin interior detail. **Coloured line art (色トレス)** is standard in modern Japanese illustration: lines take a darker shade of the neighbouring fill instead of pure black. In warm dusk light, line colour = gradmap(≈0.10) of the current palette.
- **Limited palettes:** 2–3 hues plus black/white, with one brand colour per song (Kanaria's MVs and thumbnails stay in a unified red/black world; DECO*27 has pink). Our brand colour is **P1 vermilion `#C8373A` / glow `#FFA552`**.
- **Graphic overlays drawn into the illustration:** manga screentone (halftone), stripes, grids, UI fragments (windows, cursors, progress bars), stickers, handwritten annotations, arrows and dimension lines. They make a still image feel like "designed video".
- **Analog nostalgia layer:** scanned paper, crayon or pencil grain, Heisei-retro objects (CRT, VHS, flip phones, film cameras). For 残光, lean on 8mm film, summer-evening countryside and railway infrastructure.
- **Negative space and the "tired" singer:** a single figure against a flat field. ぬくぬくにぎりめし's「ラグトレイン」MV (稲葉曇, 2020) is known for a grey background and a listless girl. Melancholy comes from restraint, not spectacle.
- **Outline both character AND background** when mixing 2D and 3D (MORIE's approach on ヨルシカ「晴る」). This removes the "floating character" problem in composites.

### 2.3 Character animation idioms on a budget

| Idiom | What it looks like | Why it works | Recipe |
|---|---|---|---|
| One illustration + camera | slow push/pan across a single image, parallax layers | reads as cinematic with one drawing | B01, K05 |
| Pose-per-beat | a different still pose on each beat or bar, each with a small zoom kick | the illusion of dance or acting from 4–8 drawings | B13, K01 |
| 2–3 frame loops | hair, ribbon, tears, smoke cycling at 8–12 fps; ping-pong for 2 frames | alive without real animation | B03 |
| Line boil (線ゆれ) | contours wobble on 2s/3s | a still looks hand-drawn and alive; core tegaki marker | B02 |
| Cutout/puppet warp | parts or mesh deformation: head tilt, breath, sway, blink | studied systematically in メズマライザー: procedural rig, 5-point facial interpolation, secondary motion, motion trails | B04–B06, B09 |
| Silhouette / shadow play (影絵) | a black figure against the sky; the shadow acts separately | cheap and very strong at dusk | B07, B12 |
| Extreme close-ups | eye, hand, mouth, feet, fingers against the sun | cheap to draw, emotionally dense, cut fast in pre-chorus | B08 |
| Symbolic props | ticket, crossbuck sign, stopped watch, cicada shell, ラムネ marble | carries the story without animating people | B10 |
| Repeated motif with state change | the same object in each chorus, one state further along (lamp off → on → broken → glowing) | long-form coherence; rewards a rewatch | §4 |
| Draw-over-3D | 3D blocking (train, crossing) rendered with line art, then posterised and boiled | complex hardware "drawn" cheaply | B11 |

### 2.4 Typography

- **Mincho vs gothic:** 明朝 is literary, sad, traditional and intimate (verses, key emotional words). ゴシック is aggressive, pop, digital and loud (chorus slams, alarms). Handwriting (Klee One / Yuji Syuku) is the diary and memory voice. Pixel/LED (DotGothic16) is signals: station boards, crossing counters, timecodes.
- **縦書き (vertical)** feels literary and Japanese. **横書き** feels modern. **縦横混植** (vertical and horizontal lines in one frame) is a strong editorial layout.
- **Huge single kanji (大文字 / 見切れ)**: one character at 110–160 % of frame height, cropped by the edges, used as architecture or background. It is the most recognisable 文字PV move.
- **Character-by-character reveals**, per mora, on 2s. Also stroke-order write-ons (書き順, AE plugin CuttanaNir → our T01).
- **Ruby as a second voice:** 当て字/義訓 ruby (kanji shown with a non-standard reading) is a core Vocaloid lyric device. Visually, ruby can arrive late, disagree with the base text, or outlive it.
- **Punctuation as graphics:** 「」『』 brackets that open and close, 。 as a circle (sun/lamp/firefly match cut), ー as a bar (barrier arm), 傍点 emphasis dots.
- **Mixed sizes in one line (大小ミックス):** particles (は・が・を・に) small, content words big, kana tightly tracked, line-initial character larger. JIZURA's 文字整列 mode does exactly this.
- **Metamorphic typography (2024 trend, per JAGDA GDR):** glyphs morph into related glyphs and lose their meaning in transit. Also halftone-shaded "mixed-dimension" type, and generative text systems (e.g. extracting kanji programmatically).
- **Text as architecture:** extruded 3D kanji as buildings, text tunnels, text rain, glyph counters used as windows.
- **Meta-typography:** tiny HUD in corners (timecode, line number, BPM, station names, romaji). Cheap, and it screams "designed".

### 2.5 Colour

- **Duotones** (ink + one light colour) and **2–3 colours + black/white** are the default. A full-colour frame is an event.
- **Gradient maps** colourise any greyscale source into the palette. This is the single most important unifier when assets come from mixed sources (AI, Blender, procedural).
- **Sudden inversion** (negative) on hits: one frame to one bar. Our version is motivated in-world: a retinal *negative afterimage* (L03).
- **Monochrome + one accent** (red thread): everything grey except the one thing that matters.
- **Complementary shock:** orange/cyan. At dusk this is physically true: warm horizon, cold zenith.
- **Colour-block frames:** flat palette-colour frames between shots, used as chromatic punctuation.

### 2.6 Editing grammar

- **Cut on beat.** A phrase is usually one shot. The last word of a line is a キメ (hit). Cut 1 frame early (perceptual latency).
- **Smash cuts** from loud to silent, or wide to extreme close-up.
- **Flash frames:** one frame of white or palette highlight, sometimes followed by one frame at 40 %.
- **Subliminal inserts:** 1–2 frame images (a memory, a kanji, a face). Horror-leaning in many MVs; for us, memory-leaning.
- **Split screen / manga panels (コマ割り):** the same moment from 2–4 angles. Panels open with 1/8-note staggers.
- **Rhythmic zoom** (拍ズーム): a small scale kick per beat, larger on downbeats.
- **Stutter:** repeat the last 2–4 frames 2–3× in sync with vocal chops or glitches in the track. Freeze-frame endings (止め).
- **Black frames (黒コマ)** and hard holds just before the chorus (溜め).
- **Burst sequences:** one cut per beat for a bar or two in the chorus, then a long hold.

### 2.7 Textures & finishing

Film grain, paper, halftone, chromatic aberration, scanlines/CRT, VHS, dust and scratches, light leaks, bloom/glow, vignette, slice/block glitch, 1-bit dither, riso misregistration. The AE staples used in ボカロMV work have direct equivalents in our cookbook: CC Burn Film → E08, Colorama → L01, texture overlay in Soft Light at 20–50 % with hold keyframes → F02, Posterize Time → F12, Deep Glow → L07, Fractal Noise smoke/fog → the fbm fields in L04/E07/E08, CC Jaws (blink/clapper cut) → E15, CC Lens (fisheye) → K11, Auto Sway → B09.

### 2.8 Structure & escalation (Japanese pop form)

| Part | Job in the MV | Typical visual behaviour |
|---|---|---|
| **Intro** | title card (song + P name) in a signature layout; set up palette and motif | slow, sparse, often the hook image |
| **Aメロ (verse)** | narrative and character setup | small type, slower camera, long shots, vertical text |
| **Bメロ (pre-chorus)** | tension | faster cutting, close-ups, rising zoom, colour shift, 溜め (hold or black) just before the chorus |
| **サビ (chorus)** | payoff; the first chorus decides whether the viewer stays | full palette, big type, key visual, fastest cutting, キメ on the downbeat |
| **間奏 (interlude)** | visual play | loops, abstraction, meme-able dance, graphic elements |
| **2番 (verse 2)** | variation | verse-1 language plus one new element |
| **Cメロ / 落ちサビ (bridge / drop chorus)** | contrast and reveal | stripped, monochrome, memory montage, quiet |
| **ラスサビ (final chorus, often a key change)** | maximum | chorus-1 layouts brought back and escalated ("same shots, now on fire") plus one new move |
| **Outro** | resolution | bookend to the intro image, transformed; end card |

JIZURA encodes several of these conventions (its 統一感 mode): consistent treatment within a part; **repeated lyrics come back with the first time's treatment**; alternating motion directions; strong moves saved for key lines (キメ); morphs between cuts of the same line.

### 2.9 What makes it read as a *showreel*, not a fan MV

1. **A system, visibly obeyed:** grid, margins, type scale, palette roles and motif meanings. Viewers feel rules even when they can't name them.
2. **Custom motion curves.** No linear motion except for mechanical things (trains, barrier arms). Entrances use expo-out (`cubic-bezier(0.16,1,0.3,1)`), exits expo-in. Slams get a 2-frame anticipation (pull back 3–5 %) and a 1–2-frame overshoot.
3. **Diegetic transitions and match cuts** instead of preset wipes (sun ↔ lamp ↔ 。 ↔ iris).
4. **Density contrast:** bursts next to real holds; loud next to silent frames.
5. **One-take moments:** continuous camera through layers of text and space (§9 M4, M2).
6. **Restraint in the grade:** one screen effect at a time; the texture stack is subtle.
7. **Typographic craft:** kerning, vertical punctuation placement, ruby alignment, no faux bold.
8. **Visual rhyme across the runtime:** the intro image comes back transformed in the outro; each chorus revisits an object in a new state.
9. **Accent the vocal, not the hi-hat.** Not every transient gets a visual. Choose the line's key syllable.
10. **An ending that is an idea** (afterimage after the sound stops), not a fade.

---

## 3. Creators & works to learn from (techniques only — do not copy assets)

| Creator / work | What to study | How it maps to us |
|---|---|---|
| **852wa — JIZURA 字面** (MIT; v0.9.0, 2026-09-26) | 860 parts in 10 categories (layout / entrance / hold / exit / decoration / text treatment / background / camera / screen effect / transition) plus 27 styles. Defaults: **2コマ打ち (12 fps)**, text **0.2 s ahead of the voice**, **one decoration and one screen effect per cut** in 文字整列 mode, キメ lines (`!`), same-glyph morphs, thin→bold variable weight, alternating directions, repeated parts keep their first treatment, **中央を空ける** (lyrics in side bands ≈36 % wide so a character can occupy the centre). Styles include 夕焼けグラデ, 墨と朱, 金夜. | baseline grammar and vocabulary; our palettes can be injected as JIZURA accent / ズレ色A/B (§5.5) |
| **OTOIRO** (DECO*27's team; 「ヴァンパイア」: dir. ぬヴェントス, illust. 八三, AD DMYM/No.734) | polished character-driven motion graphics, a strict brand palette, graphic shapes that collide with the character, and a rhythm that serves the vocal. OTOIRO has published AE project and motion materials (e.g. 「テレパシ」, 「ヴァンパイア」, 「シンデレラ」) on its special page. | study their timing curves and how type and character share one layout grid |
| **channel — 「メズマライザー」** (サツキ, 2024) | cutout animation from a single illustration; a procedural rig with **5-point facial interpolation** (front/up/down/left/right; eye width scales with head yaw); custom tools that keep shapes geometric while deforming; secondary motion and motion trails; outlined ↔ outline-free switching at loop points. One motif (stripes) runs through costume, backgrounds and hypnotic spiral imagery. Two characters shown as **two vertical frames side by side** in 16:9; rhythm-game-like layout. | B04 rig; "one motif through everything" (our crossing stripes + circles) |
| **ぬくぬくにぎりめし — 稲葉曇「ラグトレイン」** (2020; the illustrator also recorded the train sounds) | grey background, languid girl, minimal motion; melancholy from restraint | the train motif without spectacle; our verses should be this quiet |
| **ピノキオピー — 「神っぽいな」** (2021; music, lyrics, illustration and video all by him) | authorial consistency: flat poster-like colour, deadpan character, symbolic props, repetition as rhetoric | one hand across music, drawing and motion reads as a signature |
| **wowaka — 「アンノウン・マザーグース」** (2017; illustration and movie by wowaka) | the composer as video maker: edits locked tightly to vocal rhythm | a lyric-first edit |
| **ツミキ — 「フォニイ」** (2021; video by ツミキ, illustration by ウエダツバサ; later collaborations with video artist 葛飾出身) | a composer-made video in which one illustration plus typography carries a very fast song | proof that 一枚絵 + type can carry a hit |
| **Kanaria** (「KING」 etc.) | a unified red/black world across MVs **and thumbnails**; the palette is the brand | our P1 as a brand colour, including the thumbnail |
| **ぽぷりか (Yorushika MVs)** | Blender as the main tool for a hand-drawn feel in 3D; spends **about half** of a 3-month MV schedule on 絵作り (look development) | lock the look (§5, §6) before producing shots |
| **MORIE Inc. — ヨルシカ「晴る」** | **outlines on characters and backgrounds**; painted backgrounds **camera-mapped onto 3D geometry**; 80s city-pop illustration pushed toward nostalgia; live-action lens language (DoF); emotion through 間 (timing, near-stillness) | our Blender approach: project codex-painted BGs onto simple geometry for parallax one-takes (§11.3) |
| **Yazhirushi (矢印)** and the lyric-video lineage | Japan's motion-graphics scene grew largely *through* lyric videos (JAGDA GDR): AviUtl-era perspective and axis rotation → 2024 metamorphic type, halftone mixed-dimension, generative systems | study the craft of type and grid |
| **Anime light language** (the Shinkai lineage and modern anime photography 撮影) | crepuscular rays, lens ghosts, dust in light shafts, specular glints on rails and wires, sky gradients banded like cels | L05, L06, G03, L11 |
| **Tegaki culture (niconico 手描き / bilibili 手书)** | MAD origin; drawing on 2s/3s; loose line with boil; lip flaps; memeable repeated poses; heavy lyric overlay; stills on camera moves | B02, B03, B13 |

---

## 4. 残光 motif bank

| Motif | Meaning in 残光 | Visual treatment | Where | FX |
|---|---|---|---|---|
| **Low sun / 日** | the source that is leaving | flat disc (no gradient inside), soft halo, sinks section by section; typeset as 日 in M12 | intro→ch2 | L05 L06 E06 |
| **逢魔が時 sky** | liminal hour, ghosts of memory | P1 violet→vermilion bands, posterised into 4–5 cel bands | chorus | L01 L11 |
| **Long shadows (影)** | the past stretching out of the present; 影 = shadow *and* light | shadow sprite skewed ×4–6 in length, lagging by 1 beat, then acting on its own | verse 2 | B12 M5 |
| **踏切 railway crossing** | a boundary; waiting while something passes; the bell is a heartbeat or metronome | lamps alternate **on every beat**; barrier arm as a 45° wipe; crossbuck ✕ as a frame | pre-chorus, ch1 | G04 E11 M3 |
| **Train (電車)** | time passing, departure; windows are frames of memory | foreground pass = strobing slices; each window carries one character | ch1, final | E12 M11 |
| **Power lines (電線/電柱)** | connection; staff notation; a sky cut into pieces | catenary curves; text on wires; crows as notes | verse | T10 M6 |
| **Street / crossing lamps, vending machine** | artificial light that replaces the sun | lamps switch on one by one (per beat) as the sun goes | bridge | G04 L07 |
| **Afterimage (残像)** | "you are gone, I still see you" | complementary-colour ghosts that decay over 0.5–3 s | whole film, peak in final | L03 T13 M10 |
| **Embers (残り火/火の粉)** | what remains of something burnt | rising particles; lyric exits burn into embers | bridge end, outro | G01 T14 |
| **Fireflies (蛍)** | souls and lingering memories (folklore); brief light | slow wander; blinks locked to bars (§G02) | bridge, final | G02 |
| **線香花火** | summer's end; fragility; the drop falling = the end | five-stage spark system mapped to structure | structure, outro | G08 |
| **8mm film / film burn** | memories on film that burn when the projector stops | gate weave, sprockets, burn from the brightest point | interlude, bridge end | E08 F09 F10 |
| **夕方5時のチャイム** (town dusk chime from a loudspeaker pole) | "time to go home" | loudspeaker silhouette on a pole; sound-ring circles | intro/outro bookend | G07 |
| **空蝉 (cicada shell)** | the empty shell that remains | macro insert prop | subliminal | B10 E03 |
| **ラムネ marble / glass** | refracted, trapped sunset | round refraction lens over the sun | verse insert | K11 |
| **17:xx clock / HUD** | exact time of loss; the clock keeps running | DotGothic16 HUD counting real song time as "17:4x" | HUD | T17 |
| **日 / 月 / 明 / 暗 / 影 / 誰そ彼** | theme in glyph form | radical splitting and ruby tricks | chorus-2 stop, verse 2 | M12 T06 |

**Rule:** the circle is the master shape. Sun, lamp, 。, iris, firefly, film reel and marble are all circles, so they give match cuts for free (E09). The secondary shape is the **diagonal stripe** (crossing barrier, crossbuck, hazard stripes). Circle means warmth and memory; diagonal means alarm and boundary.

---

## 5. Palettes

All palettes are verified in `docs/style_palettes.png`. Gradient-map stops are monotonic in luminance, which `palettes.json` checks (`gradmap_monotonic`). Contrast ratios are WCAG 2.x.

### 5.1 The five palettes

**P1 — 逢魔が時 Oumagatoki (magic hour)** · the brand palette: title, choruses, emotional peaks

| role | ink | shadow | dusk | vermilion | sunset | glow | highlight |
|---|---|---|---|---|---|---|---|
| hex | `#140B1E` | `#3A1745` | `#7A2350` | `#C8373A` | `#F0663A` | `#FFA552` | `#FFE3B0` |
| rel. lum. | .005 | .019 | .059 | .153 | .283 | .488 | .793 |

- Gradient map: `0 #140B1E · .22 #3A1745 · .42 #7A2350 · .58 #C8373A · .72 #F0663A · .86 #FFA552 · 1 #FFE3B0`
- **Duotone pair:** `#140B1E ↔ #FFA552` (9.8:1). Alt text pair: `#140B1E ↔ #FFE3B0` (15.4:1).
- Accent (the red thread): `#C8373A` · afterimage/inversion hue: `#39C6E0`

**P2 — 残照 Zanshō (lingering glow vs. night)** · verses, blue zenith over an orange horizon, split tone

| role | night | steel | haze | mist | cream | amber | ember |
|---|---|---|---|---|---|---|---|
| hex | `#0B1524` | `#1E3552` | `#3F6284` | `#8FB2C9` | `#E9D9B8` | `#F4A640` | `#D8542A` |

- Gradient map (blue shadows, warm highlights — a split tone in one ramp): `0 #0B1524 · .25 #1E3552 · .45 #3F6284 · .60 #D8542A · .80 #F4A640 · 1 #E9D9B8`
- **Duotone pair:** `#0B1524 ↔ #F4A640` (9.1:1). Text on night: `#E9D9B8` (13.2:1).
- Accent `#D8542A` · afterimage `#2F7BD9`

**P3 — 踏切 Fumikiri (railway crossing alarm)** · pre-chorus tension, alarm hits, graphic moments

| role | black | asphalt | signal | lamp | caution | white |
|---|---|---|---|---|---|---|
| hex | `#0A0A0C` | `#2A2F36` | `#E5102E` | `#FF4B3A` | `#FFC21A` | `#F3F1EA` |

- Gradient map (**posterised tritone**): black < .39 ≤ signal red < .71 ≤ white (hard steps: `0 #0A0A0C · .38 #0A0A0C · .40 #E5102E · .70 #E5102E · .72 #F3F1EA · 1 #F3F1EA`)
- **Duotone pair:** `#0A0A0C ↔ #E5102E` (4.2:1; graphic only, never small text). For text use black on caution (12.2:1) or white on signal (4.2:1, large type only).
- Hazard stripes: caution `#FFC21A` / black at 45°, stripe width = 1/24 frame height. Accent caution · afterimage `#00E0C8`
- **Safety:** this is the palette most likely to break flash guidelines. Never flicker a full-frame red field (§7.6).

**P4 — 蛍火 Hotarubi (blue hour + fireflies)** · quiet verse, bridge, the "after" of the sunset, outro embers

| role | abyss | bluehour | teal | reed | firefly | glow | core |
|---|---|---|---|---|---|---|---|
| hex | `#050F16` | `#0C2233` | `#17405A` | `#2F6B6A` | `#9BD86A` | `#DDFF7A` | `#F6FFE0` |

- Gradient map: `0 #050F16 · .25 #0C2233 · .45 #17405A · .62 #2F6B6A · .82 #9BD86A · .93 #DDFF7A · 1 #F6FFE0`
- **Duotone pair:** `#050F16 ↔ #DDFF7A` (17.2:1). Glow colour for additive particles: `#DDFF7A` core with `#9BD86A` halo.
- Accent `#DDFF7A` · afterimage `#C04BD8`

**P5 — 褪色 Taishoku (faded photograph / 走馬灯 memory)** · flashbacks, subliminal inserts, diary/paper scenes

| role | sepia | umber | taupe | dustrose | parchment | paper | bleach cyan | faded rose |
|---|---|---|---|---|---|---|---|---|
| hex | `#241C1A` | `#4A3B35` | `#7D6A5E` | `#B79C8B` | `#D8C7AE` | `#EFE6D6` | `#9CC2C0` | `#C98D86` |

- Gradient map: `0 #241C1A · .20 #4A3B35 · .45 #7D6A5E · .68 #B79C8B · .85 #D8C7AE · 1 #EFE6D6`
- Split tone on top: shadows ← `#9CC2C0` 15 %, highlights ← `#C98D86` 10 % (the look of faded chromogenic prints).
- **Duotone pair:** `#241C1A ↔ #EFE6D6` (13.5:1). Accent `#C98D86` · afterimage `#6FA9A6`

**Global neutrals:** flash white `#FFFFFF` (only for 1-frame flashes), sumi `#111014`, paper `#F4EFE6`.

### 5.2 Palette choreography rules

- **One palette per shot.** Palette changes happen on cuts, or through a *motivated* scrub (sunset time-of-day, L08).
- **Section defaults:** Intro P2 → Verse 1 P2 → Pre 1 / Break 1 P3 → Chorus 1 + post P1 → Verse 2 P2 (darker, LUT offset −0.08) → Pre 2 P3 + inversions → Chorus 2 P1 → Interlude P5 (memory) → Bridge P1→P4 (sunset scrub) → Break 3 P4 → Last chorus P4→P1 rewind → Outro P1 → cut to black + P1-inverted afterimage (§10).
- **Inversion is motivated:** a negative frame is "the retina after looking at the sun". It follows a bright event (flash, sun, lamp) and never comes out of nowhere.
- **Accent budget:** the accent colour covers ≤ 8 % of frame area except in chorus キメ frames.
- **Line colour** = the palette's gradmap(0.08–0.12), not pure black. Pure `#000` is reserved for hard-cut black frames.
- **Gradient maps interpolate in OKLab** (smooth, no muddy mid-tones). The LUT PNGs are already OKLab-interpolated.

### 5.3 Using the LUTs (WebGL2)

- Load `assets/style/luts/<id>.png` as a 256×1 `RGBA8` texture with `LINEAR` filtering and `CLAMP_TO_EDGE`, and sample at `vec2(l*255.0/256.0 + 0.5/256.0, 0.5)` (L01 below). The duotone LUT is `<id>_duo.png`.
- Canvas2D fallback: `getImageData` → per-pixel `lut[round(luma*255)]`. It's slow at 1080p (~15–25 ms/frame in V8), so only use it on small layers.

### 5.4 Where each palette appears on the contact sheet

`docs/style_palettes.png`: one row per palette, showing [role swatches] then [gradient map | duotone | inversion] on the same procedural scene. The P3 posterised tritone gives the graphic "ベノム-like" red/black/white frame. P4 shows the firefly look. P5's inversion shows the cold "memory negative".

### 5.5 JIZURA mapping

If JIZURA renders lyric layers: set **アクセント = palette.accent** and **ズレ色A/B = palette.afterimage / palette.roles.glow**, and export black-back/transparent layers, then colourise with our LUT in the engine. That keeps JIZURA output inside our colour system.

---

## 6. Typography system

### 6.1 Fonts

All fonts below are verified on Google Fonts (CSS2 API returned 200; weights from `fonts.google.com/metadata/fonts`, 2026-09-28). ✅ = already downloaded to `engine/fonts/` by the font-fetch task (`tools/fetch_fonts.py`); ➕ = recommended addition.

| Role | Family (weights) | Status | Used for |
|---|---|---|---|
| **R1 Monument** (huge single kanji, title) | **Zen Old Mincho** 900 (400–900) · **Kaisei Tokumin** 800 (400/500/700/800) | ✅ ✅ | 残 / 光 / 影 cropped at 110–160 % frame height; title card |
| **R2 Lyric Mincho** (default lyric voice) | **Shippori Mincho B1** 500–700 (400–800) · Noto Serif JP variable (200–900) | ✅ ✅ | verse and chorus lyrics, vertical text. B1 has sturdier strokes than Shippori Mincho and survives video compression better. |
| **R3 Lyric Gothic** (impact) | **Dela Gothic One** 400 (ultra-heavy) · **Zen Kaku Gothic New** 700/900 · Noto Sans JP variable (100–900) | ✅ ✅ ✅ | chorus slams, alarms, pre-chorus; Noto Sans JP for weight-bloom T07 |
| **R4 Hand** (memory, diary, inner voice) | **Klee One** 400/600 (pencil textbook hand) · **Yuji Syuku** 400 (brush) | ✅ ✅ | memory lines, annotations, the "written" voice; Yuji Syuku for brush-impact single words |
| **R5 Signal** (LED, station, HUD) | **DotGothic16** 400 | ✅ | crossing counters, station boards, HUD timecode |
| **R6 Ruby / small annotation** | Zen Kaku Gothic New 500 · Noto Sans JP 500 | ✅ | ruby at 0.45–0.5 em, credits |
| R7 Latin display (romaji/English subtitle, title "ZANKŌ — afterglow") | Cormorant Garamond 300–700 + italics (wght axis) · Instrument Serif 400/400i | ➕ | small elegant Latin; never bigger than the Japanese |
| R8 Latin mono HUD | IBM Plex Mono 100–700 (+i) · Space Mono 400/700 | ➕ | `BPM 130.5 · 03:43.54 · L27/48` |
| Optional flavour | Hina Mincho 400 (thin, fragile) · Zen Antique 400 (old print) · New Tegomin 400 (retro print) · Yomogi 400 (loose handwriting) · Zen Kurenaido 400 (felt pen) | ➕ | one-off moments (P5 memory cards, 走馬灯) |

JIZURA also uses Reggae One, Rampart One and M PLUS Rounded 1c (✅ in `engine/fonts/`). They are too playful for 残光, so avoid them except for a deliberate pop break.

### 6.2 Type scale (1920×1080 reference; values in px, relative to frame height 1080)

| Token | Size | Leading / tracking | Notes |
|---|---|---|---|
| `mono` Monument | 1200–1700 (110–160 %) | — | cropped (見切れ); only one per shot; fill with texture/video/LUT |
| `hero` | 200–300 | tracking −20/1000 | chorus キメ word |
| `lyric-L` | 96–120 | line 1.35, kana −60/1000 | main horizontal lyric |
| `lyric-V` | 84–104 | column pitch 1.6 em | vertical lyric |
| `sub` | 38–44 | 1.5 | secondary line, English |
| `ruby` | 0.45–0.5 × base | centred over the base span | may animate on its own timeline |
| `hud` | 20–24 | +40/1000 (Latin), 0 (JP) | DotGothic16 / Plex Mono at 60–70 % opacity |

- **Particle shrink:** は が を に へ と で の も や か ね よ at 72–80 % of the line size (JIZURA 文字整列).
- **Line-initial character** at 115–130 %. **Latin inside Japanese** at 105 % with 0.25 em spacing on both sides.
- **Max families per section: 3.** Max weights per shot: 2.
- **Never faux-bold or faux-italic CJK.** Canvas `ctx.font = "bold ..."` on a single-weight family synthesises bold; always load the real weight.

### 6.3 Layout grammar

- **Safe areas:** title-safe 90 % (96 px/54 px margins at 1080p) for readable lyrics; decoration and monuments may bleed.
- **Grid:** 12 columns with 5 % outer margins. Vertical lyrics sit on the right third (reading starts at the right). Horizontal lyrics sit on the lower third or the optical centre (45 % height).
- **Centre-blank layout** (JIZURA 中央を空ける): lyrics in left and right bands each ≈36 % of the width, character in the centre. Use it for singer performance shots.
- **縦書き** for verses and introspective lines. **横書き** for choruses. **縦横混植** for キメ frames (one vertical column crossing one horizontal line, like a ✕ crossbuck, which rhymes with the crossing motif).
- **Reading time:** main lyric lines stay on screen ≥ max(0.7 s, 0.09 s × characters). Decorative repeats can be faster. The chorus may flash words per beat because viewers know them by then.

### 6.4 Rendering notes (Canvas2D / WebGL2)

- **Vertical text:** Canvas2D has no vertical layout. Do per-glyph placement (JS below): rotate ー―…‥〜～（）「」『』【】〈〉 by 90°; move 、。，． to the upper right (≈ +0.5 em x, −0.5 em y; tune per font); nudge small kana (ぁぃぅぇぉっゃゅょゎ and katakana equivalents) by ≈ (+0.1 em, −0.1 em). For proper `vert` glyph substitution, shape with **harfbuzzjs** (`direction: 'ttb'`), or rasterise DOM text with CSS `writing-mode: vertical-rl`.
- **Phrase splitting:** use **BudouX** (Google, Apache-2.0; npm `budoux`, `loadDefaultJapaneseParser().parse(str)`) to split lyrics into 文節 chunks for word-level kinetics and line breaks.
- **Glyph outlines:** **opentype.js** (MIT) gives per-glyph path commands from the TTFs in `engine/fonts/`. That enables outline draw-on, shattering (triangulate with earcut), particle sampling and 3D extrusion.
- **Stroke order:** **KanjiVG** (CC BY-SA 3.0; one SVG per character at `kanji/0xxxx.svg`, 109×109 viewBox, strokes in writing order; covers kanji and kana). Needs attribution in the credits.
- **SDF text for WebGL:** **@mapbox/tiny-sdf** (BSD-2) builds SDF glyphs from any loaded web font through canvas. SDF gives resolution-independent glow, outline, erosion reveals and weight animation in a shader.
- **Variable weight in canvas:** with `@font-face { font-weight: 100 900; }` declared for Noto Sans/Serif JP, `ctx.font = "637 96px 'Noto Sans JP'"` works in Chromium. Await `document.fonts.load()` for every family and weight before rendering frame 0.

```js
// Vertical (縦書き) single-column glyph placement for Canvas2D.
// Draw each result with ctx.textAlign='center', ctx.textBaseline='middle', rotating by g.rot around (g.x,g.y).
const ROTATE_V = new Set([...'ー―…‥〜～－（）「」『』【】〈〉《》［］｛｝→←—']);
const PUNCT_V = new Set([...'、。，．']);
const SMALL_V = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
function layoutVertical(text, x, yTop, em, pitch = 1.0) {
  const out = [];
  let cy = yTop + em / 2;
  for (const ch of text) {
    const g = { ch, x, y: cy, rot: 0 };
    if (ROTATE_V.has(ch)) g.rot = Math.PI / 2;
    else if (PUNCT_V.has(ch)) { g.x += em * 0.5; g.y -= em * 0.5; }
    else if (SMALL_V.has(ch)) { g.x += em * 0.1; g.y -= em * 0.1; }
    out.push(g);
    cy += em * pitch;
  }
  return out;
}
```

---

## 7. Timing, beat-sync & render conventions (assumed by the cookbook)

### 7.1 Frame rates & "koma"

- **Preferred master: 1920×1080, 24 fps** (anime and tegaki convention; JIZURA's default look is 2コマ打ち = 12 drawings/s). The analysis envelopes are sampled at 30 fps (`analysis/envelope_30fps.json`). If the render pipeline runs at 30 fps, that's fine: sample the envelopes by time.
- **Mixed timing:** drawn layers (characters, line boil, per-glyph reveals, loops) on **2s** or **3s**; camera, particles, light and grain on **1s**. At 24 fps: `quantize(t, 12)` for 2s, `quantize(t, 8)` for 3s. At 30 fps, use 15 / 10 fps for an even cadence (or 12 fps like JIZURA, accepting a 2-3-2-3 frame rhythm).
- **Tempo drifts 128.3 → 132.4 BPM.** Beat = 468 → 453 ms = **11.2 → 10.9 frames @24** (14.0 → 13.6 @30); bar ≈ 1.87 → 1.81 s (≈ 45 → 43.5 frames @24).
- Because frames-per-beat is neither constant nor an integer, **compute every event from the true `beats[]`/`downbeats[]` times and round to the nearest frame**. Never accumulate frame counts, and never extrapolate a fixed BPM over more than a bar.

### 7.2 Sync offsets

- **Cuts:** land on the frame *before* the beat frame (−1 f @24 ≈ −42 ms). Hard hits feel on-beat that way.
- **Lyrics:** appear 0.1–0.2 s before the vocal onset (JIZURA uses 0.2 s). A stroke-order write-on *finishes* on the onset.
- **Flash frames:** on the beat frame itself (the brightness spike should coincide with the kick).
- **Lip flaps:** mouth opens 1 frame *before* the syllable onset.

### 7.3 Beat-clock API (names used below)

```js
// beats, downbeats: sorted times in seconds (analysis/audio.json `beats`, `downbeats`).
// bpm is only used to extrapolate one interval past the last beat. With no downbeats given, every 4th beat is assumed.
function makeClock(beats, bpm, downbeats = []) {
  const spb = 60 / bpm;
  const dbs = downbeats.length ? downbeats : beats.filter((_, i) => i % 4 === 0);
  const find = (arr, t) => {
    if (!arr.length || t < arr[0]) return -1;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const phaseIn = (arr, t, fallback) => {
    const i = find(arr, t); if (i < 0) return 0;
    const t0 = arr[i], t1 = i + 1 < arr.length ? arr[i + 1] : t0 + fallback;
    return Math.min(1, (t - t0) / (t1 - t0));
  };
  const sinceBeat = (t) => { const i = find(beats, t); return i < 0 ? 1e9 : t - beats[i]; };
  return {
    beatIndex: (t) => find(beats, t),
    barIndex: (t) => find(dbs, t),
    sinceBeat,
    beatPhase: (t) => phaseIn(beats, t, spb),
    barPhase: (t) => phaseIn(dbs, t, 4 * spb),
    pulse: (t, k = 10) => Math.exp(-k * sinceBeat(t)),              // 1 on the beat, decays
    isDownbeat: (t, fps = 24) => { const j = find(dbs, t); return j >= 0 && t - dbs[j] < 1 / fps; },
    localBpm: (t) => { const i = Math.max(0, Math.min(beats.length - 2, find(beats, t))); return 60 / (beats[i + 1] - beats[i]); },
  };
}
const quantize = (t, fps) => Math.floor(t * fps + 1e-6) / fps;       // 2コマ打ち @24: quantize(t, 12)
```

Hook vocabulary used in the recipes:
- `pulse(t)`: per beat.
- `downbeat` and `bar`: from `downbeats[]`, which has a pickup, so bar 1 starts at 0.95 s.
- `onset.kick/snare/hat`: `onsets_strong[]` with `band`.
- `impacts[]` and `stops[]`: drops, breakdowns and gaps, the best hard-cut candidates.
- `vocal.env`: `vocal_activity[]` plus the centre-channel 300–3500 Hz envelope.
- `word.t0/t1`: lyric timing.
- `section.p`: 0..1 progress through the current `sections[]` entry.
- `energy`: the `rms` envelope in `analysis/envelope_30fps.json`.

### 7.4 Easing presets

`expoOut = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t)` for entrances · `expoIn` for exits · `backOut(s=1.7)` for pops · `sineInOut` for camera drifts · **hold-to-snap** (ease 0→0.9 over 85 % of the time, then snap) for "impact" moves · **stepped ease** (apply the ease, then quantise the time to 12 fps) for drawn feel.

### 7.5 Determinism & feedback buffers

Every generator takes `(t, seed)`. Particles either integrate with a fixed `dt = 1/24` from the section start, or use closed-form paths. Feedback effects (L03 afterimage, T13, E14 slit-scan) need history. When rendering a chunk starting at frame N, **pre-roll `W` frames** (W = decay length, e.g. 72 frames for a 3 s afterimage) without writing them out.

### 7.6 Photosensitivity guardrails (ITU-R BT.1702 / Japanese broadcaster guidelines after 1997)

- ≤ 3 full-frame luminance flashes per second. At ~130 BPM the 8th-note rate (≈ 4.35/s) is **too fast**, so full-frame flashes go on quarter notes at most (≈ 2.2/s), for ≤ 2 bars.
- **No saturated-red flicker** over large areas (P3!). Strobe the lamps as small elements, not the frame.
- High-contrast stripes, concentric rings or spirals moving fast stay under 25 % of screen area.
- Subliminal inserts ≤ 1 per 4 bars. Burst cuts are fine (they change content, not luminance), but keep the luminance delta between consecutive shots < 50 % during bursts.

---

## 8. Effect cookbook (94 recipes)

Format: **Look** (what the viewer sees) · **When** (section / emotion) · **How** (Canvas2D / WebGL2 algorithm, parameters) · **Beat** (sync hooks, §7.3).
Prefixes: **T** type · **B** character/illustration · **K** camera · **L** light & colour · **E** editing & transitions · **F** texture & finish · **G** particles & motifs.
GLSL sketches are complete WebGL2 fragment shaders **once the common header below is prepended**. Every GLSL and JS block in this file was compiled or syntax-checked (§13.2).

```glsl
#version 300 es
// @common: prepend to every fragment sketch below. Vertex stage = fullscreen triangle writing vUv (0..1, origin bottom-left).
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;      // current input frame / layer
uniform vec2  uRes;          // output size in px
uniform float uTime;         // song time (s)
uniform float uPulse;        // exp(-k * timeSinceBeat): 1 on the beat -> 0
uniform float uBarPhase;     // 0..1 within the bar
uniform float uEnergy;       // 0..1 section-normalised loudness
uniform float uSeed;         // per-shot seed
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
vec3 screenB(vec3 a, vec3 b){ return 1. - (1. - a) * (1. - b); }
```

### 8.A Typography & lyric motion

#### T01 · 一画ずつ — stroke-order write-on
- **Look:** the character writes itself in true stroke order, with brush or pencil tapering, and then settles into the real font glyph.
- **When:** title card; the first line of each verse; memory lines (R4 hand fonts). It's calm and intimate. Never in fast choruses, except for a single キメ kanji.
- **How:** KanjiVG stroke paths (109×109 space) → `Path2D`. Draw each stroke partially with `setLineDash([drawn, len+1])`, round caps, width ≈ 5.5/109 em (pencil) or taper width along the stroke for brush (draw 8–12 sub-segments with decreasing width). Measure lengths once with `SVGPathElement.getTotalLength()`. At the end, crossfade (3 frames) to the actual font glyph (KanjiVG strokes are skeletons, not the font's shapes). Fallback without KanjiVG: an opentype.js outline drawn with a dash offset, then the fill wipes in.
- **Beat:** 60–120 ms per stroke plus 20 ms gaps, whole character ≤ 1 beat. The **last stroke ends on the vocal onset**. Add a 1-frame hold at each tome/hane.

```js
// Draw a partially written character from KanjiVG strokes. p: 0..1 overall progress.
// strokes: Path2D[] in 109x109 space; lens: matching stroke lengths.
function drawStrokeOrder(ctx, strokes, lens, p, x, y, size, width = 5.5) {
  const total = lens.reduce((a, b) => a + b, 0);
  let budget = p * total;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 109, size / 109);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width;
  for (let i = 0; i < strokes.length && budget > 0; i++) {
    const drawn = Math.min(budget, lens[i]);
    budget -= lens[i];
    ctx.setLineDash([drawn, lens[i] + 1]);
    ctx.lineDashOffset = 0;
    ctx.stroke(strokes[i]);
  }
  ctx.restore();
}
```

#### T02 · 一文字ずつ — per-mora pop
- **Look:** each character pops in (scale 0 → 1.12 → 1, y +8 % → 0, alpha 0 → 1) with a stagger.
- **When:** default lyric entrance in verses and pre-choruses.
- **How:** per-glyph transform. Use `backOut(1.4)` over 4–6 frames, quantised to 12 fps. Particles (助詞) enter smaller and faster.
- **Beat:** stagger = per-mora vocal onsets if the lyric agent provides them, else `min(beat/4, lineDur/n)`.

#### T03 · 巨大一文字 — monument kanji (見切れ)
- **Look:** a single kanji at 110–160 % of frame height, cropped by the edges. It's a wall or a window, not something to read.
- **When:** chorus downbeats; section starts. The kanji is the line's key word (残・光・影・夕・灯・踏).
- **How:** Canvas: build the glyph path (opentype.js) or `fillText` into an offscreen mask. `globalCompositeOperation='source-in'` to fill it with a texture, video or scene (e.g. the sunset inside 光). Drift the scale 1.00 → 1.04 across the phrase with `sineInOut`. Pair it with small R2 lyric text for scale contrast.
- **Beat:** appears on the downbeat (−1 frame); micro scale kick `+0.01·pulse`.

#### T04 · 文字くぐり — zoom through a glyph's counter
- **Look:** the camera zooms into a character until one of its enclosed counters (口 日 目 回 田 国 間) fills the frame, and that counter is a window onto the next shot.
- **When:** section transitions; verse → pre-chorus.
- **How:** render the glyph as a mask FBO and pick the counter's centre (precompute by flood-filling the glyph's alpha to find inner holes). Animate scale 1 → 40 about that point with `expoIn` (8–14 frames). Composite `mix(A, B, holeMask)`. Motion blur by averaging 4 sub-frame scales.
- **Beat:** the counter covers the frame exactly on the downbeat.

#### T05 · 縦書きの滝 — vertical cascade
- **Look:** vertical columns from right to left, each sliding down 6–10 % into place, like rain on a window.
- **When:** verses, introspective lines, P2/P5.
- **How:** `layoutVertical()` (§6.4); each column enters with `expoOut` over 10 frames, columns staggered by an 8th note; slight alpha gradient at the column head.
- **Beat:** column n starts on 8th n after the phrase start.

#### T06 · ルビの裏声 — ruby as a second voice
- **Look:** the base kanji say one thing while the ruby says another (当て字). The ruby arrives 1 beat late, or the base dissolves and leaves only the ruby.
- **When:** double-meaning key lines: 影/ひかり, 誰そ彼/たそがれ, 残光/きみ (depends on the lyrics).
- **How:** ruby size 0.45–0.5 em, centred on the base span (right side for vertical text). Give the ruby its own timeline and colour (afterimage hue) so it reads as an inner voice.
- **Beat:** base on the vocal onset, ruby on the next beat (or on the held note's end).

#### T07 · 細→太 — weight bloom
- **Look:** a word grows from hairline (100) to black (900) while it's sung, as if gaining mass or conviction.
- **When:** long held notes; crescendos into the chorus.
- **How:** Noto Sans JP / Noto Serif JP variable fonts. `ctx.font = w + " 120px 'Noto Serif JP'"`, with w = round(100 + 800·ease(p)). Keep glyph centres fixed (re-measure each frame). Quantise to 12 fps for the drawn feel, or leave smooth for elegance.
- **Beat:** weight follows `vocal.env` (sustain) or `section.p` (build).

#### T08 · 文字化け→解読 — scramble decode
- **Look:** random glyphs cycle and resolve left to right into the real line.
- **When:** signal moments (P3 station boards, DotGothic16), glitches in chorus 2. For 残光, draw the pool from theme kanji plus kana, not ASCII.
- **How:** cycle the pool at 12 fps; resolution front at p·(n+2)−2.
- **Beat:** fully resolved on the word onset; cycling speed doubles on snare rolls.

```js
const SCRAMBLE_POOL = [...'アイウエオカキクケコサシスセソタチツテト残光影日月明暗灯夕踏切▯░▒▓'];
function scramble(target, p, seed) {
  const chars = [...target], n = chars.length;
  return chars.map((ch, i) => {
    if (p * (n + 2) - 2 > i) return ch;
    const x = Math.sin((i + 1) * 91.7 + seed * 13.3 + Math.floor(p * 60) * 7.1) * 43758.5453;
    return SCRAMBLE_POOL[Math.floor((x - Math.floor(x)) * SCRAMBLE_POOL.length)];
  }).join('');
}
```

#### T09 · 語ごとスラム — word slam
- **Look:** words slam in from scale 3 → 1 in 2 frames, with a 1-frame white flash, a 6 px camera shake decaying over 6 frames, and a dust puff.
- **When:** chorus キメ words only; ≤ 2 per bar.
- **How:** anticipation (the previous frame scales the existing layout to 0.97), then the slam, then overshoot to 0.98 → 1. Add radial blur (K02) on the slam frame.
- **Beat:** snare or kick onsets that coincide with a vocal onset.

#### T10 · 電線文字 — text on power lines
- **Look:** lyric characters sit on catenary wires like birds, sliding along; on a hit they hop off.
- **When:** verses with sky shots (P2).
- **How:** sample each wire as a polyline (parabola ≈ catenary for small sag). `glyphsOnPath()` gives position and tangent angle per glyph; the offset animates along the wire.
- **Beat:** hop = y-offset `sin(π·beatPhase)`, only for the glyph whose mora is sounding.

```js
// Glyph placements along a polyline pts=[[x,y],...]; offset animates the text along the path.
function glyphsOnPath(pts, text, offset, spacing) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l); total += l;
  }
  const out = []; let k = 0;
  for (const ch of text) {
    let s = offset + (k++) * spacing;
    if (s < 0 || s > total) continue;
    let j = 0;
    while (j < seg.length - 1 && s > seg[j]) { s -= seg[j]; j++; }
    const f = Math.min(1, s / seg[j]);
    const [x0, y0] = pts[j], [x1, y1] = pts[j + 1];
    out.push({ ch, x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, rot: Math.atan2(y1 - y0, x1 - x0) });
  }
  return out;
}
// wire between poles A,B with sag h (px): y(u) = yA + (yB - yA) * u + 4 * h * u * (1 - u), x(u) = xA + (xB - xA) * u
```

#### T11 · 同字モーフ — same-glyph morph
- **Look:** characters shared between consecutive lines glide to their new positions; the others dissolve out and in. The text seems to rearrange itself.
- **When:** repeated or parallel lines (chorus lines that differ by one word); JIZURA calls this モーフ.
- **How:** match characters (LCS over the two strings, then greedy nearest for duplicates). FLIP-style interpolation with `sineInOut` over 1 beat. Unmatched glyphs: blur plus alpha out (6 f) and alpha in (6 f), offset by 3 f.
- **Beat:** morph starts on the last beat of line n and lands on line n+1's onset.

#### T12 · 打ち直し — typewriter and retype
- **Look:** a line types out with a caret, then backspaces part of it and types a different word: hesitation made visible.
- **When:** the lyric's self-corrections, or where the singer "changes their mind"; verse 2.
- **How:** DotGothic16 or Klee One; 1 character per 16th note; the caret blinks at half-beat. Backspace runs 2× faster than typing.
- **Beat:** typing locked to 16ths; the retyped word lands on a downbeat.

#### T13 · 残像文字 — afterimage type
- **Look:** as each word leaves, it keeps a complementary-coloured ghost that drifts 1–2 px and fades over 0.5–3 s, like a retinal afterimage.
- **When:** the theme effect. Subtle in verses (0.5 s), heavy in the final chorus (3 s; M10).
- **How:** render the type layer into L03's accumulation buffer only (not the background), so the afterimages are typographic. Ghost colour = the palette's `afterimage` hex.
- **Beat:** accumulation gain spikes on word exits.

#### T14 · 灰になる文字 — ember dissolve
- **Look:** a glyph burns from one edge; its body breaks into embers that rise and cool from white to amber, red and ash.
- **When:** exits at the end of the bridge (M8); the last line of the outro.
- **How:** sample points inside the glyph (rejection-sample the alpha mask, 400–1500 per glyph). A burn front = a noise-perturbed plane sweeping across the glyph; points behind the front become particles (G01). The mask shows an ember-orange edge (like E08).
- **Beat:** the front starts on the word's release; the sweep lasts 1–2 beats.

#### T15 · 断ち割り — split kanji
- **Look:** a diagonal slash cuts the glyph; the halves slide apart along the cut and reveal the next scene or word. The cut line glows for 3 frames.
- **When:** chorus キメ; the chorus-2 climax.
- **How:** clip the glyph layer with two half-planes and translate each ±6 % along the cut normal with `expoOut`. The cut line is additive P1 highlight, 3 px.
- **Beat:** the cut lands on the snare; the slide completes in 1 beat.

#### T16 · 網点文字 — halftone type
- **Look:** the text is made of halftone dots; the dots shrink to nothing (dissolve) or swell until they merge (solidify).
- **When:** transitions between the "printed memory" (P5) and the present.
- **How:** F03 halftone applied to the text layer only, with the dot radius scaled by a global `uDissolve` in 0..1.
- **Beat:** dissolve over 2 beats; dot pitch jumps 8 → 12 px on downbeats.

#### T17 · 柱・ノンブル — HUD meta-typography
- **Look:** small corner type: `17:43:12`, `L 12 / 48`, `♩=130.5`, `上り 各駅停車`, `踏切 No.7`, romaji of the current line.
- **When:** always on at 60–70 % opacity, removed in the most emotional shots (a hold with HUD off feels intimate).
- **How:** DotGothic16 (JP) plus IBM Plex Mono (Latin). The clock counts song time mapped to 17:40:00 + t. The line counter comes from lyric timing. Snap to the 12-column grid.
- **Beat:** the colon blinks on each beat; the counter flips on line onsets.

#### T18 · 括弧が開く — brackets open and close
- **Look:** huge 「 」 or 『 』 slide apart to frame the line, then close on it at the phrase end, like a quotation that ends.
- **When:** dialogue-like lines, the title card, the final line.
- **How:** R1 Mincho brackets at 60–90 % height. Opening = `expoOut` 8 f; closing = `expoIn` 6 f followed by a 1-frame snap.
- **Beat:** open on the phrase onset, close on the last mora.

#### T19 · カラオケ塗り — karaoke fill
- **Look:** the whole line is pre-displayed as outline or ghost, and the fill sweeps through it per mora.
- **When:** chorus lines viewers will sing; a clear "sing-along" read.
- **How:** two layers (outline and fill). The fill is clipped by a rectangle whose edge advances piecewise-linearly through the mora onset times, with a soft 6 px feather.
- **Beat:** exact mora timing (lyric agent); fallback is an 8th-note grid.

#### T20 · 縦横✕組 — crossbuck layout
- **Look:** a vertical line and a horizontal line cross in an ✕ or ＋ at the key character, echoing the railway crossbuck sign.
- **When:** pre-chorus and chorus キメ; any crossing shot.
- **How:** layout rule: the shared character sits at the intersection; lines rotate ±30° for ✕ (like the crossbuck). The shared glyph gets the accent colour.
- **Beat:** the vertical line enters on beat 1, the horizontal on beat 3; the shared glyph flashes when both complete.

### 8.B Character & illustration (budget idioms)

#### B01 · 一枚絵カメラ — one-illustration multiplane
- **Look:** a single illustration feels like a camera move through space.
- **When:** every verse; the establishing shot of each section.
- **How:** split the illustration into 3–6 depth layers (sky, far city, mid props, character, foreground wires/grass). Codex can generate layers separately on transparent backgrounds. Parallax: offset_i = camOffset / z_i; scale_i = 1 + (camZoom − 1)/z_i. Slow push 1.00 → 1.08 over 8 bars with `sineInOut`; add K04 handheld at 0.2 %.
- **Beat:** the push speeds up 5 % on downbeats (ease in and out of a tiny kick) so the camera breathes with the music.

#### B02 · 線ゆれ — line boil
- **Look:** contours wobble subtly and discontinuously, like a drawing re-traced every other frame. The tegaki signature.
- **When:** always on for drawn layers; amplitude ×2 in emotional peaks; off for 3D renders unless they go through B11.
- **How:** re-seed a noise displacement every 2 or 3 frames (12 or 8 fps). The amplitude is small: 0.7–1.6 px at 1080p. Better still, apply it to the line layer only (codex can generate line and fill separately, or use a Sobel/threshold line extraction).
- **Beat:** switch to 8 fps (3s) in tired or dragging lines, 12 fps in energetic ones.

```glsl
uniform float uBoilFps;   // 12 (on 2s) or 8 (on 3s)
uniform float uAmpPx;     // 0.7..1.6 px @1080p
uniform float uFreq;      // noise frequency per px, ~0.015
void main(){
  float k = floor(uTime * uBoilFps);
  vec2 px = vUv * uRes;
  vec2 n = vec2(vnoise(px * uFreq + k * 17.13), vnoise(px * uFreq + vec2(91.7, 13.1) + k * 23.71)) - .5;
  fragColor = texture(uTex, vUv + n * 2. * uAmpPx / uRes);
}
```

#### B03 · ループ作画 — 2–3 frame loops
- **Look:** hair strands, a ribbon, heat shimmer or tears cycling through 2–3 drawings.
- **When:** held character shots (> 2 beats).
- **How:** generate 3 variants (codex: "same image, hair slightly shifted left / centre / right"), or fake them with B04 mesh-warp keyed at 3 poses. Play 1-2-3-2 (ping-pong) at 8 fps.
- **Beat:** loop period = 1 beat (4 drawings × 2.79 frames at 24 fps, rounded).

#### B04 · メッシュ変形パペット — mesh-warp puppet
- **Look:** a single illustration tilts its head, breathes and sways, Live2D-lite.
- **When:** singer performance shots (verses, choruses).
- **How:** WebGL: a textured grid (e.g. 24×36) whose vertices are displaced by weighted "bones" (head pivot at the neck, torso pivot at the hips); weights come from painted masks or radial falloff. Canvas2D fallback: per-triangle affine `drawImage` clipped to each destination triangle (expand 0.5 px against seams); ~200 triangles is fine offline. Head yaw as in メズマライザー's 5-point idea: eye and ear widths scale with `cos(yaw)`, features shift by `sin(yaw)·r`. Limit yaw to ±12° so a flat drawing doesn't break.
- **Beat:** head nods on downbeats (2° dip, spring back via B09); torso sways at bar rate.

```js
// Affine that maps source triangle s -> destination triangle d, as ctx.setTransform(a, b, c, d, e, f).
function triAffine(s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
  return [a, b, c, dd, e, f];
}
```

#### B05 · まばたき・呼吸 — blink and breath
- **Look:** the living minimum.
- **When:** any character hold.
- **How:** blink every 2.5–5 s (seeded) using open / half / closed / half / open drawings on frames 1, 1, 2, 1 (24 fps). Breath: shoulders and chest scale y 1.000 → 1.008 at 0.2–0.3 Hz. Never blink during a キメ close-up; a stare is stronger.
- **Beat:** blinks may land on phrase ends (a "listening" blink).

#### B06 · 口パク — lip flaps
- **Look:** 3 mouth shapes (closed, half, open) switching with the vocal.
- **When:** medium shots of the singer only; close-ups use held expressions.
- **How:** drive from the centre-channel 300–3500 Hz envelope (`analysis/asr/center16k.wav` exists), with hysteresis and a 2-frame minimum hold. Open 1 frame early.
- **Beat:** vocal-driven, not beat-driven.

```js
// env: per-frame vocal envelope 0..1. Returns per-frame mouth index 0 closed / 1 half / 2 open.
function mouthTrack(env, open = 0.45, half = 0.2, minHold = 2) {
  const out = []; let cur = 0, held = 0;
  for (let f = 0; f < env.length; f++) {
    const e = env[Math.min(env.length - 1, f + 1)];      // look one frame ahead
    const want = e > open ? 2 : e > half ? 1 : 0;
    if (want !== cur && held >= minHold) { cur = want; held = 0; }
    held++; out.push(cur);
  }
  return out;
}
```

#### B07 · 逆光シルエット — silhouette with rim light
- **Look:** the character goes ink-dark against the sunset with a thin glowing rim on the sun-facing edge.
- **When:** magic-hour shots (P1); faces disappear, which is the 誰そ彼 idea.
- **How:** composite the character layer with its alpha offset toward the sun direction. `uSil` animates 0 → 1 as the sun gets lower (a section-long fade).
- **Beat:** rim intensity `+0.3·pulse` in the chorus.

```glsl
uniform sampler2D uChar;   // character layer RGBA (straight alpha)
uniform vec2 uLightDir;    // unit vector character -> sun (uv space)
uniform vec3 uInk;         // silhouette colour (palette ink)
uniform vec3 uRim;         // rim colour (palette glow/highlight)
uniform float uRimPx;      // 3..8 px
uniform float uSil;        // 0 = colour, 1 = silhouette
void main(){
  vec4 bg = texture(uTex, vUv);
  vec4 ch = texture(uChar, vUv);
  float outside = 1. - texture(uChar, vUv + uLightDir * uRimPx / uRes).a;
  float rim = ch.a * outside;
  vec3 body = mix(ch.rgb, uInk, uSil);
  vec3 col = mix(bg.rgb, body, ch.a) + uRim * rim * (.6 + .8 * uSil);
  fragColor = vec4(col, 1.);
}
```

#### B08 · 目・手・口 — extreme close-up cutting
- **Look:** eye (the sunset reflected in the amber iris), hand (fingers against the sun, light bleeding between them), mouth (a breath), feet (on the rail): one per beat.
- **When:** pre-chorus acceleration; the bridge.
- **How:** crop a hi-res (4K) illustration at 4–8×, or generate dedicated close-ups with codex (cheap and emotional). Add L10 (only the eye in colour) and a moving catch-light.
- **Beat:** 1 cut per beat for 1–2 bars, then a hold.

#### B09 · 揺れもの — hair and ribbon sway (secondary motion)
- **Look:** hair tips and ribbons lag and overshoot the body motion (AE "Auto Sway" style).
- **When:** every puppet shot; wind gusts on chorus entries.
- **How:** a chain of 3–6 damped springs per strand driving mesh bones (B04), or a UV sine warp with amplitude rising from root (0) to tip (1).
- **Beat:** wind impulses on downbeats: target += gust, decays through the spring.

```js
// Damped spring for secondary motion (hair tips, ribbons, barrier-arm bounce). Use fixed dt = 1/24.
function springStep(s, target, dt, k = 40, c = 6) {
  const acc = k * (target - s.x) - c * s.v;
  s.v += acc * dt;
  s.x += s.v * dt;
  return s.x;
}
```

#### B10 · 象徴小物 — symbolic prop inserts
- **Look:** a single object filling the frame for 2–8 frames: a ticket stub, a crossbuck sign, a stopped wristwatch at 17:4x, a cicada shell, a ラムネ marble, a film canister.
- **When:** punctuation between lines; subliminal memory (E03).
- **How:** codex-generated props on transparent backgrounds (§11), P5 gradient map, paper texture.
- **Beat:** on 8th-note pickups before downbeats.

#### B11 · 3D下絵の手描き化 — drawn-over-3D
- **Look:** a train, crossing or city that is clearly 3D in its motion but looks inked and cel-shaded.
- **When:** set pieces (M3, M11) and train passes.
- **How:** Blender: toon shading (Shader to RGB → constant ColorRamp, 2–3 steps), Line Art (Grease Pencil) outlines, **View Transform = Standard**, grey-value render → engine gradient map + B02 line boil + F02 paper. Render at 12 fps (on 2s) to match drawn layers, or at 24 fps for camera moves.
- **Beat:** the Blender camera is keyed from the beat grid (export beats to Blender as markers).

#### B12 · 影の独立 — the independent shadow
- **Look:** the long evening shadow lags the character by a beat, then does something the character doesn't (reaches out, turns away, sings the line).
- **When:** verse 2 onward (M5); it's uncanny and 逢魔が時.
- **How:** the shadow is a separate silhouette sprite projected onto the ground plane with a skew matrix (length ×4–6 along the anti-sun direction). Its pose track = the character's pose track delayed by 1 beat, plus divergent keyframes.
- **Beat:** delay = exactly 1 beat, so the lag reads as musical.

#### B13 · 拍ポーズ — pose-per-beat
- **Look:** the character switches between 4–8 key poses on beats, each with a small zoom kick: the illusion of dance or acting from stills. Classic tegaki.
- **When:** interludes; the chorus "dance" section.
- **How:** codex-generated pose variants (same character sheet; §11). A hard switch plus a 2-frame smear (motion-blurred blend) between them; alternate framing left and right.
- **Beat:** poses on beats 1 and 3, zoom kicks on 2 and 4 (or every beat in the final chorus).

### 8.C Camera & space

#### K01 · 拍ズーム — beat zoom
- **Look:** a tiny push on every beat, larger on downbeats. The frame breathes with the kick.
- **When:** pre-chorus (subtle), chorus (strong); off in verses.
- **How:** scale = 1 + a·pulse(t, 12) about the subject's eye point. a = 0.012 (pre), 0.03 (chorus), 0.05 (final). Downbeat multiplier ×1.6.
- **Beat:** `pulse`, `downbeat`.

#### K02 · クラッシュズーム — crash zoom
- **Look:** a violent 3-frame zoom (1 → 1.6) with radial blur, then a cut or hold.
- **When:** the end of snare fills into a chorus; the reveal of a key word.
- **How:** radial blur shader with strength peaking at 0.3 on the middle frame.
- **Beat:** the last 3 frames before a downbeat.

```glsl
uniform vec2 uCenter;     // zoom centre (uv)
uniform float uStrength;  // 0..0.35
void main(){
  vec4 s = vec4(0.);
  for (int i = 0; i < 24; i++){ float k = float(i) / 23.; s += texture(uTex, mix(vUv, uCenter, k * uStrength)); }
  fragColor = s / 24.;
}
```

#### K03 · ダッチ振り — dutch swing
- **Look:** the horizon tilts ±4–8°, alternating per bar with a "hold" ease.
- **When:** pre-chorus unease; the bridge alarm (P3).
- **How:** rotate about the frame centre; ease = hold-to-snap (§7.4); overscan 6 %.
- **Beat:** flips on downbeats.

#### K04 · 手持ち — handheld drift
- **Look:** a slight organic float, never shaky-cam.
- **When:** under every "photographic" shot; amplitude rises with energy.
- **How:** translate = fbm(t·0.35 + seed)·A with A = 0.2–0.5 % of frame height; roll = 0.3°·fbm. Keep it on 1s even when drawn layers are on 2s.
- **Beat:** amplitude ×(1 + 0.5·energy).

#### K05 · 2.5D ドリー — multiplane dolly
- **Look:** a deep parallax move through layered planes (wires, poles, crossing, city, sky) at different depths.
- **When:** establishing shots; any travelling shot along the railway.
- **How:** layers at z = 1…12; screen x = (X − camX)·f/(Z − camZ). Scale layers by f/(Z − camZ). Fog: gradient-map offset per depth (far layers lighter; atmospheric perspective).
- **Beat:** camZ velocity eased per phrase.

#### K06 · めまい — dolly zoom
- **Look:** the subject stays the same size while the background stretches or compresses: the vertigo of realisation.
- **When:** one moment only: the key line of the bridge.
- **How:** in 2.5D, scale the background planes by k(t) while the subject layer keeps scale 1 (or the reverse); in Blender, animate focal length against camera distance (`d·tan(fov/2)` = const).
- **Beat:** over 2 bars, starting on the phrase.

#### K07 · ホイップパン — whip pan
- **Look:** a 4–6 frame horizontal smear that joins two shots.
- **When:** chorus-internal shot changes; bursts.
- **How:** a directional blur of 40–120 px, peaking at the cut frame; cut at maximum blur. Both shots move in the same direction.
- **Beat:** the cut frame is the beat frame.

```glsl
uniform vec2 uDir;       // blur vector in px (e.g. vec2(110., 0.))
void main(){
  vec4 s = vec4(0.);
  for (int i = 0; i < 32; i++){ float k = float(i) / 31. - .5; s += texture(uTex, vUv + uDir * k / uRes); }
  fragColor = s / 32.;
}
```

#### K08 · 文字の回廊 — z-stacked lyric fly-through
- **Look:** successive lyric lines hang in depth like station signs; the camera flies forward through them, and each line passes the lens as it is sung.
- **When:** the long one-take in chorus 2 (repeated lines) or last chorus 1.
- **How:** line i at z_i = −i·D (D = 6 units); camZ(t) is interpolated so line i crosses z_cam − near exactly at its onset. Perspective scale f/(Z − camZ); opacity fades near the lens (dz < 1.2) to avoid a giant blur. Background planes (K05) continue behind.
- **Beat:** crossing time = vocal onset of the line; small bank ±3° per bar.

#### K09 · ピント送り — rack focus
- **Look:** focus shifts from foreground text to the background character, or back.
- **When:** the handoff between lyric-dominant and character-dominant beats.
- **How:** per-layer blur (dual Kawase, L07 passes) with radius r = k·|z − zFocus|; animate zFocus with `sineInOut` over 1 beat. Add a slight "breathing" scale of 1–2 %.
- **Beat:** focus lands on the vocal onset of the next phrase.

#### K10 · 周回 — orbit
- **Look:** the camera circles a 3D object (kanji sculpture, crossing, lamp).
- **When:** M3; chorus downbeat hold.
- **How:** Blender camera on a circle constraint, or WebGL instanced text extrusions. Speed eases in and out per 2 bars; a 25–35 mm lens for drama.
- **Beat:** a revolution quarter per bar.

#### K11 · ビー玉レンズ — marble / fisheye refraction
- **Look:** the sunset seen through a ラムネ marble or a drop of water: a round, inverted, bulging refraction (AE CC Lens / fisheye equivalent).
- **When:** memory inserts; a match-cut partner for circles (E09).
- **How:** inside radius R: uv' = centre − (uv − centre)·(1.8 − 0.8·r²/R²) (inverted, bulged); rim with a thin bright Fresnel ring and a slight chromatic split (F04 at 3×).
- **Beat:** the marble rolls in on an 8th pickup; R pulses with the kick.

### 8.D Light & colour

#### L01 · グラデーションマップ — gradient-map grade
- **Look:** any greyscale or colour source is recoloured into the palette ramp, so everything looks like one film.
- **When:** always, as the last colour stage of every layer group (or globally).
- **How:** the LUTs in `assets/style/luts/`. Luma → LUT lookup; optional posterise (`uSteps`) for cel-banded skies (L11); `uOffset` shifts the ramp darker as the evening goes on; a second LUT enables scrubs (L08).
- **Beat:** `uOffset += 0.04·pulse` in the chorus gives a subtle "light pulse" on the kick.

```glsl
uniform sampler2D uLut;     // 256x1 LUT (LINEAR, CLAMP_TO_EDGE)
uniform sampler2D uLut2;    // second LUT for scrubs; bind uLut again if unused
uniform float uMix;         // 0..1 uLut -> uLut2
uniform float uAmount;      // 0..1 blend with the source
uniform float uSteps;       // 0 = smooth; 3..6 = cel bands
uniform float uOffset;      // -0.15..0.15 ramp shift
vec3 lutAt(sampler2D s, float l){ return texture(s, vec2(clamp(l, 0., 1.) * 255. / 256. + .5 / 256., .5)).rgb; }
void main(){
  vec4 src = texture(uTex, vUv);
  float l = clamp(luma(src.rgb) + uOffset, 0., 1.);
  if (uSteps > .5) l = (floor(l * uSteps) + .5) / uSteps;
  vec3 g = mix(lutAt(uLut, l), lutAt(uLut2, l), uMix);
  fragColor = vec4(mix(src.rgb, g, uAmount), src.a);
}
```

#### L02 · 反転 — duotone flip / motivated inversion
- **Look:** the duotone swaps ink and light for a frame, a beat or a bar: the negative of the scene.
- **When:** after bright events (flash, sun, lamp) in pre-chorus 2, the chorus-2 climax and the ending tail.
- **How:** map luma through the duotone and flip with `uFlip`. For a soft flip, animate `uFlip` over 2 frames.
- **Beat:** downbeats only, ≤ 2 per second (§7.6).

```glsl
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uFlip;   // 0 normal, 1 inverted
void main(){
  vec4 s = texture(uTex, vUv);
  float l = smoothstep(.05, .95, luma(s.rgb));
  l = mix(l, 1. - l, uFlip);
  fragColor = vec4(mix(uDark, uLight, l), s.a);
}
```

#### L03 · 補色残像 — negative afterimage (the signature effect)
- **Look:** where a bright thing *was* (the sun, a lamp, a word), a complementary-coloured ghost stays and fades over 0.5–3 s, exactly like staring at the sun and then looking away. Orange sun → cyan ghost. It's 残光 made literal.
- **When:** whole film. Verses 0.5 s / amount 0.3; chorus 1.5 s / 0.5; final chorus 3 s / 0.8; ending tail 3 s / 1.0 (M1, M10).
- **How:** two passes. Pass A keeps a max-decay accumulation of bright pixels in a ping-pong RGBA16F FBO. Pass B draws the complement of the accumulation **only where the light is gone** (accumulated brightness > current). Retention per frame r = 0.02^(1/(fps·seconds)): 0.897 for 1.5 s @24, 0.947 for 3 s. Pre-roll frames when chunk-rendering (§7.5).
- **Beat:** `uThresh` drops by 0.1 on downbeats (more burns in on hits); `uAmt` follows the section budget.

```glsl
// Pass A: accumulation (render into ping-pong FBO)
uniform sampler2D uPrev;    // previous accumulation
uniform float uRetain;      // per-frame retention (0.897 = 1.5 s @24 fps)
uniform float uThresh;      // 0.55..0.75
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float b = smoothstep(uThresh, 1., luma(c));
  vec3 prev = texture(uPrev, vUv).rgb * uRetain;
  fragColor = vec4(max(prev, c * b), 1.);
}
```

```glsl
// Pass B: composite the retinal afterimage
uniform sampler2D uAcc;     // pass-A output
uniform float uAmt;         // 0..1
uniform float uBlurPx;      // 2..6: afterimages are soft
uniform float uNegative;    // 1 = complementary (retina), 0 = positive warm trail
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  vec2 o = uBlurPx / uRes;
  vec3 a = (texture(uAcc, vUv + vec2(o.x, 0.)).rgb + texture(uAcc, vUv - vec2(o.x, 0.)).rgb
          + texture(uAcc, vUv + vec2(0., o.y)).rgb + texture(uAcc, vUv - vec2(0., o.y)).rgb) * .25;
  float mx = max(a.r, max(a.g, a.b)), mn = min(a.r, min(a.g, a.b));
  vec3 ghost = mix(a, vec3(mx + mn) - a, uNegative);       // complementary hue, same lightness
  float gone = clamp((mx - luma(c)) * 2., 0., 1.);          // light that was here but is no longer
  fragColor = vec4(c + ghost * gone * uAmt, 1.);
}
```

#### L04 · 光漏れ — light leak
- **Look:** warm, soft blobs of light bleeding in from the frame edges and drifting, like old film fogging.
- **When:** memory (P5), transitions, chorus 2's golden moment. Present in 3–8 % of shots.
- **How:** an fbm blob screened in along one frame edge (the seed picks left or right); tint = P1 glow/sunset.
- **Beat:** amount pulses `+0.15·pulse` in the chorus; leaks "flare up" at section boundaries.

```glsl
uniform vec3 uTint;    // e.g. #FFA552
uniform float uAmt;    // 0..0.6
void main(){
  vec4 s = texture(uTex, vUv);
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.);
  float t = uTime * .06 + uSeed * 7.;
  float n = fbm(p * 1.2 + vec2(t, -.6 * t));
  float side = mix(vUv.x, 1. - vUv.x, step(.5, fract(uSeed * .37)));   // seed picks the left or right edge
  float edge = 1. - smoothstep(0., .6, side + .1 * sin(t));
  float leak = smoothstep(.3, .65, n) * edge;
  fragColor = vec4(screenB(s.rgb, uTint * leak * uAmt * 1.6), s.a);
}
```

#### L05 · アナモフレア — anamorphic streak and ghosts
- **Look:** a thin horizontal blue-white streak through the sun and lamps, with lens ghosts mirrored through the frame centre.
- **When:** sun and lamp close-ups, choruses, the train headlight.
- **How:** bright pass (threshold 0.85, soft knee) at ¼ resolution → wide 1D horizontal blur (2–3 iterations) → tint `vec3(.55,.75,1.25)` → add. Ghosts: sample the bright pass at `centre − (uv − centre)·k` for k in {0.5, −0.3, 1.4}, tinted from the palette, sized by k.
- **Beat:** streak intensity `+0.5·pulse` on kicks in the chorus.

```glsl
uniform sampler2D uBright;  // thresholded bright pass (quarter res)
uniform float uStepPx;      // tap spacing in px at this resolution (2..4)
void main(){
  vec3 s = vec3(0.); float w = 0.;
  for (int i = -24; i <= 24; i++){
    float fi = float(i), k = exp(-abs(fi) / 9.);
    s += texture(uBright, vUv + vec2(fi * uStepPx / uRes.x, 0.)).rgb * k; w += k;
  }
  fragColor = vec4(s / w * vec3(.55, .75, 1.25), 1.);
}
```

#### L06 · 光芒 — god rays / crepuscular rays
- **Look:** shafts of light radiating from the low sun through wires, poles, hair and letters.
- **When:** magic-hour holds; the chorus key visual; the title.
- **How:** screen-space radial sampling of an occlusion mask (sky = 1, occluders = 0) toward the sun position (GPU Gems 3, ch. 13 approach). 64 samples, **normalised** (the sum is divided by the total weight), so `uExposure` is intuitive: 0.35–0.6. Radial falloff `uFalloff` 1.5–3 keeps the rays near the sun instead of hazing the whole frame. Density 0.9, decay 0.965.
- **Beat:** exposure `+0.15·pulse`; the sun position is keyed by the time-of-day script (L08).

```glsl
uniform sampler2D uOcc;     // 1 = light/sky, 0 = occluder (text, wires, character); a luma-thresholded frame works
uniform vec2 uSun;          // sun position (uv)
uniform float uDensity;     // 0.9
uniform float uDecay;       // 0.965
uniform float uExposure;    // 0.35..0.6
uniform float uFalloff;     // 1.5..3
uniform vec3 uRayCol;       // palette glow
void main(){
  vec2 uv = vUv;
  vec2 d = (uv - uSun) * (uDensity / 64.);
  float illum = 1., acc = 0., norm = 0.;
  for (int i = 0; i < 64; i++){ uv -= d; acc += texture(uOcc, uv).r * illum; norm += illum; illum *= uDecay; }
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  float fall = exp(-length((vUv - uSun) * asp) * uFalloff);
  vec3 c = texture(uTex, vUv).rgb;
  fragColor = vec4(screenB(c, uRayCol * (acc / norm) * fall * uExposure), 1.);
}
```

#### L07 · 発光 — bloom and glow
- **Look:** soft, wide glow around lamps, embers, fireflies and white type (AE "Deep Glow" look).
- **When:** always on, subtly; heavy in P4 (fireflies) and at night.
- **How:** threshold with a soft knee (0.7–0.8), then a 5-level **dual-Kawase** down/up chain, added back at 0.4–1.0. Tint glow slightly toward the palette's highlight.
- **Beat:** bloom intensity follows `energy`.

```glsl
// Dual-Kawase DOWNsample pass (run ~5 times, halving the target each time). uTexel = 1 / source size.
uniform vec2 uTexel;
void main(){
  vec4 s = texture(uTex, vUv) * 4.;
  s += texture(uTex, vUv - uTexel);
  s += texture(uTex, vUv + uTexel);
  s += texture(uTex, vUv + vec2(uTexel.x, -uTexel.y));
  s += texture(uTex, vUv - vec2(uTexel.x, -uTexel.y));
  fragColor = s / 8.;
}
```

```glsl
// Dual-Kawase UPsample pass (run back up the chain, adding to the next-larger level).
uniform vec2 uTexel;
void main(){
  vec4 s = texture(uTex, vUv + vec2(-uTexel.x * 2., 0.));
  s += texture(uTex, vUv + vec2(-uTexel.x, uTexel.y)) * 2.;
  s += texture(uTex, vUv + vec2(0., uTexel.y * 2.));
  s += texture(uTex, vUv + vec2(uTexel.x, uTexel.y)) * 2.;
  s += texture(uTex, vUv + vec2(uTexel.x * 2., 0.));
  s += texture(uTex, vUv + vec2(uTexel.x, -uTexel.y)) * 2.;
  s += texture(uTex, vUv + vec2(0., -uTexel.y * 2.));
  s += texture(uTex, vUv + vec2(-uTexel.x, -uTexel.y)) * 2.;
  fragColor = s / 12.;
}
```

#### L08 · 時刻スクラブ — time-of-day scrub
- **Look:** the whole world moves continuously from golden hour to blue hour: sky bands shift, shadows lengthen, lamps come on. Played in reverse in the final chorus (M9).
- **When:** the macro colour script (§1). The explicit on-screen scrub happens in the bridge (the sunset, 2:34–2:56) and is reversed in last chorus 1 (3:03–3:18).
- **How:** drive L01's `uMix` between LUT pairs (P2→P1, then P1→P4) with a global "sun altitude" curve `alt(t)`. The same curve drives the sun y-position, shadow length (B12 skew ∝ 1/tan(alt)), G05 lamps (on when alt < threshold_i), and L06 exposure.
- **Beat:** eased continuously; lamps switch on exactly on beats.

#### L09 · ベタ色カット — colour-block frames
- **Look:** 1–2 frames of a flat palette colour between shots: chromatic punctuation.
- **When:** chorus bursts; before キメ.
- **How:** full-frame palette role (dusk, vermilion, caution). Never pure white (that's E02). Never more than 1 per beat.
- **Beat:** on 8th-note pickups.

#### L10 · 色抽出 — only the eyes in colour
- **Look:** the frame is monochrome except one element: eyes, the sun, a lamp, a red thread (AE Color Range / B&W with mask).
- **When:** close-ups (B08); memory (P5) with the present intruding.
- **How:** a mask layer (painted or keyed by hue) mixes the full-colour grade with the duotone grade.
- **Beat:** mask expands `+2 %·pulse`.

#### L11 · 空の階調 — cel-banded sky
- **Look:** the sky shows as 4–6 flat colour bands (posterised), as in cel backgrounds and screen printing.
- **When:** every sky in P1/P2/P4; it makes procedural gradients look drawn.
- **How:** L01 with `uSteps` = 4–6 on the sky layer only. Add 1–2 px dithering noise at band edges so they don't alias.
- **Beat:** bands shift one step on downbeats during chorus 2's sunset (the sky "clicks" darker).

#### L12 · きらめき — specular glints on rails and wires
- **Look:** tiny four-point star glints sliding along rails and power lines, catching the low sun.
- **When:** railway shots, wide establishing frames.
- **How:** glint sprite (cross + halo, additive) whose position runs along the rail polyline (T10's path sampler); brightness ∝ how well the segment normal faces the sun.
- **Beat:** one glint per bar travels the full rail; extra glints on accented beats.

### 8.E Editing & transitions

#### E01 · カット割り — cut-on-beat grammar (shot-length table)
- **Look:** a rhythm the viewer feels without noticing.
- **When / how:** shot length in beats:

| Section | Default shot | Shortest | Longest hold | Cuts land |
|---|---|---|---|---|
| Intro | 8–16 beats | 4 | whole intro | downbeats |
| Verse | 4–8 | 2 | 16 (the "one-illustration" hold) | phrase starts |
| Pre-chorus | 2–4, accelerating 4→2→1 | 1 | — | beats |
| Chorus | 1–2 in bursts, then a 4–8 hold | ½ (8th, only for ≤ 1 bar) | 8 | beats, −1 frame |
| Bridge | 8–32 (long) or a burst montage (走馬灯) | 2 f (inserts) | 32 | phrases |
| Final chorus | chorus-1 layout ×1.5 density plus one-takes | ½ | one-take 16+ | beats |
| Outro | 4–8, decelerating | — | last shot to the hard end | final hit |

- **Beat:** cut on the frame before the beat frame (§7.2).

#### E02 · フラッシュ — flash frame
- **Look:** 1 frame of white (or P1 highlight) followed by 1 frame at 40 %.
- **When:** section starts, キメ, the first chorus downbeat, the ending.
- **How:** full-frame additive white. **≤ 3/s, and ≤ 2 bars of quarter-note flashing** (§7.6).
- **Beat:** on the beat frame.

#### E03 · サブリミナル — subliminal insert
- **Look:** 1–2 frames of a memory image (a face, a prop, a single kanji) inside a shot, barely perceived.
- **When:** verse 2, the bridge, the final chorus; ≤ 1 per 4 bars.
- **How:** P5 gradient map + F09 film gate; keep the luminance close to the host shot (it's the content, not a flash).
- **Beat:** on off-beats (the "and" of 4) so it feels intrusive.

#### E04 · スタッター・止め — stutter, repeat and freeze
- **Look:** the image repeats its last 2–4 frames 2–3 times, then freezes (止め).
- **When:** vocal chops or glitch fills in the track; the last word of the pre-chorus.
- **How:** time remap for the layer during a stutter window (below). A freeze adds grain only (the grain keeps moving, so the frame isn't dead).
- **Beat:** repeat length = a 16th or 8th note.

```js
// Source-time remap for a stutter: during [t0, t0 + len*n) keep replaying [t0 - len, t0).
function stutterTime(t, t0, len, n) {
  if (t < t0 || t >= t0 + len * n) return t;
  return t0 - len + ((t - t0) % len);
}
```

#### E05 · コマ割り — manga-panel split screen
- **Look:** the frame splits into 2–4 panels with thick gutters (ink or paper colour), each showing the same moment from another angle (eye / hand / crossing / sky), then collapses back.
- **When:** pre-chorus build; the chorus-2 dance section.
- **How:** panel rects in a layout table (diagonal gutters feel more manga-like; e.g. a 12° slant). Each panel is a clipped render of a sub-scene. Panels open with a 1/8-note stagger, and gutters draw on like pen lines (T01 technique on straight lines).
- **Beat:** panel n opens on 8th n; everything merges on the downbeat.

#### E06 · 夕日アイリス — sunset iris
- **Look:** the old iris-out, but the circle is the sun and it sinks below the horizon line, which is the lyric's underline.
- **When:** end of intro 1; the end of the bridge (the sunset proper, into break 3).
- **How:** circle mask about the sun, clipped below a horizon line; animate radius and sun y together.
- **Beat:** the sun touches the horizon on the last beat of the phrase.

```glsl
uniform sampler2D uNext;
uniform vec2 uSun;        // sun centre (uv)
uniform float uRadius;    // in frame heights: animate 1.2 -> 0 to iris-in onto the sun
uniform float uHorizon;   // uv.y of the horizon line: the circle is clipped below it
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  float d = distance(vUv * asp, uSun * asp);
  float inside = (1. - smoothstep(uRadius - 1.5 / uRes.y, uRadius, d)) * step(uHorizon, vUv.y);
  fragColor = vec4(mix(texture(uNext, vUv).rgb, texture(uTex, vUv).rgb, inside), 1.);
}
```

#### E07 · 墨ワイプ — sumi ink wipe
- **Look:** ink blooms outward from a point with a ragged, pooled edge (darker rim, as ink dries) and reveals the next shot.
- **When:** P5 memory ↔ present transitions; verses.
- **How:** threshold of distance + fbm against progress; darken the rim.
- **Beat:** 2 beats; ignition on a downbeat.

```glsl
uniform sampler2D uNext;
uniform float uP;         // 0..1 progress
uniform vec2 uOrigin;     // ink drop position (uv)
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  float n = fbm(vUv * 4. + uSeed) * .5 + fbm(vUv * 18. - uSeed) * .15;
  float k = distance(vUv * asp, uOrigin * asp) + n * .6 - uP * 1.9;
  float m = 1. - smoothstep(-.01, .01, k);
  float rim = exp(-abs(k) * 60.);
  vec3 c = mix(texture(uTex, vUv).rgb, texture(uNext, vUv).rgb, m);
  fragColor = vec4(c * (1. - rim * .45), 1.);
}
```

#### E08 · フィルム焼け — film burn transition
- **Look:** the film frame melts, starting from its brightest point (the sun), with an ember-orange front and a white-hot edge, scorching brown around the hole, and the next shot shows through. The burning edge sheds embers (G01) that become fireflies (M8).
- **When:** bridge → break 3 (the day literally burns out, M8); memory endings (AE CC Burn Film equivalent).
- **How:** the burn field = distance from the ignition point + fbm − luma, so bright areas burn first. Progress over 1.5–3 beats with `expoIn`.
- **Beat:** ignition on the last word of the chorus; burnt through by the next downbeat.

```glsl
uniform sampler2D uNext;
uniform float uP;         // 0..1
uniform vec2 uOrigin;     // ignition point (uv): the brightest point of the outgoing shot
void main(){
  vec3 a = texture(uTex, vUv).rgb, b = texture(uNext, vUv).rgb;
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  float n = distance(vUv * asp, uOrigin * asp) + fbm(vUv * 5. + uSeed) * .45 - luma(a) * .2;
  float k = n - uP * 1.6;                                   // < 0: burnt through
  float keep = smoothstep(-.004, .004, k);
  float scorch = (1. - smoothstep(0., .09, k)) * keep;
  vec3 col = mix(b, a * (1. - .85 * scorch) + vec3(.35, .12, .02) * scorch, keep);
  col += vec3(1., .5, .12) * exp(-abs(k) * 55.) * 1.6;      // ember front
  col += vec3(1., .92, .75) * exp(-abs(k) * 220.);          // white-hot edge
  fragColor = vec4(col, 1.);
}
```

#### E09 · 円のマッチカット — circle match cut
- **Look:** sun → crossing lamp → 「。」 → iris → firefly → marble → film reel, cutting on identical position and size, so the shape carries across the cut.
- **When:** the connective tissue of the whole film; at least one per section.
- **How:** each shot registers its "hero circle" (centre, radius) in the shot data. The transition solves a camera offset and scale so circle A in the outgoing frame = circle B in the incoming frame at the cut frame; 3 frames of motion blur continue across the cut.
- **Beat:** on beats (hard cut) or with a 2-frame white flash for a bigger hit.

#### E10 · 暗転 — smash to black / silence
- **Look:** a hard cut to black at a vocal break or rest; the only thing left is the afterimage (L03 at amount 1).
- **When:** before the first chorus (溜め), the break at ~2:57, and the **end at 3:43.54** (223.54 s; M1/M10).
- **How:** black background with L03 still running on the last frame's accumulation (the retina keeps seeing).
- **Beat:** at the exact silence onset (from the analysis: RMS drop).

#### E11 · 遮断機ワイプ — barrier-arm wipe
- **Look:** a striped crossing barrier swings down across the frame from its pivot and sweeps the next shot in behind it, with a bounce at the bottom.
- **When:** pre-chorus → chorus (the gate closes and the train comes); P3.
- **How:** pivot at the bottom-left, just off frame. The angle animates π/2 → 0 in 1 beat with a B09 spring bounce (overshoot −4°). The swept side shows the next shot.
- **Beat:** the arm lands on the downbeat; lamps (G04) blink throughout.

```glsl
uniform sampler2D uNext;
uniform vec2 uPivot;      // hinge in uv, e.g. vec2(-0.02, 0.08)
uniform float uAngle;     // radians: 1.5708 (up) -> 0 (down)
uniform float uStripePx;  // stripe length in px (~45)
uniform vec3 uColA;       // hazard colour A (P3 caution / signal)
uniform vec3 uColB;       // hazard colour B (black / white)
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 p = (vUv - uPivot) * asp;
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  float side = dir.x * p.y - dir.y * p.x;          // > 0: already swept
  float along = dot(p, dir);
  vec3 col = side > 0. ? texture(uNext, vUv).rgb : texture(uTex, vUv).rgb;
  float onArm = step(abs(side), .03) * step(0., along);
  float stripe = step(.5, fract(along * uRes.y / uStripePx));
  col = mix(col, mix(uColA, uColB, stripe), onArm);
  fragColor = vec4(col, 1.);
}
```

#### E12 · 電車通過 — train-pass wipe
- **Look:** a train crosses the foreground and fills the frame. Its windows strobe the next scene between the carriages, and each window carries one lyric character.
- **When:** chorus-1 drop; the final chorus (M11).
- **How:** a train silhouette strip (Blender render or procedural rectangles) scrolls at speed v. Windows are a mask showing the next shot (or text); carriage gaps show the previous shot, and the flicker is the transition. Choose v so windows pass at the 8th-note rate. Motion blur along x.
- **Beat:** `v = pitch · 2 · bpm / 60` px/s (one window per 8th); the last carriage clears on a downbeat.

```js
// Train speed so that windows (pitch px apart) pass at `perBeat` windows per beat.
const trainSpeed = (windowPitchPx, bpm, perBeat = 2) => windowPitchPx * perBeat * bpm / 60;
```

#### E13 · スリットスキャン — slit-scan time smear
- **Look:** each column of the frame shows a different moment (left = now, right = the past), so moving things stretch into time-ribbons. Memory rendered as space.
- **When:** the bridge (time stretching); the "rewind" in the final chorus.
- **How:** a ring buffer of the last N frames at half resolution in a `sampler2DArray` (N = 48; ~200 MB at 960×540 RGBA8, fine on 10 GB).
- **Beat:** `uSpan` ramps 0 → 40 over the phrase; snaps back to 0 on the downbeat.

```glsl
uniform highp sampler2DArray uHist;  // ring buffer of past frames
uniform float uHead;                 // layer index of the newest frame
uniform float uN;                    // ring size (48)
uniform float uSpan;                 // max delay across the screen in frames (<= uN - 1)
void main(){
  float delay = floor(vUv.x * uSpan);
  float layer = mod(uHead - delay + uN, uN);
  fragColor = texture(uHist, vec3(vUv, layer));
}
```

#### E14 · 残像ディゾルブ — afterimage dissolve
- **Look:** the outgoing shot cuts away, but its bright parts linger as complementary ghosts over the new shot for 1–2 s.
- **When:** the default soft transition of the whole film (it's the theme); verses and holds.
- **How:** a hard cut plus L03 with a temporary `uAmt` boost (0.8 → section value over 1.5 s).
- **Beat:** cut on the beat; the ghost fades by the next downbeat.

#### E15 · まばたきカット — blink cut
- **Look:** point-of-view eyelids close from top and bottom (curved, with lashes as a dark soft edge) and open on a new shot (AE CC Jaws equivalent).
- **When:** "waking from a memory"; P5 → present.
- **How:** two elliptical masks meeting at the centre; the closed state holds 2–3 frames of black; soft 30 px edge plus slight blur.
- **Beat:** close on beat 4, open on the downbeat.

### 8.F Texture & finish

#### F01 · 粒子・周辺減光 — film grain and vignette
- **Look:** living film grain (more in the shadows) and a soft light falloff. It's the glue between procedural, AI and 3D sources.
- **When:** always on. Grain 0.035 (clean) to 0.08 (memory); vignette 0.15–0.45.
- **How:** triangular per-pixel noise re-seeded at 24 fps (even on held frames); vignette on aspect-corrected radius.
- **Beat:** grain `+0.02·pulse` in the bridge (a nervous texture).

```glsl
uniform float uGrain;   // 0.035..0.08
uniform float uVig;     // 0.15..0.45
void main(){
  vec4 s = texture(uTex, vUv);
  float f = floor(uTime * 24.);
  vec2 p = vUv * uRes;
  float n = hash12(p + f * 131.7) + hash12(p * 1.37 + f * 71.3) - 1.;
  vec3 c = s.rgb + n * uGrain * (1.2 - luma(s.rgb));
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  c *= 1. - uVig * smoothstep(.45, 1.05, length(q));
  fragColor = vec4(c, s.a);
}
```

#### F02 · 紙 — paper texture
- **Look:** fibres and tooth of drawing paper under everything. It says "hand-made".
- **When:** always on at 8–25 % (multiply). It does **not** boil; it only shifts on cuts (the "new sheet" feel). Strong in P5.
- **How:** procedural: fbm at 3 scales plus a few long fibre strokes (random thin lines at 3 % opacity), baked once to a 2K tileable texture; or a codex-generated paper scan. Multiply or soft light (the AE practice: soft light 20–50 % with the position on hold keyframes).
- **Beat:** the offset jumps on cuts.

#### F03 · 網点 — halftone screen
- **Look:** manga screentone or print dots; tones become dots.
- **When:** P5 memory, chorus-2 graphic moments, T16.
- **How:** rotated grid; per-cell luminance sampled at the cell centre; area-correct dot radius.
- **Beat:** dot pitch 8 → 12 px on downbeats; angle flips 15° ↔ 45° on section changes.

```glsl
uniform float uCell;    // dot pitch in px (6..14)
uniform float uAngle;   // radians (0.2618 = 15 deg, 0.7854 = 45 deg)
uniform vec3 uInk;
uniform vec3 uPaper;
void main(){
  vec2 px = vUv * uRes;
  mat2 R = mat2(cos(uAngle), -sin(uAngle), sin(uAngle), cos(uAngle));
  vec2 q = R * px / uCell;
  vec2 cc = floor(q) + .5;
  vec2 sampleUv = (transpose(R) * (cc * uCell)) / uRes;
  float l = luma(texture(uTex, sampleUv).rgb);
  float r = .7071 * sqrt(1. - l);
  float d = length(fract(q) - .5);
  float aa = fwidth(d);
  float ink = 1. - smoothstep(r - aa, r + aa, d);
  fragColor = vec4(mix(uPaper, uInk, ink), 1.);
}
```

#### F04 · 色収差 — chromatic aberration
- **Look:** red/blue fringes that grow toward the frame edges; lens imperfection and emotional overload.
- **When:** subtle always (1–2 px); strong on chorus kicks, crash zooms and glitches.
- **How:** radial R/B offset; about uAmtPx per axis at the corners.
- **Beat:** `uAmtPx = base + 6·pulse` in the chorus.

```glsl
uniform float uAmtPx;   // 1..10
void main(){
  vec2 c = vUv - .5;
  vec2 off = c * length(c) * 2.828 * uAmtPx / uRes;
  vec4 g = texture(uTex, vUv);
  fragColor = vec4(texture(uTex, vUv + off).r, g.g, texture(uTex, vUv - off).b, g.a);
}
```

#### F05 · 走査線 — scanlines / CRT
- **Look:** a horizontal line structure, slight barrel curvature and phosphor glow: a recorded or televised memory.
- **When:** the "home video" or TV memory moments (P5), the HUD layer.
- **How:** multiply `1 − a·(0.5 + 0.5·sin(y·π·H/2))` with a = 0.15–0.3; barrel uv' = uv + (uv − .5)·k·r² with k = 0.04; small bloom.
- **Beat:** a brightness "roll bar" crosses once per bar.

#### F06 · VHS — tape
- **Look:** per-line horizontal jitter, a rolling tracking band with snow, chroma smearing to the right, interlace dimming.
- **When:** one memory sequence (a summer home video), no more. Don't overuse.
- **How:** YIQ split: luma sharp, chroma horizontally smeared; jitter per line pair at 29.97 fps.
- **Beat:** tracking band jumps on snare hits.

```glsl
uniform float uAmt;     // 0..1
vec3 rgb2yiq(vec3 c){ return mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c; }
vec3 yiq2rgb(vec3 c){ return mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * c; }
void main(){
  float f = floor(uTime * 29.97);
  float band = exp(-pow((fract(vUv.y + uTime * .11) - .5) * 18., 2.));
  float line = floor(vUv.y * uRes.y * .5);
  float jit = (hash12(vec2(line, f)) - .5) * (1.5 + 14. * band) * uAmt / uRes.x;
  vec2 uv = vec2(vUv.x + jit, vUv.y);
  float Y = rgb2yiq(texture(uTex, uv).rgb).x;
  vec2 iq = vec2(0.);
  for (int i = 0; i < 8; i++) iq += rgb2yiq(texture(uTex, uv - vec2(float(i) * 2.5 / uRes.x, 0.)).rgb).yz;
  vec3 c = yiq2rgb(vec3(Y, iq / 8. * (1. + .3 * uAmt)));
  c += (hash12(vUv * uRes + f) - .5) * .12 * band * uAmt;
  c *= 1. - .12 * uAmt * step(.5, fract(vUv.y * uRes.y * .5));
  fragColor = vec4(c, 1.);
}
```

#### F07 · スライスグリッチ — slice glitch
- **Look:** horizontal slices jump sideways with RGB separation for 1–3 frames.
- **When:** sparingly: chorus 2 and the last chorus, and only where the track has stops or stutters. It doesn't suit 残光's nostalgic tone as a constant.
- **How:** per-slice hash offset at 12 fps; ≤ 35 % of slices active.
- **Beat:** hat or snare onsets in glitchy passages; `uAmt` = onset strength.

```glsl
uniform float uAmt;      // 0..1
uniform float uSlices;   // 12..40
void main(){
  float f = floor(uTime * 12.);
  float row = floor(vUv.y * uSlices + hash12(vec2(f, 3.)) * 3.);
  float on = step(1. - .35 * uAmt, hash12(vec2(row, f)));
  float dx = (hash12(vec2(row * 7.1, f + 1.)) - .5) * .25 * uAmt * on;
  vec2 uv = vec2(fract(vUv.x + dx), vUv.y);
  float sp = .004 * on;
  fragColor = vec4(texture(uTex, uv + vec2(sp, 0.)).r, texture(uTex, uv).g, texture(uTex, uv - vec2(sp, 0.)).b, 1.);
}
```

#### F08 · 1bitディザ — ordered dither
- **Look:** 1-bit Bayer-pattern duotone, like an LED station board or an old handheld game.
- **When:** P3 signage, DotGothic16 HUD moments, one retro-memory cut.
- **How:** 4×4 Bayer against luma at a chunky pixel size (2–4 px).
- **Beat:** pixel size doubles on downbeats (a crunchy pulse).

```glsl
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uPix;     // 2..4 px
float bayer4(vec2 p){
  ivec2 i = ivec2(mod(p, 4.));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.x + i.y * 4]) + .5) / 16.;
}
void main(){
  vec2 cell = floor(vUv * uRes / uPix);
  vec3 c = texture(uTex, (cell + .5) * uPix / uRes).rgb;
  fragColor = vec4(mix(uDark, uLight, step(bayer4(cell), luma(c))), 1.);
}
```

#### F09 · 8mmゲート — film gate
- **Look:** gate weave (±0.3 % jitter per frame), exposure flicker (±4 %), a rounded gate edge, sprocket holes at the side, a frame line that slips on the cut.
- **When:** P5 memories; the 走馬灯 (M7).
- **How:** transform jitter from a per-frame hash; flicker = 1 + 0.04·(hash − 0.5); gate mask = rounded-rect SDF with a soft 12 px edge; sprockets drawn as rounded rects in a side band.
- **Beat:** a frame-line slip (a vertical roll of 10 % over 2 frames) on hard cuts.

#### F10 · 傷と埃 — dust and scratches
- **Look:** white and black specks, hairs and vertical scratches, different every frame.
- **When:** with F09; lightly over P5 and P2 night scenes.
- **How:** per frame, spawn 0–4 specks (radius 1–3 px) and 0–1 hairs (short Bézier) from seeded random; a scratch is a 1 px vertical line that lives for 6–20 frames with x-jitter.
- **Beat:** density follows energy.

#### F11 · ピクセルソート風 — light smear
- **Look:** bright areas melt downward or sideways in streaks, like pixel sorting: light dripping.
- **When:** the sunset melt in the bridge; the chorus-2 ending stop.
- **How (GPU approximation):** for each pixel, march up to 64 px against the smear direction and take the max-luma sample whose luma > threshold, weighted by distance. A true sort can be done on the CPU for a handful of key frames.
- **Beat:** smear length ramps with `section.p`.

#### F12 · コマ打ち — posterise time
- **Look:** drawn layers step at 12 or 8 fps while the camera stays smooth.
- **When:** always for drawn layers; 8 fps for tired, dreamy passages; 24 fps (full) for mechanical 3D (trains) and camera.
- **How:** `quantize(t, 12)` before evaluating a layer's animation (§7.3). Never quantise the camera or grain.
- **Beat:** switching from 12 to 24 fps at the chorus downbeat makes motion "open up".

#### F13 · 版ズレ — riso misregistration
- **Look:** two-ink risograph print: shadow and mid plates slightly misaligned on paper, grainy ink.
- **When:** title and end cards, P5 memories, poster-like キメ frames.
- **How:** two density plates from luma with separate px offsets, multiplied onto paper.
- **Beat:** misregistration offsets jump 1–3 px on downbeats.

```glsl
uniform vec3 uInkA;      // shadow plate, e.g. P1 dusk #7A2350
uniform vec3 uInkB;      // mid plate, e.g. P1 glow #FFA552
uniform vec3 uPaper;     // #F4EFE6
uniform vec2 uOffA;      // px
uniform vec2 uOffB;      // px
void main(){
  float la = luma(texture(uTex, vUv + uOffA / uRes).rgb);
  float lb = luma(texture(uTex, vUv + uOffB / uRes).rgb);
  float g = hash12(vUv * uRes) * .12;
  float dA = 1. - smoothstep(.08, .55, la + g - .06);
  float dB = (1. - smoothstep(.35, .95, lb + g - .06)) * .85;
  vec3 c = uPaper * mix(vec3(1.), uInkA, dA) * mix(vec3(1.), uInkB, dB);
  fragColor = vec4(c, 1.);
}
```

### 8.G Particles & afterglow motifs

#### G01 · 火の粉 — embers
- **Look:** sparks rising on curling paths, cooling from white-hot to amber, vermilion and ash violet, and flickering.
- **When:** T14 exits, E08 burns, the chorus-2 climax, the outro.
- **How:** curl-noise wander + buoyancy; fixed dt; additive sprites (core + halo); size 1–4 px; lifetime 1.2–3 s; colour over life = `EMBER_RAMP`. 300–3000 particles is trivial on the GPU (instanced quads).
- **Beat:** spawn bursts on kicks (count ∝ onset strength).

```js
// Rising embers: curl-noise wander + buoyancy. Canvas y points down, so negative vy = up. Fixed dt = 1/24.
const psi = (x, y, t) => Math.sin(x * 1.7 + t * 0.3) * Math.cos(y * 1.3 - t * 0.2) + 0.5 * Math.sin((x + y) * 0.9 + t * 0.5);
function stepEmbers(ps, dt, t, scale = 0.004, swirl = 90, lift = 55) {
  const h = 0.01;
  for (const p of ps) {
    const X = p.x * scale, Y = p.y * scale;
    const vx = (psi(X, Y + h, t) - psi(X, Y - h, t)) / (2 * h);
    const vy = -(psi(X + h, Y, t) - psi(X - h, Y, t)) / (2 * h);
    p.vx += (vx * swirl - p.vx) * 2.0 * dt;
    p.vy += (vy * swirl - lift - p.vy) * 2.0 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt / p.ttl;
  }
}
const EMBER_RAMP = ['#FFF4D6', '#FFA552', '#F0663A', '#C8373A', '#3A1745'];
```

#### G02 · 蛍 — fireflies
- **Look:** slow wandering chartreuse points that swell and fade with soft bloom, reflected in water or on rails.
- **When:** the bridge and the final chorus in P4; the soul and memory motif.
- **How:** closed-form wander (deterministic). Each firefly flashes **once per bar**: at 128–132 BPM a bar is ≈ 1.81–1.87 s, close to the ≈ 2 s flash interval often cited for western-Japan Genji fireflies (≈ 4 s eastern, which equals 2 bars). Each firefly has its own phase; during the final chorus the phases converge until they all flash together on the downbeat (synchronised firefly flashing is a real phenomenon, and a great payoff).
- **Beat:** phase_i(t) = frac(t/bar + φ_i·(1 − sync(t))).

```js
// Deterministic firefly i at time t. sync: 0 = independent phases, 1 = all flash on the downbeat.
function firefly(i, t, seed, W, H, barLen, sync = 0) {
  const r = (k) => { const x = Math.sin((i * 12.9898 + k * 78.233 + seed) * 43758.5453); return x - Math.floor(x); };
  const x = W * (r(1) + 0.08 * Math.sin(t * (0.3 + 0.4 * r(2)) + 6.28 * r(3)) + 0.03 * Math.sin(t * 1.7 * r(4) + 9 * r(5)));
  const yBase = ((r(6) - 0.003 * t * r(9)) % 1 + 1) % 1;
  const y = H * (0.35 + 0.6 * yBase + 0.05 * Math.sin(t * (0.25 + 0.3 * r(7)) + 6.28 * r(8)));
  const ph = ((t / barLen + r(10) * (1 - sync)) % 1 + 1) % 1;
  const glow = Math.exp(-Math.pow(Math.min(ph, 1 - ph) / 0.12, 2));
  return { x, y, glow, size: 2 + 3 * r(11) };
}
```

#### G03 · 光の塵 — dust motes in light shafts
- **Look:** slowly drifting glowing specks, visible only inside the god-ray beams.
- **When:** magic-hour holds; interiors (train carriage).
- **How:** particles multiplied by the L06 ray-intensity texture; depth-of-field-sized (bokeh-ish) near the camera.
- **Beat:** Brownian speed `+20 %·pulse`.

#### G04 · 警報灯 — alternating crossing lamps
- **Look:** two red lamps alternating left/right, with bloom and a glow tail, the heartbeat of the pre-chorus.
- **When:** pre-chorus; any crossing shot; the bridge alarm.
- **How:** the lamp state below → sprite intensity → L07 bloom. Lamps are small in frame, so there is no photosensitivity risk as long as they stay under ~10 % of screen area.
- **Beat:** one lamp per beat: at ~130 BPM each lamp flashes ≈ 64–66 times/min, close to the brisk cadence of real crossing lamps.

```js
// Alternating crossing lamps on the beat grid: left on even beats, right on odd beats.
function crossingLamps(clock, t) {
  const i = clock.beatIndex(t);
  if (i < 0) return { left: 0, right: 0 };
  const ph = clock.beatPhase(t);
  const env = Math.min(1, ph / 0.06) * Math.exp(-2.2 * ph);   // fast attack, glowing tail
  return i % 2 === 0 ? { left: env, right: 0.08 } : { left: 0.08, right: env };
}
```

#### G05 · 灯りがともる — lights switching on
- **Look:** street lamps, windows and a vending machine switch on one by one as the sun goes down (the substitutes for the sun, §1).
- **When:** the bridge, as the sun sets (one light per beat), staying on through break 3.
- **How:** each light has an on-threshold of sun altitude (L08). When it's crossed, the light flickers 2–3 times (fluorescent start-up: 1 f on, 2 f off, 1 f on, then steady).
- **Beat:** thresholds are quantised so each light switches on a beat.

#### G06 · 烏 — crows on the wires
- **Look:** silhouette crows sitting on the power lines; on the drop they all take off in a spray of black shapes.
- **When:** verse wires (T10); the chorus-1 downbeat.
- **How:** a 3-frame wing-flap sprite loop at 8 fps; take-off trajectories on randomised Bézier curves; a few feathers as particles.
- **Beat:** take-off on the downbeat, staggered over 1/16 notes.

#### G07 · 夕焼けチャイム — dusk-chime rings
- **Look:** from a loudspeaker on a pole, concentric thin rings expand into the sky (the 5 pm town chime made visible).
- **When:** intro and outro bookends (and the sections where a melody motif returns).
- **How:** rings as stroked circles expanding at constant speed with alpha ∝ 1 − r/R; clipped by the skyline; a half-tone pattern inside the rings.
- **Beat:** one ring per beat (or per melody note if the analysis provides onsets).

#### G08 · 線香花火 — sparkler stages
- **Look:** a senkō-hanabi's glowing bead and its branching sparks through the five stages (蕾 bud, 牡丹 peony, 松葉 pine needles, 柳 willow, 散り菊 fading chrysanthemum). The bead falls at the end.
- **When:** as a literal effect in the outro (the bead drops at 3:43.54 = the hard cut), and as the structural intensity script (§1).
- **How:** sparks = recursive branching line particles (each spark spawns 2–4 sub-sparks at 30–60 % of its life; the branching probability comes from the stage). Short straight segments, additive, 1 px, with white cores. The bead is a molten sphere with a wobble (B09 spring) and a glow.
- **Beat:** in the 松葉 stage, spark bursts trigger on 8th notes.

#### G09 · 陽炎 — heat haze
- **Look:** a shimmering refraction over the far road and rails; the image wobbles in a band above the horizon (the summer-evening heat).
- **When:** wide railway shots in verse 1; subtle.
- **How:** noise-driven uv offset concentrated near a horizon band.
- **Beat:** none; it's ambient and should feel indifferent to the music.

```glsl
uniform float uAmtPx;    // 1.5..4 px
uniform float uHorizon;  // uv.y of the far road / horizon
void main(){
  float band = exp(-abs(vUv.y - uHorizon) * 18.);
  float n = vnoise(vec2(vUv.x * 60., vUv.y * 90. - uTime * 6.)) - .5;
  float m = vnoise(vec2(vUv.x * 23. + 4.1, vUv.y * 41. - uTime * 3.7)) - .5;
  fragColor = texture(uTex, vUv + vec2(n, m * .6) * band * 2. * uAmtPx / uRes);
}
```

#### G10 · 玉ボケ — bokeh lights
- **Look:** out-of-focus circles of city and train lights, with slightly polygonal or cat's-eye shapes toward the frame edges and chromatic rims.
- **When:** night (P4), close-ups with background lights, the final chorus.
- **How:** sprite circles (or hexagons for an aperture look) with a bright rim; size ∝ depth-of-field circle of confusion; cat's-eye = intersect with a second, offset circle whose offset grows toward the edges.
- **Beat:** size breathes `+8 %·pulse`; colours follow the palette's glow and afterimage hues.

---

## 9. Signature showreel moments (12)

Each of these is a "wow" beat: a single idea, visible in one frame, built from the cookbook. Placement follows the section map in §10 (from `docs/AUDIO_MAP.md`).

### M1 · 網膜タイトル — "The Retina Title" (intro 1, 0:00–0:10.32; resolves on the riff at 0:10.32)
- **What:** Black screen. The sun flares for 2 frames and burns the title **残光** into the viewer's eye. The screen goes black again, and the title exists *only* as a cyan negative afterimage that drifts slightly (like a real retinal afterimage following eye saccades: 2–3 small jumps) and fades as the dusk scene rises underneath. Then the HUD boots and the clock starts at 17:40:00.
- **Build:** 1-frame P1-highlight title into L03 (thresh 0.3, retention 0.947 ≈ 3 s, amount 1). Translate the accumulation buffer by small jumps. Fade in B01 multiplane. T17 HUD scrambles on (T08).
- **Why it wows:** the effect happens *in the viewer's own eyes*, and it states the film's thesis in 10 seconds. The ending (M10) mirrors it.

### M2 · 文字の街並み — "Kanji Skyline" (verse 1b, 0:32.74–0:47.66, as drums and bass enter; reprised in the outro riff)
- **What:** The camera trucks along a dusk skyline, then pulls back: the buildings are the verse's vertical lyric columns (Zen Old Mincho 900) standing on the horizon. Windows (little rects inside the glyph interiors) light up per mora. Power lines run from the tips of the 払い strokes to the next "building".
- **Build:** 2.5D (K05). Glyph columns bottom-aligned on the horizon, filled P2 night, with rim light from the sun (B07 logic on text). Windows are clipped inside the glyph masks and lit on mora onsets. Wires via T10 anchored at hand-picked stroke tips. Heat haze (G09) on the horizon.
- **Why it wows:** the typographic idea reads in a single frame, and the lyric becomes the place.

### M3 · 言葉の踏切 — "The Crossing Made of Words" (chorus 1, from the 1:02.53 downbeat)
- **What:** A 3D railway crossing where every part is a glyph. The crossbuck ✕ is two extruded 「一」 strokes. The warning lamps are extruded 「。」 rings glowing red and alternating on the beat. The barrier arm is a long 「一」 with hazard stripes. The sign plate reads 踏切 in Dela Gothic One. The rails are stretched 「＝」. Low-angle orbit against the P1 sky, then a train made of lyric lines passes (M11) and reveals the singer standing on the other side of the boundary.
- **Build:** Blender 5.1 text objects from `engine/fonts/*.ttf` (extrude 0.08, bevel 0.005), toon shader + Line Art, View Transform **Standard**. Render grey-value, line and emission (lamps) passes at 24 fps. Engine: L01 P1, G04 lamps + L07 bloom, L05 flare, F01/F02.
- **Why it wows:** a 3D set piece that *is* typography. This is the showreel's hero shot and thumbnail.

### M4 · 瞳の中の夕焼け — "Through the Eye" (break 3 → last chorus: push starts 2:56.29, emerges on the 3:03.56 downbeat)
- **What:** One continuous push: extreme close-up of the eye → the sunset reflected in the iris → through the pupil → out through the sun into the chorus sky → pull back to reveal that sun is the 「。」 at the end of the chorus lyric.
- **Build:** three layers with registered hero circles (E09): eye (4K codex close-up), iris-reflection painting (masked), chorus scene. **Exponential zoom** (scale = e^{kt}, which gives constant perceived speed) across 2 bars. Swap layers where the pupil (dark) or the sun (bright) fully covers the frame. 4-subframe motion blur. B02 boil on the eye layer only.
- **Why it wows:** a continuous cross-scale transition is the classic motion-designer signature.

### M5 · 影が歌う — "The Shadow Sings" (verse 2, 1:24.79–1:56.03; the falling glide at 1:51–1:56 stretches the shadow)
- **What:** The singer stands at the crossing, still. Her long shadow on the road lags a beat behind (B12), and then on the key line the shadow alone turns and "sings": the lyric appears in light *inside* the shadow's shape. Ruby 影 → ひかり.
- **Build:** shadow sprite = the character's silhouette skewed along the anti-sun vector; text clipped to the shadow mask, coloured P1 glow; ruby on its own timeline (T06).
- **Why it wows:** uncanny, conceptual, cheap. It's 逢魔が時 in one image.

### M6 · 電線五線譜 — "Power-line Stave" (verse 1b sky shots; reprise in verse 2)
- **What:** Five power lines across the sky form a musical staff. Lyric characters and crows sit on them at pitch positions following the vocal melody. The camera tracks along the wires, and **one utility pole passes the centre per bar**, so the poles are bar lines.
- **Build:** vocal f0 from the centre channel (`librosa.pyin`, 16 kHz) → wire index; T10 placement; G06 crows; K05 parallax with pole spacing = camera travel per bar (read each bar length from `downbeats[]`, ≈ 1.81–1.87 s).
- **Why it wows:** the music becomes visible notation embedded in the landscape.

### M7 · 走馬灯 — "The Revolving Lantern" (interlude, 2:27.15–2:34.46, spinning up with the riser at ~2:30–2:35)
- **What:** In darkness, a paper 走馬灯 (a revolving lantern, and also the idiom for one's life flashing before one's eyes) turns. Its panels show silhouettes of earlier shots of *this* MV, spinning faster with the riser until they flicker into a 1–2-frame memory montage. The candle inside becomes the sun → match cut (E09) into the bridge's low sun at 2:34.46.
- **Build:** 8–12 frames auto-captured from our own render (P5 + F03 halftone + F09 gate) as panel textures on a 2.5D cylinder (x-scale by cos θ, Lambert shading). Rotation speed follows the energy ramp. Keep the luminance delta low (warm paper) for safety (§7.6).
- **Why it wows:** a self-referential montage on a culturally loaded symbol.

### M8 · 焼けて火の粉、火の粉は蛍 — "Burn → Embers → Fireflies" (end of bridge → break 3, ~2:52–2:58)
- **What:** The sun touches the horizon (E06), the film ignites at the sun (E08), and the burning edge sheds embers from the image and the lyric (T14). As the palette scrubs P1 → P4 (L08), the embers cool from orange to chartreuse, slow down and become fireflies (G02) over a blue-hour field.
- **Build:** one particle system; at the handoff time each particle crossfades its colour ramp (EMBER_RAMP → P4 glow) and its motion model (buoyant curl → firefly wander) over 1 bar. About 800 particles.
- **Why it wows:** one continuous particle metamorphosis carries the palette change *and* the narrative turn.

### M9 · 夕日を巻き戻す — "Rewind the Sunset" (last-chorus 1, 3:03.56–3:18.13)
- **What:** The final chorus reverses time. The sun rises back out of the horizon, shadows shrink, lamps switch off in reverse order, and chorus-1 lyrics un-write (T01 reversed) and re-write, all in chorus-1 compositions played "on fire" (boil ×2, K01 a = 0.05, afterimage 3 s).
- **Build:** L08 `alt(t)` played backwards; E13 slit-scan for the turning point; reuse chorus-1 shot data with escalated parameters.
- **Why it wows:** the emotional wish ("stay") becomes a technical move everybody reads instantly.

### M10 · 残像の重ね書き — "Palimpsest → Silence" (last-chorus 2 → outro → hard cut at 3:43.54)
- **What:** In the last section, every word's afterimage stays (retention → 0.995), so by the last line the screen is layered with the whole chorus in fading complementary hues: the song visible all at once. At **3:43.54** (223.54 s) the music stops dead. Hard black (E10); only the afterimages remain and decay through the reverb tail (to 224.32 s) and ~2 s of padded silence, the last word last. The sparkler bead (G08) falls on the cut.
- **Build:** text-only accumulation buffer; after the end, stop feeding and set retention 0.947. Mux: pad silence (`ffmpeg ... -af apad=pad_dur=3`) without modifying `zanko.wav`.
- **Why it wows:** the ending *is* the concept: light that stays after its source is gone.

### M11 · 車窓の歌詞 — "Lyrics in Train Windows" (teaser: the post-chorus bass slam at 1:19.24; full version in last-chorus 2, 3:18.13–3:32.67)
- **What:** A train passes close to the lens. Each window frames one lyric character at the 8th-note rate, so you read the line *through* the train's motion. In the last window, the singer looks out for 2 frames.
- **Build:** E12 speed formula; window mask with per-window text (Dela Gothic One, white on P1 interior light); carriage gaps flicker the previous shot; Blender train (B11) or procedural 2D. Motion blur on the body only, not the characters.
- **Why it wows:** kinetic typography as a physical event.

### M12 · 部首の錬金術 — "Radical Alchemy" (the chorus-2 ending stop, ~2:25.3–2:27.15, landing on the interlude slam)
- **What:** A monument 「明」 (bright) splits: the 日 half sinks below the horizon like the sun and the 月 half rises as the moon. Then 日 slides next to 音 (drawn out of the audio waveform) and they fuse into 「暗」 (dark), and night falls. Coda: 影 opens up to show the 日 inside it, with ruby ひかり.
- **Build:** component halves via clip rects on opentype.js outlines (明 splits cleanly left/right). Compose 日 + 音 as separate glyphs scaled to the left/right proportions of 暗, then crossfade into the real 暗 glyph through an SDF blend (tiny-sdf) over 6 frames. P1 → P4 scrub underneath.
- **Why it wows:** meaning-level motion design that's only possible with kanji. It's a gift to a Japanese audience and the thing people will screenshot.

---

## 10. Section-by-section escalation plan

The section boundaries and hits below come from the audio-analysis agent (`docs/AUDIO_MAP.md`, `analysis/audio.json` → `sections[]`, `impacts[]`, `stops[]`). If those files are regenerated, re-read them; the *roles* and *budgets* here are what matter. Energy is AUDIO_MAP's 0..1 section mean. Intensity is our visual budget from 0 to 10.

| # | Time | Bars | Section | Energy | Palette | Type | Picture | New tools unlocked | Set piece / key sync | Int. |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0:00.00–0:10.32 | 0–5 | intro 1 (fragile, micro-stops) | .14 | black → P2 | R1 title | black, a sun flare, blinks on the stops 1.75/3.80/4.99/5.90 s | L03, F01, F02, G07 | **M1**: each stop blinks black and shows the afterimage | 1 |
| 1 | 0:10.32–0:17.80 | 6–9 | intro 2 (signature riff) | .67 | P2 | R5 HUD + R1 | the dusk crossing world slams in (B01) | K05, L06, L11, T17, G09, G04 | riff = the visual motif to bookend in the outro | 4 |
| 2 | 0:17.80–0:32.74 | 10–17 | verse 1a (intimate) | .28 | P2 | R2 vertical | one illustration, singer small; **mandatory hold** | T05, T02, B02, B05, E14 | hard cuts / freezes on the staccato gaps 18.4 / 20.2 / 24.0 / 26.8 / 29.3 s | 2 |
| 3 | 0:32.74–0:47.66 | 18–25 | verse 1b (drums + bass enter) | .61 | P2 | R2 + R4 | skyline, wires | T10, T06, G06 (sitting), B08, K04 | **M2** on the 32.74 re-entry; M6 | 4 |
| 4 | 0:47.66–0:58.83 | 26–31 | pre-chorus 1 | .46 | **P3** | R3 Zen Kaku / R5 | close-ups, crossing lamps | K01 (.012), K03, E05, T20, T07 | 2-bar dip at 47.7–51.4 s = close-ups; groove back at 51.4 → lamps on every beat | 5 |
| 5 | 0:58.83–1:02.53 | 32–33 | break 1 (inhale) | .21 | P3 → black | R1 | barrier arm raised, then silence | E11, E10 (溜め) | **hard stop 1:00.13–1:00.47 = black frame**; the barrier (E11) lands on 1:02.53 | 3 |
| 6 | 1:02.53–1:19.24 | 34–42 | chorus 1 | .60 | **P1** | R1 monument + R3 Dela | full singer + crossing | T03, T09, K02, L05, E02, G06 take-off, T19 | **M3** from the downbeat (first E02 flash); stop 1:17.7–1:18.8 = freeze + T18 bracket close | 7 |
| 7 | 1:19.24–1:24.79 | 43–45 | post-chorus (biggest bass slam, no vocal) | .80 | P1 | — (no lyrics) | pure motion-graphics / 3D | E12 | **M11 teaser**: the train slams through the crossing exactly on 1:19.24 | 8 |
| 8 | 1:24.79–1:56.03 | 46–62 | verse 2 | .55 | P2 (LUT −0.08, lower sun) | R2 + R4 | shadows lengthen; **mandatory hold** | B12, T12, T11, E03, B13, one F06 VHS memory | **M5**; bass stop 1:50.5 + falling glide 1:51–1:56 = the shadow stretches, the sky clicks down a band (L11) | 5 |
| 9 | 1:56.03–2:08.86 | 63–69 | pre-chorus 2 | .66 | P3 + inversions | R3 | panels, lamps, dutch | L02, E05 (denser), K03 | chorus-1 pre layouts ×1.2 density | 6 |
| 10 | 2:08.86–2:10.68 | 70 | break 2 (1 bar) | .52 | black | — | hold | E10 | one bar of black / held lyric | 4 |
| 11 | 2:10.68–2:27.15 | 71–79 | chorus 2 | .72 | P1 (sun touching the roofs) | R1 + R3 | chorus-1 layouts escalated | T15, K08, F07 (light), L04 | stop 2:25.3–2:27.1 → **M12** (明 → 日 + 月) in the silence | 8 |
| 12 | 2:27.15–2:34.46 | 80–83 | interlude (slam + riser) | .75 | **P5** | R4 | darkness, lantern | F09, F10, E13 | **M7** lantern spins up with the riser; candle = sun | 7 |
| 13 | 2:34.46–2:56.29 | 84–95 | bridge (C-melo, driving) | .80 | P1 → **P4** (the on-screen sunset) | R2 + R1 | the sun sets during the bridge | L08, G05, E06, E08, G01, K06 (once) | lamps switch on per beat; **M8** at the end (sun → burn → embers) | 8 |
| 14 | 2:56.29–3:03.56 | 96–99 | break 3 (quiet, stops 2:58.1, 3:01.6) | .43 | P4 | R4 | fireflies, close-up of the eye; **mandatory hold** | G02 | M8 embers become fireflies → **M4** push into the eye, emerging on 3:03.56 | 4 (contrast) |
| 15 | 3:03.56–3:18.13 | 100–107 | last chorus 1 | .81 | P4 → **P1** (rewind) | everything | chorus-1 compositions "on fire" | E13 (reversal), T01 reversed | **M9** rewind the sunset; E02 on 3:03.56 | 9 |
| 16 | 3:18.13–3:32.67 | 108–115 | last chorus 2 (climax, new melody, loudest) | .79 | P1 | R1 + R3 | fastest cutting (every beat), firefly sync | G02 sync → 1, T13 heavy | **M11** full; **M10** accumulation starts; stop ~3:31.4 = freeze | 10 |
| 17 | 3:32.67–3:43.54 | 116–121 | outro (intro riff reprise) | .86 | P1 | R1 | the intro world again, transformed (bookend) | G08 | M2/M3 reprise at full band; the sparkler bead (G08) glows | 10 |
| 18 | 3:43.54–3:44.32 (+ ~2 s padded) | 122 | final cut + reverb tail | .07 | black + inverted-P1 afterimage | — | black | E10 | **M10**: hard black on 223.54 s (frame 5365 @24 / 6706 @30); only afterimages remain | 1 |

**Escalation mechanics:**
- **Reserve list:** these *never appear before* their section. Dela Gothic One (6), full-frame flash (6), 3D set piece (6), inversion (9), glitch (11), slit-scan (12), on-screen sunset (13), firefly sync and the reverse sunset (15–16). The viewer should feel a new toolbox open in each section.
- **Chorus callback rule (JIZURA 統一感):** chorus 2 and the last chorus reuse chorus-1 layouts for repeated lines (AUDIO_MAP chroma match 0.77–0.87), with parameters escalated: boil 1 → 1.4 → 2, K01 0.03 → 0.04 → 0.05, afterimage 0.5 s → 1.5 s → 3 s, cut density ×1 → ×1.2 → ×1.5. Last chorus 2 is *new* melody, so it gets new compositions (M11, M10).
- **Every breakdown before a chorus** (5, 10, 14) removes the bass, so we remove something visual too: colour (to black or P4), motion (holds), lyrics (silence). The following downbeat (1:02.53, 2:10.68, 3:03.56) releases everything.
- **Post-chorus slams** (7 at 1:19.24, 12 at 2:27.15) carry no vocal, so they belong to pure motion design (train, lantern). Don't put lyrics there.
- **Holds:** a mandatory ≥ 2-bar hold in sections 2, 8 and 14.
- **The 線香花火 curve:** 蕾 (0–1) → 牡丹 (2–5) → 松葉 (6–7, 11, 15–16) → 柳 (8–10, 12–14) → 散り菊 (17), with the bead dropping at the 223.54 s cut.

---

## 11. Asset generation guide (codex image_gen + Blender)

### 11.1 Principles

1. **Colour lives in the engine, not in the generated pixels.** Ask codex for **grey-value renders** (black lines, 3–5 flat grey values, no colour) for backgrounds, props and layers. Colourise with L01 LUTs. This guarantees that 50 generations from different sessions look like one film.
2. **Key character art is the exception:** generate it in colour but inside the P1 roles (put the hex codes in the prompt), then still run L01 at `uAmount` 0.3–0.6 to pull it into the palette.
3. **Transparent PNGs, generous padding (10 %), 2048 px minimum** (4K for anything we zoom into: M4's eye, B08 close-ups).
4. **Never let the image model draw text.** Signs, station boards and crossing plates come out blank; the engine typesets them with our fonts (T-recipes). Otherwise we get fake kana.
5. **Prefer procedural generation** for textures that must animate, tile or stay deterministic: grain, paper fibres, film burn, light leaks, dust and bokeh are all in the cookbook. Use codex only for a "scanned paper" base plate if wanted.
6. **One character sheet first,** then every pose and close-up prompt includes a reference to it (the same description block, verbatim) for consistency.

### 11.2 Character: 灯 Akari (canonical spec in `docs/CHARACTER.md`), with motion and motif hooks

`docs/CHARACTER.md` owns the design. Use its **shared style block verbatim** in every character prompt. From the style side, these existing design features should be *driven* as motifs:
- **Orange ring lights on the headphone cups** → drive them like crossing lamps (G04): left and right alternate on beats in pre-choruses, both steady in choruses, both off in memory (P5). A live link between the character and the 踏切 motif.
- **Setting-sun hairpin** (a half disc with three rays) → the hero circle for E09 match cuts (hairpin → sun → 「。」 → lamp). Give it a tiny L05 glint on downbeats.
- **Vermilion ribbon on the left wrist (~1 m trailing)** → the film's "red thread" (accent `#C8373A`). Simulate it as a B09 spring chain (8–12 segments) and let it leave a positive afterimage trail (L03 `uNegative = 0`) in fast moves: light painting with the ribbon.
- **Ink violet-black hair with sunset inner colour** → rim light (B07) reads naturally. In silhouette shots, show only the inner-colour tips glowing.
- **Silhouette test:** headphones, cardigan-off-shoulder and trailing ribbon must read in pure black (B07, M5).
- **Budget-animation sheet to request from codex** (same design block each time): 6 poses for B13; 3 mouth shapes and 3 eyelid states as close-up crops, not layers (layer consistency from image models is unreliable); 3 hair/ribbon variants for B03 loops; one 4K eye close-up for M4.

### 11.3 Prompt blocks (English; paste verbatim, then add the subject line)

```text
STYLE_BASE:
Japanese 2020s vocaloid music-video illustration, flat anime cel shading with one hard-edged shadow tone,
crisp variable-width ink linework (thick outer contour, thin inner lines), clean shapes, strong silhouette,
low evening sun from the right, long shadows, nostalgic summer dusk mood, no text, no letters, no logo,
no watermark, no signature, no frame, isolated subject on a fully transparent background, 10% padding.

GREY_VALUES (append for backgrounds/props/layers):
render in greyscale values only: pure black ink lines, 3 to 5 flat grey fills from dark to light,
no colour, no gradients except a smooth sky, no texture, no noise.

CHARACTER_SHEET:
<the full 灯 Akari description from docs/CHARACTER.md> + <its shared style block, verbatim>
+ full body, front view, standing, arms relaxed, isolated on a fully transparent background, 10% padding.
Palette strictly: #140B1E #3A1745 #7A2350 #C8373A #F0663A #FFA552 #FFE3B0.

POSE_n:            <CHARACTER_SHEET description> + "<pose>, same outfit and proportions, full body"
CLOSEUP_EYE:       <STYLE_BASE> extreme close-up of one anime eye, amber-gold iris (#FFA552) with a thin bright ring,
                   reflecting a setting sun and power lines, detailed highlights, 4096px, eye fills 80% of frame, opaque
PROP:              <STYLE_BASE> + <GREY_VALUES> single <railway crossbuck sign without text | old train ticket stub
                   with blank fields | ramune glass marble | cicada shell | stopped wristwatch | paper lantern>
BG_LAYER (multiplane): <STYLE_BASE> + <GREY_VALUES> <far city skyline silhouette strip | utility poles and power lines
                   only | railway crossing with barrier, no signs text | grass and fence foreground strip>,
                   wide 3840x1080 strip, transparent above/below the subject
```

### 11.4 Blender (5.1) look recipe

- **Colour management:** View Transform **Standard** (not AgX/Filmic), Look None, so flat values survive. Render grey values or emission and colourise in the engine.
- **Toon:** Principled or Diffuse → **Shader to RGB** → ColorRamp *Constant* with 2–3 stops (shadow 0.25, mid 0.6, lit 1.0) → Emission. EEVEE.
- **Lines:** Grease Pencil **Line Art** modifier (collection or scene source), thickness 2–3 px at 1080p, crease 140°. Or Freestyle for a quick test. Export lines as a separate pass (holdout the mesh) so the engine can boil them (B02).
- **Painted backgrounds on geometry** (MORIE's 晴る approach): project a codex BG painting from the camera onto simple boxes/planes (UV Project modifier from the camera), then move the camera a little for real parallax.
- **Kanji geometry:** `bpy.data.fonts.load(r"<project>/engine/fonts/ZenOldMincho-Black.ttf")`, text object extrude 0.05–0.1, bevel 0.005, convert to mesh for boolean or window cuts.
- **Sync:** import the beat grid as timeline markers; key the camera on markers; render at 24 fps, 1920×1080. Output PNG sequences per pass (colour/grey, line, emission, mask, depth for K09).

---

## 12. Quality checklist & anti-patterns

**Per shot (before it's "done"):**
- [ ] One palette; LUT applied; accent ≤ 8 % area (except キメ).
- [ ] ≤ 3 font families in the section, real weights loaded, vertical punctuation correct, ruby aligned.
- [ ] Lyric visible ≥ 0.7 s (main lines) and appearing 0.1–0.2 s before the vocal.
- [ ] Cut lands 1 frame before the beat; flash on the beat frame.
- [ ] Drawn layers on 2s/3s; camera, grain and particles on 1s.
- [ ] ≤ 1 screen effect + ≤ 1 decoration (outside S5/S7/S9 climaxes).
- [ ] Grain (F01) and paper (F02) present.
- [ ] Flash-rate safe (≤ 3/s, no large red flicker).
- [ ] The shot has a circle or diagonal that connects to the next shot (E09) when possible.

**Anti-patterns (don'ts):**
- Preset-looking glitch on every beat. Rainbow or unmotivated colours. Centred text in every shot. Constant camera shake.
- Effects on the hi-hat. Accent the vocal, not the percussion grid.
- Faux bold/italic CJK; horizontal punctuation in vertical text; stretched glyphs.
- AI-rendered text in images; mismatched character designs between generations (always reuse the sheet block).
- Pure black lines on warm scenes (use coloured lines); pure black anywhere except hard-cut frames.
- A fade-out ending (the song ends hard; use M10).
- Unseeded randomness (breaks chunked rendering and re-renders).

---

## 13. Sources & verification

### 13.1 Sources consulted (2026-09-28)

- JIZURA README (local clone `vendor/JIZURA/README.md`) and https://github.com/852wa/JIZURA · https://852wa.github.io/JIZURA/
- ボカロMVでよく使うエフェクト＆プラグイン【After Effects】 — https://nanika.design/blog/1651/
- ボカロMVの作り方 (AE) — いからげ — https://note.com/ika_rage/n/n3a2ffc371034
- ボカロオリジナルPVの作り方解説 — https://niconico-toolbox.blog.jp/archives/1006850576.html
- 【解説】完全解剖 文字PV･動画師のテクニック (ティップスマッシュ) — https://www.youtube.com/watch?v=DyGd4-2Gy6I (via https://www.kotsuxkotsu.work/illustmv-techniq-video/)
- リリックビデオに眠る記憶の連続性 — JAGDA The Graphic Design Review — https://gdr.jagda.or.jp/articles/77/
- 「メズマライザー」から学ぶ、キャラクターアニメーション制作の全工程 — https://note.com/kurage_toumi/n/n3ce7b2f4b143
- 「メズマライザー」MVとchannelさんの作家性について — https://highland.hatenablog.com/entry/2024/08/15/221716 · https://dic.pixiv.net/a/メズマライザー
- ラグトレイン credits — https://w.atwiki.jp/hmiku/pages/41593.html · https://utaten.com/specialArticle/index/8107
- ヴァンパイア credits (OTOIRO) — https://vocadb.net/S/415198 · https://ja.wikipedia.org/wiki/ヴァンパイア_(DECO*27の曲) · OTOIRO materials: https://x.com/OTOIRO_Inc/status/1896500798994919447
- 神っぽいな — https://ja.wikipedia.org/wiki/神っぽいな · https://kompass.cinra.net/article/202305-pinocchiop
- フォニイ — https://ja.wikipedia.org/wiki/フォニイ · https://originalnews.nico/497950
- アンノウン・マザーグース — https://vocaloid.fandom.com/wiki/アンノウン・マザーグース_(Unknown_Mother-Goose)
- Kanaria (red/black world) — https://www.ticket.co.jp/entx/music/kanaria/
- ヨルシカ「晴る」MV production (MORIE) — https://cgworld.jp/article/2406-310-yorushika.html
- ぽぷりか (Blender main tool, 絵作り share) — https://school.dhw.co.jp/school/shinjuku/blog/20221001.html · https://school.dhw.co.jp/school/osaka/event/247.html
- Yazhirushi — https://vook.vc/n/2639
- 手书 definition and sub-types — https://zh.moegirl.org.cn/手书 (search-snippet level)
- Google Fonts CSS2 API and family metadata — https://fonts.google.com/metadata/fonts (weights/axes table in §6.1)

### 13.2 Verification done for this document

- Palettes: `tools/style_palette_sheet.py` → `assets/style/palettes.json` (all gradient maps luminance-monotonic; duotone contrasts P1 9.81, P2 9.05, P3 4.19, P4 17.18, P5 13.50) and the `docs/style_palettes.png` contact sheet.
- Fonts: all 60 candidate families returned HTTP 200 from `fonts.googleapis.com/css2`; weights and axes from the metadata JSON.
- Code: every ` ```glsl ` block (with `@common` prepended) was compiled **and linked** as a WebGL2 program and drawn once in headless Chrome (Playwright `channel: 'chrome'`, SwiftShader ANGLE). Every ` ```js ` block passed `node --check`, and the concatenated blocks passed 14 unit tests (`triAffine` maps all 3 vertices exactly; `makeClock` phases, bars and downbeats, including the real pickup-downbeat layout and a drifting tempo; `quantize`; `layoutVertical` punctuation offsets and rotation; `glyphsOnPath` positions and tangents; `scramble`; `mouthTrack`; `springStep` convergence; `stutterTime`; `trainSpeed`; `stepEmbers` rises; `firefly` determinism and full sync; `crossingLamps` alternation). Harness: `tools/verify_style_snippets.mjs`.
- Visual check: `tools/preview_style_fx.mjs` renders L01, L11, L02, L03 (the title afterimage after 12 frames of decay), E08, E06, E11, E07, F03, F13, F06, L06, F08, F04+F01, L04 and K02 on the dusk scene → `docs/style_fx_preview.png`. This pass caught and fixed two issues: L06 was un-normalised (blew out at the suggested exposure) and L04 was too faint.

### 13.3 Results (2026-09-28)

```text
node tools/verify_style_snippets.mjs  ->  40 blocks (27 glsl, 13 js), 14 unit tests, failures: 0
node tools/preview_style_fx.mjs       ->  wrote docs/style_fx_preview.png (1920x1080, 16 effects)
python tools/style_palette_sheet.py   ->  5 palettes, all gradmaps monotonic; docs/style_palettes.png (1960x2340)
```
