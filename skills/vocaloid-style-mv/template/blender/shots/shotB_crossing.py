r"""
shotB_crossing.py - STORYBOARD shot 44 (interlude 147.15-154.46 s, 220 frames @ 30 fps).

A NIGHT railway crossing (踏切) in toon 3D:  crossbucks, two signal posts with double-faced lamp
pairs that alternate LEFT/RIGHT on every beat of analysis/audio.json (emissive lenses with bloom +
real red point lights whose spill is cel-shaded on the road, poles and arms), striped barrier arms
that land exactly on the downbeats 148.98 and 150.80 (gravity ease-in + damped bounce), rails running
into darkness, catenary masts, utility poles and wires, a sodium street lamp with a fake light cone,
houses with a few warm windows, trees, a deep navy sky with a moon and a procedural star field.

Lighting trick (see _shared.toon_rgb_split): the moon is a WHITE sun lamp, the crossing lamps are
PURE RED point lights and the street lamp is a PURE BLUE spot.  One Shader-to-RGB then gives three
independent light layers (G = moon, R-G = red spill, B-G = sodium pool), each posterised into its
own cel bands, all with real cast shadows.

Camera: low orbit around the crossing (f1-~97), then with the riser (150 s) it cranes up and looks
down on the whole crossing, and from the 152.63 downbeat it tilts up into the stars while spinning;
the last 10 frames (f211-220) blow out to white (compositor exposure + bloom) to cut into the bridge.

This is the 残光 example shot: its choreography assumes the window [--t0, --t1] holds four downbeats (two arm
landings, a riser 2.85 s in, a tilt on the last downbeat). Re-time it to another song with --t0 / --t1 (song
seconds, from audio.json), or copy it as the starting point of a new shot.

Run (from the project root; tools/blender_run.py finds Blender via env BLENDER / PATH / install dirs):
  python tools/blender_run.py blender/shots/shotB_crossing.py -- --mode preview --res 50 --step 6
  python tools/blender_run.py blender/shots/shotB_crossing.py -- --mode full
  (or by hand: blender -b --factory-startup -P blender/shots/shotB_crossing.py -- --mode preview ...)
Options: --mode preview|full|stills|none  --res 100  --step 6  --start 1 --end <last frame>  --frames a,b,c
         --t0 147.15 --t1 154.46 (song time window)  --out <dir> (default <ROOT>/blender/renders/B)
         --samples 16  --save_blend 0|1  --lines 1
Output: <out>/f_0001.jpg ... f_0220.jpg (JPEG q95, 1920x1080), timings -> <out>/timings.jsonl
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
import bmesh
from mathutils import Vector, Euler, Matrix, Quaternion

A = bc.parse_args({"mode": "preview", "res": 50, "step": 6, "start": 1, "end": 0, "frames": "",
                   "out": os.path.join(ROOT, "blender", "renders", "B"), "samples": 16, "save_blend": 0,
                   "lines": 1, "tag": "", "t0": 147.15, "t1": 154.46}, doc=__doc__)
OUT = A["out"]
os.makedirs(OUT, exist_ok=True)
T0, T1 = A["t0"], A["t1"]
NF = int(math.ceil((T1 - T0) * 30 - 1e-6))          # 220 frames (frame 220 = 154.43 s)
if A["end"] <= 0:
    A["end"] = NF
random.seed(44)

BEATS = sh.beats_in(T0, T1 - 0.05, "beats")          # 16 beats 147.15 ... 154.01
DOWN = sh.beats_in(T0, T1 - 0.05, "downbeats")       # 147.15 148.98 150.80 152.63
F_BEATS = [sh.frame_of(t, T0) for t in BEATS]
F_DOWN = [sh.frame_of(t, T0) for t in DOWN]
F_ARM_A, F_ARM_B = F_DOWN[1], F_DOWN[2]               # 148.98 -> 56, 150.80 -> 111
F_RISER = sh.frame_of(T0 + (150.0 - 147.15), T0)      # 150.0 -> 87 (riser 2.85 s into the shot)
F_TILT = F_DOWN[3]                                    # 152.63 -> 166: look up into the stars
F_WHITE = NF - 9                                      # 211..220 blow out to white
print("B beats", F_BEATS, "down", F_DOWN, "NF", NF)

# ------------------------------------------------------------------ palette (night, P4 blue + P3 lamps)
P = {
    "sky": [(0.00, "#34467e"), (0.03, "#26346a"), (0.10, "#1a2656"), (0.25, "#121b44"),
            (0.50, "#0c1334"), (0.80, "#080d26"), (1.00, "#060a1e")],
    "line": "#0a0f24",
    "haze": "#0e1634",
    "red": "#ff2c2a",
    "sodium": "#ffcf8a",
    "asphalt": ("#56608a", "#262c4c", "#171b34"),
    "concrete": ("#7a86ac", "#353e62", "#222846"),
    "ballast": ("#4c5474", "#242944", "#161a2e"),
    "rail": ("#c6d0ee", "#4a5276", "#262a46"),
    "sleeper": ("#5a5064", "#2a2636", "#18161f"),
    "pole": ("#8e98b8", "#3a4262", "#222842"),
    "yellow": ("#f2c43e", "#8a6e2c", "#3e3220"),
    "black": ("#3c3c4c", "#17171f", "#0c0c12"),
    "wall": [("#6070a0", "#2c355c", "#1a2042"), ("#6a6e98", "#303458", "#1c1e3c"),
             ("#58749a", "#26385a", "#16223e")],
    "roof": ("#40507a", "#1e2648", "#10142e"),
    "tree": ("#2e4a5c", "#162632", "#0c151e"),
    "fence": ("#7c86a6", "#343a5a", "#20243e"),
    "grass": ("#2e4052", "#18222e", "#10161f"),
}
MOON_DIR = Vector((-0.45, 0.62, 0.64)).normalized()
FILL_DIR = Vector((0.4, -0.8, 0.5)).normalized()
COL_MAIN = COL_NOL = None


def mat(name, trip, red=True, sodium=True, rim=None, haze=True, **kw):
    return sh.toon_rgb_split(name, trip, red=P["red"] if red else None, sodium=P["sodium"] if sodium else None,
                             rim=rim, rim_dir=tuple(MOON_DIR), haze=P["haze"] if haze else None,
                             haze_range=kw.pop("haze_range", (25.0, 170.0)), haze_max=kw.pop("haze_max", 0.92),
                             red_at=(0.012, 0.09), red_gain=(0.55, 1.0), sodium_at=(0.02, 0.12),
                             sodium_gain=(0.35, 0.8), **kw)


def join_rot(name, parts, coll=None, material=None):
    """parts: [(size, loc, euler_xyz)] -> one mesh (full rotations, unlike bc.join_boxes)."""
    bm = bmesh.new()
    for size, loc, rot in parts:
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        M = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1))
        bmesh.ops.transform(tmp, matrix=M, verts=tmp.verts)
        me = bpy.data.meshes.new("_t")
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    return bc.mesh_object(name, bm, coll or COL_MAIN, material)


def cone(name, r0, r1, h, loc, rot=(0, 0, 0), coll=None, material=None, segs=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h * 0.5), verts=bm.verts)
    ob = bc.mesh_object(name, bm, coll or COL_NOL, material)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


# ------------------------------------------------------------------ crossing hardware
LAMP_SOCKETS = {"L": [], "R": []}
RED_LIGHTS = {"L": [], "R": []}
ARM_REFL = {"L": [], "R": []}


def signal_post(name, x, y, face_sign, m_yel, m_blk, m_pole):
    """Japanese crossing signal: striped pole, crossbuck, double-faced lamp pair (L/R), bell box.
    The lamp housings sit at y-0.38 (L) and y+0.38 (R) and have lenses on both X faces."""
    parts_y, parts_b = [], []
    # striped pole (0.11 m radius approximated by a square post for crisp toon edges)
    h = 4.3
    n = 14
    for i in range(n):
        seg = (0.2, 0.2, h / n)
        (parts_y if i % 2 == 0 else parts_b).append((seg, (x, y, i * h / n), (0, 0, 0)))
    # crossbuck (X) at the top: two striped boards crossed, facing +/-X
    L = 1.5
    for ang in (math.radians(35), math.radians(-35)):
        for k in range(6):
            t = (k - 2.5) / 6.0 * L
            cz = h + 0.35 + math.cos(ang) * t
            cy = y + math.sin(ang) * t
            (parts_y if k % 2 == 0 else parts_b).append(((0.05, 0.26, L / 6.0 + 0.002), (x, cy, cz), (ang, 0, 0)))
    bc.join_boxes  # (placeholder to keep API parity)
    join_rot(name + "_yel", parts_y, material=m_yel)
    join_rot(name + "_blk", parts_b, material=m_blk)
    # lamp bar + housings + visors
    zb = 2.85
    hw = []
    hw.append(((0.12, 1.25, 0.1), (x, y, zb), (0, 0, 0)))
    for side, dy in (("L", -0.4), ("R", 0.4)):
        hw.append(((0.36, 0.5, 0.5), (x, y + dy, zb), (0, 0, 0)))
        for fx in (-1, 1):
            # visor (hood) above each lens
            hw.append(((0.28, 0.52, 0.05), (x + fx * 0.3, y + dy, zb + 0.26), (0, fx * math.radians(-18), 0)))
    # bell / speaker box
    hw.append(((0.3, 0.34, 0.34), (x, y, zb + 0.75), (0, 0, 0)))
    # direction indicator board (blank, black) below the lamps
    hw.append(((0.08, 0.7, 0.28), (x, y, zb - 0.62), (0, 0, 0)))
    join_rot(name + "_hw", hw, material=m_blk)
    # lenses: discs on both faces, emissive with keyable factor
    for side, dy in (("L", -0.4), ("R", 0.4)):
        m_on, fac = LAMP_MATS[side]
        for fx in (-1, 1):
            c = bc.cylinder(name + "_lens" + side, radius=0.17, depth=0.03, verts=20,
                            loc=(x + fx * 0.19, y + dy, zb), rot=(0, math.pi / 2, 0), coll=COL_NOL,
                            mat=m_on, origin="CENTER")
            for p in c.data.polygons:
                p.use_smooth = False
            # red spill light just in front of the lens
            ld = bpy.data.lights.new(name + "_red" + side, "POINT")
            ld.color = (1.0, 0.0, 0.0)
            ld.energy = 0.0
            ld.shadow_soft_size = 0.12
            ld.use_shadow = True
            ob = bpy.data.objects.new(name + "_red" + side, ld)
            ob.location = (x + fx * 0.45, y + dy, zb)
            bpy.context.scene.collection.objects.link(ob)
            RED_LIGHTS[side].append(ob)
    # base cabinet (striped)
    cab = [((0.55, 0.5, 1.1), (x + face_sign * 0.1, y - 0.55 * face_sign, 0.0), (0, 0, 0))]
    join_rot(name + "_cab", cab, material=m_yel)
    return (x, y)


def barrier(name, px, py, direction, length, m_yel, m_blk, m_mach):
    """Barrier machine + striped arm.  The arm lies along +Y*direction from the pivot when DOWN.
    Returns the pivot empty (rotate about X; up = +/-82 deg)."""
    # machine box with slanted stripes
    mach = [((0.6, 0.7, 1.15), (px, py, 0.0), (0, 0, 0))]
    join_rot(name + "_mach", mach, material=m_mach)
    stripes = []
    for k in range(4):
        stripes.append(((0.62, 0.1, 0.5), (px, py - 0.18 + k * 0.12, 0.35 + k * 0.18), (math.radians(40), 0, 0)))
    join_rot(name + "_machstripe", stripes, material=m_blk)
    piv = bc.empty(name + "_pivot", (px + 0.36, py, 1.0), coll=COL_MAIN)
    # arm segments in pivot-local coords (built in world then parented)
    n = 14
    seg = length / n
    py_parts, pb_parts = [], []
    for i in range(n):
        cy = py + direction * (0.15 + seg * (i + 0.5))
        (py_parts if i % 2 == 0 else pb_parts).append(((0.09, seg + 0.002, 0.11), (px + 0.36, cy, 1.0), (0, 0, 0)))
    ay = join_rot(name + "_armY", py_parts, material=m_yel)
    ab = join_rot(name + "_armB", pb_parts, material=m_blk)
    # counterweight
    cw = join_rot(name + "_cw", [((0.2, 0.5, 0.3), (px + 0.36, py - direction * 0.45, 1.0), (0, 0, 0))],
                  material=m_blk)
    for o in (ay, ab, cw):
        parent_keep(o, piv)
    # two red reflector lamps on the arm (blink with the crossing lamps)
    for side, frac in (("L", 0.36), ("R", 0.72)):
        m_on, fac = ARM_MATS[side]
        for fx in (-1, 1):
            c = bc.cylinder(name + "_refl" + side, radius=0.075, depth=0.02, verts=12,
                            loc=(px + 0.36 + fx * 0.056, py + direction * length * frac, 1.0),
                            rot=(0, math.pi / 2, 0), coll=COL_NOL, mat=m_on, origin="CENTER")
            parent_keep(c, piv)
    return piv


# ------------------------------------------------------------------ environment
def build_world():
    global COL_MAIN, COL_NOL
    COL_MAIN = bc.collection("Main")
    COL_NOL = bc.collection("NoLines")
    m_asph = mat("M_asph", P["asphalt"])
    m_conc = mat("M_conc", P["concrete"])
    m_ball = mat("M_ball", P["ballast"])
    m_rail = mat("M_rail", P["rail"], rim="#e8eeff", rim_width=0.3, rim_at=0.55)
    m_slp = mat("M_slp", P["sleeper"])
    m_pole = mat("M_pole", P["pole"], rim="#c8d4f4")
    m_yel = mat("M_yel", P["yellow"], rim="#fff0b0", haze_range=(30, 200))
    m_blk = mat("M_blk", P["black"], haze_range=(30, 200))
    m_fence = mat("M_fence", P["fence"])
    m_grass = mat("M_grass", P["grass"])
    m_roof = mat("M_roof", P["roof"], rim="#9aa8d8")
    m_walls = [mat("M_wall%d" % i, t, rim="#aab8e8") for i, t in enumerate(P["wall"])]
    m_tree = mat("M_tree", P["tree"], rim="#6f8fb0")
    m_win = bc.emission_material("M_win", "#ffc978", strength=1.9)
    m_wire = bc.flat_material("M_wire", "#070a18", haze=P["haze"], haze_range=(30, 200), haze_max=0.7)

    # ground, road, crossing deck
    g = bc.plane("Grass", size=(900, 900), loc=(0, 0, -0.03), coll=COL_MAIN, mat=m_grass)
    road = bc.plane("Road", size=(600, 6.6), loc=(0, 0, 0.0), coll=COL_MAIN, mat=m_asph)
    for sx in (-1, 1):
        # sidewalk strips (curb) along the road, interrupted over the track bed
        for x0, x1 in ((-300, -4.4), (4.4, 300)):
            bc.box("Curb", size=(x1 - x0, 0.9, 0.12), loc=((x0 + x1) * 0.5, sx * 3.75, 0.0), coll=COL_MAIN,
                   mat=m_conc)
    deck = bc.box("Deck", size=(8.6, 6.6, 0.1), loc=(0, 0, 0.0), coll=COL_MAIN, mat=m_conc)
    # road markings (stop lines + edge lines), flat
    mk = []
    for sx in (-1, 1):
        mk.append(((0.35, 2.9, 0.02), (sx * 7.4, -sx * 1.55, 0.005), 0.0))
        mk.append(((290.0, 0.12, 0.02), (sx * 150.0, 3.05, 0.005), 0.0))
        mk.append(((290.0, 0.12, 0.02), (sx * 150.0, -3.05, 0.005), 0.0))
    bc.join_boxes("Marks", mk, coll=COL_NOL, mat=bc.flat_material("M_mark", "#8a94b8", haze=P["haze"],
                                                                   haze_range=(20, 150), haze_max=0.9))
    # track bed + rails + sleepers (2 tracks, gauge 1.067)
    for tx in (-2.05, 2.05):
        for y0, y1 in ((-420, -3.3), (3.3, 420)):
            bc.box("Bed", size=(3.4, y1 - y0, 0.28), loc=(tx, (y0 + y1) * 0.5, -0.05), coll=COL_MAIN, mat=m_ball)
    rails, rail_tops = [], []
    for tx in (-2.05, 2.05):
        for rx in (-0.5335, 0.5335):
            rails.append(((0.07, 840.0, 0.16), (tx + rx, 0.0, 0.2), 0.0))
            rail_tops.append(((0.075, 840.0, 0.012), (tx + rx, 0.0, 0.36), 0.0))
    bc.join_boxes("Rails", rails, coll=COL_MAIN, mat=m_rail)
    # moonlit rail tops: a thin bright strip that fades into the dark (the 'rails into darkness' lines)
    bc.join_boxes("RailTops", rail_tops, coll=COL_NOL,
                  mat=bc.flat_material("M_railtop", "#aebcec", strength=1.0, haze=P["haze"],
                                       haze_range=(8.0, 190.0), haze_max=1.0))
    slp = []
    for tx in (-2.05, 2.05):
        y = -150.0
        while y < 150.0:
            if abs(y) > 3.6:
                slp.append(((2.1, 0.22, 0.12), (tx, y, 0.12), 0.0))
            y += 0.62
    bc.join_boxes("Sleepers", slp, coll=COL_NOL, mat=m_slp)
    # track fences
    fp, fr = [], []
    for sx in (-1, 1):
        for sgn in (-1, 1):
            y = 7.0
            while y < 120:
                fp.append(((0.08, 0.08, 1.4), (sx * 4.7, sgn * y, 0.0), 0.0))
                y += 2.4
            for zz in (0.55, 1.25):
                fr.append(((0.04, 113.0, 0.05), (sx * 4.7, sgn * 63.5, zz), 0.0))
    bc.join_boxes("FencePosts", fp, coll=COL_MAIN, mat=m_fence)
    bc.join_boxes("FenceRails", fr, coll=COL_NOL, mat=m_fence)

    # catenary masts + contact wires
    masts, beams = [], []
    wires = []
    for y in (-96.0, -52.0, -12.0, 30.0, 74.0, 118.0, 162.0, -140.0):
        for sx in (-1, 1):
            masts.append(((0.28, 0.28, 7.6), (sx * 4.3, y, 0.0), 0.0))
        beams.append(((9.0, 0.25, 0.35), (0.0, y, 7.2), 0.0))
        beams.append(((9.0, 0.18, 0.2), (0.0, y, 6.3), 0.0))
    bc.join_boxes("Masts", masts, coll=COL_MAIN, mat=m_pole)
    bc.join_boxes("Beams", beams, coll=COL_MAIN, mat=m_pole)
    for tx in (-2.05, 2.05):
        wires.append([Vector((tx, -420, 5.35)), Vector((tx, 420, 5.35))])
        pts = []
        ys = sorted((-140.0, -96.0, -52.0, -12.0, 30.0, 74.0, 118.0, 162.0))
        for a, b in zip(ys[:-1], ys[1:]):
            pts += bc.catenary((tx, a, 6.3), (tx, b, 6.3), sag=0.55, n=10)[:-1]
        wires.append(pts)

    # utility poles along the road (south side) and along the track (east side) + wires
    upoles = [(-46.0, -6.2), (-24.0, -6.2), (-8.6, -6.2), (13.0, -6.2), (35.0, -6.2), (57.0, -6.2),
              (7.8, 18.0), (7.8, 42.0), (7.8, 66.0), (7.8, 90.0), (-7.8, -22.0), (-7.8, -48.0), (-7.8, -74.0)]
    for i, (x, y) in enumerate(upoles):
        bc.cylinder("UPole", radius=0.15, depth=9.8, verts=10, loc=(x, y, 0), coll=COL_MAIN, mat=m_pole)
        along_road = abs(y + 6.2) < 0.1
        arm = (1.9, 0.12, 0.12) if along_road else (0.12, 1.9, 0.12)
        bc.box("UArm", size=arm, loc=(x, y, 8.9), coll=COL_MAIN, mat=m_pole)
        bc.box("UArm2", size=(arm[0] * 0.7, arm[1] * 0.7, 0.1), loc=(x, y, 7.9), coll=COL_MAIN, mat=m_pole)
        if i % 3 == 0:
            bc.cylinder("Trans", radius=0.3, depth=0.95, verts=10, loc=(x + 0.35, y, 6.0), coll=COL_MAIN, mat=m_pole)
    road_p = [p for p in upoles if abs(p[1] + 6.2) < 0.1]
    for a, b in zip(road_p[:-1], road_p[1:]):
        for off, z in ((-0.8, 8.95), (0.0, 8.95), (0.8, 8.95), (-0.5, 7.95), (0.5, 7.95)):
            wires.append(bc.catenary((a[0], a[1] + off, z), (b[0], b[1] + off, z), sag=random.uniform(0.35, 0.6), n=16))
    for grp in ([p for p in upoles if p[0] > 7], [p for p in upoles if p[0] < -7]):
        grp = sorted(grp, key=lambda p: p[1])
        for a, b in zip(grp[:-1], grp[1:]):
            for off, z in ((-0.8, 8.95), (0.0, 8.95), (0.8, 8.95)):
                wires.append(bc.catenary((a[0] + off, a[1], z), (b[0] + off, b[1], z), sag=0.5, n=16))
    # a couple of drop wires across the road to the houses
    wires.append(bc.catenary((13.0, -6.2, 7.95), (15.5, 9.0, 5.2), sag=0.4, n=12))
    wires.append(bc.catenary((-8.6, -6.2, 7.95), (-14.0, 10.5, 5.0), sag=0.5, n=12))
    bc.polyline("Wires", wires, bevel=0.018, coll=COL_NOL, mat=m_wire)

    # street lamp (sodium) on the NE corner: curved arm over the road
    lx, ly = 9.4, 4.6
    bc.cylinder("LampPole", radius=0.09, depth=6.2, verts=10, loc=(lx, ly, 0), coll=COL_MAIN, mat=m_pole)
    arc = []
    for k in range(7):
        a0 = k / 6.0 * math.pi * 0.5
        arc.append(((0.12, 0.3, 0.12), (lx, ly - math.sin(a0) * 0.9, 6.2 + (1 - math.cos(a0)) * 0.0 + math.sin(a0) * 0.0 + (k * 0.04)),
                    (-a0, 0, 0)))
    join_rot("LampArc", arc, material=m_pole)
    head = (lx, ly - 1.25, 6.35)
    bc.box("LampHead", size=(0.32, 0.7, 0.14), loc=head, coll=COL_MAIN, mat=m_pole)
    bc.box("LampLens", size=(0.26, 0.6, 0.03), loc=(head[0], head[1], head[2] - 0.02), coll=COL_NOL,
           mat=bc.emission_material("M_lamplens", "#fff1cf", strength=7.0))
    sp = bpy.data.lights.new("Sodium", "SPOT")
    sp.color = (0.0, 0.0, 1.0)
    sp.energy = 900.0
    sp.spot_size = math.radians(95)
    sp.spot_blend = 0.35
    sp.shadow_soft_size = 0.1
    sp.use_shadow = True
    so = bpy.data.objects.new("Sodium", sp)
    so.location = (head[0], head[1], head[2] - 0.1)
    so.rotation_euler = (0, 0, 0)          # spot points down -Z
    bpy.context.scene.collection.objects.link(so)
    cone("LampCone", 2.6, 0.22, 6.2, (head[0], head[1], 0.05), coll=COL_NOL,
         material=sh.additive_cone_material("M_cone", "#ffd9a0", strength=0.55, falloff=1.4))

    # houses (gable roofs) with a few warm windows
    houses = [(-15.5, 12.0, 0.3), (-26.0, 16.0, -0.1), (-16.0, -15.0, 0.05), (18.0, 14.5, 0.2),
              (28.0, 11.0, -0.05), (17.5, -16.5, 0.15), (-36.0, -12.0, 0.0), (40.0, -14.0, 0.1),
              (-30.0, 36.0, 0.2), (26.0, 38.0, -0.2), (-14.0, 44.0, 0.1), (14.0, -44.0, -0.1),
              (-18.0, -40.0, 0.2), (46.0, 26.0, 0.0), (-50.0, 18.0, 0.1)]
    wins = []
    for i, (hx, hy, rz) in enumerate(houses):
        w, d, h = random.uniform(7, 10), random.uniform(6, 9), random.uniform(5.0, 6.8)
        bc.box("House", size=(w, d, h), loc=(hx, hy, 0), rot=(0, 0, rz), coll=COL_MAIN, mat=m_walls[i % 3])
        # gable roof = rotated box pair
        rp = []
        for s_ in (-1, 1):
            rp.append(((w + 0.6, d * 0.58, 0.18), (0, s_ * d * 0.25, h + d * 0.18), (s_ * math.radians(-32), 0, 0)))
        R = Matrix.Rotation(rz, 4, "Z")
        rp = [((sz), tuple(Vector((hx, hy, 0)) + (R @ Vector(lc))), (e[0], e[1], rz)) for sz, lc, e in rp]
        join_rot("Roof", rp, material=m_roof)
        # windows on the two long sides
        for s_ in (-1, 1):
            for k in range(2):
                if random.random() < 0.45:
                    lc = Vector(((k - 0.5) * w * 0.45, s_ * (d * 0.5 + 0.03), h * 0.55))
                    wins.append(((1.0, 0.06, 0.9), tuple(Vector((hx, hy, 0)) + (R @ lc)), rz))
    bc.join_boxes("Windows", wins, coll=COL_NOL, mat=m_win)
    # trees: dark clumps with moonlit rims
    for i, (tx, ty, s_) in enumerate([(-12.0, 6.5, 5.5), (-21.0, -7.0, 7.0), (12.5, -9.5, 6.0), (22.0, 7.0, 7.5),
                                      (-9.5, 20.0, 5.0), (10.5, 26.0, 6.5), (-34.0, 4.0, 9.0), (34.0, -4.0, 8.0),
                                      (-11.0, -28.0, 6.0), (11.0, 52.0, 7.0), (-12.0, 64.0, 8.0), (9.0, -60.0, 7.0)]):
        bc.cylinder("Trunk", radius=0.18, depth=s_ * 0.5, verts=8, loc=(tx, ty, 0), coll=COL_MAIN, mat=m_tree)
        bc.blob_cloud("Tree%d" % i, (tx, ty, s_ * 0.75), size=(s_ * 1.0, s_ * 0.9, s_ * 0.8), puffs=5, seed=100 + i,
                      coll=COL_MAIN, mat=m_tree, segments=12, rings=7)
    # far hills + far town lights
    hill_m = bc.flat_material("M_hill", "#0c1330")
    for i in range(10):
        a = i / 10 * math.tau + 0.3
        r = random.uniform(380, 520)
        bc.blob_cloud("Hill%d" % i, (math.cos(a) * r, math.sin(a) * r, -30), size=(random.uniform(260, 420), 200,
                      random.uniform(90, 150)), puffs=5, seed=200 + i, coll=COL_NOL, mat=hill_m, segments=16, rings=8)
    lights = []
    for i in range(140):
        a = random.uniform(0, math.tau)
        r = random.uniform(150, 330)
        lights.append(((1.2, 1.2, 0.8), (math.cos(a) * r, math.sin(a) * r, random.uniform(0.5, 6.0)), 0.0))
    bc.join_boxes("TownLights", lights, coll=COL_NOL, mat=bc.emission_material("M_townlight", "#ffb866", strength=1.6))
    # night clouds (dark, moonlit rims)
    cm = bc.toon_material("M_ncloud", lit="#5a6aa0", shade="#1c2650", dark="#131a3c", shade_at=0.35,
                          dark_at=0.05, rim="#9aaade", rim_width=0.3, rim_at=0.6, rim_dir=tuple(MOON_DIR),
                          mode="fake", light_dir=tuple(MOON_DIR), haze="#0e1638", haze_range=(200, 900), haze_max=0.5)
    for i, (cx, cy, cz, w) in enumerate([(-220, 320, 150, 190), (180, 400, 200, 240), (380, -120, 170, 200),
                                         (-360, -260, 220, 260), (60, -420, 160, 180), (-120, 120, 300, 160),
                                         (140, -80, 330, 200)]):
        bc.blob_cloud("NCloud%d" % i, (cx, cy, cz), size=(w, w * 0.4, w * 0.2), puffs=6, seed=300 + i,
                      coll=COL_NOL, mat=cm)
    return dict(m_yel=m_yel, m_blk=m_blk, m_pole=m_pole)


LAMP_MATS = {}
ARM_MATS = {}


def build():
    sc = bc.reset_scene()
    bc.setup_render("EEVEE", res=(1920, 1080), percent=A["res"], fps=30, samples=A["samples"],
                    transparent=False, view="Standard", shadow_pool="1024")
    sc.frame_start, sc.frame_end = 1, NF
    sky = sh.sky_world(P["sky"], P["sky"], z_lo=-0.02, z_hi=1.0, sun_dir=None, ambient="#2a2a2a",
                       ambient_strength=0.35, below="#0a0f24", star_color="#eef2ff",
                       star_scale=(20.0, 52.0), star_keep=(0.80, 0.70), star_radius=(0.09, 0.065),
                       star_strength=(5.0, 2.0), star_z=(0.02, 0.22), star_fade=1.0,
                       moon_dir=tuple(MOON_DIR), moon_color="#eef4ff", moon_size_deg=3.2, moon_strength=2.6,
                       moon_glow="#3a5aa0", moon_glow_power=1.2, moon_glow_strength=0.5)
    for side in ("L", "R"):
        LAMP_MATS[side] = sh.glow_mix_material("M_lamp" + side, "#3a0a10", P["red"], strength_on=14.0)
        ARM_MATS[side] = sh.glow_mix_material("M_armrefl" + side, "#4a1014", P["red"], strength_on=6.0)
    ms = build_world()
    # signal posts: A on the SW corner (faces west traffic), B on the NE corner
    signal_post("PostA", -6.0, -4.3, 1, ms["m_yel"], ms["m_blk"], ms["m_pole"])
    signal_post("PostB", 6.0, 4.3, -1, ms["m_yel"], ms["m_blk"], ms["m_pole"])
    m_mach = ms["m_yel"]
    pivA = barrier("ArmA", -5.3, -4.3, 1, 6.6, ms["m_yel"], ms["m_blk"], m_mach)
    pivB = barrier("ArmB", 5.3, 4.3, -1, 6.6, ms["m_yel"], ms["m_blk"], m_mach)
    animate_arm(pivA, +1, F_ARM_A)
    animate_arm(pivB, -1, F_ARM_B)
    animate_lamps()
    # moon (white key) + cool fill
    s = bc.sun("Moon", direction=tuple(MOON_DIR), color="#ffffff", strength=math.pi * 0.9, angle_deg=0.0,
               filter_radius=0.15)
    s.data.shadow_maximum_resolution = 0.001
    sc.eevee.shadow_step_count = 6
    sc.eevee.shadow_ray_count = 1
    bc.sun("Fill", direction=tuple(FILL_DIR), color="#ffffff", strength=math.pi * 0.09, angle_deg=5.0, shadow=False)
    # lines
    if A["lines"]:
        COL_NOL.lineart_usage = "EXCLUDE"
        for nm in ("Road", "Grass", "Deck"):
            bpy.data.objects[nm].lineart.usage = "OCCLUSION_ONLY"
        bc.gp_lineart("LineArt", source=None, radius=0.028, color=P["line"], crease_deg=120,
                      intersection=True, overshoot=0.0, noise=0.012, noise_step=2)
    cam = bc.camera("Cam", loc=(-12, -8, 1), target=(0, 0, 1), lens=24.0, clip=(0.05, 3000.0))
    sh.key_camera_frames(cam, camera_frames())
    comp = sh.compositor_with_grade(bloom=(1.0, 0.75, 0.75), bloom2=(2.5, 0.35, 1.0))
    # white-out: exposure + bloom ramp over the last 10 frames (+ riser pre-glow)
    sh.key_socket(comp["exposure"], [(1, 0.0), (F_TILT, 0.0), (F_WHITE - 1, 0.35), (F_WHITE + 3, 1.6),
                                     (F_WHITE + 6, 3.6), (NF, 7.0)])
    sh.key_socket(comp["bloom_strength"], [(1, 0.75), (F_WHITE - 1, 0.85), (NF, 2.0)])
    sh.set_id_interp(comp["tree"], "BEZIER")
    return sc


# ------------------------------------------------------------------ animation
def animate_arm(piv, direction, f_land):
    """Arm up (82 deg) until it starts to fall ~0.85 s before the downbeat; gravity ease-in; lands
    exactly on f_land; two damped bounces."""
    up = math.radians(82.0) * direction * -1.0      # rotate about X; sign so the arm tips upward
    f_start = f_land - 26
    for f in range(1, NF + 1):
        if f <= f_start:
            a = up
        elif f <= f_land:
            u = (f - f_start) / (f_land - f_start)
            a = up * (1.0 - sh.ease_in_cubic(u) * 0.35 - 0.65 * sh.ease_in_quad(u))
        else:
            d = f - f_land
            a = up * 0.06 * math.exp(-d / 3.2) * abs(math.sin(d * 0.95))
        piv.rotation_euler = (a, 0.0, 0.0)
        piv.keyframe_insert("rotation_euler", frame=f)
    for fc in bc.fcurves(piv):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"


def lamp_level(f, side):
    """Alternating crossing lamps: beat k even -> L on, odd -> R on.  Incandescent feel: 1-frame
    ramp up, slight sag while on, 2-frame tail when switching off."""
    t = sh.time_of(f, T0)
    k = None
    for i, bt in enumerate(BEATS):
        if bt <= t + 1e-6:
            k = i
    if k is None:
        return 0.0
    mine = (k % 2 == 0) == (side == "L")
    since = t - BEATS[k]
    if mine:
        return min(1.0, 0.55 + since * 30 * 0.45) * (1.0 - 0.18 * min(since / 0.46, 1.0))
    # just switched off: short tail
    return max(0.0, 0.45 - since * 30 * 0.22)


def animate_lamps():
    for side in ("L", "R"):
        m, fac = LAMP_MATS[side]
        ma, faca = ARM_MATS[side]
        for f in range(1, NF + 1):
            v = lamp_level(f, side)
            sh.key_socket(fac, [(f, v)])
            sh.key_socket(faca, [(f, v)])
            for ob in RED_LIGHTS[side]:
                ob.data.energy = 190.0 * v
                ob.data.keyframe_insert("energy", frame=f)
        for idb in [m.node_tree, ma.node_tree] + [ob.data for ob in RED_LIGHTS[side]]:
            sh.set_id_interp(idb, "LINEAR")


def catmull3(keys, f):
    """keys: [(frame, Vector)], Catmull-Rom (non-uniform tangents)."""
    if f <= keys[0][0]:
        return keys[0][1].copy()
    if f >= keys[-1][0]:
        return keys[-1][1].copy()
    for i in range(len(keys) - 1):
        if keys[i][0] <= f <= keys[i + 1][0]:
            break
    p0 = keys[max(i - 1, 0)]
    p1, p2 = keys[i], keys[i + 1]
    p3 = keys[min(i + 2, len(keys) - 1)]
    h = p2[0] - p1[0]
    t = (f - p1[0]) / h
    m1 = (p2[1] - p0[1]) / max(p2[0] - p0[0], 1e-6) * h
    m2 = (p3[1] - p1[1]) / max(p3[0] - p1[0], 1e-6) * h
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2


V = Vector
CAM_KEYS = [
    (1, V((-13.5, -9.8, 0.85))),
    (28, V((-14.6, -3.6, 0.95))),
    (F_ARM_A, V((-13.2, 3.6, 1.05))),
    (78, V((-7.5, 11.5, 1.15))),
    (F_RISER, V((-2.5, 14.0, 1.3))),
    (F_ARM_B, V((5.5, 14.5, 3.6))),
    (140, V((13.5, 8.5, 13.0))),
    (F_TILT, V((12.0, -6.0, 30.0))),
    (195, V((4.0, -14.0, 52.0))),
    (NF, V((-4.0, -12.0, 68.0))),
]
TGT_KEYS = [
    (1, V((-6.0, -4.3, 2.55))),
    (28, V((-5.6, -3.2, 2.1))),
    (F_ARM_A, V((-4.6, -1.4, 1.35))),
    (78, V((-1.2, -2.0, 1.4))),
    (F_RISER, V((1.2, -1.0, 1.5))),
    (F_ARM_B, V((4.4, 1.0, 1.2))),
    (140, V((1.0, 0.5, 0.6))),
    (F_TILT, V((0.0, 0.0, 0.5))),
]


def camera_frames():
    frames = []
    for f in range(1, NF + 1):
        pos = catmull3(CAM_KEYS, f)
        tgt = catmull3(TGT_KEYS, f)
        d_look = (tgt - pos).normalized()
        # tilt up into the stars from the 152.63 downbeat: slerp the view direction to a sky
        # direction whose azimuth keeps turning (the spin), with an accelerating roll
        c = sh.ease_in_out_cubic((f - F_TILT) / (NF - 4 - F_TILT))
        az = math.atan2(d_look.x, d_look.y) + math.radians(55.0) * sh.ease_in_out_sine((f - F_TILT) / (NF - F_TILT))
        el = math.radians(72.0)
        d_sky = V((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
        if c > 0:
            q0 = d_look.to_track_quat("-Z", "Y")
            q1 = d_sky.to_track_quat("-Z", "Y")
            fwd = (q0.slerp(q1, c) @ V((0, 0, -1))).normalized()
        else:
            fwd = d_look
        roll = math.radians(-4.0) * math.sin(f / NF * math.pi)                       # gentle orbit lean
        roll += math.radians(38.0) * sh.ease_in_cubic((f - F_TILT) / (NF - F_TILT))   # spin into the white
        # lens: 24 low orbit -> 20 during the crane
        lens = 24.0 - 4.0 * sh.ease_in_out_sine((f - F_RISER) / (F_TILT - F_RISER))
        # downbeat nudges (arm landings): tiny push-in via lens
        for fd in (F_ARM_A, F_ARM_B):
            if f >= fd:
                lens += 1.6 * math.exp(-(f - fd) / 5.0)
        # micro shake on the arm landings
        amp = sum(math.exp(-(f - fd) / 3.5) for fd in (F_ARM_A, F_ARM_B) if f >= fd)
        pos = pos + V((0.0, 0.0, 0.03 * amp * math.sin(f * 3.3)))
        frames.append({"f": f, "loc": tuple(pos), "fwd": tuple(fwd), "roll": roll, "lens": lens})
    return frames


def main():
    t0 = time.perf_counter()
    sc = build()
    build_s = round(time.perf_counter() - t0, 2)
    print("BUILD", build_s)
    log = os.path.join(OUT, "timings.jsonl")
    if A["save_blend"]:
        bc.save_blend(os.path.join(OUT, "shotB.blend"))
    sh.set_jpeg_output(os.path.join(OUT, "f_####"), quality=95)
    mode = A["mode"]
    if mode == "none":
        return
    if mode == "stills" and A["frames"]:
        frames = [int(x) for x in str(A["frames"]).split(",") if x.strip()]
    elif mode == "preview":
        frames = list(range(A["start"], A["end"] + 1, A["step"]))
        if NF not in frames and A["end"] >= NF:
            frames.append(NF)
    else:
        frames = list(range(A["start"], A["end"] + 1))
    if mode == "full":
        r = bc.render_sequence(os.path.join(OUT, "f_####"), A["start"], A["end"])
        r.update({"shot": "B", "mode": "full", "res": A["res"], "build_s": build_s, "tag": A["tag"]})
        r.pop("per_frame", None)
        bc.log_json(log, r)
        print("TIMING", r)
    else:
        pf = sh.render_frames(os.path.join(OUT, "f_####"), frames, timing_log=log,
                              tag="B_%s_%s_res%d" % (mode, A["tag"], A["res"]))
        print("TIMING mean", sum(pf) / max(len(pf), 1))


main()
