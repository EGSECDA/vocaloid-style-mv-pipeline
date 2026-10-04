#!/usr/bin/env python3
"""Prepare ASR input variants of the song for lyric transcription.

Outputs (16 kHz mono float WAV) into <ROOT>/analysis/asr/:
  mix16k.wav        - plain stereo downmix
  center16k.wav     - centre-channel extraction (soft mask on |S|/|M|) -> vocals are usually centre-panned
  vocenh16k.wav     - centre + HPSS harmonic + band-pass 120-6000 Hz + loudness normalisation

Usage:  python tools/transcribe_prep.py [--audio audio/song.wav]
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse
import os
import sys
import numpy as np
import soundfile as sf
import librosa
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
SRC = str(kit_env.SONG)
OUT = str(kit_env.ASR)


def norm(x, peak=0.95):
    m = np.max(np.abs(x)) + 1e-9
    return (x / m * peak).astype(np.float32)


def rms_normalize(x, target_db=-20.0, win=16000 * 3):
    """Slow AGC so quiet verses are as loud as choruses (helps Whisper)."""
    from scipy.ndimage import uniform_filter1d
    env = np.sqrt(uniform_filter1d(x.astype(np.float64) ** 2, size=win, mode="reflect") + 1e-10)
    target = 10 ** (target_db / 20)
    gain = np.clip(target / env, 0.25, 8.0)
    y = x * gain
    return norm(y)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio", default=SRC, help="input song (default audio/song.wav)")
    args = ap.parse_args()
    src = str(kit_env.resolve(args.audio))
    os.makedirs(OUT, exist_ok=True)
    y, sr = sf.read(src, dtype="float32", always_2d=True)
    if y.shape[1] == 1:   # mono input: duplicate so the centre extraction degenerates gracefully
        y = np.repeat(y, 2, axis=1)
    L, R = y[:, 0], y[:, 1]
    mix = (L + R) / 2
    mix16 = librosa.resample(mix, orig_sr=sr, target_sr=16000)
    sf.write(os.path.join(OUT, "mix16k.wav"), norm(mix16), 16000, subtype="FLOAT")

    # centre extraction in STFT domain at 16 kHz
    L16 = librosa.resample(L, orig_sr=sr, target_sr=16000)
    R16 = librosa.resample(R, orig_sr=sr, target_sr=16000)
    n_fft, hop = 1024, 256
    SL = librosa.stft(L16, n_fft=n_fft, hop_length=hop)
    SR_ = librosa.stft(R16, n_fft=n_fft, hop_length=hop)
    M = (SL + SR_) / 2
    S = (SL - SR_) / 2
    ratio = np.abs(S) / (np.abs(M) + 1e-8)
    mask = 1.0 / (1.0 + (ratio / 0.35) ** 4)  # keep bins where side is small
    C = M * mask
    center = librosa.istft(C, hop_length=hop, length=len(L16))
    sf.write(os.path.join(OUT, "center16k.wav"), norm(center), 16000, subtype="FLOAT")

    # HPSS harmonic part of centre (drums/percussive transients suppressed)
    H, P = librosa.decompose.hpss(C, margin=(1.0, 2.0))
    harm = librosa.istft(H, hop_length=hop, length=len(L16))
    sos = signal.butter(4, [120, 6000], btype="bandpass", fs=16000, output="sos")
    bp = signal.sosfiltfilt(sos, harm)
    sf.write(os.path.join(OUT, "vocenh16k.wav"), rms_normalize(bp), 16000, subtype="FLOAT")
    print("wrote", os.listdir(OUT))


if __name__ == "__main__":
    main()
