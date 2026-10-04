r"""
blender_common.py  --  helpers for headless NPR / anime / tegaki-compatible renders
with Blender 5.1 (tested on 5.1.2, Windows 11, RTX 3080).

Import from any script started with
    python tools/blender_run.py script.py -- --key value          (finds Blender: env BLENDER, PATH, install dirs)
    blender -b --factory-startup -P script.py -- --key value      (same thing by hand)
like this (scripts in <ROOT>/blender/ are one level below the project root):
    import os, sys
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import blender_common as bc
    A = bc.parse_args({...defaults...}, doc=__doc__)   # '-- --help' prints the script's docstring

Japanese fonts are looked up by role (FONTS: 'mincho', 'gothic_black', ...) in env FONT_DIRS, the system font
folders (Windows / macOS / Linux) and <ROOT>/engine/fonts (tools/fetch_fonts.py) - see font_path().
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.

Blender 5.1 API facts this module relies on (verified by probes, see examples/zanko/BLENDER_RECIPE.md in the kit repo,
https://github.com/EGSECDA/vocaloid-style-mv-pipeline/tree/main/examples/zanko):
  * render engine ids: 'BLENDER_EEVEE' (EEVEE-Next is simply called BLENDER_EEVEE again),
    'CYCLES', 'BLENDER_WORKBENCH'.  'BLENDER_EEVEE_NEXT' no longer exists.
  * view transforms: 'Standard','ACES 1.3','ACES 2.0','Khronos PBR Neutral','AgX','Filmic',
    'Filmic Log','False Color','Raw'   (default for new scenes = AgX -> washes out flat colours)
  * compositor: scene.compositing_node_group = bpy.data.node_groups.new(.., 'CompositorNodeTree');
    there is NO CompositorNodeComposite any more -> use NodeGroupOutput + an interface socket.
    File Output node uses node.file_output_items.new(socket_type, name) + node.directory/.file_name.
  * actions are layered: Action.fcurves is gone -> use bpy_extras.anim_utils
    .action_get_channelbag_for_slot(action, anim_data.action_slot).fcurves
  * Grease Pencil v3: bpy.data.grease_pencils, object type 'GREASEPENCIL', Line Art is an
    ordinary object modifier type 'LINEART' (GreasePencilLineartModifier, width = .radius in metres)
  * Material.use_nodes / World.use_nodes are deprecated (always node based).
"""
import bpy
import bmesh
import math
import os
import sys
import time
import json
import random
from mathutils import Vector, Matrix, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402  (stdlib only: project root, font lookup)

ROOT = str(kit_env.ROOT)
BLENDER_EXE = bpy.app.binary_path    # the running Blender (outside Blender: kit_env.find_blender())

# Fonts with Japanese glyphs that load in Blender 5.1 (.ttc/.otf/.ttf all work; for .ttc the
# FIRST face of the collection is used; variable fonts load their DEFAULT instance only,
# e.g. NotoSansJP-VF.ttf -> "Thin", NotoSerifJP-VF.ttf -> "ExtraLight").
# Each role lists candidate files in order of preference: the Windows font the role was designed with first,
# then macOS (Hiragino), Linux (Noto CJK) and finally the OFL fonts fetched into engine/fonts by fetch_fonts.py.
FONTS = {
    "gothic_black": ["NotoSansJP-Black.otf", "NotoSansJP-Black.ttf", "NotoSansCJKjp-Black.otf",
                     "NotoSansCJK-Black.ttc", "ヒラギノ角ゴシック W9.ttc", "ヒラギノ角ゴシック W8.ttc",
                     "DelaGothicOne-Regular.ttf", "ZenKakuGothicNew-Black.ttf"],          # Noto Sans JP Black (OFL)
    "gothic_bold": ["NotoSansJP-Bold.otf", "NotoSansJP-Bold.ttf", "NotoSansCJKjp-Bold.otf", "NotoSansCJK-Bold.ttc",
                    "ヒラギノ角ゴシック W6.ttc", "ZenKakuGothicNew-Bold.ttf"],
    "yugothic_bold": ["YuGothB.ttc", "ヒラギノ角ゴシック W6.ttc", "NotoSansCJK-Bold.ttc",
                      "ZenKakuGothicNew-Bold.ttf"],                                       # Yu Gothic Bold
    "mincho": ["yumindb.ttf", "ヒラギノ明朝 ProN.ttc", "NotoSerifCJK-Bold.ttc", "NotoSerifCJKjp-Bold.otf",
               "ZenOldMincho-Bold.ttf", "ShipporiMinchoB1-Bold.ttf", "msmincho.ttc"],     # Yu Mincho Demibold
    "mincho_ms": ["msmincho.ttc", "ヒラギノ明朝 ProN.ttc", "NotoSerifCJK-Regular.ttc", "ZenOldMincho-Regular.ttf"],
    "mincho_biz": ["BIZ-UDMinchoM.ttc", "BIZUDMincho-Regular.ttf", "ヒラギノ明朝 ProN.ttc",
                   "NotoSerifCJK-Regular.ttc", "ZenOldMincho-Medium.ttf"],
    "kyokasho": ["UDDigiKyokashoN-B.ttc", "KleeOne-SemiBold.ttf", "KleeOne-Regular.ttf"],   # handwriting-ish
    "meiryo_bold": ["meiryob.ttc", "ヒラギノ角ゴシック W6.ttc", "NotoSansCJK-Bold.ttc", "ZenKakuGothicNew-Bold.ttf"],
    "serif_vf_light": ["NotoSerifJP-VF.ttf", "NotoSerifJP_wght_.ttf", "NotoSerifCJK-Light.ttc",
                       "ヒラギノ明朝 ProN.ttc", "ZenOldMincho-Regular.ttf"],                # loads ExtraLight only
}

# ----------------------------------------------------------------------------------------------
# argument parsing
# ----------------------------------------------------------------------------------------------

def script_args():
    """Arguments after the '--' separator of the blender command line."""
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def wants_help(argv=None):
    """True when -h / --help follows the '--' separator (Blender itself never sees it)."""
    a = script_args() if argv is None else argv
    return "--help" in a or "-h" in a


def print_help(doc, defaults=None):
    print((doc or "").strip("\n"))
    if defaults:
        print("\ndefaults: " + "  ".join(f"--{k} {v}" for k, v in defaults.items()))


def parse_args(defaults, doc=None):
    """Tiny '--key value' / '--flag' parser.  Types are inferred from `defaults`.
    Returns a plain dict.  Unknown keys are kept as strings.
    With `doc` (the calling script's __doc__), '-- --help' prints it plus the defaults and exits."""
    if doc is not None and wants_help():
        for _s in (sys.stdout, sys.stderr):  # shot docstrings may hold 残光 / ：; never crash on a cp1252 / cp932 console
            try:
                _s.reconfigure(errors="replace")
            except Exception:  # noqa: BLE001
                pass
        print_help(doc, defaults)
        sys.exit(0)
    out = dict(defaults)
    a = script_args()
    i = 0
    while i < len(a):
        tok = a[i]
        if not tok.startswith("--"):
            i += 1
            continue
        key = tok[2:].replace("-", "_")
        val = None
        if i + 1 < len(a) and not a[i + 1].startswith("--"):
            val = a[i + 1]
            i += 2
        else:
            i += 1
        d = defaults.get(key)
        if val is None:
            out[key] = True
        elif isinstance(d, bool):
            out[key] = val.lower() in ("1", "true", "yes", "on")
        elif isinstance(d, int):
            out[key] = int(val)
        elif isinstance(d, float):
            out[key] = float(val)
        else:
            out[key] = val
    return out


# ----------------------------------------------------------------------------------------------
# colour helpers
# ----------------------------------------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(h, a=1.0):
    """'#ff8844' (display sRGB, what a 2D designer picks) -> linear RGBA tuple for node sockets.
    With view_transform 'Standard' an Emission of strength 1 in this colour reproduces the hex
    exactly in the PNG."""
    if isinstance(h, (tuple, list)):
        return tuple(h) if len(h) == 4 else (h[0], h[1], h[2], a)
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)


def mix_hex(h1, h2, t):
    h1 = h1.lstrip("#"); h2 = h2.lstrip("#")
    c = [round(int(h1[i:i + 2], 16) * (1 - t) + int(h2[i:i + 2], 16) * t) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(c)


# ----------------------------------------------------------------------------------------------
# scene / render setup
# ----------------------------------------------------------------------------------------------

def reset_scene():
    """Empty factory scene (no cube/camera/light).  Also resets preferences, so call
    enable_cycles_gpu() afterwards if you use Cycles."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    return scene


def enable_cycles_gpu(kind="OPTIX"):
    """kind: 'OPTIX' (RTX, fastest + OptiX denoiser) or 'CUDA'.  Returns list of enabled devices."""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = kind
    prefs.refresh_devices()
    used = []
    for d in prefs.devices:
        d.use = (d.type == kind)
        if d.use:
            used.append(d.name)
    bpy.context.scene.cycles.device = "GPU" if used else "CPU"
    return used


def setup_render(engine="EEVEE", res=(1920, 1080), percent=100, fps=30, samples=None,
                 transparent=False, view="Standard", look="None", exposure=0.0, gamma=1.0,
                 cycles_device="OPTIX", denoise=True, motion_blur=False, frame_range=None,
                 shadows=True, raytracing=False, shadow_pool="1024"):
    """engine: 'EEVEE' | 'CYCLES' | 'WORKBENCH' (or the real ids).
    view: 'Standard' for flat toon colours (hex in = hex out), 'AgX'/'Filmic' for photographic.
    """
    scene = bpy.context.scene
    eng = {"EEVEE": "BLENDER_EEVEE", "CYCLES": "CYCLES", "WORKBENCH": "BLENDER_WORKBENCH"}.get(
        engine.upper(), engine)
    scene.render.engine = eng
    r = scene.render
    r.resolution_x, r.resolution_y = res
    r.resolution_percentage = percent
    r.fps = fps
    r.fps_base = 1.0
    r.film_transparent = transparent
    r.use_motion_blur = motion_blur
    if frame_range:
        scene.frame_start, scene.frame_end = frame_range
    vs = scene.view_settings
    vs.view_transform = view
    try:
        vs.look = look if view == "AgX" or look == "None" else "None"
    except TypeError:
        vs.look = "None"
    vs.exposure = exposure
    vs.gamma = gamma
    scene.display_settings.display_device = "sRGB"
    if eng == "BLENDER_EEVEE":
        ee = scene.eevee
        ee.taa_render_samples = samples or 16
        ee.use_shadows = shadows
        ee.use_raytracing = raytracing
        ee.use_bokeh_jittered = False
        ee.volumetric_tile_size = "8"
        ee.shadow_pool_size = shadow_pool     # MB; big street scenes overflow the 512 default
        ee.shadow_resolution_scale = 1.0
    elif eng == "CYCLES":
        enable_cycles_gpu(cycles_device)
        cy = scene.cycles
        cy.samples = samples or 32
        cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.05
        cy.use_denoising = denoise
        if denoise:
            cy.denoiser = "OPTIX" if cycles_device == "OPTIX" else "OPENIMAGEDENOISE"
            try:
                cy.denoising_use_gpu = True
            except AttributeError:
                pass
        cy.max_bounces = 4
        cy.diffuse_bounces = 2
        cy.glossy_bounces = 1
        cy.transmission_bounces = 2
        cy.volume_bounces = 0
        cy.transparent_max_bounces = 8
        cy.use_light_tree = True
        r.use_persistent_data = True   # keeps BVH between frames of an animation -> big win
    return scene


def set_png_output(filepath, rgba=True, depth="8", compression=15):
    """filepath may contain '####' for frame numbers (e.g. <ROOT>/blender/renders/A/shot_####)."""
    s = bpy.context.scene
    im = s.render.image_settings
    try:
        im.media_type = "IMAGE"          # 5.x: must be IMAGE before choosing PNG
    except (AttributeError, TypeError):
        pass
    im.file_format = "PNG"
    im.color_mode = "RGBA" if rgba else "RGB"
    im.color_depth = depth
    im.compression = compression
    s.render.filepath = filepath
    s.render.use_file_extension = True


# ----------------------------------------------------------------------------------------------
# node helpers
# ----------------------------------------------------------------------------------------------

def _clear_tree(nt):
    for n in list(nt.nodes):
        nt.nodes.remove(n)


def new_material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = m.node_tree
    _clear_tree(nt)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (900, 0)
    return m, nt, out


def _ramp(nt, stops, interp="CONSTANT", loc=(0, 0)):
    """stops: list of (position, hex/rgba)."""
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.location = loc
    cr = r.color_ramp
    cr.interpolation = interp
    stops = sorted(stops, key=lambda s: s[0])
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    while len(cr.elements) > len(stops):
        cr.elements.remove(cr.elements[-1])
    for el, (p, c) in zip(cr.elements, stops):
        el.position = p
        el.color = rgb(c)
    return r


def _math(nt, op, a=None, b=None, loc=(0, 0), clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    n.location = loc
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n


def _vmath(nt, op, a=None, b=None, loc=(0, 0)):
    n = nt.nodes.new("ShaderNodeVectorMath")
    n.operation = op
    n.location = loc
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (tuple, list, Vector)):
            n.inputs[i].default_value = tuple(v)
        else:
            nt.links.new(v, n.inputs[i])
    return n


def _mix_rgb(nt, fac, c1, c2, blend="MIX", loc=(0, 0)):
    n = nt.nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    n.location = loc
    ins = [s for s in n.inputs if s.enabled]  # Factor, A, B (colour variants)
    fsock = n.inputs[0]
    a = n.inputs[6]
    b = n.inputs[7]
    for sock, v in ((fsock, fac), (a, c1), (b, c2)):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, (str, tuple, list)):
            sock.default_value = rgb(v)
        else:
            nt.links.new(v, sock)
    return n


# ----------------------------------------------------------------------------------------------
# materials
# ----------------------------------------------------------------------------------------------

def toon_material(name, lit="#f2c9a0", shade="#6a4a7a", dark=None, highlight=None,
                  shade_at=0.18, dark_at=0.04, highlight_at=0.92,
                  rim=None, rim_width=0.35, rim_at=0.55, rim_dir=None,
                  mode="shader_to_rgb", light_dir=(0.5, -0.5, 0.7), emission=0.0,
                  line_color=None, backface_cull=False, haze=None, haze_range=(40.0, 220.0),
                  haze_max=0.85, fill_dir=None, fill=0.0, ambient=0.0):
    """Cel/anime material.  Output is EMISSION (strength 1) so, with the 'Standard' view
    transform, the band colours land in the PNG exactly as the hex values given.

    mode='shader_to_rgb' (EEVEE only): Diffuse BSDF -> Shader to RGB -> constant ColorRamp.
        Real lights and CAST SHADOWS drive the bands.  Lamp calibration: sun strength = pi gives
        lighting value 1.0 on a face pointing at the sun (see sun()).
    mode='fake' (EEVEE + Cycles): max(dot(N, light_dir), 0) [+ fill * max(dot(N, fill_dir), 0)
        + ambient] -> constant ColorRamp.  No cast shadows but 100% deterministic, cheap, and
        works in Cycles (Cycles has no Shader to RGB).  Use the same numbers as your EEVEE sun /
        fill lamps (fill = fill_strength / pi) to get matching bands.

    rim: hex colour for an anime rim light.  Rim = facing-ratio edge band, masked to the
        hemisphere facing rim_dir (default = light_dir, i.e. the side the sunset comes from).
    dark / highlight: optional 3rd / 4th band.
    haze: hex colour; blends the final colour towards it with camera distance
        (haze_range metres, capped at haze_max) = flat aerial perspective, no volume cost.
    """
    m, nt, out = new_material(name)
    L = nt.links
    if mode == "shader_to_rgb":
        d = nt.nodes.new("ShaderNodeBsdfDiffuse")
        d.location = (-900, 0)
        d.inputs["Color"].default_value = (1, 1, 1, 1)
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        s2r.location = (-700, 0)
        L.new(d.outputs[0], s2r.inputs[0])
        light_val = s2r.outputs["Color"]
    else:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        geo.location = (-1100, 0)
        ld = Vector(light_dir).normalized()
        dot = _vmath(nt, "DOT_PRODUCT", geo.outputs["Normal"], tuple(ld), loc=(-900, 0))
        mx = _math(nt, "MAXIMUM", dot.outputs["Value"], 0.0, loc=(-700, 0))
        light_val = mx.outputs[0]
        if fill_dir is not None and fill > 0:
            fd = Vector(fill_dir).normalized()
            dotf = _vmath(nt, "DOT_PRODUCT", geo.outputs["Normal"], tuple(fd), loc=(-900, 150))
            mxf = _math(nt, "MAXIMUM", dotf.outputs["Value"], 0.0, loc=(-750, 150))
            mlf = _math(nt, "MULTIPLY", mxf.outputs[0], fill, loc=(-650, 150))
            light_val = _math(nt, "ADD", light_val, mlf.outputs[0], loc=(-560, 80)).outputs[0]
        if ambient > 0:
            light_val = _math(nt, "ADD", light_val, ambient, loc=(-520, 0)).outputs[0]
    stops = []
    if dark:
        stops += [(0.0, dark), (dark_at, shade), (shade_at, lit)]
    else:
        stops += [(0.0, shade), (shade_at, lit)]
    if highlight:
        stops.append((highlight_at, highlight))
    ramp = _ramp(nt, stops, loc=(-450, 0))
    L.new(light_val, ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    if rim:
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.location = (-900, -350)
        lw.inputs["Blend"].default_value = rim_width
        gt = _math(nt, "GREATER_THAN", lw.outputs["Facing"], rim_at, loc=(-700, -350))
        geo2 = nt.nodes.new("ShaderNodeNewGeometry")
        geo2.location = (-1100, -550)
        rd = Vector(rim_dir or light_dir).normalized()
        dot2 = _vmath(nt, "DOT_PRODUCT", geo2.outputs["Normal"], tuple(rd), loc=(-900, -550))
        side = _math(nt, "GREATER_THAN", dot2.outputs["Value"], 0.05, loc=(-700, -550))
        mask = _math(nt, "MULTIPLY", gt.outputs[0], side.outputs[0], loc=(-500, -400))
        mix = _mix_rgb(nt, mask.outputs[0], col, rim, loc=(-250, -100))
        col = mix.outputs[2]
    if haze:
        col = _haze(nt, col, haze, haze_range, haze_max)
    em = nt.nodes.new("ShaderNodeEmission")
    em.location = (100, 0)
    em.inputs["Strength"].default_value = 1.0 + emission
    L.new(col, em.inputs["Color"])
    L.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = rgb(lit)
    m.use_backface_culling = backface_cull
    if line_color:
        m.line_color = rgb(line_color)
    return m


def _haze(nt, col_socket, haze, haze_range, haze_max):
    cd = nt.nodes.new("ShaderNodeCameraData")
    cd.location = (-450, 300)
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.location = (-250, 300)
    mr.inputs["From Min"].default_value = haze_range[0]
    mr.inputs["From Max"].default_value = haze_range[1]
    mr.inputs["To Max"].default_value = haze_max
    nt.links.new(cd.outputs["View Distance"], mr.inputs["Value"])
    mx = _mix_rgb(nt, mr.outputs[0], col_socket, haze, loc=(-50, 150))
    return mx.outputs[2]


def flat_material(name, color, strength=1.0, alpha=1.0, haze=None, haze_range=(40.0, 220.0),
                  haze_max=0.85):
    """Unlit flat colour (Emission).  Good for silhouettes, wires, sky cards, glyph faces."""
    m, nt, out = new_material(name)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = rgb(color)
    em.inputs["Strength"].default_value = strength
    if haze:
        nt.links.new(_haze(nt, rgb(color), haze, haze_range, haze_max), em.inputs["Color"])
    if alpha < 1.0:
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader")
        mx.inputs[0].default_value = alpha
        nt.links.new(tr.outputs[0], mx.inputs[1])
        nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs["Surface"])
        m.surface_render_method = "BLENDED"
    else:
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    m.diffuse_color = rgb(color)
    return m


def emission_material(name, color, strength=4.0):
    """Glowing emitter (neon, windows, vending machines).  Pair with add_bloom()."""
    return flat_material(name, color, strength)


def holdout_material(name="Holdout"):
    m, nt, out = new_material(name)
    h = nt.nodes.new("ShaderNodeHoldout")
    nt.links.new(h.outputs[0], out.inputs["Surface"])
    return m


def gradient_emission_material(name, stops, axis="Z", lo=0.0, hi=1.0, space="Object"):
    """Flat vertical colour gradient on an object (e.g. building fading into haze).
    stops as in _ramp; lo/hi = coordinate range mapped to 0..1."""
    m, nt, out = new_material(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object" if space == "Object" else "Generated"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = lo
    mr.inputs["From Max"].default_value = hi
    nt.links.new(sep.outputs[axis], mr.inputs["Value"])
    rp = _ramp(nt, stops, interp="LINEAR")
    nt.links.new(mr.outputs[0], rp.inputs["Fac"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(rp.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def assign(obj, mat, slot=None):
    if slot is None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    else:
        while len(obj.data.materials) <= slot:
            obj.data.materials.append(None)
        obj.data.materials[slot] = mat
    return obj


# ----------------------------------------------------------------------------------------------
# world / sky / lights / fog
# ----------------------------------------------------------------------------------------------

def world_sky(stops=((0.0, "#ffb070"), (0.12, "#ff7a6a"), (0.35, "#b0508a"), (0.7, "#3a2a6a"),
                     (1.0, "#141434")),
              z_lo=-0.02, z_hi=0.75, sun_dir=None, sun_color="#fff2c8", sun_size_deg=4.0,
              sun_soft_deg=0.6, glow_color="#ffb060", glow_power=6.0, glow_strength=0.8,
              ambient="#4a3a6a", ambient_strength=0.35, below="#2a1e3a", interp="LINEAR",
              sun_strength=1.0):
    """Flat anime gradient sky with optional sun disc + halo.
    Camera rays see the gradient; lighting rays (diffuse / EEVEE world probe) see the flat
    `ambient` colour, so the toon bands stay predictable."""
    w = bpy.context.scene.world
    nt = w.node_tree
    _clear_tree(nt)
    L = nt.links
    out = nt.nodes.new("ShaderNodeOutputWorld")
    out.location = (1200, 0)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-1200, 0)
    dirv = tc.outputs["Generated"]            # world: Generated = normalised view direction
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    sep.location = (-1000, 100)
    L.new(dirv, sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.location = (-800, 100)
    mr.inputs["From Min"].default_value = z_lo
    mr.inputs["From Max"].default_value = z_hi
    L.new(sep.outputs["Z"], mr.inputs["Value"])
    ramp = _ramp(nt, list(stops), interp=interp, loc=(-600, 100))
    L.new(mr.outputs[0], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    # below horizon
    hz = _math(nt, "LESS_THAN", sep.outputs["Z"], z_lo, loc=(-600, 300))
    mb = _mix_rgb(nt, hz.outputs[0], col, below, loc=(-350, 150))
    col = mb.outputs[2]
    if sun_dir is not None:
        sd = Vector(sun_dir).normalized()
        dot = _vmath(nt, "DOT_PRODUCT", dirv, tuple(sd), loc=(-800, -250))
        c_in = math.cos(math.radians(sun_size_deg * 0.5))
        c_out = math.cos(math.radians(sun_size_deg * 0.5 + sun_soft_deg))
        disc = nt.nodes.new("ShaderNodeMapRange")
        disc.location = (-600, -250)
        disc.inputs["From Min"].default_value = c_out
        disc.inputs["From Max"].default_value = c_in
        L.new(dot.outputs["Value"], disc.inputs["Value"])
        # halo
        mx = _math(nt, "MAXIMUM", dot.outputs["Value"], 0.0, loc=(-600, -450))
        pw = _math(nt, "POWER", mx.outputs[0], glow_power * 10.0, loc=(-450, -450))
        gs = _math(nt, "MULTIPLY", pw.outputs[0], glow_strength, loc=(-300, -450), clamp=True)
        mg = _mix_rgb(nt, gs.outputs[0], col, glow_color, blend="SCREEN", loc=(-150, 0))
        sc_lin = rgb(sun_color)
        md = _mix_rgb(nt, disc.outputs[0], mg.outputs[2],
                      (sc_lin[0] * sun_strength, sc_lin[1] * sun_strength, sc_lin[2] * sun_strength, 1.0),
                      loc=(50, 0))
        col = md.outputs[2]
    bg_cam = nt.nodes.new("ShaderNodeBackground")
    bg_cam.location = (300, 100)
    L.new(col, bg_cam.inputs["Color"])
    bg_amb = nt.nodes.new("ShaderNodeBackground")
    bg_amb.location = (300, -100)
    bg_amb.inputs["Color"].default_value = rgb(ambient)
    bg_amb.inputs["Strength"].default_value = ambient_strength
    lp = nt.nodes.new("ShaderNodeLightPath")
    lp.location = (300, 350)
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.location = (600, 0)
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    L.new(bg_amb.outputs[0], mix.inputs[1])
    L.new(bg_cam.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs["Surface"])
    return w


def world_fog(density=0.004, color="#ff9a7a", anisotropy=0.4, end=300.0):
    """Homogeneous WORLD volume.  WARNING (EEVEE 5.1): a world volume is infinite -> the sky
    background is fully absorbed (renders black) and the sun is extinguished.  Use volume_box()
    for haze / god rays instead; this is kept for Cycles tests only."""
    w = bpy.context.scene.world
    nt = w.node_tree
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputWorld")
    pv = nt.nodes.new("ShaderNodeVolumePrincipled")
    pv.location = (900, -300)
    pv.inputs["Color"].default_value = rgb(color)
    pv.inputs["Density"].default_value = density
    pv.inputs["Anisotropy"].default_value = anisotropy
    nt.links.new(pv.outputs[0], out.inputs["Volume"])
    ee = bpy.context.scene.eevee
    ee.volumetric_end = end
    ee.use_volumetric_shadows = True
    ee.volumetric_samples = 64
    return pv


def volume_box(name="Haze", size=(120.0, 400.0, 60.0), loc=(0.0, 150.0, 0.0), density=0.01,
               color="#ffb090", anisotropy=0.5, coll=None, emission=None, emission_strength=0.0,
               height_falloff=None):
    """Finite fog domain (a box with a Principled Volume).  Preferred over a WORLD volume in
    EEVEE: a world volume is infinite and absorbs the whole sky background (sky turns black) and
    extinguishes the sun.  With a sun that casts shadows + scene.eevee.use_volumetric_shadows you
    get god rays through gaps.  height_falloff=(z0, z1): density fades out between z0 and z1."""
    ob = box(name, size=size, loc=loc, coll=coll, origin="BOTTOM")
    m, nt, out = new_material("M_" + name)
    pv = nt.nodes.new("ShaderNodeVolumePrincipled")
    pv.inputs["Color"].default_value = rgb(color)
    pv.inputs["Density"].default_value = density
    pv.inputs["Anisotropy"].default_value = anisotropy
    if emission:
        pv.inputs["Emission Color"].default_value = rgb(emission)
        pv.inputs["Emission Strength"].default_value = emission_strength
    if height_falloff:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = height_falloff[0]
        mr.inputs["From Max"].default_value = height_falloff[1]
        mr.inputs["To Min"].default_value = density
        mr.inputs["To Max"].default_value = 0.0
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs[0], pv.inputs["Density"])
    nt.links.new(pv.outputs[0], out.inputs["Volume"])
    assign(ob, m)
    ob.visible_shadow = False
    try:
        ob.lineart.usage = "EXCLUDE"
    except AttributeError:
        pass
    ee = bpy.context.scene.eevee
    ee.use_volumetric_shadows = True
    ee.volumetric_end = max(ee.volumetric_end, 300.0)
    ee.volumetric_samples = 64
    return ob


def sun(name="Sun", direction=(-0.6, -1.0, 0.25), color="#ffd0a0", strength=math.pi,
        angle_deg=0.0, shadow=True, filter_radius=0.15):
    """direction = vector pointing FROM the scene TOWARDS the sun.
    strength = pi -> Shader-to-RGB value 1.0 on a surface facing the sun (toon calibration).
    Toon needs CRISP shadows: angle EXACTLY 0 (any angle > 0 switches EEVEE to shadow-map ray
    marching, which at 0.05-0.5 deg produces saw-tooth / dithered edges once a constant
    ColorRamp snaps them) + small shadow_filter_radius (default 1.0 = soft PCF edge)."""
    ld = bpy.data.lights.new(name, "SUN")
    ld.color = rgb(color)[:3]
    ld.energy = strength
    ld.angle = math.radians(angle_deg)
    ld.use_shadow = shadow
    ld.shadow_filter_radius = filter_radius
    ld.use_shadow_jitter = False
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(direction).normalized()
    ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return ob


def point_light(name, loc, color="#ffcc88", power=100.0, radius=0.1, shadow=False):
    ld = bpy.data.lights.new(name, "POINT")
    ld.color = rgb(color)[:3]
    ld.energy = power
    ld.shadow_soft_size = radius
    ld.use_shadow = shadow
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ----------------------------------------------------------------------------------------------
# geometry
# ----------------------------------------------------------------------------------------------

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, bm, coll=None, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if mat:
        assign(ob, mat)
    return ob


def box(name, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), coll=None, mat=None, origin="BOTTOM",
        bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    oz = sz * 0.5 if origin == "BOTTOM" else 0.0
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, oz)) @ Matrix.Diagonal((sx, sy, sz, 1)),
                        verts=bm.verts)
    ob = mesh_object(name, bm, coll, mat)
    ob.location = loc
    ob.rotation_euler = rot
    if bevel > 0:
        mod = ob.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
    return ob


def cylinder(name, radius=0.1, depth=1.0, verts=12, loc=(0, 0, 0), rot=(0, 0, 0), coll=None,
             mat=None, origin="BOTTOM"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius, radius2=radius,
                          depth=depth)
    if origin == "BOTTOM":
        bmesh.ops.translate(bm, vec=(0, 0, depth * 0.5), verts=bm.verts)
    ob = mesh_object(name, bm, coll, mat)
    ob.location = loc
    ob.rotation_euler = rot
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def plane(name, size=(10, 10), loc=(0, 0, 0), rot=(0, 0, 0), coll=None, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(size[0], size[1], 1), verts=bm.verts)
    ob = mesh_object(name, bm, coll, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def join_boxes(name, boxes, coll=None, mat=None):
    """Build ONE mesh from many boxes: boxes = [(size, loc, rot_z), ...].  Hundreds of windows /
    signs cost one object + one draw call (much cheaper than hundreds of objects)."""
    bm = bmesh.new()
    for size, loc, rz in boxes:
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        M = (Matrix.Translation(loc) @ Matrix.Rotation(rz, 4, "Z") @
             Matrix.Diagonal((size[0], size[1], size[2], 1)))
        bmesh.ops.transform(tmp, matrix=M, verts=tmp.verts)
        me = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    return mesh_object(name, bm, coll, mat)


def catenary(p0, p1, sag=0.6, n=24):
    """Points of a hanging wire from p0 to p1 (parabolic approximation)."""
    p0, p1 = Vector(p0), Vector(p1)
    pts = []
    for i in range(n + 1):
        t = i / n
        p = p0.lerp(p1, t)
        p.z -= sag * 4.0 * t * (1.0 - t)
        pts.append(p)
    return pts


def polyline(name, strands, bevel=0.015, coll=None, mat=None, resolution=2):
    """strands: list of point lists -> one curve object with a round bevel (wires, cables)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = resolution
    for pts in strands:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for p, q in zip(sp.points, pts):
            p.co = (q[0], q[1], q[2], 1.0)
    ob = bpy.data.objects.new(name, cu)
    link(ob, coll)
    if mat:
        cu.materials.append(mat)
    return ob


def blob_cloud(name, center, size=(60.0, 25.0, 18.0), puffs=7, seed=0, coll=None, mat=None,
               segments=16, rings=8):
    """Stylised anime cumulus: a few squashed spheres merged into one smooth mesh.
    Use with a 'fake' toon material lit from below (sunset underside) + rim."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    sx, sy, sz = size
    for i in range(puffs):
        t = (i / max(puffs - 1, 1)) - 0.5
        r = rnd.uniform(0.35, 0.6) * sz * (1.3 - abs(t))
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=segments, v_segments=rings, radius=1.0)
        M = (Matrix.Translation((t * sx + rnd.uniform(-0.05, 0.05) * sx,
                                 rnd.uniform(-0.2, 0.2) * sy,
                                 rnd.uniform(0.0, 0.35) * sz * (1.0 - abs(t) * 1.5))) @
             Matrix.Diagonal((r * rnd.uniform(1.2, 1.8), r * rnd.uniform(0.8, 1.2), r, 1)))
        bmesh.ops.transform(tmp, matrix=M, verts=tmp.verts)
        me = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    # flatten the bottom like a real cumulus
    for v in bm.verts:
        if v.co.z < -0.15 * sz:
            v.co.z = -0.15 * sz + (v.co.z + 0.15 * sz) * 0.15
    ob = mesh_object(name, bm, coll, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.location = center
    return ob


def to_mesh_object(obj, name=None, keep_original=False):
    """Evaluate any object (text, curve, modifiers) into a new plain mesh object."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    nob = bpy.data.objects.new(name or obj.name + "_mesh", me)
    nob.matrix_world = obj.matrix_world.copy()
    for c in obj.users_collection:
        c.objects.link(nob)
    if not keep_original:
        bpy.data.objects.remove(obj)
    return nob


# ----------------------------------------------------------------------------------------------
# Japanese 3D text
# ----------------------------------------------------------------------------------------------

def font_path(font):
    """Role name ('mincho', 'gothic_black', ... see FONTS), a font file name, or a path -> an existing font file.
    Falls back to any other Japanese role font (with a warning) before giving up."""
    if os.path.isfile(str(font)):
        return str(font)
    cands = FONTS.get(font, [font])
    hit = kit_env.find_font(cands)
    if hit:
        return hit
    for other in FONTS.values():
        hit = kit_env.find_font(other)
        if hit:
            print(f"[blender_common] font '{font}' not found ({', '.join(cands[:3])} ...) -> using {hit}")
            return hit
    raise FileNotFoundError(f"no Japanese font for '{font}': install one of {cands}, run tools/fetch_fonts.py "
                            f"(engine/fonts), or add a font folder to FONT_DIRS. Searched: {kit_env.font_dirs()}")


def load_font(font):
    return bpy.data.fonts.load(font_path(font), check_existing=True)


def jp_text(body, font="mincho", height=None, size=1.0, extrude=0.08, bevel_depth=0.01,
            bevel_resolution=1, align_x="CENTER", align_y="CENTER", spacing=1.0,
            vertical=False, line_spacing=1.0, loc=(0, 0, 0), rot_deg=(90, 0, 0), coll=None,
            mat=None, side_mat=None, to_mesh=True, name="JPText"):
    """3D Japanese text.  height: if set, object is scaled so the glyph block is `height`
    metres tall (Blender's per-font EM scale differs a lot between fonts).
    vertical=True writes one glyph per line (fake tategaki).  side_mat gets the extruded
    sides/bevel (material slot 1) - useful for a two-colour 'sign' look.
    rot_deg default (90,0,0) stands the text up facing -Y."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = "\n".join(body) if vertical else body
    cu.font = load_font(font)
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel_depth
    cu.bevel_resolution = bevel_resolution
    cu.align_x = align_x
    cu.align_y = align_y
    cu.space_character = spacing
    cu.space_line = line_spacing
    ob = bpy.data.objects.new(name, cu)
    link(ob, coll)
    ob.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    ob.location = loc
    if mat:
        cu.materials.append(mat)
    if side_mat:
        cu.materials.append(side_mat)
        cu.materials[0] = mat or side_mat
    bpy.context.view_layer.update()
    if to_mesh:
        ob = to_mesh_object(ob, name)
        if side_mat:
            # faces whose normal is not +/-Z in local space are sides/bevel -> slot 1
            for p in ob.data.polygons:
                p.material_index = 0 if abs(p.normal.z) > 0.99 else 1
    if height:
        bpy.context.view_layer.update()
        dz = max(ob.dimensions.y, 1e-6)  # local Y is the glyph height before rotation
        s = height / dz
        ob.scale = (s, s, s)
    return ob


# ----------------------------------------------------------------------------------------------
# instancing
# ----------------------------------------------------------------------------------------------

def instance_on_points(name, source, points, rotations=None, scales=None, coll=None,
                       realize=False):
    """Geometry-Nodes instancer: ONE object that shows `source` (object or collection) at every
    point.  Thousands of instances cost almost nothing (EEVEE draws them instanced, Cycles
    shares the BVH).  rotations: Euler XYZ tuples (radians), scales: floats or xyz tuples.
    Line Art needs use_object_instances=True (default) to see them; Freestyle sees them too.
    realize=True turns them into real geometry (needed for some modifiers)."""
    n = len(points)
    me = bpy.data.meshes.new(name + "_pts")
    me.vertices.add(n)
    me.vertices.foreach_set("co", [c for p in points for c in p])
    rot = rotations or [(0.0, 0.0, 0.0)] * n
    scl = [(s, s, s) if isinstance(s, (int, float)) else s for s in (scales or [1.0] * n)]
    a = me.attributes.new("inst_rot", "FLOAT_VECTOR", "POINT")
    a.data.foreach_set("vector", [c for r in rot for c in r])
    b = me.attributes.new("inst_scale", "FLOAT_VECTOR", "POINT")
    b.data.foreach_set("vector", [c for s in scl for c in s])
    me.update()
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)

    ng = bpy.data.node_groups.new(name + "_GN", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, Lk = ng.nodes, ng.links
    gi = N.new("NodeGroupInput"); gi.location = (-800, 0)
    go = N.new("NodeGroupOutput"); go.location = (600, 0)
    m2p = N.new("GeometryNodeMeshToPoints"); m2p.location = (-600, 0)
    iop = N.new("GeometryNodeInstanceOnPoints"); iop.location = (100, 0)
    if isinstance(source, bpy.types.Collection):
        info = N.new("GeometryNodeCollectionInfo")
        info.inputs["Collection"].default_value = source
        info.inputs["Separate Children"].default_value = False
        info.transform_space = "ORIGINAL"
    else:
        info = N.new("GeometryNodeObjectInfo")
        info.inputs["Object"].default_value = source
        info.transform_space = "ORIGINAL"
        try:
            info.inputs["As Instance"].default_value = True
        except KeyError:
            pass
    info.location = (-300, -250)
    ra = N.new("GeometryNodeInputNamedAttribute"); ra.data_type = "FLOAT_VECTOR"
    ra.inputs["Name"].default_value = "inst_rot"; ra.location = (-500, -450)
    e2r = N.new("FunctionNodeEulerToRotation"); e2r.location = (-250, -450)
    sa = N.new("GeometryNodeInputNamedAttribute"); sa.data_type = "FLOAT_VECTOR"
    sa.inputs["Name"].default_value = "inst_scale"; sa.location = (-500, -650)
    Lk.new(gi.outputs[0], m2p.inputs["Mesh"])
    Lk.new(m2p.outputs["Points"], iop.inputs["Points"])
    Lk.new(info.outputs[-1] if isinstance(source, bpy.types.Collection) else info.outputs["Geometry"],
           iop.inputs["Instance"])
    Lk.new(ra.outputs["Attribute"], e2r.inputs[0])
    Lk.new(e2r.outputs[0], iop.inputs["Rotation"])
    Lk.new(sa.outputs["Attribute"], iop.inputs["Scale"])
    last = iop.outputs["Instances"]
    if realize:
        rz = N.new("GeometryNodeRealizeInstances"); rz.location = (350, 0)
        Lk.new(last, rz.inputs[0])
        last = rz.outputs[0]
    Lk.new(last, go.inputs[0])
    mod = ob.modifiers.new("Instancer", "NODES")
    mod.node_group = ng
    return ob


def hide_source(obj):
    """Hide an instancing source object from render/viewport but keep it usable."""
    obj.hide_render = True
    obj.hide_viewport = True
    try:
        obj.lineart.usage = "EXCLUDE"
    except AttributeError:
        pass
    return obj


# ----------------------------------------------------------------------------------------------
# camera + animation
# ----------------------------------------------------------------------------------------------

def camera(name="Cam", loc=(0, -10, 2), target=(0, 0, 1.5), lens=35.0, sensor=36.0,
           clip=(0.1, 1000.0), make_active=True, shift=(0.0, 0.0)):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = sensor
    cd.clip_start, cd.clip_end = clip
    cd.shift_x, cd.shift_y = shift
    ob = bpy.data.objects.new(name, cd)
    link(ob)
    ob.location = loc
    if target is not None:
        look_at(ob, target)
    if make_active:
        bpy.context.scene.camera = ob
    return ob


def look_at(obj, target, roll_deg=0.0):
    d = Vector(target) - Vector(obj.location)
    q = d.to_track_quat("-Z", "Y")
    e = q.to_euler()
    if roll_deg:
        e = (q @ Euler((0, 0, math.radians(roll_deg))).to_quaternion()).to_euler()
    obj.rotation_euler = e
    return obj


def empty(name, loc=(0, 0, 0), coll=None):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    link(ob, coll)
    return ob


def track_to(obj, target_obj):
    c = obj.constraints.new("TRACK_TO")
    c.target = target_obj
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    return c


def fcurves(id_or_obj):
    """All F-curves of an ID's action (5.x layered-action safe)."""
    ad = id_or_obj.animation_data
    if not ad or not ad.action:
        return []
    from bpy_extras import anim_utils
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    return list(cb.fcurves) if cb else []


def key(obj, frame, **props):
    """key(cam, 1, location=(..), rotation_euler=(..), lens=35) - props on obj or obj.data."""
    for k, v in props.items():
        target = obj
        if not hasattr(obj, k) and hasattr(obj, "data") and hasattr(obj.data, k):
            target = obj.data
        setattr(target, k, v)
        target.keyframe_insert(k, frame=frame)


def set_interpolation(obj, interp="BEZIER", easing="AUTO", handle="AUTO_CLAMPED", extrapolate=None):
    """interp: 'CONSTANT' (stepped / 'on twos' feel), 'LINEAR', 'BEZIER', 'EXPO', 'SINE', ...
    easing: 'AUTO', 'EASE_IN', 'EASE_OUT', 'EASE_IN_OUT'.  Applies to obj and obj.data curves."""
    for idb in (obj, getattr(obj, "data", None)):
        if idb is None:
            continue
        for fc in fcurves(idb):
            for kp in fc.keyframe_points:
                kp.interpolation = interp
                kp.easing = easing
                kp.handle_left_type = handle
                kp.handle_right_type = handle
            if extrapolate:
                fc.extrapolation = extrapolate
            fc.update()


def follow_path(obj, points, frame_start=1, frame_end=60, target=None, closed=False,
                interp="LINEAR", name="CamPath"):
    """Moves obj along a smooth NURBS path through `points` between the two frames.
    target: object to look at (adds Track To).  Returns the path object."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points):
        p.co = (q[0], q[1], q[2], 1.0)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    sp.use_cyclic_u = closed
    path = bpy.data.objects.new(name, cu)
    link(path)
    obj.location = (0, 0, 0)
    c = obj.constraints.new("FOLLOW_PATH")
    c.target = path
    c.use_fixed_location = True
    c.use_curve_follow = False
    c.offset_factor = 0.0
    c.keyframe_insert("offset_factor", frame=frame_start)
    c.offset_factor = 1.0
    c.keyframe_insert("offset_factor", frame=frame_end)
    for fc in fcurves(obj):
        if "offset_factor" in fc.data_path:
            for kp in fc.keyframe_points:
                kp.interpolation = interp
    if target is not None:
        track_to(obj, target)
    return path


def set_dof(cam, focus=None, fstop=2.8, blades=0, rotation_deg=0.0):
    """focus: object (tracked) or distance in metres."""
    d = cam.data.dof
    d.use_dof = True
    if isinstance(focus, bpy.types.Object):
        d.focus_object = focus
    elif focus is not None:
        d.focus_distance = float(focus)
    d.aperture_fstop = fstop
    d.aperture_blades = blades
    d.aperture_rotation = math.radians(rotation_deg)
    return d


# ----------------------------------------------------------------------------------------------
# line art
# ----------------------------------------------------------------------------------------------

def freestyle_lines(thickness=2.0, color="#1c1024", crease_deg=135.0, alpha=1.0,
                    taper=True, wobble=0.0, as_pass=False, silhouette=True, border=False,
                    crease=True, contour=True, external_contour=True, material_boundary=False,
                    edge_mark=True, exclude_collection=None, chaining="PLAIN"):
    """Freestyle (CPU, post-render stroke pass) - screen-space constant pixel width,
    works headless in EEVEE and Cycles.  thickness in PIXELS (at 100 % resolution).
    taper: calligraphic ends; wobble: perlin displacement (px) for a hand-drawn look.
    as_pass=True: lines are NOT burnt into Combined but written to the 'Freestyle' pass."""
    s = bpy.context.scene
    s.render.use_freestyle = True
    s.render.line_thickness_mode = "ABSOLUTE"
    s.render.line_thickness = 1.0
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.mode = "EDITOR"
    fs.crease_angle = math.radians(crease_deg)
    fs.as_render_pass = as_pass
    for ls in list(fs.linesets):
        fs.linesets.remove(ls)
    ls = fs.linesets.new("Lines")
    ls.select_by_visibility = True
    ls.visibility = "VISIBLE"
    ls.select_by_edge_types = True
    ls.select_silhouette = silhouette
    ls.select_border = border
    ls.select_crease = crease
    ls.select_contour = contour
    ls.select_external_contour = external_contour
    ls.select_material_boundary = material_boundary
    ls.select_edge_mark = edge_mark
    if exclude_collection is not None:
        ls.select_by_collection = True
        ls.collection = exclude_collection
        ls.collection_negation = "EXCLUSIVE"
    st = ls.linestyle
    c = rgb(color)
    st.color = c[:3]
    st.alpha = alpha
    st.thickness = thickness
    st.thickness_position = "CENTER"
    st.caps = "ROUND"
    st.use_chaining = True
    st.chaining = chaining
    if taper:
        tm = st.thickness_modifiers.new("Taper", "ALONG_STROKE")
        tm.mapping = "CURVE"
        tm.value_min = thickness * 0.25
        tm.value_max = thickness
        tm.blend = "MINIMUM"
        cm = tm.curve
        crv = cm.curves[0]
        pts = crv.points
        pts[0].location = (0.0, 0.0)
        pts[1].location = (1.0, 0.0)
        pts.new(0.15, 1.0)
        pts.new(0.85, 1.0)
        cm.update()
    if wobble > 0:
        gm = st.geometry_modifiers.new("Wobble", "PERLIN_NOISE_1D")
        gm.frequency = 10.0
        gm.amplitude = wobble
        gm.octaves = 2
    return ls


def gp_lineart(name="LineArt", source=None, radius=0.006, color="#1c1024", opacity=1.0,
               crease_deg=140.0, intersection=True, material_boundary=False, loose=True,
               noise=0.0, noise_step=2, overshoot=0.0, smooth=0.0, coll=None, back_face_cull=False,
               stroke_depth_offset=None, thickness_factor=1.0):
    """Grease Pencil v3 Line Art (CPU, computed in the depsgraph -> works headless).
    source: None = whole scene, a Collection, or an Object.
    radius is in WORLD metres -> lines thin out with distance (natural aerial perspective).
    noise (metres) + noise_step (frames) = 'boiling' hand-drawn lines; overshoot = relative
    stroke extension past corners (sketchy look).  Rendered by EEVEE and by Cycles (GP is drawn
    on top of the Cycles result)."""
    gp = bpy.data.grease_pencils.new(name)
    ob = bpy.data.objects.new(name, gp)
    link(ob, coll)
    layer = gp.layers.new("Lines")
    layer.use_lights = False
    mat = bpy.data.materials.new(name + "_mat")
    bpy.data.materials.create_gpencil_data(mat)
    mat.grease_pencil.color = rgb(color)
    mat.grease_pencil.show_fill = False
    gp.materials.append(mat)
    m = ob.modifiers.new("LineArt", "LINEART")
    if source is None:
        m.source_type = "SCENE"
    elif isinstance(source, bpy.types.Collection):
        m.source_type = "COLLECTION"
        m.source_collection = source
    else:
        m.source_type = "OBJECT"
        m.source_object = source
    m.target_layer = "Lines"
    m.target_material = mat
    m.radius = radius
    m.opacity = opacity
    m.use_contour = True
    m.use_crease = True
    m.crease_threshold = math.radians(crease_deg)
    m.use_intersection = intersection
    m.use_material = material_boundary
    m.use_loose = loose
    m.use_edge_mark = True
    m.use_back_face_culling = back_face_cull
    m.use_object_instances = True
    m.use_cache = False
    if stroke_depth_offset is not None:
        m.stroke_depth_offset = stroke_depth_offset
    if thickness_factor != 1.0:
        t = ob.modifiers.new("Thick", "GREASE_PENCIL_THICKNESS")
        t.use_normalized_thickness = False
        t.thickness_factor = thickness_factor
    if overshoot > 0:
        ln = ob.modifiers.new("Overshoot", "GREASE_PENCIL_LENGTH")
        ln.mode = "RELATIVE"
        ln.start_factor = overshoot
        ln.end_factor = overshoot
        ln.use_curvature = False
    if smooth > 0:
        sm = ob.modifiers.new("Smooth", "GREASE_PENCIL_SMOOTH")
        sm.factor = smooth
    if noise > 0:
        nz = ob.modifiers.new("Boil", "GREASE_PENCIL_NOISE")
        nz.factor = noise
        nz.factor_thickness = 0.25
        nz.noise_scale = 0.3
        nz.use_random = True
        nz.random_mode = "STEP"
        nz.step = noise_step
    return ob


def lineart_usage(obj, usage="OCCLUSION_ONLY"):
    """Per-object Line Art usage: 'INHERIT','INCLUDE','OCCLUSION_ONLY','EXCLUDE',
    'INTERSECTION_ONLY','NO_INTERSECTION','FORCE_INTERSECTION'."""
    obj.lineart.usage = usage


def inverted_hull(obj, thickness=0.02, color="#1c1024", name=None):
    """Classic real-time outline: solidify with flipped normals + back-face-culled black
    material.  Only silhouettes/contours, no creases, but ~free in EEVEE & Cycles."""
    mat = bpy.data.materials.get(name or "Hull_" + color)
    if mat is None:
        mat, nt, out = new_material(name or "Hull_" + color)
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = rgb(color)
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        mx = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(geo.outputs["Backfacing"], mx.inputs[0])
        nt.links.new(tr.outputs[0], mx.inputs[1])     # front faces of the hull -> invisible
        nt.links.new(em.outputs[0], mx.inputs[2])     # back faces -> line colour
        nt.links.new(mx.outputs[0], out.inputs["Surface"])
        mat.use_backface_culling = True
        mat.use_backface_culling_shadow = True   # else the hull shell shadows the object itself
    slot = len(obj.data.materials)
    obj.data.materials.append(mat)
    mod = obj.modifiers.new("Hull", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = slot
    return mod


# ----------------------------------------------------------------------------------------------
# compositing / passes
# ----------------------------------------------------------------------------------------------

def compositor(scene=None):
    """Create (or reset) the 5.x compositor node group; returns (tree, render_layers, group_out)."""
    scene = scene or bpy.context.scene
    ng = bpy.data.node_groups.new("Compositor", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scene.compositing_node_group = ng
    scene.render.use_compositing = True
    rl = ng.nodes.new("CompositorNodeRLayers")
    rl.location = (-400, 0)
    go = ng.nodes.new("NodeGroupOutput")
    go.location = (600, 0)
    ng.links.new(rl.outputs["Image"], go.inputs[0])
    return ng, rl, go


def add_bloom(threshold=0.9, strength=0.6, size=0.6, quality="Medium", kind="Bloom"):
    """Glare/bloom in the compositor (EEVEE-Next has no built-in bloom any more)."""
    sc = bpy.context.scene
    ng = sc.compositing_node_group
    if ng is None:
        ng, rl, go = compositor()
    go = next(n for n in ng.nodes if n.bl_idname == "NodeGroupOutput")
    src = go.inputs[0].links[0].from_socket
    g = ng.nodes.new("CompositorNodeGlare")
    g.location = (200, 150)
    g.inputs["Type"].default_value = kind
    g.inputs["Quality"].default_value = quality
    g.inputs["Threshold"].default_value = threshold
    g.inputs["Strength"].default_value = strength
    g.inputs["Size"].default_value = size
    ng.links.new(src, g.inputs["Image"])
    ng.links.new(g.outputs[0], go.inputs[0])
    return g


def add_pass_outputs(directory, prefix="pass", mist=True, depth=False, normal=False,
                     freestyle=False, grease_pencil=False, alpha=False, mist_range=(0.1, 120.0)):
    """Adds a File Output node writing extra passes as PNGs next to the beauty render:
      <directory>/<prefix>_mist_####.png   (16-bit grey, 0 = near, 1 = far)
      <directory>/<prefix>_lines_####.png  (RGBA, Freestyle pass; needs freestyle_lines(as_pass=True))
      <directory>/<prefix>_gp_####.png     (RGBA, Grease-Pencil-only pass = GP line art on alpha)
    """
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    ng = sc.compositing_node_group or compositor()[0]
    rl = next(n for n in ng.nodes if n.bl_idname == "CompositorNodeRLayers")
    if mist:
        vl.use_pass_mist = True
        ms = sc.world.mist_settings
        ms.start, ms.depth = mist_range[0], mist_range[1] - mist_range[0]
        ms.falloff = "LINEAR"
    if depth:
        vl.use_pass_z = True
    if normal:
        vl.use_pass_normal = True
    if grease_pencil:
        vl.use_pass_grease_pencil = True
    fo = ng.nodes.new("CompositorNodeOutputFile")
    fo.location = (200, -300)
    fo.directory = directory
    fo.file_name = prefix + "_"
    fo.format.media_type = "IMAGE"        # 5.x default is MULTI_LAYER_IMAGE (EXR only)
    fo.format.file_format = "PNG"
    fo.format.color_mode = "RGBA"
    fo.format.color_depth = "8"

    def item(sock_name, label, bw=False, depth16=False, data=False):
        it = fo.file_output_items.new("RGBA" if not bw else "FLOAT", label)
        if bw or depth16 or data:
            it.override_node_format = True
            it.format.media_type = "IMAGE"
            it.format.file_format = "PNG"
            it.format.color_mode = "BW" if bw else "RGBA"
            it.format.color_depth = "16" if depth16 else "8"
        if data:
            it.save_as_render = False
        ng.links.new(rl.outputs[sock_name], fo.inputs[label])

    if mist:
        item("Mist", "mist", bw=True, depth16=True, data=True)
    if freestyle:
        item("Freestyle", "lines")
    if grease_pencil:
        item("Grease Pencil", "gp")
    if alpha:
        item("Alpha", "alpha", bw=True)
    return fo


# ----------------------------------------------------------------------------------------------
# rendering + timing
# ----------------------------------------------------------------------------------------------

class FrameTimer:
    """Measures wall-clock seconds per frame of an animation render (render_pre -> render_post
    plus the depsgraph/Line-Art update in between frames)."""

    def __init__(self):
        self.t = []
        self._last = None

    def _pre(self, scene, *_):
        if self._last is None:
            self._last = time.perf_counter()

    def _post(self, scene, *_):
        now = time.perf_counter()
        self.t.append(now - self._last)
        self._last = now

    def __enter__(self):
        bpy.app.handlers.render_pre.append(self._pre)
        bpy.app.handlers.render_post.append(self._post)
        return self

    def __exit__(self, *a):
        bpy.app.handlers.render_pre.remove(self._pre)
        bpy.app.handlers.render_post.remove(self._post)


def render_still(filepath, frame=None):
    sc = bpy.context.scene
    if frame is not None:
        sc.frame_set(frame)
    sc.render.filepath = filepath
    t0 = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    return time.perf_counter() - t0


def render_sequence(filepath_pattern, start, end, step=1):
    """filepath_pattern like '<ROOT>/blender/renders/A/seq_####'.  Returns dict with timings."""
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end, sc.frame_step = start, end, step
    sc.render.filepath = filepath_pattern
    t0 = time.perf_counter()
    with FrameTimer() as ft:
        bpy.ops.render.render(animation=True)
    total = time.perf_counter() - t0
    per = ft.t
    steady = per[1:] if len(per) > 1 else per
    return {
        "frames": len(per),
        "total_s": round(total, 3),
        "first_frame_s": round(per[0], 3) if per else None,
        "steady_s_per_frame": round(sum(steady) / max(len(steady), 1), 3),
        "per_frame": [round(x, 3) for x in per],
    }


def log_json(path, record):
    """Append one JSON record to a .jsonl file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, check_existing=False, compress=True)
