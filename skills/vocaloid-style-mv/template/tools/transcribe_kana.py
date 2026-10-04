# -*- coding: utf-8 -*-
"""Kana helpers: display-chunk segmentation with readings, hiragana -> romaji (Hepburn-ish).

chunks(text, reading) -> [(display_chunk, reading_chunk)]  (spaces dropped; needs pykakasi)
romaji(hira, phonetic=True) -> 'hibiwareta'
morae(hira) -> ['ひ', 'び', ...]

  python tools/transcribe_kana.py      self-check: chunk + romanise every line of transcribe_lines.LINES
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
_KKS = None


def _kakasi():
    """pykakasi converter, created on first use (morae / romaji work without pykakasi installed)."""
    global _KKS
    if _KKS is None:
        import pykakasi
        _KKS = pykakasi.kakasi()
    return _KKS

DIGRAPH = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo", "しゃ": "sha", "しゅ": "shu", "しょ": "sho", "しぇ": "she",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho", "ちぇ": "che", "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo", "みゃ": "mya", "みゅ": "myu", "みょ": "myo", "りゃ": "rya",
    "りゅ": "ryu", "りょ": "ryo", "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo", "じゃ": "ja", "じゅ": "ju",
    "じょ": "jo", "じぇ": "je", "びゃ": "bya", "びゅ": "byu", "びょ": "byo", "ぴゃ": "pya", "ぴゅ": "pyu",
    "ぴょ": "pyo", "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe", "ふぉ": "fo", "てぃ": "ti", "でぃ": "di",
}
MONO = dict(zip(
    "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"
    "がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゃゅょゎ",
    ["a", "i", "u", "e", "o", "ka", "ki", "ku", "ke", "ko", "sa", "shi", "su", "se", "so", "ta", "chi", "tsu",
     "te", "to", "na", "ni", "nu", "ne", "no", "ha", "hi", "fu", "he", "ho", "ma", "mi", "mu", "me", "mo", "ya",
     "yu", "yo", "ra", "ri", "ru", "re", "ro", "wa", "o", "n", "ga", "gi", "gu", "ge", "go", "za", "ji", "zu",
     "ze", "zo", "da", "ji", "zu", "de", "do", "ba", "bi", "bu", "be", "bo", "pa", "pi", "pu", "pe", "po", "a",
     "i", "u", "e", "o", "ya", "yu", "yo", "wa"]))


def kata2hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def morae(hira):
    """Split hiragana into morae (digraphs kept together; っ, ん, ー are their own mora)."""
    out, i = [], 0
    while i < len(hira):
        if hira[i:i + 2] in DIGRAPH:
            out.append(hira[i:i + 2]); i += 2
        else:
            out.append(hira[i]); i += 1
    return [m for m in out if m.strip()]


def romaji(hira, particle_wa=False):
    hira = kata2hira(hira)
    res, i = [], 0
    while i < len(hira):
        c = hira[i]
        if hira[i:i + 2] in DIGRAPH:
            res.append(DIGRAPH[hira[i:i + 2]]); i += 2; continue
        if c == "っ":
            nxt = hira[i + 1:i + 3]
            r = DIGRAPH.get(nxt) or MONO.get(hira[i + 1:i + 2], "")
            res.append(r[0] if r else ""); i += 1; continue
        if c == "ー":
            res.append(res[-1][-1] if res and res[-1] else ""); i += 1; continue
        if c == "ぇ" and res:  # ねぇ -> nee
            res.append("e"); i += 1; continue
        res.append(MONO.get(c, "")); i += 1
    s = "".join(res)
    if particle_wa and s == "ha":
        s = "wa"
    return s


def _is_kana(s):
    return all(("ぁ" <= c <= "ゖ") or ("ァ" <= c <= "ヺ") or c in "ー" for c in s)


def chunks(text, reading):
    """Segment display text into chunks and assign each its reading from the manual `reading`."""
    reading = reading.replace(" ", "").replace("　", "")
    segs = [s for s in _kakasi().convert(text) if s["orig"].strip()]
    # split pykakasi segments further at kana runs inside kanji words ("見上げ" stays; ok)
    out, pos = [], 0
    for k, s in enumerate(segs):
        orig = s["orig"].strip()
        if _is_kana(orig):
            h = kata2hira(orig)
            if reading.startswith(h, pos):
                out.append([orig, h]); pos += len(h); continue
        hint = kata2hira(s["hira"].strip())
        if reading.startswith(hint, pos) and hint:
            out.append([orig, hint]); pos += len(hint); continue
        # find next kana anchor
        nxt = None
        for s2 in segs[k + 1:]:
            o2 = s2["orig"].strip()
            if _is_kana(o2):
                nxt = kata2hira(o2)[:2]
                break
        if nxt:
            j = reading.find(nxt, pos + 1)
            # the trailing kana of this chunk (okurigana) must be included
            if j > pos:
                out.append([orig, reading[pos:j]]); pos = j; continue
        L = max(1, len(hint))
        out.append([orig, reading[pos:pos + L]]); pos += L
    if pos < len(reading) and out:
        out[-1][1] += reading[pos:]
    return [tuple(x) for x in out]


if __name__ == "__main__":
    import argparse
    import sys
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter).parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    from transcribe_lines import LINES
    for t, r, *_ in LINES:
        ch = chunks(t, r)
        ok = "".join(h for _, h in ch) == r.replace(" ", "")
        print("OK " if ok else "BAD", ch, [romaji(h, o == "は") for o, h in ch])
