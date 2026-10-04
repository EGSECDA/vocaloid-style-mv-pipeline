#!/usr/bin/env python3
"""Score alternative lyric hypotheses against the audio with Whisper forced decoding.

For each test (clip start/end + candidate texts) the candidate is force-decoded through
ctranslate2's Whisper `align()` and the sum / mean token log-probability is reported.
Higher = the model finds that text more likely for that audio. Used to settle homophone /
near-homophone ambiguities (e.g. いらない vs 言わない, 行く vs 焼く, 暗闇 vs 黒闇).

Tests: SCORE_TESTS in tools/transcribe_lines.py (per-song data; the shipped ones belong to the 残光 example),
or --tests FILE.json = [[name, clip_start, clip_end, [candidate, ...]], ...].
Usage: python tools/transcribe_score.py [input_wav ...] [--tests FILE] [--lang ja] [--out score_results.json]
       (inputs relative to analysis/asr/; default: vocals16k.wav center16k.wav)
Writes analysis/asr/score_results.json (or --out / env SCORE_OUT).
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import os
import sys
import json
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ASR = str(kit_env.ASR)


def load_tests(path=None):
    if path:
        with open(kit_env.resolve(path), encoding="utf-8-sig") as f:
            return [(str(n), float(s), float(e), list(c)) for n, s, e, c in json.load(f)]
    from transcribe_lines import SCORE_TESTS
    return SCORE_TESTS


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="*", default=["vocals16k.wav", "center16k.wav"],
                    help="16 kHz wavs in analysis/asr/ (default: vocals16k.wav center16k.wav)")
    ap.add_argument("--tests", default=None, help="JSON test list (default: transcribe_lines.SCORE_TESTS)")
    ap.add_argument("--lang", default="ja", help="tokenizer language (default ja)")
    ap.add_argument("--model", default="large-v3", help="faster-whisper model (default large-v3)")
    ap.add_argument("--out", default=os.environ.get("SCORE_OUT", "score_results.json"),
                    help="output file name in analysis/asr/ (default score_results.json)")
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    args = ap.parse_args()
    tests = load_tests(args.tests)
    kit_env.add_nvidia_dll_dirs()   # pip CUDA wheels must be visible before ctranslate2 loads
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio, pad_or_trim
    from faster_whisper.tokenizer import Tokenizer

    inputs = args.inputs
    m = WhisperModel(args.model, device="cuda", compute_type="float16")
    tok = Tokenizer(m.hf_tokenizer, True, task="transcribe", language=args.lang)
    results = {}
    for inp in inputs:
        audio = decode_audio(os.path.join(ASR, inp), sampling_rate=16000)
        print("=====", inp)
        for name, s, e, cands in tests:
            clip = audio[int(s * 16000):int(e * 16000)]
            feats = m.feature_extractor(clip)
            nframes = min(feats.shape[-1], 3000)
            feats = pad_or_trim(feats)
            enc = m.encode(feats)
            toks = [tok.encode(" " + c.strip())[:] for c in cands]
            # ctranslate2 align expects batch of encoder outputs == len(text_tokens)
            rows = []
            for c, t in zip(cands, toks):
                r = m.model.align(enc, tok.sot_sequence, [t], nframes, median_filter_width=7)[0]
                lp = np.log(np.clip(np.array(r.text_token_probs), 1e-9, 1))
                rows.append((c, float(lp.sum()), float(lp.mean()), len(t)))
            rows.sort(key=lambda x: -x[1])
            print(f"-- {name} [{s}-{e}]")
            for c, ssum, smean, n in rows:
                print(f"   {ssum:8.2f}  {smean:6.3f}  n={n:2d}  {c}")
            results.setdefault(name, {})[inp] = rows
    with open(os.path.join(ASR, args.out), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
