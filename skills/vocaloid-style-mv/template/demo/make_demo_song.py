#!/usr/bin/env python3
"""make_demo_song.py -- synthesize the demo song 「蛍火」 (HOTARUBI) to audio/song.wav.

A copyright-free stand-in song that exercises the whole pipeline on a fresh install: 24 s at 128 BPM, 48 kHz
stereo, built from numpy only (+ soundfile to write the WAV). It is deterministic: every run writes the same file.

Structure (bar = 1.875 s; the times are what tools/analyze_audio.py should find):
  bar 0        0.00 -  1.88  intro: a soft pad swell and one bell, "silence-ish"
  bars 1-4     1.88 -  9.38  verse: kick on 1 & 3, soft hats, pad Am F C G, bass, lead phrases (lyric lines 1-2)
  bars 5-6     9.38 - 13.13  pre-chorus: four-on-the-floor, snare 2 & 4, 16th hats, riser + snare roll (lines 3-4),
                             then a half-beat STOP right before the chorus
  bars 7-10   13.13 - 20.63  chorus: full drums, crash, 8th-note bass, side-chained pad, pluck arpeggio,
                             high lead (lines 5-8)
  bar 11      20.63 - 22.50  post-chorus: last bar at full energy with a tom fill
  22.50                      DEAD STOP (only a short reverb tail), silence to 24.00

The lyric stand-in lines are in demo/lyrics_demo.lrc (timed to the lead phrases).

Usage:  python demo/make_demo_song.py [--out audio/song.wav] [--seed 128] [--force]
It never replaces a different existing WAV (your song) unless --force; re-running it over the demo song is harmless.
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
from __future__ import annotations

import argparse
import io
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
BPM = 128.0
SPB = 60.0 / BPM            # 0.46875 s per beat
BAR = 4 * SPB               # 1.875 s per bar
STOP_T = 12 * BAR           # 22.5 s: the dead stop
DUR = 24.0                  # file length

# chord per bar (MIDI notes), A minor / C major
AM, F, C, G, EM = [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [52, 55, 59]
CHORDS = [AM, AM, F, C, G, F, G, F, G, EM, AM, F]
SECTION = ['intro'] + ['verse'] * 4 + ['pre'] * 2 + ['chorus'] * 4 + ['post']


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, float) - 69.0) / 12.0)


class Track:
    """A stereo buffer with additive placement of mono clips (pan -1..1)."""

    def __init__(self, n):
        self.buf = np.zeros((n, 2), np.float64)

    def add(self, clip, t, gain=1.0, pan=0.0):
        i0 = int(round(t * SR))
        if i0 >= len(self.buf) or len(clip) == 0:
            return
        i1 = min(len(self.buf), i0 + len(clip))
        c = clip[: i1 - i0] * gain
        lp, rp = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)   # equal-power pan
        self.buf[i0:i1, 0] += c * lp * np.sqrt(2)
        self.buf[i0:i1, 1] += c * rp * np.sqrt(2)


# ---------------------------------------------------------------------------------------------- spectral helpers
def fft_filter(x, lo=None, hi=None, tilt=0.0):
    """Brick-ish band-pass in the frequency domain with soft (raised-cosine) edges; tilt in dB/octave above 1 kHz."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= np.clip((f - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1)
    if hi:
        g *= np.clip((hi * 1.3 - f) / (hi * 0.3 + 1e-9), 0, 1)
    if tilt:
        g *= 10 ** (tilt * np.log2(np.maximum(f, 1000) / 1000) / 20)
    return np.fft.irfft(X * g, n)


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay_tau)


def env_adsr(n, a, d, s, r, gate):
    """Linear ADSR; gate = note length in seconds, total clip length n samples (>= gate + r)."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    return e * np.clip(1 - (t - gate) / max(r, 1e-4), 0, 1)      # release ramp after the gate closes


# ---------------------------------------------------------------------------------------------- instruments
def kick(rng):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 44 + 120 * np.exp(-t / 0.032)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.30)
    click = fft_filter(rng.standard_normal(n), lo=1500, hi=9000) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.6 * (body + click)) * 0.95


def snare(rng):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=1200, hi=9000) * np.exp(-t / 0.11)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) + 0.5 * np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.03)
    return 0.55 * noise / (np.abs(noise).max() + 1e-9) + 0.45 * tone


def clap(rng):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=900, hi=6000)
    e = np.zeros(n)
    for k, d in enumerate([0.0, 0.011, 0.022]):
        e += np.where(t >= d, np.exp(-(t - d) / (0.008 if k < 2 else 0.12)), 0)
    c = noise * e
    return c / (np.abs(c).max() + 1e-9)


def hat(rng, open_=False):
    n = int((0.35 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=7000)
    # a few inharmonic square partials give the metallic ring
    metal = sum(np.sign(np.sin(2 * np.pi * f0 * t)) for f0 in (3527, 4813, 6211, 7489)) * 0.12
    c = (noise + fft_filter(metal, lo=6000)) * np.exp(-t / (0.16 if open_ else 0.022))
    return c / (np.abs(c).max() + 1e-9)


def crash(rng):
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=3500, tilt=-1.5)
    c = noise * np.exp(-t / 0.9) * np.clip(t / 0.003, 0, 1)
    return c / (np.abs(c).max() + 1e-9)


def tom(freq):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t / 0.04))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)


def bell(freq, dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, 1.6), (2.76, 0.45, 0.8), (5.4, 0.25, 0.4), (8.93, 0.12, 0.25)]
    return sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t / tau) for r, a, tau in parts) * np.clip(t / 0.002, 0, 1)


def saw_additive(freqs, n, bright, detune_cents=(0.0,), phase_seed=0):
    """Band-limited saw: sum of harmonics with a soft brightness roll-off (no aliasing, no filter needed)."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    rng = np.random.default_rng(phase_seed)
    for f0 in np.atleast_1d(freqs):
        for dc in detune_cents:
            f = f0 * 2 ** (dc / 1200)
            kmax = int(min(40, (SR / 2 - 200) // f))
            ph0 = rng.uniform(0, 2 * np.pi)
            for k in range(1, kmax + 1):
                amp = (1.0 / k) * np.exp(-(k - 1) * (1 - bright) * 0.45)
                if amp < 2e-3:
                    break
                out += amp * np.sin(2 * np.pi * f * k * t + ph0 * k)
    return out


def pad(chord, n, bright, octave_up=False):
    notes = list(chord) + [chord[0] - 12] + ([chord[1] + 12] if octave_up else [])
    x = saw_additive(midi_hz(notes), n, bright, detune_cents=(-9, 0, 8), phase_seed=sum(chord))
    return x / (np.abs(x).max() + 1e-9)


def pluck(freq, dur=0.3):
    n = int(dur * SR)
    x = saw_additive([freq], n, 0.9, phase_seed=int(freq))
    return x / (np.abs(x).max() + 1e-9) * env_ad(n, 0.002, 0.09)


def lead_note(freq, gate):
    n = int((gate + 0.15) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.12) / 0.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    # triangle-ish core + a little square for presence
    x = 0.75 * (2 / np.pi) * np.arcsin(np.sin(ph)) + 0.18 * np.sign(np.sin(ph)) * 0.6 + 0.22 * np.sin(2 * ph)
    return x * env_adsr(n, 0.012, 0.12, 0.75, 0.08, gate)


def bass_note(freq, gate):
    n = int((gate + 0.06) * SR)
    x = saw_additive([freq], n, 0.35, phase_seed=int(freq * 10)) + 0.8 * np.sin(2 * np.pi * freq * np.arange(n) / SR)
    return x / (np.abs(x).max() + 1e-9) * env_adsr(n, 0.004, 0.2, 0.7, 0.04, gate)


# ---------------------------------------------------------------------------------------------- arrangement
def bar_t(b, beat=0.0):
    return b * BAR + beat * SPB


# lead phrases: (bar, start beat, [(beat offset, length in beats, midi)])  -- one phrase per lyric line
def phrase(bar, start, notes):
    return [(bar_t(bar, start + o), d * SPB, m) for o, d, m in notes]


LEAD = (
    # L1 夜の底で / 息をひそめた                         (verse, bar 1 + 1/2 beat)
    phrase(1, 0.5, [(0, .5, 64), (.5, .5, 64), (1, .5, 67), (1.5, .5, 69), (2, .5, 69), (2.5, 1, 67),
                    (4, .5, 72), (4.5, .5, 71), (5, .5, 69), (5.5, .5, 67), (6, .5, 69), (6.5, 1.2, 64)])
    # L2 小さな光が / ひとつ灯る                         (bar 3 + 1/2)
    + phrase(3, 0.5, [(0, .5, 64), (.5, .5, 67), (1, .5, 69), (1.5, .5, 72), (2, .5, 71), (2.5, 1, 69),
                      (4, .5, 69), (4.5, .5, 71), (5, .5, 72), (5.5, .5, 74), (6, 1.4, 76)])
    # L3 名前も知らない / 星の下で                       (pre, bar 5 + 1/2)
    + phrase(5, 0.5, [(0, .5, 72), (.5, .5, 72), (1, .5, 74), (1.5, .5, 76), (2, .5, 74), (2.5, 1, 72)])
    # L4 手のひらに / そっと集めた                       (bar 6 + 1/2; ends before the stop)
    + phrase(6, 0.5, [(0, .5, 74), (.5, .5, 76), (1, .5, 77), (1.5, .5, 79), (2, .5, 77), (2.5, .75, 76)])
    # L5 灯れ、灯れ!                                     (chorus downbeat, bar 7)
    + phrase(7, 0.0, [(0, 1, 81), (1, 1, 79), (2, .5, 81), (2.5, .5, 79), (3, 1, 77)])
    # L6 この夜を / 照らして                             (bar 8)
    + phrase(8, 0.0, [(0, .5, 76), (.5, .5, 77), (1, 1, 79), (2, .5, 81), (2.5, .5, 79), (3, 1, 74)])
    # L7 蛍火 / ふたりの帰り道                           (bar 9)
    + phrase(9, 0.0, [(0, 1, 76), (1, 1, 79), (2, .5, 83), (2.5, .5, 81), (3, 1, 79)])
    # L8 朝まで / ここにいるよ!                          (bar 10)
    + phrase(10, 0.0, [(0, .5, 81), (.5, .5, 79), (1, 1, 76), (2, .5, 79), (2.5, .5, 77), (3, 1, 76)])
)


def build(seed):
    rng = np.random.default_rng(seed)
    n = int(DUR * SR)
    drums, music, lead, fx = Track(n), Track(n), Track(n), Track(n)
    K, SN, CL, HC, HO, CR = kick(rng), snare(rng), clap(rng), hat(rng), hat(rng, True), crash(rng)
    kicks = []

    for b, sec in enumerate(SECTION):
        ch = CHORDS[b]
        t0 = bar_t(b)
        # ------------------------------------------------ drums
        if sec == 'verse':
            for bt in (0, 2) + ((1.5,) if b % 2 == 0 else ()):
                drums.add(K, bar_t(b, bt), 0.55); kicks.append(bar_t(b, bt))
            drums.add(SN, bar_t(b, 3), 0.18, 0.1)
            for e in range(8):
                drums.add(HC, bar_t(b, e / 2), 0.1 if e % 2 else 0.06, 0.35)
        elif sec == 'pre':
            for bt in range(4):
                if b == 6 and bt == 3:
                    continue
                drums.add(K, bar_t(b, bt), 0.7); kicks.append(bar_t(b, bt))
            for bt in (1, 3) if b == 5 else (1,):
                drums.add(SN, bar_t(b, bt), 0.38, 0.05)
            for e in range(16 if b == 5 else 8):
                drums.add(HC, bar_t(b, e / 4), 0.07 + 0.05 * (e % 2 == 0), 0.35)
            if b == 6:                                    # snare roll on beats 2-3.5, then the STOP (last half beat)
                steps = [2 + i / 4 for i in range(4)] + [3 + i / 8 for i in range(4)]
                for i, bt in enumerate(steps):
                    drums.add(SN, bar_t(b, bt), 0.25 + 0.05 * i, 0.05)
        elif sec in ('chorus', 'post'):
            for bt in range(4):
                drums.add(K, bar_t(b, bt), 1.0); kicks.append(bar_t(b, bt))
                drums.add(HO, bar_t(b, bt + 0.5), 0.16, -0.3)
            for bt in (1, 3):
                drums.add(SN, bar_t(b, bt), 0.6, 0.05); drums.add(CL, bar_t(b, bt), 0.35, -0.1)
            for e in range(16):
                drums.add(HC, bar_t(b, e / 4), 0.06 + 0.04 * (e % 2 == 0), 0.4)
            if b in (7, 9):
                drums.add(CR, t0, 0.42, -0.4)
            if sec == 'post':                             # tom fill into the stop
                for i, (bt, fr) in enumerate([(3, 180), (3.25, 150), (3.5, 125), (3.75, 100)]):
                    drums.add(tom(fr), bar_t(b, bt), 0.55, 0.5 - 0.33 * i)
        # ------------------------------------------------ harmony
        n_bar = int((BAR + 0.6) * SR)
        if sec == 'intro':
            p = pad(ch, n_bar, 0.25)
            t = np.arange(n_bar) / SR
            music.add(p * np.clip(t / 1.6, 0, 1) ** 2 * 0.09, t0, 1.0)
            fx.add(bell(midi_hz(76), 2.0), bar_t(b, 0.0), 0.08, 0.3)
        else:
            bright = {'verse': 0.35, 'pre': 0.5, 'chorus': 0.75, 'post': 0.8}[sec]
            gain = {'verse': 0.13, 'pre': 0.14, 'chorus': 0.22, 'post': 0.22}[sec]
            p = pad(ch, n_bar, bright, octave_up=sec in ('chorus', 'post'))
            t = np.arange(n_bar) / SR
            p = p * np.clip(t / 0.08, 0, 1) * np.clip((BAR + 0.5 - t) / 0.5, 0, 1)
            if sec == 'pre' and b == 6:                   # the STOP: everything silent for the last half beat
                p = p * (t < 3.5 * SPB - 0.01)
            music.add(p, t0, gain)
        # bass
        root = midi_hz(ch[0] - 12)
        if sec == 'verse':
            for bt in (0, 2):
                music.add(bass_note(root, 1.8 * SPB), bar_t(b, bt), 0.28)
        elif sec == 'pre':
            for e in range(8 if b == 5 else 7):
                music.add(bass_note(root, 0.42 * SPB), bar_t(b, e / 2), 0.4)
        elif sec in ('chorus', 'post'):
            for e in range(8):
                fq = root * (2 if e % 2 else 1)
                music.add(bass_note(fq, 0.42 * SPB), bar_t(b, e / 2), 0.42)
            # pluck arpeggio, 16ths, up the chord
            arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24]
            for s in range(16):
                fx.add(pluck(midi_hz(arp[s % 4])), bar_t(b, s / 4), 0.11, 0.45 if s % 2 else -0.45)
    # riser (filtered noise swell) through the pre-chorus, cut by the stop
    r0, r1 = bar_t(5), bar_t(6, 3.5)
    nr = int((r1 - r0) * SR)
    tr = np.arange(nr) / SR
    riser = fft_filter(rng.standard_normal(nr), lo=2000, hi=12000) * (tr / tr[-1]) ** 2.2
    fx.add(riser / (np.abs(riser).max() + 1e-9), r0, 0.16, 0.0)
    # reverse-swell into bar 1 (out of the "silent" intro)
    nr = int(0.9 * SR)
    sw = fft_filter(rng.standard_normal(nr), lo=600, hi=7000) * np.linspace(0, 1, nr) ** 3
    fx.add(sw / (np.abs(sw).max() + 1e-9), bar_t(1) - 0.9, 0.1)
    # lead (the "vocal"), with a dotted-8th echo
    for t, gate, m in LEAD:
        note = lead_note(midi_hz(m), gate)
        lv = 0.17 if t < bar_t(5) else 0.21 if t < bar_t(7) else 0.27       # the "singer" gets louder toward the chorus
        lead.add(note, t, lv, 0.0)
        for dl, g, pn in [(0.75 * SPB, 0.28, -0.5), (1.5 * SPB, 0.14, 0.5)]:
            lead.add(note, t + dl, lv * g, pn)

    # side-chain pump on the music bus during the chorus (ducks on every kick)
    tt = np.arange(n) / SR
    duck = np.ones(n)
    for k in kicks:
        if k >= bar_t(7) - 1e-6:
            i0 = int(k * SR)
            seg = tt[i0:i0 + int(0.35 * SR)] - k
            duck[i0:i0 + len(seg)] = np.minimum(duck[i0:i0 + len(seg)], 1 - 0.55 * np.exp(-seg / 0.09))
    music.buf *= duck[:, None]
    fx.buf *= (0.5 + 0.5 * duck)[:, None]

    dry = drums.buf + music.buf + lead.buf + fx.buf
    # reverb: convolution with a decaying stereo noise impulse response (FFT)
    ir_n = int(1.8 * SR)
    ti = np.arange(ir_n) / SR
    wet = np.zeros_like(dry)
    send = music.buf * 0.5 + lead.buf * 0.9 + fx.buf * 0.6 + drums.buf * 0.08
    for ch_i in range(2):
        ir = fft_filter(rng.standard_normal(ir_n), lo=300, hi=7000) * np.exp(-ti / 0.45)
        ir /= np.sqrt((ir ** 2).sum())
        m = 1 << int(np.ceil(np.log2(n + ir_n)))
        wet[:, ch_i] = np.fft.irfft(np.fft.rfft(send[:, ch_i], m) * np.fft.rfft(ir, m), m)[:n]
    # DEAD STOP: the dry mix stops at STOP_T (4 ms fade), the reverb return dies within 0.35 s
    g_dry = np.clip((STOP_T - tt) / 0.004, 0, 1)
    g_wet = np.clip(1 - (tt - STOP_T) / 0.35, 0, 1) ** 2
    mix = dry * g_dry[:, None] + 0.32 * wet * g_wet[:, None]
    # glue: gentle saturation, then normalise to -1 dBFS
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    mix *= 10 ** (-1 / 20) / (np.abs(mix).max() + 1e-9)
    return mix.astype(np.float32)


def is_demo_song(sf, path, seed) -> bool:
    """True when `path` already holds this demo song (same format and samples): writing it again changes nothing."""
    try:
        i = sf.info(path)
    except Exception:  # noqa: BLE001 - not a sound file libsndfile can read: certainly not ours
        return False
    if (i.samplerate, i.channels, i.frames, i.subtype) != (SR, 2, int(DUR * SR), 'PCM_16'):
        return False   # e.g. the user's song: decided without synthesizing anything
    buf = io.BytesIO()
    sf.write(buf, build(seed), SR, subtype='PCM_16', format='WAV')
    buf.seek(0)
    return np.array_equal(sf.read(path, dtype='int16')[0], sf.read(buf, dtype='int16')[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(ROOT, 'audio', 'song.wav'), help='output WAV (default audio/song.wav)')
    ap.add_argument('--seed', type=int, default=128, help='noise seed (default 128)')
    ap.add_argument('--force', action='store_true', help='overwrite an existing output WAV that is not this demo song')
    for _s in (sys.stdout, sys.stderr):  # help texts contain 残光 / ō / ：; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors='replace')
        except Exception:  # noqa: BLE001
            pass
    args = ap.parse_args()
    try:
        import soundfile as sf
    except ImportError:
        sys.exit('soundfile is missing: python -m pip install -r requirements.txt')
    out = os.path.abspath(args.out)
    if os.path.exists(out) and not args.force:
        if not is_demo_song(sf, out, args.seed):
            sys.exit(f'{out} already exists and is not the demo song (your song?) -- not overwritten.\n'
                     'Run the demo in a fresh project without a song, pass --out elsewhere, or --force to replace it.')
        print(f'{out} already holds the demo song (unchanged)')
    else:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        mix = build(args.seed)
        sf.write(out, mix, SR, subtype='PCM_16')
        print(f'wrote {out}  ({len(mix) / SR:.2f} s, {SR} Hz stereo, {BPM:g} BPM, dead stop at {STOP_T:.2f} s)')
    print('next: copy demo/lyrics_demo.lrc to analysis/lyrics_mv.lrc, then python tools/analyze_audio.py')


if __name__ == '__main__':
    main()
