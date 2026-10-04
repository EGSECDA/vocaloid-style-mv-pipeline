> Archived working document from the 「残光」 project (Music / Lyrics / Movie：NikusonP). `<project>` = that project's root; commands and paths refer to its layout at the time. For the maintained, portable versions see `skills/vocaloid-style-mv/references/`.

# BLENDER_RECIPE: stylized 3D shots for the 「残光」 MV (Blender 5.1.2, headless)

Probe result: **EEVEE + Shader-to-RGB toon + Grease Pencil Line Art** renders an anime dusk street at
**1920x1080 in ~0.8 s/frame** on the RTX 3080, headless, with crisp cel shadows, lines,
bloom, DOF and separate line/mist passes for the 2D compositor.

- Probe still (frame 30): `<project>\blender\_probe\still_eevee_gp_final_f030.png`
- 60-frame / 2 s dolly (frames 1-24 are the timed run): `<project>\blender\_probe\seq_eevee_gp_final\f_0001..0060.png`
  and the preview `<project>\blender\_probe\dolly_eevee_gp_final_60f.mp4`
- Passes for frames 1-24: `...\_probe\passes_eevee_gp_final\p_gp####.png` (lines only, RGBA) and `p_mist####.png` (16-bit grey)
- Transparent text-only render: `...\_probe\text_eevee_gp_v2.png` (RGBA; the checkerboard preview is `text_eevee_gp_v2_on_checker.png`)
- Side-by-side of the line and engine options: `...\_probe\compare_sheet.png`; 4-frame contact sheet: `final_contact_sheet.png`
- Cycles comparison sequence: `...\_probe\seq_cycles_gp_final\`. Freestyle sequence: `...\_probe\seq_eevee_freestyle_seq\`
- Self-test of the other helpers (follow-path orbit, Freestyle as a pass, object instancing, vertical text, transparent film):
  `...\_probe\selftest\`
- Saved scene for opening in the GUI: `...\_probe\probe_eevee_gp_final.blend`
- All timings are appended as JSON lines to `...\_probe\timings.jsonl`

## 1. Files

| File | Purpose |
|---|---|
| `<project>\tools\blender_common.py` | Helper library that scripts run with `blender -b -P` import. Covers the scene and render setup, toon materials, sky, lights, fog, geometry, JP text, instancing, camera animation, line art, passes and timing |
| `<project>\blender\probe_scene.py` | Probe shot: dusk street, power poles and wires, tategaki shop signs, clouds, giant 3D 「残光」 text, 2 s dolly. Every option is a CLI flag |
| `<project>\blender\helpers_selftest.py` | Tests the helpers that the probe does not use: `follow_path`, Freestyle pass, object instancing, vertical text, Cycles CUDA/OptiX |

## 2. Commands

PowerShell (the project default; use `;` and not `&&`):

```powershell
$B = "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
# still (frame 30) - EEVEE + GP line art
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --engine EEVEE --lines gp --mode still --tag final
# 24-frame sequence + line/mist passes
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --mode seq --start 1 --end 24 --passes 1 --tag final
# the transparent text-only render (RGBA PNG)
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --mode text --tag v2
# variants
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --lines freestyle --mode still --tag fs
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --engine CYCLES --device OPTIX --samples 16 --mode seq --tag cy
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --fog 1 --fog_density 0.005 --mode still --tag haze
& $B -b --factory-startup -P <project>\blender\probe_scene.py -- --mode none --save_blend 1 --tag final   # build and save .blend only
# preview mp4
ffmpeg -y -framerate 30 -i <project>\blender\_probe\seq_eevee_gp_final\f_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 out.mp4
```

The same commands work in Git Bash with `"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"`.
Use `--factory-startup` so the user's add-ons and preferences cannot change the result.
Blender starts in about 2 s. Building the probe scene with Python takes 0.6 s.

### Minimal shot script template

```python
import sys, math; sys.path.insert(0, r"<project>\tools")
import blender_common as bc
A = bc.parse_args({"start": 1, "end": 60, "out": r"<project>\render\shot01"})
bc.reset_scene()
bc.setup_render("EEVEE", res=(1920, 1080), fps=30, samples=16, view="Standard", transparent=False)
bc.world_sky(sun_dir=(0.0, 1.0, 0.05), sun_strength=2.2)            # gradient sky + sun disc
SUN = (-0.55, 0.75, 0.38)
bc.sun("Sun", direction=SUN, color="#ffffff", strength=math.pi)       # angle 0 = crisp toon shadows
bc.sun("Fill", direction=(0.35, -1, 0.8), color="#ffffff", strength=math.pi * 0.1, shadow=False)
m = bc.toon_material("M", lit="#f4b48e", shade="#6f5c9c", dark="#4a3d74", rim="#ffe0a8", rim_dir=SUN,
                     haze="#e98a8c", haze_range=(35, 260))
t = bc.jp_text("残光", font="mincho", height=5.0, extrude=0.06, mat=m, loc=(0, 20, 0))
cam = bc.camera("Cam", loc=(0, -6, 1.5), target=(0, 40, 4), lens=24)
bc.key(cam, 1, location=(0, -6, 1.5)); bc.key(cam, 60, location=(0, 7, 2.6)); bc.set_interpolation(cam, "BEZIER")
bc.gp_lineart("LineArt", radius=0.05, color="#241638", crease_deg=120, noise=0.03, noise_step=2)
bc.compositor(); bc.add_bloom(threshold=1.05, strength=0.5)
bc.add_pass_outputs(A["out"] + r"\passes", prefix="p", mist=True, grease_pencil=True)
bc.set_png_output(A["out"] + r"\f_####")
print(bc.render_sequence(A["out"] + r"\f_####", A["start"], A["end"]))
```

## 3. blender_common API (main entry points)

| Area | Functions |
|---|---|
| CLI | `parse_args(defaults)` parses `--key value` after `--`, with types taken from the defaults |
| Colour | `rgb('#hex')` converts display sRGB hex to a linear RGBA for node sockets. `mix_hex` |
| Scene | `reset_scene()` gives an empty factory scene. `setup_render(engine='EEVEE'|'CYCLES'|'WORKBENCH', res, percent, fps, samples, transparent, view='Standard', cycles_device='OPTIX'|'CUDA', denoise, shadow_pool)`. `enable_cycles_gpu(kind)`. `set_png_output(path_with_####, rgba, depth)` |
| Materials | `toon_material(name, lit, shade, dark, highlight, shade_at, dark_at, rim, rim_dir, mode='shader_to_rgb'|'fake', light_dir, fill_dir, fill, ambient, haze, haze_range, haze_max)`. `flat_material` (unlit, optional haze). `emission_material`. `holdout_material`. `gradient_emission_material`. `assign` |
| Sky, light, fog | `world_sky(stops, z_lo, z_hi, sun_dir, sun_strength, sun_size_deg, glow_*, ambient, ambient_strength)`. `sun(direction, strength=pi, angle_deg=0, filter_radius=0.15)`. `point_light`. `volume_box(size, loc, density, color, anisotropy, height_falloff)`. `world_fog` (Cycles tests only, see gotchas) |
| Geometry | `box`, `cylinder`, `plane`, `join_boxes` (hundreds of boxes in one mesh), `catenary` + `polyline` (sagging power lines), `blob_cloud` (anime cumulus), `to_mesh_object` |
| JP text | `jp_text(body, font='mincho'|'gothic_black'|..., height, extrude, bevel_depth, vertical, side_mat, rot_deg)`. The font keys are in `FONTS` |
| Instancing | `instance_on_points(name, source_obj_or_collection, points, rotations, scales)` builds one Geometry Nodes object. `hide_source` |
| Camera, animation | `camera`, `look_at`, `empty`, `track_to`, `key(obj, frame, **props)` (props are found on the object or its data, e.g. `lens`), `set_interpolation(obj, 'BEZIER'|'LINEAR'|'CONSTANT', easing)`, `fcurves(id)`, `follow_path(obj, points, f0, f1, target)`, `set_dof(cam, focus_obj_or_dist, fstop, blades)` |
| Lines | `gp_lineart(radius, color, crease_deg, intersection, noise, noise_step, overshoot, smooth, source)`. `lineart_usage(obj, 'OCCLUSION_ONLY'|'EXCLUDE'...)`; a collection can also set `collection.lineart_usage`. `freestyle_lines(thickness_px, color, crease_deg, taper, wobble, as_pass, exclude_collection)`. `inverted_hull(obj, thickness, color)` |
| Compositing | `compositor()` returns `(tree, render_layers, group_output)`. `add_bloom(threshold, strength, size)`. `add_pass_outputs(dir, prefix, mist, freestyle, grease_pencil, alpha, mist_range)` |
| Render | `render_still(path, frame)` returns seconds. `render_sequence(pattern, start, end)` returns `{frames, total_s, first_frame_s, steady_s_per_frame, per_frame}`. `FrameTimer`. `log_json`. `save_blend` |

## 4. Look recipe: "not default-grey 3D"

1. **Use the Standard view transform.** A new 5.1 scene defaults to **AgX**, which desaturates
   flat colours (see the AgX tile in `compare_sheet.png`). With Standard, an Emission of strength 1
   in `rgb('#hex')` comes out in the PNG as exactly that hex. A 2D designer's palette can
   therefore be used as-is.
2. **Toon material** (`toon_material`, EEVEE): Diffuse(white) → **Shader to RGB** → constant ColorRamp
   → **Emission**. The ramp has three bands:
   - `dark` below 0.02
   - `shade` from 0.02, reached by fill or ambient light only
   - `lit` from 0.16, reached by the sun

   Rim light: a Layer Weight *Facing* band, masked to normals that face `rim_dir` (the sunset side).
   `haze` mixes towards a colour by camera distance. This gives flat aerial perspective without any volume cost.
3. **Light calibration.**
   - Sun strength **π** gives a Shader-to-RGB value of **1.0** on a face that points at the sun.
     Fill at π·0.1 gives 0.1, and the world ambient (0.3 × #4a3a6a) gives about 0.015.
   - Keep the lamp colours **white** and put the colour in the ramps. The Color→Fac conversion uses
     luminance, so an orange sun would move the band thresholds.
   - `world_sky` uses *Is Camera Ray*: the camera sees the gradient, and lighting sees a flat
     ambient colour, so the bands stay predictable.
4. **Crisp cel shadows.** Set the sun's `angle = 0` exactly and `shadow_filter_radius = 0.15`.
   Any angle above 0 (even 0.05°) makes EEVEE ray-march soft shadows. After the constant ramp
   snaps them, the result is saw-tooth, dithered shadow edges (see `cmp_shadow2.png`: top-left has
   angle 0.05°, top-right has angle 0).
5. **Composition for dusk.**
   - Put the key sun low and behind on one side (−0.55, 0.75, 0.38). One row of facades is then
     lit warm, the other stays violet, and long diagonal shadows fall across the road.
   - Keep the sun-side buildings low (5.5–8 m) so light reaches the street, and leave a cross street
     as a gap for a light band.
   - The painted sun **disc** is set separately (`world_sky(sun_dir=...)` at the vanishing point).
     It does not have to match the key light direction. This is the usual anime cheat.
6. Details that make the street read as Japanese: power poles (Geometry Nodes instances) with
   5 sagging wires per span plus wires crossing the street; vertical shop signs with real kanji
   (`jp_text(vertical=True)`); lit windows (a joined emission mesh at 1.6 strength, which blooms);
   a glowing vending machine; flat far-city cards; `blob_cloud` cumulus lit from below (fake-toon
   with the light pointing up).
7. **Bloom**: compositor Glare in `Bloom` mode, threshold 1.05. Only emitters above 1.0 glow.

## 5. Line art: Grease Pencil Line Art vs Freestyle vs inverted hull (all work headless)

| | GP Line Art (`gp_lineart`) | Freestyle (`freestyle_lines`) | Inverted hull |
|---|---|---|---|
| Cost at 1080p, probe scene | **+~0.1 s/frame** (0.8 s/frame total) | **4.1 s/frame** total (CPU stroke render) | ~0 |
| Width | world-space (`radius` in m): thick near, thin far. This reads as natural line weight | constant pixels (`thickness`), with taper modifiers | world-space shell |
| Hand-drawn features | GP Noise modifier `step=2` gives **boiling lines** on twos. Length modifier gives overshoot | Perlin or sinus geometry modifiers, calligraphy | none |
| Separate pass | view-layer `use_pass_grease_pencil`, output "Grease Pencil" (RGBA lines on alpha) | `freestyle_settings.as_render_pass`, output "Freestyle" | no |
| Renders in Cycles | **yes** (GP is drawn over the Cycles image) | yes | yes |
| Verdict | **Default.** Fast, and looks tegaki with boil | Use for clean, technical, uniform lines or when constant pixel width matters | Poor on boxy architecture (almost no visible lines); OK for organic props |

GP width formula (measured): `px ≈ radius × (lens / sensor_width × res_x) / distance`. For example,
r = 0.05 at 9 m with a 24 mm lens gives 3 px at 640 wide, 7 px at 1920 and 15 px at 3840.
The modifier default `radius = 0.0025` is invisible, and so is 0.012. For street shots use **0.04–0.06**;
for a close-up of the text use 0.03 at 35 mm and ~14 m.
Exclude the road plane with `OCCLUSION_ONLY`, which removes its border lines but keeps it
occluding. Exclude wires, markings, clouds, sign text and far cards through
`collection.lineart_usage = 'EXCLUDE'`.

## 6. Passes for the 2D and JS compositor

`add_pass_outputs()` adds a compositor File Output node. Files are named `<prefix>_<item><####>.png`:

- `p_gp0001.png`: **line art only**, RGBA 8-bit, straight alpha. The 2D engine can recolour,
  jitter or boil it, multiply it over paper, or offset it for chromatic misregistration.
- `p_mist0001.png`: 16-bit grey, linear 1–250 m (0 = near). Use it for depth fog, tints, or fake DOF in 2D.
- `lines####` (Freestyle `as_pass=True`) and `alpha####` are also available. `depth=True` and
  `normal=True` only enable the view-layer passes. Write those to multilayer EXR if they are needed.
- Beauty frames are RGBA PNG. With `transparent=True` the sky is dropped and 3D elements can be layered over 2D backgrounds.
- A still render writes `p_mist.png` without a frame number. An animation writes `p_mist0001.png` and so on.

## 7. Timings (RTX 3080, 1920x1080, 16 samples, DOF and bloom on)

| Configuration | First frame | Steady |
|---|---|---|
| EEVEE + GP Line Art, beauty only | 1.6–1.8 s | **0.74–0.82 s/frame** |
| EEVEE + GP Line Art + mist and GP PNG passes | 1.74 s | 0.88 s/frame |
| EEVEE + Freestyle (2.4 px, taper) | 6.1 s | **4.1 s/frame** |
| Cycles OptiX, 16 spp, OptiX denoise, persistent data, fake-toon + GP | 1.84 s | **0.66 s/frame** (no cast shadows, see gotchas) |
| Cycles under GPU contention from other agents | | 12–31 s/frame, so the GPU should not be shared during final renders |
| EEVEE still + finite haze `volume_box` | 2.84 s vs 2.23 s | about +0.6 s/frame |
| Text-only transparent still | 1.2–1.5 s | |
| Self-test, 50 % resolution (instances + Freestyle pass) | 2.5 s | 0.38 s/frame |

Other measurements:
- A single still takes about 8 s of wall time from process start.
- Cycles OptiX and CUDA were the same here (2.6–3.2 s per still). 16 spp and 64 spp were also the
  same, because the shading is emission-dominant and adaptive sampling stops early.
- Budget: 1,000 frames of 3D (33 s of the MV) take about 14 min in EEVEE. Rendering **on twos**
  (every other frame, held) halves that and matches the GP boil `step=2`.

## 8. Blender 5.1 API gotchas (all verified here)

1. The engine ids are `BLENDER_EEVEE`, `CYCLES` and `BLENDER_WORKBENCH`. `BLENDER_EEVEE_NEXT` raises an
   error. The static `enum_items` of the engine property lists only EEVEE, because Cycles is
   registered by its add-on, so assign the value and do not introspect.
2. View transforms: `'Standard','ACES 1.3','ACES 2.0','Khronos PBR Neutral','AgX','Filmic','Filmic Log','False Color','Raw'`.
   AgX is the default, and the looks are named `'AgX - Punchy'` etc. The enum only lists values on
   an instance; the static list shows `NONE`.
3. **Compositor.**
   - `scene.node_tree` is gone. Use `scene.compositing_node_group = bpy.data.node_groups.new(name, 'CompositorNodeTree')`.
   - `CompositorNodeComposite` no longer exists. Use `NodeGroupOutput` plus `ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')`.
4. **File Output node.**
   - Set `node.format.media_type = 'IMAGE'` before `file_format = 'PNG'`. The default is
     `MULTI_LAYER_IMAGE`, and without the change you get the error `enum "PNG" not found in ('OPEN_EXR_MULTILAYER')`.
   - The slots are `node.file_output_items.new(socket_type, name)`, with `item.override_node_format`
     and `item.format`. The path is `node.directory` + `node.file_name`.
   - `render.image_settings.media_type` has the same rule: 'VIDEO' is needed for FFMPEG.
5. Glare node settings are **input sockets** now: `g.inputs['Type'].default_value = 'Bloom'`.
   EEVEE has no bloom checkbox, so do bloom in the compositor.
6. **Layered actions.** `Action.fcurves` is gone. Use
   `bpy_extras.anim_utils.action_get_channelbag_for_slot(act, obj.animation_data.action_slot).fcurves`,
   which is wrapped as `bc.fcurves(obj)`.
7. `Material.use_nodes` and `World.use_nodes` are deprecated; they are always node-based and only emit a DeprecationWarning.
8. **Grease Pencil v3.**
   - Create it with `bpy.data.grease_pencils.new()`, object type `'GREASEPENCIL'`, and `gp.layers.new(name)`.
     A GP material needs `bpy.data.materials.create_gpencil_data(mat)`.
   - Line Art is `obj.modifiers.new(type='LINEART')`; there is no `grease_pencil_modifiers` any more.
     The thickness property is now `radius`. `target_layer` takes a string and `target_material` a Material.
   - Other modifiers: `GREASE_PENCIL_NOISE` (`step`, `random_mode='STEP'`), `GREASE_PENCIL_LENGTH`
     (overshoot), `GREASE_PENCIL_THICKNESS`, `GREASE_PENCIL_SMOOTH`.
   - Line Art sees Geometry Nodes instances when `use_object_instances = True`.
9. EEVEE `shadow_pool_size` has a maximum of `'1024'` ('4096' raises an error). Sun `angle > 0` gives
   saw-tooth toon shadows (see section 4).
10. **World volume in EEVEE is infinite.** It absorbs the whole sky, which renders **black**, and
    extinguishes the sun. Use a finite `volume_box` for haze and god rays.
11. **Shader to RGB is EEVEE-only.** In Cycles use `toon_material(mode='fake')`: dot(N, light) + fill +
    ambient → ramp. The bands match EEVEE, but there are **no cast shadows**. A Cycles cel pipeline
    with shadows would need a compositor posterize of the DiffDir pass, which was not built.
12. **Fonts.**
    - `.ttc`, `.otf` and `.ttf` all load. A `.ttc` loads its first face.
    - **Variable fonts load their default instance only**: NotoSansJP-VF gives *Thin* and
      NotoSerifJP-VF gives *ExtraLight*. Use the static `NotoSansJP-Black.otf` or `yumindb.ttf`
      (Yu Mincho Demibold) instead.
    - The EM scale differs between fonts. "残光" at size 1 is 1.18 m wide in YuGothB, 0.69 m in
      Noto Sans JP and 1.93 m in MS Mincho. `jp_text(height=...)` normalises this.
    - JP fonts already present in `C:\Windows\Fonts`: YuGoth[B/M/R/L].ttc, yumin*.ttf, msmincho.ttc,
      meiryo*.ttc, BIZ-UD*, UDDigiKyokashoN-*.ttc, NotoSansJP-*.otf, NotoSansJP-VF.ttf and
      NotoSerifJP-VF.ttf, so nothing had to be downloaded.
13. Convert text to a mesh (`bpy.data.meshes.new_from_object(obj.evaluated_get(dg))`). This lets
    face-based material slots work (front face vs sides/bevel) and gives line art clean input.
14. The Geometry Nodes Instance on Points `Rotation` input is a rotation socket. Feed it through
    `FunctionNodeEulerToRotation`. Object Info has an `As Instance` input.
15. The Cycles log line `HIPEW initialization failed` is harmless (it is the AMD HIP backend).
16. Everything is built with the data API and bmesh, with **no `bpy.ops`** apart from render,
    read_factory_settings and save, so there are no context problems in `-b` mode.
17. GPU sharing: other processes on the GPU (the parallel agents) can make EEVEE and Cycles 5–20×
    slower. Check `nvidia-smi` before timing or final renders.

## 9. What did not work, or was rejected

- The world volume fog (black sky), the tiny sun angle (saw-tooth shadows), `shadow_pool_size='4096'`,
  `BLENDER_EEVEE_NEXT`, `CompositorNodeComposite`, and File Output PNG without `media_type='IMAGE'`.
- GP radius 0.012 (invisible) and the default 0.0025. Inverted hull on buildings (lines barely visible;
  it also cast self-shadows until `use_backface_culling_shadow=True` was set).
- Cycles for toon: it is fast, but there are no cel cast shadows. It is only worth it for
  refraction/caustic effects or path-traced volumetrics.
- A dense haze box (0.012) turns the frame muddy brown. 0.004–0.006 gives a pleasant golden haze.
- 200 % resolution (29 s) and a high TAA sample count did not fix the shadow edges; only the sun `angle = 0` did.

## 10. Which shots are worth doing in 3D for this MV

Do these in 3D, where perspective and parallax would be painful to hand-animate:
1. **Establishing and transition shots with camera travel.** The dusk street dolly (the probe),
   crane-ups along power poles to the sky, a railway-crossing (踏切) push-in, rooftop pull-backs,
   and a train passing through frame. Lines plus toon make these blend with tegaki frames.
2. **Big kinetic 3D typography** for the title and the chorus hook words. Extruded Mincho glyphs
   standing in the street, glyphs flying through the camera, text tunnels, glyphs casting real
   shadows on the road. Use `jp_text` with a cream face and hot-pink sides plus line art
   (`text_eevee_gp_v2.png`). Also vertical tategaki signs.
3. **The light as a story device (残光 = afterglow).** Animate `SUN_DIR` down over a verse so the
   shadows sweep across the facades and the lit band climbs the buildings, then goes out. Then
   turn on window, vending-machine and street-light emitters one by one as night falls. In 3D this
   is one keyframe pair; by hand it is weeks of work.
4. **Instanced motion-graphics swarms.** Thousands of cubes, petals, glyph particles or light orbs on
   Geometry Nodes points (`instance_on_points`), on follow-path orbits with DOF rack focus
   (see `selftest`).
5. **Output layers.** Render beauty with `transparent=True` plus the `p_gp` line pass and the mist pass,
   then finish in the browser engine: paper texture, line boil, hue shift on beats, chromatic
   offset. Render on twos for the tegaki cadence.

Keep these in 2D: characters and faces (hand-drawn or codex art), most lyric text (JIZURA/JS),
painterly skies and emotional close-ups, and abstract flat graphics. 3D should support these, not
replace them.
