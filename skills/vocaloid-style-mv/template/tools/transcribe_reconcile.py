# -*- coding: utf-8 -*-
"""Build the final lyric deliverables from the reconciled line table + timing sources.

Timing priority for each line / mora:
  1. MMS_FA CTC forced alignment on the vocal stem  (analysis/asr/align_mms.json, transcribe_align_mms.py)
  2. faster-whisper large-v3 word timestamps         (analysis/asr/pass_voc_novad_b8.json)
Line ends are refined from the vocal-stem energy envelope (analysis/asr/vocal_activity.npz).

Writes:
  analysis/lyrics.lrc, analysis/lyrics.json, analysis/lyrics_translation.json, analysis/lyrics_sections.json,
  analysis/lyrics_jizura.txt (LRC with timed [間奏] rows for JIZURA)
Per-song data (text, readings, sections, manual onset fixes, title, notes) comes from tools/transcribe_lines.py
(LINES, SONG, START_OVERRIDE, MORA_OVERRIDE) and translations from tools/transcribe_translation.py.
Usage: python tools/transcribe_reconcile.py [--song-len SECONDS] [--whisper-pass pass_voc_novad_b8.json]
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import os
import sys
import json
import argparse
import difflib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402
import transcribe_lines as _song  # noqa: E402
from transcribe_lines import LINES  # noqa: E402
from transcribe_translation import TRANS, ROMAJI  # noqa: E402
from transcribe_kana import chunks, morae, romaji  # noqa: E402

ROOT = str(kit_env.ROOT)
AN = os.path.join(ROOT, "analysis")
ASR = os.path.join(AN, "asr")
SONG = getattr(_song, "SONG", {})
SONG_LEN = None  # seconds; set in main() (--song-len, else analysis/audio.json duration, else audio/song.wav)
GAP_MARK = 2.0  # seconds of silence after a line that earns an empty LRC marker
WHISPER_PASS = "pass_voc_novad_b8.json"   # word timings used where MMS_FA has no line (fallback only)

# Manual onset fixes live with the song data (transcribe_lines.py); empty for a new song.
START_OVERRIDE = getattr(_song, "START_OVERRIDE", {})
MORA_OVERRIDE = getattr(_song, "MORA_OVERRIDE", {})  # mora index -> start

SECTION_NAMES = {"verse1": "verse 1", "pre1": "pre-chorus 1", "chorus1": "chorus 1", "verse2": "verse 2",
                 "pre2": "pre-chorus 2", "chorus2": "chorus 2", "bridge": "bridge (C-melo)",
                 "chorus3": "final chorus", "outro": "outro"}


def fmt(t):
    t = max(0.0, t)
    m = int(t // 60)
    s = t - 60 * m
    return f"[{m:02d}:{s:05.2f}]"


ATTACH = {"た", "て", "ていた", "ない", "ないで", "ば", "れた", "るの", "れるの", "ても", "たい"}


def readable_romaji(ch):
    """Chunk romaji with spaces between words, glueing inflections / geminates / compound verbs."""
    out = ""
    for k, (o, h) in enumerate(ch):
        r = romaji(h, o == "は")
        prev_o, prev_h = ch[k - 1] if k else ("", "")
        glue = k > 0 and (o in ATTACH or prev_h.endswith("っ") or
                          (prev_o[-1:] in "いきしちみり" and not prev_o.isascii() and
                           "一" <= o[:1] <= "鿿" and len(prev_o) > 1 and "一" <= prev_o[:1] <= "鿿"))
        if prev_h.endswith("っ"):
            out += r[:1]  # geminate consonant: すくっ+て -> sukutte
        out += ("" if glue or not out else " ") + r
    return out


def _kana(c):
    return "ぁ" <= c <= "ヿ"


def char_slots(orig, n):
    """Split n mora slots over the characters of a display chunk -> [(slot_start, slot_end)] (floats).

    Kana characters take their own mora (1:1, from the ends of the chunk: okurigana / leading kana),
    kanji share the remaining morae evenly. A trailing っ has no mora of its own (it was merged into the
    previous mora by the aligner), so it takes the second half of the last slot. Small kana
    (ぇ ゃ ...) take their own slot when the aligner gave them one, else share the previous one.
    """
    L = len(orig)
    if L == 0:
        return []
    if all(_kana(c) for c in orig):
        if n >= L:
            return [(j, j + 1) for j in range(L)]
        out, k = [], 0
        for j, c in enumerate(orig):
            if j and c in "ぁぃぅぇぉゃゅょゎっ" and out:
                s0, s1 = out[-1]
                out[-1] = (s0, (s0 + s1) / 2)
                out.append(((s0 + s1) / 2, s1))
                continue
            out.append((min(k, n - 1), min(k + 1, n)))
            k += 1
        return out
    sokuon = orig.endswith("っ")
    body = orig[:-1] if sokuon else orig
    Lb = len(body)
    lead = 0
    while lead < Lb and _kana(body[lead]):
        lead += 1
    tail = 0
    while tail < Lb - lead and _kana(body[Lb - 1 - tail]):
        tail += 1
    mid = Lb - lead - tail
    mid_slots = n - lead - tail
    if mid_slots < mid or mid == 0:
        out = [(j * n / Lb, (j + 1) * n / Lb) for j in range(Lb)]
    else:
        out = [(j, j + 1) for j in range(lead)]
        out += [(lead + j * mid_slots / mid, lead + (j + 1) * mid_slots / mid) for j in range(mid)]
        out += [(n - tail + j, n - tail + j + 1) for j in range(tail)]
    if sokuon:  # っ = second half of the last mora
        s0, s1 = out[-1]
        cut = max(s0 + 0.25, s1 - 0.5)
        out[-1] = (s0, cut)
        out.append((cut, s1))
    return out


def load_whisper_words(name=WHISPER_PASS):
    path = os.path.join(ASR, name)
    if not os.path.exists(path):   # fall back to the newest pass_*.json (only needed for lines MMS_FA missed)
        passes = sorted((f for f in os.listdir(ASR) if f.startswith("pass_") and f.endswith(".json")),
                        key=lambda f: os.path.getmtime(os.path.join(ASR, f))) if os.path.isdir(ASR) else []
        if not passes:
            print(f"no Whisper pass in {ASR} - lines without MMS_FA timing keep their LINES start")
            return []
        path = os.path.join(ASR, passes[-1])
        print("whisper words from", os.path.basename(path))
    d = json.load(open(path, encoding="utf-8"))
    return [w for s in d["segments"] for w in s["words"]]


def song_length(arg=None):
    """--song-len, else analysis/audio.json duration, else the length of audio/song.wav."""
    if arg:
        return float(arg)
    ap = os.path.join(AN, "audio.json")
    if os.path.exists(ap):
        try:
            return float(json.load(open(ap, encoding="utf-8"))["duration"])
        except Exception:  # noqa: BLE001
            pass
    import soundfile as sf
    return float(sf.info(str(kit_env.SONG)).duration)


def main():
    global SONG_LEN
    ap_ = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap_.add_argument("--song-len", default=None, help="song length in seconds (default: from audio.json / song.wav)")
    ap_.add_argument("--whisper-pass", default=WHISPER_PASS,
                     help=f"Whisper pass in analysis/asr/ for fallback word timings (default {WHISPER_PASS})")
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    args = ap_.parse_args()
    SONG_LEN = song_length(args.song_len)
    va = np.load(os.path.join(ASR, "vocal_activity.npz"))
    rms = va["rms_db"]
    from scipy.ndimage import uniform_filter1d
    rms_s = uniform_filter1d(rms, 7)

    mms_path = os.path.join(ASR, "align_mms.json")
    mms = {r["line"]: r for r in json.load(open(mms_path, encoding="utf-8"))} if os.path.exists(mms_path) else {}
    wwords = load_whisper_words(args.whisper_pass)

    n = len(LINES)
    probe_path = os.path.join(ASR, "onset_probe.json")
    probe = {p["line"]: p for p in json.load(open(probe_path, encoding="utf-8"))} if os.path.exists(probe_path) else {}
    # ---- starts ----
    # MMS_FA is the primary onset source: the Whisper sliding-cut probe (transcribe_onset_probe.py) puts
    # the first-mora "flip" 0.0-0.4 s after the MMS onset on 44/46 lines, and silence-bounded onsets
    # (lines 0, 8, 12) confirm it. faster-whisper word starts run ~0.4-2.0 s early on this song.
    starts, src = [], []
    for i, (text, reading, sec, wst, conf, alts, note) in enumerate(LINES):
        s = wst
        used = "whisper"
        if i in START_OVERRIDE:
            s, used = START_OVERRIDE[i]
        elif i in mms:
            s = mms[i]["start"]
            used = "mms"
            fl = probe.get(i, {}).get("flip")
            if fl is not None and not (-0.25 <= fl - s <= 0.6):
                used = "mms(probe-disagrees)"
        starts.append(round(s, 2))
        src.append(used)
    # patch mora lists for overridden starts
    for i, (s, _) in START_OVERRIDE.items():
        if i in mms:
            us = mms[i]["morae"]
            fixed = MORA_OVERRIDE.get(i, {})
            for k, t in fixed.items():
                us[k]["start"] = t
            us[0]["start"] = s
            for k in range(len(us)):
                nxt_s = us[k + 1]["start"] if k + 1 < len(us) else us[k]["end"]
                us[k]["end"] = round(max(us[k]["start"] + 0.05, min(us[k]["end"], nxt_s)), 3)
            src[i] = "manual(energy+probe)"

    out, trans_out = [], []
    for i, (text, reading, sec, wst, conf, alts, note) in enumerate(LINES):
        st = starts[i]
        nxt = starts[i + 1] if i + 1 < n else SONG_LEN
        # --- mora timings ---
        if i in mms:
            units = mms[i]["morae"]
        else:  # fall back: spread whisper words of this line over its morae
            ws = [w for w in wwords if st - 0.05 <= w["start"] < nxt - 0.05]
            units = []
            for ci, (orig, hira) in enumerate(chunks(text, reading)):
                for m in morae(hira):
                    units.append(dict(kana=m, romaji=romaji(m), chunk=ci))
            t0 = st
            t1 = ws[-1]["end"] if ws else min(nxt, st + 3)
            for k, u in enumerate(units):
                u["start"] = round(t0 + (t1 - t0) * k / len(units), 3)
                u["end"] = round(t0 + (t1 - t0) * (k + 1) / len(units), 3)
        last_start = units[-1]["start"]
        # --- line end: energy decay after the last mora, capped by next line ---
        k0 = int(last_start * 100)
        kpk0 = int(st * 100)
        peak = rms_s[kpk0:max(kpk0 + 1, k0 + 50)].max()
        thr = peak - 16.0
        k = k0 + 15
        kmax = int(min(nxt - 0.03, last_start + 4.5) * 100)
        while k < kmax:
            if rms_s[k:k + 15].max() < thr:
                break
            k += 1
        end = max(units[-1]["end"], k / 100.0)
        end = round(min(end, nxt - 0.03), 2)
        # --- display chunks (words) ---
        ch = chunks(text, reading)
        words = []
        for ci, (orig, hira) in enumerate(ch):
            us = [u for u in units if u["chunk"] == ci]
            if not us:
                continue
            words.append(dict(w=orig, reading=hira, start=round(us[0]["start"], 2)))
        for k2, w in enumerate(words):
            w["end"] = round(words[k2 + 1]["start"] if k2 + 1 < len(words) else end, 2)
        # --- per display character timing (kanji share their chunk's time evenly) ---
        chars = []
        for ci, (orig, hira) in enumerate(ch):
            us = [u for u in units if u["chunk"] == ci]
            if not us:
                continue
            later = [u["start"] for u in units if u["chunk"] > ci]
            c_end = later[0] if later else end
            bounds = [u["start"] for u in us] + [c_end]
            # each char -> a slice of mora slots: kana chars take their own mora (1:1 from the ends of the
            # chunk, e.g. okurigana), kanji share the remaining morae evenly
            slots = char_slots(orig, len(us))
            for c, (s0, s1) in zip(orig, slots):
                a, b = float(np.interp(s0, range(len(bounds)), bounds)), float(np.interp(s1, range(len(bounds)), bounds))
                chars.append(dict(c=c, start=round(a, 2), end=round(max(b, a + 0.01), 2)))
        # --- repeats ---
        repeat_of = None
        for j in range(i):
            if LINES[j][0] == text or difflib.SequenceMatcher(None, LINES[j][0], text).ratio() >= 0.85:
                repeat_of = out[j]["repeat_of"] if out[j]["repeat_of"] is not None else j
                break
        rom = ROMAJI.get(text) or readable_romaji(ch)
        out.append(dict(index=i, start=st, end=end, text=text, words=words, section_hint=SECTION_NAMES.get(sec, sec),
                        repeat_of=repeat_of, confidence=conf, alternatives=alts, reading=reading, romaji=rom,
                        last_mora_start=round(last_start, 2),
                        chars=chars, timing_source=src[i], note=note or None))
        zh, en = TRANS[i] if i < len(TRANS) else ("", "")
        trans_out.append(dict(index=i, text=text, reading=reading, romaji=rom, zh=zh, en=en))

    # ---- optional: nearest 16th-note grid point (beats from the audio agent's analysis/audio.json) ----
    ap = os.path.join(AN, "audio.json")
    if os.path.exists(ap):
        try:
            beats = np.array([b["t"] if isinstance(b, dict) else b for b in json.load(open(ap, encoding="utf-8"))["beats"]])
            grid = np.concatenate([np.linspace(beats[k], beats[k + 1], 5)[:-1] for k in range(len(beats) - 1)])
            for l in out:
                # onsets measured here sit ~35-70 ms after 16th positions: snap (start - 0.05) to nearest 16th
                g = grid[np.argmin(np.abs(grid - (l["start"] - 0.05)))]
                l["start_16th"] = round(float(g), 3)
        except Exception as e:  # never fail the lyric build on a sibling file
            print("audio.json grid skipped:", e)

    # ---- sections / gaps ----
    sections = []
    for i, l in enumerate(out):
        if not sections or sections[-1]["name"] != l["section_hint"]:
            sections.append(dict(name=l["section_hint"], start=l["start"], end=l["end"], lines=[i]))
        else:
            sections[-1]["end"] = l["end"]
            sections[-1]["lines"].append(i)
    gaps = []
    for i, l in enumerate(out):
        nxt = out[i + 1]["start"] if i + 1 < n else SONG_LEN
        if nxt - l["end"] >= GAP_MARK:
            gaps.append(dict(after_line=i, start=l["end"], end=round(nxt, 2), dur=round(nxt - l["end"], 2)))
    title = SONG.get("title") or os.path.basename(ROOT)
    meta = dict(
        song=title, duration=SONG_LEN, language=SONG.get("language", "ja"),
        sections=sections, instrumental_gaps=gaps,
        vocal_first_onset=out[0]["start"], vocal_last_offset=out[-1]["end"],
        wordless_vocal_regions=SONG.get("wordless_vocal_regions", []),
        instrumental_breaks=SONG.get("instrumental_breaks", []),
    )
    # ---- write json ----
    with open(os.path.join(AN, "lyrics.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(AN, "lyrics_translation.json"), "w", encoding="utf-8") as f:
        json.dump(trans_out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(AN, "lyrics_sections.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    # ---- write lrc ----
    # only ti/ar/al/by/offset header tags: JIZURA's parser treats any other [xx:..] tag as lyric text
    lrc = [f"[ti:{title}]", "[by:faster-whisper large-v3 + MMS_FA forced alignment, reconciled]", "[offset:0]",
           "[00:00.00]"]
    for i, l in enumerate(out):
        lrc.append(f"{fmt(l['start'])}{l['text']}")
        if any(g["after_line"] == i for g in gaps):
            lrc.append(f"{fmt(l['end'])}")
    with open(os.path.join(AN, "lyrics.lrc"), "w", encoding="utf-8") as f:
        f.write("\n".join(lrc) + "\n")
    # JIZURA-flavoured copy: gaps become timed [間奏] (interlude) rows instead of empty markers
    jz = [f"[ti:{title}]", "[offset:0]"]
    for i, l in enumerate(out):
        jz.append(f"{fmt(l['start'])}{l['text']}")
        if any(g["after_line"] == i for g in gaps):
            jz.append(f"{fmt(l['end'])}[間奏]")
    with open(os.path.join(AN, "lyrics_jizura.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(jz) + "\n")
    for l in out:
        print(f"{fmt(l['start'])}-{fmt(l['end'])} [{l['timing_source']}] {l['text']}")
    print("gaps", [(g['start'], g['end']) for g in gaps])


if __name__ == "__main__":
    main()
