r"""
shotA_street.py - STORYBOARD shot 23 (post-chorus 79.24-86.64 s, 222 frames @ 30 fps).

Toon dusk street flythrough with giant extruded mincho monoliths 救 光 夜 残.  The camera is
designed per frame in Python (custom speed curve with downbeat kicks + anticipation dips,
banking roll from lateral acceleration, lens punches), locked to analysis/audio.json:
    frame 1  (79.24 downbeat)  hard 'drop' kick, 救 revealed dead ahead in its plaza
    80.17 (beat, half bar)     whip past 救 (left)
    81.09 downbeat             fly THROUGH the legs of a 44 m 光 standing astride a crossing
    82.95 downbeat             pass UNDER 夜 suspended over the street (camera looks up)
    84.79 downbeat             bank hard past the 64 m 残 tower (right)
    ~85.2 -> 86.64             crane up + tilt to the sky: the sun sinks, the sky turns violet,
                               first stars appear, a giant 光 floats high up catching the last light
                               (so the final two glyphs read 残…光).

This is the 残光 example shot: its choreography assumes the window [--t0, --t1] holds four downbeats (one per
glyph pass). Re-time it to another song's showcase bar range with --t0 / --t1 (song seconds, from audio.json),
or copy it as the starting point of a new shot.

Run (from the project root; tools/blender_run.py finds Blender via env BLENDER / PATH / install dirs):
  python tools/blender_run.py blender/shots/shotA_street.py -- --mode preview --res 50 --step 6
  python tools/blender_run.py blender/shots/shotA_street.py -- --mode full
  python tools/blender_run.py blender/shots/shotA_street.py -- --mode stills --frames 1,29,56 --res 50
  (or by hand: blender -b --factory-startup -P blender/shots/shotA_street.py -- --mode preview ...)
Options: --mode preview|full|stills|none  --res 100  --step 6  --start 1 --end <last frame>  --frames a,b,c
         --t0 79.24 --t1 86.64 (song time window)  --out <dir> (default <ROOT>/blender/renders/A)
         --samples 16  --save_blend 0|1  --lines 1  --mblur 0
Output: <out>/f_0001.jpg ... f_0222.jpg (JPEG q95, 1920x1080), timings -> <out>/timings.jsonl
Needs <ROOT>/analysis/audio.json (tools/analyze_audio.py). Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
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

SHOTS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SHOTS))                      # blender/shots/ is two levels below the root
sys.path.insert(0, SHOTS)
import importlib
import _shared as sh
importlib.reload(sh)
bc = sh.bc
bpy = sh.bpy
from mathutils import Vector, Euler

A = bc.parse_args({"mode": "preview", "res": 50, "step": 6, "start": 1, "end": 0, "frames": "",
                   "out": os.path.join(ROOT, "blender", "renders", "A"), "samples": 16, "save_blend": 0,
                   "lines": 1, "mblur": 0, "tag": "", "t0": 79.24, "t1": 86.64}, doc=__doc__)
OUT = A["out"]
os.makedirs(OUT, exist_ok=True)
T0, T1 = A["t0"], A["t1"]
NF = sh.frame_of(T1, T0) - 1          # 222
if A["end"] <= 0:
    A["end"] = NF
random.seed(23)

# ------------------------------------------------------------------ beats -> frames
DOWN = sh.beats_in(T0, T1 - 0.1, "downbeats")          # 79.24 81.09 82.95 84.79
BEATS = sh.beats_in(T0, T1 - 0.1, "beats")
F_HITS = [sh.frame_of(t, T0) for t in DOWN]            # [1, 56, 112, 167]
F_KYU = sh.frame_of(BEATS[2], T0)                      # 80.17 -> whip past 救
F_HIK, F_YORU, F_ZAN = F_HITS[1], F_HITS[2], F_HITS[3]
F_CRANE0 = F_ZAN + 5                                   # crane blends in right after the 残 pass
F_END = NF
print("HITS", F_HITS, "KYU", F_KYU, "NF", NF)

# ------------------------------------------------------------------ palette (P1 dusk, violet shadows)
P = {
    "sky_day": [(0.00, "#ffd592"), (0.05, "#ffa066"), (0.14, "#f0707a"), (0.30, "#b85592"),
                (0.52, "#5a4296"), (0.78, "#2c2a70"), (1.00, "#181a48")],
    "sky_night": [(0.00, "#ff9466"), (0.025, "#e8667a"), (0.07, "#a24e8e"), (0.15, "#6a44a0"),
                  (0.30, "#48329a"), (0.50, "#33267e"), (0.75, "#241c62"), (1.00, "#1a1548")],
    "haze": "#e98a8c",
    "line": "#241638",
    "rim": "#ffe0a8",
    "wire": "#20142e",
    "road": ("#b67e8a", "#4a3b66", "#342a52"),
    "walk": ("#d6a09a", "#5d4b78", "#40345f"),
    "bld": [("#f4b48e", "#6f5c9c", "#4a3d74"),
            ("#eaa39f", "#61508e", "#403468"),
            ("#f7cb9c", "#7d67a3", "#4d3f77"),
            ("#dc9c88", "#57487f", "#3a2e5e"),
            ("#f0bca8", "#6a5890", "#463a6c")],
    "window_off": "#3b3160",
    "window_on": "#ffd99a",
    "pole": ("#9a8aa8", "#4a3f66", "#302848"),
}
SUN_DIR0 = Vector((-0.55, 0.75, 0.38)).normalized()     # key light (towards the sun), ~22 deg up
FILL_DIR = Vector((0.35, -1.0, 0.8)).normalized()
SKY_SUN0 = (0.0, 1.0, 0.052)                           # painted disc at the vanishing point
RIM_HOT = (2.2, 1.45, 0.75, 1.0)                        # linear > 1 -> rim blooms


def toon(name, trip, rim=True, rim_col=None, haze=P["haze"], haze_range=(35.0, 300.0), haze_max=0.8,
         mode="shader_to_rgb", light_dir=None, **kw):
    lit, shade, dark = trip
    return bc.toon_material(name, lit=lit, shade=shade, dark=dark, shade_at=0.16, dark_at=0.02,
                            rim=(rim_col or P["rim"]) if rim else None, rim_width=0.25, rim_at=0.62,
                            rim_dir=tuple(SUN_DIR0), mode=mode,
                            light_dir=tuple(light_dir or SUN_DIR0), fill_dir=tuple(FILL_DIR), fill=0.10,
                            ambient=0.015, haze=haze, haze_range=haze_range, haze_max=haze_max, **kw)


# ------------------------------------------------------------------ camera design (pure function of frame)
def cam_speed(f):
    """m/s.  Base accelerates 30 -> 58; each downbeat adds a decaying kick (the 'hit'), each hit is
    preceded by a small anticipation dip; the crane brakes it to a crawl."""
    u = (f - 1) / (F_ZAN - 1)
    v = sh.lerp(30.0, 56.0, sh.ease_in_out_sine(u)) if f <= F_ZAN else 56.0
    for h in F_HITS:
        if f >= h:
            v += (30.0 if h == 1 else 22.0) * math.exp(-(f - h) / 6.5)
        if h > 1:
            v -= 8.0 * math.exp(-((f - (h - 5)) / 3.0) ** 2)
    brake = sh.ease_in_out_cubic((f - (F_CRANE0 - 4)) / (F_END - F_CRANE0 + 4))
    return v * (1.0 - 0.94 * brake)


def build_cam_y():
    ys = {1: 0.0, 0: -cam_speed(1) / 30.0, -1: -2 * cam_speed(1) / 30.0}
    y = 0.0
    for f in range(1, F_END + 30):
        y += cam_speed(f) / 30.0
        ys[f + 1] = y
    return ys


CAM_Y = build_cam_y()


def catmull(pts, f):
    """Catmull-Rom through (frame, value) control points."""
    if f <= pts[0][0]:
        return pts[0][1]
    if f >= pts[-1][0]:
        return pts[-1][1]
    for i in range(len(pts) - 1):
        if pts[i][0] <= f <= pts[i + 1][0]:
            break
    p0 = pts[max(i - 1, 0)]
    p1, p2 = pts[i], pts[i + 1]
    p3 = pts[min(i + 2, len(pts) - 1)]
    t = (f - p1[0]) / (p2[0] - p1[0])
    # non-uniform tangents scaled to the segment
    m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * (p2[0] - p1[0])
    m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * (p2[0] - p1[0])
    t2, t3 = t * t, t * t * t
    return ((2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 +
            (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2)


# lateral swerves (filled in after the 光 corridor is measured)
X_PTS = None


def cam_x(f):
    return catmull(X_PTS, f)


def cam_z(f):
    z = 2.3
    # dip a little when passing under 夜, lift over the 光 crossing
    z -= 1.0 * math.exp(-((f - F_YORU) / 9.0) ** 2)
    z += 0.5 * math.exp(-((f - F_HIK) / 12.0) ** 2)
    # pre-rise into the 残 pass (anticipation), then the crane: slow start, strong rise, soft landing
    z += 4.8 * sh.smoother(F_ZAN - 18, F_ZAN + 2, f)
    c = sh.smoother(F_CRANE0, F_END + 6, f)
    z += 54.0 * c
    return z


def cam_pitch_deg(f):
    p = -1.2
    p += 14.0 * math.exp(-((f - (F_YORU - 3)) / 8.0) ** 2)      # look up at 夜 overhead
    p += 3.0 * math.exp(-((f - (F_HIK - 8)) / 10.0) ** 2)        # glance at the arch of 光
    c = sh.ease_in_out_cubic((f - F_CRANE0) / (F_END - F_CRANE0))
    return p + (64.0 - p) * c


def cam_lens(f):
    L = 18.0
    L -= 3.0 * math.exp(-(f - 1) / 9.0)                         # opening wide punch
    for h in F_HITS[1:]:
        if f >= h - 2:
            L -= 2.6 * math.exp(-max(f - h, 0) / 5.0) * sh.smooth(h - 3, h, f)
    c = sh.ease_in_out_sine((f - F_CRANE0) / (F_END - F_CRANE0))
    return L + (20.0 - 18.0) * c


def camera_frames():
    frames = []
    xs = {f: cam_x(f) for f in range(0, F_END + 4)}
    for f in range(1, F_END + 1):
        x, y, z = xs[f], CAM_Y[f], cam_z(f)
        vx = (xs[f + 1] - xs[f - 1]) * 0.5
        vy = (CAM_Y[f + 1] - CAM_Y[f - 1]) * 0.5
        ax = (xs[f + 1] - 2 * xs[f] + xs[f - 1]) * 900.0      # m/s^2
        yaw = math.atan2(vx, max(vy, 1e-3)) * 0.6
        c = sh.ease_in_out_cubic((f - F_CRANE0) / (F_END - F_CRANE0))
        yaw *= (1.0 - c)
        yaw += math.radians(-3.0) * c                          # drift slightly left while craning
        pitch = math.radians(cam_pitch_deg(f))
        fwd = (math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch))
        bank = max(-11.0, min(11.0, 0.55 * ax))                  # deg, right-side-down on right turns
        roll = -math.radians(bank) * (1.0 - 0.6 * c) + math.radians(-5.0) * c
        # barrel accent while diving under 夜
        roll += math.radians(9.0) * math.exp(-((f - (F_YORU + 1)) / 7.0) ** 2)
        # designed impact shake: decaying, deterministic, only right after the downbeat hits
        amp = sum(math.exp(-(f - h) / 4.0) for h in F_HITS if f >= h)
        x += 0.06 * amp * math.sin(f * 2.9 + 1.3)
        z += 0.05 * amp * math.sin(f * 3.7 + 0.4)
        roll += math.radians(0.7) * amp * math.sin(f * 4.1 + 2.0)
        frames.append({"f": f, "loc": (x, y, z), "fwd": fwd, "roll": roll, "lens": cam_lens(f)})
    return frames


# ------------------------------------------------------------------ monoliths
def gmat(name, trip, zr, top=("#6a4a9a", 0.3), bot=("#a86a8a", 0.45), haze_max=0.5, dark_at=0.02):
    lit, shade, dark = trip
    return sh.glyph_toon(name, lit, shade, dark, rim=RIM_HOT, rim_dir=tuple(SUN_DIR0), rim_width=0.22,
                         rim_at=0.64, grad=(zr[0], zr[1], top[0], top[1], bot[0], bot[1]),
                         haze=P["haze"], haze_range=(90.0, 460.0), haze_max=haze_max, dark_at=dark_at)


CREAM = ("#fff4e4", "#ffdfc0", "#e39a96")
VERM = ("#ffa552", "#c8373a", "#7a2350")
VERM_FACE = ("#ff8050", "#d23c3c", "#7a2350")
GLOW_SIDE = ("#ffe3b0", "#ffa552", "#c8373a")
INK_FACE = ("#9a3a6a", "#3e1a4c", "#1c0f2a")
INK_SIDE = ("#f0663a", "#7a2350", "#3a1745")


def ground_gap(ob, z0=0.5, z1=7.0, xc=0.0):
    """Measure the free corridor at street level between the legs of an astride glyph:
    returns (x_left_edge, x_right_edge) of the widest gap (approx, from verts)."""
    xs = sorted(v.x for v in sh.world_verts(ob) if z0 <= v.z <= z1)
    best = None
    for a, b in zip(xs[:-1], xs[1:]):
        if b - a > 2.0 and (best is None or (b - a) > (best[1] - best[0])):
            best = (a, b)
    return best


def place_edge(ob, side, x_edge, y_pass, zband=(0.0, 12.0)):
    """Shift a standing glyph so its street-side edge (within the camera's height band) is at x_edge
    and that edge crosses y_pass (the camera passes it exactly on the hit frame)."""
    vs = [v for v in sh.world_verts(ob) if zband[0] <= v.z <= zband[1]] or sh.world_verts(ob)
    e = max(vs, key=lambda v: v.x) if side < 0 else min(vs, key=lambda v: v.x)
    ob.location.x += x_edge - e.x
    ob.location.y += y_pass - e.y
    bpy.context.view_layer.update()


def zrange(ob):
    zs = [v.z for v in sh.world_verts(ob)]
    return min(zs), max(zs)


def build_monoliths(col):
    Y_KYU = CAM_Y[F_KYU]
    Y_HIK = CAM_Y[F_HIK]
    Y_YORU = CAM_Y[F_YORU]
    Y_ZAN = CAM_Y[F_ZAN]
    info = {}
    # scale crescendo: 救 20 m -> 光 40 m -> 夜 30 m (suspended) -> 残 64 m -> sky 光 100 m
    # 救: standing on the left, face turned towards the street
    kyu = sh.monolith("救", 20.0, (-15.0, Y_KYU, 0.0), rot_deg=(90, 0, 16), extrude=0.05,
                      coll=col, name="G_kyu", ground=True)
    kyu.location.z -= 0.4
    place_edge(kyu, -1, -4.4, Y_KYU, (0.0, 6.0))
    zr = zrange(kyu)
    sh_assign(kyu, gmat("M_kyu_face", CREAM, zr), gmat("M_kyu_side", VERM, zr, top=("#5a3a8a", 0.22)))
    info["kyu"] = kyu
    # 光: astride the crossing, legs planted on the corners, sun framed between the legs
    hik = sh.monolith("光", 40.0, (0.0, Y_HIK, 0.0), rot_deg=(90, 0, 0), extrude=0.05,
                      coll=col, name="G_hikari", ground=True)
    hik.location.z -= 0.4
    gap = ground_gap(hik, 0.5, 6.0)
    xc = 0.5 * (gap[0] + gap[1])
    hik.location.x += (-0.6 - xc)
    bpy.context.view_layer.update()
    gap = ground_gap(hik, 0.5, 6.0)
    zr = zrange(hik)
    sh_assign(hik, gmat("M_hik_face", VERM_FACE, zr, top=("#7a5aa8", 0.25), bot=("#8a5a8a", 0.5)),
              gmat("M_hik_side", GLOW_SIDE, zr, top=("#6a4a9a", 0.15)))
    info["hik_gap"] = gap
    info["hik"] = hik
    # 夜: suspended over the street, tilted forward, slowly turning
    yoru = sh.monolith("夜", 30.0, (1.2, Y_YORU + 9.0, 22.0), rot_deg=(90 + 38, 6, -7), extrude=0.07,
                       coll=col, name="G_yoru")
    zmin = min(v.z for v in sh.world_verts(yoru))
    yoru.location.z += 5.4 - zmin
    bpy.context.view_layer.update()
    zr = zrange(yoru)
    sh_assign(yoru, gmat("M_yoru_face", INK_FACE, zr, top=("#6a4aa8", 0.45), bot=("#ffffff", 0.0), haze_max=0.4,
                         dark_at=0.008),
              gmat("M_yoru_side", INK_SIDE, zr, top=("#6a4aa8", 0.2), bot=("#ffffff", 0.0), haze_max=0.4,
                   dark_at=0.008))
    info["yoru"] = yoru
    # 残: a 60 m tower standing IN the road ahead - it eclipses the sun (backlit rim), the camera
    # banks around its left edge on the 84.79 downbeat and the sun is revealed for the crane-up
    zan = sh.monolith("残", 44.0, (24.0, Y_ZAN, 0.0), rot_deg=(90, 0, -10), extrude=0.05,
                      coll=col, name="G_zan", ground=True)
    zan.location.z -= 0.6
    place_edge(zan, 1, -1.0, Y_ZAN, (5.0, 10.0))
    zr = zrange(zan)
    sh_assign(zan, gmat("M_zan_face", CREAM, zr, top=("#7a5aa8", 0.35)),
              gmat("M_zan_side", VERM, zr, top=("#5a3a8a", 0.25)))
    info["zan"] = zan
    info["Y"] = dict(kyu=Y_KYU, hik=Y_HIK, yoru=Y_YORU, zan=Y_ZAN)
    return info


def sh_assign(ob, face, side):
    ob.data.materials.clear()
    ob.data.materials.append(face)
    ob.data.materials.append(side)
    for p in ob.data.polygons:
        p.material_index = 0 if abs(p.normal.z) > 0.99 else 1


def animate_suspended(yoru, sky):
    """Slow, designed drift of the suspended glyphs (deterministic keyframes)."""
    r0 = yoru.rotation_euler.copy()
    l0 = yoru.location.copy()
    for f in (1, F_END):
        k = (f - 1) / (F_END - 1)
        yoru.rotation_euler = (r0.x, r0.y + math.radians(-6.0 * k), r0.z + math.radians(10.0 * k))
        yoru.location = (l0.x, l0.y, l0.z + 1.2 * k)
        yoru.keyframe_insert("rotation_euler", frame=f)
        yoru.keyframe_insert("location", frame=f)
    s0 = sky.rotation_euler.copy()
    for f in (1, F_END):
        k = (f - 1) / (F_END - 1)
        sky.rotation_euler = (s0.x, s0.y, s0.z + math.radians(7.0 * k))
        sky.keyframe_insert("rotation_euler", frame=f)
    for ob in (yoru, sky):
        for fc in bc.fcurves(ob):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


# ------------------------------------------------------------------ street
def build_street(Ys, hik_gap):
    col_main = bc.collection("Street")
    col_nolines = bc.collection("NoLines")
    Y_KYU, Y_HIK, Y_YORU, Y_ZAN = Ys["kyu"], Ys["hik"], Ys["yoru"], Ys["zan"]
    Y_END = 560.0
    # cross streets (y0, y1)
    cross = [(Y_HIK - 9.0, Y_HIK + 9.0), (44.0, 56.0), (Y_YORU + 34.0, Y_YORU + 46.0),
             (Y_ZAN + 70.0, Y_ZAN + 82.0)]
    # plazas cut into one side
    plazas = {-1: [(Y_KYU - 9.0, Y_KYU + 12.0)], 1: [(Y_ZAN - 42.0, Y_ZAN + 26.0)]}
    low_zone = (Y_YORU + 12.0, Y_ZAN - 42.0)          # keep the blocks in front of 残 low

    def blocked(side, y0, y1):
        for a, b in cross:
            if y1 > a and y0 < b:
                return b
        for a, b in plazas[side]:
            if y1 > a and y0 < b:
                return b
        return None

    road_m = toon("M_road", P["road"], rim=False)
    road = bc.plane("Road", size=(12.0, Y_END + 80), loc=(0, (Y_END - 80) * 0.5, 0), coll=col_main, mat=road_m)
    walk_m = toon("M_walk", P["walk"], rim=False)
    for sx in (-1, 1):
        # sidewalks, interrupted at the cross streets
        y = -40.0
        segs = []
        for a, b in sorted(cross) + [(Y_END, Y_END)]:
            if a > y:
                segs.append((y, a))
            y = b
        for a, b in segs:
            bc.box("Walk", size=(2.2, b - a, 0.18), loc=(sx * 7.1, (a + b) * 0.5, 0), coll=col_main, mat=walk_m)
    # cross-street road surfaces + a big plaza floor
    for a, b in cross:
        bc.plane("CrossRoad", size=(260.0, b - a), loc=(0, (a + b) * 0.5, -0.005), coll=col_main, mat=road_m)
    for side, lst in plazas.items():
        for a, b in lst:
            bc.plane("Plaza", size=(44.0, b - a), loc=(side * 28.0, (a + b) * 0.5, 0.02), coll=col_main, mat=walk_m)
    # markings
    mk = []
    y = 4.0
    while y < Y_END:
        if not any(a - 2 < y < b + 2 for a, b in cross):
            mk.append(((0.16, 3.0, 0.02), (0.0, y, 0.0), 0.0))
        y += 8.0
    for sx in (-1, 1):
        y = -40.0
        for a, b in sorted(cross) + [(Y_END, Y_END)]:
            if a - y > 1:
                mk.append(((0.14, a - y - 1.0, 0.02), (sx * 5.6, (a + y) * 0.5, 0.0), 0.0))
            y = b
    # zebra crossings at both edges of every cross street
    for a, b in cross:
        for yy in (a + 1.8, b - 1.8):
            for i in range(-5, 6):
                mk.append(((0.55, 2.6, 0.02), (i * 1.05, yy, 0.0), 0.0))
        # stop lines
        mk.append(((5.6, 0.35, 0.02), (-2.9, a - 0.6, 0.0), 0.0))
    bc.join_boxes("Markings", mk, coll=col_nolines,
                  mat=bc.flat_material("M_mark", "#f3e3e6", haze=P["haze"], haze_range=(20, 220), haze_max=0.85))

    # ---------------- buildings
    bmats = [toon("M_bld%d" % i, t) for i, t in enumerate(P["bld"])]
    win_off, win_on, roof_bits, signs, boards = [], [], [], [], []
    for side in (-1, 1):
        y = -40.0
        while y < Y_END:
            w = random.uniform(5.0, 11.0)
            nb = blocked(side, y, y + w)
            if nb is not None:
                # shrink to fit before the obstacle, else jump past it
                room = min(a for a, b in (cross + plazas[side]) if b == nb) - y
                if room > 4.0:
                    w = room - 0.3
                else:
                    y = nb + 0.5
                    continue
            if y > 60 and random.random() < 0.10:
                y += random.uniform(4.0, 8.0)
                continue
            d = random.uniform(8.0, 14.0)
            h = random.choice([random.uniform(5.5, 9.0), random.uniform(9, 16), random.uniform(14, 26)])
            if side < 0 and y < 120:
                h = random.uniform(5.5, 8.5) if random.random() < 0.75 else random.uniform(9.5, 12.5)
            if y > 150:
                h *= random.uniform(1.0, 1.5)
            if low_zone[0] < y < low_zone[1]:
                h = min(h, random.uniform(7.0, 12.0))
            if side < 0 and Y_KYU - 45 < y < Y_KYU:
                h = random.uniform(5.2, 7.0)            # low houses in front of 救
            x = side * (8.2 + d * 0.5 + random.uniform(-0.25, 0.4))
            bw = w - random.uniform(0.2, 1.2)
            bc.box("Bld", size=(d, bw, h), loc=(x, y + w * 0.5, 0), coll=col_main, mat=random.choice(bmats))
            face_x = x - side * d * 0.5
            floors = int((h - 1.5) // 3.1)
            cols = max(1, int((w - 1.6) // 2.0))
            for fl in range(floors):
                zc = 3.0 + fl * 3.1
                for c in range(cols):
                    yc = y + 1.4 + c * 2.0 + 0.4
                    if yc > y + w - 1.2:
                        continue
                    box = ((0.12, 1.2, 1.35), (face_x - side * 0.02, yc, zc), 0.0)
                    (win_on if random.random() < 0.2 else win_off).append(box)
            if random.random() < 0.6:
                roof_bits.append(((random.uniform(1.5, 3), random.uniform(1.5, 3), random.uniform(1, 2.2)),
                                  (x + random.uniform(-1.5, 1.5), y + w * 0.5 + random.uniform(-1, 1), h), 0.0))
            roof_bits.append(((d, 0.25, 0.9), (x, y + 0.3, h), 0.0))
            if random.random() < 0.45:
                signs.append((side, face_x, y + random.uniform(1.0, max(w - 1.0, 1.1)), random.uniform(3.2, 5.0)))
            if h > 14 and random.random() < 0.18 and len(boards) < 7:
                boards.append((side, x, y + w * 0.5, h, min(bw, 8.0)))
            y += w
    bc.join_boxes("WindowsOff", win_off, coll=col_main,
                  mat=toon("M_win_off", ("#7e6aa6", P["window_off"], "#2a2248"), rim=False))
    bc.join_boxes("WindowsOn", win_on, coll=col_main,
                  mat=bc.flat_material("M_win_on", P["window_on"], strength=1.6, haze=P["haze"]))
    bc.join_boxes("RoofBits", roof_bits, coll=col_main, mat=bmats[2])

    # tategaki signboards: only our kanji, or blank colour boards with stripes
    words = ["残光", "救", "夜", "光", None, "救", None, "夜光"]
    sign_face = bc.flat_material("M_signtxt", "#fff6ec", haze=P["haze"], haze_range=(30, 220), haze_max=0.6)
    sign_board = [toon("M_sign%d" % i, t) for i, t in enumerate(
        [("#ff6f6f", "#9c3060", "#5e2050"), ("#5ec4d8", "#2f5f9a", "#253c70"),
         ("#ffd05a", "#b06a4a", "#6a3a4a"), ("#fff0e0", "#b9a6cc", "#7a6a9a")])]
    stripes = []
    for i, (side, fx, sy, zb) in enumerate(signs):
        word = words[i % len(words)]
        n = len(word) if word else random.choice([2, 3])
        hgt = 0.95 * n + 0.6
        bc.box("Sign%d" % i, size=(1.1, 0.28, hgt), loc=(fx - side * 0.75, sy, zb), coll=col_main,
               mat=random.choice(sign_board))
        if word:
            for face in (-1, 1):
                bc.jp_text(word, font="gothic_black", height=0.9 * len(word), extrude=0.0, bevel_depth=0.0,
                           vertical=True, line_spacing=0.9, loc=(fx - side * 0.75, sy + face * 0.15, zb + hgt * 0.5),
                           rot_deg=(90, 0, 0 if face < 0 else 180), coll=col_nolines, mat=sign_face,
                           name="SignTxt%d" % i)
        else:
            for k in range(n):
                for face in (-1, 1):
                    stripes.append(((0.8, 0.02, 0.18), (fx - side * 0.75, sy + face * 0.15, zb + 0.5 + k * 0.95), 0.0))
    if stripes:
        bc.join_boxes("SignStripes", stripes, coll=col_nolines, mat=sign_face)
    # rooftop billboards (big single kanji, facing the approaching camera)
    bb_mat = toon("M_board", ("#ffe8d0", "#c9a8d8", "#8a70aa"), rim=False)
    bb_txt = bc.flat_material("M_boardtxt", "#c8373a", haze=P["haze"], haze_range=(40, 300), haze_max=0.7)
    for i, (side, x, y, h, w) in enumerate(boards):
        ch = "残光夜救"[i % 4]
        bw = min(w, 7.0)
        bc.box("Board%d" % i, size=(bw, 0.3, bw * 0.62), loc=(x, y, h + 1.2), coll=col_main, mat=bb_mat)
        # legs
        bc.box("BoardLegL%d" % i, size=(0.2, 0.2, 1.3), loc=(x - bw * 0.35, y, h), coll=col_main, mat=bmats[3])
        bc.box("BoardLegR%d" % i, size=(0.2, 0.2, 1.3), loc=(x + bw * 0.35, y, h), coll=col_main, mat=bmats[3])
        bc.jp_text(ch, font="mincho", height=bw * 0.5, extrude=0.0, bevel_depth=0.0,
                   loc=(x, y - 0.17, h + 1.2 + bw * 0.31), rot_deg=(90, 0, 0), coll=col_nolines, mat=bb_txt,
                   name="BoardTxt%d" % i)

    # ---------------- utility poles (GN instancing) + wires
    pole_m = toon("M_pole", P["pole"])
    src = bc.cylinder("PoleSrc", radius=0.17, depth=10.5, verts=10, mat=pole_m, coll=col_main)
    arm = bc.box("ArmSrc", size=(1.9, 0.14, 0.14), loc=(0, 0, 9.4), coll=col_main, mat=pole_m)
    arm2 = bc.box("ArmSrc2", size=(1.4, 0.12, 0.12), loc=(0, 0, 8.2), coll=col_main, mat=pole_m)
    tr = bc.cylinder("Transformer", radius=0.32, depth=1.0, verts=10, loc=(0.35, 0.0, 6.6), coll=col_main, mat=pole_m)
    pole_coll = bc.collection("PoleSource")
    for o in (src, arm, arm2, tr):
        for c in list(o.users_collection):
            c.objects.unlink(o)
        pole_coll.objects.link(o)
    bpy.context.view_layer.layer_collection.children["PoleSource"].exclude = True
    pts, rots, scs = [], [], []
    for side in (-1, 1):
        yy = -30.0 + (side * 5.0)
        while yy < Y_END - 20:
            ok = not any(a - 1.0 < yy < b + 1.0 for a, b in cross)
            ok = ok and not any(a < yy < b for a, b in plazas[side])
            if ok:
                pts.append((side * 6.35, yy, 0.0))
                rots.append((0.0, random.uniform(-0.015, 0.015), 0.0 if side > 0 else math.pi))
                scs.append(random.uniform(0.96, 1.05))
            yy += 21.0
    bc.instance_on_points("Poles", pole_coll, pts, rots, scs, coll=col_main)
    strands = []
    for side in (-1, 1):
        sp = sorted([p for p in pts if p[0] * side > 0], key=lambda p: p[1])
        for a, b in zip(sp[:-1], sp[1:]):
            if b[1] - a[1] > 50:
                continue
            for off, z in ((-0.85, 9.45), (0.0, 9.45), (0.85, 9.45), (-0.6, 8.25), (0.6, 8.25)):
                strands.append(bc.catenary((a[0] + off * side, a[1], z), (b[0] + off * side, b[1], z),
                                           sag=random.uniform(0.35, 0.7), n=20))
    lp = sorted([p for p in pts if p[0] < 0], key=lambda p: p[1])
    rp = sorted([p for p in pts if p[0] > 0], key=lambda p: p[1])
    for a in lp[::2]:
        b = min(rp, key=lambda q: abs(q[1] - a[1]))
        if abs(b[1] - a[1]) < 14:
            strands.append(bc.catenary((a[0], a[1], 8.2), (b[0], b[1], 8.2), sag=0.5, n=20))
    bc.polyline("Wires", strands, bevel=0.022, coll=col_nolines,
                mat=bc.flat_material("M_wire", P["wire"], haze=P["haze"], haze_range=(40, 280), haze_max=0.7))

    # ---------------- traffic signals at the cross streets (red lamp glows)
    sig_m = toon("M_sig", ("#8a7ea0", "#3f3660", "#2a2446"))
    red_m = bc.emission_material("M_sig_red", "#ff4a3a", strength=3.0)
    dim_m = bc.flat_material("M_sig_dim", "#2a2040")
    for a, b in cross[1:]:
        for side, yy in ((1, a - 1.2), (-1, b + 1.2)):
            px = side * 6.6
            bc.cylinder("SigPole", radius=0.13, depth=6.0, verts=8, loc=(px, yy, 0), coll=col_main, mat=sig_m)
            bc.box("SigArm", size=(4.2, 0.12, 0.12), loc=(px - side * 2.1, yy, 5.6), coll=col_main, mat=sig_m)
            hx = px - side * 3.4
            bc.box("SigBox", size=(1.6, 0.35, 0.55), loc=(hx, yy, 5.2), coll=col_main, mat=sig_m)
            for k, m in enumerate((dim_m, dim_m, red_m)):
                bc.cylinder("SigLamp", radius=0.19, depth=0.08, verts=12, loc=(hx - 0.5 + k * 0.5, yy - 0.2 * side, 5.475),
                            rot=(math.pi / 2, 0, 0), coll=col_nolines, mat=m, origin="CENTER")
    # vending machines (bloom)
    vm_m = bc.emission_material("M_vending", "#e8f6ff", strength=2.2)
    for sx, yy in ((1, 14.0), (-1, 96.0), (1, 188.0), (-1, 262.0)):
        bc.box("Vending", size=(0.9, 1.2, 1.9), loc=(sx * 7.7, yy, 0.18), coll=col_main, mat=vm_m)

    # ---------------- back city: blocks behind the street rows / plazas / along cross streets
    back = []
    cell = 21.0
    for side in (-1, 1):
        gx = 25.0
        while gx < 190.0:
            gy = -40.0
            while gy < Y_END:
                yc = gy + random.uniform(-3, 3)
                if random.random() < 0.22 or any(a - 3 < yc < b + 3 for a, b in cross):
                    gy += cell
                    continue
                clear = 36.0 if side < 0 else 52.0
                if gx < clear and any(a - 4 < yc < b + 4 for a, b in plazas[side]):
                    gy += cell
                    continue
                if side > 0 and gx < 30 and Ys["zan"] - 50 < yc < Ys["zan"] + 20:
                    gy += cell
                    continue
                h = random.uniform(6, 16) if gx < 60 else random.uniform(8, 30)
                if random.random() < 0.08:
                    h = random.uniform(30, 48)
                back.append(((random.uniform(10, 17), random.uniform(10, 17), h),
                             (side * (gx + random.uniform(0, 4)), yc, 0.0), 0.0))
                gy += cell
            gx += cell
    bc.join_boxes("BackCity", back, coll=col_main, mat=bmats[1])
    bc.plane("Ground", size=(420.0, Y_END + 120), loc=(0, (Y_END - 80) * 0.5, -0.02), coll=col_main,
             mat=toon("M_ground", ("#a07286", "#46395f", "#30284c"), rim=False))

    # ---------------- far skyline + hills (flat cards) and clouds
    far = []
    for i in range(110):
        xx = random.uniform(-260, 260)
        if abs(xx) < 10:
            xx += 20 * (1 if xx >= 0 else -1)
        far.append(((random.uniform(8, 26), random.uniform(6, 20), random.uniform(10, 60)),
                    (xx, random.uniform(Y_END + 20, Y_END + 110), 0), random.uniform(-0.3, 0.3)))
    bc.join_boxes("FarCity", far, coll=col_nolines,
                  mat=bc.flat_material("M_far", "#9a5a8e", haze=P["haze"], haze_range=(200, 700), haze_max=0.5))
    cmat = bc.toon_material("M_cloud", lit="#ffb6a2", shade="#8e6aa8", dark="#5e4a8c",
                            shade_at=0.28, dark_at=0.05, rim="#ffe7b8", rim_width=0.3, rim_at=0.55,
                            rim_dir=(0.0, 0.6, -0.8), mode="fake", light_dir=(0.1, 0.5, -0.85),
                            haze="#f39a8a", haze_range=(300, 1100), haze_max=0.35)
    clouds = [(-190, 780, 120, 140), (-40, 860, 190, 110), (150, 800, 110, 170), (300, 700, 170, 120),
              (-330, 660, 200, 150), (60, 920, 75, 90), (-120, 700, 60, 70),
              # high clouds for the crane-up
              (-90, 420, 240, 120), (120, 470, 290, 150), (-10, 560, 330, 170), (200, 360, 210, 90),
              (-220, 380, 260, 130)]
    for i, (cx, cy, cz, w) in enumerate(clouds):
        bc.blob_cloud("Cloud%d" % i, (cx, cy, cz), size=(w, w * 0.35, w * 0.28), puffs=random.randint(5, 8),
                      seed=i + 3, coll=col_nolines, mat=cmat)
    return col_main, col_nolines, cross


def final_clouds(basis, coll):
    """High clouds framing the last composition (bellies lit by the sunken sun, violet tops)."""
    C, fv, rv, uv = basis
    cm = bc.toon_material("M_cloud_hi", lit="#f59a98", shade="#5e4390", dark="#34286a",
                          shade_at=0.3, dark_at=0.05, rim="#ffd8b0", rim_width=0.3, rim_at=0.6,
                          rim_dir=(0.0, 0.8, -0.6), mode="fake", light_dir=(0.0, 0.9, -0.44),
                          haze="#3a2c70", haze_range=(300, 1400), haze_max=0.45)
    # (right, up) in view-plane units, distance, width, seed : one big mass lower-left, a smaller
    # one right, a far bank behind the glyph, a wisp top-left
    spec = [(-0.70, -0.52, 360, 300, 21), (0.78, -0.44, 470, 170, 12), (0.60, 0.46, 950, 300, 13)]
    for i, (a, b, D, w, seed) in enumerate(spec):
        p = C + D * (fv + rv * a + uv * b)
        ob = bc.blob_cloud("CloudHi%d" % i, tuple(p), size=(w, w * 0.4, w * 0.22), puffs=6 + i % 3, seed=seed,
                           coll=coll, mat=cm)
        ob.lineart.usage = "OCCLUSION_ONLY"


# ------------------------------------------------------------------ build
def build():
    global X_PTS
    sc = bc.reset_scene()
    bc.setup_render("EEVEE", res=(1920, 1080), percent=A["res"], fps=30, samples=A["samples"],
                    transparent=False, view="Standard", shadow_pool="1024", motion_blur=bool(A["mblur"]))
    if A["mblur"]:
        sc.render.motion_blur_shutter = 0.35
    sc.frame_start, sc.frame_end = 1, NF
    day = [(p * 0.6, c) for p, c in P["sky_day"]] + [(1.0, P["sky_day"][-1][1])]
    sky = sh.sky_world(day, P["sky_night"], z_lo=-0.01, z_hi=1.0, sun_dir=SKY_SUN0,
                       sun_strength=2.4, sun_color="#fff6dc", sun_size_deg=5.0, glow_color="#ffc070",
                       glow_power=3.0, glow_strength=0.95, ambient="#4a3a6a", ambient_strength=0.3,
                       below="#342a52", star_color="#fff2e6", night=0.0, star_fade=0.0,
                       star_z=(0.10, 0.45), wide_glow=("#d0508a", 2.2, 0.0))
    col_text = bc.collection("Monoliths")
    # placeholder X path to measure the camera y (y does not depend on x)
    X_PTS = [(1, 0.0), (NF, 0.0)]
    info = build_monoliths(col_text)
    gap = info["hik_gap"]
    xc = 0.5 * (gap[0] + gap[1])
    print("HIKARI GAP", gap, "centre", xc)
    X_PTS = [(-4, 2.4), (1, 2.3), (F_KYU, 1.3), (F_KYU + 12, -0.4), (F_HIK - 8, xc - 0.2),
             (F_HIK, xc), (F_HIK + 16, 2.0), (F_YORU - 22, 1.2), (F_YORU, -0.6), (F_YORU + 18, 1.4),
             (F_ZAN - 26, 2.4), (F_ZAN - 10, -0.8), (F_ZAN, -3.9), (F_ZAN + 14, -3.6), (NF, -2.6),
             (NF + 10, -2.5)]
    Ys = info["Y"]
    # final camera basis -> place the sky glyph 光 and the high clouds in the last composition
    cf = camera_frames()
    last = cf[-1]
    C = Vector(last["loc"])
    q = sh.cam_quat(last["fwd"], last["roll"])
    fv, rv, uv = Vector(last["fwd"]).normalized(), q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
    D = 215.0
    pos = C + D * (fv + rv * 0.05 + uv * 0.04)
    sky_face = sh.glyph_toon("M_sky_face", "#ffe8c0", "#f39070", "#7a2350", rim=RIM_HOT, rim_dir=(0, 0.2, -1),
                             rim_width=0.3, rim_at=0.55, mode="fake", light_dir=(0.0, 0.3, -0.95),
                             shade_at=0.3, dark_at=0.06, haze="#9a5a9a", haze_range=(150, 900), haze_max=0.3)
    sky_side = sh.glyph_toon("M_sky_side", "#ffa552", "#c8373a", "#4a1a48", rim=RIM_HOT, rim_dir=(0, 0.2, -1),
                             rim_width=0.3, rim_at=0.55, mode="fake", light_dir=(0.0, 0.3, -0.95),
                             shade_at=0.3, dark_at=0.06, haze="#9a5a9a", haze_range=(150, 900), haze_max=0.3)
    col_sky = bc.collection("SkyGlyph")
    sky_g = sh.monolith("光", 128.0, tuple(pos), rot_deg=(0, 0, 0), extrude=0.06, coll=col_sky, name="G_sky")
    sh_assign(sky_g, sky_face, sky_side)
    sky_g.rotation_mode = "QUATERNION"
    sky_g.rotation_quaternion = q @ Euler((math.radians(10), math.radians(-8), math.radians(5))).to_quaternion()
    sky_g.rotation_mode = "XYZ"
    info["final_basis"] = (C, fv, rv, uv)
    info["col_sky"] = col_sky
    animate_suspended(info["yoru"], sky_g)
    col_main, col_nolines, cross = build_street(Ys, gap)
    final_clouds(info["final_basis"], info["col_sky"])
    # lights: key sun sinks during the crane (lit band climbs the facades = 残光)
    s = bc.sun("Sun", direction=tuple(SUN_DIR0), color="#ffffff", strength=math.pi, angle_deg=0.0,
               filter_radius=0.15)
    sc.eevee.shadow_step_count = 6
    sc.eevee.shadow_ray_count = 1
    s.data.shadow_maximum_resolution = 0.001
    az = math.atan2(SUN_DIR0.x, SUN_DIR0.y)
    el0 = math.asin(SUN_DIR0.z)
    for f in (1, F_ZAN - 20, NF):
        k = sh.ease_in_out_sine((f - (F_ZAN - 20)) / (NF - (F_ZAN - 20))) if f > F_ZAN - 20 else 0.0
        el = el0 + (math.radians(6.5) - el0) * k
        d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
        s.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        s.keyframe_insert("rotation_euler", frame=f)
    bc.sun("Fill", direction=tuple(FILL_DIR), color="#ffffff", strength=math.pi * 0.10, angle_deg=5.0, shadow=False)
    # sky animation: sun disc sinks, night creeps in, stars appear
    fs = F_ZAN - 30
    sh.key_socket(sky["sunz"], [(1, SKY_SUN0[2]), (fs, SKY_SUN0[2] - 0.006), (NF, -0.035)])
    sh.key_socket(sky["glow"], [(1, 0.95), (fs, 0.95), (NF, 0.62)])
    sh.key_socket(sky["night"], [(1, 0.0), (F_CRANE0 - 8, 0.0), (NF, 0.92)])
    sh.key_socket(sky["stars"], [(1, 0.0), (F_CRANE0 + 6, 0.0), (NF - 6, 1.0), (NF, 1.0)])
    sh.key_socket(sky["wide"], [(1, 0.0), (F_CRANE0 - 4, 0.0), (NF, 0.5)])
    sh.set_id_interp(sc.world.node_tree, "BEZIER")
    # lines
    if A["lines"]:
        col_nolines.lineart_usage = "EXCLUDE"
        for nm in ("Road",):
            bpy.data.objects[nm].lineart.usage = "OCCLUSION_ONLY"
        for ob in bpy.data.objects:
            if ob.name.startswith(("CrossRoad", "Plaza", "Ground")):
                ob.lineart.usage = "OCCLUSION_ONLY"
        bc.gp_lineart("LineArt", source=None, radius=0.045, color=P["line"], crease_deg=120,
                      intersection=True, overshoot=0.0, noise=0.03, noise_step=2)
        # the far sky glyph gets its own, thicker line set (world-space radius would vanish at 200 m)
        bc.gp_lineart("LineArtSky", source=info["col_sky"], radius=0.42, color=P["line"], crease_deg=120,
                      intersection=False, overshoot=0.0, noise=0.25, noise_step=2)
    # camera
    cam = bc.camera("Cam", loc=(0, 0, 2), target=(0, 50, 2), lens=18.0, clip=(0.1, 2500.0))
    sh.key_camera_frames(cam, cf)
    # compositor: bloom
    comp = sh.compositor_with_grade(bloom=(1.05, 0.55, 0.7))
    # sun-reveal flare as the camera clears 残 on the 84.79 downbeat
    sh.key_socket(comp["bloom_strength"], [(1, 0.55), (F_ZAN - 3, 0.55), (F_ZAN + 3, 1.05),
                                           (F_ZAN + 18, 0.62), (NF, 0.55)])
    sh.set_id_interp(comp["tree"], "BEZIER")
    return sc, info


def main():
    t0 = time.perf_counter()
    sc, info = build()
    build_s = round(time.perf_counter() - t0, 2)
    print("BUILD", build_s, "s  Y:", {k: round(v, 1) for k, v in info["Y"].items()})
    log = os.path.join(OUT, "timings.jsonl")
    if A["save_blend"]:
        bc.save_blend(os.path.join(OUT, "shotA.blend"))
    sh.set_jpeg_output(os.path.join(OUT, "f_####"), quality=95)
    mode = A["mode"]
    if mode == "none":
        return
    if mode == "stills" and A["frames"]:
        frames = [int(x) for x in str(A["frames"]).split(",") if x.strip()]
    elif mode == "preview":
        frames = list(range(A["start"], A["end"] + 1, A["step"]))
        if F_END not in frames and A["end"] >= F_END:
            frames.append(F_END)
    else:
        frames = list(range(A["start"], A["end"] + 1))
    if mode == "full":
        r = bc.render_sequence(os.path.join(OUT, "f_####"), A["start"], A["end"])
        r.update({"shot": "A", "mode": "full", "res": A["res"], "build_s": build_s, "tag": A["tag"]})
        r.pop("per_frame", None)
        bc.log_json(log, r)
        print("TIMING", r)
    else:
        pf = sh.render_frames(os.path.join(OUT, "f_####"), frames, timing_log=log,
                              tag="A_%s_%s_res%d" % (mode, A["tag"], A["res"]))
        print("TIMING mean", sum(pf) / max(len(pf), 1))


main()
