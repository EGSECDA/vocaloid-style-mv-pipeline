# -*- coding: utf-8 -*-
"""Sliding-cut onset probe: find where each lyric line really starts using Whisper as an acoustic judge.

For a line whose reading is R = m0 + rest (m0 = first mora), we cut the vocal stem at time t and
force-decode the clip [t, line_end] with both R and rest.  d(t) = logP(R) - logP(rest).
While the cut is before the line onset, R is strongly preferred (d >> 0); once the cut passes the
first mora, `rest` wins (d < 0).  The flip time (interpolated zero crossing) is a robust estimate of
where the first mora's nucleus is; subtracting a calibrated offset gives the onset.

Candidates from Whisper word timestamps and MMS_FA alignment are both inside the scanned window.
Inputs: analysis/asr/align_mms.json (transcribe_align_mms.py), analysis/asr/vocals16k.wav, tools/transcribe_lines.py
Output: analysis/asr/onset_probe.json  [{line, whisper, mms, flip, curve:[[t,d],...]}]
Usage : python tools/transcribe_onset_probe.py [line indices...]      (Japanese lyrics; CUDA GPU)
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import os
import sys
import json
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402
from transcribe_lines import LINES  # noqa: E402
from transcribe_kana import morae  # noqa: E402

ASR = str(kit_env.ASR)
SMALL = set("ぁぃぅぇぉゃゅょっー")


def split_first(reading):
    r = reading.replace(" ", "").replace("ねぇ", "ねえ")
    if r.startswith("ねえ"):
        return r, r[2:]
    ms = morae(r)
    k = 1
    while k < len(ms) and ms[k] in SMALL:
        k += 1
    first = "".join(ms[:k])
    return r, r[len(first):]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lines", nargs="*", type=int, help="line indices of transcribe_lines.LINES (default: all)")
    args = ap.parse_args()
    kit_env.add_nvidia_dll_dirs()   # pip CUDA wheels must be visible before ctranslate2 loads
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio, pad_or_trim
    from faster_whisper.tokenizer import Tokenizer

    sel = args.lines or list(range(len(LINES)))
    mms = {r["line"]: r for r in json.load(open(os.path.join(ASR, "align_mms.json"), encoding="utf-8"))}
    m = WhisperModel("large-v3", device="cuda", compute_type="float16")
    tok = Tokenizer(m.hf_tokenizer, True, task="transcribe", language="ja")
    audio = decode_audio(os.path.join(ASR, "vocals16k.wav"), sampling_rate=16000)

    def score(clip, text):
        feats = m.feature_extractor(clip)
        nfr = min(feats.shape[-1], 3000)
        enc = m.encode(pad_or_trim(feats))
        t = tok.encode(" " + text)
        r = m.model.align(enc, tok.sot_sequence, [t], nfr, median_filter_width=7)[0]
        return float(np.log(np.clip(np.array(r.text_token_probs), 1e-9, 1)).sum())

    out = []
    for i in sel:
        text, reading = LINES[i][0], LINES[i][1]
        w = LINES[i][3]
        mm = mms[i]["start"]
        line_end = max(mms[i]["end"], (LINES[i + 1][3] if i + 1 < len(LINES) else w + 4))
        full, rest = split_first(reading)
        lo, hi = min(w, mm) - 0.6, max(w, mm) + 0.5
        curve = []
        for t in np.arange(lo, hi + 1e-6, 0.05):
            clip = audio[int(t * 16000):int((line_end + 0.15) * 16000)]
            d = score(clip, full) - score(clip, rest)
            curve.append([round(float(t), 3), round(d, 2)])
        # flip = last zero-crossing from + to - scanning left->right, where after it d stays mostly negative
        flip = None
        ts = np.array([c[0] for c in curve])
        ds = np.array([c[1] for c in curve])
        for k in range(len(ds) - 1, 0, -1):
            if ds[k - 1] > 0 >= ds[k]:
                flip = float(ts[k - 1] + (ts[k] - ts[k - 1]) * ds[k - 1] / (ds[k - 1] - ds[k]))
                break
        out.append(dict(line=i, text=text, whisper=w, mms=mm, flip=None if flip is None else round(flip, 3),
                        curve=curve))
        bar = "".join("+" if d > 2 else ("." if d > 0 else ("-" if d > -2 else "_")) for d in ds)
        print(f"{i:2d} W={w:7.2f} M={mm:7.2f} flip={flip if flip is None else round(flip,2)!s:>7}  "
              f"[{lo:.2f}] {bar}  {text}", flush=True)
    name = "onset_probe.json" if len(sel) == len(LINES) else "onset_probe_partial.json"
    with open(os.path.join(ASR, name), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
