#!/usr/bin/env python3
"""Contact sheets of a rendered video for review: one frame every --step seconds, 5x5 per sheet, timestamped.

   python tools/review_sheets.py render/mv.mp4 --step 1.5 --out render/review [--start 0 --end 226.5] [--cols 5]

Writes <out>/sheet_00.jpg, sheet_01.jpg, ... (384x216 thumbnails, 216x384 for vertical videos, m:ss.xx under each).
Each thumbnail is the exact frame at its label (frame index = round(t * fps)). Needs ffmpeg/ffprobe
(env FFMPEG / FFPROBE). Relative paths: from the current directory if they exist there, else from the project root.
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('video', help='rendered video (e.g. render/mv.mp4)')
ap.add_argument('--step', type=float, default=1.5, help='seconds between thumbnails (default 1.5)')
ap.add_argument('--out', default='render/review', help='output directory (default render/review)')
ap.add_argument('--start', type=float, default=0.0, help='first time in seconds (default 0)')
ap.add_argument('--end', type=float, default=None, help='last time in seconds (default: video end)')
ap.add_argument('--cols', type=int, default=5, help='thumbnails per row; a sheet is cols x cols (default 5)')
a = ap.parse_args()
video = str(kit_env.resolve(a.video))
out_dir = str(kit_env.resolve(a.out))
os.makedirs(out_dir, exist_ok=True)
probe = lambda entries, sel=[]: subprocess.check_output([kit_env.FFPROBE, '-v', 'error', *sel, '-show_entries', entries, '-of', 'csv=p=0', video]).decode().strip()  # noqa: E731
dur = float(probe('format=duration'))
num, den = (probe('stream=r_frame_rate', ['-select_streams', 'v:0']).splitlines()[0].split('/') + ['1'])[:2]
fps = float(num) / float(den or 1)
vw, vh = (int(x) for x in probe('stream=width,height', ['-select_streams', 'v:0']).splitlines()[0].split(',')[:2])
end = min(a.end or dur, dur - 0.05)
times = []
t = a.start
while t <= end + 1e-9: times.append(round(t, 3)); t += a.step
# exact frames: frame round(t * fps) of the file, picked by its own timestamp (-copyts keeps the original pts; counting
# frames after an -ss seek can land one frame late), so every label is the time of the frame shown
nums = sorted(set(round(tt * fps) for tt in times))
w, h = (384, 216) if vw >= vh else (216, 384)
tmp = tempfile.mkdtemp(prefix='review_')
try:
    sel = '+'.join(f'lt(abs(t-{n / fps:.6f}),{0.5 / fps:.6f})' for n in nums)   # inside select='...' commas need no escaping
    seek = max(0.0, a.start - 1.0)
    base = [kit_env.FFMPEG, '-v', 'error', '-ss', f'{seek:.6f}', '-t', f'{end - seek + 0.5:.6f}', '-copyts', '-i', video,
            '-vf', f"select='{sel}',scale={w}:{h}"]
    outp = os.path.join(tmp, 'f_%05d.png')
    if subprocess.run(base + ['-fps_mode', 'passthrough', outp]).returncode != 0:   # ffmpeg >= 5.1
        subprocess.run(base + ['-vsync', '0', outp], check=True)                    # older ffmpeg
    frames = sorted(os.listdir(tmp))
    per = a.cols * a.cols
    for si in range(0, len(frames), per):
        chunk = frames[si:si + per]
        rows = (len(chunk) + a.cols - 1) // a.cols
        S = Image.new('RGB', (a.cols * w, rows * (h + 18)), (12, 12, 12)); d = ImageDraw.Draw(S)
        for i, f in enumerate(chunk):
            tt = nums[si + i] / fps if si + i < len(nums) else a.start + (si + i) * a.step
            with Image.open(os.path.join(tmp, f)) as src:
                im = src.convert('RGB')
            x, y = (i % a.cols) * w, (i // a.cols) * (h + 18)
            S.paste(im, (x, y)); d.text((x + 4, y + h + 3), f'{int(tt // 60)}:{tt % 60:05.2f}', fill=(230, 230, 230))
        out = os.path.join(out_dir, f'sheet_{si // per:02d}.jpg'); S.save(out, quality=84); print(out)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
