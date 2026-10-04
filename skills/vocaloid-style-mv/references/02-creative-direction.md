# 02 — Creative direction: from lyrics to a film (思路)

Contents: 1 Read the song · 2 Find the thesis · 3 Colour script · 4 Shapes & motifs · 5 Lyric → image mapping · 6 Structure & escalation · 7 Character · 8 Typography voice · 9 Signature moments · 10 Variation matrix (make it different) · 11 Worked example: 残光 · 12 Anti-patterns · 13 Bright / daytime films (high-key)

The engine and tools make *any* film possible; this document is how to decide *which* film. Spend real thought here — a clear concept makes every later decision fast and consistent.

---

## 1. Read the song

Before any visual decision:
- **Read the lyrics as a poem.** List the concrete nouns (sky, door, thread, floor, feathers, fire, road), verbs of motion/state (落ちる fall, 拾う pick up, 崩れる crumble, 消えない won't go out), sensations (cold fingertips, wet floor), and the addressee (あなた). These are your image bank — they are specific to this song, which is exactly what keeps the film from looking like the last one.
- **Read the music** with `analysis/overview.png` and `AUDIO_MAP`-style notes: where it breathes (stops, breakdowns), where it explodes (chorus downbeats, post-chorus hits), tempo and feel, how it ends (fade vs dead stop).
- **Find the turn**: most lyrics move from one state to another (despair → resolve, longing → letting go). The film's colour and composition should travel the same way.

## 2. Find the thesis

One sentence that turns the title/lyrics into a *visual mechanism*, not just a mood.
- 残光 ("afterglow") → *"light that remains after its source is gone"*: afterimages, embers, the sky still glowing after sunset, a small flame kept alive, ending on a retinal afterimage after a hard cut. Every signature effect is a kind of persisting light.
- Other examples of the move: a song about forgetting → *"things lose their outlines"* (line art erodes, colour fills drift off their lines, text loses strokes); a song about waiting → *"time loops"* (repeating shots with one change, clocks, trains that never arrive); a song about anger → *"pressure until it breaks"* (frames that crack, compress, overexpose).

Write the logline (2 sentences: who, what happens, how it ends) and the emotional arc per section.

## 3. Colour script

Assign a palette to each section so the film *travels*. **Build new palettes for every film** with the palette system (`tools/style_palette_sheet.py` → `assets/style/palettes.json` + LUT rows in the engine; effect-cookbook §2): 3–5 palettes × 6–7 roles, monotonic-luminance gradient maps, one accent colour, one afterimage/complement. The shipped `P1–P5` are 残光's dusk/night ramps and only a worked example: a gradient map of them turns a blue daylight sky cream or orange at any `lutMix`.
- 残光: magic hour (P1) → night-blue with amber (P2) → alarm red/black (P3) → P1 "on fire" in choruses → blue hour + fireflies (P4) → faded-photo sepia for memories (P5) → **dawn** for the last chorus → black + cyan afterimage.
- Rule of thumb: one palette per shot; palette changes happen on cuts or motivated scrubs (sunset progressing, a light switching on). A full-colour frame should feel like an event.

## 4. Shapes & motifs

Pick **one master shape** and **one secondary shape**, each with a meaning, and use them everywhere (backgrounds, transitions, typography frames, particles). Shapes that rhyme give free match-cuts.
- 残光: circle = light/memory (sun, ember, lamp, 。, iris, firefly, ring of afterglow, title sun); crack/shard = the broken sky and heart; the vermilion **thread** (her wrist ribbon) = the red line through the film.
- Give motifs **state changes** across repeats: the cracked sky is a few lines in verse 1, fully cracked in chorus 1, shatters into stars in chorus 2, breaks into light in the last chorus. Repetition with change is what makes long-form feel authored.

## 5. Lyric → image mapping

For each line, choose an image that *answers* it — literal, symbolic, or ironic — and keep a few lines purely typographic.

| lyric (残光) | image chosen | why |
|---|---|---|
| ひび割れた空を見上げて | back view looking up; cracks spreading from the sun | literal + sets the master motif |
| ほどけた糸みたいな明日を | her ribbon unravels into one thread crossing the frame | turns a simile into a motion element |
| 錆びた扉の向こう側で | dolly toward a rusted door, light leaking from the gap | promise of an "other side" |
| ねえ、どこまで堕ちれば | she falls backward through darkness, light streaks rushing up | physicalises the verb |
| 砕けた心を拾い上げて | glass heart shatters → she kneels and gathers glowing shards | two-shot cause/effect on the beat |
| 濡れた床に落ちた願いを / ひとつずつ数えていた | glowing words fall like rain into puddles → one drop per beat + counter | the counting becomes the rhythm |
| もう何も要らない | black card, one small line | silence as a design choice |
| 零れた涙が道になるなら | a tear falls in slow motion and becomes a road of light | metaphor made literal → the film's turn |
| わたしは行くよ | she runs along that road, in front of the giant lyric | resolve; text-behind-character |
| 黒闇の果てで / あなたに会いたい | tunnel of lyric rings toward a dawn point → reaching hand → smile at sunrise | arrival; colour script resolves to dawn |

Leave space for **pure typography** (文字PV moments): a chorus slam of one giant kanji, a quiet type card, a full-frame JIZURA moment.

## 6. Structure & escalation

Map J-pop form to visual intensity (budget, not volume knob):

| part | job | typical treatment |
|---|---|---|
| intro | promise the world | sparse, one image/idea; title sequence on the riff |
| A-melo (verse) | narrative | slower cuts, long shots, small/vertical type, one effect at a time |
| B-melo (pre) | tension | faster cuts, close-ups, colour shift, alarm palette, 溜め (hold/black) before the hook |
| サビ (chorus) | payoff | full palette, giant type, key visual, fastest cuts, キメ on downbeats |
| post-chorus / interlude | showcase | no vocals → 3D flythrough, pure motion graphics |
| 2番 | variation | verse-1 grammar + one new element (night, rain) |
| C-melo (bridge) | contrast/reveal | memory montage, stripped colour, the film's turn |
| ラスサビ | maximum | earlier layouts return "on fire" + one move never seen before |
| outro | resolution | bookend the intro image, transformed; credits |

Also: put **stops** to work (freeze frames, black, a held breath), keep **at least three real holds**, and design the **ending as an idea** (残光: hard cut on the dead stop → a 3 s silent cyan afterimage of the title).

## 7. Character

- **Original** design (never an existing character's likeness). V家 cues without copying: headphones/headset, a signature colour in the hair (inner colour), one iconic accessory (残光: a setting-sun hairpin), a uniform/coat silhouette, and a **motion prop** that moves in wind and carries meaning (残光: a long vermilion ribbon on the wrist → the thread motif).
- Palette-coded: her colours should belong to the film's palette (ink-black hair with sunset-orange inner colour in an afterglow film).
- Plan the **pose list from the storyboard**, not generically: close-ups for intimate lines, back views for looking at the world, hands for symbolic actions, a few dynamic poses for choruses, one or two "turn" images (reaching to camera, smiling at dawn).

## 8. Typography voice

- Fix roles: mincho for feeling, heavy gothic for impact, handwriting for memory, pixel/LED for signals/HUD. ≤3 families per section.
- Decide where lyrics live per shot: JIZURA front layer (default), centre-free side bands for character shots, scene-owned typography for キメ (kanjiSlam, typeCard, tunnel), text **behind** the character for hero shots (foreground layer).
- Credits are typography too: design them into the title lockup and the end card.

## 9. Signature moments

Choose 6–10 "showreel moments" and give them the most care: a title sequence locked to the riff; one continuous one-take; a 3D set piece in an instrumental; a physical metaphor (shatter, melt, ink, fold); a text-as-architecture moment; a motif payoff in the last chorus; an ending idea. Each should come from *this* song's lyrics or structure.

## 10. Variation matrix — make it different

For a new song, pick one option per row **from the song's own material**. If your picks match 残光 in more than three rows, push further.

| axis | options (examples, not a closed list) |
|---|---|
| world / setting | suburb at dusk (残光), seaside town, rainy metropolis, school after hours, snowfield, abandoned amusement park, deep sea, outer space, paper/miniature world, inside a phone, a library |
| time arc | dusk→night→dawn (残光), noon→storm→clear, one endless night, seasons, a single minute stretched |
| key / exposure | low-key dusk & night (残光), high-key daylight (§13), overcast flat, backlit golden hour, white-out dreamscape |
| palette | afterglow ambers/violets (残光), cyan/magenta neon, monochrome + one red, pastel chalk, ink wash + gold, risograph two-tone |
| master shape | circle (残光), square/frame, triangle/arrow, line/thread, spiral, grid, wave |
| material metaphor | glass & light (残光), paper & ink, water & ripples, smoke, fabric, static/glitch, flowers, clockwork |
| line style | brush-pen tegaki (残光), thin pencil, thick marker, no outline flat shapes, crayon, woodcut |
| character archetype | schoolgirl V家 singer (残光), android, ghost, animal mascot, two characters, no visible character (objects/hands only), silhouettes only |
| typography voice | mincho + gold (残光), brutal gothic slams, handwriting diary, LED/terminal, vertical scroll calligraphy |
| 3D role | flythrough of a kanji street + night crossing orbit (残光), a rotating diorama, a single object macro, none (all 2D) |
| transition grammar | circles/irises + shatter (残光), page turns, ink bleeds, glitch tears, wipes along a motif line, match-cuts on motion |
| ending | hard cut + afterimage (残光), slow fade into the first frame (loop), freeze + credits, the character leaves frame, a blackout with one line of sound |

Also vary **pacing** (some songs want long one-takes and few cuts) and **density of typography** (some MVs are 80 % text).

## 11. Worked example: 残光 in brief

Thesis: light that remains after its source is gone. Logline: after the sun has gone, a girl holds the last light; the sky cracks, she falls into the night, keeps a small flame alive, gathers her shattered heart, and walks a road made of her tears toward dawn — 「黒闇の果てで あなたに会いたい」. See the case study in the kit repo (not inside the installed skill folder): [STORYBOARD.md](https://github.com/EGSECDA/vocaloid-style-mv-pipeline/blob/main/examples/zanko/STORYBOARD.md) (66-shot list), [README.md](https://github.com/EGSECDA/vocaloid-style-mv-pipeline/blob/main/examples/zanko/README.md), and the contact sheets in [gallery/](https://github.com/EGSECDA/vocaloid-style-mv-pipeline/tree/main/examples/zanko/gallery) (`examples/zanko/` in a repo checkout).

## 12. Anti-patterns

- A generic "anime girl + sunset + glow" film disconnected from the lyrics.
- Every shot at the same intensity; effects stacked on everything; no holds.
- Lyrics covering the character's face; unreadable text over busy art; light text on light skies.
- Random JIZURA picks left uncurated (gimmicky layouts, opaque cards).
- Reusing 残光's motifs (cracked sky, glass heart, ribbon thread, road of tears) for a song whose lyrics don't contain them.
- Ending with a fade-out just because the song ended.
- A bright song rendered with the night defaults: ivory lyrics on a sunny sky, a milky bloom, dusk-orange rims (§13).

## 13. Bright / daytime films (high-key)

The template, the scene library and the 残光 notes default to **low-key dusk/night** frames. For a bright film (summer, noon, sea, snow, a white-out dreamscape) change these before the first still — with the night defaults the lyrics all but vanish on every daylight shot.

1. **Post look** (`engine/timeline.js`): `Z.LOOK_DEFAULT = { boil: 1.0, bloom: 0.15, bloomThreshold: 0.93, grain: 0.04, vignette: 0.1, lutMix: 0 }`. The bloom bright-pass keys on max(R, G, B), so with the night threshold 0.72 every sky and cloud pixel blooms and the frame turns milky; a strong vignette reads as dusk. In `Z.LOOKS` keep `bloom` ≤ 0.2 and `beatBloom` ≤ 0.1, drop the demo's downbeat `exposure` push from `Z.globalFX`, and pull white-heavy shots down with `exposure` −0.05…−0.12.
2. **Palettes**: write new ones (effect-cookbook §2, "Daylight palettes"); never keep 残光's P1–P5. Preview them on one of your own plates, not the built-in dusk scene: `python tools/style_palette_sheet.py --plate assets/bg/<plate>.png`. Keep `lutMix` 0.08–0.25 on daylight plates. The engine's built-in ramps include a high-key `day` (`post: { lutA: 'day' }`) beside `night`, `ember`, `dawn` and `mono`.
3. **Lyrics: dark text.** Give the JIZURA plans `schemes: 'light'` (the style's schemes whose background luminance is > 0.6), explicit scheme indices (`schemes: [2]`), or your own colours with `colors.enabled` (06 §4). Use styles that have light schemes: crimson, hud, mono and synth80 have none, and transit's only one (grey) keeps white text. Keep one `schemes: 'dark'` plan for night or shadowed shots and choose the plan per shot from what sits behind the text; where white cloud meets deep sea, use the centre-free plan or a 20–35 % `grad` fx behind the lyric band.
4. **JIZURA tone**: a plan's `mood:` is only a label — `J.plan` ignores it (only JIZURA's おまかせ randomiser reads moods). Tone comes from `style`, `fx` (motion / glitch / chroma / decor / density) and `enabled`. For an upbeat song set `const MOODS = ['pop', 'emotional', 'graphic', 'calm']` in `timeline.js`: tagged parts then stay on only if their JIZURA `tags` include one of them (untagged parts stay on; the default `null` = no mood filter). The deny-lists apply in both cases — keep the opaque-plate denials — and the horror set (`hr*` parts) is always off.
5. **FX**: additive light (`glow`, `embers`, `fireflies`, `rays`, high bloom) clips to white on bright plates — use it only in shadowed areas. Daylight vocabulary from existing hooks: `feathers` → petals, confetti or paper planes; `dust` → spray or pollen; `rain` with short white streaks → a sprinkler; `cracks` with a white core → sun glints on water; `D.halftone` screen-print tints; cast shadows (char `shadow: { color, a, dx, dy }`) and `grad` fx with `comp: 'multiply'` as cloud-shadow sweeps instead of rim lights. Always pass your palette colours: scene and fx defaults are 残光 dusk colours (ink `#140B1E`, rims and glows `#FFA552`).
6. **Scenes**: `kanjiSlam` needs `sky: 'day'` (over a `bg` plate, or `skyGrad` stops when there is none) — `'sunset'` (the default) and `'night'` paint dusk or night grades over any plate; `typeCard` needs `paper` (background colour; default near-black) and a `ruleColor`; `titleRiff` takes your `glyphs: [first, second]` and `hud: { title, when, bpm, geo, place, len }`. ember, tunnel, wetFloor, train, heart, skyShatter, thread, fall, flame and road are 残光 set pieces with hard-coded strings or image landmarks — write your own (05 §9).
7. **HUD and credits**: the demo `Z.hud` draws paper-white type with a dark shadow; on a bright film use the palette ink at 55–70 % with a light halo.
8. **Assets**: daylight words in the style block, time-of-day variants (noon / afternoon / golden hour) with a consistent cast-shadow direction, a sky + cumulus plate and a sea- or ground-only plate; the magenta key `"key": "#FF00FF"` for teal / aqua / mint / green designs (04 §2, §4).
9. **Vertical 9:16**: the surround is tinted near-black and the vertical lyric plans use `Z.VERTICAL_CFG.schemes` (default `'dark'`) whatever the 16:9 plans chose. Set `schemes: 'light'` and a light `ambience` tint (e.g. `[236, 244, 250]`) in `Z.VERTICAL_CFG`, then check that the bands read.
10. **QA additions** (09): light text on a light sky, milky bloom, dusk tints leaking from scene and fx defaults, additive particles clipping to white, white flashes on white frames (use a colour flash — `post.flashColor`, `[r, g, b]` in 0–1 — or a motivated `invert` instead), flash rate at fast tempos (effect-cookbook §5).
