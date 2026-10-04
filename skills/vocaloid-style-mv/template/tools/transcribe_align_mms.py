# -*- coding: utf-8 -*-
"""Mora-level forced alignment of the reconciled lyrics with torchaudio MMS_FA (CTC, wav2vec2 300M).

Why: Whisper cross-attention word timestamps drift by up to ~0.8 s at phrase starts after pauses.
A CTC forced aligner on the separated vocal stem gives much tighter onsets.

Requires CPU torch/torchaudio 2.8. Install them into an isolated folder (keeps the main site-packages clean):
  python -m pip install --target vendor/pydeps_torch torch==2.8.0 torchaudio==2.8.0 \\
         --index-url https://download.pytorch.org/whl/cpu
The folder is found via env TORCH_DEPS_DIR, else <ROOT>/vendor/pydeps_torch (a normal pip install works too).
Input : analysis/stems/vocals_kim.wav (from transcribe_separate.py), tools/transcribe_lines.py (LINES)
Output: analysis/asr/align_mms.json  [{line, group, morae:[{kana, romaji, start, end, score}]}]
Lines are aligned in groups (one CTC pass each). Default: consecutive lines of the same section, at most 8
per group (boundaries fall on instrumental gaps / section edges); override with --groups 0-8,8-13,...
Usage : python tools/transcribe_align_mms.py [--groups a-b,b-c,...] [--stem analysis/stems/vocals_kim.wav]
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import os
import sys
import json
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

_deps = os.environ.get("TORCH_DEPS_DIR") or str(kit_env.ROOT / "vendor" / "pydeps_torch")
if os.path.isdir(_deps):
    sys.path.insert(0, _deps)

from transcribe_lines import LINES  # noqa: E402
from transcribe_kana import chunks, morae, romaji  # noqa: E402

ROOT = str(kit_env.ROOT)
STEM = os.path.join(ROOT, "analysis", "stems", "vocals_kim.wav")
OUT = os.path.join(ROOT, "analysis", "asr", "align_mms.json")
SR = 16000


def section_groups(lines, max_lines=8):
    """[(a, b), ...] half-open line ranges: runs of the same section (LINES[i][2]), split every max_lines.
    For the 残光 table this gives exactly the hand-picked groups used originally:
    (0, 8), (8, 13), (13, 18), (18, 26), (26, 31), (31, 36), (36, 44), (44, 49), (49, 52)."""
    out, a = [], 0
    for i in range(1, len(lines) + 1):
        if i == len(lines) or lines[i][2] != lines[a][2] or i - a >= max_lines:
            out.append((a, i))
            a = i
    return out


def parse_groups(s):
    return [tuple(int(x) for x in g.split("-")) for g in s.split(",") if g.strip()]


def line_units(text, reading):
    """-> list of mora units: dict(kana, romaji, chunk_idx)."""
    units = []
    for ci, (orig, hira) in enumerate(chunks(text, reading)):
        for m in morae(hira):
            r = romaji(m, particle_wa=(orig == "は"))
            if m == "っ" or not r:
                if units:
                    units[-1]["kana"] += m
                continue
            units.append(dict(kana=m, romaji=r, chunk=ci))
    return units


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--groups", default=None, help="line groups a-b,b-c,... (half-open; default: by section)")
    ap.add_argument("--stem", default=STEM, help="vocal stem (default analysis/stems/vocals_kim.wav)")
    args = ap.parse_args()
    import torch                                    # optional deps: imported after --help
    import torchaudio
    import soundfile as sf
    import librosa

    groups = parse_groups(args.groups) if args.groups else section_groups(LINES)
    torch.set_num_threads(max(4, (os.cpu_count() or 8) // 2))
    y, sr = sf.read(str(kit_env.resolve(args.stem)), dtype="float32", always_2d=True)
    y = librosa.resample(y.mean(1), orig_sr=sr, target_sr=SR)
    wav_all = torch.from_numpy(y)

    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True)
    model.eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    starts = [ln[3] for ln in LINES]
    results = []
    for gi, (a, b) in enumerate(groups):
        w0 = max(0.0, starts[a] - 1.5)
        w1 = starts[b] + 0.3 if b < len(LINES) else starts[b - 1] + 6.0
        # extend the last line of the group generously (held notes) but not into the next group
        seg = wav_all[int(w0 * SR):int(w1 * SR)]
        # peak-normalise the clip
        seg = seg / (seg.abs().max() + 1e-6) * 0.9
        words, owners = ["*"], [None]
        per_line_units = []
        for li in range(a, b):
            units = line_units(LINES[li][0], LINES[li][1])
            per_line_units.append(units)
            for ui, u in enumerate(units):
                words.append(u["romaji"])
                owners.append((li, ui))
        words.append("*")
        owners.append(None)
        with torch.inference_mode():
            emission, _ = model(seg.unsqueeze(0))
            spans = aligner(emission[0], tokenizer(words))
        fps = seg.shape[0] / emission.shape[1] / SR  # seconds per emission frame
        for (li_ui, sp) in zip(owners, spans):
            if li_ui is None:
                continue
            li, ui = li_ui
            u = per_line_units[li - a][ui]
            u["start"] = round(w0 + sp[0].start * fps, 3)
            u["end"] = round(w0 + sp[-1].end * fps, 3)
            u["score"] = round(float(np.mean([s.score for s in sp])), 3)
        for li in range(a, b):
            units = per_line_units[li - a]
            results.append(dict(line=li, group=gi, text=LINES[li][0], start=units[0]["start"],
                                end=units[-1]["end"], morae=units))
            print(f"{li:2d} {units[0]['start']:7.2f} {units[-1]['end']:7.2f} (whisper {starts[li]:7.2f}, "
                  f"d={units[0]['start'] - starts[li]:+.2f})  {LINES[li][0]}", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
