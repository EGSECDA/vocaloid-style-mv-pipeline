# -*- coding: utf-8 -*-
"""PER-SONG DATA: the reconciled lyric line table + song metadata used by the transcribe_*.py tools.

This copy holds the 残光 case study as a worked example. For a new song REPLACE everything in this file
(keep the names): LINES (one entry per sung line, official text + hiragana reading + a rough start from a
Whisper pass), SONG, START_OVERRIDE / MORA_OVERRIDE (empty until you verified an onset by ear) and SCORE_TESTS.
Translations / hand-checked romaji live in transcribe_translation.py.

Each LINES entry: (text, reading_hiragana, section, approx_start_from_whisper, confidence, alternatives, note)
Text was reconciled from 9 faster-whisper large-v3 passes (see examples/zanko/LYRICS_NOTES.md in the kit repo) and
forced-decoding scores (tools/transcribe_score.py).

  python tools/transcribe_lines.py      print the table (index, start, section, text, reading)
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""

LINES = [
    # ---- Verse 1 ----
    ("ひび割れた空を見上げて", "ひびわれたそらをみあげて", "verse1", 16.64, 0.95, ["日々割れた空を見上げて"], "ASR often writes 日々割れた (homophone); ひび割れた = cracked"),
    ("名前もない影を抱いた", "なまえもないかげをだいた", "verse1", 20.36, 0.93, ["名前のない影を抱いた"], "抱いた is sung だいた (forced scoring: だいた -13.4 vs いだいた -27.7)"),
    ("ほどけた糸みたいな明日を", "ほどけたいとみたいなあしたを", "verse1", 23.70, 0.93, ["解けた糸みたいな明日を"], ""),
    ("まだ捨てきれずにいた", "まだすてきれずにいた", "verse1", 27.88, 0.97, [], ""),
    ("錆びた扉の向こう側で", "さびたとびらのむこうがわで", "verse1", 30.80, 0.96, [], ""),
    ("泣き声だけが生きていた", "なきごえだけがいきていた", "verse1", 35.12, 0.95, [], ""),
    ("指先に残る冷たさが", "ゆびさきにのこるつめたさが", "verse1", 38.54, 0.88, ["指先見残る冷たさが"], "vocal-stem passes hear 見, centre-channel passes and forced scoring favour に"),
    ("私をまだ離さない", "わたしをまだはなさない", "verse1", 42.76, 0.97, ["私をまだ放さない"], ""),
    # ---- Pre-chorus 1 ----
    ("ねぇ どこまで落ちれば", "ねぇ どこまでおちれば", "pre1", 46.80, 0.93, ["ねぇ どこまで進めば"], ""),
    ("朝に触れられるの", "あさにふれられるの", "pre1", 48.56, 0.92, [], ""),
    ("この闇の底で", "このやみのそこで", "pre1", 50.44, 0.97, [], ""),
    ("息をしてるだけでも", "いきをしてるだけでも", "pre1", 53.80, 0.95, [], ""),
    ("それでも 消えないで", "それでも きえないで", "pre1", 57.82, 0.85, ["もう それでも消えないで"], "some passes add もう (held vowel of でも); forced scoring strongly prefers no もう"),
    # ---- Chorus 1 ----
    ("救って 救って この夜から", "すくって すくって このよるから", "chorus1", 61.64, 0.93, ["掬って 掬って この夜から"], "すくって: 救って(save) chosen; 掬って(scoop up) is a valid double reading"),
    ("砕けた心を拾い上げて", "くだけたこころをひろいあげて", "chorus1", 65.28, 0.98, [], ""),
    ("救って 救って ひとつだけでいい", "すくって すくって ひとつだけでいい", "chorus1", 69.12, 0.95, [], ""),
    ("終わりの中にも", "おわりのなかにも", "chorus1", 73.24, 0.98, [], ""),
    ("光を残して", "ひかりをのこして", "chorus1", 75.56, 0.98, [], "title image (残光). The long held note is the preceding も (75.5-77.5 s); 光を残して itself is sung in ~1.9 s"),
    # ---- Verse 2 ----
    ("濡れた床に落ちた願いを", "ぬれたゆかにおちたねがいを", "verse2", 86.02, 0.90, ["歌に落ちた願いを"], ""),
    ("ひとつずつ数えていた", "ひとつずつかぞえていた", "verse2", 89.44, 0.96, [], ""),
    ("折れた羽の痛みだけが", "おれたはねのいたみだけが", "verse2", 92.34, 0.96, [], ""),
    ("まだ本当だと知ってた", "まだほんとうだとしってた", "verse2", 96.76, 0.95, [], ""),
    ("笑うほど遠ざかるなら", "わらうほどとおざかるなら", "verse2", 100.26, 0.94, [], ""),
    ("もう何もいらない", "もうなにもいらない", "verse2", 102.64, 0.75, ["もう何も言わない"], "passes split 4:3 between いらない / 言わない; forced scoring favours いらない on all stems"),
    ("それでも胸の奥で", "それでもむねのおくで", "verse2", 103.98, 0.97, [], ""),
    ("小さな火が消えない", "ちいさなひがきえない", "verse2", 106.90, 0.93, [], ""),
    # ---- Pre-chorus 2 ----
    ("ねぇ 誰かの声が", "ねぇ だれかのこえが", "pre2", 114.66, 0.75, ["誰かの声が"], "ねぇ is soft (sung on a falling glide 114.7-115.4 s); all full passes print it but the cut-probe cannot confirm it"),
    ("まだ届くのなら", "まだとどくのなら", "pre2", 116.92, 0.93, ["まだ届くなら"], ""),
    ("この喉の奥の", "こののどのおくの", "pre2", 118.56, 0.93, [], ""),
    ("名前を呼んで", "なまえをよんで", "pre2", 121.34, 0.95, [], ""),
    ("お願い ここにいて", "おねがい ここにいて", "pre2", 126.84, 0.95, [], ""),
    # ---- Chorus 2 ----
    ("救って 救って この夜から", "すくって すくって このよるから", "chorus2", 129.70, 0.85, ["作って 作って この夜から"], "sibilant onset heard as つくって by some passes; chorus repeat = 救って"),
    ("砕けた心を拾い上げて", "くだけたこころをひろいあげて", "chorus2", 133.58, 0.98, [], ""),
    ("救って 救って ひとつだけでいい", "すくって すくって ひとつだけでいい", "chorus2", 137.20, 0.95, [], ""),
    ("終わりの中にも", "おわりのなかにも", "chorus2", 141.24, 0.98, [], ""),
    ("光を残して", "ひかりをのこして", "chorus2", 143.92, 0.95, [], "band drops out 146-147 s; the tail flows into a wordless vocalise 147-154 s"),
    # ---- Bridge ----
    ("崩れるたびに", "くずれるたびに", "bridge", 154.04, 0.94, [], ""),
    ("優しさを知った", "やさしさをしった", "bridge", 156.96, 0.97, [], ""),
    ("絶望の形を", "ぜつぼうのかたちを", "bridge", 161.04, 0.93, ["絶望の欠片を"], ""),
    ("抱きしめたまま", "だきしめたまま", "bridge", 164.52, 0.96, [], ""),
    ("こぼれた涙が", "こぼれたなみだが", "bridge", 168.81, 0.95, [], ""),
    ("道になるなら", "みちになるなら", "bridge", 171.76, 0.93, [], ""),
    ("私は行くよ", "わたしはいくよ", "bridge", 175.70, 0.85, ["私は歩くよ", "私はゆくよ"], "centre-channel passes heard 焼くよ; stems + forced scoring favour 行くよ"),
    ("怖くても", "こわくても", "bridge", 179.96, 0.97, [], ""),
    # ---- Final chorus ----
    ("救って 救って この夜から", "すくって すくって このよるから", "chorus3", 182.72, 0.95, [], ""),
    ("砕けた心を拾い上げて", "くだけたこころをひろいあげて", "chorus3", 186.24, 0.98, [], ""),
    ("救って 救って ひとつだけでいい", "すくって すくって ひとつだけでいい", "chorus3", 190.10, 0.95, [], ""),
    ("終わりの中にも", "おわりのなかにも", "chorus3", 194.00, 0.98, [], ""),
    ("光を残して", "ひかりをのこして", "chorus3", 197.58, 0.97, [], ""),
    # ---- Outro ----
    ("まだ遅くない", "まだおそくない", "outro", 202.80, 0.95, [], ""),
    ("黒闇の果てで", "くろやみのはてで", "outro", 206.62, 0.70, ["暗闇の果てで"], "sung vowel is kuro- (くろやみ scores > くらやみ); 暗闇 may be the intended word"),
    ("あなたに会いたい", "あなたにあいたい", "outro", 210.58, 0.96, ["あなたに逢いたい"], ""),
]

# ---- song metadata for transcribe_reconcile.py (LRC title, lyrics_sections.json notes) ----
SONG = dict(
    title="残光",
    language="ja",
    wordless_vocal_regions=[
        dict(start=0.42, end=2.90, desc="a-cappella-ish wordless vocal / vocal chop before the band enters (instrumental stem ~-63 dB)"),
        dict(start=4.40, end=6.50, desc="soft breathy vocal texture (low voicing)"),
        dict(start=147.0, end=153.9, desc="held tail of 光を残して into a wordless 'ah/e' vocalise, rising pitch F4 -> ~C6 at 151-153 s"),
        dict(start=214.0, end=218.4, desc="outro wordless vocal chops / vocalise, then instrumental to the end (music stops ~223.5 s)"),
    ],
    instrumental_breaks=[dict(start=211.4, end=212.2, desc="band drops out under 会いたい (instrument stem ~-55 dB)"),
                         dict(start=146.0, end=147.0, desc="band drops out under the held 光を残し(て) (instrument stem ~-60 dB)")],
)

# ---- manual onset fixes for transcribe_reconcile.py (line index -> (start, source) / {mora index: start}) ----
# Lines where MMS_FA's first mora is clearly wrong (placed on the previous phrase's tail):
#  8  ねぇ どこまで落ちれば : vocal stem is silent 46.55-46.99 s, onset spike at 47.00; probe flip 47.18
# 26  ねぇ 誰かの声が      : MMS ね score 0.02 at 113.62 (on a falling F4->G#3 glide). New note (G4) starts at
#                            114.70 where Whisper also puts ね; ねぇ is soft/uncertain - see LYRICS_NOTES.md
START_OVERRIDE = {8: (47.00, "manual"), 26: (114.70, "manual")}
MORA_OVERRIDE = {8: {1: 47.07}, 26: {1: 115.40}}  # mora index -> start (ぇ)

# ---- homophone / near-homophone tests for transcribe_score.py: (name, clip_start, clip_end, [candidate texts]) ----
SCORE_TESTS = [
    ("pre1_tail", 53.4, 61.9, ["息をしてるだけでも それでも消えないで",
                               "息をしてるだけでも もう それでも消えないで",
                               "息をしてるだけでも ほら それでも消えないで",
                               "息をしてるだけでも どうか消えないで"]),
    ("v1_finger", 38.2, 46.0, ["指先に残る冷たさが 私をまだ離さない",
                               "指先見残る冷たさが 私をまだ離さない",
                               "指先に残る冷たさが 私をまだ放さない"]),
    ("v2_iranai", 100.0, 104.2, ["笑うほど遠ざかるなら もう何もいらない",
                                 "笑うほど遠ざかるなら もう何も言わない",
                                 "笑うほど遠ざかるなら もう何も要らない"]),
    ("br_iku", 168.6, 182.9, ["こぼれた涙が道になるなら 私は行くよ 怖くても",
                              "こぼれた涙が道になるなら 私は歩くよ 怖くても",
                              "こぼれた涙が道になるなら 私は焼くよ 怖くても",
                              "こぼれた涙が道になるなら 私はゆくよ 怖くても"]),
    ("out_kurayami", 206.3, 209.4, ["暗闇の果てで", "黒闇の果てで", "くらやみの果てで", "こくあんの果てで",
                                    "夜の闇の果てで"]),
    ("out_matda", 202.5, 213.2, ["まだ遅くない 暗闇の果てで あなたに会いたい",
                                 "まだ遅くない 黒闇の果てで あなたに会いたい",
                                 "まだ遅くない 暗闇の果てで あなたに逢いたい"]),
    ("v1_hodoke", 23.5, 31.0, ["ほどけた糸みたいな明日を まだ捨てきれずにいた",
                               "解けた糸みたいな明日を まだ捨てきれずにいた"]),
    ("v1_kage", 20.2, 23.9, ["名前もない影を抱いた", "名前もない影を抱えた", "名前のない影を抱いた"]),
    ("pre2_todoku", 114.4, 118.8, ["ねえ 誰かの声が まだ届くのなら", "ねえ 誰かの声が まだ届くなら"]),
    ("br_katachi", 160.8, 168.5, ["絶望の形を抱きしめたまま", "絶望の形を抱き締めたまま", "絶望の欠片を抱きしめたまま"]),
    ("ch_sukutte", 61.5, 65.4, ["救って 救って この夜から", "掬って 掬って この夜から", "すくって すくって この夜から"]),
    ("ch2_start", 129.5, 133.5, ["救って 救って この夜から", "作って 作って この夜から"]),
    ("fin_tail", 197.3, 202.7, ["光を残して", "光を残して 救って", "光を残して 救え"]),
    ("br_yasashisa", 153.8, 160.2, ["崩れるたびに 優しさを知った", "崩れる度に 優しさを知った"]),
    ("v2_yuka", 85.8, 89.6, ["濡れた床に落ちた願いを", "濡れた指に落ちた願いを", "濡れた夜に落ちた願いを"]),
    ("out_kuro_hira", 206.3, 209.4, ["くろやみの果てで", "くらやみの果てで", "黒闇の果てで", "暗闇の果てで",
                                     "黒い闇の果てで", "漆黒の果てで"]),
    ("fin_echo", 199.6, 202.9, ["救って", "救え", "すくって", "ああ", "光を", "残して"]),
    ("ch1_tsuku", 61.5, 63.9, ["救って 救って", "作って 作って", "すくって すくって", "つくって つくって"]),
    ("ch2_tsuku", 129.5, 131.95, ["救って 救って", "作って 作って", "すくって すくって", "つくって つくって"]),
    ("ch3_tsuku", 182.6, 184.9, ["救って 救って", "作って 作って", "すくって すくって", "つくって つくって"]),
    ("v1_idaita", 20.2, 23.9, ["なまえもないかげをいだいた", "なまえもないかげをだいた"]),
    ("pre1_ochireba", 46.4, 50.6, ["ねぇ どこまで落ちれば 朝に触れられるの", "ねぇ どこまで進めば 朝に触れられるの",
                                   "ねぇ どこまで堕ちれば 朝に触れられるの"]),
    ("v2_hitotsu", 89.2, 92.6, ["ひとつずつ数えていた", "一つずつ数えていた"]),
    ("br_kuzureru", 153.8, 156.5, ["崩れるたびに", "くずれるたびに", "壊れるたびに"]),
    ("pre2_nodo", 118.3, 125.2, ["この喉の奥の名前を呼んで", "この胸の奥の名前を呼んで"]),
    ("v2_hane", 92.2, 100.4, ["折れた羽の痛みだけが まだ本当だと知ってた",
                              "折れた羽の痛みだけが まだ本当だって知ってた"]),
]


if __name__ == "__main__":
    import argparse
    import sys
    argparse.ArgumentParser(description="Print the per-song lyric line table (see the module docstring).").parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"{SONG.get('title', '?')}: {len(LINES)} lines")
    for i, (text, reading, sec, st, conf, *_rest) in enumerate(LINES):
        print(f"{i:3d} {st:7.2f}  {sec:10s} {conf:.2f}  {text}  ({reading})")
