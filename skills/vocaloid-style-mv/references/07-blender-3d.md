# 07 — Blender toon 3D sequences

Contents: 1 What is worth doing in 3D · 2 Files and commands · 3 The look recipe · 4 Line art · 5 Pattern: a beat-keyed camera from `audio.json` · 6 Pattern: beat-keyed objects and lights · 7 Pattern: `toon_rgb_split` (three cel-shaded light layers) · 8 Output → engine (`seq` scene) · 9 Timings · 10 Blender 5.1 API gotchas · 11 Pitfalls

Blender 5.1, headless (`-b`), everything built from Python with the data API — no GUI, no `bpy.ops` except render/save. 残光 used two 7.4 s sequences (≈ 220 frames each) for its two instrumental showcases.

---

## 1. What is worth doing in 3D

Do in 3D what would be painful to hand-animate:
1. **Camera travel through space**: flythroughs, crane-ups, orbits, push-ins with real parallax (残光 A: a dusk street flythrough; B: an orbit around a night railway crossing that cranes up into the stars).
2. **Big kinetic 3D typography**: extruded mincho glyphs as monoliths in a street, glyphs the camera flies *through* or *under*, text casting real shadows (A: 救 光 夜 残 as 20–64 m slabs).
3. **Light as a story device**: a sun that sinks and sweeps shadows across facades, windows and lamps switching on as night falls — one keyframe pair in 3D, weeks by hand.
4. **Beat-locked mechanical motion**: barrier arms landing on downbeats, lamps alternating per beat, instanced swarms.

Keep in 2D: characters and faces, most lyrics (JIZURA), painterly skies, emotional close-ups. 3D supports the tegaki frames; with toon bands + line art + the engine's boil/grain it reads as the same film. Put the 3D shots where the vocal rests (post-chorus hit, interlude) so they act as showcases with `lyric: 'none'`.

## 2. Files and commands

| file | purpose |
|---|---|
| `tools/blender_common.py` | helper library: render setup, toon materials, sky, lights, fog boxes, geometry (boxes, poles, catenary wires, clouds), JP text, Geometry Nodes instancing, camera animation, line art, compositor, passes, timing |
| `blender/shots/_shared.py` | helpers for the shot scripts: `beats_in`, `frame_of`, `time_of`, easing, `key_camera_frames`, `sky_world` (animated dusk→night sky + sun + stars), `monolith` (glyph slab), `toon_rgb_split`, `glyph_toon`, glow materials, `compositor_with_grade` (bloom + keyable exposure), `set_jpeg_output`, `render_frames` |
| `blender/shots/shotA_street.py`, `shotB_crossing.py` | the two 残光 shots — **patterns**, not templates to re-render |
| `blender/probe_scene.py`, `blender/helpers_selftest.py` | the probe (dusk street, every option as a CLI flag) and helper self-tests |

The Blender executable: env `BLENDER`, else `blender` on PATH, else the newest standard install (`tools/kit_env.py` → `find_blender()`; `python tools/kit_env.py` prints it).
```powershell
$B = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"          # macOS: /Applications/Blender.app/Contents/MacOS/Blender
& $B -b --factory-startup -P blender/shots/shotA_street.py -- --mode preview --res 50 --step 6     # every 6th frame, half size
& $B -b --factory-startup -P blender/shots/shotA_street.py -- --mode stills --frames 1,29,56 --res 50
& $B -b --factory-startup -P blender/shots/shotA_street.py -- --mode full --res 100                # final 1920x1080
& $B -b --factory-startup -P blender/shots/shotA_street.py -- --mode none --save_blend 1           # build + save .blend for inspection
```
Shot-script options: `--mode preview|full|stills|none --res <percent> --step N --start 1 --end N --frames a,b,c --out <dir> --samples 16 --save_blend 0|1 --lines 1 --tag x` (parsed by `bc.parse_args(defaults)`, everything after `--`, types from the defaults). Always `--factory-startup` (user add-ons and prefs can change results). Blender starts in ~2 s; building a full street scene in Python takes 0.7–1.8 s. Preview frames: look at them (contact sheet) before the full render.

Minimal shot skeleton:
```python
import sys, os, math; sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import _shared as sh; bc = sh.bc; bpy = sh.bpy
A = bc.parse_args({"mode": "preview", "res": 50, "step": 6, "start": 1, "end": 220, "out": "blender/renders/C", "samples": 16})
T0, T1 = 147.15, 154.46                                   # song times of the shot (from the timeline)
NF = int(math.ceil((T1 - T0) * 30 - 1e-6))
DOWN = sh.beats_in(T0, T1 - 0.05, "downbeats"); F_DOWN = [sh.frame_of(t, T0) for t in DOWN]
bc.reset_scene()
bc.setup_render("EEVEE", res=(1920, 1080), percent=A["res"], fps=30, samples=A["samples"], view="Standard")
SUN = (-0.55, 0.75, 0.38)
bc.world_sky(sun_dir=(0.0, 1.0, 0.05), sun_strength=2.2)
bc.sun("Sun", direction=SUN, color="#ffffff", strength=math.pi)          # angle 0 = crisp cel shadows
bc.sun("Fill", direction=(0.35, -1, 0.8), color="#ffffff", strength=math.pi * 0.1, shadow=False)
m = bc.toon_material("M", lit="#f4b48e", shade="#6f5c9c", dark="#4a3d74", rim="#ffe0a8", rim_dir=SUN, haze="#e98a8c", haze_range=(35, 260))
# ... geometry, monoliths (sh.monolith), camera keyed per frame (§5) ...
bc.gp_lineart("LineArt", radius=0.05, color="#241638", crease_deg=120, noise=0.03, noise_step=2)
tree, rl, out = bc.compositor(); bc.add_bloom(threshold=1.05, strength=0.5)
sh.set_jpeg_output(os.path.join(A["out"], "f_####"), quality=95)
print(bc.render_sequence(os.path.join(A["out"], "f_####"), A["start"], A["end"]))
```
(Paths in shot scripts must be relative to the project root — import `tools/kit_env.py` (stdlib-only, so it works in Blender's bundled Python) for `ROOT`, or resolve from `__file__`; never hard-code a machine path.)

## 3. The look recipe ("not default-grey 3D")

1. **View transform = Standard.** A new 5.1 scene defaults to AgX, which desaturates flat colours. With Standard an emission of strength 1 in `bc.rgb('#hex')` lands in the image as exactly that hex, so the 2D palette can be used as-is.
2. **Toon material** (`bc.toon_material`, EEVEE): Diffuse(white) → **Shader to RGB** → constant ColorRamp → **Emission**. Three bands: `dark` < 0.02 ≤ `shade` (fill/ambient only) < 0.16 ≤ `lit` (sun). Rim: Layer Weight *Facing* band masked to normals facing `rim_dir`. `haze`: mix toward a colour by camera distance — flat aerial perspective with no volume cost.
3. **Light calibration**: sun strength **π** → Shader-to-RGB value 1.0 on a face pointing at the sun; fill π·0.1 → 0.1; world ambient ≈ 0.015. Keep lamp colours **white** and put colour in the ramps (Color→Fac uses luminance; an orange sun shifts the band thresholds). `world_sky` uses *Is Camera Ray*: the camera sees the gradient, lighting sees a flat ambient.
4. **Crisp cel shadows**: sun `angle = 0` exactly, `shadow_filter_radius = 0.15`. Any angle > 0 (even 0.05°) gives saw-tooth, dithered shadow edges after the constant ramp. 200 % resolution and more TAA samples do *not* fix it.
5. **Dusk composition**: key sun low and behind on one side, sun-side buildings low (5.5–8 m) so light reaches the street, a cross street as a light band. The painted sun disc (`world_sky(sun_dir=…)`) sits at the vanishing point independently of the key light — the usual anime cheat.
6. **Bloom** in the compositor (Glare node, Bloom, threshold 1.05): only emitters > 1.0 glow (windows at 1.6, lamps 6–8).
7. Details that sell a place cheaply: Geometry Nodes instanced poles with 5 sagging wires per span (`catenary` + `polyline`), real kanji on vertical signs (`jp_text(vertical=True)`), a joined emission mesh of lit windows, `blob_cloud` cumulus lit from below, flat far-city cards.
8. **Haze** only with a finite `volume_box` (density 0.004–0.006 = golden haze; 0.012 = muddy brown). Never a world volume in EEVEE (§10).

## 4. Line art

| | GP Line Art (`bc.gp_lineart`) — **default** | Freestyle (`bc.freestyle_lines`) | inverted hull |
|---|---|---|---|
| cost at 1080p | +~0.1 s/frame | ≈ 4.1 s/frame total | ~0 |
| width | world-space `radius` (thick near, thin far) | constant px, taper modifiers | world-space shell |
| tegaki feel | Noise modifier `step=2` = lines boiling on twos; Length modifier = overshoot | Perlin/sinus modifiers | none |
| verdict | use it | clean technical lines | poor on boxy architecture |

Width formula (measured): `px ≈ radius × (lens / sensor_width × res_x) / distance` — r = 0.05 at 9 m with a 24 mm lens = 7 px at 1920 wide. The default 0.0025 and even 0.012 are invisible; streets use **0.04–0.06**, close text 0.03. Exclude the road plane with `lineart_usage = 'OCCLUSION_ONLY'` (no border lines, still occludes); exclude wires, markings, clouds, sign text, far cards via `collection.lineart_usage = 'EXCLUDE'`. Line colour = a dark palette colour (`#241638`), never pure black. Lines can also go to a separate pass (`add_pass_outputs(..., grease_pencil=True)` → RGBA `p_gp####.png`) so the engine can recolour/boil them; `mist=True` gives a 16-bit depth-fog pass.

## 5. Pattern: a beat-keyed camera from `audio.json`

`shotA_street.py` designs the camera as **pure functions of the frame number**, then keys location, rotation and lens on *every* frame with LINEAR interpolation (`sh.key_camera_frames`), so the motion is exactly what the Python says — no Bézier surprises:

```python
DOWN = sh.beats_in(T0, T1 - 0.1, "downbeats")       # 79.24 81.09 82.95 84.79  (real times, tempo drifts)
F_HITS = [sh.frame_of(t, T0) for t in DOWN]          # [1, 56, 112, 167]   frame 1 == T0
def cam_speed(f):                                     # m/s: base accel + a decaying kick per downbeat + anticipation dip
    v = lerp(30, 56, ease_in_out_sine(u(f)))
    for h in F_HITS:
        if f >= h: v += (30 if h == 1 else 22) * math.exp(-(f - h) / 6.5)
        if h > 1:  v -= 8 * math.exp(-((f - (h - 5)) / 3.0) ** 2)
    return v * (1 - 0.94 * brake(f))                  # crane at the end brakes to a crawl
CAM_Y = integrate(cam_speed)                          # position = running sum of speed / 30
def cam_lens(f): ...                                  # 15 mm punch on frame 1, −2.6 mm punch around each hit
frames.append({"f": f, "loc": (x, y, z), "fwd": fwd, "roll": roll, "lens": cam_lens(f)})
sh.key_camera_frames(cam, frames)
```
Ingredients that made it feel cut to the music: speed kicks *on* downbeats with a small dip 5 frames before (anticipation); banking roll from lateral acceleration (`bank = clamp(0.55·ax, ±11°)`); a pitch-up when passing under an overhead glyph; lens punches on hits; a deterministic decaying impact shake (sin-based, no random) right after each hit; lateral swerves through Catmull-Rom control points measured against the geometry ("fly *through* the legs of 光"); a final crane + tilt to the sky while the sun sinks and stars appear (keyed world sockets). Every beat time comes from `audio.json` — never `n·60/bpm`.

## 6. Pattern: beat-keyed objects and lights (`shotB_crossing.py`)

- **Alternating lamps**: `lamp_level(f, side)` returns the brightness from the current beat index (even beat → left lamp, odd → right), with a 1-frame ramp-up, a slight sag while on and a 2-frame tail when switching off (incandescent feel). It is keyed per frame into the lamp emission factor (`sh.key_socket`) and into red point lights' `energy` (190 W × level), then forced LINEAR (`sh.set_id_interp`).
- **Barrier arms landing on downbeats**: per-frame rotation — held up, falling from 26 frames before the downbeat with a gravity ease-in, landing **exactly** on `F_DOWN[k]`, two damped bounces (`0.06·e^(−d/3.2)·|sin(0.95 d)|`).
- **White-out exit**: compositor exposure keyed from 0 to 1.6 over the last 10 frames (+ bloom 2.0) so the 3D shot burns into the next 2D shot on a hard cut.

## 7. Pattern: `toon_rgb_split` (three cel-shaded light layers, real shadows)

Night scenes need several coloured light sources, but Shader-to-RGB gives one value per pixel. Trick: make every light a **pure primary** and separate the channels of ONE diffuse closure:
- moon = white sun lamp → **G** channel → 3-band ramp (lit / shade / dark)
- crossing lamps = pure **red** point lights → **R − G** → 2 bands, added (screen) toward a red spill colour
- street lamp = pure **blue** spot → **B − G** → 2 bands toward a sodium-orange pool

Each layer is posterised into its own cel bands and **all three cast real shadows**. An optional moonlit rim band is masked to where the moon actually reaches. `sh.toon_rgb_split(name, moon=(lit, shade, dark), red=…, sodium=…, rim=…, rim_dir=…, haze=…)`.

## 8. Output → engine (`seq` scene)

- Render **JPEG q95** sequences `blender/renders/<shot>/f_0001.jpg …` (`sh.set_jpeg_output`) — PNG is several times larger and slower to fetch and decode, for no visible gain after the post pass. Frame 1 = the shot's `t0`.
- In the timeline:
  ```js
  shot('s23', B(43), B(47), 'seq', { pattern: 'blender/renders/A/f_####.jpg', t0: B(43), fps: 30, frames: 222 },
       { lyric: 'none', trans: { type: 'shatter', dur: 0.5 }, post: { boil: 0.5, bloom: 0.4, beatCA: 2 } });
  ```
  Frame `n = clamp(1 + floor((t − t0)·fps·rate), 1, frames) + offset`; the next 2 frames are prefetched (`prefetch`); decoded frames live in a 48-frame LRU. A missing frame draws a labelled placeholder (`SEQ <pattern> #0042`) and warns once — renders never crash on a half-finished sequence. Optional `view {zoom, x, y}` (re-frame), `rate` (slow-mo), `overlay {leak, flash (downbeats), letterbox, introFlash, vignette, grade [{color, a, comp}]}`.
- The engine's post pass (boil 0.5, grain, bloom, palette LUT) puts the 3D frames into the same film as the drawn shots. 残光 shipped the sequences at **50 % (960×540)**, upscaled by `D.cover`, and nobody could tell under boil + grain; render `--res 100` if the shot has fine text or wires in close-up.
- Rendering on twos halves the cost and matches the GP noise `step=2` — good for drawn-feeling shots, not for fast camera moves: render every other frame (`bc.render_sequence(pattern, start, end, step=2)` writes the real frame numbers f_0001, f_0003 …), renumber them to consecutive `f_####`, and play them with `fps: 15, frames: <count>` in the `seq` args.

## 9. Timings (RTX 3080, EEVEE, 16 samples, GP line art, bloom, DOF)

| configuration | first frame | steady |
|---|---|---|
| 1920×1080 beauty | 1.6–1.8 s | **0.74–0.82 s/frame** (a 7 s shot ≈ 3 min) |
| + mist and GP passes | 1.74 s | 0.88 s/frame |
| 960×540 (`--res 50`), shipped 残光 A / B (222 / 220 frames) | 1.36–1.38 s | **0.38–0.41 s/frame** (≈ 87–90 s per shot) |
| Freestyle instead of GP | 6.1 s | 4.1 s/frame |
| Cycles OptiX 16 spp, fake toon (no cast shadows) | 1.84 s | 0.66 s/frame |
| finite haze `volume_box` | | +0.6 s/frame |
| GPU shared with other processes (parallel agents) | | **5–20× slower** (Cycles 12–31 s/frame) |

Check `nvidia-smi` before final renders; do not render Blender while the browser renderer runs.

## 10. Blender 5.1 API gotchas (verified)

1. Engine ids: `BLENDER_EEVEE`, `CYCLES`, `BLENDER_WORKBENCH` (`BLENDER_EEVEE_NEXT` raises). Assign the enum, don't introspect it.
2. View transforms: `'Standard','ACES 1.3','ACES 2.0','Khronos PBR Neutral','AgX','Filmic','Filmic Log','False Color','Raw'`; AgX is the default.
3. Compositor: `scene.node_tree` is gone → `scene.compositing_node_group = bpy.data.node_groups.new(name, 'CompositorNodeTree')`; no `CompositorNodeComposite` → `NodeGroupOutput` + `ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')`.
4. File Output node: set `node.format.media_type = 'IMAGE'` **before** `file_format = 'PNG'` (default is multilayer EXR); slots via `node.file_output_items.new(socket_type, name)`; path = `node.directory` + `node.file_name`. Same rule for `render.image_settings.media_type` (`'VIDEO'` for FFMPEG).
5. Glare settings are input sockets: `g.inputs['Type'].default_value = 'Bloom'`. EEVEE has no bloom checkbox.
6. Layered actions: `Action.fcurves` is gone → `bpy_extras.anim_utils.action_get_channelbag_for_slot(act, obj.animation_data.action_slot).fcurves` (wrapped as `bc.fcurves(obj)`).
7. Grease Pencil v3: `bpy.data.grease_pencils.new()`, object type `'GREASEPENCIL'`, `gp.layers.new()`, GP material needs `bpy.data.materials.create_gpencil_data(mat)`; Line Art is `obj.modifiers.new(type='LINEART')` with `radius` (not thickness), `target_layer` as a string; other modifiers `GREASE_PENCIL_NOISE` (`step`, `random_mode='STEP'`), `GREASE_PENCIL_LENGTH`, `_THICKNESS`, `_SMOOTH`; `use_object_instances = True` to see GN instances.
8. EEVEE `shadow_pool_size` max `'1024'`. World volume in EEVEE is infinite: the sky renders black and the sun is extinguished — use a finite `volume_box`.
9. Shader to RGB is EEVEE-only; in Cycles use `toon_material(mode='fake')` (N·L + fill + ambient → ramp; same bands, no cast shadows).
10. Fonts: `.ttc/.otf/.ttf` load (a `.ttc` loads its first face); **variable fonts load only their default instance** (Noto Sans JP VF = Thin) — use static weights (e.g. `ZenOldMincho-Black.ttf`, `NotoSansJP-Black.otf`). EM scale differs per font; `jp_text(height=…)` normalises. Convert text to mesh (`bpy.data.meshes.new_from_object(obj.evaluated_get(dg))`) for per-face materials and clean line-art input.
11. Geometry Nodes Instance on Points `Rotation` is a rotation socket: feed it through `FunctionNodeEulerToRotation`.
12. `Material.use_nodes` / `World.use_nodes` are deprecated (always node-based). `HIPEW initialization failed` in the Cycles log is harmless.

## 11. Pitfalls

- `--mode full` without `--res 100` renders at the script default (50 %). Decide the resolution deliberately and write it in the timings log (it is: `res` field).
- A shot length mismatch: `frames` in the `seq` args must equal the rendered count, and frame 1 must be `t0` of the timeline shot. Re-check after re-timing the edit (`frame_of(T1, T0) − 1`).
- Beat times typed by hand into the script drift from the edit; always `beats_in()` from `audio.json`.
- Keyframes with default Bézier interpolation overshoot between per-frame keys; force LINEAR on every animated ID (`set_id_interp`).
- Orange-tinted lamps shift Shader-to-RGB band thresholds; keep lamps white (or pure primaries for `toon_rgb_split`).
- Pure black line colour and AgX make 3D look like a different film next to tegaki shots.
- Hard-coded absolute paths in shot scripts break the kit; resolve from `__file__`.
- Don't let 3D replace the character: 残光's 3D shots contain only places and glyphs; she stays 2D.

---
Author: **NikusonP** · vocaloid-style-mv-pipeline (MIT)
