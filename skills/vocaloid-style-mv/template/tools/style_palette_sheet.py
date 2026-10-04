#!/usr/bin/env python3
"""Palette system (shipped with the 残光 / Zankō dusk palettes P1-P5 as a starting point) — writes machine-readable
palettes, 256x1 gradient-map LUT PNGs and a visual contact sheet that applies every palette to a procedural dusk scene
(or, with --plate, to one of your own backgrounds: judge daylight palettes on a daylight plate).
Edit PALETTES below for a new song's colour script, then re-run.

Usage:
  python tools/style_palette_sheet.py [--sheet docs/style_palettes.png] [--plate assets/bg/<plate>.png]

Outputs (under the project root):
  assets/style/palettes.json          (roles, gradient stops, duotone pairs, contrast)
  assets/style/luts/<id>.png          (256x1 RGB gradient-map LUT, OKLab-interpolated)
  assets/style/luts/<id>_duo.png      (256x1 duotone LUT)
  assets/style/dusk_scene_gray.png    (the grey test scene; used by tools/preview_style_fx.mjs)
  docs/style_palettes.png             (contact sheet)
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
OUT_STYLE = os.path.join(ROOT, "assets", "style")
OUT_LUT = os.path.join(OUT_STYLE, "luts")
# label font for the contact sheet: project Noto Sans JP, else a system Japanese UI font
SHEET_FONTS = [os.path.join(ROOT, "engine", "fonts", "NotoSansJP_wght_.ttf"), "YuGothM.ttc", "meiryo.ttc",
               "ヒラギノ角ゴシック W3.ttc", "Hiragino Sans GB.ttc", "NotoSansCJK-Regular.ttc", "NotoSansCJKjp-Regular.otf",
               "NotoSansJP-Regular.otf", "DejaVuSans.ttf", "Arial.ttf", "arial.ttf"]

PALETTES = [
    {
        "id": "P1_oumagatoki", "name": "逢魔が時 Oumagatoki (magic hour)",
        "use": "main chorus / title / emotional peaks; the canonical 'afterglow' look",
        "roles": {"ink": "#140B1E", "shadow": "#3A1745", "dusk": "#7A2350", "vermilion": "#C8373A",
                  "sunset": "#F0663A", "glow": "#FFA552", "highlight": "#FFE3B0"},
        "gradmap": [[0.0, "#140B1E"], [0.22, "#3A1745"], [0.42, "#7A2350"], [0.58, "#C8373A"],
                    [0.72, "#F0663A"], [0.86, "#FFA552"], [1.0, "#FFE3B0"]],
        "duotone": ["#140B1E", "#FFA552"], "accent": "#C8373A", "afterimage": "#39C6E0",
    },
    {
        "id": "P2_zansho", "name": "残照 Zanshō (lingering glow vs. night)",
        "use": "verses, memory-vs-present split tone, blue sky above / orange horizon",
        "roles": {"night": "#0B1524", "steel": "#1E3552", "haze": "#3F6284", "mist": "#8FB2C9",
                  "cream": "#E9D9B8", "amber": "#F4A640", "ember": "#D8542A"},
        "gradmap": [[0.0, "#0B1524"], [0.25, "#1E3552"], [0.45, "#3F6284"], [0.60, "#D8542A"],
                    [0.80, "#F4A640"], [1.0, "#E9D9B8"]],
        "duotone": ["#0B1524", "#F4A640"], "accent": "#D8542A", "afterimage": "#2F7BD9",
    },
    {
        "id": "P3_fumikiri", "name": "踏切 Fumikiri (railway crossing alarm)",
        "use": "pre-chorus tension, bridge alarm, beat-strobe hits; graphic black/red/white + hazard yellow",
        "roles": {"black": "#0A0A0C", "asphalt": "#2A2F36", "signal": "#E5102E", "lamp": "#FF4B3A",
                  "caution": "#FFC21A", "white": "#F3F1EA"},
        "gradmap": [[0.0, "#0A0A0C"], [0.38, "#0A0A0C"], [0.40, "#E5102E"], [0.70, "#E5102E"],
                    [0.72, "#F3F1EA"], [1.0, "#F3F1EA"]],
        "duotone": ["#0A0A0C", "#E5102E"], "accent": "#FFC21A", "afterimage": "#00E0C8",
    },
    {
        "id": "P4_hotarubi", "name": "蛍火 Hotarubi (blue hour + fireflies)",
        "use": "quiet verse, breakdown, bridge-before-drop, outro embers; cold field + chartreuse glow",
        "roles": {"abyss": "#050F16", "bluehour": "#0C2233", "teal": "#17405A", "reed": "#2F6B6A",
                  "firefly": "#9BD86A", "glow": "#DDFF7A", "core": "#F6FFE0"},
        "gradmap": [[0.0, "#050F16"], [0.25, "#0C2233"], [0.45, "#17405A"], [0.62, "#2F6B6A"],
                    [0.82, "#9BD86A"], [0.93, "#DDFF7A"], [1.0, "#F6FFE0"]],
        "duotone": ["#050F16", "#DDFF7A"], "accent": "#DDFF7A", "afterimage": "#C04BD8",
    },
    {
        "id": "P5_taishoku", "name": "褪色 Taishoku (faded photograph / 走馬灯 memory)",
        "use": "flashbacks, 走馬灯 inserts, paper/diary scenes; low-saturation sepia with cyan/rose split tone",
        "roles": {"sepia": "#241C1A", "umber": "#4A3B35", "taupe": "#7D6A5E", "dustrose": "#B79C8B",
                  "parchment": "#D8C7AE", "paper": "#EFE6D6", "bleach_cyan": "#9CC2C0", "faded_rose": "#C98D86"},
        "gradmap": [[0.0, "#241C1A"], [0.20, "#4A3B35"], [0.45, "#7D6A5E"], [0.68, "#B79C8B"],
                    [0.85, "#D8C7AE"], [1.0, "#EFE6D6"]],
        "duotone": ["#241C1A", "#EFE6D6"], "accent": "#C98D86", "afterimage": "#6FA9A6",
        "split_tone": {"shadows": ["#9CC2C0", 0.15], "highlights": ["#C98D86", 0.10]},
    },
]
GLOBAL = {"flash_white": "#FFFFFF", "sumi": "#111014", "paper": "#F4EFE6"}


def hex2rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64) / 255.0


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def lin2oklab(c):
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    lms = np.cbrt(c @ M1.T)
    return lms @ M2.T


def oklab2lin(l):
    M2i = np.array([[1.0, 0.3963377774, 0.2158037573],
                    [1.0, -0.1055613458, -0.0638541728],
                    [1.0, -0.0894841775, -1.2914855480]])
    M1i = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                    [-1.2684380046, 2.6097574011, -0.3413193965],
                    [-0.0041960863, -0.7034186147, 1.7076147010]])
    lms = (l @ M2i.T) ** 3
    return lms @ M1i.T


def rel_lum(h):
    c = srgb2lin(hex2rgb(h))
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def contrast(a, b):
    la, lb = sorted((rel_lum(a), rel_lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def build_lut(stops, n=256):
    """OKLab-interpolated gradient map, returns (n,3) sRGB floats."""
    xs = np.array([s[0] for s in stops])
    labs = np.array([lin2oklab(srgb2lin(hex2rgb(s[1]))) for s in stops])
    t = np.linspace(0, 1, n)
    out = np.zeros((n, 3))
    for i, v in enumerate(t):
        j = np.searchsorted(xs, v, side='right') - 1
        j = int(np.clip(j, 0, len(xs) - 2))
        span = xs[j + 1] - xs[j]
        f = 0.0 if span <= 1e-9 else np.clip((v - xs[j]) / span, 0, 1)
        out[i] = labs[j] * (1 - f) + labs[j + 1] * f
    return lin2srgb(oklab2lin(out))


def dusk_scene(W=640, H=360, seed=7):
    """Procedural grayscale dusk: sky ramp, low sun, skyline, power lines, railway crossing, figure + long shadow."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:H, 0:W].astype(np.float64)
    hz = 0.70 * H
    sunx, suny, sunr = 0.70 * W, 0.64 * H, 0.055 * H
    sky = 0.10 + 0.55 * np.clip(y / hz, 0, 1) ** 1.6
    d = np.hypot((x - sunx) / W, (y - suny) / H * 0.6)
    sky += 0.45 * np.exp(-d / 0.12) + 0.25 * np.exp(-np.abs(y - hz) / (0.03 * H)) * np.exp(-np.abs(x - sunx) / (0.5 * W))
    sky = np.clip(sky, 0, 0.97)
    sky[np.hypot(x - sunx, y - suny) < sunr] = 1.0
    img = Image.fromarray((sky * 255).astype(np.uint8), 'L')
    dr = ImageDraw.Draw(img)
    # far skyline (lighter = atmospheric perspective)
    xx = 0
    while xx < W:
        w = int(rng.integers(14, 46)); h = int(rng.integers(8, 52))
        dr.rectangle([xx, hz - h, xx + w, hz], fill=int(0.16 * 255)); xx += w
    # ground
    dr.rectangle([0, hz, W, H], fill=int(0.05 * 255))
    # rails converging
    for k in (-1, 1):
        dr.line([(0.52 * W + k * 6, hz), (0.52 * W + k * 170, H)], fill=int(0.35 * 255), width=3)
    # power poles + catenary wires
    poles = [0.12 * W, 0.47 * W, 0.93 * W]
    for px in poles:
        dr.rectangle([px - 3, 0.18 * H, px + 3, hz + 4], fill=6)
        dr.rectangle([px - 26, 0.22 * H, px + 26, 0.22 * H + 4], fill=6)
    for a, b in zip(poles[:-1], poles[1:]):
        for off in (-22, 0, 22):
            pts = [(a + off + (b - a) * s, 0.22 * H + 2 + 34 * np.sin(np.pi * s) + (off == 0) * 8 * np.sin(np.pi * s))
                   for s in np.linspace(0, 1, 40)]
            dr.line(pts, fill=6, width=1)
    # railway crossing: crossbuck, lamps, striped barrier arm
    cx, cy = 0.30 * W, 0.40 * H
    dr.rectangle([cx - 3, cy - 20, cx + 3, hz + 8], fill=6)
    for sgn in (1, -1):
        dr.line([(cx - 34, cy - 26 * sgn), (cx + 34, cy + 26 * sgn)], fill=int(0.92 * 255), width=9)
        dr.line([(cx - 34, cy - 26 * sgn), (cx + 34, cy + 26 * sgn)], fill=6, width=3)
    dr.ellipse([cx - 30, cy + 34, cx - 12, cy + 52], fill=int(0.98 * 255))   # lit lamp
    dr.ellipse([cx + 12, cy + 34, cx + 30, cy + 52], fill=int(0.12 * 255))   # dark lamp
    ax0, ay0 = cx + 6, hz - 30
    L = 250
    for i in range(10):
        s0, s1 = i / 10, (i + 1) / 10
        col = int(0.9 * 255) if i % 2 == 0 else 8
        dr.line([(ax0 + L * s0, ay0 + 6 * s0), (ax0 + L * s1, ay0 + 6 * s1)], fill=col, width=7)
    # figure silhouette + long shadow toward camera-left
    fx, fy = 0.60 * W, hz + 34
    dr.polygon([(fx, fy), (fx - 300, H), (fx - 250, H)], fill=2)
    dr.ellipse([fx - 7, fy - 62, fx + 7, fy - 48], fill=4)
    dr.polygon([(fx - 9, fy - 48), (fx + 9, fy - 48), (fx + 13, fy - 14), (fx - 13, fy - 14)], fill=4)
    dr.rectangle([fx - 6, fy - 14, fx - 2, fy], fill=4); dr.rectangle([fx + 2, fy - 14, fx + 6, fy], fill=4)
    for i in range(24):  # a few ember/firefly specks
        ex, ey = rng.uniform(0, W), rng.uniform(0.45 * H, 0.95 * H)
        r = rng.uniform(1, 2.4)
        dr.ellipse([ex - r, ey - r, ex + r, ey + r], fill=int(rng.uniform(0.75, 1.0) * 255))
    return np.asarray(img).astype(np.float64) / 255.0


def apply_lut(g, lut):
    idx = np.clip((g * 255).round().astype(int), 0, 255)
    return (lut[idx] * 255).round().astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sheet", default=os.path.join("docs", "style_palettes.png"),
                    help="contact sheet path, relative to the project root (default docs/style_palettes.png)")
    ap.add_argument("--plate", default=None,
                    help="preview image (greyscale, centre-cropped to 640x360) instead of the built-in dusk scene: "
                         "use one of your own backgrounds")
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    args = ap.parse_args()
    sheet_path = str(kit_env.resolve(args.sheet))
    plate = kit_env.resolve(args.plate) if args.plate else None
    if plate and not plate.is_file():
        sys.exit(f"--plate: {plate} not found")
    os.makedirs(OUT_LUT, exist_ok=True)
    os.makedirs(os.path.dirname(sheet_path), exist_ok=True)

    scene = dusk_scene()   # always refreshed: tools/preview_style_fx.mjs renders onto it
    Image.fromarray((scene * 255).round().astype(np.uint8), 'L').save(os.path.join(OUT_STYLE, "dusk_scene_gray.png"))
    if plate:   # Rec.601 luma of the plate, same 640x360 frame as the dusk scene
        grey = ImageOps.fit(Image.open(plate).convert("L"), (640, 360), Image.LANCZOS)
        scene = np.asarray(grey).astype(np.float64) / 255.0
        print("plate", kit_env.rel(plate))
    H, W = scene.shape
    font = None
    for name in SHEET_FONTS:
        fp = kit_env.find_font(name)
        if fp:
            try:
                font = ImageFont.truetype(fp, 20); break
            except Exception:
                pass
    font = font or ImageFont.load_default()
    rows = []
    meta = {"global": GLOBAL, "palettes": []}
    for p in PALETTES:
        lut = build_lut(p["gradmap"])
        lut_duo = build_lut([[0, p["duotone"][0]], [1, p["duotone"][1]]])
        Image.fromarray((lut[None] * 255).round().astype(np.uint8)).save(os.path.join(OUT_LUT, p["id"] + ".png"))
        Image.fromarray((lut_duo[None] * 255).round().astype(np.uint8)).save(os.path.join(OUT_LUT, p["id"] + "_duo.png"))
        a = apply_lut(scene, lut)
        b = apply_lut(scene, lut_duo)
        c = 255 - a  # sudden inversion preview
        sw_h = 64
        row = Image.new('RGB', (W * 3 + 40, H + sw_h + 44), (18, 18, 20))
        row.paste(Image.fromarray(a), (10, sw_h + 34))
        row.paste(Image.fromarray(b), (W + 20, sw_h + 34))
        row.paste(Image.fromarray(c), (2 * W + 30, sw_h + 34))
        d = ImageDraw.Draw(row)
        d.text((10, 6), f"{p['name']}   — gradient map | duotone {p['duotone'][0]}↔{p['duotone'][1]} "
                        f"({contrast(*p['duotone']):.1f}:1) | inversion", fill=(235, 235, 235), font=font)
        roles = list(p["roles"].items())
        sw = (W * 3 + 20) / len(roles)
        for i, (k, h) in enumerate(roles):
            x0 = 10 + i * sw
            d.rectangle([x0, 32, x0 + sw - 4, 32 + sw_h - 8], fill=h)
            txtc = (0, 0, 0) if rel_lum(h) > 0.3 else (255, 255, 255)
            d.text((x0 + 6, 36), f"{k}", fill=txtc, font=font)
            d.text((x0 + 6, 60), h, fill=txtc, font=font)
        rows.append(row)
        pm = dict(p)
        pm["luminance"] = {h: round(rel_lum(h), 4) for h in p["roles"].values()}
        pm["duotone_contrast"] = round(contrast(*p["duotone"]), 2)
        pm["lut"] = f"assets/style/luts/{p['id']}.png"
        pm["lut_duotone"] = f"assets/style/luts/{p['id']}_duo.png"
        lums = [rel_lum(s[1]) for s in p["gradmap"]]
        pm["gradmap_monotonic"] = all(b2 >= a2 - 1e-9 for a2, b2 in zip(lums, lums[1:]))
        meta["palettes"].append(pm)
    sheet = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)), (18, 18, 20))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y)); y += r.height
    sheet.save(sheet_path, optimize=True)
    with open(os.path.join(OUT_STYLE, "palettes.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    for pm in meta["palettes"]:
        print(pm["id"], "duotone", pm["duotone_contrast"], "monotonic", pm["gradmap_monotonic"])
    print("sheet", sheet.size)


if __name__ == "__main__":
    main()
