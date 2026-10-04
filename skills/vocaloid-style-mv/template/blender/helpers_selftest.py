r"""
helpers_selftest.py - exercises the blender_common helpers that probe_scene.py does not use:
follow-path camera, Freestyle-as-render-pass (line-only PNG), object instancing, vertical
(tategaki) text, transparent film, Cycles CUDA vs OptiX.

Run (from the project root):
  python tools/blender_run.py blender/helpers_selftest.py -- --engine EEVEE --device OPTIX
  blender -b --factory-startup -P blender/helpers_selftest.py -- --engine CYCLES --device CUDA
Options: --engine EEVEE|CYCLES  --device OPTIX|CUDA (Cycles)  --frames 12  --res 50 (percent)
         --out <dir> (default <ROOT>/blender/_probe/selftest)
Outputs: <out>/<engine>_<device>_beauty_####.png + pass PNGs; timings appended to <out>/../timings.jsonl
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import sys, os, math, time

_ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
if "-h" in _ARGS or "--help" in _ARGS:          # also works in plain python (before bpy is needed)
    print(__doc__)
    sys.exit(0)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # blender/ is one level below the root
sys.path.insert(0, os.path.join(ROOT, "tools"))
import blender_common as bc

A = bc.parse_args({"engine": "EEVEE", "device": "OPTIX", "out": os.path.join(ROOT, "blender", "_probe", "selftest"),
                   "frames": 12, "res": 50}, doc=__doc__)
os.makedirs(A["out"], exist_ok=True)
eng = A["engine"].upper()
mode = "shader_to_rgb" if eng == "EEVEE" else "fake"

bc.reset_scene()
bc.setup_render(eng, res=(1920, 1080), percent=A["res"], samples=16, transparent=True,
                view="Standard", cycles_device=A["device"])
bc.world_sky(ambient="#4a3a6a", ambient_strength=0.3)
L = (-0.6, -0.4, 0.7)
mat = bc.toon_material("M_t", lit="#fff3e6", shade="#ff8fb0", dark="#8a3a7a", rim="#ffe6a0",
                       mode=mode, light_dir=L, fill_dir=(0.3, -1, 0.5), fill=0.1, ambient=0.015)
side = bc.toon_material("M_s", lit="#ffb070", shade="#d0406e", dark="#5a2050", mode=mode,
                        light_dir=L, fill_dir=(0.3, -1, 0.5), fill=0.1, ambient=0.015)
# vertical 3D text 「残光」 (tategaki: one glyph per line)
t = bc.jp_text("残光", font="gothic_black", height=4.0, extrude=0.08, bevel_depth=0.005,
               vertical=True, line_spacing=0.95, loc=(0, 0, 0), mat=mat, side_mat=side,
               name="Tate")
bc.bpy.context.view_layer.update()
zmin = min((t.matrix_world @ v.co).z for v in t.data.vertices)
t.location.z -= zmin
# ring of instanced cubes around it (object-source GN instancing)
cube = bc.box("CubeSrc", size=(0.5, 0.5, 0.5), origin="CENTER", mat=side)
bc.hide_source(cube)
pts, rots = [], []
for i in range(48):
    a = i / 48 * math.tau
    pts.append((math.cos(a) * 4.0, math.sin(a) * 4.0, 0.4 + 1.5 * math.sin(a * 3) + 1.5))
    rots.append((a, a * 0.5, 0.0))
bc.instance_on_points("Ring", cube, pts, rots, [0.6] * len(pts))
bc.sun("Sun", direction=L, color="#ffffff", strength=math.pi)
bc.sun("Fill", direction=(0.3, -1, 0.5), color="#ffffff", strength=math.pi * 0.1, shadow=False)
# follow-path orbit camera looking at the text
cam = bc.camera("Cam", loc=(0, -12, 3), target=None, lens=40)
tgt = bc.empty("Tgt", (0, 0, 2.0))
path_pts = [(-9, -9, 2.0), (-3, -12.5, 2.8), (4, -11.5, 3.5), (9, -7, 4.0)]
bc.follow_path(cam, path_pts, 1, A["frames"], target=tgt, interp="BEZIER")
bc.set_dof(cam, focus=tgt, fstop=1.8)
# Freestyle as a separate pass -> combined stays line-free, lines go to the pass PNG
bc.freestyle_lines(thickness=2.0, color="#241638", crease_deg=120, as_pass=True)
bc.compositor()
bc.add_pass_outputs(A["out"], prefix=eng.lower(), mist=True, freestyle=True, alpha=False,
                    mist_range=(2.0, 30.0))
bc.set_png_output(os.path.join(A["out"], eng.lower() + "_beauty_####"), rgba=True)
r = bc.render_sequence(os.path.join(A["out"], "%s_%s_beauty_####" % (eng.lower(), A["device"].lower())),
                       1, A["frames"])
r.update({"engine": eng, "device": A["device"], "res_percent": A["res"], "test": "selftest"})
bc.log_json(os.path.join(os.path.dirname(A["out"]), "timings.jsonl"), r)
print("TIMING", r)
