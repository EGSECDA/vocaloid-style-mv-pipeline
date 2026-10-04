#!/usr/bin/env python3
"""Vocal stem separation with a UVR MDX-Net ONNX model (onnxruntime CPU, no torch needed).

Models (downloaded from HuggingFace on first use, cached in ~/.cache/huggingface):
  seanghay/uvr_models : Kim_Vocal_2.onnx     (n_fft 7680, dim_f 3072, dim_t 256, compensate 1.009)
  AI4future/RVC       : UVR-MDX-NET-Voc_FT.onnx (same dims, compensate 1.021)

Outputs (under the project root):
  analysis/stems/vocals_<model>.wav, instrumental_<model>.wav   (44.1 kHz stereo float)
  analysis/asr/vocals16k[_<model>].wav                          (16 kHz mono, for Whisper)

Usage: python tools/transcribe_separate.py [kim|vocft] [--audio audio/song.wav]      (about 2-4 min CPU)
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse
import os
import sys
import time
import numpy as np
import soundfile as sf
import librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
SRC = str(kit_env.SONG)
STEMS = str(kit_env.STEMS)
ASR = str(kit_env.ASR)

MODELS = {
    "kim": dict(repo="seanghay/uvr_models", file="Kim_Vocal_2.onnx", compensate=1.009),
    "vocft": dict(repo="AI4future/RVC", file="UVR-MDX-NET-Voc_FT.onnx", compensate=1.021),
}
N_FFT, DIM_F, DIM_T, HOP = 7680, 3072, 256, 1024
N_BINS = N_FFT // 2 + 1
CHUNK = HOP * (DIM_T - 1)
TRIM = N_FFT // 2
GEN = CHUNK - 2 * TRIM


def stft4(chunk):  # chunk [2, CHUNK] -> [1, 4, DIM_F, DIM_T]  (L_re, L_im, R_re, R_im)
    out = []
    for ch in range(2):
        S = librosa.stft(chunk[ch], n_fft=N_FFT, hop_length=HOP, window="hann", center=True, pad_mode="reflect")
        out += [S.real, S.imag]
    x = np.stack(out)[None, :, :DIM_F, :].astype(np.float32)
    return x


def istft4(spec):  # spec [1, 4, DIM_F, DIM_T] -> [2, CHUNK]
    pad = np.zeros((4, N_BINS - DIM_F, DIM_T), dtype=np.float32)
    s = np.concatenate([spec[0], pad], axis=1)
    res = []
    for ch in range(2):
        S = s[2 * ch] + 1j * s[2 * ch + 1]
        res.append(librosa.istft(S, hop_length=HOP, window="hann", center=True, length=CHUNK))
    return np.stack(res)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model", nargs="?", default="kim", choices=sorted(MODELS), help="separation model (default kim)")
    ap.add_argument("--audio", default=SRC, help="input song (default audio/song.wav)")
    args = ap.parse_args()
    import onnxruntime as ort                       # optional deps: imported after --help
    from huggingface_hub import hf_hub_download

    key = args.model
    m = MODELS[key]
    os.makedirs(STEMS, exist_ok=True)
    os.makedirs(ASR, exist_ok=True)
    mp = hf_hub_download(m["repo"], m["file"])
    so = ort.SessionOptions()
    so.intra_op_num_threads = max(4, (os.cpu_count() or 8) // 2)
    sess = ort.InferenceSession(mp, so, providers=["CPUExecutionProvider"])
    iname = sess.get_inputs()[0].name
    print("model", mp, sess.get_inputs()[0].shape, flush=True)

    y, sr = sf.read(str(kit_env.resolve(args.audio)), dtype="float32", always_2d=True)
    if y.shape[1] == 1:
        y = np.repeat(y, 2, axis=1)                  # the model expects stereo
    mix = librosa.resample(y.T, orig_sr=sr, target_sr=44100)  # [2, N]
    n = mix.shape[1]
    pad = GEN - n % GEN
    mix_p = np.concatenate([np.zeros((2, TRIM)), mix, np.zeros((2, pad)), np.zeros((2, TRIM))], 1).astype(np.float32)
    outs = []
    t0 = time.time()
    i = 0
    while i < n + pad:
        spek = stft4(mix_p[:, i:i + CHUNK])
        # UVR "denoise" trick: average model(x) and -model(-x)
        pred = -sess.run(None, {iname: -spek})[0] * 0.5 + sess.run(None, {iname: spek})[0] * 0.5
        w = istft4(pred)
        outs.append(w[:, TRIM:-TRIM])
        i += GEN
        print(f"  chunk {len(outs)}  {i / 44100:.1f}s  ({time.time() - t0:.1f}s)", flush=True)
    voc = np.concatenate(outs, 1)[:, :n] * m["compensate"]
    sf.write(os.path.join(STEMS, f"vocals_{key}.wav"), voc.T.astype(np.float32), 44100, subtype="FLOAT")
    inst = mix - voc
    sf.write(os.path.join(STEMS, f"instrumental_{key}.wav"), inst.T.astype(np.float32), 44100, subtype="FLOAT")
    mono = librosa.resample(voc.mean(0), orig_sr=44100, target_sr=16000)
    mono = mono / (np.abs(mono).max() + 1e-9) * 0.95
    name = "vocals16k.wav" if key == "kim" else f"vocals16k_{key}.wav"
    sf.write(os.path.join(ASR, name), mono.astype(np.float32), 16000, subtype="FLOAT")
    print("done", time.time() - t0)


if __name__ == "__main__":
    main()
