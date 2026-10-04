# 02 — Creative direction: from lyrics to a film (思路)

Contents: 1 Read the song · 2 Find the thesis · 3 Colour script · 4 Shapes & motifs · 5 Lyric → image mapping · 6 Structure & escalation · 7 Character · 8 Typography voice · 9 Signature moments · 10 Variation matrix (make it different) · 11 Worked example: 残光 · 12 Anti-patterns

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

Assign a palette to each section so the film *travels*. Use the palette system (`assets/style/palettes.json`, LUT rows in the engine; see `effect-cookbook.md`) — or build new palettes for the song (5 palettes × 6–7 roles, monotonic luminance gradient maps, one accent colour, one afterimage/complement).
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

Thesis: light that remains after its source is gone. Logline: after the sun has gone, a girl holds the last light; the sky cracks, she falls into the night, keeps a small flame alive, gathers her shattered heart, and walks a road made of her tears toward dawn — 「黒闇の果てで あなたに会いたい」. See `examples/zanko/STORYBOARD.md` (66-shot list), `examples/zanko/README.md`, and the contact sheets in `examples/zanko/gallery/`.

## 12. Anti-patterns

- A generic "anime girl + sunset + glow" film disconnected from the lyrics.
- Every shot at the same intensity; effects stacked on everything; no holds.
- Lyrics covering the character's face; unreadable text over busy art; light text on light skies.
- Random JIZURA picks left uncurated (gimmicky layouts, opaque cards).
- Reusing 残光's motifs (cracked sky, glass heart, ribbon thread, road of tears) for a song whose lyrics don't contain them.
- Ending with a fade-out just because the song ended.
