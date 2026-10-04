#!/usr/bin/env python3
"""Frame-level vocal activity features from the separated vocal stem (for onset refinement).

Writes analysis/asr/vocal_activity.npz with arrays (hop = 10 ms):
  t, rms_db (vocal stem), inst_db (instrumental), voiced (pyin voiced prob), f0 (Hz, nan if unvoiced),
  onset (onset strength of vocal stem)
Inputs: analysis/stems/vocals_<model>.wav + instrumental_<model>.wav from transcribe_separate.py.
Usage: python tools/transcribe_vocal_activity.py [--model kim]
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse
import os
import sys
import numpy as np
import soundfile as sf
import librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
STEM = os.path.join(ROOT, "analysis", "stems", "vocals_kim.wav")
INST = os.path.join(ROOT, "analysis", "stems", "instrumental_kim.wav")
OUT = os.path.join(ROOT, "analysis", "asr", "vocal_activity.npz")
SR = 16000
HOP = 160


def db_env(x):
    n = len(x) // HOP
    e = np.sqrt((x[: n * HOP].reshape(n, HOP) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(e)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="kim", help="stem suffix from transcribe_separate.py (default kim)")
    args = ap.parse_args()
    stem = os.path.join(str(kit_env.STEMS), f"vocals_{args.model}.wav")
    inst_path = os.path.join(str(kit_env.STEMS), f"instrumental_{args.model}.wav")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    v, sr = sf.read(stem, dtype="float32", always_2d=True)
    v = librosa.resample(v.mean(1), orig_sr=sr, target_sr=SR)
    i, sr2 = sf.read(inst_path, dtype="float32", always_2d=True)
    i = librosa.resample(i.mean(1), orig_sr=sr2, target_sr=SR)
    rms = db_env(v)
    inst = db_env(i)
    f0, vflag, vprob = librosa.pyin(v, fmin=90, fmax=1100, sr=SR, frame_length=1024, hop_length=HOP,
                                    center=True)
    onset = librosa.onset.onset_strength(y=v, sr=SR, hop_length=HOP)
    n = min(len(rms), len(inst), len(vprob), len(onset))
    t = np.arange(n) * HOP / SR
    np.savez(OUT, t=t, rms_db=rms[:n], inst_db=inst[:n], voiced=vprob[:n], f0=f0[:n], onset=onset[:n])
    print("saved", OUT, n)


if __name__ == "__main__":
    main()
