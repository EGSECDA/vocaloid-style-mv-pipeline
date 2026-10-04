/* vocaloid-style-mv engine — math, easing, seeded randomness, beat clock, audio envelope access.
 * Everything here is a pure function of its arguments (no wall clock, no unseeded Math.random). */
(() => {
  'use strict';
  const Z = (window.Z = window.Z || {});
  // registries (scenes / transitions register themselves at load time)
  Z.SCENES = {}; Z.scene = (name, def) => { Z.SCENES[name] = def; };
  Z.TRANS = {}; Z.transition = (name, fn) => { Z.TRANS[name] = fn; };

  // ---------------------------------------------------------------- math
  Z.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  Z.lerp = (a, b, k) => a + (b - a) * k;
  Z.inv = (a, b, x) => Z.clamp((x - a) / (b - a));           // inverse lerp, clamped
  Z.remap = (x, a, b, c, d) => Z.lerp(c, d, Z.inv(a, b, x));
  Z.smooth = (a, b, x) => { const k = Z.inv(a, b, x); return k * k * (3 - 2 * k); };
  Z.fract = x => x - Math.floor(x);
  Z.TAU = Math.PI * 2;
  Z.mix3 = (c1, c2, k) => c1.map((v, i) => v + (c2[i] - v) * k);
  Z.hex = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  Z.rgba = (h, a = 1) => { const [r, g, b] = Z.hex(h); return `rgba(${r},${g},${b},${a})`; };
  Z.quant = (t, fps) => Math.floor(t * fps + 1e-6) / fps;    // 2コマ打ち: quant(t, 12)

  // ---------------------------------------------------------------- easing
  const E = (Z.ease = {
    linear: t => t,
    inQuad: t => t * t, outQuad: t => 1 - (1 - t) * (1 - t), inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: t => t * t * t, outCubic: t => 1 - Math.pow(1 - t, 3), inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: t => 1 - Math.pow(1 - t, 4), inQuart: t => t * t * t * t,
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2, outSine: t => Math.sin((t * Math.PI) / 2), inSine: t => 1 - Math.cos((t * Math.PI) / 2),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)), inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
    outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (Z.TAU / 3)) + 1),
    // "hold then snap": creeps to 90 % over 85 % of the time, then snaps home
    snap: t => (t < 0.85 ? 0.9 * E.outCubic(t / 0.85) : 0.9 + 0.1 * E.outExpo((t - 0.85) / 0.15)),
  });
  Z.tween = (t, t0, t1, a, b, ease = E.outExpo) => Z.lerp(a, b, ease(Z.inv(t0, t1, t)));

  // ---------------------------------------------------------------- seeded randomness
  Z.hash = (...xs) => {                       // integer hash of any numbers -> uint32
    let h = 0x811c9dc5;
    for (const x of xs) { let v = Math.floor(x * 1000003) | 0; h ^= v; h = Math.imul(h, 0x01000193); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
    return h >>> 0;
  };
  Z.rnd = (...xs) => Z.hash(...xs) / 4294967296;                 // [0,1)
  Z.rnds = (...xs) => Z.rnd(...xs) * 2 - 1;                      // [-1,1)
  Z.rng = seed => {                                              // mulberry32 stream
    let a = Z.hash(seed) | 0;
    const f = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.range = (a0, b0) => a0 + (b0 - a0) * f();
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  };
  // smooth 1-D value noise, deterministic
  Z.noise1 = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return Z.lerp(Z.rnds(i, seed), Z.rnds(i + 1, seed), u); };
  Z.fbm1 = (x, seed = 0, oct = 3) => { let s = 0, a = 0.5, fr = 1; for (let o = 0; o < oct; o++) { s += a * Z.noise1(x * fr, seed + o * 17); a *= 0.5; fr *= 2; } return s; };

  // ---------------------------------------------------------------- beat clock
  Z.makeClock = (beats, bpm, downbeatIndex0 = 0) => {
    const spb = 60 / bpm;
    const idx = t => {
      if (!beats.length || t < beats[0]) return -1;
      let lo = 0, hi = beats.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid] <= t) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const since = t => { const i = idx(t); return i < 0 ? 1e9 : t - beats[i]; };
    const phase = t => { const i = idx(t); if (i < 0) return 0; const t0 = beats[i], t1 = i + 1 < beats.length ? beats[i + 1] : t0 + spb; return Z.clamp((t - t0) / (t1 - t0)); };
    const beatNo = t => idx(t) - downbeatIndex0;                                   // 0 = first downbeat
    const C = {
      spb, beats, idx, since, phase,
      beat: t => beatNo(t),
      bar: t => Math.floor(beatNo(t) / 4),
      inBar: t => ((beatNo(t) % 4) + 4) % 4,
      barPhase: t => (((beatNo(t) % 4) + 4) % 4 + phase(t)) / 4,
      pulse: (t, k = 10) => Math.exp(-k * since(t)),                               // 1 at the beat, decays
      downPulse: (t, k = 6) => (C.inBar(t) === 0 ? Math.exp(-k * since(t)) : 0),
      nearest: t => { const i = idx(t); if (i < 0) return beats[0] || 0; const a = beats[i], b = beats[i + 1]; return b != null && b - t < t - a ? b : a; },
      at: n => beats[n + downbeatIndex0] ?? (beats[beats.length - 1] + (n + downbeatIndex0 - beats.length + 1) * spb),
    };
    return C;
  };

  // ---------------------------------------------------------------- audio envelope (analysis/envelope_30fps.json)
  Z.makeEnv = (env) => {
    const fps = env && env.fps ? env.fps : 30;
    const get = (key, t) => {
      const a = env && env[key]; if (!a || !a.length) return 0;
      const x = t * fps, i = Math.floor(x), f = x - i;
      const v0 = a[Z.clamp(i, 0, a.length - 1)], v1 = a[Z.clamp(i + 1, 0, a.length - 1)];
      return v0 + (v1 - v0) * f;
    };
    return { get, rms: t => get('rms', t), low: t => get('low', t), mid: t => get('mid', t), high: t => get('high', t), onset: t => get('onset', t), vocal: t => get('vocal', t) };
  };
})();
