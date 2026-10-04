# Third-party notices

vocaloid-style-mv-pipeline is © 2026 NikusonP under the MIT License (see [`LICENSE`](LICENSE)).
It depends on the third-party software, fonts, models and services listed below. **This repository does not
vendor any of them.** Each is either fetched by the project setup (`setup.ps1` / `setup.sh`, run by
`scripts/new_project.py --setup`), installed by you through a package manager, or used as an external program.
Each item keeps its own licence. If you redistribute a built project (for example with the JIZURA bundle or the
font files inside it), include the licence files noted below.

## Fetched at setup (not in this repository)

### JIZURA 字面: lyric-motion engine

- Source: <https://github.com/852wa/JIZURA> (GitHub account 852wa)
- Licence: **MIT**, Copyright (c) 2026 hakoniwa
- How it is used: setup `git clone`s the repository into `vendor/JIZURA/` at the tested commit `fc16bfe` (the
  environment variable `JIZURA_REF` selects another branch, tag or commit), and `tools/build_jizura_bundle.mjs`
  concatenates its engine sources (no UI, no patches) into `jizura/app/jizura_engine.js`. The kit's own
  `jizura/app/jizura_adapter.js` drives that bundle as a deterministic lyric layer. `vendor/` and the built bundle
  are git-ignored. If you redistribute the bundle, keep `JIZURA_LICENSE.txt` next to it.

<details>
<summary>JIZURA licence text</summary>

```
MIT License

Copyright (c) 2026 hakoniwa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>

### Fonts (Google Fonts): SIL Open Font License 1.1

`tools/fetch_fonts.py` downloads the full, non-subset font files from <https://github.com/google/fonts> into
`engine/fonts/`. The `.ttf` files are git-ignored. The OFL texts are kept in the template as
`engine/fonts/OFL_*.txt`. The fonts are used unmodified. The OFL allows you to embed and redistribute them with
the licence, but not to sell them on their own.

| family | copyright (from the OFL file) |
|---|---|
| Noto Sans JP, Noto Sans SC | Copyright 2014-2021 Adobe, with Reserved Font Name 'Source' |
| Noto Serif JP, Noto Serif SC | Copyright 2012 Google Inc. |
| Zen Old Mincho | Copyright 2021 The Zen Old Mincho Project Authors |
| Zen Kaku Gothic New | Copyright 2022 The Zen Kaku Gothic Project Authors |
| Shippori Mincho B1 | Copyright 2021 The Shippori Mincho Project Authors |
| Kaisei Tokumin | Copyright 2020 The Kaisei Project Authors |
| Klee One | Copyright 2020 The Klee Project Authors |
| Yuji Syuku | Copyright 2021 The Yuji Project Authors |
| DotGothic16 | Copyright 2020 The DotGothic16 Project Authors |
| Dela Gothic One | Copyright 2020 The Dela Gothic Project Authors |
| Rampart One | Copyright 2020 The Rampart Project Authors |
| Reggae One | Copyright 2020 The Reggae Project Authors |
| M PLUS Rounded 1c | Copyright 2016 The Rounded M+ Project Authors |

## Installed through package managers (not in this repository)

| package | used for | licence |
|---|---|---|
| [Playwright](https://github.com/microsoft/playwright) (npm) | drives headless Edge / Chrome for stills and rendering | Apache-2.0 |
| [librosa](https://github.com/librosa/librosa) | beat, downbeat, section and envelope analysis | ISC |
| [NumPy](https://numpy.org/) | numerics | BSD-3-Clause |
| [SciPy](https://scipy.org/) | signal processing, image morphology | BSD-3-Clause |
| [soundfile](https://github.com/bastibe/python-soundfile) (wraps libsndfile) | audio I/O | BSD-3-Clause (libsndfile: LGPL-2.1-or-later) |
| [Pillow](https://python-pillow.org/) | contact sheets, alpha mattes, palette LUTs | MIT-CMU (HPND) |
| [Matplotlib](https://matplotlib.org/) | analysis overview plots | Matplotlib licence (PSF-based) |
| [OpenCV](https://github.com/opencv/opencv-python) (`opencv-python-headless`) | image utilities for asset work (installed by setup from `requirements.txt`; no kit tool requires it) | Apache-2.0. The wheel bundles third-party libraries such as FFmpeg (LGPL-2.1) |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) *(optional)* | lyric transcription / word timings | MIT |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) *(optional)* | faster-whisper backend | MIT |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) *(optional)* | vocal-stem separation | MIT |
| [huggingface_hub](https://github.com/huggingface/huggingface_hub) *(optional)* | model downloads | Apache-2.0 |
| [PyTorch](https://pytorch.org/) / [torchaudio](https://github.com/pytorch/audio) *(optional)* | MMS forced alignment | BSD-style / BSD-2-Clause |
| [pykakasi](https://codeberg.org/miurahr/pykakasi) *(optional)* | kana readings / romaji for lyric notes | GPL-3.0-or-later. Imported at run time by `tools/transcribe_kana.py`, never bundled |

### Model weights downloaded at run time (optional, never redistributed)

| model | used by | terms |
|---|---|---|
| Whisper large-v3 (CTranslate2 conversion) | `tools/transcribe_*.py` via faster-whisper | MIT (OpenAI Whisper) |
| UVR MDX-Net vocal models `Kim_Vocal_2.onnx` (HF `seanghay/uvr_models`), `UVR-MDX-NET-Voc_FT.onnx` (HF `AI4future/RVC`) | `tools/transcribe_separate.py` | set by the model authors. Check them before any commercial use |
| MMS forced-alignment model (`torchaudio.pipelines.MMS_FA`) | `tools/transcribe_align_mms.py` | **CC-BY-NC 4.0** (non-commercial), per the torchaudio documentation. Skip this step, or use another aligner, for commercial work |

The transcription chain only produces lyric *timings*. With official lyrics and timings you can skip it entirely.

## External programs (used, never bundled)

| program | role | licence / terms |
|---|---|---|
| [FFmpeg](https://ffmpeg.org/) / ffprobe | encoding (NVENC / x264), audio mux, frame extraction | LGPL-2.1-or-later. Builds that include GPL parts such as libx264 are GPL. Called as a subprocess |
| [Blender](https://www.blender.org/) 5.x *(optional)* | toon 3D sequences (`blender -b -P blender/shots/*.py`) | GNU GPL. The kit's shot scripts are MIT (GPL-compatible), and your renders belong to you |
| Microsoft Edge / Google Chrome | headless WebGL2 rendering through Playwright | vendor terms |
| [Codex CLI](https://github.com/openai/codex) *(optional)* | batch illustration generation (`tools/imagegen.py`) | CLI: Apache-2.0. Image generation is subject to OpenAI's terms of use |
| NVIDIA driver / NVENC *(optional)* | hardware H.264 encoding | NVIDIA terms |

## AI-generated images

The character art, backgrounds and props of 「残光」 were generated with an AI image model (OpenAI image
generation, driven through the Codex CLI by `tools/imagegen.py` from the prompts in `examples/zanko/prompts/`).
They were then chroma-keyed, composited and animated by the engine. The images in `examples/zanko/gallery/` and
`docs/images/` are reduced contact sheets and frames of that MV. The character 灯 (Akari) is an original design
and is not modelled on any existing character. The rules for AI-generated images differ between jurisdictions
and services. Check the terms of the generator you use for your own projects.

## The 「残光」 case study

The song 「残光」, its lyrics and the music video are works of **NikusonP** (Music / Lyrics / Movie：NikusonP).
The song audio and the full-resolution artwork are **not** included in this repository. The case-study files
document the method; see [`README.md`](README.md#license).

## Trademarks

VOCALOID is a registered trademark of Yamaha Corporation. This project is not affiliated with, sponsored or endorsed by Yamaha Corporation; "Vocaloid-style" is used descriptively for a genre of fan-made music videos. All other trademarks belong to their owners.
