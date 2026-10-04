#!/usr/bin/env python3
"""One faster-whisper transcription pass over an ASR input variant.

Usage examples:
  python tools/transcribe_whisper.py --input mix16k.wav --tag mix_vad --vad 1
  python tools/transcribe_whisper.py --input vocenh16k.wav --tag enh_novad --vad 0 --beam 8
  python tools/transcribe_whisper.py --input vocals16k.wav --tag voc_novad_b8 --vad 0 --beam 8 --prompt "<key words>"
  python tools/transcribe_whisper.py --detect-only --input vocals16k.wav

Inputs are resolved relative to <ROOT>/analysis/asr/ (made by transcribe_prep.py / transcribe_separate.py).
Output: analysis/asr/pass_<tag>.json (list of segments with word timestamps).
--prompt auto = a neutral "these are song lyrics" sentence in --lang; pass a literal prompt with the song's
title / key words to bias the vocabulary. CUDA needs nvidia-cublas-cu12 + nvidia-cudnn-cu12 (pip) or a CUDA
install; without a GPU it falls back to int8 on the CPU (slow).
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import os
import sys
import json
import time
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
ASR = str(kit_env.ASR)

PROMPTS = {   # neutral "these are song lyrics" prompts (the 残光 run appended key words: 残光、夕焼け、光、影、君、僕。)
    "ja": "これは日本語の歌の歌詞です。",
    "zh": "这是一首中文歌曲的歌词。",
    "en": "These are the lyrics of a song.",
    "none": None,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", required=True, help="wav in analysis/asr/ (or an absolute path)")
    ap.add_argument("--tag", default=None, help="output name pass_<tag>.json (default: input file stem)")
    ap.add_argument("--model", default="large-v3", help="faster-whisper model (default large-v3)")
    ap.add_argument("--device", default="cuda", help="cuda | cpu (default cuda)")
    ap.add_argument("--compute", default="float16", help="ctranslate2 compute type (default float16)")
    ap.add_argument("--lang", default=None, help="language code (default: auto-detect; prompt uses ja)")
    ap.add_argument("--vad", type=int, default=1, help="1 = Silero VAD filter (default 1)")
    ap.add_argument("--beam", type=int, default=5, help="beam size (default 5)")
    ap.add_argument("--prompt", default="auto", help="auto|none|<literal text>")
    ap.add_argument("--condition", type=int, default=0, help="condition_on_previous_text (default 0)")
    ap.add_argument("--detect-only", action="store_true", help="only print language probabilities per 30 s")
    ap.add_argument("--clip", default=None, help="start,end seconds (optional)")
    a = ap.parse_args()
    kit_env.add_nvidia_dll_dirs()   # pip CUDA wheels must be visible before ctranslate2 loads
    from faster_whisper import WhisperModel

    path = a.input if os.path.isabs(a.input) else os.path.join(ASR, a.input)
    t0 = time.time()
    try:
        model = WhisperModel(a.model, device=a.device, compute_type=a.compute)
    except Exception as e:  # fall back gracefully
        print("model load failed:", e, "-> trying int8_float16 / cpu", file=sys.stderr)
        try:
            model = WhisperModel(a.model, device="cuda", compute_type="int8_float16")
        except Exception as e2:
            print("cuda int8 failed:", e2, file=sys.stderr)
            model = WhisperModel(a.model, device="cpu", compute_type="int8")
    print(f"loaded {a.model} in {time.time()-t0:.1f}s", flush=True)

    from faster_whisper.audio import decode_audio
    audio = decode_audio(path, sampling_rate=16000)
    offset = 0.0
    if a.clip:
        s, e = [float(x) for x in a.clip.split(",")]
        audio = audio[int(s * 16000):int(e * 16000)]
        offset = s

    if a.detect_only:
        # language probabilities over several windows
        import numpy as np
        for st in range(0, int(len(audio) / 16000) - 30, 30):
            seg = audio[st * 16000:(st + 30) * 16000]
            lang, prob, allp = model.detect_language(seg)
            top = sorted(allp, key=lambda x: -x[1])[:4]
            print(st, lang, round(prob, 3), [(l, round(p, 3)) for l, p in top], flush=True)
        return

    if a.prompt == "auto":
        prompt = PROMPTS.get(a.lang or "ja")
    elif a.prompt == "none":
        prompt = None
    else:
        prompt = a.prompt

    vad_params = dict(threshold=0.3, min_silence_duration_ms=400, speech_pad_ms=300, min_speech_duration_ms=150)
    segs, info = model.transcribe(
        audio,
        language=a.lang,
        beam_size=a.beam,
        best_of=5,
        patience=1.5,
        word_timestamps=True,
        condition_on_previous_text=bool(a.condition),
        initial_prompt=prompt,
        vad_filter=bool(a.vad),
        vad_parameters=vad_params if a.vad else None,
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8],
        compression_ratio_threshold=2.2,
        log_prob_threshold=-1.2,
        no_speech_threshold=0.6,
        hallucination_silence_threshold=2.0 if not a.vad else None,
        repetition_penalty=1.05,
        no_repeat_ngram_size=0,
    )
    out = []
    for s in segs:
        d = dict(start=round(s.start + offset, 3), end=round(s.end + offset, 3), text=s.text.strip(),
                 avg_logprob=round(s.avg_logprob, 3), no_speech_prob=round(s.no_speech_prob, 3),
                 compression_ratio=round(s.compression_ratio, 3), temperature=s.temperature,
                 words=[dict(w=w.word, start=round(w.start + offset, 3), end=round(w.end + offset, 3),
                             p=round(w.probability, 3)) for w in (s.words or [])])
        out.append(d)
        print(f"[{d['start']:7.2f}-{d['end']:7.2f}] ({d['avg_logprob']:+.2f}) {d['text']}", flush=True)
    tag = a.tag or os.path.splitext(os.path.basename(path))[0]
    meta = dict(input=path, model=a.model, lang=info.language, lang_prob=info.language_probability,
                vad=a.vad, beam=a.beam, prompt=prompt, condition=a.condition, secs=round(time.time() - t0, 1))
    with open(os.path.join(ASR, f"pass_{tag}.json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta=meta, segments=out), f, ensure_ascii=False, indent=1)
    print("meta", meta)


if __name__ == "__main__":
    main()
