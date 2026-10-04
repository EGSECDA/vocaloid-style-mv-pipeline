r"""
probe_scene.py - dusk street + giant 3D 「残光」, toon shading + line art, 2 s camera dolly.

Run (from the project root):
  python tools/blender_run.py blender/probe_scene.py -- --engine EEVEE --lines gp --mode still
  blender -b --factory-startup -P blender/probe_scene.py -- --engine EEVEE --lines gp --mode still

Options (all optional):
  --engine EEVEE|CYCLES     --lines gp|freestyle|hull|none   --mode still|seq|text|all|none
  --frame 30 (still)        --start 1 --end 24 (seq)          --res 100 (percent)
  --samples 0 (0 = 16)      --passes 0|1 (mist + line-only passes via compositor File Output)
  --out <ROOT>/blender/_probe     --tag <suffix>    --save_blend 0|1
  --dof 1   --fog 0 (finite haze box)  --fog_density 0.005   --bloom 1   --boil 1 (GP line boil)
  --line_radius 0.05 (GP line art, metres)  --view Standard|AgX  --device OPTIX|CUDA (Cycles)
  --sun_angle 0.0  --shadow_filter 0.15  (keep angle 0 for crisp toon shadows)
Outputs: <out>/still_<engine>_<lines>_<tag>_fNNN.png, <out>/seq_<...>/f_####.png,
         <out>/passes_<...>/p_mist####.png (16-bit) + p_gp####.png / p_lines####.png (RGBA),
         <out>/text_<...>.png (RGBA, transparent), timings appended to <out>/timings.jsonl
The animation is 60 frames (2 s @ 30 fps): dolly-in + crane-up + lens 24->21 mm, ease in/out.
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import sys
import os
import math
import random
import time

_ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
    try:
        _s.reconfigure(errors="replace")
    except Exception:  # noqa: BLE001
        pass
if "-h" in _ARGS or "--help" in _ARGS:          # also works in plain python (before bpy is needed)
    print(__doc__)
    sys.exit(0)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # blender/ is one level below the root
sys.path.insert(0, os.path.join(ROOT, "tools"))
import importlib
import blender_common as bc
importlib.reload(bc)
from mathutils import Vector

A = bc.parse_args({
    "engine": "EEVEE", "lines": "gp", "mode": "still", "frame": 30, "start": 1, "end": 24,
    "res": 100, "samples": 0, "passes": 0, "out": os.path.join(ROOT, "blender", "_probe"),
    "tag": "", "save_blend": 0, "dof": 1, "fog": 0, "bloom": 1, "boil": 1, "shadow_pool": "1024",
    "shadow_filter": 0.15, "shadow_res": 0.001, "sun_angle": 0.0, "shadow_steps": 6,
    "shadow_rays": 1, "line_radius": 0.05, "fog_density": 0.005, "view": "Standard", "device": "OPTIX",
}, doc=__doc__)
OUT = A["out"]
os.makedirs(OUT, exist_ok=True)
ENGINE = A["engine"].upper()
TOON_MODE = "shader_to_rgb" if ENGINE == "EEVEE" else "fake"
TAG = "_".join(x for x in (ENGINE.lower(), A["lines"], A["tag"]) if x)
TIMING_LOG = os.path.join(OUT, "timings.jsonl")
random.seed(7)

# ------------------------------------------------------------------ palette (display sRGB hex)
P = {
    "sky": [(0.00, "#ffcf8a"), (0.06, "#ff9a62"), (0.16, "#f0707a"), (0.32, "#b85592"),
            (0.55, "#5a4296"), (0.80, "#2a2a6e"), (1.00, "#171a45")],
    "haze": "#e98a8c",
    "line": "#241638",
    "rim": "#ffe0a8",
    "wire": "#20142e",
    "road": ("#b67e8a", "#4a3b66", "#342a52"),   # lit, shade, dark
    "walk": ("#d6a09a", "#5d4b78", "#40345f"),
    "bld": [("#f4b48e", "#6f5c9c", "#4a3d74"),
            ("#eaa39f", "#61508e", "#403468"),
            ("#f7cb9c", "#7d67a3", "#4d3f77"),
            ("#dc9c88", "#57487f", "#3a2e5e"),
            ("#f0bca8", "#6a5890", "#463a6c")],
    "text": ("#fffaf2", "#ffeadb", "#f2b2b8"),     # lit, shade(fill only), dark
    "text_side": ("#ffb27a", "#e2507c", "#7e2c68"),
    "window_off": "#3b3160",
    "window_on": "#ffd99a",
    "pole": ("#9a8aa8", "#4a3f66", "#302848"),
}
SUN_DIR = Vector((-0.55, 0.75, 0.38)).normalized()     # key light: towards the sun (left-back, ~22 deg up)
SKY_SUN = Vector((0.012, 1.0, 0.05)).normalized()      # where the sun DISC is painted in the sky (vanishing point)
FILL_DIR = Vector((0.35, -1.0, 0.8)).normalized()      # soft front fill (sky bounce)


def toon(name, trip, rim=True, **kw):
    lit, shade, dark = trip
    return bc.toon_material(name, lit=lit, shade=shade, dark=dark, shade_at=0.16, dark_at=0.02,
                            rim=P["rim"] if rim else None, rim_width=0.25, rim_at=0.62,
                            rim_dir=tuple(SUN_DIR), mode=TOON_MODE,
                            light_dir=tuple(SUN_DIR), fill_dir=tuple(FILL_DIR), fill=0.10,
                            ambient=0.015, haze=kw.pop("haze", P["haze"]),
                            haze_range=kw.pop("haze_range", (35.0, 260.0)),
                            haze_max=kw.pop("haze_max", 0.8), **kw)


# ------------------------------------------------------------------ scene build
def build_street(sc, text_only=False):
    col_main = bc.collection("Street")
    col_nolines = bc.collection("NoLines")        # wires, sky cards, road markings
    col_text = bc.collection("Text")

    # ---------------- 3D title text 「残光」
    tmat = toon("M_text", P["text"], haze=None)
    smat = toon("M_text_side", P["text_side"], haze=None)
    text = bc.jp_text("残光", font="mincho", height=5.2, extrude=0.06, bevel_depth=0.004,
                      bevel_resolution=1, loc=(0.0, 26.0, 0.0), rot_deg=(90, 0, -8),
                      coll=col_text, mat=tmat, side_mat=smat, name="Title")
    bc.bpy.context.view_layer.update()
    # sit the glyphs on the road
    zmin = min((text.matrix_world @ v.co).z for v in text.data.vertices)
    text.location.z -= zmin - 0.05
    if text_only:
        return text, None

    # ---------------- road + sidewalks
    road = bc.plane("Road", size=(12.0, 600.0), loc=(0, 280, 0), coll=col_main,
                    mat=toon("M_road", P["road"], rim=False))
    walk_m = toon("M_walk", P["walk"], rim=False)
    for sx in (-1, 1):
        bc.box("Walk%+d" % sx, size=(2.2, 600, 0.18), loc=(sx * 7.1, 280, 0), coll=col_main,
               mat=walk_m)
    # road markings (flat, no lines)
    mk = []
    for i in range(60):
        mk.append(((0.16, 3.0, 0.02), (0.0, 4 + i * 8.0, 0.0), 0.0))
    for sx in (-1, 1):
        mk.append(((0.14, 600, 0.02), (sx * 5.6, 280, 0.0), 0.0))
    bc.join_boxes("Markings", mk, coll=col_nolines,
                  mat=bc.flat_material("M_mark", "#f3e3e6", haze=P["haze"],
                                       haze_range=(20, 200), haze_max=0.85))

    # ---------------- buildings (both sides)
    bmats = [toon("M_bld%d" % i, t) for i, t in enumerate(P["bld"])]
    win_off, win_on = [], []
    roof_bits = []
    signs = []
    for side in (-1, 1):
        y = -6.0
        while y < 260:
            if 30.0 <= y < 44.0:                 # cross street -> a band of sunlight over the road
                y = 44.0
                continue
            if y > 50 and random.random() < 0.12:  # vacant lot / parking -> light stripes
                y += random.uniform(4.0, 9.0)
                continue
            w = random.uniform(5.0, 11.0)        # frontage along street (Y)
            w = min(w, 30.0 - y) if y < 30.0 and 30.0 - y > 3.0 else w
            d = random.uniform(8.0, 14.0)        # depth (X)
            h = random.choice([random.uniform(5.5, 9.0), random.uniform(9, 16), random.uniform(14, 26)])
            if side < 0 and y < 80:              # low houses on the sun side -> light floods in
                h = random.uniform(5.5, 8.0) if random.random() < 0.8 else random.uniform(9.5, 11.5)
            if y > 90:
                h *= random.uniform(1.0, 1.6)
            x = side * (8.2 + d * 0.5 + random.uniform(-0.25, 0.4))
            b = bc.box("Bld", size=(d, w - random.uniform(0.2, 1.4), h), loc=(x, y + w * 0.5, 0),
                       coll=col_main, mat=random.choice(bmats))
            face_x = x - side * d * 0.5         # street-facing facade plane
            # windows on facade (thin protruding boxes, lots of them -> 1 joined mesh)
            floors = int((h - 1.5) // 3.1)
            cols = max(1, int((w - 1.6) // 2.0))
            for f in range(floors):
                zc = 3.0 + f * 3.1
                for c in range(cols):
                    yc = y + 1.4 + c * 2.0 + 0.4
                    if yc > y + w - 1.2:
                        continue
                    box = ((0.12, 1.2, 1.35), (face_x - side * 0.02, yc, zc), 0.0)
                    (win_on if random.random() < 0.18 else win_off).append(box)
            # rooftop clutter: water tank / AC / parapet
            if random.random() < 0.6:
                roof_bits.append(((random.uniform(1.5, 3), random.uniform(1.5, 3), random.uniform(1, 2.2)),
                                  (x + random.uniform(-1.5, 1.5), y + w * 0.5 + random.uniform(-1, 1), h), 0.0))
            roof_bits.append(((d, 0.25, 0.9), (x, y + 0.3, h), 0.0))
            # vertical shop sign (tategaki kanji) on some near buildings
            if y < 70 and random.random() < 0.55:
                signs.append((side, face_x, y + random.uniform(1.0, w - 1.0), random.uniform(3.2, 5.0)))
            y += w
    bc.join_boxes("WindowsOff", win_off, coll=col_main,
                  mat=toon("M_win_off", ("#7e6aa6", P["window_off"], "#2a2248"), rim=False))
    bc.join_boxes("WindowsOn", win_on, coll=col_main,
                  mat=bc.flat_material("M_win_on", P["window_on"], strength=1.6, haze=P["haze"]))
    bc.join_boxes("RoofBits", roof_bits, coll=col_main, mat=bmats[2])

    # tategaki signboards with real glyphs
    words = ["喫茶", "薬局", "理容", "酒", "書店", "定食", "銭湯", "質"]
    sign_face = toon("M_signface", ("#fff4e8", "#d9c9e6", "#9e8fbf"), rim=False, haze_max=0.6)
    sign_board = [toon("M_sign%d" % i, t) for i, t in enumerate(
        [("#ff6f6f", "#9c3060", "#5e2050"), ("#5ec4d8", "#2f5f9a", "#253c70"),
         ("#ffd05a", "#b06a4a", "#6a3a4a")])]
    for i, (side, fx, sy, zb) in enumerate(signs):
        word = words[i % len(words)]
        hgt = 0.95 * len(word) + 0.6
        brd = bc.box("Sign%d" % i, size=(1.1, 0.28, hgt), loc=(fx - side * 0.75, sy, zb),
                     coll=col_main, mat=random.choice(sign_board))
        for face in (-1, 1):
            t = bc.jp_text(word, font="gothic_black", height=0.9 * len(word), extrude=0.0,
                           bevel_depth=0.0, vertical=True, line_spacing=0.9,
                           loc=(fx - side * 0.75, sy + face * 0.15, zb + hgt * 0.5),
                           rot_deg=(90, 0, 0 if face < 0 else 180), coll=col_nolines,
                           mat=bc.flat_material("M_signtxt", "#fff6ec", haze=P["haze"],
                                                haze_range=(30, 200), haze_max=0.6),
                           name="SignTxt%d" % i)

    # ---------------- utility poles (GN instancing) + wires
    pole_m = toon("M_pole", P["pole"])
    src = bc.cylinder("PoleSrc", radius=0.17, depth=10.5, verts=10, mat=pole_m, coll=col_main)
    arm = bc.box("ArmSrc", size=(1.9, 0.14, 0.14), loc=(0, 0, 9.4), coll=col_main, mat=pole_m)
    arm2 = bc.box("ArmSrc2", size=(1.4, 0.12, 0.12), loc=(0, 0, 8.2), coll=col_main, mat=pole_m)
    tr = bc.cylinder("Transformer", radius=0.32, depth=1.0, verts=10, loc=(0.35, 0.0, 6.6),
                     coll=col_main, mat=pole_m)
    pole_coll = bc.collection("PoleSource")
    for o in (src, arm, arm2, tr):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        pole_coll.objects.link(o)
    bc.bpy.context.view_layer.layer_collection.children["PoleSource"].exclude = True
    pts, rots, scs = [], [], []
    spacing = 22.0
    for side in (-1, 1):
        for i in range(12):
            yy = 6.0 + i * spacing + (side * 5.0)
            pts.append((side * 6.35, yy, 0.0))
            rots.append((0.0, random.uniform(-0.015, 0.015), 0.0 if side > 0 else math.pi))
            scs.append(random.uniform(0.96, 1.05))
    bc.instance_on_points("Poles", pole_coll, pts, rots, scs, coll=col_main)
    strands = []
    for side in (-1, 1):
        sp = [p for p in pts if p[0] * side > 0]
        for a, b in zip(sp[:-1], sp[1:]):
            for off, z in ((-0.85, 9.45), (0.0, 9.45), (0.85, 9.45), (-0.6, 8.25), (0.6, 8.25)):
                p0 = (a[0] + off * side, a[1], z)
                p1 = (b[0] + off * side, b[1], z)
                strands.append(bc.catenary(p0, p1, sag=random.uniform(0.35, 0.7), n=20))
        # a few crossing wires over the street
    lp = [p for p in pts if p[0] < 0]
    rp = [p for p in pts if p[0] > 0]
    for a, b in list(zip(lp, rp))[::2]:
        strands.append(bc.catenary((a[0], a[1], 8.2), (b[0], b[1], 8.2), sag=0.5, n=20))
    bc.polyline("Wires", strands, bevel=0.022, coll=col_nolines,
                mat=bc.flat_material("M_wire", P["wire"], haze=P["haze"], haze_range=(40, 260),
                                     haze_max=0.7))

    # ---------------- far skyline silhouettes (flat cards, no lines)
    far = []
    for i in range(70):
        xx = random.uniform(-160, 160)
        far.append(((random.uniform(6, 22), random.uniform(6, 20), random.uniform(10, 55)),
                    (xx, random.uniform(290, 360), 0), random.uniform(-0.3, 0.3)))
    bc.join_boxes("FarCity", far, coll=col_nolines,
                  mat=bc.flat_material("M_far", "#9a5a8e", haze=P["haze"], haze_range=(200, 420),
                                       haze_max=0.55))
    # anime cumulus lit from below by the afterglow (fake-light toon, no lines)
    cmat = bc.toon_material("M_cloud", lit="#ffb6a2", shade="#8e6aa8", dark="#5e4a8c",
                            shade_at=0.28, dark_at=0.05, rim="#ffe7b8", rim_width=0.3, rim_at=0.55,
                            rim_dir=(0.0, 0.6, -0.8), mode="fake", light_dir=(0.1, 0.5, -0.85),
                            haze="#f39a8a", haze_range=(300, 900), haze_max=0.35)
    for i, (cx, cy, cz, w) in enumerate([(-190, 620, 120, 140), (-40, 700, 190, 110),
                                         (150, 640, 110, 170), (300, 560, 170, 120),
                                         (-330, 520, 200, 150), (60, 760, 75, 90),
                                         (-120, 560, 60, 70)]):
        bc.blob_cloud("Cloud%d" % i, (cx, cy, cz), size=(w, w * 0.35, w * 0.28),
                      puffs=random.randint(5, 8), seed=i + 3, coll=col_nolines, mat=cmat)
    # vending machine glow near camera (emissive + bloom)
    vm = bc.box("Vending", size=(0.9, 1.2, 1.9), loc=(7.7, 14.0, 0.18), coll=col_main,
                mat=bc.emission_material("M_vending", "#e8f6ff", strength=2.2))
    return text, col_nolines


def setup_lights():
    s = bc.sun("Sun", direction=tuple(SUN_DIR), color="#ffffff", strength=math.pi,
               angle_deg=A["sun_angle"], filter_radius=A["shadow_filter"])
    bc.bpy.context.scene.eevee.shadow_step_count = A["shadow_steps"]
    bc.bpy.context.scene.eevee.shadow_ray_count = A["shadow_rays"]
    s.data.shadow_maximum_resolution = A["shadow_res"]
    bc.sun("Fill", direction=tuple(FILL_DIR), color="#ffffff", strength=math.pi * 0.10,
           angle_deg=5.0, shadow=False)


def setup_lines(col_nolines):
    kind = A["lines"]
    if col_nolines is not None:
        col_nolines.lineart_usage = "EXCLUDE"
    road = bc.bpy.data.objects.get("Road")
    if road is not None:
        road.lineart.usage = "OCCLUSION_ONLY"
    if kind == "gp":
        bc.gp_lineart("LineArt", source=None, radius=A["line_radius"], color=P["line"], crease_deg=120,
                      intersection=True, overshoot=0.0, noise=0.03 if A["boil"] else 0.0,
                      noise_step=2)
    elif kind == "freestyle":
        bc.freestyle_lines(thickness=2.4, color=P["line"], crease_deg=120, taper=True,
                           wobble=0.0, exclude_collection=col_nolines,
                           as_pass=bool(A["passes"]))
    elif kind == "hull":
        for ob in list(bc.bpy.data.objects):
            if ob.type == "MESH" and ob.name not in ("Road",) and not ob.name.startswith(("Wind", "Mark", "Far", "Sign")):
                if ob.users_collection and ob.users_collection[0].name != "PoleSource":
                    bc.inverted_hull(ob, thickness=0.06, color=P["line"])


def setup_camera(scene, text):
    cam = bc.camera("Cam", loc=(0.9, -6.0, 1.45), target=(0.0, 40.0, 4.2), lens=24.0)
    tgt = bc.empty("CamTarget", (-0.4, 40.0, 4.6))
    bc.track_to(cam, tgt)
    # 2-second dolly-in with slight crane-up + lateral drift, ease in/out
    bc.key(cam, 1, location=(0.9, -6.0, 1.45))
    bc.key(cam, 60, location=(-0.2, 7.5, 2.6))
    bc.key(tgt, 1, location=(-0.6, 40.0, 5.2))
    bc.key(tgt, 60, location=(0.3, 40.0, 4.0))
    bc.key(cam, 1, lens=24.0)
    bc.key(cam, 60, lens=21.0)
    bc.set_interpolation(cam, "BEZIER", "AUTO")
    bc.set_interpolation(tgt, "BEZIER", "AUTO")
    if A["dof"]:
        bc.set_dof(cam, focus=text, fstop=2.0, blades=6)
    scene.frame_start, scene.frame_end = 1, 60
    return cam


def build_main():
    sc = bc.reset_scene()
    bc.setup_render(ENGINE, res=(1920, 1080), percent=A["res"], fps=30,
                    samples=A["samples"] or 16, transparent=False, view=A["view"], cycles_device=A["device"],
                    shadow_pool=A["shadow_pool"])
    bc.world_sky(stops=P["sky"], z_lo=-0.01, z_hi=0.6, sun_dir=tuple(SKY_SUN), sun_strength=2.2,
                 sun_color="#fff6dc", sun_size_deg=4.5, glow_color="#ffc070", glow_power=3.0,
                 glow_strength=0.9, ambient="#4a3a6a", ambient_strength=0.3, below="#342a52")
    if A["fog"]:
        # finite haze box over the street -> god rays through the cross street / roof gaps
        bc.volume_box("Haze", size=(40.0, 320.0, 45.0), loc=(0.0, 150.0, -1.0), density=A["fog_density"],
                      color="#ffc0a0", anisotropy=0.75, height_falloff=(0.0, 40.0))
    text, col_nolines = build_street(sc)
    setup_lights()
    setup_lines(col_nolines)
    cam = setup_camera(sc, text)
    ng, rl, go = bc.compositor()
    if A["bloom"]:
        bc.add_bloom(threshold=1.05, strength=0.5, size=0.7, quality="Medium")
    return sc


def build_text_only():
    sc = bc.reset_scene()
    bc.setup_render(ENGINE, res=(1920, 1080), percent=A["res"], fps=30,
                    samples=A["samples"] or 16, transparent=True, view="Standard")
    bc.world_sky(stops=P["sky"], ambient="#4a3a6a", ambient_strength=0.3)
    text, _ = build_street(sc, text_only=True)
    text.location = (0, 0, 0)
    text.rotation_euler = (math.radians(90), 0, math.radians(-22))
    bc.bpy.context.view_layer.update()
    zmin = min((text.matrix_world @ v.co).z for v in text.data.vertices)
    text.location.z -= zmin
    bc.sun("Sun", direction=(-0.9, 0.55, 0.45), color="#ffffff", strength=math.pi, angle_deg=0.4)
    bc.sun("Fill", direction=(0.4, -1.0, 0.6), color="#ffffff", strength=math.pi * 0.1,
           shadow=False)
    cam = bc.camera("Cam", loc=(3.5, -13.5, 1.2), target=(1.0, 0.0, 2.7), lens=35.0)
    kind = A["lines"]
    if kind == "gp":
        bc.gp_lineart("LineArt", radius=0.03, color=P["line"], crease_deg=120)
    elif kind == "freestyle":
        bc.freestyle_lines(thickness=3.0, color=P["line"], crease_deg=120, taper=True)
    bc.compositor()
    return sc


def main():
    t0 = time.perf_counter()
    mode = A["mode"]
    rec = {"engine": ENGINE, "lines": A["lines"], "res_percent": A["res"],
           "samples": A["samples"] or 16, "tag": A["tag"], "bloom": A["bloom"], "dof": A["dof"],
           "fog": A["fog"]}
    if mode == "text":
        sc = build_text_only()
        rec["build_s"] = round(time.perf_counter() - t0, 2)
        bc.set_png_output(os.path.join(OUT, "text_" + TAG), rgba=True)
        rec["mode"] = "text"
        rec["render_s"] = round(bc.render_still(os.path.join(OUT, "text_" + TAG), frame=1), 2)
        bc.log_json(TIMING_LOG, rec)
        print("TIMING", rec)
        return
    sc = build_main()
    rec["build_s"] = round(time.perf_counter() - t0, 2)
    if A["passes"]:
        bc.add_pass_outputs(os.path.join(OUT, "passes_" + TAG), prefix="p", mist=True,
                            freestyle=(A["lines"] == "freestyle"),
                            grease_pencil=(A["lines"] == "gp"), mist_range=(1.0, 250.0))
    if A["save_blend"]:
        bc.save_blend(os.path.join(OUT, "probe_%s.blend" % TAG))
    bc.set_png_output(os.path.join(OUT, "x"), rgba=True)
    if mode in ("still", "all"):
        r = dict(rec, mode="still", frame=A["frame"])
        r["render_s"] = round(bc.render_still(os.path.join(OUT, "still_%s_f%03d" % (TAG, A["frame"])),
                                              frame=A["frame"]), 2)
        bc.log_json(TIMING_LOG, r)
        print("TIMING", r)
    if mode in ("seq", "all"):
        d = os.path.join(OUT, "seq_" + TAG)
        os.makedirs(d, exist_ok=True)
        r = dict(rec, mode="seq")
        r.update(bc.render_sequence(os.path.join(d, "f_####"), A["start"], A["end"]))
        bc.log_json(TIMING_LOG, r)
        print("TIMING", r)


main()
