r'''fix_sprite_edges.py - dissolve smoke (red pixels) that the image generator cut off flat at the canvas edge.
Usage:  python tools/fix_sprite_edges.py boy_back_flare:top boy_shout:top,left [--ramp 150]
The original is copied once to assets/char/_orig/ and re-read for repeat runs. If the current
image has changed since the last run, the script stops instead of overwriting the new image.
The red-pixel mask can also include red clothing, skin, or other details: inspect the result.
'''
import hashlib
import json
import sys
import shutil
import pathlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parent.parent
CH = ROOT / 'assets' / 'char'
BK = CH / '_orig'
MARGIN = 16


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fix(name, sides, ramp=150, seed=7):
    src = CH / (name + '.png')
    BK.mkdir(exist_ok=True)
    bak = BK / (name + '.png')
    state = BK / (name + '.fix.json')
    if not bak.exists():
        shutil.copy2(src, bak)
    else:
        current = digest(src)
        previous = json.loads(state.read_text(encoding='utf-8')).get('output_sha256') if state.exists() else None
        if current != digest(bak) and current != previous:
            raise RuntimeError(f'{src} has changed since the backup or last fix; refusing to overwrite it. '
                               f'Move or rename {bak} and {state} before fixing this new image.')
    a = np.asarray(Image.open(bak).convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    rgb = a[..., :3]
    smoke = (rgb[..., 0] - np.maximum(rgb[..., 1], rgb[..., 2]) > 40) & (a[..., 3] > 0)
    smoke = ndi.binary_dilation(smoke, iterations=3)
    rng = np.random.default_rng(seed)
    n = ndi.gaussian_filter(rng.standard_normal((h, w)), 14)
    n = np.clip(n / n.std() * 0.08, -0.15, 0.15)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = {'top': yy - MARGIN, 'left': xx - MARGIN, 'right': (w - 1 - MARGIN) - xx, 'bottom': (h - 1 - MARGIN) - yy}
    fade = np.ones((h, w), np.float32)
    for s in sides:
        fade *= smoothstep((dist[s] / ramp - 0.15 + n) / 0.85)
    a[..., 3] = np.where(smoke, a[..., 3] * fade, a[..., 3])
    a[..., 3][a[..., 3] <= 3] = 0
    Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8)).save(src)
    state.write_text(json.dumps({'output_sha256': digest(src)}), encoding='utf-8')
    print(name, sides, 'ramp', ramp, 'faded px', int((smoke & (fade < 0.99)).sum()))


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    ramp = 150
    if '--ramp' in sys.argv:
        ramp = int(sys.argv[sys.argv.index('--ramp') + 1])
        args = [x for x in args if x != str(ramp)]
    for spec in args:
        nm, _, sd = spec.partition(':')
        fix(nm, [s for s in sd.split(',') if s], ramp)
