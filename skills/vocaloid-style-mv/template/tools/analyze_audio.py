#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
analyze_audio.py  --  beat / bar / section / envelope analysis of the song (default audio/song.wav)

Outputs (all under the project root):
  analysis/audio.json            tempo, beats, downbeats, bars, onsets, impacts, sections, vocal activity
  analysis/envelope_30fps.json   per video frame (30 fps): rms/low/mid/high/onset/beat_phase/bar_phase (+beat/bar/vocal)
  analysis/overview.png          4000x1400 timeline (waveform, energies, beats/downbeats, sections, impacts, vocals)
  analysis/ssm.png               bar-level self-similarity (chroma | MFCC) with the section grid (verification plot)
  analysis/click_preview.m4a     the song with beat clicks (listen-check of the beat grid; needs ffmpeg)
  docs/AUDIO_MAP.md              human-readable timeline + candidate moments for big visual hits

Run (about 1-2 min for a 4-min song):
  python tools/analyze_audio.py [--audio audio/song.wav] [--sections auto|curated|FILE] [--bpm-range auto|LO,HI]
                                [--title NAME] [--no-plot] [--no-click] [--vocal-stem PATH]

Sections (--sections):
  default   analysis/sections.json when it exists, else `auto`
  auto      boundaries = the automatic novelty candidates, groups = aligned bar-chroma repetition (labels A, B, C...).
            Good enough for a first look; the rows are also written to analysis/sections_auto.json. Curate: copy
            it to analysis/sections.json, fix boundaries / labels / groups by ear + overview.png, and re-run.
  FILE      JSON list of [first_bar, last_bar, label, group, name, character, notable] rows (or objects with those
            keys; bar numbers 1-based, bar 0 = pickup). Labels with colours: intro verse pre-chorus break chorus
            post-chorus interlude bridge last-chorus outro.
  curated   the built-in CURATED table below = the 残光 example song (only valid for that audio).
Tempo search range (--bpm-range): `auto` = librosa's estimate +-12 %; pass LO,HI (e.g. 115,145) when the
estimate is an octave off (check the click preview).
Input audio of any sample rate is analysed at 48 kHz (resampled in memory). Author: NikusonP -- vocaloid-style-mv-pipeline, MIT.

Method
  * Onset envelope @100 fps (audio resampled 48k->24k, hop 240) = log-mel spectral flux.
  * Tempo: librosa default prior, uniform prior, multi-lag ACF (1/2/4/8-beat lags, parabolic interp), Fourier
    tempogram, windowed local-ACF curve, beat-interval regression; octave check (ACF strength at T/2, T, 2T + kick /
    snare backbeat alternation).  The song ACCELERATES smoothly (about 128.3 -> 132.4 BPM), so beats are tracked with a
    time-varying tempo curve (librosa.beat.beat_track(bpm=<per-frame curve>)), regularised by a robust smoothing
    spline (beat time vs beat index) and snapped to strong onset peaks within +-30 ms.
  * Downbeats (4/4 assumed): per beat-phase evidence = bass-chroma change, chroma change, HPSS kick, backbeat snare
    (negative), and bass re-entries (low-band jumps after breakdowns).  The chroma-recurrence lags between repeated
    sections are checked to be multiples of 4 beats (no odd bars).
  * Sections: bar-synchronous chroma (4 beats stacked, mean-centred) + MFCC mean/std + band energies ->
    recurrence matrices -> checkerboard novelty + bass in/out novelty + stops -> automatic boundary candidates.
    Repetition between sections is measured by aligned bar-chroma similarity (listen-by-proxy).
    The final section table (CURATED) was chosen by the analyst from exactly these measurements (plus the overview /
    SSM plots) and is validated at run time: each boundary is scored against the automatic novelty, and each group
    against chroma repetition; both feed the per-section `confidence`.
  * Vocal activity: if the separated vocal stem exists (analysis/stems/vocals_kim.wav, produced by the ASR agent) its
    150-5000 Hz energy is hysteresis-thresholded; otherwise REPET-SIM foreground + Silero VAD (faster_whisper asset).
"""
import os, sys, json, math, time, argparse, warnings
import numpy as np
import scipy.ndimage as nd
import scipy.signal as ss
import scipy.interpolate as si
import scipy.stats
import librosa

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402

ROOT = str(kit_env.ROOT)
AUDIO = str(kit_env.SONG)
VOCAL_STEM = os.path.join(ROOT, "analysis", "stems", "vocals_kim.wav")
INST_STEM = os.path.join(ROOT, "analysis", "stems", "instrumental_kim.wav")
SECTIONS_FILE = os.path.join(ROOT, "analysis", "sections.json")
OUT_AUDIO = os.path.join(ROOT, "analysis", "audio.json")
OUT_ENV = os.path.join(ROOT, "analysis", "envelope_30fps.json")
OUT_PNG = os.path.join(ROOT, "analysis", "overview.png")
OUT_SSM = os.path.join(ROOT, "analysis", "ssm.png")
OUT_MD = os.path.join(ROOT, "docs", "AUDIO_MAP.md")
BPM_RANGE = (115.0, 145.0)   # tempo search range of the multi-lag ACF; replaced in tempo_analysis (--bpm-range)

SR = 24000          # analysis rate (48k / 2 exactly)
HOP = 240           # -> 100 fps analysis frames
FPS = SR / HOP
VIDEO_FPS = 30
SR_NATIVE = 48000
VHOP = SR_NATIVE // VIDEO_FPS   # 1600 samples = exactly one 30 fps video frame

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


def r3(x):
    return float(round(float(x), 3))


def mmss(t):
    m = int(t // 60)
    return f"{m:02d}:{t - 60 * m:05.2f}"


def zs(x):
    x = np.asarray(x, float)
    return (x - np.mean(x)) / (np.std(x) + 1e-9)


# ================================================================================================================
# EXAMPLE CURATED SECTION TABLE of the 残光 case study (used only with --sections curated; a new song gets `auto` or
# its own analysis/sections.json in the same row format).
# CURATED SECTION TABLE  (bar numbers are 1-based; bar 1 starts at the first downbeat ~0.94 s; bar 0 = pickup)
# Decided from: bar-level MFCC/chroma novelty, low-band (bass) in/out, stops, aligned bar-chroma repetition:
#   chorus1 bars34-41 ~ chorus2 71-78 (0.77) ~ last-chorus 100-107 (0.79 / 0.87 vs ch2) at 0-bar offset,
#   pre-chorus 26-31 ~ 63-68 (0.66), intro riff 6-9 ~ outro 117-120 (0.55), post-chorus 42-45 ~ 79-81 (0.61),
#   breaks 32-33 ~ 70 (0.79) ~ 96-99 (0.66), verse1 10-25 ~ verse2 47-62 (0.36, weak: different arrangement);
#   vocal stem: vocals rest 79.5-84.8 s, short ad-lib 84.8-85.9 s, verse-2 line from ~86.0 s (= pickup into bar 47,
#   cross-checked with the lyric agent's analysis/lyrics_draft.lrc), weak 147-154 s, return bar 84 (bridge).
#   Lyric cross-check: every line starts within ~0.2-1.5 s before the section downbeat (pickups); the hook
#   "救って救って" enters ~1 s before each chorus downbeat, inside the preceding break.
# (first_bar, last_bar, label, group, display name, character/mood, notable)
# ================================================================================================================
CURATED = [
    (0, 5, "intro", "intro-build", "Intro (build)",
     "sparse, fragile opening; isolated vocal fragment + pads, stop-start gaps; builds from near silence",
     "first sound 0.43 s (pickup); micro-stops ~1.8 / 3.9 / 5.0 / 5.9 s; first low hit on bar 4 (~6.6 s)"),
    (6, 9, "intro", "riff", "Intro riff",
     "full-band instrumental hook (the song's signature riff) - first burst of energy",
     "band slams in on bar 6 (~10.3 s); this riff returns as the outro"),
    (10, 17, "verse", "verse", "Verse 1a",
     "Verse 1a (A-melo): vocal enters over a thin arrangement, no steady kick/bass - intimate, narrative",
     "vocal entry ~17.8 s; staccato gaps ~18.4 / 20.2 / 24.0 / 26.8 / 29.3 s (good for cut-on-silence edits)"),
    (18, 25, "verse", "verse", "Verse 1b",
     "Verse 1b: drums + bass enter under the vocal - forward motion, steady groove",
     "bass/kit re-entry on bar 18 (~32.7 s)"),
    (26, 31, "pre-chorus", "pre", "Pre-chorus 1",
     "Pre-chorus 1 (B-melo): harmonic lift, tension rising toward the hook",
     "starts with a thin 2-bar dip (bass out, 47.7-51.4 s, stop at ~48.4 s), groove returns bar 28 (~51.4 s)"),
    (32, 33, "break", "break", "Break 1",
     "Breakdown before the chorus: bass drops out, suspended chord - inhale before the hook",
     "hard stop ~60.1-60.5 s; hook vocal pickup ~61.6 s; chorus slams in on bar 34"),
    (34, 42, "chorus", "chorus", "Chorus 1",
     "Chorus 1 (sabi): full band + hook melody, widest and brightest texture",
     "downbeat of bar 34 (~62.5 s) = first big payoff; last bar is a stop (silence ~77.7-78.8 s)"),
    (43, 46, "post-chorus", "post", "Post-chorus hit",
     "Post-chorus instrumental hit: huge sustained chord / riff with no vocal - biggest low-end in the song",
     "bar 43 (~79.2 s) is the largest energy jump of the song; vocals rest 79.5-84.8 s; bar 46 thins out "
     "(short vocal ad-lib ~84.8 s) as a lead-in to verse 2"),
    (47, 62, "verse", "verse", "Verse 2",
     "Verse 2: full-band verse, busier than verse 1; 16 bars like verse 1 (harmony realigns with verse 1 here)",
     "first line ~86.0 s (pickup); bass drop-out / stop on bar 60 (~110.5 s) then a falling pitch glide 111-116 s"),
    (63, 69, "pre-chorus", "pre", "Pre-chorus 2",
     "Pre-chorus 2: same progression as pre-chorus 1, denser",
     "stop ~116.8 s at its start; builds through 119-128 s"),
    (70, 70, "break", "break", "Break 2",
     "One-bar breakdown before chorus 2 (bass out)",
     "~128.9-130.7 s; hook vocal pickup ~129.7 s; chorus hits on bar 71"),
    (71, 79, "chorus", "chorus", "Chorus 2",
     "Chorus 2: repeat of chorus 1 (bar-chroma match 0.77)",
     "downbeat bar 71 (~130.7 s); last bar drops the bass (~145.3-147.1 s, short gap ~146.6 s)"),
    (80, 83, "interlude", "post", "Interlude",
     "Instrumental interlude after chorus 2 (post-chorus hit variant) with an upward pitch riser",
     "bass re-entry bar 80 (~147.2 s); riser/glide ~150-155 s; vocals mostly absent"),
    (84, 95, "bridge", "bridge", "Bridge",
     "Bridge (C-melo): new vocal section, full and driving, harmonically related to the breakdown chords",
     "vocals return ~155 s; dense and steady - the plateau before the final climb"),
    (96, 99, "break", "break", "Break 3 (pre-last)",
     "Quiet breakdown before the last chorus: bass drops out, stops, suspended - the calm before the storm",
     "stops ~178.1-178.5 s and ~181.6 s; hook vocal pickup ~182-182.5 s; last chorus hits on bar 100"),
    (100, 107, "last-chorus", "chorus", "Last chorus",
     "Last chorus (first half): chorus repeat (match 0.79 vs ch1, 0.87 vs ch2) at full intensity",
     "downbeat bar 100 (~183.6 s) = the song's second-biggest payoff"),
    (108, 115, "last-chorus", "chorus-ext", "Last chorus (reprise)",
     "Last chorus reprise / climax: varied repeat - chorus bars re-used in a new order, shifted by one bar "
     "(bar 109 = chorus bar 1, 0.93; 111 = bar 3; 113 = bar 5), loudest passage",
     "bar 108 is an extra bar before the reprise; peak loudness ~196-210 s; bar 115 is the chorus-ending stop "
     "(= bars 42 / 79, 0.85-0.92), gap ~211.4 s"),
    (116, 121, "outro", "riff", "Outro riff",
     "Outro: intro riff reprise (match 0.55), full band, ends on a hard cut",
     "riff returns bar 117 (~214.5 s); music cuts at ~223.5 s (downbeat of bar 122); reverb tail to 224.32 s"),
]

LABEL_COLORS = {"intro": "#7f8fa6", "verse": "#4a90d9", "pre-chorus": "#9b59b6", "break": "#555555",
                "chorus": "#e74c3c", "post-chorus": "#e67e22", "interlude": "#e67e22", "bridge": "#16a085",
                "last-chorus": "#c0392b", "outro": "#7f8fa6"}
AUTO_COLORS = ["#4a90d9", "#e74c3c", "#9b59b6", "#16a085", "#e67e22", "#7f8fa6", "#c0392b", "#2ecc71", "#f1c40f",
               "#555555"]


def section_color(s):
    """plot colour: by label (curated tables), else by group (auto sections A, B, C ...)."""
    if s["label"] in LABEL_COLORS:
        return LABEL_COLORS[s["label"]]
    g = s.get("group") or ""
    return AUTO_COLORS[(ord(g[0]) - 65) % len(AUTO_COLORS)] if len(g) == 1 and g.isupper() else "#888"


# ================================================================================================================
# 1. load + base features
# ================================================================================================================
def load_audio(path=None):
    y48, sr = librosa.load(path or AUDIO, sr=None, mono=True)
    if sr != SR_NATIVE:   # the analysis grid (hop 240 @ 24 kHz, 1600 @ 48 kHz = one 30 fps frame) assumes 48 kHz
        log(f"resampling {sr} Hz -> {SR_NATIVE} Hz")
        y48 = librosa.resample(y48, orig_sr=sr, target_sr=SR_NATIVE, res_type="soxr_hq")
    y = librosa.resample(y48, orig_sr=SR_NATIVE, target_sr=SR, res_type="soxr_hq")
    return y48, y


def base_features(y):
    F = {}
    D = librosa.stft(y, n_fft=2048, hop_length=HOP)
    S = np.abs(D)
    F["n"] = S.shape[1]
    fr = F["freqs"] = librosa.fft_frequencies(sr=SR, n_fft=2048)
    mel = librosa.feature.melspectrogram(S=S ** 2, sr=SR, n_mels=128, fmax=12000)
    F["mel_db"] = librosa.power_to_db(mel, ref=np.max)
    F["oenv"] = librosa.onset.onset_strength(S=librosa.power_to_db(mel), sr=SR, hop_length=HOP)
    H, P = librosa.decompose.hpss(D, margin=(1.0, 3.0))
    Pm = np.abs(P) ** 2

    def band_on(lo, hi):
        m = (fr >= lo) & (fr < hi)
        e = np.log1p(1e3 * Pm[m].mean(0))
        return np.maximum(0, np.diff(e, prepend=e[0]))

    F["kick"] = band_on(35, 110)
    F["snare"] = 0.5 * band_on(1000, 4000) + 0.5 * band_on(150, 250)
    F["cym"] = band_on(8000, 12000)
    Sp = S ** 2

    def mix_on(lo, hi):   # full-mix band log-energy flux (used for backbeat evidence)
        m = (fr >= lo) & (fr < hi)
        e = np.log1p(100 * Sp[m].sum(0))
        return np.maximum(0, np.diff(e, prepend=e[0]))

    F["mix_kick"] = mix_on(30, 120)
    F["mix_snare"] = mix_on(180, 400) + 0.5 * mix_on(1500, 6000)

    def band_db(lo, hi):
        m = (fr >= lo) & (fr < hi)
        return 10 * np.log10(Sp[m].sum(0) + 1e-10)

    F["db_low"] = band_db(20, 150)
    F["db_mid"] = band_db(150, 2000)
    F["db_high"] = band_db(2000, 12000)
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=HOP)[0][: F["n"]]
    F["db"] = 20 * np.log10(rms + 1e-5)
    yh = librosa.istft(H, hop_length=HOP, length=len(y))
    Cq = np.abs(librosa.cqt(yh, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("C1"), n_bins=84,
                            bins_per_octave=12))[:, : F["n"]]
    F["chroma"] = librosa.feature.chroma_cqt(C=Cq, sr=SR, hop_length=HOP)
    F["bass_chroma"] = Cq[0:12] + Cq[12:24]
    F["mfcc"] = librosa.feature.mfcc(S=librosa.power_to_db(mel), n_mfcc=20)
    F["S"] = S
    return F


# ================================================================================================================
# 2. tempo
# ================================================================================================================
def acf(x):
    x = x - x.mean()
    n = len(x)
    f = np.fft.rfft(x, 2 * n)
    a = np.fft.irfft(f * np.conj(f))[:n]
    return a / (a[0] + 1e-12)


def parabolic(a, i):
    if i <= 0 or i >= len(a) - 1:
        return float(i)
    p, q, r = a[i - 1], a[i], a[i + 1]
    den = p - 2 * q + r
    return float(i + (0.5 * (p - r) / den if den != 0 else 0.0))


def multilag_bpm(ac, lo_bpm=None, hi_bpm=None):
    lo_bpm = lo_bpm or BPM_RANGE[0]
    hi_bpm = hi_bpm or BPM_RANGE[1]
    lo, hi = int(FPS * 60 / hi_bpm), int(FPS * 60 / lo_bpm) + 1
    L = lo + int(np.argmax(ac[lo:hi + 1]))
    ests, ws = [], []
    for k in (1, 2, 4, 8):
        Lk, w = k * L, max(2, 2 * k)
        if Lk + w + 1 >= len(ac):
            continue
        j = Lk - w + int(np.argmax(ac[Lk - w:Lk + w + 1]))
        ests.append(k * 60 * FPS / parabolic(ac, j))
        ws.append(max(ac[j], 1e-3) * k)
    return float(np.average(ests, weights=ws)), float(ac[L])


def tempo_analysis(F, music_start, music_end, bpm_range=None):
    """bpm_range: (lo, hi) search range for the ACF estimators; None = librosa's default-prior estimate +-12 %."""
    global BPM_RANGE
    oenv = F["oenv"]
    n = len(oenv)
    tt = np.arange(n) / FPS
    R = {}
    R["librosa_default_prior"] = float(librosa.feature.tempo(onset_envelope=oenv, sr=SR, hop_length=HOP)[0])
    if bpm_range is None:
        c = R["librosa_default_prior"]
        bpm_range = (c / 1.12, c * 1.12)
    BPM_RANGE = (float(bpm_range[0]), float(bpm_range[1]))
    log(f"tempo search range {BPM_RANGE[0]:.1f}-{BPM_RANGE[1]:.1f} BPM")
    R["librosa_uniform_prior"] = float(librosa.feature.tempo(onset_envelope=oenv, sr=SR, hop_length=HOP,
                                                             prior=scipy.stats.uniform(40, 260))[0])
    a = acf(oenv[int(music_start * FPS):int(music_end * FPS)])
    R["acf_multilag_global"], _ = multilag_bpm(a)

    def strength_at(bpm):
        L = FPS * 60 / bpm
        i, w = int(round(L)), max(1, int(round(L * 0.03)))
        return r3(a[max(1, i - w):i + w + 1].max())

    ftg = np.abs(librosa.feature.fourier_tempogram(onset_envelope=oenv, sr=SR, hop_length=HOP, win_length=1024))
    fb = librosa.fourier_tempo_frequencies(sr=SR, hop_length=HOP, win_length=1024)
    m = ftg.mean(1)
    sel = np.where((fb > BPM_RANGE[0] * 0.87) & (fb < BPM_RANGE[1] * 1.10))[0]   # 100-160 for the 115-145 range
    i = sel[np.argmax(m[sel])]
    R["fourier_tempogram"] = float(fb[0] + parabolic(m, i) * (fb[1] - fb[0]))
    # local tempo curve (12 s windows, 1 s hop)
    cs = np.arange(music_start + 6, music_end - 6, 1.0)
    loc = []
    for c in cs:
        a0, b0 = int((c - 6) * FPS), int((c + 6) * FPS)
        loc.append(multilag_bpm(acf(oenv[a0:b0] * np.hanning(b0 - a0))))
    loc = np.array(loc)
    med = nd.median_filter(loc[:, 0], 9, mode="nearest")
    spl = si.UnivariateSpline(cs, med, w=np.clip(loc[:, 1], 0.1, 1.0), s=len(cs) * 2 * 0.08 ** 2)
    curve = spl(np.clip(tt, cs[0], cs[-1]))
    R["local_curve_median"] = float(np.median(med))
    return R, a, strength_at, curve


# ================================================================================================================
# 3. beats
# ================================================================================================================
def track_beats(F, curve, music_start, beat_end):
    oenv = F["oenv"]
    _, b = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=HOP, bpm=curve, tightness=400,
                                   trim=False, units="time")
    b = b[(b >= music_start - 0.05) & (b <= beat_end - 0.2)]
    idx = np.arange(len(b)).astype(float)
    w = np.ones(len(b))
    for _ in range(4):  # robust smoothing spline, iteratively re-weighted
        f = si.UnivariateSpline(idx, b, w=w, s=len(b) * 0.010 ** 2 * np.mean(w ** 2))
        res = b - f(idx)
        w = 1.0 / np.maximum(1.0, np.abs(res) / 0.015)
    grid = f(idx)
    p0 = grid[1] - grid[0]
    p1 = grid[-1] - grid[-2]
    pre, t = [], grid[0] - p0
    while t >= music_start - 0.06:
        pre.insert(0, t)
        t -= p0
    post, t = [], grid[-1] + p1
    while t <= beat_end + 0.06:
        post.append(t)
        t += p1
    grid = np.concatenate([pre, grid, post])
    pk, _ = ss.find_peaks(oenv, height=np.percentile(oenv, 70))
    pt, ph = pk / FPS, oenv[pk]
    snapped = grid.copy()
    nsnap = 0
    for k, g in enumerate(grid):
        j = np.searchsorted(pt, g)
        c = [c for c in (j - 1, j) if 0 <= c < len(pt) and abs(pt[c] - g) <= 0.030]
        if c:
            snapped[k] = pt[max(c, key=lambda q: ph[q])]
            nsnap += 1
    snapped = np.maximum.accumulate(snapped)
    stats = {"librosa_beats_used": int(len(b)),
             "spline_residual_ms_median": r3(np.median(np.abs(res)) * 1000),
             "spline_residual_ms_p90": r3(np.percentile(np.abs(res), 90) * 1000),
             "snapped_to_onset_fraction": r3(nsnap / len(grid)),
             "grid_extrapolated_before": len(pre), "grid_extrapolated_after": len(post)}
    return snapped, grid, stats


# ================================================================================================================
# 4. downbeats
# ================================================================================================================
def beat_sync(X, bf, agg=np.mean):
    B = librosa.util.sync(X, bf, aggregate=agg)[:, 1:]
    return B / (np.linalg.norm(B, axis=0, keepdims=True) + 1e-9)


def downbeat_analysis(F, beats):
    bf = np.clip(np.round(beats * FPS).astype(int), 0, F["n"] - 1)
    nb = len(bf)

    def nov(B):
        n = np.zeros(B.shape[1])
        n[1:] = 1 - np.sum(B[:, 1:] * B[:, :-1], axis=0)
        return n

    bass_nov = nov(beat_sync(F["bass_chroma"], bf))
    full_nov = nov(beat_sync(F["chroma"], bf))

    def at(x):
        return np.array([x[max(0, i - 3):i + 4].max() for i in bf])

    K, Sn = at(F["mix_kick"]), at(F["mix_snare"])
    # bass re-entries: low band (20-150 Hz) jump between the 2 beats before and the 2 beats after
    low = np.array([F["db_low"][bf[k]:bf[k + 1]].mean() if k + 1 < nb else F["db_low"][bf[k]:bf[k] + 45].mean()
                    for k in range(nb)])
    jump = np.zeros(nb)
    for k in range(2, nb - 2):
        jump[k] = low[k:k + 2].mean() - low[k - 2:k].mean()
    top = [k for k in np.argsort(jump)[::-1] if jump[k] > 12][:16]
    reentry_phase = [int(np.sum(np.array(top) % 4 == p)) for p in range(4)]
    feats = {"bass_chroma_change": (zs(bass_nov), 1.0), "chroma_change": (zs(full_nov), 0.5),
             "kick": (zs(K), 0.4), "snare_backbeat(neg)": (-zs(Sn), 0.4)}
    per, score = {}, np.zeros(4)
    for name, (v, w) in feats.items():
        pv = np.array([v[np.arange(nb) % 4 == p].mean() for p in range(4)])
        per[name] = [r3(x) for x in pv]
        score += w * pv
    per["bass_reentries(count of top low-band jumps)"] = reentry_phase
    score += 0.08 * np.array(reentry_phase)
    win = int(np.argmax(score))
    comb = sum(w * v for v, w in feats.values())
    wins = []
    for s in range(0, nb - 32 + 1, 8):
        i = np.arange(s, s + 32)
        wins.append(int(np.argmax([comb[i][(i % 4) == p].mean() for p in range(4)])))
    wins = np.array(wins)
    # repetition-lag consistency (chroma recurrence, 8-beat embedding)
    X = librosa.feature.stack_memory(beat_sync(F["chroma"], bf), n_steps=8, delay=-1)
    X = X / (np.linalg.norm(X, axis=0, keepdims=True) + 1e-9)
    Rm = X.T @ X
    lags = []
    for L in range(12, nb - 16):
        d = nd.uniform_filter1d(np.diagonal(Rm, offset=L), 16)
        lags.append((float(d.max()), L, int(np.argmax(d))))
    lags.sort(reverse=True)
    kept = []
    for s_, L, i in lags:
        if any(abs(L - l) < 3 and abs(i - j) < 24 for _, l, j in kept):
            continue
        kept.append((s_, L, i))
        if len(kept) >= 10:
            break
    lag_mod0 = float(np.mean([L % 4 == 0 for _, L, _ in kept]))
    srt = np.sort(score)[::-1]
    kick_snare_alt = (per["kick"][1] + per["kick"][3]) - (per["kick"][0] + per["kick"][2])
    conf = 0.35 * min(1, (srt[0] - srt[1]) / 0.6) + 0.35 * (max(reentry_phase) / max(1, sum(reentry_phase))) \
        + 0.15 * lag_mod0 + 0.15 * float(np.mean(wins == win) > 0.4)
    info = {"assumed_meter": "4/4", "winning_phase": win,
            "phase_definition": "downbeat = beats[k] with k % 4 == winning_phase",
            "phase_scores": [r3(x) for x in score], "per_feature_phase_means": per,
            "window_winner_histogram(32-beat windows)": [int(np.sum(wins == p)) for p in range(4)],
            "repeat_lags_mod4_zero_fraction": r3(lag_mod0),
            "top_repeat_lags": [{"sim": r3(s_), "lag_beats": L, "from": r3(beats[i]), "to": r3(beats[i + L])}
                                for s_, L, i in kept[:8]],
            "notes": "winning phase = argmax of the weighted per-phase means (bass-chroma change 1.0, chroma change 0.5, "
                     "kick 0.4, -snare/backbeat 0.4) + 0.08 x bass re-entry counts; see per_feature_phase_means. "
                     "repeat_lags_mod4_zero_fraction near 1 = repeats are whole bars apart (no odd bars).",
            "confidence": r3(min(1.0, conf))}
    return win, info, Rm, (bass_nov, full_nov, K, Sn, jump)


# ================================================================================================================
# 5. stops / gaps
# ================================================================================================================
def find_stops(F, music_start, music_end):
    db = F["db"]
    sm = nd.uniform_filter1d(db, 13)
    ref = nd.percentile_filter(db, 80, size=int(4 * FPS))
    dip = ref - sm
    out = []
    pk, _ = ss.find_peaks(dip, height=9, distance=int(0.8 * FPS))
    for p in pk:
        t = p / FPS
        if t < music_start + 0.3 or t > music_end - 0.3:
            continue
        a = p
        while a > 0 and dip[a] > 6:
            a -= 1
        b = p
        while b < len(dip) - 1 and dip[b] > 6:
            b += 1
        dur = (b - a) / FPS
        kind = "stop" if (dip[p] >= 13 and dur >= 0.14) or dur >= 0.3 else "gap"
        out.append({"start": a / FPS, "end": b / FPS, "depth_db": float(dip[p]), "kind": kind})
    return out


# ================================================================================================================
# 6. sections
# ================================================================================================================
def checker_kernel(w):
    x = np.arange(2 * w) - w + 0.5
    g = np.exp(-0.5 * (x / (0.5 * w)) ** 2)
    return np.outer(g, g) * (np.sign(x)[:, None] * np.sign(x)[None, :])


def foote(Sm, w):
    K = checker_kernel(w)
    n = Sm.shape[0]
    P = np.pad(Sm, w, mode="edge")
    out = np.array([np.sum(P[i:i + 2 * w, i:i + 2 * w] * K) for i in range(n)])
    out = np.maximum(out, 0)
    return out / (out.max() + 1e-9)


def bar_matrices(F, beats, down_idx, bars):
    """bars: list of full bars (dict with start/end/_k0). returns chroma (48 x n, centred), mfcc (38 x n), energies"""
    bf = np.clip(np.round(beats * FPS).astype(int), 0, F["n"] - 1)
    Cb = beat_sync(F["chroma"], bf)
    Cb = Cb - Cb.mean(1, keepdims=True)
    nbt = Cb.shape[1]
    C, M, E = [], [], []
    for bar in bars:
        k0 = bar["_k0"]
        C.append(np.concatenate([Cb[:, min(nbt - 1, k0 + j)] for j in range(4)]))
        a = int(bar["start"] * FPS)
        b = max(a + 1, int(bar["end"] * FPS))
        M.append(np.concatenate([F["mfcc"][1:, a:b].mean(1), F["mfcc"][1:, a:b].std(1)]))
        E.append([F["db"][a:b].mean(), F["db_low"][a:b].mean(), F["db_mid"][a:b].mean(), F["db_high"][a:b].mean()])
    C = np.array(C)
    C = C / (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9)
    M = np.array(M)
    M = (M - M.mean(0)) / (M.std(0) + 1e-9)
    return C, M, np.array(E)


def section_evidence(F, beats, fullbars, stops):
    C, M, E = bar_matrices(F, beats, None, fullbars)
    n = len(fullbars)
    S_chroma = C @ C.T
    Dm = np.sqrt(((M[:, None, :] - M[None, :, :]) ** 2).sum(-1))
    S_mfcc = np.exp(-(Dm / np.median(Dm)) ** 2)
    # novelties at bar boundaries (between bar i-1 and bar i)
    mn = np.zeros(n)
    cn = np.zeros(n)
    bn = np.zeros(n)
    for i in range(1, n):
        mn[i] = np.linalg.norm(M[max(0, i - 2):i].mean(0) - M[i:i + 2].mean(0))
        cn[i] = 1 - float(np.dot(C[i - 1], C[i]))
        bn[i] = abs(E[i:i + 2, 1].mean() - E[max(0, i - 2):i, 1].mean())   # bass in / out
    fo = 0.5 * foote(S_mfcc, 4) + 0.5 * foote(0.5 * (S_chroma + 1), 4)
    stopb = np.zeros(n)
    starts = np.array([b["start"] for b in fullbars])
    for s in stops:
        if s["kind"] != "stop":
            continue
        i = int(np.searchsorted(starts, s["end"] - 0.05))
        if i < n and starts[i] - s["end"] < 1.9:
            stopb[i] = max(stopb[i], min(1.0, s["depth_db"] / 20))
    nov = 0.35 * mn / (mn.max() + 1e-9) + 0.2 * fo + 0.3 * bn / (bn.max() + 1e-9) + 0.15 * stopb
    nov[0] = 1.0
    # automatic boundary candidates (greedy, >= 2 bars apart)
    order = np.argsort(nov)[::-1]
    auto = []
    for i in order:
        if nov[i] < np.percentile(nov, 75):
            break
        if all(abs(i - j) >= 2 for j in auto):
            auto.append(int(i))
    auto = sorted(auto)
    return {"C": C, "M": M, "E": E, "S_chroma": S_chroma, "S_mfcc": S_mfcc, "nov": nov, "auto": auto,
            "mfcc_nov": mn, "chroma_nov": cn, "bass_nov": bn, "foote": fo}


def aligned_sim(C, a0, a1, b0, b1):
    """best mean bar-by-bar chroma similarity between bar ranges [a0,a1] and [b0,b1] (0-based incl.) aligned at
    their starts, allowing the shorter to slide inside the longer."""
    A, B = C[a0:a1 + 1], C[b0:b1 + 1]
    L = min(len(A), len(B))
    best = -1.0
    for oa in range(len(A) - L + 1):
        for ob in range(len(B) - L + 1):
            best = max(best, float(np.mean(np.sum(A[oa:oa + L] * B[ob:ob + L], axis=1))))
    return best


SECTION_KEYS = ("first_bar", "last_bar", "label", "group", "name", "character", "notable")


def load_section_table(path):
    """analysis/sections.json -> CURATED-style rows. Accepts a list (or {"sections": [...]}) of 7-element rows
    [first_bar, last_bar, label, group, name, character, notable] or of objects with those keys."""
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("sections", [])
    rows = []
    for r in data:
        if isinstance(r, dict):
            r = [r.get(k, "") for k in SECTION_KEYS]
        r = list(r) + [""] * (7 - len(r))
        b0, b1 = int(r[0]), int(r[1])
        label = r[2] or "section"
        rows.append((b0, b1, label, r[3] or label, r[4] or f"{label} {b0}-{b1}", r[5] or "", r[6] or ""))
    if not rows:
        raise ValueError(f"{path}: no sections")
    return rows


def auto_section_table(ev, bars, min_sim=0.6):
    """Section rows from the automatic novelty boundaries; sections whose aligned bar-chroma similarity reaches
    `min_sim` share a group letter (A, B, C ...). A starting point for curation, not a final analysis."""
    C = ev["C"]
    n = len(C)                                          # full bars, numbered 1..n
    starts = sorted({a + 1 for a in ev["auto"] if 0 <= a < n} | {1})
    ranges = [(b0, (starts[j + 1] - 1) if j + 1 < len(starts) else n) for j, b0 in enumerate(starts)]
    groups, reps = [], []                              # reps: (letter, a0, a1) first occurrence of each group
    for b0, b1 in ranges:
        a0, a1 = b0 - 1, b1 - 1
        best, letter = -1.0, None
        for g, c0, c1 in reps:
            sim = aligned_sim(C, a0, a1, c0, c1)
            if sim > best:
                best, letter = sim, g
        if letter is None or best < min_sim:
            letter = chr(65 + len(reps)) if len(reps) < 26 else "Z"
            reps.append((letter, a0, a1))
        groups.append(letter)
    has_pickup = any(b.get("pickup") for b in bars)
    rows, count = [], {}
    for j, ((b0, b1), g) in enumerate(zip(ranges, groups)):
        count[g] = count.get(g, 0) + 1
        rep = groups.count(g) > 1
        rows.append((0 if (j == 0 and has_pickup) else b0, b1, "section", g, f"{g}{count[g]}",
                     "auto: boundary from bar-level novelty (MFCC / chroma / bass in-out / stops)",
                     f"group {g} repeats (aligned bar-chroma similarity >= {min_sim})" if rep else ""))
    return rows


def build_sections(ev, bars, env_rms, tt, music_end, cut, vocal_segs, table=None):
    table = CURATED if table is None else table
    fullbar_by_index = {b["index"]: b for b in bars}
    C = ev["C"]
    nov = ev["nov"]
    rank = scipy.stats.rankdata(nov) / len(nov)
    secs = []
    for j, (b0, b1, label, group, name, mood, notable) in enumerate(table):
        if b0 not in fullbar_by_index:
            raise ValueError(f"section '{name}' starts at bar {b0}, but the song has bars "
                             f"{min(fullbar_by_index)}-{max(fullbar_by_index)} (wrong --sections table?)")
        start = fullbar_by_index[b0]["start"]
        end = fullbar_by_index[b1]["end"] if b1 in fullbar_by_index else cut
        if j == len(table) - 1:
            end = cut
        if j == 0:
            start = 0.0
        m = (tt >= start) & (tt < end)
        energy = float(np.mean(env_rms[m])) if m.any() else 0.0
        vt = sum(max(0.0, min(end, v["end"]) - max(start, v["start"])) for v in vocal_segs)
        secs.append({"index": j, "name": name, "start": r3(start), "end": r3(end), "label": label, "group": group,
                     "bars": [b0, b1], "bar_count": b1 - b0 + 1 if b0 > 0 else b1,
                     "energy": r3(energy), "vocal_fraction": r3(vt / max(1e-6, end - start)),
                     "character": mood, "notable": notable})
    if music_end > cut + 0.05:
        m = (tt >= cut) & (tt < music_end)
        secs.append({"index": len(secs), "name": "Tail", "start": r3(cut), "end": r3(music_end), "label": "tail",
                     "group": "tail",
                     "bars": [len(fullbar_by_index) + (0 if 0 in fullbar_by_index else 1)] * 2, "bar_count": 0,
                     "energy": r3(np.mean(env_rms[m])) if m.any() else 0.0, "vocal_fraction": 0.0,
                     "character": "reverb tail after the hard cut (no new notes)",
                     "notable": "last usable frame for the afterglow / logo fade"})
    # boundary evidence + repetition evidence -> confidence
    for s in secs:
        if s["label"] == "tail":
            s.update({"boundary_novelty": 1.0, "boundary_novelty_rank": 1.0, "nearest_auto_boundary_bars": 0,
                      "repeat_similarity": {}, "confidence": 1.0, "notes": s["character"] + "."})
            continue
        fb = max(1, s["bars"][0]) - 1                  # 0-based index into full bars
        auto = ev["auto"]
        dist = min(abs(fb - a) for a in auto) if auto else 9
        s["boundary_novelty"] = r3(nov[fb])
        s["boundary_novelty_rank"] = r3(rank[fb])
        s["nearest_auto_boundary_bars"] = int(dist)
        same = [o for o in secs if o["group"] == s["group"] and o is not s]
        sims = []
        for o in same:
            a0, a1 = max(1, s["bars"][0]) - 1, s["bars"][1] - 1
            c0, c1 = max(1, o["bars"][0]) - 1, o["bars"][1] - 1
            sims.append((o["index"], aligned_sim(C, a0, min(a1, len(C) - 1), c0, min(c1, len(C) - 1))))
        s["repeat_similarity"] = {f"section_{i}": r3(v) for i, v in sims}
        rep = max([v for _, v in sims], default=None)
        # vocal entry evidence: a vocal phrase starts in [start-1.6 s, start+0.3 s] (pickup into the section)
        ventry = any(s["start"] - 1.6 <= v["start"] <= s["start"] + 0.3 for v in vocal_segs)
        s["vocal_entry"] = bool(ventry)
        b_conf = 0.45 * rank[fb] + 0.35 * (1.0 if dist == 0 else (0.6 if dist == 1 else 0.2)) + \
            0.2 * (1.0 if ventry else 0.0)
        if s["index"] == 0:
            b_conf = 1.0
        g_conf = 0.7 if rep is None else float(np.clip((rep - 0.1) / 0.6, 0, 1))
        s["confidence"] = r3(np.clip(0.6 * b_conf + 0.4 * g_conf, 0, 1))
        s["notes"] = f"{s['character']}. Notable: {s['notable']}."
    # occurrence numbering within label (chorus 1/2 ...)
    counts = {}
    for s in secs:
        counts[s["label"]] = counts.get(s["label"], 0) + 1
        s["occurrence"] = counts[s["label"]]
    return secs


# ================================================================================================================
# 7. vocal activity
# ================================================================================================================
def vocal_from_stem(path, inst_path, n):
    v, _ = librosa.load(path, sr=SR, mono=True)
    S = np.abs(librosa.stft(v, n_fft=2048, hop_length=HOP))[:, :n] ** 2
    fr = librosa.fft_frequencies(sr=SR, n_fft=2048)
    band = (fr > 150) & (fr < 5000)
    vdb = nd.uniform_filter1d(10 * np.log10(S[band].sum(0) + 1e-10), 7)
    rel = np.zeros_like(vdb)
    if os.path.exists(inst_path):
        u, _ = librosa.load(inst_path, sr=SR, mono=True)
        Si = np.abs(librosa.stft(u, n_fft=2048, hop_length=HOP))[:, :n] ** 2
        rel = vdb - nd.uniform_filter1d(10 * np.log10(Si[band].sum(0) + 1e-10), 7)
    ref = np.percentile(vdb, 90)
    on_thr, off_thr = ref - 9, ref - 13
    act = np.zeros(len(vdb), bool)
    on = False
    for i, x in enumerate(vdb):
        ok = rel[i] > -8
        if not on and x > on_thr and ok:
            on = True
        elif on and (x < off_thr or rel[i] < -15):
            on = False
        act[i] = on
    return act, vdb, {"method": f"separated vocal stem ({kit_env.rel(path)}) 150-5000 Hz energy, "
                                "70 ms smoothing, hysteresis on p90-9 dB / off p90-13 dB, vocal-vs-instrumental > -8 dB (off < -15 dB), "
                                "gaps < 0.18 s bridged",
                      "on_db": r3(on_thr), "off_db": r3(off_thr)}


def vocal_fallback(F, y):
    D = librosa.stft(y, n_fft=2048, hop_length=512)
    S = np.abs(D)
    melr = librosa.power_to_db(librosa.feature.melspectrogram(S=S ** 2, sr=SR, n_mels=64))
    rec = librosa.segment.recurrence_matrix(melr, mode="affinity", metric="cosine", sparse=True,
                                            width=int(librosa.time_to_frames(2, sr=SR, hop_length=512)))
    S_filter = np.minimum(S, librosa.decompose.nn_filter(S, rec=rec, aggregate=np.median))
    mask_v = librosa.util.softmask(S - S_filter, 6 * S_filter, power=2)
    fr = librosa.fft_frequencies(sr=SR, n_fft=2048)
    band = (fr > 250) & (fr < 4000)
    ratio = (mask_v * S)[band].sum(0) / (S[band].sum(0) + 1e-9)
    score = scipy.stats.rankdata(ratio) / len(ratio)
    try:
        from faster_whisper.vad import get_vad_model
        yfg = librosa.istft(mask_v * D, hop_length=512, length=len(y))
        y16 = librosa.resample(yfg, orig_sr=SR, target_sr=16000).astype(np.float32)
        y16 = y16 / (np.abs(y16).max() + 1e-9) * 0.9
        y16 = np.concatenate([y16, np.zeros((-len(y16)) % 512, np.float32)])
        probs = np.asarray(get_vad_model()(y16)).reshape(-1)
        tv = (np.arange(len(probs)) + 0.5) * 512 / 16000
        score = 0.5 * score + 0.5 * np.interp(np.arange(S.shape[1]) * 512 / SR, tv, probs)
    except Exception as ex:  # noqa
        log("Silero VAD unavailable:", repr(ex))
    score = np.interp(np.arange(F["n"]) / FPS, np.arange(len(score)) * 512 / SR, nd.uniform_filter1d(score, 6))
    act = np.zeros(F["n"], bool)
    on = False
    for i, x in enumerate(score):
        on = (x > 0.6) if not on else (x > 0.45)
        act[i] = on
    return act, score, {"method": "REPET-SIM foreground ratio (250-4000 Hz) + Silero VAD on foreground, hysteresis"}


def vocal_segments(act, music_start, cut):
    act = act.copy()
    act[: int(music_start * FPS)] = False
    act[int(cut * FPS):] = False
    act = nd.binary_closing(act, np.ones(int(0.18 * FPS)))
    lab, nlab = nd.label(act)
    segs = []
    for j in range(1, nlab + 1):
        w = np.where(lab == j)[0]
        a, b = w[0] / FPS, (w[-1] + 1) / FPS
        if b - a >= 0.25:
            segs.append({"start": r3(a), "end": r3(b)})
    return segs


# ================================================================================================================
# 8. onsets + impacts
# ================================================================================================================
def strong_onsets(F, beats, target=520):
    oenv = F["oenv"]
    on = librosa.onset.onset_detect(onset_envelope=oenv, sr=SR, hop_length=HOP, units="frames",
                                    pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=0.04, wait=6)
    base = nd.percentile_filter(oenv, 50, size=int(2 * FPS))
    strength = oenv[on] - base[on]
    keep = np.argsort(strength)[::-1][:target]
    on, strength = on[np.sort(keep)], strength[np.sort(keep)]
    norm = np.percentile(strength, 99)
    ref = {"kick": np.percentile(F["kick"], 97), "snare": np.percentile(F["snare"], 97),
           "hat": np.percentile(F["cym"], 97)}
    out = []
    for f, s in zip(on, strength):
        t = f / FPS
        k = int(np.searchsorted(beats, t + 0.04) - 1)
        pos = (t - beats[k]) / (beats[k + 1] - beats[k]) if 0 <= k < len(beats) - 1 else 0.0
        q = round(pos * 4) / 4
        grid = "beat" if q in (0.0, 1.0) else ("8th" if q == 0.5 else "16th")
        rel = {"kick": F["kick"][max(0, f - 2):f + 3].max() / ref["kick"],
               "snare": F["snare"][max(0, f - 2):f + 3].max() / ref["snare"],
               "hat": F["cym"][max(0, f - 2):f + 3].max() / ref["hat"]}
        band = max(rel, key=rel.get)
        if rel[band] < 0.5:
            band = "tonal"
        out.append({"t": r3(t), "strength": r3(min(1.0, s / norm)), "band": band, "grid": grid, "beat": k})   # band = rough guess
    return out


def detect_impacts(F, beats, downbeats, stops, sections, music_start, cut, tail_end):
    db = F["db"]
    low = F["db_low"]
    imps = []
    for s in sections:
        if s["label"] == "tail":
            continue
        if s["index"] == 0:
            imps.append({"t": r3(music_start), "strength": 0.6, "kind": "first_sound", "section": 0, "label": "intro"})
            continue
        a = int(s["start"] * FPS)
        jump = db[a:a + 90].mean() - (db[max(0, a - 90):a].mean() if a > 0 else -80)
        ljump = low[a:a + 90].mean() - (low[max(0, a - 90):a].mean() if a > 0 else -40)
        kind = "drop" if (ljump > 12 and s["label"] not in ("intro",)) else "section_start"
        st = 0.35 + max(0, jump) / 14 + 0.35 * s["energy"]
        if s["label"] in ("chorus", "last-chorus") and s["group"] == "chorus":
            st = max(st, 0.9 if s["label"] == "chorus" else 0.97)
        if kind == "drop":
            st = max(st, 0.8)
        if s["label"] == "break":
            kind = "breakdown"
            st = 0.55
        imps.append({"t": s["start"], "strength": r3(np.clip(st, 0, 1)), "kind": kind,
                     "section": s["index"], "label": s["label"], "jump_db": r3(jump), "low_jump_db": r3(ljump)})
    for st in stops:
        imps.append({"t": r3(st["start"]), "strength": r3(np.clip(st["depth_db"] / 25, 0.2, 0.8)),
                     "kind": st["kind"], "end": r3(st["end"]), "depth_db": r3(st["depth_db"])})
    # big transient hits standing out from their 4 s context
    lowj = np.maximum(0, np.diff(nd.uniform_filter1d(low, 5), prepend=low[0]))
    hij = np.maximum(0, np.diff(nd.uniform_filter1d(F["db_high"], 5), prepend=F["db_high"][0]))
    comb = zs(F["oenv"]) + 0.6 * zs(lowj) + 0.6 * zs(hij)
    ex = comb - nd.percentile_filter(comb, 90, size=int(4 * FPS))
    thr = np.percentile(ex, 99.3)
    pk, _ = ss.find_peaks(ex, height=thr, distance=int(1.5 * FPS))
    exmax = ex[pk].max() if len(pk) else thr + 1
    existing = [i["t"] for i in imps]
    for p in pk:
        t = p / FPS
        if t < music_start or t > cut or any(abs(t - e) < 0.35 for e in existing):
            continue
        onbar = bool(np.min(np.abs(downbeats - t)) < 0.06)
        imps.append({"t": r3(t), "strength": r3(np.clip(0.4 + 0.35 * (ex[p] - thr) / (exmax - thr) + (0.1 if onbar else 0),
                                                        0, 0.85)),
                     "kind": "hit", "on_downbeat": onbar})
    kd = int(np.argmin(np.abs(downbeats - cut)))
    note = (f"music stops dead on the downbeat of bar {kd + 1}; only reverb tail after"
            if abs(downbeats[kd] - cut) < 0.1 else "music stops / fades below the loud level; only tail after")
    imps.append({"t": r3(cut), "strength": 1.0, "kind": "final_cut", "note": note})
    imps.append({"t": r3(tail_end), "strength": 0.2, "kind": "end_of_tail"})
    imps.sort(key=lambda d: d["t"])
    return imps


# ================================================================================================================
# 9. 30 fps envelope
# ================================================================================================================
def release_smooth(x, release_ms):
    out = np.empty_like(x)
    ra = math.exp(-1000.0 / (VIDEO_FPS * release_ms))
    v = x[0]
    for i, s in enumerate(x):
        v = s if s > v else ra * v + (1 - ra) * s
        out[i] = v
    return out


def phase_of(grid, t):
    k = np.searchsorted(grid, t, side="right") - 1
    ph = np.zeros_like(t)
    idx = k.copy()
    for i, (kk, tv) in enumerate(zip(k, t)):
        if kk < 0:
            ph[i] = ((tv - grid[0]) / (grid[1] - grid[0])) % 1.0
        elif kk >= len(grid) - 1:
            ph[i] = ((tv - grid[-1]) / (grid[-1] - grid[-2])) % 1.0
        else:
            ph[i] = (tv - grid[kk]) / (grid[kk + 1] - grid[kk])
    return np.clip(ph, 0, 0.9999), idx


def envelope_30fps(y48, F, beats, downbeats, duration, music_start, cut, vocal_segs):
    nfr = int(math.ceil(duration * VIDEO_FPS - 1e-9))
    P = np.abs(librosa.stft(y48, n_fft=4096, hop_length=VHOP, center=True))[:, :nfr] ** 2
    fr = librosa.fft_frequencies(sr=SR_NATIVE, n_fft=4096)
    rms = librosa.feature.rms(y=y48, frame_length=3200, hop_length=VHOP, center=True)[0][:nfr]
    tt = np.arange(nfr) / VIDEO_FPS
    active = (tt >= music_start) & (tt <= cut)
    meta = {}

    def norm_db(p, key, rng=30.0):
        # dB -> 0..1 between floor = max(p5, ceil-30 dB) and ceil = p99.7 of the music frames
        d = 10 * np.log10(p + 1e-12)
        hi = np.percentile(d[active], 99.7)
        lo = max(np.percentile(d[active], 5), hi - rng)
        meta[key] = {"db_ceil(p99.7)": r3(hi), "db_floor(max(p5,ceil-30))": r3(lo)}
        return np.clip((d - lo) / (hi - lo), 0, 1)

    out = {"rms": release_smooth(norm_db(rms ** 2, "rms"), 110)}
    for name, lo, hi in (("low", 20, 150), ("mid", 150, 2000), ("high", 2000, 12000)):
        m = (fr >= lo) & (fr < hi)
        out[name] = release_smooth(norm_db(P[m].sum(0), name), 90)
    oenv = F["oenv"]
    on = np.zeros(nfr)
    for i in range(nfr):
        a = max(0, int(round((i - 0.5) / VIDEO_FPS * FPS)))
        b = max(a + 1, int(round((i + 0.5) / VIDEO_FPS * FPS)))
        seg = oenv[a:b]
        on[i] = seg.max() if len(seg) else 0.0
    out["onset"] = np.clip(on / np.percentile(on[active], 99.5), 0, 1)
    out["beat_phase"], beat_idx = phase_of(beats, tt)
    out["bar_phase"], bar_idx = phase_of(downbeats, tt)
    voc = np.zeros(nfr, int)
    for s in vocal_segs:
        voc[(tt >= s["start"]) & (tt < s["end"])] = 1
    env = {"fps": VIDEO_FPS, "frames": nfr, "duration": r3(duration),
           "frame_time": "t = frame / 30 s (frame centre; STFT center=True, hop 1600 @ 48 kHz)",
           "fields": {
               "rms": "broadband loudness: dB mapped [floor..ceil] -> 0..1 (see normalization), instant attack, 110 ms release",
               "low": "20-150 Hz band energy (kick/bass), same dB mapping, 90 ms release",
               "mid": "150-2000 Hz band energy (vocal/guitars/keys body), same mapping",
               "high": "2-12 kHz band energy (cymbals/air/sibilance), same mapping",
               "onset": "log-mel spectral-flux onset strength, max-pooled per frame, / p99.5, clipped 0..1 (unsmoothed)",
               "beat_phase": "0..1 position inside the current beat (0 = on the beat)",
               "bar_phase": "0..1 position inside the current 4/4 bar (0 = downbeat)",
               "beat": "index into audio.json beats of the current beat (-1 before the first beat)",
               "bar": "bar number (= audio.json bars[].index; 1 = first full bar, 0 = pickup / before)",
               "vocal": "1 inside an audio.json vocal_activity segment"},
           "normalization": meta}
    for k in ("rms", "low", "mid", "high", "onset", "beat_phase", "bar_phase"):
        env[k] = [r3(v) for v in out[k]]
    env["beat"] = [int(v) for v in beat_idx]
    env["bar"] = [int(max(0, v + 1)) for v in bar_idx]
    env["vocal"] = [int(v) for v in voc]
    return env, out, tt


# ================================================================================================================
# 10. plots
# ================================================================================================================
def plot_overview(path, y48, duration, env, envraw, tt, beats, downbeats, sections, impacts, vocal, onsets, bpm_bars,
                  phase=1, title="song"):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    from matplotlib import font_manager
    have = {f.name for f in font_manager.fontManager.ttflist}   # only installed families (no findfont warnings)
    plt.rcParams["font.family"] = [f for f in ("Yu Gothic", "Meiryo", "Microsoft YaHei", "MS Gothic", "Hiragino Sans",
                                               "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP")
                                   if f in have] + ["DejaVu Sans"]
    W, H, DPI = 4000, 1400, 100
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor="#101218")
    gs = fig.add_gridspec(5, 1, height_ratios=[0.55, 3.0, 2.1, 1.6, 0.9], hspace=0.06,
                          left=0.012, right=0.995, top=0.965, bottom=0.04)
    axes = [fig.add_subplot(gs[i]) for i in range(5)]
    for ax in axes:
        ax.set_facecolor("#15181f")
        ax.set_xlim(0, duration)
        for sp in ax.spines.values():
            sp.set_color("#333a45")
        ax.tick_params(colors="#aab2bf", labelsize=9)
    drift = bpm_bars[-1] / bpm_bars[0] - 1
    trend = " (accelerando)" if drift > 0.015 else (" (ritardando)" if drift < -0.015 else "")
    fig.suptitle("%s — audio map   |   %d beats, %d bars, tempo %.1f→%.1f BPM%s, 4/4, "
                 "downbeat = beats[k], k%%4==%d" % (title, len(beats), len(bpm_bars), bpm_bars[0], bpm_bars[-1], trend,
                                                    phase), color="#e8ecf2", fontsize=15, x=0.012, ha="left", y=0.992)
    # --- row 0: section strip
    ax = axes[0]
    for s in sections:
        c = section_color(s)
        ax.add_patch(Rectangle((s["start"], 0), s["end"] - s["start"], 1, color=c, alpha=0.9, lw=0))
        if s["end"] - s["start"] < 1.0:
            continue
        short = s["end"] - s["start"] < 4.0
        txt = f"{s['name']}\nb{s['bars'][0]}-{s['bars'][1]}" if short else \
            f"{s['name']}\n[{s['group']}]  b{s['bars'][0]}-{s['bars'][1]}"
        ax.text((s["start"] + s["end"]) / 2, 0.5, txt, ha="center", va="center", fontsize=7 if short else 8.5,
                color="white", fontweight="bold")
    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.set_xticks([])
    # --- row 1: waveform
    ax = axes[1]
    npx = 3900
    hop = len(y48) // npx
    yy = y48[: hop * npx].reshape(npx, hop)
    tx = (np.arange(npx) + 0.5) * hop / SR_NATIVE
    ax.fill_between(tx, yy.min(1), yy.max(1), color="#8fb3ff", lw=0, alpha=0.85)
    r = np.sqrt((yy ** 2).mean(1))
    ax.fill_between(tx, -r, r, color="#e8f0ff", lw=0, alpha=0.9)
    for s in sections:
        ax.axvspan(s["start"], s["end"], color=section_color(s), alpha=0.10, lw=0)
        ax.axvline(s["start"], color="#ffffff", lw=1.2, alpha=0.8)
        ax.text(s["start"] + 0.3, 0.97, f"{mmss(s['start'])}", color="#ffe08a", fontsize=8.5, va="top",
                transform=ax.get_xaxis_transform())
    for v in vocal:
        ax.add_patch(Rectangle((v["start"], -1.0), v["end"] - v["start"], 0.07, color="#ff7eb6", alpha=0.95, lw=0))
    ax.text(0.2, -0.93, "vocal", color="#ff7eb6", fontsize=8)
    ax.set_ylim(-1.02, 1.02)
    ax.set_yticks([])
    ax.set_xticks([])
    # --- row 2: energies
    ax = axes[2]
    ax.fill_between(tt, 0, envraw["rms"], color="#ffffff", alpha=0.18, lw=0, label="rms")
    ax.plot(tt, envraw["low"], color="#ff5a5a", lw=0.8, label="low 20-150")
    ax.plot(tt, envraw["mid"], color="#5ad17a", lw=0.8, label="mid 150-2k")
    ax.plot(tt, envraw["high"], color="#5ab4ff", lw=0.8, label="high 2k-12k")
    for s in sections:
        ax.axvline(s["start"], color="#ffffff", lw=1.0, alpha=0.5)
        ax.hlines(s["energy"], s["start"], s["end"], color="#ffe08a", lw=2.2, alpha=0.9)
    ax.set_ylim(0, 1.05)
    ax.legend(loc="upper left", ncol=5, fontsize=9, facecolor="#15181f", labelcolor="#dde", framealpha=0.8)
    ax.set_xticks([])
    ax.text(duration - 0.5, 1.0, "yellow = section mean energy", color="#ffe08a", fontsize=8, ha="right", va="top")
    # --- row 3: onset + beats + downbeats + impacts
    ax = axes[3]
    ax.plot(tt, envraw["onset"], color="#b58cff", lw=0.6, alpha=0.9)
    ax.vlines(beats, 0, 0.12, color="#aab2bf", lw=0.5, alpha=0.7)
    ax.vlines(downbeats, 0, 0.3, color="#ffffff", lw=1.0, alpha=0.9)
    for j, d in enumerate(downbeats):
        if j % 4 == 0:
            ax.text(d, 0.32, str(j + 1), color="#dde3ea", fontsize=7, ha="center")
    ax.text(0.2, 0.42, "bar #", color="#dde3ea", fontsize=7)
    ost = [o for o in onsets if o["strength"] > 0.55]
    ax.scatter([o["t"] for o in ost], [o["strength"] * 0.9 for o in ost], s=6, color="#e0c0ff", zorder=3)
    km = {"drop": ("v", "#ff3b3b", 150), "section_start": ("v", "#ffd23b", 90), "breakdown": ("v", "#9aa3ad", 70),
          "stop": ("x", "#ff9d3b", 60), "gap": ("x", "#7d6a55", 25), "hit": ("*", "#ffffff", 70),
          "final_cut": ("D", "#ff3b3b", 120), "end_of_tail": ("|", "#888", 60)}
    for im in impacts:
        mk, c, sz = km.get(im["kind"], ("o", "#fff", 30))
        ax.scatter([im["t"]], [1.08], marker=mk, s=sz * (0.5 + im["strength"]), color=c, zorder=4)
        if im["kind"] in ("drop", "final_cut", "stop") or (im["kind"] == "section_start" and im["strength"] > .7):
            ax.text(im["t"], 1.2, im["kind"].replace("section_start", "start"), color=c, fontsize=7.5,
                    ha="center", rotation=0)
    ax.set_ylim(0, 1.32)
    ax.set_yticks([])
    ax.set_xticks([])
    # --- row 4: tempo curve
    ax = axes[4]
    db_t = downbeats[: len(bpm_bars)]
    ax.plot(db_t, bpm_bars, color="#7cf0c8", lw=1.5)
    ax.set_ylim(min(bpm_bars) - 0.8, max(bpm_bars) + 0.8)
    ax.text(0.3, max(bpm_bars) + 0.2, "local BPM per bar", color="#7cf0c8", fontsize=8, va="top")
    ax.set_xticks(np.arange(0, duration, 5))
    ax.set_xticklabels([mmss(x)[:5] for x in np.arange(0, duration, 5)], fontsize=8.5)
    for a in axes[1:]:
        a.set_xticks(np.arange(0, duration, 5), minor=False) if a is ax else None
        a.grid(axis="x", color="#2a2f38", lw=0.6)
    for a in axes[1:4]:
        for x in np.arange(0, duration, 5):
            a.axvline(x, color="#2a2f38", lw=0.5, zorder=0)
    fig.savefig(path, dpi=DPI, facecolor=fig.get_facecolor())
    plt.close(fig)


def plot_ssm(path, ev, sections, fullbars):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axs = plt.subplots(1, 2, figsize=(22, 11.5), dpi=90, facecolor="white")
    n = len(fullbars)
    for ax, M, title in ((axs[0], ev["S_chroma"], "bar chroma (4 beats stacked, centred) cosine"),
                         (axs[1], ev["S_mfcc"], "bar MFCC (mean+std) similarity")):
        ax.imshow(M, origin="lower", cmap="magma", extent=[0.5, n + 0.5, 0.5, n + 0.5],
                  vmin=np.percentile(M, 20), vmax=np.percentile(M, 99.5))
        for s in sections:
            b = max(1, s["bars"][0]) - 0.5
            ax.axvline(b, color="cyan", lw=0.6, alpha=0.7)
            ax.axhline(b, color="cyan", lw=0.6, alpha=0.7)
            ax.text(b + 0.3, n + 1.2, f"{s['label'][:6]}\n{s['group']}", fontsize=6.5, rotation=90, va="bottom")
        ax.set_title(title, pad=70)
        ax.set_xlabel("bar")
        ax.set_ylabel("bar")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


# ================================================================================================================
# 11. markdown
# ================================================================================================================
def write_md(path, A, secs, impacts, bars_full, stops, title="song", curated=False):
    """docs/AUDIO_MAP.md. curated=True: the hand-written narrative of the 残光 example (built-in CURATED table);
    otherwise a data-driven version that holds for any song."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not curated:
        return write_md_generic(path, A, secs, impacts, bars_full, stops, title)
    t = A["tempo"]
    di = A["downbeat_info"]
    fps = VIDEO_FPS
    music = [s for s in secs if s["label"] != "tail"]
    L = []
    L.append(f"# {title} — AUDIO MAP\n")
    L.append("Generated by `tools/analyze_audio.py` from `%s` (48 kHz stereo, %.2f s). "
             "Machine data: `analysis/audio.json`; per-frame curves: `analysis/envelope_30fps.json` "
             "(30 fps, %d frames); visual check: `analysis/overview.png`, `analysis/ssm.png`. "
             "Frame numbers below are @30 fps (`frame = round(t*30)`).\n" % (A["source"], A["duration"], A["frames_30fps"]))
    L.append("## Tempo / meter\n")
    L.append(f"- **BPM ≈ {t['bpm']:.1f}** (song average). The track **accelerates smoothly** from "
             f"**{t['bpm_start']:.1f} BPM** (intro) to **{t['bpm_end']:.1f} BPM** (outro), "
             f"+{100 * (t['bpm_end'] / t['bpm_start'] - 1):.1f}% — a live-feel push, not a click-track grid. "
             "Never animate on a fixed 130 BPM grid: read `beats[]` / `downbeats[]` from audio.json, or "
             "`beat_phase` / `bar_phase` per frame from the envelope file (per-bar tempo: `bars[].bpm`).")
    L.append("- Estimators: " + ", ".join(f"{k} {v:.2f}" for k, v in t["estimators"].items()) +
             f". Octave check: {t['octave_check']['verdict']}. Tempo confidence **{t['confidence']:.2f}**.")
    L.append(f"- **Meter 4/4**. Downbeat = `beats[k]` with `k % 4 == {di['winning_phase']}` "
             f"(confidence **{di['confidence']:.2f}**): bass-chroma changes and the big bass re-entries "
             f"(count per phase {di['per_feature_phase_means']['bass_reentries(count of top low-band jumps)']}) "
             "land on it; kick on beats 1 & 3, snare on 2 & 4. All section repeats are whole bars apart - "
             "no odd bars, no meter changes.")
    L.append(f"- **{len(A['beats'])} beats, {len(bars_full)} full bars** (+ one pickup beat at "
             f"{A['beats'][0]:.2f} s = bar 0). Bar 1 starts at {bars_full[0]['start']:.2f} s. Beat "
             f"{60 / t['bpm_start'] * 1000:.0f} ms → {60 / t['bpm_end'] * 1000:.0f} ms "
             f"({60 / t['bpm_start'] * fps:.1f} → {60 / t['bpm_end'] * fps:.1f} frames); bar "
             f"{240 / t['bpm_start']:.2f} s → {240 / t['bpm_end']:.2f} s "
             f"({240 / t['bpm_start'] * fps:.1f} → {240 / t['bpm_end'] * fps:.1f} frames).")
    L.append(f"- First sound **{A['music_start']:.2f} s**. Music **cuts dead at {A['music_cut']:.2f} s** "
             f"(frame {int(round(A['music_cut'] * fps))}, the downbeat of bar {len(bars_full) + 1}); "
             f"only a reverb tail follows until {A['duration']:.2f} s (frame {A['frames_30fps'] - 1}). "
             "**There is no fade-out.**")
    L.append("- Phrase structure: sections are built from 4-bar phrases; each chorus is one 4-bar phrase played "
             "twice (bar-chroma self-match 0.93-0.98 at a 4-bar lag) followed by a 1-bar stop.\n")
    L.append("## Timeline\n")
    L.append("| # | start | end | frames | section | group | bars | #bars | energy | vocal | character / mood | "
             "notable hits |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for s in secs:
        L.append(f"| {s['index']} | {mmss(s['start'])} | {mmss(s['end'])} | "
                 f"{int(round(s['start'] * fps))}–{int(round(s['end'] * fps))} | **{s['name']}** ({s['label']}) | "
                 f"{s['group']} | {s['bars'][0]}–{s['bars'][1]} | {s['bar_count']} | {s['energy']:.2f} | "
                 f"{s['vocal_fraction']:.0%} | {s['character']} | {s['notable']} |")
    L.append("\n- `energy` = mean of the 0..1 `rms` envelope over the section (song range: "
             f"quietest {min(s['energy'] for s in music):.2f}, loudest {max(s['energy'] for s in music):.2f}). "
             "The master is compressed, so contrast comes mostly from arrangement (bass in/out) - "
             "use `low` to feel the breakdowns.")
    L.append("- `group` = same material. Measured aligned bar-chroma similarity: chorus vs chorus 0.80-0.85, "
             "pre vs pre 0.62, break vs break 0.67-0.78, intro riff vs outro riff 0.56, post vs interlude 0.41, "
             "verse 1 vs verse 2 only 0.38 (same role, different arrangement). Per-pair values: "
             "`sections[].repeat_similarity` in audio.json.")
    vt = sum(v["end"] - v["start"] for v in A["vocal_activity"])
    L.append(f"- Total {len(bars_full)} bars. Vocals cover {vt:.0f} s; instrumental windows: intro 0-17.8 s, "
             "post-chorus 79.5-84.8 s, most of the interlude 147-154.5 s, outro 213-223.5 s. Lyric lines "
             "(analysis/lyrics_draft.lrc from the lyric agent) start 0.2-1.5 s BEFORE their section downbeats "
             "(pickups): the hook 「救って救って」 begins ~1 s before each chorus downbeat - start the lyric animation "
             "on the pickup, land the big visual hit on the downbeat.\n")
    L.append("## Stops, breakdowns and drops (sync candidates)\n")
    L.append("| time | frame | kind | detail |")
    L.append("|---|---|---|---|")
    for im in impacts:
        if im["kind"] not in ("stop", "drop", "final_cut", "breakdown", "first_sound"):
            continue
        if im["kind"] == "stop":
            det = f"level dips {im['depth_db']:.0f} dB until {mmss(im['end'])}"
        elif im["kind"] == "drop":
            det = f"bass re-enters (+{im['low_jump_db']:.0f} dB low band) -> {secs[im['section']]['name']}"
        elif im["kind"] == "breakdown":
            det = f"bass drops out ({im['low_jump_db']:.0f} dB) -> {secs[im['section']]['name']}"
        elif im["kind"] == "first_sound":
            det = "first audible sound (pickup beat)"
        else:
            det = im.get("note", "")
        L.append(f"| {mmss(im['t'])} | {int(round(im['t'] * fps))} | {im['kind']} | {det} |")
    ng = sum(1 for s in stops if s["kind"] == "gap")
    hits = sorted([i for i in impacts if i["kind"] == "hit"], key=lambda d: -d["strength"])
    L.append(f"\nAlso in `impacts[]`: {ng} short `gap` events (0.1-0.3 s staccato dips, mostly verse 1a - ideal for "
             f"hard cuts / freeze frames) and {len(hits)} isolated `hit` transients (crash/kick accents that stand "
             "out from their 4 s context), strongest: " + ", ".join(mmss(h["t"]) for h in hits[:8]) + ".\n")
    L.append("## Where the biggest visual moments should land\n")
    ch = [s for s in secs if s["group"] == "chorus"]
    L.append("1. **Chorus downbeats** - the three hook entries: " + ", ".join(
        f"**{mmss(s['start'])}** (frame {int(round(s['start'] * fps))}, bar {s['bars'][0]}, {s['name']})"
        for s in ch) +
        ". Each is preceded by a breakdown with the bass removed: build tension in the break (slow push-in, "
        "desaturate, hold a lyric) and release everything on the downbeat (full-frame flash, smash cut, "
        "typography explosion).")
    pc = [s for s in secs if s["group"] == "post"]
    pim = [i for i in impacts if i.get("section") == pc[0]["index"]][0]
    L.append(f"2. **Post-chorus slam {mmss(pc[0]['start'])} (frame {int(round(pc[0]['start'] * fps))}, bar "
             f"{pc[0]['bars'][0]})** - the biggest bass hit of the song (+{pim['jump_db']:.0f} dB overall, "
             f"+{pim['low_jump_db']:.0f} dB low band straight out of a stop) while the vocals rest until ~01:24.8: "
             "the best slot for a pure motion-graphics / 3D showcase shot. Its sibling after chorus 2 is at "
             f"{mmss(pc[1]['start'])} (frame {int(round(pc[1]['start'] * fps))}).")
    endstops = []
    for s in [x for x in secs if x["group"] in ("chorus", "chorus-ext") and x["bar_count"] == 9 or
              x["group"] == "chorus-ext"]:
        last_bar = bars_full[s["bars"][1] - 1]
        ev = [st for st in stops if last_bar["start"] - 0.1 <= st["start"] <= last_bar["end"]]
        txt = f"{mmss(last_bar['start'])}-{mmss(last_bar['end'])} (bar {s['bars'][1]}, end of {s['name']}"
        txt += (f"; deepest silence {mmss(ev[0]['start'])}-{mmss(ev[-1]['end'])})" if ev else ")")
        endstops.append(txt)
    L.append("3. **Chorus-ending stop bars** (bass and band drop out for the last bar of every chorus): " +
             "; ".join(endstops) + " - freeze frame / black frame / everything hangs in the air, then slam on "
             "the next downbeat.")
    br = [s for s in secs if s["label"] == "break"]
    L.append(f"4. **Pre-last-chorus breakdown {mmss(br[-1]['start'])}-{mmss(br[-1]['end'])}** - the calmest "
             "moment of the second half: emotional close-up / slow-motion lyric; then the last chorus at "
             f"**{mmss(ch[-1]['start'])}** (frame {int(round(ch[-1]['start'] * fps))}) is the climax payoff.")
    ext = [s for s in secs if s["group"] == "chorus-ext"][0]
    L.append(f"5. **Climax reprise {mmss(ext['start'])}-{mmss(ext['end'])}** (loudest passage, varied chorus "
             "repeat): maximum density, fastest cutting (every beat or every 8th), camera energy at its peak.")
    riff = [s for s in secs if s["group"] == "riff"]
    L.append(f"6. **Intro riff {mmss(riff[0]['start'])}** and its reprise in the **outro "
             f"{mmss(riff[-1]['start'])}** - bookend the video with the same visual motif / logo move.")
    L.append(f"7. **Final cut {A['music_cut']:.2f} s (frame {int(round(A['music_cut'] * fps))})** - the music stops "
             "dead on a downbeat: cut to black or to the title card exactly there, and let the reverb tail "
             f"({A['music_cut']:.2f}-{A['duration']:.2f} s) carry a 残光 / afterglow fade.")
    L.append("8. **Texture sync**: `low` -> scale / shake on kicks and bass slams, `high` -> sparkle / glow, "
             "`onset` -> flashes and stroke jitter, `bar_phase` -> per-bar loops (e.g. a ring rotating once per "
             "bar), `beat_phase` -> pulses, `vocal` -> show/hide lyric layers.\n")
    L.append("## Reliability notes\n")
    bt = A["beat_tracking"]
    L.append(f"- Beat grid: time-varying-tempo tracking -> robust spline -> snapped to onsets "
             f"({bt['snapped_to_onset_fraction']:.0%} snapped). Residual vs the smooth grid: median "
             f"{bt['spline_residual_ms_median']:.0f} ms, p90 {bt['spline_residual_ms_p90']:.0f} ms "
             "(well under one 33 ms video frame).")
    low = sorted(music, key=lambda s: s["confidence"])[:4]
    L.append("- Sections: boundaries and labels were chosen from bar-level novelty (MFCC / chroma / bass in-out / "
             "stops) and aligned chroma repetition (see `analysis/ssm.png`), then re-validated by the script "
             "(`confidence`). Lowest-confidence calls: " +
             ", ".join(f"{s['name']} at {mmss(s['start'])} ({s['confidence']:.2f})" for s in low) +
             " - arrangement/lyric boundaries without a strong timbre change.")
    L.append("- Vocal activity comes from the separated vocal stem (energy threshold, breaths < 0.18 s bridged); "
             "the interlude 147-154 s contains faint vocal-like chops. The lyric/ASR agent's word timings are more "
             "precise for per-syllable work.")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


def write_md_generic(path, A, secs, impacts, bars_full, stops, title):
    """AUDIO_MAP.md for any song: every statement is computed from the analysis (no song-specific prose)."""
    t = A["tempo"]
    di = A["downbeat_info"]
    fps = VIDEO_FPS
    fr = lambda x: int(round(x * fps))  # noqa: E731
    music = [s for s in secs if s["label"] != "tail"]
    drift = 100 * (t["bpm_end"] / t["bpm_start"] - 1)
    L = [f"# {title} — AUDIO MAP\n"]
    L.append(f"Generated by `tools/analyze_audio.py` from `{A['source']}` ({A['duration']:.2f} s, analysed at 48 kHz). "
             "Machine data: `analysis/audio.json`; per-frame curves: `analysis/envelope_30fps.json` "
             f"(30 fps, {A['frames_30fps']} frames); visual check: `analysis/overview.png`, `analysis/ssm.png`; "
             "listen check: `analysis/click_preview.m4a`. Frame numbers below are @30 fps (`frame = round(t*30)`).\n")
    src = A["sections_source"]
    L.append(f"Sections: **{src}**." + (
        " They are automatic (novelty boundaries + chroma-repetition groups A, B, C ...): listen, look at "
        "`analysis/overview.png` / `analysis/ssm.png`, then copy `analysis/sections_auto.json` to "
        "`analysis/sections.json` and curate it (objects or rows `[first_bar, last_bar, label, group, name, "
        "character, notable]`, e.g. "
        "`[34, 42, \"chorus\", \"chorus\", \"Chorus 1\", \"full band + hook\", \"downbeat = first payoff\"]`) "
        "and re-run.\n" if src == "auto" else "\n"))
    L.append("## Tempo / meter\n")
    if abs(drift) >= 1.5:
        L.append(f"- **BPM ≈ {t['bpm']:.1f}** (song average); the tempo drifts from **{t['bpm_start']:.1f}** to "
                 f"**{t['bpm_end']:.1f} BPM** ({drift:+.1f}%). Never animate on a fixed grid: read `beats[]` / "
                 "`downbeats[]` from audio.json, or `beat_phase` / `bar_phase` per frame from the envelope file "
                 "(per-bar tempo: `bars[].bpm`).")
    else:
        L.append(f"- **BPM ≈ {t['bpm']:.1f}** (steady: {t['bpm_start']:.1f} → {t['bpm_end']:.1f} BPM). Still read "
                 "`beats[]` / `downbeats[]` (or `beat_phase` / `bar_phase` per frame) instead of computing a grid.")
    rng = t.get("search_range_bpm") or [0, 0]
    L.append("- Estimators: " + ", ".join(f"{k} {v:.2f}" for k, v in t["estimators"].items()) +
             f". Search range {rng[0]:.1f}-{rng[1]:.1f} BPM. Tempo confidence **{t['confidence']:.2f}** - if the "
             "clicks in `analysis/click_preview.m4a` run at double / half speed, re-run with `--bpm-range LO,HI`.")
    L.append(f"- **Meter 4/4** (assumed). Downbeat = `beats[k]` with `k % 4 == {di['winning_phase']}` "
             f"(confidence **{di['confidence']:.2f}**; if the bar starts sound wrong, curate sections by ear).")
    pick = [b for b in A["bars"] if b.get("pickup")]
    L.append(f"- **{len(A['beats'])} beats, {len(bars_full)} full bars**" +
             (f" (+ {pick[0]['beats']} pickup beat(s) from {pick[0]['start']:.2f} s = bar 0)" if pick else "") +
             f". Bar 1 starts at {bars_full[0]['start']:.2f} s. At the start a beat is "
             f"{60 / t['bpm_start'] * 1000:.0f} ms ({60 / t['bpm_start'] * fps:.1f} frames), a bar "
             f"{240 / t['bpm_start']:.2f} s ({240 / t['bpm_start'] * fps:.1f} frames).")
    fc = [i for i in impacts if i["kind"] == "final_cut"]
    L.append(f"- First sound **{A['music_start']:.2f} s**. Music ends at **{A['music_cut']:.2f} s** "
             f"(frame {fr(A['music_cut'])}{'; ' + fc[0]['note'] if fc else ''}); the file runs to "
             f"{A['duration']:.2f} s (frame {A['frames_30fps'] - 1}).\n")
    L.append("## Timeline\n")
    L.append("| # | start | end | frames | section | group | bars | #bars | energy | vocal | character / mood | "
             "notable hits |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for s in secs:
        L.append(f"| {s['index']} | {mmss(s['start'])} | {mmss(s['end'])} | {fr(s['start'])}–{fr(s['end'])} | "
                 f"**{s['name']}** ({s['label']}) | {s['group']} | {s['bars'][0]}–{s['bars'][1]} | {s['bar_count']} | "
                 f"{s['energy']:.2f} | {s['vocal_fraction']:.0%} | {s['character']} | {s['notable']} |")
    L.append("\n- `energy` = mean of the 0..1 `rms` envelope over the section (song range: "
             f"quietest {min(s['energy'] for s in music):.2f}, loudest {max(s['energy'] for s in music):.2f}). "
             "Masters are compressed, so contrast often comes from the arrangement - use `low` (20-150 Hz) to feel "
             "bass in/out and breakdowns.")
    L.append("- `group` = same material (aligned bar-chroma similarity; per-pair values in "
             "`sections[].repeat_similarity` of audio.json).")
    vs = A["vocal_activity"]
    vt = sum(v["end"] - v["start"] for v in vs)
    windows, prev = [], A["music_start"]
    for v in vs:
        if v["start"] - prev >= 4.0:
            windows.append((prev, v["start"]))
        prev = max(prev, v["end"])
    if A["music_cut"] - prev >= 4.0:
        windows.append((prev, A["music_cut"]))
    L.append(f"- Vocals cover {vt:.0f} s" + ("; instrumental windows (>= 4 s without vocals): " +
                                            ", ".join(f"{mmss(a)}-{mmss(b)}" for a, b in windows) if windows else "") +
             ". Lyric lines usually start slightly BEFORE their section downbeat (pickups): start the lyric "
             "animation on the pickup, land the big visual hit on the downbeat.\n")
    L.append("## Stops, breakdowns and drops (sync candidates)\n")
    L.append("| time | frame | kind | detail |")
    L.append("|---|---|---|---|")
    for im in impacts:
        if im["kind"] not in ("stop", "drop", "final_cut", "breakdown", "first_sound"):
            continue
        if im["kind"] == "stop":
            det = f"level dips {im['depth_db']:.0f} dB until {mmss(im['end'])}"
        elif im["kind"] == "drop":
            det = f"bass re-enters (+{im['low_jump_db']:.0f} dB low band) -> {secs[im['section']]['name']}"
        elif im["kind"] == "breakdown":
            det = f"bass drops out ({im['low_jump_db']:.0f} dB) -> {secs[im['section']]['name']}"
        elif im["kind"] == "first_sound":
            det = "first audible sound"
        else:
            det = im.get("note", "")
        L.append(f"| {mmss(im['t'])} | {fr(im['t'])} | {im['kind']} | {det} |")
    ng = sum(1 for s in stops if s["kind"] == "gap")
    hits = sorted([i for i in impacts if i["kind"] == "hit"], key=lambda d: -d["strength"])
    L.append(f"\nAlso in `impacts[]`: {ng} short `gap` events (0.1-0.3 s dips - good for hard cuts / freeze frames) "
             f"and {len(hits)} isolated `hit` transients (accents that stand out from their 4 s context)" +
             (", strongest: " + ", ".join(mmss(h["t"]) for h in hits[:8]) if hits else "") + ".\n")
    L.append("## Candidate moments for the biggest visual hits\n")
    items = []
    drops = sorted([i for i in impacts if i["kind"] == "drop"], key=lambda d: -d.get("low_jump_db", 0))
    if drops:
        items.append("**Bass drops** (bass re-enters after a thin passage - release everything on the downbeat): " +
                     ", ".join(f"**{mmss(d['t'])}** (frame {fr(d['t'])}, +{d['low_jump_db']:.0f} dB low, "
                               f"{secs[d['section']]['name']})" for d in drops[:6]) + ".")
    jumps = sorted([i for i in impacts if i["kind"] in ("drop", "section_start") and i.get("jump_db", 0) > 1.0],
                   key=lambda d: -d["jump_db"])
    if jumps:
        items.append("**Biggest energy jumps at section starts** (smash cuts, reveals, title moments): " +
                     ", ".join(f"**{mmss(d['t'])}** (frame {fr(d['t'])}, {d['jump_db']:+.0f} dB, "
                               f"{secs[d['section']]['name']})" for d in jumps[:4]) + ".")
    loud = sorted(music, key=lambda s: -s["energy"])[:3]
    items.append("**Loudest sections** (maximum density, fastest cutting, camera energy at its peak): " +
                 ", ".join(f"{s['name']} {mmss(s['start'])}-{mmss(s['end'])} (energy {s['energy']:.2f})"
                           for s in loud) + ".")
    quiet = sorted(music, key=lambda s: s["energy"])[:2]
    items.append("**Quietest sections** (close-ups, slow lyric holds, the calm before a payoff): " +
                 ", ".join(f"{s['name']} {mmss(s['start'])}-{mmss(s['end'])} (energy {s['energy']:.2f})"
                           for s in quiet) + ".")
    by_group = {}
    for s in music:
        by_group.setdefault(s["group"], []).append(s)
    rep = {g: v for g, v in by_group.items() if len(v) >= 2}
    if rep:
        items.append("**Repeated material** (reuse one visual motif per group and escalate it each time): " +
                     "; ".join(f"group {g}: " + ", ".join(mmss(s["start"]) for s in v) for g, v in rep.items()) + ".")
    stopl = [i for i in impacts if i["kind"] == "stop"]
    if stopl:
        items.append("**Stops** (freeze frame / black frame / everything hangs in the air, then slam on the next "
                     "downbeat): " + ", ".join(f"{mmss(i['t'])}-{mmss(i['end'])}" for i in stopl[:8]) + ".")
    items.append(f"**Ending {A['music_cut']:.2f} s (frame {fr(A['music_cut'])})** - cut to black / the title card "
                 f"exactly there; the tail ({A['music_cut']:.2f}-{A['duration']:.2f} s) carries the final fade.")
    items.append("**Texture sync**: `low` -> scale / shake on kicks and bass slams, `high` -> sparkle / glow, "
                 "`onset` -> flashes and stroke jitter, `bar_phase` -> per-bar loops (e.g. a ring rotating once per "
                 "bar), `beat_phase` -> pulses, `vocal` -> show/hide lyric layers.")
    L += [f"{k}. {txt}" for k, txt in enumerate(items, 1)]
    L.append("\n## Reliability notes\n")
    bt = A["beat_tracking"]
    L.append(f"- Beat grid: time-varying-tempo tracking -> robust spline -> snapped to onsets "
             f"({bt['snapped_to_onset_fraction']:.0%} snapped). Residual vs the smooth grid: median "
             f"{bt['spline_residual_ms_median']:.0f} ms, p90 {bt['spline_residual_ms_p90']:.0f} ms.")
    low = sorted(music, key=lambda s: s["confidence"])[:4]
    L.append("- Section confidence combines boundary novelty, the nearest automatic boundary, a vocal entry and "
             "repetition. Lowest: " +
             ", ".join(f"{s['name']} at {mmss(s['start'])} ({s['confidence']:.2f})" for s in low) + ".")
    L.append(f"- Vocal activity: {A['vocal_activity_method']['method']}. Lyric word timings (forced alignment) are "
             "more precise for per-syllable work.")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")


# ================================================================================================================
# main
# ================================================================================================================
def write_click_preview(path, y48, beats, downbeats, cut):
    """song (-4 dB) + clicks: 1.6 kHz on downbeats, 1 kHz on other beats -> AAC m4a via ffmpeg (listen-check)."""
    import subprocess, tempfile, soundfile as sf
    out = 0.63 * y48.copy()
    sr = SR_NATIVE
    n = int(0.03 * sr)
    env = np.exp(-np.arange(n) / (0.006 * sr))
    dset = set(np.round(downbeats, 3))
    for b in beats:
        if b > cut + 0.05:
            continue
        f, a = (1600.0, 0.55) if round(b, 3) in dset else (1000.0, 0.3)
        i = int(b * sr)
        seg = a * env * np.sin(2 * np.pi * f * np.arange(n) / sr)
        out[i:i + n] += seg[: len(out[i:i + n])]
    out = np.clip(out, -1, 1)
    tmp = os.path.join(tempfile.gettempdir(), "tegaki_click_preview_%d.wav" % os.getpid())
    sf.write(tmp, out, sr, subtype="PCM_16")
    try:
        subprocess.run([kit_env.FFMPEG, "-y", "-loglevel", "error", "-i", tmp, "-c:a", "aac", "-b:a", "128k", path],
                       check=True)
    finally:
        os.remove(tmp)


def parse_bpm_range(s):
    if not s or s.lower() == "auto":
        return None
    lo, hi = sorted(float(x) for x in s.replace("-", ",").split(",") if x.strip())
    return lo, hi


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio", default=AUDIO, help="input song (default audio/song.wav)")
    ap.add_argument("--sections", default=None,
                    help="auto | curated | FILE (default: analysis/sections.json if it exists, else auto)")
    ap.add_argument("--bpm-range", default="auto", help="tempo search range LO,HI in BPM, or auto (default)")
    ap.add_argument("--title", default=None, help="song title for overview.png / AUDIO_MAP.md "
                                                  "(default: the audio file name, or the project folder name)")
    ap.add_argument("--no-plot", action="store_true", help="skip overview.png / ssm.png")
    ap.add_argument("--no-click", action="store_true", help="skip analysis/click_preview.m4a")
    ap.add_argument("--vocal-stem", default=VOCAL_STEM,
                    help="separated vocal stem for vocal activity (default analysis/stems/vocals_kim.wav from "
                         "tools/transcribe_separate.py; falls back to REPET-SIM + VAD when missing)")
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    args = ap.parse_args()

    audio_path = str(kit_env.resolve(args.audio))
    if not os.path.exists(audio_path):
        sys.exit(f"audio not found: {audio_path}  (put the song at audio/song.wav or pass --audio)")
    stem_name = os.path.splitext(os.path.basename(audio_path))[0]
    title = args.title or (kit_env.ROOT.name if stem_name.lower() == "song" else stem_name)
    sec_arg = args.sections or (SECTIONS_FILE if os.path.exists(SECTIONS_FILE) else "auto")
    vocal_stem = str(kit_env.resolve(args.vocal_stem)) if args.vocal_stem else None

    y48, y = load_audio(audio_path)
    duration = len(y48) / SR_NATIVE
    log(f"loaded {duration:.3f}s")
    F = base_features(y)
    log("features done")
    db = F["db"]
    loud = np.where(db > -45)[0]
    music_start = loud[0] / FPS
    tail_end = min(duration, (loud[-1] + 1) / FPS)
    smdb = nd.uniform_filter1d(db, 5)
    lvl = np.percentile(db[loud], 90)
    cut = (np.where(smdb > lvl - 12)[0][-1] + 1) / FPS      # last frame within 12 dB of the loud level
    log(f"music_start {music_start:.2f}  cut {cut:.2f}  tail_end {tail_end:.2f}")
    stops = find_stops(F, music_start, cut)
    log("stops:", [(round(s["start"], 2), round(s["end"], 2), s["kind"]) for s in stops])

    est, a_glob, strength_at, curve = tempo_analysis(F, music_start, cut, parse_bpm_range(args.bpm_range))
    beats, grid, bstats = track_beats(F, curve, music_start, cut)
    gper = np.gradient(grid)
    est["beat_regression_mean"] = float(60 * (len(beats) - 1) / (beats[-1] - beats[0]))
    bpm_start = float(np.median(60 / gper[:16]))
    bpm_end = float(np.median(60 / gper[-16:]))
    bpm_median_local = float(np.median(60 / gper))
    bpm_nom = est["beat_regression_mean"]
    fam = [v if v < 190 else v / 2 for v in est.values()]
    agree = float(np.mean([abs(v / bpm_nom - 1) < 0.025 for v in fam]))
    octave = {"candidates_bpm": {f"{bpm_nom / 2:.1f}": strength_at(bpm_nom / 2), f"{bpm_nom:.1f}": strength_at(bpm_nom),
                                 f"{bpm_nom * 2:.1f}": strength_at(bpm_nom * 2)},
              "verdict": f"~{bpm_nom:.0f} BPM chosen: the 2x candidate (~{2 * bpm_nom:.0f}) has similar ACF strength "
                         f"(busy 8th-note parts) but kick/snare alternate at the ~{bpm_nom:.0f} level "
                         f"(backbeat on 2 & 4); ~{bpm_nom / 2:.0f} would put the snare on every beat"}
    log("tempo", est, f"start {bpm_start:.2f} end {bpm_end:.2f} nominal {bpm_nom:.2f}", bstats)

    win, dinfo, _, dfeat = downbeat_analysis(F, beats)
    log("downbeat phase", win, dinfo["phase_scores"], dinfo["per_feature_phase_means"], "conf", dinfo["confidence"])
    down_idx = np.arange(win, len(beats), 4)
    downbeats = beats[down_idx]
    bars = []
    if down_idx[0] > 0:
        bars.append({"index": 0, "start": r3(beats[0]), "end": r3(downbeats[0]), "pickup": True,
                     "beats": int(down_idx[0]), "_k0": 0})
    for j in range(len(down_idx) - 1):
        k = int(down_idx[j])
        k1 = int(down_idx[j + 1])
        bars.append({"index": j + 1, "start": r3(beats[k]), "end": r3(downbeats[j + 1]), "_k0": k,
                     "bpm": r3(60.0 * (k1 - k) / (grid[k1] - grid[k]))})
    fullbars = [b for b in bars if not b.get("pickup")]
    log(f"beats {len(beats)}, downbeats {len(downbeats)}, full bars {len(fullbars)}; last downbeat "
        f"{downbeats[-1]:.3f} vs cut {cut:.3f}")

    ev = section_evidence(F, beats, fullbars, stops)
    log("auto boundary candidates (bar numbers):", [a + 1 for a in ev["auto"]])

    # vocals
    if vocal_stem and os.path.exists(vocal_stem):
        act, vcurve, vmeta = vocal_from_stem(vocal_stem, INST_STEM, F["n"])
    else:
        act, vcurve, vmeta = vocal_fallback(F, y)
    vsegs = vocal_segments(act, music_start, cut)
    log(f"vocal segments {len(vsegs)} ({vmeta['method'][:40]}...) total "
        f"{sum(v['end'] - v['start'] for v in vsegs):.1f}s")

    env, envraw, tt = envelope_30fps(y48, F, beats, downbeats, duration, music_start, cut, vsegs)
    log("envelope frames", env["frames"], {k: [r3(np.percentile(envraw[k], p)) for p in (10, 50, 90)]
                                           for k in ("rms", "low", "mid", "high", "onset")})
    if sec_arg == "auto":
        table, sec_source = auto_section_table(ev, bars), "auto"
        auto_file = os.path.join(ROOT, "analysis", "sections_auto.json")
        os.makedirs(os.path.dirname(auto_file), exist_ok=True)
        with open(auto_file, "w", encoding="utf-8") as f:   # curation starting point (same format as sections.json)
            json.dump([dict(zip(SECTION_KEYS, r)) for r in table], f, ensure_ascii=False, indent=1)
        log("wrote", auto_file, "(copy to analysis/sections.json, curate, re-run)")
    elif sec_arg == "curated":
        table, sec_source = CURATED, "curated (built-in 残光 example table)"
    else:
        sec_file = str(kit_env.resolve(sec_arg))
        table, sec_source = load_section_table(sec_file), f"file: {kit_env.rel(sec_file)}"
    log(f"sections: {sec_source} ({len(table)} rows)")
    try:
        secs = build_sections(ev, bars, envraw["rms"], tt, tail_end, cut, vsegs, table)
    except ValueError as ex:
        sys.exit(f"error: {ex}")
    for s in secs:
        log(f"  {s['index']:2d} {mmss(s['start'])}-{mmss(s['end'])} b{s['bars'][0]:3d}-{s['bars'][1]:3d} "
            f"{s['label']:12s} {s['group']:12s} E={s['energy']:.2f} voc={s['vocal_fraction']:.2f} "
            f"nov={s['boundary_novelty']:.2f} rank={s['boundary_novelty_rank']:.2f} "
            f"d_auto={s['nearest_auto_boundary_bars']} rep={s['repeat_similarity']} conf={s['confidence']:.2f}")
    onsets = strong_onsets(F, beats)
    impacts = detect_impacts(F, beats, downbeats, stops, secs, music_start, cut, tail_end)
    log(f"onsets_strong {len(onsets)}, impacts {len(impacts)}")

    bpm_bars = [b["bpm"] for b in fullbars]
    tempo_conf = float(np.clip(0.55 * agree + 0.45 * 0.85, 0, 1))
    A = {
        "source": kit_env.rel(audio_path), "generator": "tools/analyze_audio.py", "title": title,
        "duration": r3(duration), "sr": SR_NATIVE, "analysis_sr": SR, "frames_30fps": env["frames"],
        "music_start": r3(music_start), "music_cut": r3(cut), "tail_end": r3(tail_end),
        "bpm": r3(bpm_nom),
        "tempo": {"bpm": r3(bpm_nom), "bpm_definition": "mean over the song = 60*(n_beats-1)/(last-first beat)",
                  "bpm_median_local": r3(bpm_median_local), "bpm_start": r3(bpm_start), "bpm_end": r3(bpm_end),
                  "bpm_mean_from_beats": r3(est["beat_regression_mean"]),
                  "drift": "smooth accelerando over the whole song (see bars[].bpm)",
                  "estimators": {k: r3(v) for k, v in est.items()}, "octave_check": octave,
                  "estimator_agreement(within 2.5%, octave-folded)": r3(agree), "confidence": r3(tempo_conf),
                  "search_range_bpm": [r3(BPM_RANGE[0]), r3(BPM_RANGE[1])]},
        "meter": "4/4",
        "beat_tracking": dict(bstats, note="beats = onset-snapped (use for hits); beats_smooth = jitter-free spline "
                                           "grid (same indices; use for continuous motion)"),
        "downbeat_info": dinfo,
        "beats": [r3(b) for b in beats],
        "beats_smooth": [r3(g) for g in grid],
        "downbeats": [r3(d) for d in downbeats],
        "bars": [{k: v for k, v in b.items() if not k.startswith("_")} for b in bars],
        "sections_source": sec_source,
        "sections_method": ("automatic: boundaries = bar-level novelty candidates (MFCC, chroma, bass in/out, stops), "
                            "groups = aligned bar-chroma repetition; curate into analysis/sections.json"
                            if sec_source == "auto" else
                            "boundaries+labels curated from bar-level novelty (MFCC, chroma, bass in/out, stops) and "
                            "aligned bar-chroma repetition")
                           + "; validated at run time (boundary_novelty*, repeat_similarity -> confidence)",
        "sections": [{k: v for k, v in s.items() if k not in ("character", "notable")} | {"character": s["character"],
                                                                                           "notable": s["notable"]}
                     for s in secs],
        "auto_boundary_candidates_bars": [a + 1 for a in ev["auto"]],
        "impacts": impacts,
        "onsets_strong": onsets,
        "vocal_activity": vsegs,
        "vocal_activity_method": vmeta,
        "stops": [{"start": r3(s["start"]), "end": r3(s["end"]), "depth_db": r3(s["depth_db"]), "kind": s["kind"]}
                  for s in stops],
    }
    os.makedirs(os.path.dirname(OUT_AUDIO), exist_ok=True)
    with open(OUT_AUDIO, "w", encoding="utf-8") as f:
        json.dump(A, f, ensure_ascii=False, indent=1)
    with open(OUT_ENV, "w", encoding="utf-8") as f:
        json.dump(env, f, ensure_ascii=False, separators=(",", ":"))
    log("wrote", OUT_AUDIO, os.path.getsize(OUT_AUDIO), OUT_ENV, os.path.getsize(OUT_ENV))
    write_md(OUT_MD, A, secs, impacts, fullbars, stops, title=title, curated=sec_arg == "curated")
    log("wrote", OUT_MD)
    if not args.no_plot:
        plot_overview(OUT_PNG, y48, duration, env, envraw, tt, beats, downbeats, secs, impacts, vsegs, onsets,
                      bpm_bars, win, title=title)
        plot_ssm(OUT_SSM, ev, secs, fullbars)
        log("wrote plots")
    if not args.no_click:
        try:
            write_click_preview(os.path.join(ROOT, "analysis", "click_preview.m4a"), y48, beats, downbeats, cut)
            log("wrote analysis/click_preview.m4a")
        except Exception as ex:  # noqa
            log("click preview failed:", repr(ex))


if __name__ == "__main__":
    main()
