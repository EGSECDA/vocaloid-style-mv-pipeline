> Archived working document from the 「残光」 project (Music / Lyrics / Movie：NikusonP). `<project>` = that project's root; commands and paths refer to its layout at the time. For the maintained, portable versions see `skills/vocaloid-style-mv/references/`.

# 残光 — lyric transcription notes

Owner: lyric-transcription task. Deliverables:

| file | what |
|---|---|
| `analysis/lyrics.lrc` | line-level LRC, 52 lines + empty markers at the 3 vocal gaps (JIZURA-safe header: only `ti/by/offset`) |
| `analysis/lyrics.json` | per line: `index,start,end,text,words[{w,reading,start,end}],section_hint,repeat_of,confidence,alternatives` + extras `reading, romaji, chars[{c,start,end}]` (per display character, for tegaki reveals), `last_mora_start`, `start_16th` (nearest 16th-note on the audio agent's beat grid), `timing_source`, `note` |
| `analysis/lyrics_translation.json` | per line: `index,text,reading (hiragana),romaji,zh,en` |
| `analysis/lyrics_sections.json` | lyric sections, instrumental gaps, wordless-vocal regions, band drop-outs |
| `analysis/lyrics_jizura.txt` | same as the LRC, with the gaps written as timed `[間奏]` rows (JIZURA interlude syntax) |
| `analysis/stems/vocals_kim.wav`, `instrumental_kim.wav` (+ `_vocft`) | 44.1 kHz float vocal / instrumental stems (UVR MDX-Net) — reusable by anyone |
| `analysis/asr/*` | every ASR pass (`pass_*.json`), logs, forced-scoring results, MMS alignment, onset probe |

`analysis/lyrics_draft.lrc` was **not** written by this pipeline. Its times came from early raw Whisper word timestamps, which run **0.4–2.0 s early** on this song (see "Timing"). Use `lyrics.lrc` / `lyrics.json` in its place.

## Language / voice

- **Japanese** throughout. Whisper large-v3 language-ID is `ja` in every 30 s window (p = 0.70–0.97). There are no Chinese or English lines.
- The WAV metadata says `made with suno`, so this is an AI-generated song with a synthesized female-register lead. The diction is clean, but the vocal is heavily reverbed and has backing layers. Suno sings 抱いた as **だいた** and sings the rare word 黒闇 as **くろやみ**.
- The narrator uses 私. The last line addresses あなた.

## Method (all scripts re-runnable, `tools/transcribe_*.py`)

1. `transcribe_prep.py` builds the 16 kHz ASR inputs: `mix16k` (stereo downmix), `center16k` (STFT centre-channel mask), and `vocenh16k` (centre + HPSS harmonic + 120–6000 Hz band-pass + slow AGC). It takes 12 s. The first version took 9.5 min because of an `np.convolve` AGC; that is now `uniform_filter1d`.
2. `transcribe_separate.py [kim|vocft]` separates the vocal stem with a UVR MDX-Net ONNX model on onnxruntime CPU, with no torch involved. It uses `Kim_Vocal_2.onnx` (HF `seanghay/uvr_models`) and `UVR-MDX-NET-Voc_FT.onnx` (HF `AI4future/RVC`), with n_fft 7680, dim_f 3072, dim_t 256, hop 1024, and the UVR ± "denoise" trick. It takes about 130 s on CPU per model. **This was the single biggest accuracy gain.**
3. `transcribe_whisper.py` runs one faster-whisper **large-v3** pass on `cuda`/`float16`. It needs `pip install nvidia-cublas-cu12`, because ctranslate2 4.8 ships cudnn64_9 but not cuBLAS; the script calls `os.add_dll_directory` on the pip `nvidia/*/bin` directories. Settings: `word_timestamps=True`, `condition_on_previous_text=False` (except one pass), temperature fallback 0–0.8, `repetition_penalty 1.05`, and the initial prompt 「これは日本語の歌の歌詞です。残光、夕焼け、光、影、君、僕。」. Model load takes 4–7 s. A full pass with VAD off takes **18–55 s**.
4. `transcribe_score.py` does **forced-decoding scoring**. For each ambiguous spot it force-decodes every candidate text through ctranslate2 `WhisperModel.model.align()` on a tight clip and compares sum log P(text | audio). It runs on the Kim stem, the Voc_FT stem and the centre mix (`analysis/asr/log_score.txt`, `score_results.json`).
5. `transcribe_align_mms.py` does **mora-level forced alignment** with torchaudio `MMS_FA` (wav2vec2 CTC, 1.18 GB checkpoint) on the Kim vocal stem. The hand-checked hiragana readings are romanised one mora at a time. The script aligns 9 groups of lines with `*` star tokens at the group ends and takes 54 s on CPU. Torch 2.8.0 CPU and torchaudio 2.8.0 are installed **in isolation** at `vendor/pydeps_torch`; the script prepends that directory to `sys.path`, so the global Python is untouched.
6. `transcribe_onset_probe.py` is a **sliding-cut onset probe** that validates the onsets independently. It cuts the stem at time t and checks whether Whisper still prefers the full line over the line minus its first mora. On 43 of the 45 decidable lines, the "flip" time falls 0.0–0.45 s after the MMS onset. On 42 of those 45 lines the flip comes more than 0.45 s after the raw Whisper start, which rules that start out.
7. `transcribe_vocal_activity.py` computes the vocal RMS, pyin f0/voicing and onset strength. `transcribe_reconcile.py` then builds every deliverable from `transcribe_lines.py` (the reconciled text, readings, confidence and alternatives) and `transcribe_translation.py` (zh/en and romaji).

### Passes run (large-v3, ja)

| tag | input | VAD | beam | result |
|---|---|---|---|---|
| mix_vad_b5 | mix | on | 5 | **failed**: one hallucinated segment 「ご視聴ありがとうございました」 over 0.6–103 s |
| enh_novad_b5 | vocenh | off | 5 | about 50 % right, many soundalikes (気づけ, 俺らはねえの歌) |
| enh_vad_b8 | vocenh | on | 8 | poor; VAD drops sung passages |
| center_novad_b8 | centre | off | 8 | good. Errors: 日々割れた, 焼くよ, 作って (ch2), trailing 「チャンネル登録…」 hallucination |
| center_novad_b5_noprompt | centre | off | 5 | good, same errors |
| center_vad_b10 | centre | on | 10 | fragmentary; VAD merges 48–89 s |
| **voc_novad_b8** | Kim stem | off | 8 | **best, used as the base**. Errors: 指先見残る, 言わない |
| voc_novad_b5_noprompt | Kim stem | off | 5 | same as above |
| voc_vad_b8 | Kim stem | on | 8 | VAD swallows 55–91 s |
| vocft_novad_b8 | Voc_FT stem | off | 8 | same as voc_novad_b8 (independent confirmation) |
| voc_novad_b10_cond | Kim stem | off | 10 | same text, plus a 「作詞・作曲・編曲 初音ミク」 hallucination in the interlude |

Lessons: **never use VAD on this song.** Silero VAD misreads sung vowels. The vocal stem beats every DSP enhancement. The prompt barely matters once the input is clean. large-v2 and kotoba-whisper were not needed: measured against the final text, the large-v3 passes on the stems and the centre mix match 96.4–97.5 % of characters (the vocenh pass: 65 %).

## Timing

- **Whisper's word timestamps are unreliable for this song.** Relative to the final onsets they run 0.04–2.01 s early (median 0.62 s). The worst cases are after held notes: 「光を残して」 is 2.0 s early because Whisper stretched 光 over the held も, and 「錆びた扉」 is 1.2 s early.
- MMS_FA onsets are confirmed three ways:
  - **Silence-bounded onsets.** Line 0 starts at 17.50, where the stem is silent until 17.44. Line 12 starts at 58.98, just after a dip at 58.8–58.9.
  - **The cut probe.**
  - **The beat grid.** Measured against the audio agent's `analysis/audio.json` beats, every line onset sits **35–85 ms after a 16th-note position** (median 47 ms). That is a musically consistent pattern, so the timings are good to roughly ±0.05 s. `start_16th` gives the snapped grid time if you want to land animation hits exactly on the grid.
- Two onsets were set by hand. **Line 8** 「ねぇ どこまで」 is at 47.00, with the stem silent 46.55–46.99 and an onset spike at 47.00; MMS had pulled ねぇ back onto the previous phrase. **Line 26** 「ねぇ 誰かの声が」 is at 114.70 (low confidence, see below).
- `end` is where the vocal-stem energy decays by 16 dB, capped at the next line's start. It includes held notes: for example, 終わりの中にも holds its も from 75.5 to 77.5. The stem has reverb tails and backing pads, so many lines run into the next one. `last_mora_start` marks where the last syllable begins, if you need the articulated end.
- Chorus-repeat check: the offsets between repeats agree to within ±0.1 s (lines 13→14→15 = 3.76 / 3.69 s, 31→32→33 = 3.66 / 3.67 s, 44→45→46 = 3.70 / 3.63 s). The tempo is about 129–131 BPM.

## Final lyrics (start–end, reconciled)

| # | time | text | romaji | 中文 | English |
|---|---|---|---|---|---|
| | | **intro** 0–17.5 s: instrumental + wordless vocal chop 0.4–2.9 s | | | |
| | | **verse 1** | | | |
| 0 | 00:17.50–00:20.73 | ひび割れた空を見上げて | hibiwareta sora o miagete | 仰望那片龟裂的天空 | Looking up at the cracked sky |
| 1 | 00:20.76–00:23.99 | 名前もない影を抱いた | namae mo nai kage o daita | 怀抱着一道无名的影子 | I held a shadow that had no name |
| 2 | 00:24.53–00:28.22 | ほどけた糸みたいな明日を | hodoketa ito mitai na ashita o | 那像松散丝线一样的明天 | A tomorrow like a thread coming undone |
| 3 | 00:28.25–00:31.62 | まだ捨てきれずにいた | mada sutekirezu ni ita | 我却始终没能舍弃 | I still couldn't bring myself to throw away |
| 4 | 00:31.97–00:35.69 | 錆びた扉の向こう側で | sabita tobira no mukougawa de | 在锈蚀的门扉另一侧 | On the other side of a rusted door |
| 5 | 00:35.73–00:39.42 | 泣き声だけが生きていた | nakigoe dake ga ikiteita | 唯有哭声还活着 | Only the crying was still alive |
| 6 | 00:39.45–00:43.17 | 指先に残る冷たさが | yubisaki ni nokoru tsumetasa ga | 残留在指尖的冰冷 | The cold that lingers on my fingertips |
| 7 | 00:43.20–00:46.49 | 私をまだ離さない | watashi o mada hanasanai | 至今仍不肯放开我 | Still won't let me go |
| | | **pre-chorus 1** | | | |
| 8 | 00:47.00–00:49.03 | ねぇ どこまで落ちれば | nee doko made ochireba | 呐，要坠落到哪里 | Hey, how far do I have to fall |
| 9 | 00:49.06–00:50.84 | 朝に触れられるの | asa ni furerareru no | 才能触碰到清晨 | Before I can touch the morning? |
| 10 | 00:50.87–00:54.40 | この闇の底で | kono yami no soko de | 在这黑暗的最深处 | Down at the bottom of this darkness |
| 11 | 00:54.43–00:58.80 | 息をしてるだけでも | iki o shiteru dake demo | 哪怕只是还在呼吸 | Even if all I'm doing is breathing |
| 12 | 00:58.98–01:02.19 | それでも 消えないで | soredemo kienaide | 即便如此，也请不要消失 | Even so, please don't fade away |
| | | **chorus 1** (downbeat 62.53) | | | |
| 13 | 01:02.22–01:05.95 | 救って 救って この夜から | sukutte sukutte kono yoru kara | 救救我，救救我，从这长夜里 | Save me, save me, from this night |
| 14 | 01:05.98–01:09.64 | 砕けた心を拾い上げて | kudaketa kokoro o hiroiagete | 拾起我破碎的心 | Pick up the pieces of my shattered heart |
| 15 | 01:09.67–01:13.92 | 救って 救って ひとつだけでいい | sukutte sukutte hitotsu dake de ii | 救救我，救救我，只要一片就好 | Save me, save me, just one piece is enough |
| 16 | 01:13.95–01:17.53 | 終わりの中にも | owari no naka ni mo | 哪怕在终结之中 | Even in the middle of the end |
| 17 | 01:17.57–01:19.49 | 光を残して | hikari o nokoshite | 也请留下一束光 | Leave some light behind |
| | | *(interlude 79.5–86.6)* | | | |
| | | **verse 2** | | | |
| 18 | 01:26.58–01:29.75 | 濡れた床に落ちた願いを | nureta yuka ni ochita negai o | 那些坠落在湿冷地板上的愿望 | The wishes that fell onto the wet floor |
| 19 | 01:29.78–01:33.04 | ひとつずつ数えていた | hitotsu zutsu kazoeteita | 我曾一个一个地数着 | I kept counting them, one by one |
| 20 | 01:33.35–01:37.14 | 折れた羽の痛みだけが | oreta hane no itami dake ga | 唯有折断羽翼的疼痛 | Only the pain of my broken wings |
| 21 | 01:37.17–01:40.83 | まだ本当だと知ってた | mada hontou da to shitteta | 我知道仍是真实的 | I knew was still real |
| 22 | 01:41.09–01:42.88 | 笑うほど遠ざかるなら | warau hodo toozakaru nara | 若越是微笑就离得越远 | If smiling only pushes it further away |
| 23 | 01:42.91–01:44.46 | もう何もいらない | mou nani mo iranai | 那我什么都不再需要 | Then I don't need anything anymore |
| 24 | 01:44.49–01:47.91 | それでも胸の奥で | soredemo mune no oku de | 即便如此，在心底深处 | And yet, deep inside my chest |
| 25 | 01:47.94–01:54.67 | 小さな火が消えない | chiisana hi ga kienai | 一簇小小的火仍未熄灭 | A small flame will not go out |
| | | **pre-chorus 2** | | | |
| 26 | 01:54.70–01:57.31 | ねぇ 誰かの声が | nee dareka no koe ga | 呐，如果还有谁的声音 | Hey, if someone's voice |
| 27 | 01:57.34–01:59.16 | まだ届くのなら | mada todoku no nara | 仍能传达到我这里 | Can still reach me |
| 28 | 01:59.19–02:02.58 | この喉の奥の | kono nodo no oku no | 那哽在喉咙深处的 | The one caught deep in my throat |
| 29 | 02:02.61–02:07.03 | 名前を呼んで | namae o yonde | 名字，请把它呼唤 | Call out that name |
| 30 | 02:07.28–02:10.35 | お願い ここにいて | onegai koko ni ite | 求求你，留在这里 | Please, stay here |
| | | **chorus 2** (downbeat 130.68) | | | |
| 31 | 02:10.38–02:14.01 | 救って 救って この夜から | sukutte sukutte kono yoru kara | 救救我，救救我，从这长夜里 | Save me, save me, from this night |
| 32 | 02:14.04–02:17.68 | 砕けた心を拾い上げて | kudaketa kokoro o hiroiagete | 拾起我破碎的心 | Pick up the pieces of my shattered heart |
| 33 | 02:17.71–02:21.91 | 救って 救って ひとつだけでいい | sukutte sukutte hitotsu dake de ii | 救救我，救救我，只要一片就好 | Save me, save me, just one piece is enough |
| 34 | 02:21.95–02:25.44 | 終わりの中にも | owari no naka ni mo | 哪怕在终结之中 | Even in the middle of the end |
| 35 | 02:25.47–02:28.10 | 光を残して | hikari o nokoshite | 也请留下一束光 | Leave some light behind |
| | | *(wordless vocalise 147–154, rising F4 to about C6)* | | | |
| | | **bridge (C-melo)** | | | |
| 36 | 02:34.62–02:38.25 | 崩れるたびに | kuzureru tabi ni | 每一次崩塌 | Every time I fell apart |
| 37 | 02:38.28–02:41.36 | 優しさを知った | yasashisa o shitta | 我都更懂得温柔 | I learned a little more of kindness |
| 38 | 02:41.91–02:45.32 | 絶望の形を | zetsubou no katachi o | 将绝望的形状 | The shape of my despair |
| 39 | 02:45.35–02:49.16 | 抱きしめたまま | dakishimeta mama | 依旧紧紧拥在怀里 | I'm still holding it close |
| 40 | 02:49.19–02:52.80 | こぼれた涙が | koboreta namida ga | 若是溢出的泪水 | If the tears I've spilled |
| 41 | 02:52.83–02:56.45 | 道になるなら | michi ni naru nara | 能化作一条路 | Can become a road |
| 42 | 02:56.48–02:59.95 | 私は行くよ | watashi wa iku yo | 我就会走下去 | Then I will walk it |
| 43 | 03:00.34–03:03.21 | 怖くても | kowakute mo | 哪怕害怕 | Even if I'm afraid |
| | | **final chorus** (downbeat 183.56) | | | |
| 44 | 03:03.24–03:06.91 | 救って 救って この夜から | sukutte sukutte kono yoru kara | 救救我，救救我，从这长夜里 | Save me, save me, from this night |
| 45 | 03:06.94–03:10.42 | 砕けた心を拾い上げて | kudaketa kokoro o hiroiagete | 拾起我破碎的心 | Pick up the pieces of my shattered heart |
| 46 | 03:10.57–03:14.74 | 救って 救って ひとつだけでいい | sukutte sukutte hitotsu dake de ii | 救救我，救救我，只要一片就好 | Save me, save me, just one piece is enough |
| 47 | 03:14.77–03:18.29 | 終わりの中にも | owari no naka ni mo | 哪怕在终结之中 | Even in the middle of the end |
| 48 | 03:18.32–03:23.25 | 光を残して | hikari o nokoshite | 也请留下一束光 | Leave some light behind |
| | | **outro** (the audio map's "last chorus reprise" bars) | | | |
| 49 | 03:23.28–03:27.38 | まだ遅くない | mada osokunai | 现在还不算太迟 | It's not too late yet |
| 50 | 03:27.41–03:31.06 | 黒闇の果てで | kuroyami no hate de | 在漆黑长夜的尽头 | At the far end of the pitch-black dark |
| 51 | 03:31.09–03:32.90 | あなたに会いたい | anata ni aitai | 我想要见到你 | I want to see you |
| | | *(wordless vocal chops 214–218.4; music cuts 223.54)* | | | |

## Uncertain lines and alternatives

Scores are forced-decoding sum log-probabilities: Kim stem / centre mix. Higher is better.

| # | chosen | alternatives | evidence | conf |
|---|---|---|---|---|
| 50 | **黒闇**の果てで (くろやみ) | 暗闇の果てで | 黒闇 −7.8 / −8.0 vs 暗闇 −10.2 / −9.9. In hiragana, くろやみ −11.1 beats くらやみ −15.5, so the sung vowel is *kuro*-. 暗闇 may be what the lyricist meant, but 黒闇 is what is sung. | 0.70 |
| 23 | もう何も**いらない** | もう何も言わない | The passes split: the stems gave 言わない, the centre mix gave いらない. Scoring favours いらない on all three inputs (−9.8 vs −11.5, −11.6 vs −16.8, −9.9 vs −13.1). | 0.75 |
| 26 | **ねぇ** 誰かの声が | 誰かの声が (no ねぇ) | Every full pass prints ねぇ/ねえ, but it is soft: sung on a falling glide at 114.7–115.4 s, and the cut probe cannot confirm it. The onset (114.70) was set by hand. 誰 itself starts at about 116.2. | 0.75 |
| 12 | それでも 消えないで | もう それでも消えないで | 3 of 9 passes add もう, which is the held でも of line 11. Scoring: no もう −9.5 vs −22.6. | 0.85 |
| 42 | 私は**行く**よ | 歩くよ / ゆくよ / 焼くよ | The centre passes heard 焼くよ. Stems and scoring: 行く −11.1, ゆく −14.9, 歩く −18.4, 焼く −20.6. | 0.85 |
| 6 | 指先**に**残る冷たさが | 指先見残る | The stem passes hear 見 because に is swallowed. The centre mix gives に −8.2 vs 見 −13.2, and に is the only grammatical reading. | 0.88 |
| 31 | 救って 救って この夜から (chorus 2) | 作って 作って | Two passes heard つくって, and the probe gives つくって −8.7 vs 救って −9.5 (a sibilant/affricate onset). It is a chorus repeat of the same melody, so 救って. | 0.85 |
| 13/15/… | **救って** (すくって) | 掬って (scoop up) | Homophone. 救って (save) is the plain reading, and scoring gives 救って −10.5 vs 掬って −17.1. The imagery of picking up shattered pieces makes 掬って a real double meaning worth exploiting visually: hands cupping fragments of light. | 0.93 |
| 1 | 影を抱いた = **だいた** | いだいた | Hiragana scoring: だいた −13.4 vs いだいた −27.7. | 0.93 |
| 2 | **ほどけた** | 解けた | Same sound; the kana spelling was chosen for readability (解けた could be misread とけた). | 0.93 |
| 18 | 濡れた**床**に落ちた願いを | 濡れた指に / 濡れた夜に | 床 −7.6 vs 指 −19.7 vs 夜 −23.9 | 0.90 |
| 38 | 絶望の**形**を | 絶望の欠片を | 形 −7.2 vs 欠片 −20.6 | 0.93 |

Regions with no intelligible words: 0.42–2.90 s (a near-a-cappella vocal chop before the band), 4.4–6.5 s (breathy texture), 147–154 s (vocalise after chorus 2), 199.9–202.8 s (held tail; nothing lexical, best guess "ああ"), 214.0–218.4 s (outro vocal chops). Every Whisper attempt on these regions produced the standard hallucinations (「ご視聴ありがとうございました」, 「作詞・作曲・編曲 初音ミク」, 「ラララ…」). The pipeline threw these out, and nothing was invented.

## Structure and repeats

```
intro 0-17.5 | V1 17.5-46.5 (8 lines) | Pre1 47.0-62.2 (5) | CH1 62.2-79.5 (5) | interlude 79.5-86.6
V2 86.6-114.7 (8) | Pre2 114.7-130.4 (5) | CH2 130.4-148.1 (5) | vocalise 147-154.6
Bridge 154.6-183.2 (8) | FINAL CH 183.2-203.3 (5) | outro 203.3-212.9 (3) | wordless 214-218.4 | cut 223.54
```

- The chorus is 5 lines, sung **3 times with identical text**: lines 13–17 = 31–35 = 44–48 (`repeat_of` points to 13…17).
- The hook 「救って 救って」 starts **about 0.3 s before** each chorus downbeat (62.22 vs 62.53, 130.38 vs 130.68, 183.24 vs 183.56). Start the type on the pickup and land the hit on the downbeat.
- **Title moment.** In every chorus the last bar is a band stop (AUDIO_MAP). 「光を残して」 is sung *inside* that stop: 77.57–79.5 (deepest silence 77.69–78.80) and 145.47–147.9. The outro's 「あなたに会いたい」 (211.09) also falls in the final stop bar (band drops out 211.4–212.2). These are the three near-a-cappella moments, and the light/afterglow visuals belong there.
- The verses mirror each other: V1 and V2 are 8 lines each with the same shape (image, image, …, それでも turn). Both pre-choruses open with 「ねぇ」.

## Story, imagery, and what the visuals should pick up

**Title 残光 (afterglow / lingering light):** light that is still there after its source has gone. The lyric spells it out as 「終わりの中にも 光を残して」, "even inside the ending, leave light behind". There is no literal sunset, no train and no proper name. The world is a **dark interior after a collapse**, and the only light in it is small, warm and fragile.

Concrete nouns and images, in order:
- **ひび割れた空**: the cracked sky. Cracks can be glowing fracture lines, broken-glass sky, or a shattered-screen motif.
- **名前もない影**: a nameless shadow she hugs. Use a silhouette or a shadow double of the girl.
- **ほどけた糸**: an unravelling thread standing for tomorrow. A single thread pulled loose; a red-thread / string motif can run through the MV.
- **錆びた扉**: a rusted door, with crying behind it. Rust and orange-brown texture; a door motif.
- **指先の冷たさ**: cold fingertips. Hand close-ups; blue-cold tint.
- **闇の底 / 落ちる**: falling to the bottom of the dark; the **朝** (morning) she can't reach. Vertical falling, and a light at the top of the frame.
- **砕けた心を拾い上げて**: picking up a shattered heart. Shards, fragments, hands scooping (掬う) glowing pieces. **ひとつだけでいい**: one piece is enough, so single out ONE glowing shard.
- **濡れた床に落ちた願い**: wishes fallen on a wet floor, counted one by one. Reflections on wet floor, scattered star-like beads, counting digits.
- **折れた羽**: broken wings. Feathers falling, angel-wing silhouettes.
- **小さな火**: a small flame deep in the chest that won't go out. A candle or ember glowing in the chest: the warm key light of the whole piece.
- **誰かの声 / 喉の奥の名前**: a name stuck in the throat, "call it". Speech-bubble or sound-wave motif, and a blank name tag or name card.
- **崩れる**: crumbling. Disintegration and particle dissolves.
- **絶望の形を抱きしめたまま**: hugging the *shape* of despair, as if it were an object.
- **こぼれた涙が道になる**: spilled tears become a road. Tear drops lay down a glowing path, and she walks it (**私は行くよ 怖くても**).
- **黒闇の果て / あなたに会いたい**: at the far end of the pitch-black, "I want to see you". The final reach toward あなた.

**Palette implied by the text:** near-black and indigo night (闇, 夜, 黒闇), cold blue-grey (冷たさ, 濡れた床, 雨/wet), rust orange-brown (錆), and one warm accent: ember/amber/white-gold **light** (光, 火). 残光 as a colour means a warm glow fading at the edges of darkness.

**Emotional arc:**
1. **V1: numb despair.** Cracked sky, nameless shadow, only crying alive, and a cold that won't let go. Passive, frozen.
2. **Pre1: first plea.** "How far must I fall to touch the morning?" and "Even if I'm only breathing, please don't disappear".
3. **CH1: the cry.** Save me from this night; pick up my broken heart, one piece is enough; leave light even in the end. Desperate, but it asks for light.
4. **V2: counting losses.** Fallen wishes, broken wings. Resignation ("I need nothing anymore"), then the turn: **a small flame won't go out**.
5. **Pre2: reaching outward.** If someone's voice can still reach me, call the name in my throat, please stay here. The first "you".
6. **CH2: the same cry,** now with the flame established.
7. **Bridge: the turning point.** Each collapse taught kindness; she holds despair instead of fleeing it; tears become a road; **"I'll go, even if I'm scared."** She stops waiting to be saved and chooses to walk.
8. **Final chorus: the same words at full intensity,** now sounding like resolve rather than helplessness.
9. **Outro: hope.** "It's not too late. At the end of the black dark, I want to see you." The light survives the ending, which is the afterglow.

Suggested key-lines to treat as typographic "hero" moments: 光を残して (×3), 小さな火が消えない, 私は行くよ / 怖くても, まだ遅くない, あなたに会いたい.

## Re-run

```
set PY="C:\Program Files\Python311\python.exe"
%PY% tools\transcribe_prep.py                 # 12 s
%PY% tools\transcribe_separate.py kim         # ~130 s CPU (and: vocft)
%PY% tools\transcribe_whisper.py --input vocals16k.wav --tag voc_novad_b8 --lang ja --vad 0 --beam 8
%PY% tools\transcribe_score.py vocals16k.wav center16k.wav vocals16k_vocft.wav
%PY% tools\transcribe_vocal_activity.py       # ~110 s
%PY% tools\transcribe_align_mms.py            # 54 s (needs vendor/pydeps_torch)
%PY% tools\transcribe_onset_probe.py          # ~15 min on GPU (validation only)
%PY% tools\transcribe_reconcile.py            # writes lyrics.lrc/json/translation/sections/jizura
```
To change a word or reading, edit `tools/transcribe_lines.py`, re-run `transcribe_align_mms.py`, then run `transcribe_reconcile.py`.
