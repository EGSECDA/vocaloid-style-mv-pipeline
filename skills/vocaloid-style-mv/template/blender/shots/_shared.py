r"""
_shared.py - helpers shared by blender/shots/shotA_street.py and shotB_crossing.py.

Everything here is local to the two showcase shots (the project-wide library stays
tools/blender_common.py, which is imported unchanged).

  * beat / frame mapping from analysis/audio.json      beats_in(), frame_of()
  * per-frame camera keying (yaw / pitch / roll)         key_camera_frames()
  * animated dusk->night sky with sun disc + star field  sky_world()
  * glyph monolith builder (mincho, extruded, rim-lit)   monolith()
  * 'channel split' night toon material                  night_toon()
      G channel of Shader-to-RGB = moon (white lamps), R-G = red lamp spill (pure red lamps),
      B-G = sodium street-lamp pool (pure blue lamps)  -> three independent cel-shaded light
      layers with real cast shadows from ONE diffuse closure.
  * JPEG output, compositor exposure (white-out), socket keyframes

Paths: ROOT = two levels above this file (blender/shots/ -> project root); beats from <ROOT>/analysis/audio.json
(tools/analyze_audio.py). Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import sys
import os
import math
import json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import importlib
import blender_common as bc
importlib.reload(bc)
import bpy
from mathutils import Vector, Quaternion, Euler, Matrix

AUDIO = os.path.join(ROOT, "analysis", "audio.json")
FPS = 30


# ------------------------------------------------------------------------------------ timing
def load_audio():
    if not os.path.exists(AUDIO):
        raise FileNotFoundError(f"{AUDIO} missing: run  python tools/analyze_audio.py  first")
    with open(AUDIO, encoding="utf-8") as f:
        return json.load(f)


def frame_of(t, t0):
    """song time -> shot frame (frame 1 = t0)."""
    return int(round((t - t0) * FPS + 1e-6)) + 1


def time_of(f, t0):
    return t0 + (f - 1) / FPS


def beats_in(t0, t1, key="beats"):
    a = load_audio()
    return [b for b in a[key] if t0 - 1e-3 <= b <= t1 + 1e-3]


# ------------------------------------------------------------------------------------ easing
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def smoother(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * t * (t * (t * 6 - 15) + 10)


def ease_in_out_cubic(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_expo(t):
    t = clamp(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_in_expo(t):
    t = clamp(t)
    return 0.0 if t <= 0 else 2 ** (10 * t - 10)


def ease_in_cubic(t):
    t = clamp(t)
    return t * t * t


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out_sine(t):
    t = clamp(t)
    return -(math.cos(math.pi * t) - 1) / 2


def ease_in_quad(t):
    t = clamp(t)
    return t * t


def ease_out_back(t, s=1.70158):
    t = clamp(t)
    c3 = s + 1
    return 1 + c3 * (t - 1) ** 3 + s * (t - 1) ** 2


# ------------------------------------------------------------------------------------ camera
def cam_quat(forward, roll_rad=0.0):
    """Camera orientation looking along `forward`, world up = +Z, then rolled about the view axis."""
    f = Vector(forward).normalized()
    q = f.to_track_quat("-Z", "Y")
    if roll_rad:
        q = q @ Quaternion((0.0, 0.0, 1.0), roll_rad)
    return q


def key_camera_frames(cam, frames):
    """frames: list of dicts {f, loc, fwd, roll(rad), lens, focus(optional m)}.  Keys location,
    rotation (euler, made continuous) and lens on EVERY frame with LINEAR interpolation, so the
    motion is fully designed in Python (custom easing, beat locks, banking)."""
    cam.rotation_mode = "XYZ"
    prev = None
    for k in frames:
        f = k["f"]
        cam.location = k["loc"]
        e = cam_quat(k["fwd"], k.get("roll", 0.0)).to_euler("XYZ")
        if prev is not None:
            e.make_compatible(prev)
        prev = e.copy()
        cam.rotation_euler = e
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
        if "lens" in k:
            cam.data.lens = k["lens"]
            cam.data.keyframe_insert("lens", frame=f)
        if "focus" in k and cam.data.dof.use_dof:
            cam.data.dof.focus_distance = k["focus"]
            cam.data.dof.keyframe_insert("focus_distance", frame=f)
    for idb in (cam, cam.data):
        for fc in bc.fcurves(idb):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
    # dof lives on camera data -> covered above


def key_value(sock_owner, attr, pairs, interp="LINEAR"):
    """Keyframe `attr` of a socket/property owner at [(frame, value), ...]."""
    for f, v in pairs:
        setattr(sock_owner, attr, v)
        sock_owner.keyframe_insert(attr, frame=f)
    return sock_owner


def set_id_interp(idb, interp="LINEAR"):
    """Force interpolation on every fcurve of an ID (material/node tree/world/light...)."""
    ad = getattr(idb, "animation_data", None)
    if not ad or not ad.action:
        return
    for fc in bc.fcurves(idb):
        for kp in fc.keyframe_points:
            kp.interpolation = interp


# ------------------------------------------------------------------------------------ output
def set_jpeg_output(path_pattern, quality=95):
    s = bpy.context.scene
    im = s.render.image_settings
    try:
        im.media_type = "IMAGE"
    except (AttributeError, TypeError):
        pass
    im.file_format = "JPEG"
    im.color_mode = "RGB"
    im.quality = quality
    s.render.filepath = path_pattern
    s.render.use_file_extension = True
    s.render.use_overwrite = True
    s.render.use_placeholder = False


# ------------------------------------------------------------------------------------ sky
def _val(nt, name, v, loc):
    n = nt.nodes.new("ShaderNodeValue")
    n.name = name
    n.label = name
    n.location = loc
    n.outputs[0].default_value = v
    return n


def sky_world(day_stops, night_stops, z_lo=-0.01, z_hi=0.6, sun_dir=(0, 1, 0.05),
              sun_color="#fff6dc", sun_strength=2.2, sun_size_deg=4.5, sun_soft_deg=0.35,
              glow_color="#ffc070", glow_power=3.0, glow_strength=0.9,
              ambient="#4a3a6a", ambient_strength=0.3, below="#342a52", below_night=None,
              stars=True, star_color="#fff4e8", star_scale=(22.0, 60.0), star_keep=(0.84, 0.78),
              star_radius=(0.085, 0.06), star_strength=(4.0, 1.6), star_z=(0.04, 0.35),
              moon_dir=None, moon_color="#e8f0ff", moon_size_deg=2.2, moon_strength=1.6,
              moon_glow="#3a5a9a", moon_glow_power=2.0, moon_glow_strength=0.35,
              night=0.0, star_fade=None, wide_glow=None):
    """Two-state gradient sky (day_stops -> night_stops by the keyable value node 'Night'),
    painted sun disc + halo whose direction is keyable (value nodes SunX/SunY/SunZ), optional
    moon disc, and a procedural star field (two Voronoi layers: few bright blooming stars +
    many faint ones) faded in by the keyable value node 'Stars'.
    Camera rays see this; lighting sees the flat `ambient` (keeps toon bands predictable).
    Returns dict of keyable output sockets: night, stars, sunx, suny, sunz, glow."""
    w = bpy.context.scene.world
    nt = w.node_tree
    bc._clear_tree(nt)
    L = nt.links
    out = nt.nodes.new("ShaderNodeOutputWorld")
    out.location = (1800, 0)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-1600, 0)
    dirn = bc._vmath(nt, "NORMALIZE", tc.outputs["Generated"], None, loc=(-1400, 0))
    dirv = dirn.outputs["Vector"]
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-1200, 200)
    L.new(dirv, sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.location = (-1000, 200)
    mr.inputs["From Min"].default_value = z_lo
    mr.inputs["From Max"].default_value = z_hi
    L.new(sep.outputs["Z"], mr.inputs["Value"])
    r_day = bc._ramp(nt, list(day_stops), interp="LINEAR", loc=(-800, 350))
    r_night = bc._ramp(nt, list(night_stops), interp="LINEAR", loc=(-800, 100))
    L.new(mr.outputs[0], r_day.inputs["Fac"])
    L.new(mr.outputs[0], r_night.inputs["Fac"])
    v_night = _val(nt, "Night", night, (-800, 550))
    col = bc._mix_rgb(nt, v_night.outputs[0], r_day.outputs["Color"], r_night.outputs["Color"],
                      loc=(-500, 250)).outputs[2]
    # below horizon
    hz = bc._math(nt, "LESS_THAN", sep.outputs["Z"], z_lo, loc=(-600, 500))
    bel = below
    if below_night:
        bel = bc._mix_rgb(nt, v_night.outputs[0], below, below_night, loc=(-500, 650)).outputs[2]
    col = bc._mix_rgb(nt, hz.outputs[0], col, bel, loc=(-300, 300)).outputs[2]
    handles = {"night": v_night.outputs[0]}
    # --- stars (above horizon only)
    if stars:
        v_st = _val(nt, "Stars", 1.0 if star_fade is None else star_fade, (-800, -900))
        handles["stars"] = v_st.outputs[0]
        zmask = bc._math(nt, "MULTIPLY", None, None, loc=(-300, -900))
        zm = nt.nodes.new("ShaderNodeMapRange")
        zm.location = (-600, -1000)
        zm.inputs["From Min"].default_value = star_z[0]
        zm.inputs["From Max"].default_value = star_z[1]
        zm.interpolation_type = "SMOOTHSTEP"
        L.new(sep.outputs["Z"], zm.inputs["Value"])
        L.new(zm.outputs[0], zmask.inputs[0])
        L.new(v_st.outputs[0], zmask.inputs[1])
        star_sum = None
        for i, (sc_, keep, rad, stren) in enumerate(zip(star_scale, star_keep, star_radius, star_strength)):
            vo = nt.nodes.new("ShaderNodeTexVoronoi")
            vo.location = (-900, -1200 - i * 300)
            vo.voronoi_dimensions = "3D"
            vo.feature = "F1"
            vo.inputs["Scale"].default_value = sc_
            try:
                vo.inputs["Randomness"].default_value = 1.0
            except KeyError:
                pass
            # offset so the two layers don't share cells
            off = bc._vmath(nt, "ADD", dirv, (13.7 * i, 7.1 * i, 3.3 * i), loc=(-1100, -1200 - i * 300))
            L.new(off.outputs["Vector"], vo.inputs["Vector"])
            # dot: 1 - smoothstep(r*0.5, r, dist)
            dm = nt.nodes.new("ShaderNodeMapRange")
            dm.location = (-650, -1200 - i * 300)
            dm.inputs["From Min"].default_value = rad
            dm.inputs["From Max"].default_value = rad * 0.35
            dm.interpolation_type = "SMOOTHSTEP"
            L.new(vo.outputs["Distance"], dm.inputs["Value"])
            # keep only a fraction of cells (random colour per cell)
            sepc = nt.nodes.new("ShaderNodeSeparateColor")
            sepc.location = (-650, -1350 - i * 300)
            L.new(vo.outputs["Color"], sepc.inputs[0])
            kp = bc._math(nt, "GREATER_THAN", sepc.outputs[0], keep, loc=(-450, -1350 - i * 300))
            # brightness variation per star from the G channel
            br = bc._math(nt, "MULTIPLY_ADD", sepc.outputs[1], 0.8, loc=(-450, -1500 - i * 300))
            br.inputs[2].default_value = 0.35
            s1 = bc._math(nt, "MULTIPLY", dm.outputs[0], kp.outputs[0], loc=(-300, -1250 - i * 300))
            s2 = bc._math(nt, "MULTIPLY", s1.outputs[0], br.outputs[0], loc=(-150, -1250 - i * 300))
            s3 = bc._math(nt, "MULTIPLY", s2.outputs[0], stren, loc=(0, -1250 - i * 300))
            star_sum = s3.outputs[0] if star_sum is None else bc._math(
                nt, "ADD", star_sum, s3.outputs[0], loc=(150, -1250 - i * 300)).outputs[0]
        sm = bc._math(nt, "MULTIPLY", star_sum, zmask.outputs[0], loc=(300, -1000))
        sc_lin = bc.rgb(star_color)
        scol = nt.nodes.new("ShaderNodeMix")
        scol.data_type = "RGBA"
        scol.blend_type = "ADD"
        scol.clamp_result = False
        scol.location = (500, -600)
        scol.inputs[0].default_value = 1.0
        L.new(col, scol.inputs[6])
        # star colour * amount
        stc = nt.nodes.new("ShaderNodeVectorMath")
        stc.operation = "SCALE"
        stc.location = (400, -900)
        stc.inputs[0].default_value = sc_lin[:3]
        L.new(sm.outputs[0], stc.inputs["Scale"])
        L.new(stc.outputs["Vector"], scol.inputs[7])
        col = scol.outputs[2]
    # --- sun disc + halo (direction keyable)
    if sun_dir is not None:
        sx = _val(nt, "SunX", sun_dir[0], (-1400, -300))
        sy = _val(nt, "SunY", sun_dir[1], (-1400, -400))
        sz = _val(nt, "SunZ", sun_dir[2], (-1400, -500))
        cxyz = nt.nodes.new("ShaderNodeCombineXYZ")
        cxyz.location = (-1200, -400)
        L.new(sx.outputs[0], cxyz.inputs[0])
        L.new(sy.outputs[0], cxyz.inputs[1])
        L.new(sz.outputs[0], cxyz.inputs[2])
        sn = bc._vmath(nt, "NORMALIZE", cxyz.outputs[0], None, loc=(-1050, -400))
        dot = bc._vmath(nt, "DOT_PRODUCT", dirv, sn.outputs["Vector"], loc=(-900, -400))
        c_in = math.cos(math.radians(sun_size_deg * 0.5))
        c_out = math.cos(math.radians(sun_size_deg * 0.5 + sun_soft_deg))
        disc = nt.nodes.new("ShaderNodeMapRange")
        disc.location = (-650, -400)
        disc.inputs["From Min"].default_value = c_out
        disc.inputs["From Max"].default_value = c_in
        L.new(dot.outputs["Value"], disc.inputs["Value"])
        # disc is hidden below the horizon line (sun sinks behind the ground plane)
        above = bc._math(nt, "GREATER_THAN", sep.outputs["Z"], z_lo + 0.004, loc=(-650, -250))
        disc_m = bc._math(nt, "MULTIPLY", disc.outputs[0], above.outputs[0], loc=(-450, -350))
        mx = bc._math(nt, "MAXIMUM", dot.outputs["Value"], 0.0, loc=(-650, -600))
        pw = bc._math(nt, "POWER", mx.outputs[0], glow_power * 10.0, loc=(-500, -600))
        v_glow = _val(nt, "Glow", glow_strength, (-650, -750))
        gs = bc._math(nt, "MULTIPLY", pw.outputs[0], v_glow.outputs[0], loc=(-350, -600), clamp=True)
        mg = bc._mix_rgb(nt, gs.outputs[0], col, glow_color, blend="SCREEN", loc=(700, -200))
        sc_lin = bc.rgb(sun_color)
        md = bc._mix_rgb(nt, disc_m.outputs[0], mg.outputs[2],
                         (sc_lin[0] * sun_strength, sc_lin[1] * sun_strength, sc_lin[2] * sun_strength, 1.0),
                         loc=(900, -200))
        col = md.outputs[2]
        handles.update(sunx=sx.outputs[0], suny=sy.outputs[0], sunz=sz.outputs[0], glow=v_glow.outputs[0])
    # --- wide afterglow lobe towards the sun azimuth (magenta dusk that survives into the night)
    if wide_glow is not None and sun_dir is not None:
        wcol, wpow, wstr = wide_glow
        # horizontal sun direction only, so the lobe stays low and wide
        hz_s = bc._vmath(nt, "MULTIPLY", sn.outputs["Vector"], (1.0, 1.0, 0.0))
        hz_n = bc._vmath(nt, "NORMALIZE", hz_s.outputs["Vector"], None)
        dw = bc._vmath(nt, "DOT_PRODUCT", dirv, hz_n.outputs["Vector"])
        mw = bc._math(nt, "MAXIMUM", dw.outputs["Value"], 0.0)
        pw_ = bc._math(nt, "POWER", mw.outputs[0], wpow)
        v_w = _val(nt, "Wide", wstr, (-650, -1600))
        gw = bc._math(nt, "MULTIPLY", pw_.outputs[0], v_w.outputs[0], clamp=True)
        col = bc._mix_rgb(nt, gw.outputs[0], col, wcol, blend="SCREEN").outputs[2]
        handles["wide"] = v_w.outputs[0]
    # --- moon
    if moon_dir is not None:
        md_ = Vector(moon_dir).normalized()
        dot = bc._vmath(nt, "DOT_PRODUCT", dirv, tuple(md_), loc=(700, -700))
        c_in = math.cos(math.radians(moon_size_deg * 0.5))
        c_out = math.cos(math.radians(moon_size_deg * 0.5 + 0.12))
        disc = nt.nodes.new("ShaderNodeMapRange")
        disc.location = (900, -700)
        disc.inputs["From Min"].default_value = c_out
        disc.inputs["From Max"].default_value = c_in
        L.new(dot.outputs["Value"], disc.inputs["Value"])
        mx = bc._math(nt, "MAXIMUM", dot.outputs["Value"], 0.0, loc=(900, -900))
        pw = bc._math(nt, "POWER", mx.outputs[0], moon_glow_power * 10.0, loc=(1050, -900))
        gs = bc._math(nt, "MULTIPLY", pw.outputs[0], moon_glow_strength, loc=(1200, -900), clamp=True)
        mg = bc._mix_rgb(nt, gs.outputs[0], col, moon_glow, blend="SCREEN", loc=(1200, -600))
        mc = bc.rgb(moon_color)
        mm = bc._mix_rgb(nt, disc.outputs[0], mg.outputs[2],
                         (mc[0] * moon_strength, mc[1] * moon_strength, mc[2] * moon_strength, 1.0),
                         loc=(1400, -600))
        col = mm.outputs[2]
    bg_cam = nt.nodes.new("ShaderNodeBackground")
    bg_cam.location = (1500, 100)
    L.new(col, bg_cam.inputs["Color"])
    bg_amb = nt.nodes.new("ShaderNodeBackground")
    bg_amb.location = (1500, -100)
    bg_amb.inputs["Color"].default_value = bc.rgb(ambient)
    bg_amb.inputs["Strength"].default_value = ambient_strength
    lp = nt.nodes.new("ShaderNodeLightPath")
    lp.location = (1500, 350)
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.location = (1650, 0)
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    L.new(bg_amb.outputs[0], mix.inputs[1])
    L.new(bg_cam.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs["Surface"])
    return handles


def key_socket(sock, pairs):
    """Keyframe a node socket default_value at [(frame, value)...] (LINEAR)."""
    for f, v in pairs:
        sock.default_value = v
        sock.keyframe_insert("default_value", frame=f)


# ------------------------------------------------------------------------------------ glyphs
def monolith(ch, height, loc, rot_deg=(90, 0, 0), extrude=0.09, bevel=0.006, face=None, side=None,
             coll=None, name=None, font="mincho", ground=False):
    """Giant extruded mincho glyph.  The object origin is the glyph centre; with ground=True the
    glyph is moved so its lowest vertex sits on z = loc.z."""
    ob = bc.jp_text(ch, font=font, height=height, extrude=extrude, bevel_depth=bevel,
                    bevel_resolution=1, loc=loc, rot_deg=rot_deg, coll=coll, mat=face, side_mat=side,
                    name=name or ("Glyph_" + ch))
    bpy.context.view_layer.update()
    if ground:
        zmin = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
        ob.location.z += loc[2] - zmin
        bpy.context.view_layer.update()
    return ob


def world_verts(ob):
    bpy.context.view_layer.update()
    M = ob.matrix_world
    return [M @ v.co for v in ob.data.vertices]


# ------------------------------------------------------------------------------------ materials
def toon_rgb_split(name, moon, red=None, sodium=None, rim=None, rim_dir=None, rim_width=0.3,
                   rim_at=0.6, haze=None, haze_range=(30.0, 220.0), haze_max=0.85,
                   moon_at=(0.02, 0.16), red_at=(0.02, 0.18), sodium_at=(0.02, 0.2),
                   red_gain=(0.55, 1.0), sodium_gain=(0.5, 1.0), emission=1.0):
    """Night cel material with THREE independent light layers from one Shader-to-RGB:
         moon   = G            (white lamps)        -> 3-band ramp  moon=(lit, shade, dark)
         red    = R - G        (pure red lamps)     -> 2 bands mixed (ADD) towards `red`
         sodium = B - G        (pure blue lamps)    -> 2 bands mixed (ADD) towards `sodium`
    All three cast real shadows.  rim: optional moonlit rim band."""
    m, nt, out = bc.new_material(name)
    L = nt.links
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    d.location = (-1400, 0)
    d.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    s2r.location = (-1250, 0)
    L.new(d.outputs[0], s2r.inputs[0])
    sepc = nt.nodes.new("ShaderNodeSeparateColor")
    sepc.location = (-1100, 0)
    L.new(s2r.outputs["Color"], sepc.inputs[0])
    R, G, B = sepc.outputs[0], sepc.outputs[1], sepc.outputs[2]
    lit, shade, dark = moon
    ramp = bc._ramp(nt, [(0.0, dark), (moon_at[0], shade), (moon_at[1], lit)], loc=(-850, 200))
    L.new(G, ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    if rim:
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.location = (-1100, -600)
        lw.inputs["Blend"].default_value = rim_width
        gt = bc._math(nt, "GREATER_THAN", lw.outputs["Facing"], rim_at, loc=(-900, -600))
        geo2 = nt.nodes.new("ShaderNodeNewGeometry")
        geo2.location = (-1300, -800)
        rd = Vector(rim_dir or (0, 0, 1)).normalized()
        dot2 = bc._vmath(nt, "DOT_PRODUCT", geo2.outputs["Normal"], tuple(rd), loc=(-1100, -800))
        side = bc._math(nt, "GREATER_THAN", dot2.outputs["Value"], 0.05, loc=(-900, -800))
        mask = bc._math(nt, "MULTIPLY", gt.outputs[0], side.outputs[0], loc=(-700, -650))
        # rim only where the moon actually reaches (not in cast shadow)
        lit_m = bc._math(nt, "GREATER_THAN", G, moon_at[0] * 1.5, loc=(-700, -800))
        mask2 = bc._math(nt, "MULTIPLY", mask.outputs[0], lit_m.outputs[0], loc=(-550, -700))
        col = bc._mix_rgb(nt, mask2.outputs[0], col, rim, loc=(-400, -300)).outputs[2]
    if red:
        sub = bc._math(nt, "SUBTRACT", R, G, loc=(-900, -150))
        rr = bc._ramp(nt, [(0.0, "#000000"), (red_at[0], "#8c8c8c"), (red_at[1], "#ffffff")],
                      loc=(-700, -150))
        L.new(sub.outputs[0], rr.inputs["Fac"])
        sepr = nt.nodes.new("ShaderNodeSeparateColor")
        sepr.location = (-450, -150)
        L.new(rr.outputs["Color"], sepr.inputs[0])
        # band value 0 / red_gain[0] / red_gain[1]
        bandf = bc._math(nt, "MULTIPLY", sepr.outputs[0], 1.0, loc=(-300, -150))
        rl = bc.rgb(red)
        amt = nt.nodes.new("ShaderNodeVectorMath")
        amt.operation = "SCALE"
        amt.location = (-150, -150)
        amt.inputs[0].default_value = rl[:3]
        L.new(bandf.outputs[0], amt.inputs["Scale"])
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "SCREEN"
        mx.clamp_result = False
        mx.location = (0, 0)
        mx.inputs[0].default_value = 1.0
        L.new(col, mx.inputs[6])
        L.new(amt.outputs[0], mx.inputs[7])
        col = mx.outputs[2]
        # the two band levels come from the ramp greys: 0x8c = 0.26 linear -> remap
        rr.color_ramp.elements[1].color = (red_gain[0], red_gain[0], red_gain[0], 1)
        rr.color_ramp.elements[2].color = (red_gain[1], red_gain[1], red_gain[1], 1)
    if sodium:
        sub = bc._math(nt, "SUBTRACT", B, G, loc=(-900, -350))
        sr = bc._ramp(nt, [(0.0, "#000000"), (sodium_at[0], "#8c8c8c"), (sodium_at[1], "#ffffff")],
                      loc=(-700, -350))
        sr.color_ramp.elements[1].color = (sodium_gain[0],) * 3 + (1,)
        sr.color_ramp.elements[2].color = (sodium_gain[1],) * 3 + (1,)
        L.new(sub.outputs[0], sr.inputs["Fac"])
        seps = nt.nodes.new("ShaderNodeSeparateColor")
        seps.location = (-450, -350)
        L.new(sr.outputs["Color"], seps.inputs[0])
        sl = bc.rgb(sodium)
        amt = nt.nodes.new("ShaderNodeVectorMath")
        amt.operation = "SCALE"
        amt.location = (-150, -350)
        amt.inputs[0].default_value = sl[:3]
        L.new(seps.outputs[0], amt.inputs["Scale"])
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "SCREEN"
        mx.clamp_result = False
        mx.location = (150, -100)
        mx.inputs[0].default_value = 1.0
        L.new(col, mx.inputs[6])
        L.new(amt.outputs[0], mx.inputs[7])
        col = mx.outputs[2]
    if haze:
        col = bc._haze(nt, col, haze, haze_range, haze_max)
    em = nt.nodes.new("ShaderNodeEmission")
    em.location = (400, 0)
    em.inputs["Strength"].default_value = emission
    L.new(col, em.inputs["Color"])
    L.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = bc.rgb(lit)
    return m


def glyph_toon(name, lit, shade, dark, rim=None, rim_dir=(0, 1, 0), rim_width=0.25, rim_at=0.62,
               grad=None, haze=None, haze_range=(80.0, 420.0), haze_max=0.5, mode="shader_to_rgb",
               light_dir=(0, 0, 1), shade_at=0.16, dark_at=0.02, lit_strength=1.0):
    """Cel material for big glyph slabs: 3-band Shader-to-RGB ramp (or 'fake' N.L), hot rim
    (linear colour > 1 blooms), and a world-Z gradient over the whole surface
    grad=(z0, z1, top_hex, amount_top, bottom_hex, amount_bottom) so huge flat faces are not dead flat
    (sky light on the top, bounce/occlusion at the foot)."""
    m, nt, out = bc.new_material(name)
    L = nt.links
    if mode == "shader_to_rgb":
        d = nt.nodes.new("ShaderNodeBsdfDiffuse")
        d.inputs["Color"].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        L.new(d.outputs[0], s2r.inputs[0])
        lv = s2r.outputs["Color"]
    else:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = bc._vmath(nt, "DOT_PRODUCT", geo.outputs["Normal"], tuple(Vector(light_dir).normalized()))
        lv = bc._math(nt, "MAXIMUM", dot.outputs["Value"], 0.0).outputs[0]
        lv = bc._math(nt, "ADD", lv, 0.03).outputs[0]
    ramp = bc._ramp(nt, [(0.0, dark), (dark_at, shade), (shade_at, lit)])
    L.new(lv, ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    if grad:
        z0, z1, top, a_top, bot, a_bot = grad
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Position"], sep.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = z0
        mr.inputs["From Max"].default_value = z1
        L.new(sep.outputs["Z"], mr.inputs["Value"])
        # top tint grows with height, bottom tint fades out over the lower 30 %
        ft = bc._math(nt, "MULTIPLY", mr.outputs[0], a_top)
        col = bc._mix_rgb(nt, ft.outputs[0], col, top, blend="SCREEN").outputs[2]
        inv = bc._math(nt, "SUBTRACT", 1.0, mr.outputs[0])
        fb = bc._math(nt, "POWER", inv.outputs[0], 3.0)
        fb2 = bc._math(nt, "MULTIPLY", fb.outputs[0], a_bot)
        col = bc._mix_rgb(nt, fb2.outputs[0], col, bot, blend="MULTIPLY").outputs[2]
    if rim is not None:
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = rim_width
        gt = bc._math(nt, "GREATER_THAN", lw.outputs["Facing"], rim_at)
        geo2 = nt.nodes.new("ShaderNodeNewGeometry")
        dot2 = bc._vmath(nt, "DOT_PRODUCT", geo2.outputs["Normal"], tuple(Vector(rim_dir).normalized()))
        side = bc._math(nt, "GREATER_THAN", dot2.outputs["Value"], 0.05)
        mask = bc._math(nt, "MULTIPLY", gt.outputs[0], side.outputs[0])
        col = bc._mix_rgb(nt, mask.outputs[0], col, rim).outputs[2]
    if haze:
        col = bc._haze(nt, col, haze, haze_range, haze_max)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = lit_strength
    L.new(col, em.inputs["Color"])
    L.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = bc.rgb(lit)
    return m


def glow_material(name, color, strength=6.0):
    """Emitter whose strength is keyable: returns (material, strength_socket)."""
    m, nt, out = bc.new_material(name)
    em = nt.nodes.new("ShaderNodeEmission")
    em.name = "Emit"
    em.inputs["Color"].default_value = bc.rgb(color)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = bc.rgb(color)
    return m, em.inputs["Strength"]


def glow_mix_material(name, off_color, on_color, strength_on=8.0):
    """Lamp lens: mixes a dark 'off' glass colour and a bright emitter by the keyable factor.
    Returns (material, factor_socket)."""
    m, nt, out = bc.new_material(name)
    L = nt.links
    v = nt.nodes.new("ShaderNodeValue")
    v.name = "On"
    v.outputs[0].default_value = 0.0
    oc = bc.rgb(on_color)
    mx = bc._mix_rgb(nt, v.outputs[0], off_color,
                     (oc[0] * strength_on, oc[1] * strength_on, oc[2] * strength_on, 1.0), loc=(0, 0))
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    L.new(mx.outputs[2], em.inputs["Color"])
    L.new(em.outputs[0], out.inputs["Surface"])
    return m, v.outputs[0]


def additive_cone_material(name, color, strength=0.6, falloff=1.6):
    """Fake volumetric light cone: emission along the cone (object-local -Z = down) fading with
    distance from the apex and at grazing angles, blended additively (transparent + emission)."""
    m, nt, out = bc.new_material(name)
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    # Generated z: 0 at bottom, 1 at apex (cone built apex-up in local space)
    pw = bc._math(nt, "POWER", sep.outputs["Z"], falloff)
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    inv = bc._math(nt, "SUBTRACT", 1.0, lw.outputs["Facing"])
    edge = bc._math(nt, "POWER", inv.outputs[0], 1.5)
    a = bc._math(nt, "MULTIPLY", pw.outputs[0], edge.outputs[0])
    a2 = bc._math(nt, "MULTIPLY", a.outputs[0], strength)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = bc.rgb(color)
    L.new(a2.outputs[0], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    add = nt.nodes.new("ShaderNodeAddShader")
    L.new(tr.outputs[0], add.inputs[0])
    L.new(em.outputs[0], add.inputs[1])
    L.new(add.outputs[0], out.inputs["Surface"])
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = False
    try:
        m.use_transparency_overlap = True
    except AttributeError:
        pass
    return m


# ------------------------------------------------------------------------------------ compositor
def compositor_with_grade(bloom=(1.05, 0.5, 0.7), exposure=True, bloom2=None):
    """RenderLayers -> Exposure (keyable) -> Glare bloom [-> 2nd wide glare] -> out.
    Returns dict(exposure=<socket>, bloom_strength=<socket>, tree=ng)."""
    ng, rl, go = bc.compositor()
    last = rl.outputs["Image"]
    h = {"tree": ng}
    if exposure:
        ex = ng.nodes.new("CompositorNodeExposure")
        ex.location = (-150, 0)
        ng.links.new(last, ex.inputs[0])
        last = ex.outputs[0]
        h["exposure"] = ex.inputs[1]
    g = ng.nodes.new("CompositorNodeGlare")
    g.location = (150, 0)
    g.inputs["Type"].default_value = "Bloom"
    g.inputs["Quality"].default_value = "Medium"
    g.inputs["Threshold"].default_value = bloom[0]
    g.inputs["Strength"].default_value = bloom[1]
    g.inputs["Size"].default_value = bloom[2]
    ng.links.new(last, g.inputs["Image"])
    last = g.outputs[0]
    h["bloom_strength"] = g.inputs["Strength"]
    h["bloom_threshold"] = g.inputs["Threshold"]
    if bloom2:
        g2 = ng.nodes.new("CompositorNodeGlare")
        g2.location = (400, 0)
        g2.inputs["Type"].default_value = "Bloom"
        g2.inputs["Quality"].default_value = "Medium"
        g2.inputs["Threshold"].default_value = bloom2[0]
        g2.inputs["Strength"].default_value = bloom2[1]
        g2.inputs["Size"].default_value = bloom2[2]
        ng.links.new(last, g2.inputs["Image"])
        last = g2.outputs[0]
        h["bloom2_strength"] = g2.inputs["Strength"]
    ng.links.new(last, go.inputs[0])
    return h


def render_frames(pattern, frames, timing_log=None, tag=""):
    """Render an explicit list of frames (e.g. every 6th for previews) to pattern (#### = frame).
    Returns per-frame seconds."""
    import time
    sc = bpy.context.scene
    out = []
    for f in frames:
        sc.frame_set(f)
        sc.render.filepath = pattern.replace("####", "%04d" % f)
        t0 = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        out.append(round(time.perf_counter() - t0, 3))
        print("FRAME %d %.2fs" % (f, out[-1]), flush=True)
    if timing_log:
        bc.log_json(timing_log, {"tag": tag, "frames": list(frames), "per_frame": out,
                                 "mean_s": round(sum(out) / max(len(out), 1), 3)})
    return out
