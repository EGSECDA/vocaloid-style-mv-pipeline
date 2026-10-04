/* vocaloid-style-mv scenes: memory — 'memories' (shot 45) and 'road' (shots 48 / 49).
 *
 *  memories { photos:[{ bg, caption, date?, view?:{x,y,zoom}, char? }], char, charIn, order, dropBeats, burnBeats,
 *             pushAt, endZoom, seed }
 *      P5 faded polaroids drop onto a dark desk on the beat, captions write themselves in Klee One, the evening window
 *      light leaves, then the prints burn from their edges (glowing front, char crust, ash flakes, sparks). The photo
 *      with her burns last and a ragged fragment around her smile survives into the cut — the 残光.
 *
 *  road { mode:'tear'|'run', char:'assets/char/run.png', impact, horizon, open, dolly, slowAt, freezeAt, freezeStyle }
 *      tear: a glass tear falls in slow motion (camera tilts with it, the black mirror ground rises), hits on 涙,
 *            ripples + crown splash, a line of light races to the horizon (arrives on が), the horizon ignites,
 *            the road of light opens on 道 (tiles igniting outward, beat waves), then the camera starts to dolly.
 *      run : side-3/4 tracking shot, she runs left toward the dawn on the glowing road; speed lines, rushing tiles,
 *            streaming hair; slow-motion from the break downbeat, hard freeze on the audio stop.
 *
 * Everything is a closed-form function of t; caches hold only immutable data keyed by args.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const clamp = Z.clamp, lerp = Z.lerp, inv = Z.inv;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  // ------------------------------------------------------------------ deterministic 2D noise
  function vn2(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = Z.rnd(xi, yi, s), b = Z.rnd(xi + 1, yi, s), c = Z.rnd(xi, yi + 1, s), d = Z.rnd(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, s, oct = 4) { let t = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { t += a * vn2(x * f, y * f, s + o * 31); n += a; a *= 0.5; f *= 2.03; } return t / n; }
  // cheap integer hash for per-pixel grain in one-time bakes
  const hsh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ------------------------------------------------------------------ beat helpers
  const firstBeatIdx = (C, t, tol = 0.08) => C.idx(t - tol) + 1;               // first beat > t - tol
  const beatT = (C, i) => C.beats[i] ?? (C.beats[C.beats.length - 1] + (i - C.beats.length + 1) * C.spb);

  // ================================================================== MEMORIES (shot 45)
  const P5 = { sepia: [36, 28, 26], umber: [74, 59, 53], taupe: [125, 106, 94], dust: [183, 156, 139], parch: [216, 199, 174], paper: [239, 230, 214], cyan: [156, 194, 192], rose: [201, 141, 134] };
  const P5_STOPS = [[0, '#241C1A'], [0.2, '#4A3B35'], [0.45, '#7D6A5E'], [0.68, '#B79C8B'], [0.85, '#D8C7AE'], [1, '#EFE6D6']];
  let lut5 = null;
  function lutP5() {
    if (lut5) return lut5;
    const c = Z.canvas(256, 1), x = c.getContext('2d', { willReadFrequently: true });
    const g = x.createLinearGradient(0, 0, 256, 0); for (const [k, col] of P5_STOPS) g.addColorStop(k, col);
    x.fillStyle = g; x.fillRect(0, 0, 256, 1);
    const d = x.getImageData(0, 0, 256, 1).data; lut5 = new Uint8Array(768);
    for (let i = 0; i < 256; i++) { lut5[i * 3] = d[i * 4]; lut5[i * 3 + 1] = d[i * 4 + 1]; lut5[i * 3 + 2] = d[i * 4 + 2]; }
    return lut5;
  }

  // polaroid geometry in desk px (camera zoom 1). Image area is 16:10.
  const PH = { iw: 520, ih: 325, sd: 20, tp: 20, bt: 86 };
  PH.fw = PH.iw + 2 * PH.sd; PH.fh = PH.ih + PH.tp + PH.bt;            // 560 x 431
  const PS = 2;                                                          // bake supersampling
  const MW = 320, MH = Math.round(MW * PH.fh / PH.fw);                   // burn-mask resolution
  const CRUST = 0.024;                                                   // char crust width in field units

  // desk layout: the last slot is the hero (the photo she is in); it drops last, sits on top, burns last
  const SLOTS = {
    1: [{ x: 960, y: 560, r: -0.035, s: 1.35, from: [0, -1] }],
    2: [{ x: 700, y: 470, r: -0.09, s: 1.05, from: [-1, -0.6] }, { x: 1180, y: 610, r: 0.05, s: 1.2, from: [0.4, -1] }],
    3: [{ x: 600, y: 380, r: -0.12, s: 1.0, from: [-1, -0.7] }, { x: 1380, y: 400, r: 0.09, s: 1.0, from: [1, -0.6] }, { x: 960, y: 660, r: 0.035, s: 1.18, from: [0.2, -1] }],
    4: [{ x: 560, y: 345, r: -0.135, s: 0.97, from: [-1, -0.75] }, { x: 1458, y: 292, r: 0.088, s: 0.97, from: [1, -0.8] },
        { x: 1425, y: 800, r: -0.062, s: 0.97, from: [1, 0.7] }, { x: 862, y: 668, r: 0.04, s: 1.14, from: [-0.25, -1] }],
  };
  function slotsFor(n, seed) {
    if (SLOTS[n]) return SLOTS[n];
    const out = [];
    for (let i = 0; i < n - 1; i++) {                                    // ring around the centre
      const a = (i / (n - 1)) * TAU + 0.6 + Z.rnds(i, seed) * 0.25;
      out.push({ x: 960 + Math.cos(a) * 560, y: 540 + Math.sin(a) * 300, r: Z.rnds(i, seed + 1) * 0.13, s: 0.86, from: [Math.cos(a), Math.sin(a)] });
    }
    out.push({ x: 960, y: 600, r: 0.035, s: 1.12, from: [0, -1] });
    return out;
  }
  // desk-space transform of photo j: returns {x,y,r,s}
  const DEFAULT_DATES = ['4.17', '7.30', '9.02', '10.21', '12.24', '3.08'];

  const memCache = new Map();
  function memKey(a) { return JSON.stringify([a.photos, a.char, a.charIn, a.order, a.seed]); }

  function buildMemories(a) {
    const key = memKey(a);
    if (memCache.has(key)) return memCache.get(key);
    const seed = a.seed ?? 45;
    const photos = (a.photos || []).map((p, i) => Object.assign({ caption: '', date: DEFAULT_DATES[i % DEFAULT_DATES.length] }, p));
    const n = photos.length;
    // which photo holds her
    let charIn = a.charIn;
    if (charIn == null) { charIn = photos.findIndex(p => p.char); if (charIn < 0 && a.char) { charIn = photos.findIndex(p => /embankment/.test(p.bg)); if (charIn < 0) charIn = n - 1; } }
    const charPath = charIn >= 0 ? (photos[charIn] && typeof photos[charIn].char === 'string' ? photos[charIn].char : a.char) : null;
    const hero = charIn >= 0 ? charIn : n - 1;
    const order = a.order || [...photos.keys()].filter(i => i !== hero).concat([hero]);
    const slots = slotsFor(n, seed);
    const M = { photos: [], order, hero, n, seed };
    order.forEach((pi, slotIdx) => {
      const p = photos[pi];
      const P = bakePhoto(p, pi, pi === charIn ? charPath : null, seed + pi * 7, pi === hero);
      P.slot = slots[slotIdx]; P.idx = pi; P.pos = slotIdx; P.caption = p.caption; P.date = p.date; P.isHero = pi === hero;
      M.photos.push(P);
    });
    M.shadow = bakeShadow();
    M.desk = bakeDesk(seed);
    M.windowLight = bakeWindow();
    memCache.set(key, M);
    return M;
  }

  // one faded print (frame + P5-graded image), plus its burn field and particle seeds
  function bakePhoto(p, idx, charPath, seed, isHero) {
    const img = Z.imgSync(p.bg);
    const iw = PH.iw * PS, ih = PH.ih * PS;
    const ic = Z.canvas(iw, ih), ix = ic.getContext('2d', { willReadFrequently: true });
    ix.fillStyle = '#7D6A5E'; ix.fillRect(0, 0, iw, ih);
    // crop: cover 16:10 with optional view
    const v = p.view || (charPath ? { x: 0.1, y: 0.25, zoom: 1.12 } : { x: 0, y: 0, zoom: 1.08 });
    if (img) {
      const s = Math.max(iw / img.width, ih / img.height) * (v.zoom || 1);
      const dw = img.width * s, dh = img.height * s, mx = (dw - iw) / 2, my = (dh - ih) / 2;
      ix.drawImage(img, (iw - dw) / 2 + (v.x || 0) * mx, (ih - dh) / 2 + (v.y || 0) * my, dw, dh);
    }
    let face = null;
    if (charPath) {
      const ch = Z.imgSync(charPath);
      if (ch) {
        // medium-long snapshot: face at (0.66, 0.30) of the image, cropped around the knees
        const hc = ih * 1.42, wc = hc * ch.width / ch.height;
        const fx = 0.276, fy = 0.122;                          // face position inside turn_smile.png
        const faceX = iw * 0.665, faceY = ih * 0.30;
        const left = faceX - fx * wc, top = faceY - fy * hc;
        // soft contact shadow on the path
        ix.save(); ix.globalAlpha = 0.28; ix.filter = 'blur(10px)'; ix.fillStyle = '#1a0f0c';
        ix.beginPath(); ix.ellipse(left + wc * 0.47, top + hc * 0.99, wc * 0.3, 18, 0, 0, TAU); ix.fill(); ix.restore();
        ix.drawImage(ch, left, top, wc, hc);
        face = [(PH.sd + (faceX / PS)) / PH.fw, (PH.tp + (faceY / PS)) / PH.fh];
      }
    }
    // ---- P5 grade (one-time per-pixel pass)
    const L = lutP5();
    const id = ix.getImageData(0, 0, iw, ih), d = id.data;
    const leakSide = Z.rnd(seed, 3) < 0.5 ? 0 : 1, leakY = 0.25 + 0.5 * Z.rnd(seed, 4);
    for (let y = 0; y < ih; y++) {
      const vy = y / ih;
      for (let x = 0; x < iw; x++) {
        const i = (y * iw + x) * 4;
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const s = l * l * (3 - 2 * l);
        let lc = 0.085 + 0.83 * (0.55 * l + 0.45 * s);
        const vx = x / iw;
        // print vignette (darker, warmer corners)
        const ex = vx - 0.5, ey = (vy - 0.5) * 0.8, vr = ex * ex + ey * ey;
        lc *= 1 - 0.5 * vr;
        const li = Math.max(0, Math.min(255, (lc * 255) | 0)) * 3;
        let R = L[li], G = L[li + 1], B = L[li + 2];
        // retain a whisper of the original hue
        const cr = (r - l) * 255, cg = (g - l) * 255, cb = (b - l) * 255;
        R += cr * 0.2; G += cg * 0.2; B += cb * 0.2;
        // split tone: shadows -> bleach cyan, highlights -> faded rose
        const ws = (1 - lc) * (1 - lc) * 0.17, wh = lc * lc * 0.12;
        R += (156 - R) * ws + (201 - R) * wh; G += (194 - G) * ws + (141 - G) * wh; B += (192 - B) * ws + (134 - B) * wh;
        // warm light leak burned into one edge of the print
        const lx = leakSide ? 1 - vx : vx;
        const leak = Math.exp(-lx * lx * 18) * (0.55 + 0.45 * Math.sin(vy * 5.3 + seed)) * Math.exp(-((vy - leakY) ** 2) * 3);
        R += 120 * leak; G += 52 * leak; B += 18 * leak;
        // fade toward the paper base + static print grain
        const gr = (hsh(x, y, seed) - 0.5) * 14;
        d[i] = R * 0.93 + 239 * 0.07 + gr; d[i + 1] = G * 0.93 + 230 * 0.07 + gr; d[i + 2] = B * 0.93 + 214 * 0.07 + gr;
      }
    }
    ix.putImageData(id, 0, 0);
    // chemical stains, scratches, specks
    const R = Z.rng(seed + 11);
    ix.save();
    for (let k = 0; k < 3; k++) {
      const sx = R.range(0.1, 0.9) * iw, sy = R.range(0.1, 0.9) * ih, sr = R.range(40, 140);
      const g = ix.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, 'rgba(183,156,139,0)'); g.addColorStop(0.8, 'rgba(160,120,95,0.10)'); g.addColorStop(1, 'rgba(183,156,139,0)');
      ix.globalCompositeOperation = 'multiply'; ix.fillStyle = g; ix.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    ix.globalCompositeOperation = 'screen'; ix.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      ix.strokeStyle = `rgba(239,230,214,${R.range(0.06, 0.2)})`; ix.lineWidth = R.range(0.8, 1.8);
      const x0 = R.range(0, iw), y0 = R.range(0, ih), len = R.range(40, 260), an = R.range(-0.4, 0.4) + (R() < 0.5 ? Math.PI / 2 : 0);
      ix.beginPath(); ix.moveTo(x0, y0); ix.quadraticCurveTo(x0 + Math.cos(an) * len * 0.5 + R.range(-20, 20), y0 + Math.sin(an) * len * 0.5 + R.range(-20, 20), x0 + Math.cos(an) * len, y0 + Math.sin(an) * len); ix.stroke();
    }
    for (let k = 0; k < 40; k++) { ix.fillStyle = R() < 0.6 ? 'rgba(239,230,214,0.35)' : 'rgba(36,28,26,0.35)'; ix.globalCompositeOperation = 'source-over'; ix.beginPath(); ix.arc(R.range(0, iw), R.range(0, ih), R.range(0.6, 2.2), 0, TAU); ix.fill(); }
    ix.restore();

    // ---- the print: paper frame + image
    const c = Z.canvas(PH.fw * PS, PH.fh * PS), x = c.getContext('2d');
    x.save(); x.scale(PS, PS);
    const pg = x.createLinearGradient(0, 0, PH.fw, PH.fh);
    pg.addColorStop(0, '#F1E9DA'); pg.addColorStop(0.55, '#ECE2CF'); pg.addColorStop(1, '#E2D5BD');
    x.fillStyle = pg; x.beginPath(); x.roundRect(0, 0, PH.fw, PH.fh, 3.5); x.fill();
    // paper fibre / aging
    const RR = Z.rng(seed + 29);
    for (let k = 0; k < 5; k++) {
      const sx = RR.range(0, PH.fw), sy = RR.range(0, PH.fh), sr = RR.range(30, 120);
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, 'rgba(200,170,130,0.10)'); g.addColorStop(1, 'rgba(200,170,130,0)');
      x.fillStyle = g; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
    const eg = x.createRadialGradient(PH.fw / 2, PH.fh / 2, PH.fh * 0.35, PH.fw / 2, PH.fh / 2, PH.fw * 0.72);
    eg.addColorStop(0, 'rgba(120,90,60,0)'); eg.addColorStop(1, 'rgba(120,90,60,0.16)');
    x.fillStyle = eg; x.fillRect(0, 0, PH.fw, PH.fh);
    // image, slightly soft (memory)
    x.filter = 'blur(0.55px)'; x.drawImage(ic, PH.sd, PH.tp, PH.iw, PH.ih); x.filter = 'none';
    // recess line around the image + faint gloss
    x.strokeStyle = 'rgba(60,45,38,0.35)'; x.lineWidth = 1; x.strokeRect(PH.sd + 0.5, PH.tp + 0.5, PH.iw - 1, PH.ih - 1);
    const gl = x.createLinearGradient(PH.sd, PH.tp, PH.sd + PH.iw * 0.8, PH.tp + PH.ih);
    gl.addColorStop(0, 'rgba(255,250,240,0.10)'); gl.addColorStop(0.45, 'rgba(255,250,240,0)'); gl.addColorStop(1, 'rgba(255,250,240,0.04)');
    x.fillStyle = gl; x.fillRect(PH.sd, PH.tp, PH.iw, PH.ih);
    x.restore();
    // paper tooth (baked grain on the frame only)
    {
      const td = x.getImageData(0, 0, c.width, c.height), dd = td.data;
      for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
        const i = (yy * c.width + xx) * 4; if (!dd[i + 3]) continue;
        const inImg = xx > PH.sd * PS && xx < (PH.sd + PH.iw) * PS && yy > PH.tp * PS && yy < (PH.tp + PH.ih) * PS;
        if (inImg) continue;
        const n = (hsh(xx >> 1, yy >> 1, seed + 5) - 0.5) * 10 + (hsh(xx, yy, seed + 9) - 0.5) * 6;
        dd[i] += n; dd[i + 1] += n; dd[i + 2] += n;
      }
      x.putImageData(td, 0, 0);
    }

    // ---- burn field (edges first, from one ignition side; the hero keeps her face for last)
    const F = new Float32Array(MW * MH), N2 = new Float32Array(MW * MH);
    const ignA = Z.rnd(seed, 17) * TAU;
    const igx = 0.5 + Math.cos(ignA) * 0.62, igy = 0.5 + Math.sin(ignA) * 0.62;
    let fmin = 1e9, fmax = -1e9;
    const asp = PH.fw / PH.fh;
    for (let my = 0; my < MH; my++) for (let mx = 0; mx < MW; mx++) {
      const u = (mx + 0.5) / MW, v = (my + 0.5) / MH;
      const e = Math.min(Math.min(u, 1 - u) * asp, Math.min(v, 1 - v)) * 2;          // 0 edge .. ~1 centre
      const n = fbm2(u * 6 * asp, v * 6, seed + 101, 5);
      const di = Math.hypot((u - igx) * asp, v - igy) / 1.7;
      let f = 0.62 * Math.pow(Math.min(1, e), 0.7) + 0.55 * (n - 0.5) + 0.5 * di;
      if (isHero && face) { const du = (u - face[0]) * asp, dv = v - face[1]; f += 1.05 * Math.exp(-(du * du + dv * dv) / 0.018); }
      F[my * MW + mx] = f; if (f < fmin) fmin = f; if (f > fmax) fmax = f;
      N2[my * MW + mx] = 0.7 * vn2(mx * 0.16, my * 0.16, seed + 77) + 0.3 * hsh(mx, my, seed + 78);    // ember patches
    }
    for (let i = 0; i < F.length; i++) F[i] = (F[i] - fmin) / (fmax - fmin);
    // level that leaves a ragged fragment around her face (the last ~7 % of the field)
    let faceLevel = 1;
    if (isHero) { const sorted = Float32Array.from(F).sort(); faceLevel = sorted[Math.floor(sorted.length * 0.935)]; }
    const fieldAt = (u, v) => F[Math.min(MH - 1, Math.max(0, (v * MH) | 0)) * MW + Math.min(MW - 1, Math.max(0, (u * MW) | 0))];
    // particle seeds on the paper
    const ash = [], sparks = [];
    for (let k = 0; k < 110; k++) { const u = Z.rnd(k, seed, 1), v = Z.rnd(k, seed, 2); ash.push({ u, v, f: fieldAt(u, v), k }); }
    for (let k = 0; k < 90; k++) { const u = Z.rnd(k, seed, 5), v = Z.rnd(k, seed, 6); sparks.push({ u, v, f: fieldAt(u, v), k }); }
    // per-photo live buffers (fully rewritten every frame -> no state carried)
    const mk = () => { const cc = Z.canvas(MW, MH); return { c: cc, x: cc.getContext('2d'), id: new ImageData(MW, MH) }; };
    const halo = Z.canvas(MW >> 1, MH >> 1);
    return { base: c, F, N2, faceLevel, face, ash, sparks, keep: mk(), over: mk(), glow: mk(), halo, live: Z.canvas(c.width, c.height), final: null };
  }

  function bakeShadow() {
    const m = 60, c = Z.canvas(PH.fw + m * 2, PH.fh + m * 2), x = c.getContext('2d');
    x.filter = 'blur(14px)'; x.fillStyle = 'rgba(8,4,3,1)'; x.fillRect(m, m, PH.fw, PH.fh);
    return { c, m };
  }
  // desk: dark sepia with warm pool, paper/felt tooth and a few long fibres (baked at half res)
  // desk / void: deep sepia, soft isotropic mottling (like old blotting paper) + fine tooth, baked once
  function bakeDesk(seed) {
    const w = 1200, h = 675, c = Z.canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    const g = x.createRadialGradient(w * 0.46, h * 0.48, 40, w * 0.5, h * 0.5, w * 0.7);
    g.addColorStop(0, '#34282A'); g.addColorStop(0.5, '#241C1A'); g.addColorStop(1, '#100B0B');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // low-frequency mottling at low res, upscaled (smooth)
    const mw = 160, mh = 90, m = Z.canvas(mw, mh), mx = m.getContext('2d', { willReadFrequently: true });
    const md = mx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let xx = 0; xx < mw; xx++) {
      const n = fbm2(xx / 14, y / 14, seed + 3, 4), n2 = fbm2(xx / 5, y / 5, seed + 13, 2);
      const i = (y * mw + xx) * 4, v = 128 + (n - 0.5) * 120 + (n2 - 0.5) * 40;
      md.data[i] = v; md.data[i + 1] = v * 0.97; md.data[i + 2] = v * 0.92; md.data[i + 3] = 255;
    }
    mx.putImageData(md, 0, 0);
    x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.55; x.imageSmoothingQuality = 'high'; x.drawImage(m, 0, 0, w, h); x.restore();
    const id = x.getImageData(0, 0, w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const i = (y * w + xx) * 4, gr = (hsh(xx, y, seed) - 0.5) * 7 + (hsh(xx >> 2, y >> 2, seed + 1) - 0.5) * 5;
      d[i] += gr; d[i + 1] += gr * 0.9; d[i + 2] += gr * 0.8;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  // evening window light: 2x3 panes with a thin frame, falling diagonally; soft but readable (baked small)
  function bakeWindow() {
    const w = 480, h = 270, c = Z.canvas(w, h), x = c.getContext('2d');
    x.save(); x.filter = 'blur(2.6px)';
    x.translate(w * 0.34, h * 0.46); x.transform(1, 0.2, -0.62, 1, 0, 0);
    const pw = 64, ph = 52, gp = 5;
    for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) {
      const px0 = -110 + q * (pw + gp), py0 = -58 + r * (ph + gp);
      const g = x.createLinearGradient(px0, py0, px0 + pw * 1.2, py0 + ph);
      g.addColorStop(0, 'rgba(255,222,176,1)'); g.addColorStop(1, 'rgba(255,196,140,0.72)');
      x.fillStyle = g; x.fillRect(px0, py0, pw, ph);
    }
    x.restore();
    // long soft falloff so the patch does not end in a hard box
    const f = x.createRadialGradient(w * 0.34, h * 0.46, 30, w * 0.34, h * 0.46, w * 0.42);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = f; x.fillRect(0, 0, w, h);
    return c;
  }

  // caption, written on 2s (12 fps) one character at a time with a left->right pen wipe
  function drawCaption(ctx, P, k, seed) {
    const chars = [...(P.caption || '')];
    if (!chars.length || k <= 0) return;
    const size = 40;
    D.font(ctx, size, 'hand', 600);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(PH.sd + 16, PH.tp + PH.ih + 58); ctx.rotate(-0.018 + Z.rnds(seed, 3) * 0.012);
    const n = chars.length, shown = k * (n + 1);                      // +1 slot for the date
    let x = 0;
    for (let i = 0; i < n; i++) {
      const ki = clamp(shown - i); const ch = chars[i]; const w = ctx.measureText(ch).width;
      if (ki <= 0) break;
      ctx.save();
      if (ki < 1) { ctx.beginPath(); ctx.rect(x - 4, -size, (w + 8) * ki, size * 1.5); ctx.clip(); }
      ctx.translate(x, Z.rnds(i, seed) * 2.2); ctx.rotate(Z.rnds(i, seed + 1) * 0.035);
      ctx.fillStyle = 'rgba(52,58,84,0.9)'; ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += w * 0.96 + 1;
    }
    // small date at the right, lighter pressure
    const kd = clamp(shown - n);
    if (kd > 0 && P.date) {
      D.font(ctx, 22, 'hand', 400);
      const dw = ctx.measureText(P.date).width;
      ctx.save(); ctx.beginPath(); ctx.rect(PH.iw - 30 - dw - 4, -30, (dw + 8) * kd, 44); ctx.clip();
      ctx.fillStyle = 'rgba(52,58,84,0.62)'; ctx.fillText(P.date, PH.iw - 30 - dw, -2);
      ctx.restore();
    }
    ctx.restore();
  }

  // burn progress curve (accelerating) and its inverse: b(q) = b0 + (b1-b0) q^1.5
  const BURN_POW = 1.5;
  const burnB = (t, B) => { if (t <= B.t0) return -1; const q = clamp((t - B.t0) / B.dur); return B.b0 + (B.b1 - B.b0) * Math.pow(q, BURN_POW); };
  const burnTimeOf = (b, B) => { if (b <= B.b0) return B.t0; if (b > B.b1) return Infinity; return B.t0 + B.dur * Math.pow((b - B.b0) / (B.b1 - B.b0), 1 / BURN_POW); };

  // fill the three burn buffers of photo P for burn level b, then cut/char the live print canvas
  function renderBurn(P, b, t) {
    const F = P.F, N2 = P.N2, kd = P.keep.id.data, od = P.over.id.data, gd = P.glow.id.data;
    const fl = t * 17;
    for (let i = 0, n = F.length; i < n; i++) {
      const d = F[i] - b, j = i * 4;
      // keep mask (paper + crust)
      const ka = d > -CRUST + 0.004 ? 255 : d < -CRUST - 0.006 ? 0 : ((d + CRUST + 0.006) / 0.01 * 255) | 0;
      kd[j + 3] = ka;
      // overlay: crust / scorch / heat-yellowing
      if (d < 0) { od[j] = 18; od[j + 1] = 12; od[j + 2] = 10; od[j + 3] = 255; }
      else if (d < 0.055) { const s = 1 - d / 0.055; od[j] = 64 - 40 * s; od[j + 1] = 30 - 18 * s; od[j + 2] = 12 - 4 * s; od[j + 3] = (70 + 185 * s * s) | 0; }
      else if (d < 0.16) { const s = 1 - (d - 0.055) / 0.105; od[j] = 128; od[j + 1] = 82; od[j + 2] = 36; od[j + 3] = (70 * s * s) | 0; }
      else od[j + 3] = 0;
      // glow: thin white-hot front (brighter on the unburnt side) + ember patches smouldering in the crust
      const nz = N2[i];
      let I = d > 0 ? Math.exp(-(d * d) / 0.000055) : Math.exp(-(d * d) / 0.00011) * 0.8;
      I *= 0.7 + 0.5 * nz;
      if (d < 0 && d > -CRUST) { const e = Math.max(0, nz - 0.5) * 2.2 * (0.6 + 0.4 * Math.sin(fl + nz * 40)); I = Math.max(I, e * (1 + d / CRUST) * 0.75); }
      I *= 0.85 + 0.15 * Math.sin(fl * 1.7 + nz * 25);
      if (I < 0.012) { gd[j + 3] = 0; continue; }
      // colour temperature: deep red -> orange -> amber -> white-hot only at the very peak
      const c = Math.min(1, I);
      if (c < 0.45) { const k = c / 0.45; gd[j] = 150 + 105 * k; gd[j + 1] = 22 + 60 * k; gd[j + 2] = 6 + 12 * k; }
      else if (c < 0.82) { const k = (c - 0.45) / 0.37; gd[j] = 255; gd[j + 1] = 82 + 100 * k; gd[j + 2] = 18 + 55 * k; }
      else { const k = (c - 0.82) / 0.18; gd[j] = 255; gd[j + 1] = 182 + 68 * k; gd[j + 2] = 73 + 150 * k; }
      gd[j + 3] = (255 * Math.min(1, I * 1.25)) | 0;
    }
    P.keep.x.putImageData(P.keep.id, 0, 0); P.over.x.putImageData(P.over.id, 0, 0); P.glow.x.putImageData(P.glow.id, 0, 0);
    const hx = P.halo.getContext('2d');
    hx.setTransform(1, 0, 0, 1, 0, 0); hx.globalCompositeOperation = 'source-over'; hx.filter = 'none'; hx.clearRect(0, 0, P.halo.width, P.halo.height);
    hx.filter = 'blur(3px)'; hx.drawImage(P.glow.c, 0, 0, P.halo.width, P.halo.height); hx.filter = 'none';
  }

  function livePrint(P, capK, b, t) {
    const burning = b > -0.5;
    if (!burning && capK >= 1) {
      if (!P.final) { P.final = Z.canvas(P.base.width, P.base.height); const x = P.final.getContext('2d'); x.drawImage(P.base, 0, 0); x.scale(PS, PS); drawCaption(x, P, 1, P.idx * 13 + 5); }
      return P.final;
    }
    const c = P.live, x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(P.base, 0, 0);
    x.setTransform(PS, 0, 0, PS, 0, 0); drawCaption(x, P, capK, P.idx * 13 + 5); x.setTransform(1, 0, 0, 1, 0, 0);
    if (burning) {
      renderBurn(P, b, t);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.globalCompositeOperation = 'destination-in'; x.drawImage(P.keep.c, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-atop'; x.drawImage(P.over.c, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-over';
    }
    return c;
  }

  // ---- timing
  function memTimes(S, M) {
    const C = S.clock, a = S.args, t0 = S.shot.t0, t1 = S.shot.t1;
    const i0 = firstBeatIdx(C, t0);
    const bt = n => beatT(C, i0 + n);
    const n = M.photos.length;
    const dropBeats = a.dropBeats || [0, 2, 4, 6, 7, 8].slice(0, n);
    const lands = M.photos.map((P, j) => bt(dropBeats[Math.min(j, dropBeats.length - 1)]));
    const burnBeats = a.burnBeats || [8, 9, 10, 11, 11.5, 12];
    const push = a.pushAt ?? bt(8);
    const burns = M.photos.map((P, j) => {
      const bb = burnBeats[Math.min(j, burnBeats.length - 1)];
      const s = Number.isInteger(bb) ? bt(bb) : lerp(bt(Math.floor(bb)), bt(Math.ceil(bb)), bb % 1);
      if (P.isHero) return { t0: s, dur: Math.max(0.6, t1 - s), b0: -0.03, b1: P.faceLevel };
      return { t0: s, dur: 1.65, b0: -0.03, b1: 1.06 };
    });
    return { t0, t1, bt, lands, burns, push };
  }

  // desk-space pose of photo j at time t (drop, skid, settle)
  const DROP = 0.42;
  function photoPose(P, land, t) {
    const sl = P.slot, a = t - land;
    if (a < -DROP) return null;
    let x = sl.x, y = sl.y, r = sl.r, s = sl.s, hgt = 0, alpha = 1;
    const fx = sl.from[0], fy = sl.from[1];
    if (a < 0) {
      const k = 1 + a / DROP;                         // 0..1 through the fall
      hgt = 1 - k * k;                                // gravity
      const lat = 1 - E.outCubic(k);
      x += fx * 230 * lat; y += fy * 170 * lat;
      r += (Z.rnds(P.idx, 9) > 0 ? 1 : -1) * 0.32 * lat;
      s *= 1 + 0.62 * hgt;
      alpha = clamp(k * 5);
    } else {
      // skid a few px along the throw, then a paper-flutter settle
      const sk = 1 - Math.exp(-a * 9);
      x -= fx * 14 * (1 - sk); y -= fy * 10 * (1 - sk);
      s *= 1 - 0.022 * Math.exp(-a * 11) * Math.cos(a * 34);
      r += 0.012 * Math.exp(-a * 8) * Math.sin(a * 26) * (Z.rnds(P.idx, 9) > 0 ? 1 : -1);
    }
    return { x, y, r, s, hgt, alpha };
  }
  const localToDesk = (pose, lx, ly) => {
    const c = Math.cos(pose.r), s = Math.sin(pose.r);
    const X = (lx - PH.fw / 2) * pose.s, Y = (ly - PH.fh / 2) * pose.s;
    return [pose.x + X * c - Y * s, pose.y + X * s + Y * c];
  };

  function memCamera(S, T, M) {
    const t = S.t;
    // drift during the drops, then a long push onto her face as everything burns
    const k1 = inv(T.t0, T.push, t);
    let z = lerp(1.0, 1.055, E.inOutSine(k1)), rot = lerp(0.016, 0.006, k1), cx = lerp(975, 945, k1), cy = lerp(548, 560, k1);
    const hero = M.photos[M.photos.length - 1];
    const hp = photoPose(hero, T.lands[M.photos.length - 1], T.t1);
    const fu = hero.face ? hero.face[0] : 0.5, fv = hero.face ? hero.face[1] : 0.42;
    const [hx, hy] = hp ? localToDesk(hp, fu * PH.fw, fv * PH.fh) : [960, 540];
    if (t > T.push) {
      const k = inv(T.push, T.t1, t);
      const e = 0.55 * E.inOutSine(k) + 0.45 * E.inCubic(k);
      z = lerp(z, S.args.endZoom ?? 1.9, e); rot = lerp(rot, -0.028, e);
      cx = lerp(cx, hx, e); cy = lerp(cy, hy, e);
    }
    // landing bumps (1-frame kick, fast decay)
    for (const L of T.lands) { const a = t - L; if (a >= 0 && a < 0.6) z *= 1 + 0.011 * Math.exp(-a * 11); }
    // breathing handheld
    cx += Z.fbm1(t * 0.35, 5) * 6; cy += Z.fbm1(t * 0.31, 8) * 5; rot += Z.fbm1(t * 0.27, 12) * 0.002;
    return { z, rot, cx, cy };
  }

  Z.scene('memories', {
    preload: a => [...(a.photos || []).map(p => p.bg), a.char, ...(a.photos || []).map(p => typeof p.char === 'string' ? p.char : null)].filter(Boolean),
    init: async () => { for (const s of Z.SHOTS || []) if (s.scene === 'memories') buildMemories(s.args || {}); },
    draw(ctx, S) {
      const a = S.args, t = S.t;
      const M = buildMemories(a);
      const T = memTimes(S, M);
      const cam = memCamera(S, T, M);
      // light script: the evening window light leaves as the burn begins; fire becomes the only light
      const winI = 1 - 0.8 * sstep(T.push - 0.2, T.burns[1] ? T.burns[1].t0 + 0.5 : T.push + 1, t) - 0.15 * sstep(T.t0, T.push, t);

      ctx.save();
      ctx.fillStyle = '#120D0C'; ctx.fillRect(0, 0, W, H);
      // ---------------- desk (camera space)
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.scale(cam.z, cam.z); ctx.translate(-cam.cx, -cam.cy);
      ctx.drawImage(M.desk, -160, -90, W + 320, H + 180);
      // window light pool, sliding slowly as the sun sets
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.3 * winI;
      const wx = lerp(-50, 80, S.p);
      ctx.drawImage(M.windowLight, -180 + wx, -120, W + 360, H + 240);
      ctx.restore();

      // photos
      const firePts = [];
      M.photos.forEach((P, j) => {
        const pose = photoPose(P, T.lands[j], t);
        if (!pose) return;
        const B = T.burns[j];
        const b = burnB(t, B);
        if (b >= B.b1 && !P.isHero && b > 1.05) { drawAshAndSparks(ctx, P, pose, B, t); return; }
        // shadow: grows, softens and separates with height; shrinks as the paper is eaten
        const sh = M.shadow, lift = pose.hgt;
        const burnt = b > 0 ? clamp(b) : 0;
        ctx.save();
        ctx.globalAlpha = (0.62 - 0.3 * lift) * pose.alpha * (1 - 0.85 * burnt);
        ctx.translate(pose.x + 9 + 70 * lift, pose.y + 13 + 95 * lift); ctx.rotate(pose.r); ctx.scale(pose.s * (1 + 0.06 * lift), pose.s * (1 + 0.06 * lift));
        ctx.drawImage(sh.c, -PH.fw / 2 - sh.m, -PH.fh / 2 - sh.m);
        ctx.restore();
        // the print
        const capK = clamp(Z.quant(t - T.lands[j] - 0.12, 12) / (0.14 * ([...(P.caption || '')].length + 1)));
        const canvas = livePrint(P, capK, b, t);
        ctx.save();
        ctx.globalAlpha = pose.alpha;
        ctx.translate(pose.x, pose.y); ctx.rotate(pose.r); ctx.scale(pose.s, pose.s); ctx.translate(-PH.fw / 2, -PH.fh / 2);
        ctx.drawImage(canvas, 0, 0, PH.fw, PH.fh);
        // flash of air as it lands: the paper catches the window light for a frame
        const la = t - T.lands[j];
        if (la >= 0 && la < 0.3) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 * Math.exp(-la * 14) * winI; ctx.fillStyle = '#FFE3B0'; ctx.fillRect(0, 0, PH.fw, PH.fh); }
        if (b > -0.5) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
          ctx.drawImage(P.glow.c, 0, 0, PH.fw, PH.fh);
          ctx.globalAlpha = 0.5; ctx.drawImage(P.halo, -PH.fw * 0.02, -PH.fh * 0.02, PH.fw * 1.04, PH.fh * 1.04);
          const act = Math.sin(Math.PI * clamp((b - B.b0) / (1.05 - B.b0))) * (P.isHero ? 1 : 1);
          firePts.push([pose, act, j]);
        }
        ctx.restore();
        drawDustPuff(ctx, P, pose, T.lands[j], t, winI);
        if (b > -0.5) drawAshAndSparks(ctx, P, pose, B, t);
      });
      // fire light on the desk around burning prints (flickering, warm)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [pose, act, j] of firePts) {
        const fl = 0.75 + 0.25 * Z.noise1(t * 9 + j * 3, 4);
        const g = ctx.createRadialGradient(pose.x, pose.y, 10, pose.x, pose.y, 520 * pose.s);
        g.addColorStop(0, `rgba(255,130,50,${0.2 * act * fl})`); g.addColorStop(0.5, `rgba(200,80,30,${0.08 * act * fl})`); g.addColorStop(1, 'rgba(200,80,30,0)');
        ctx.fillStyle = g; ctx.fillRect(pose.x - 600, pose.y - 600, 1200, 1200);
      }
      ctx.restore();
      ctx.restore();   // camera

      // ---------------- screen-space finish: leaks, motes, vignette
      drawLeaks(ctx, S, T, winI);
      D.dust(ctx, t, { n: 46, seed: 451, color: `rgba(255,228,190,${0.35 * (0.4 + 0.6 * winI)})` });
      bokehDust(ctx, t, winI);
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 1.02);
      vg.addColorStop(0, 'rgba(18,12,10,0)'); vg.addColorStop(1, `rgba(12,8,7,${0.72 - 0.12 * winI})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  });

  // puff of dust motes squeezed out from under a landing print
  function drawDustPuff(ctx, P, pose, land, t, winI) {
    const a = t - land; if (a < 0 || a > 1.4) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 22; k++) {
      const side = Z.rnd(k, P.idx, 1) * 4 | 0, q = Z.rnd(k, P.idx, 2);
      const lx = side === 0 ? q * PH.fw : side === 1 ? PH.fw : side === 2 ? q * PH.fw : 0;
      const ly = side === 0 ? 0 : side === 1 ? q * PH.fh : side === 2 ? PH.fh : q * PH.fh;
      const nx = side === 1 ? 1 : side === 3 ? -1 : 0, ny = side === 0 ? -1 : side === 2 ? 1 : 0;
      const [x0, y0] = localToDesk(pose, lx, ly);
      const c = Math.cos(pose.r), s = Math.sin(pose.r);
      const dx = nx * c - ny * s, dy = nx * s + ny * c;
      const dist = (26 + 60 * Z.rnd(k, P.idx, 3)) * (1 - Math.exp(-a * 5));
      const x = x0 + dx * dist + Z.fbm1(a * 2 + k, 3) * 10, y = y0 + dy * dist - a * 14;
      const al = 0.55 * Math.exp(-a * 2.6) * (0.35 + 0.65 * winI);
      const r = 1.2 + 2.2 * Z.rnd(k, P.idx, 4);
      ctx.fillStyle = `rgba(255,226,186,${al})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ash flakes (detach when the crust passes) and sparks (born on the front); closed-form in t
  function drawAshAndSparks(ctx, P, pose, B, t) {
    ctx.save();
    for (const f of P.ash) {
      const tb = burnTimeOf(f.f + CRUST * 0.8, B); if (!(tb < t)) continue;
      const a = t - tb, life = 1.3 + 1.2 * Z.rnd(f.k, 7);
      if (a > life) continue;
      const [x0, y0] = localToDesk(pose, f.u * PH.fw, f.v * PH.fh);
      const k = a / life;
      const x = x0 + (30 + 40 * Z.rnds(f.k, 8)) * a + Z.fbm1(a * 1.5 + f.k, 9) * 26;
      const y = y0 - 28 * a - 70 * a * a;
      const sc = (2.4 + 5.5 * Z.rnd(f.k, 10) ** 1.5) * (1 + 0.8 * k);
      const rot = Z.rnds(f.k, 11) * 5 * a + f.k;
      const al = Math.pow(1 - k, 1.2);
      const curl = 0.35 + 0.55 * Math.abs(Math.sin(a * 3.2 + f.k));      // flakes curl and flip as they rise
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc * curl);
      ctx.beginPath(); ctx.moveTo(-1, -0.55); ctx.lineTo(0.2, -1); ctx.lineTo(1, -0.2); ctx.lineTo(0.55, 0.8); ctx.lineTo(-0.5, 0.95); ctx.lineTo(-1.05, 0.3); ctx.closePath();
      const hot = Math.exp(-a * 3.2);
      // grey paper ash, lighter on the edge that faces the light
      ctx.globalAlpha = al * (1 - 0.6 * hot); ctx.fillStyle = Z.rnd(f.k, 12) < 0.5 ? '#6E655E' : '#4C4541'; ctx.fill();
      ctx.lineWidth = 0.22; ctx.strokeStyle = 'rgba(170,158,146,0.7)'; ctx.stroke();
      if (hot > 0.04) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = hot * 0.9; ctx.fillStyle = 'rgb(255,120,40)'; ctx.fill(); ctx.lineWidth = 0.3; ctx.strokeStyle = 'rgb(255,200,120)'; ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const f of P.sparks) {
      if (Z.rnd(f.k, 19) > 0.6) continue;
      const tb = burnTimeOf(f.f, B); if (!(tb < t)) continue;
      const a = t - tb, life = 0.3 + 0.55 * Z.rnd(f.k, 20);
      if (a > life) continue;
      const [x0, y0] = localToDesk(pose, f.u * PH.fw, f.v * PH.fh);
      const vx = Z.rnds(f.k, 21) * 70, vy = -40 - 120 * Z.rnd(f.k, 22);
      const sp = a => [x0 + vx * a + Math.sin(a * 9 + f.k) * 6, y0 + vy * a - 50 * a * a];
      const [x, y] = sp(a), [px, py] = sp(Math.max(0, a - 0.05));
      const al = 1 - a / life;
      ctx.strokeStyle = `rgba(255,${(150 + 90 * al) | 0},${(60 + 110 * al * al) | 0},${0.8 * al})`; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `rgba(255,236,190,${al})`; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawLeaks(ctx, S, T, winI) {
    const t = S.t;
    // flare on the first downbeat and on the push (the light "leaves")
    const flare = Math.exp(-Math.max(0, t - T.t0) * 3) * 0.5 + Math.exp(-Math.abs(t - T.push) * 5) * 0.3 + 0.2 * S.clock.downPulse(t, 5);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const blobs = [
      { x: -80 + 60 * Z.fbm1(t * 0.2, 1), y: 180 + 120 * Z.fbm1(t * 0.17, 2), r: 620, c: [240, 140, 90], a: 0.26 },
      { x: W + 60, y: 860 + 90 * Z.fbm1(t * 0.15, 3), r: 700, c: [201, 141, 134], a: 0.22 },
      { x: 1250 + 200 * Z.fbm1(t * 0.1, 4), y: -140, r: 520, c: [255, 200, 150], a: 0.12 },
    ];
    for (const bl of blobs) {
      const al = bl.a * (0.45 + 0.55 * winI) * (0.8 + flare);
      const g = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.r);
      g.addColorStop(0, rgb(bl.c, al)); g.addColorStop(0.45, rgb(bl.c, al * 0.4)); g.addColorStop(1, rgb(bl.c, 0));
      ctx.fillStyle = g; ctx.fillRect(bl.x - bl.r, bl.y - bl.r, bl.r * 2, bl.r * 2);
    }
    ctx.restore();
  }
  // large out-of-focus dust in the foreground (depth)
  function bokehDust(ctx, t, winI) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = Z.fract(Z.rnd(i, 61) + t * 0.006 * (1 + Z.rnd(i, 62))) * (W + 200) - 100;
      const y = Z.rnd(i, 63) * H + Math.sin(t * 0.4 + i) * 20;
      const r = 18 + 40 * Z.rnd(i, 64);
      const al = (0.035 + 0.05 * Z.rnd(i, 65)) * (0.5 + 0.5 * winI) * (0.6 + 0.4 * Math.sin(t * 0.8 + i * 2));
      const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, `rgba(255,225,190,${al})`); g.addColorStop(0.85, `rgba(255,225,190,${al * 1.4})`); g.addColorStop(1, 'rgba(255,225,190,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // ================================================================== ROAD (shots 48 / 49)
  // tiny pinhole camera: yaw about +y (positive = look toward +x), pitch (positive = look down)
  function camera3(pos, yaw, pitch, f) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const C = { f, pos, yaw, pitch, yh: H / 2 - f * Math.tan(pitch) };
    C.cam = (x, y, z) => { const dx = x - pos[0], dy = y - pos[1], dz = z - pos[2]; const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy; return [x1, dy * cp + z1 * sp, -dy * sp + z1 * cp]; };
    C.p = (x, y, z) => { const c = C.cam(x, y, z); if (c[2] < 0.05) return null; return [W / 2 + f * c[0] / c[2], H / 2 - f * c[1] / c[2], c[2]]; };
    C.poly = pts => {
      const cp3 = pts.map(q => C.cam(q[0], q[1], q[2])), out = [], NZ = 0.06;
      for (let i = 0; i < cp3.length; i++) {
        const A = cp3[i], B = cp3[(i + 1) % cp3.length], ain = A[2] > NZ, bin = B[2] > NZ;
        if (ain) out.push(A);
        if (ain !== bin) { const k = (NZ - A[2]) / (B[2] - A[2]); out.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, NZ]); }
      }
      return out.map(c => [W / 2 + f * c[0] / c[2], H / 2 - f * c[1] / c[2]]);
    };
    C.dirX = a => { const x1 = Math.sin(a - yaw), z1 = Math.cos(a - yaw); return z1 > 0.02 ? W / 2 + f * x1 / (z1 * cp) : (x1 > 0 ? 9e4 : -9e4); };
    return C;
  }
  const pathPoly = (ctx, P) => { if (P.length < 3) return false; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); return true; };
  // a strip on the ground along z (x0..x1, z0..z1)
  const gquad = (C, x0, x1, z0, z1, y = 0) => C.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  // a strip on the ground along x (for run mode seams)

  // colour of the road light by distance: tear-cold near -> white-gold -> dawn rose at the horizon
  const RAMP = [[0, [190, 240, 255]], [0.22, [236, 250, 255]], [0.45, [255, 244, 222]], [0.72, [255, 212, 160]], [1, [246, 168, 158]]];
  function rampAt(k) {
    k = clamp(k);
    for (let i = 1; i < RAMP.length; i++) if (k <= RAMP[i][0]) { const [ka, ca] = RAMP[i - 1], [kb, cb] = RAMP[i]; return mixc(ca, cb, (k - ka) / (kb - ka)); }
    return RAMP[RAMP.length - 1][1];
  }
  const zk = (z, zn = 1.2, zf = 400) => Math.log(Math.max(zn, z) / zn) / Math.log(zf / zn);

  // sky, dawn, mirror ground, glints, mist
  function drawWorld(ctx, C, t, o) {
    const yh = C.yh, dawn = o.dawn, dx = o.dawnX;
    // sky
    const skyTop = Math.min(yh - 1, H);
    if (skyTop > -200) {
      const g = ctx.createLinearGradient(0, yh - 950, 0, yh);
      g.addColorStop(0, '#030207'); g.addColorStop(0.55, '#07050E'); g.addColorStop(0.86, rgb(mixc([14, 10, 26], [40, 26, 60], dawn), 1)); g.addColorStop(1, rgb(mixc([30, 20, 44], [104, 62, 98], dawn), 1));
      ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, yh + 300);
    }
    // ground: black mirror
    if (yh < H + 300) {
      const g = ctx.createLinearGradient(0, yh, 0, yh + 700);
      g.addColorStop(0, rgb(mixc([16, 12, 26], [44, 28, 50], dawn), 1)); g.addColorStop(0.08, '#0A0812'); g.addColorStop(1, '#040308');
      ctx.fillStyle = g; ctx.fillRect(-300, yh, W + 600, H - yh + 600);
    }
    // stars (few, faint, fading with the dawn)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const sx = Z.rnd(i, 801) * (W + 400) - 200 + o.starShift, sy = yh - 60 - Z.rnd(i, 802) * 900;
      if (sy < -10 || sy > H) continue;
      const al = (0.18 + 0.4 * Z.rnd(i, 803)) * (0.6 + 0.4 * Math.sin(t * (1 + Z.rnd(i, 804)) + i)) * (1 - 0.7 * dawn) * sstep(0, 260, yh - sy);
      ctx.fillStyle = `rgba(220,215,255,${al})`; ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    // dawn glow above the horizon + its reflection below
    if (dawn > 0.001) {
      ctx.save(); ctx.translate(dx, yh);
      ctx.beginPath(); ctx.rect(-4000, -3000, 8000, 3000); ctx.clip();
      ctx.scale(1, 0.26);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1300);
      g.addColorStop(0, `rgba(255,222,176,${0.9 * dawn})`); g.addColorStop(0.18, `rgba(246,168,150,${0.55 * dawn})`); g.addColorStop(0.5, `rgba(154,106,160,${0.22 * dawn})`); g.addColorStop(1, 'rgba(58,45,99,0)');
      ctx.fillStyle = g; ctx.fillRect(-1300, -1300, 2600, 1300);
      ctx.restore();
      ctx.save(); ctx.translate(dx, yh); ctx.beginPath(); ctx.rect(-4000, 0, 8000, 3000); ctx.clip(); ctx.scale(1, 0.11);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1300);
      g.addColorStop(0, `rgba(255,214,170,${0.55 * dawn})`); g.addColorStop(0.2, `rgba(230,150,150,${0.25 * dawn})`); g.addColorStop(1, 'rgba(58,45,99,0)');
      ctx.fillStyle = g; ctx.fillRect(-1300, 0, 2600, 1300);
      ctx.restore();
      // reflected column under the brightest point (wet ground)
      ctx.save(); ctx.translate(dx, yh); ctx.scale(1, 5.5);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70);
      g.addColorStop(0, `rgba(255,220,180,${0.22 * dawn})`); g.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = g; ctx.fillRect(-70, 0, 140, 70); ctx.restore();
      // horizon hairline
      const hl = ctx.createLinearGradient(dx - 1500, 0, dx + 1500, 0);
      hl.addColorStop(0, 'rgba(255,200,170,0)'); hl.addColorStop(0.5, `rgba(255,236,210,${0.75 * dawn})`); hl.addColorStop(1, 'rgba(255,200,170,0)');
      ctx.fillStyle = hl; ctx.fillRect(dx - 1500, yh - 1, 3000, 2);
    }
    // mist band hugging the horizon
    const mg = ctx.createLinearGradient(0, yh - 70, 0, yh + 60);
    mg.addColorStop(0, 'rgba(90,70,120,0)'); mg.addColorStop(0.55, `rgba(110,80,130,${0.1 + 0.16 * dawn})`); mg.addColorStop(1, 'rgba(90,70,120,0)');
    ctx.fillStyle = mg; ctx.fillRect(-300, yh - 70, W + 600, 130);
    // glints on the wet ground: specular toward the dawn
    if (o.glints) for (const gp of o.glints) {
      const p = C.p(gp[0], 0, gp[1]); if (!p || p[1] < yh + 1 || p[1] > H + 10) continue;
      const spec = Math.exp(-Math.pow((p[0] - dx) / 900, 2)) * (0.25 + dawn);
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + gp[2] * 3) + gp[2] * 40);
      const al = spec * tw * 0.5 * Math.min(1, 6 / p[2] + 0.2);
      if (al < 0.02) continue;
      const len = Math.min(40, 3 + 180 / p[2]);
      ctx.fillStyle = `rgba(255,226,200,${al})`; ctx.fillRect(p[0] - len / 2, p[1], len, Math.max(0.8, 5 / p[2]));
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ the tear
  function drawTearDrop(ctx, x, y, r, t, alpha, refr, mirror) {
    const wob = Math.sin(t * 10.5) * 0.055;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + wob, (1 - wob) * (mirror ? -1 : 1)); ctx.globalAlpha *= alpha;
    const path = () => { ctx.beginPath(); ctx.moveTo(0, -r * 2.05); ctx.bezierCurveTo(r * 0.3, -r * 1.35, r * 1.02, -r * 0.62, r, 0); ctx.arc(0, 0, r, 0, Math.PI); ctx.bezierCurveTo(-r * 1.02, -r * 0.62, -r * 0.3, -r * 1.35, 0, -r * 2.05); ctx.closePath(); };
    // refraction: the world behind, inverted and magnified inside the drop
    if (refr) { ctx.save(); path(); ctx.clip(); ctx.scale(1, -1); ctx.globalAlpha *= 0.9; ctx.drawImage(refr, -r * 1.25, -r * 1.6, r * 2.5, r * 2.9); ctx.restore(); }
    path();
    let g = ctx.createRadialGradient(-r * 0.1, -r * 0.2, r * 0.2, 0, -r * 0.3, r * 1.9);
    g.addColorStop(0, 'rgba(180,215,255,0.05)'); g.addColorStop(0.62, 'rgba(40,50,80,0.18)'); g.addColorStop(1, 'rgba(6,8,16,0.75)');
    ctx.fillStyle = g; ctx.fill();
    // caustic: dawn light focused at the bottom
    ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(r * 0.05, r * 0.62, 0, r * 0.05, r * 0.62, r * 0.75);
    g.addColorStop(0, 'rgba(255,214,170,0.95)'); g.addColorStop(0.4, 'rgba(246,168,150,0.35)'); g.addColorStop(1, 'rgba(246,168,150,0)');
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    // rim: cool on top, warm underneath
    const rg = ctx.createLinearGradient(0, -r * 2, 0, r);
    rg.addColorStop(0, 'rgba(210,235,255,0.55)'); rg.addColorStop(0.55, 'rgba(210,235,255,0.25)'); rg.addColorStop(1, 'rgba(255,215,185,0.95)');
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rg; ctx.lineWidth = 1.6; ctx.stroke();
    // speculars
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.save(); ctx.translate(-r * 0.4, -r * 0.42); ctx.rotate(-0.55); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.13, r * 0.38, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(r * 0.36, r * 0.3, r * 0.07, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function tearTimes(S) {
    const C = S.clock, a = S.args, i0 = firstBeatIdx(C, S.shot.t0);
    const bt = n => beatT(C, i0 + n);
    return { t0: S.shot.t0, t1: S.shot.t1, imp: a.impact ?? bt(3), hz: a.horizon ?? bt(6), open: a.open ?? bt(8), dolly: a.dolly ?? bt(12) };
  }
  const ZD = 4.0, HC = 1.25, F0 = 1150, P_FALL0 = -0.46, P_IMP = 0.15, P_ROAD = 0.105;
  function tearPitch(T, t) {
    if (t < T.imp) return lerp(P_FALL0, P_IMP, E.inOutSine(inv(T.t0, T.imp, t)));
    return lerp(P_IMP, P_ROAD, E.inOutSine(inv(T.imp + 0.15, T.open + 0.6, t)));
  }
  function tearCam(T, t) {
    let pitch = tearPitch(T, t), camZ = 0, f = F0;
    if (t > T.dolly) { const k = inv(T.dolly, T.t1, t); camZ = 3.4 * k * k * k + 0.4 * k * k; pitch -= 0.03 * E.inOutSine(k); f = lerp(F0, 1040, E.inCubic(k)); }
    pitch += 0.0022 * Z.fbm1(t * 0.55, 3);
    const yaw = 0.0028 * Z.fbm1(t * 0.45, 9);
    return camera3([0, HC, camZ], yaw, pitch, f);
  }
  // drop world height so that it follows a designed screen path while the camera tilts
  function dropY(T, t) {
    const k = inv(T.t0, T.imp, t);
    const pitch = tearPitch(T, t), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cImp = camera3([0, HC, 0], 0, P_IMP, F0), sImp = cImp.p(0, 0, ZD)[1];
    const s = 0.72 * k + 0.28 * k * k * k;
    const sy = lerp(-90, sImp, s);
    const m = (H / 2 - sy) / F0;
    return Math.max(0, HC + ZD * (m * cp - sp) / (cp + m * sp));
  }

  const glintCache = new Map();
  function glints(seed, n, x0, x1, z0, z1) {
    const k = [seed, n, x0, x1, z0, z1].join('|'); if (glintCache.has(k)) return glintCache.get(k);
    const out = []; for (let i = 0; i < n; i++) out.push([lerp(x0, x1, Z.rnd(i, seed)), z0 * Math.pow(z1 / z0, Z.rnd(i, seed + 1)), Z.rnd(i, seed + 2)]);
    glintCache.set(k, out); return out;
  }

  let refrC = null, glowC = null;
  function refrCanvas() { return refrC || (refrC = Z.canvas(128, 128)); }
  function glowCanvas() { return glowC || (glowC = Z.canvas(480, 270)); }

  // road of light: tiles, rails, spine, far strip and a soft low-res glow pass
  function drawRoad(ctx, C, t, S, o) {
    const hw = o.hw, zNear = Math.max(0.2, C.pos[2] + 0.25), rowL = 1.0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    // glow pass (low-res, blurred) -> spill light on the mirror ground
    if (hw > 0.01) {
      const gc = glowCanvas(), gx = gc.getContext('2d');
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'source-over'; gx.filter = 'none'; gx.clearRect(0, 0, 480, 270);
      gx.setTransform(0.25, 0, 0, 0.25, 0, 0); gx.filter = 'blur(7px)'; gx.globalCompositeOperation = 'lighter';
      const segs = [zNear, 3, 6, 12, 25, 60, 160, 2000];
      for (let i = 0; i < segs.length - 1; i++) {
        const za = Math.max(segs[i], zNear), zb = segs[i + 1]; if (zb <= za) continue;
        const P = gquad(C, -hw * 1.6, hw * 1.6, za, zb); if (!pathPoly(gx, P)) continue;
        gx.fillStyle = rgb(rampAt(zk((za + zb) / 2)), 0.5 * o.glowA * o.reveal(za));
        gx.fill();
      }
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.filter = 'none';
      ctx.drawImage(gc, 0, 0, W, H);
    }
    // far road (merges into the dawn)
    if (hw > 0.01) {
      const segs = [45, 70, 110, 180, 320, 700, 3000];
      for (let i = 0; i < segs.length - 1; i++) {
        const za = Math.max(segs[i], zNear), zb = segs[i + 1]; if (zb <= za) continue;
        const P = gquad(C, -hw, hw, za, zb); if (!pathPoly(ctx, P)) continue;
        ctx.fillStyle = rgb(rampAt(zk((za + zb) / 2)), 0.3 * o.reveal(za)); ctx.fill();
      }
    }
    // tiles
    if (hw > 0.05) {
      const nc = 4, gap = 0.055, cw = (2 * hw) / nc;
      const r0 = Math.floor(zNear / rowL), r1 = Math.ceil(52 / rowL);
      for (let r = r0; r <= r1; r++) {
        const za = Math.max(zNear, r * rowL + gap / 2), zb = (r + 1) * rowL - gap / 2; if (zb <= za) continue;
        const zc = (za + zb) / 2, far = 1 - sstep(30, 52, zc), rev = o.reveal(zc);
        if (rev <= 0.001 || far <= 0) continue;
        const col = rampAt(zk(zc));
        const pulse = o.pulse ? o.pulse(t - zc * 0.011) : 0;
        for (let q = 0; q < nc; q++) {
          const ig = o.tileIgn ? o.tileIgn(r, q, zc) : -1e9;
          if (t < ig) continue;
          const ia = t - ig, on = clamp(ia / 0.22), flash = 1 + 1.1 * Math.exp(-ia * 7);
          const br = ((0.32 + 0.4 * Z.rnd(r, q, 3)) * flash + 0.5 * pulse) * on * rev * far;
          if (br < 0.01) continue;
          const x0 = -hw + q * cw + gap / 2, x1 = x0 + cw - gap;
          let zA = za, zB = zb;
          if (o.blur) zB = Math.min(zb + o.blur, (r + 1) * rowL + o.blur);
          const P = gquad(C, x0, x1, zA, zB); if (!pathPoly(ctx, P)) continue;
          ctx.fillStyle = rgb(col, Math.min(0.9, 0.2 * br * (o.blur ? 0.6 : 1))); ctx.fill();
          ctx.strokeStyle = rgb(col, Math.min(1, 0.45 * br)); ctx.lineWidth = Math.max(0.6, 2.2 / Math.max(1, zc / 3)); ctx.stroke();
        }
      }
      // rails at the road edges
      for (const sx of [-1, 1]) railLine(ctx, C, sx * hw, zNear, 3000, 0.022, o, 0.9);
    }
    ctx.restore();
  }
  // a glowing line on the ground along z, width w (m), split in log segments for the colour ramp
  function railLine(ctx, C, x, z0, z1, w, o, amp = 1) {
    if (z1 <= z0) return;
    const n = 14, lz0 = Math.log(z0), lz1 = Math.log(z1);
    for (let pass = 0; pass < 2; pass++) {
      const ww = pass ? w : w * 6, aa = pass ? 0.95 : 0.12;
      for (let i = 0; i < n; i++) {
        const za = Math.exp(lz0 + (lz1 - lz0) * i / n), zb = Math.exp(lz0 + (lz1 - lz0) * (i + 1) / n);
        const P = gquad(C, x - ww, x + ww, za, zb); if (!pathPoly(ctx, P)) continue;
        const rev = o && o.reveal ? o.reveal(za) : 1;
        ctx.fillStyle = rgb(rampAt(zk((za + zb) / 2)), aa * amp * rev); ctx.fill();
      }
    }
  }

  // motes of light rising from the road (and their reflections)
  function drawMotes(ctx, C, t, o) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < o.n; i++) {
      const life = 2.6 + 2.2 * Z.rnd(i, 901), k = Z.fract((t - o.t0) / life + Z.rnd(i, 902));
      const x = (Z.rnd(i, 903) - 0.5) * 2 * o.hw * 1.7, z = o.zmin + (o.zmax - o.zmin) * Math.pow(Z.rnd(i, 904), 1.6);
      if (o.visible && !o.visible(z, t)) continue;
      const y = 0.05 + k * (0.9 + 1.4 * Z.rnd(i, 905));
      const al = Math.sin(Math.PI * k) * (0.35 + 0.65 * Z.rnd(i, 906)) * o.a;
      const p = C.p(x + Z.fbm1(t * 0.3 + i, 907) * 0.3, y, z); if (!p) continue;
      const r = Math.max(1, 26 / p[2]);
      const col = rampAt(zk(z));
      let g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3);
      g.addColorStop(0, rgb([255, 250, 238], al)); g.addColorStop(0.3, rgb(col, al * 0.6)); g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g; ctx.fillRect(p[0] - r * 3, p[1] - r * 3, r * 6, r * 6);
      const q = C.p(x, -y, z); if (!q) continue;
      g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 3);
      g.addColorStop(0, rgb(col, al * 0.25)); g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g; ctx.fillRect(q[0] - r * 3, q[1] - r * 3, r * 6, r * 6);
    }
    ctx.restore();
  }

  function drawTear(ctx, S) {
    const t = S.t, T = tearTimes(S);
    const C = tearCam(T, t);
    const aImp = t - T.imp, aHz = t - T.hz, aOpen = t - T.open;
    const dawn = 0.1 + 0.42 * sstep(T.hz, T.hz + 1.4, t) + 0.2 * sstep(T.open, T.dolly, t) + 0.14 * sstep(T.dolly, T.t1, t);
    const dawnX = C.dirX(0);
    drawWorld(ctx, C, t, { dawn, dawnX, starShift: 0, glints: glints(71, 150, -40, 40, 2.5, 160) });

    // ---- the line of light and the road
    const lineK = inv(T.imp + 0.02, T.hz, t);
    const lineE = 1 - Math.pow(1 - lineK, 2.2);
    const zf = aImp > 0.02 ? (t >= T.hz ? 3000 : Math.min(3000, ZD / (1 - 0.996 * lineE))) : ZD;
    const zb = aImp > 0.02 ? ZD - (ZD - 0.2) * E.outExpo(clamp(lineK * 1.7)) : ZD;
    const hw = aOpen > 0 ? 1.15 * (1 - Math.pow(2, -9 * clamp(aOpen / 0.95))) : 0;
    const reveal = z => (z >= zb - 0.01 && z <= zf + 0.01 ? 1 : 0);
    const C2 = S.clock;
    drawRoad(ctx, C, t, S, {
      hw, glowA: 0.9 * clamp(aOpen / 0.6), reveal,
      tileIgn: (r, q, zc) => T.open + 0.1 + Math.abs(zc - ZD) * (zc > ZD ? 0.021 : 0.06) + Z.rnd(r, q, 7) * 0.09,
      pulse: tt => (tt > T.open + 0.6 ? C2.pulse(tt, 6.5) : 0),
    });
    if (aImp > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // spine (the tear's own line) — stays brightest
      const spA = 1 - 0.35 * sstep(T.open, T.open + 1.5, t);
      railLine(ctx, C, 0, Math.max(zb, C.pos[2] + 0.25), zf, 0.03, null, spA);
      railLine(ctx, C, 0, Math.max(zb, C.pos[2] + 0.25), zf, 0.012, null, spA);
      // racing head
      if (t < T.hz + 0.1) {
        const hp = C.p(0, 0, Math.min(zf, 2500));
        if (hp) { D.glow(ctx, hp[0], hp[1], 30 + 220 / Math.max(1, zf / ZD), '#FFF1D6', 0.9); D.glow(ctx, hp[0], hp[1], 90, '#F6A89E', 0.35); }
      }
      ctx.restore();
    }
    // horizon ignition: the line hits the horizon and spreads sideways
    if (aHz > 0) {
      const L = 1700 * E.outExpo(clamp(aHz / 0.9)), I = 0.35 + 0.65 * Math.exp(-aHz * 2.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(dawnX - L, 0, dawnX + L, 0);
      g.addColorStop(0, 'rgba(255,210,180,0)'); g.addColorStop(0.5, `rgba(255,244,226,${I})`); g.addColorStop(1, 'rgba(255,210,180,0)');
      ctx.fillStyle = g; ctx.fillRect(dawnX - L, C.yh - 1.5, 2 * L, 3);
      D.glow(ctx, dawnX, C.yh, 160 + 200 * Math.exp(-aHz * 2), '#FFE2B8', 0.7 * Math.exp(-aHz * 1.6) + 0.12);
      ctx.save(); ctx.translate(dawnX, C.yh); ctx.scale(1, 0.035);
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1400);
      sg.addColorStop(0, `rgba(255,236,214,${0.8 * Math.exp(-aHz * 1.8)})`); sg.addColorStop(1, 'rgba(255,200,170,0)');
      ctx.fillStyle = sg; ctx.fillRect(-1400, -1400, 2800, 2800); ctx.restore();
      ctx.restore();
    }
    // motes after the road opens
    if (aOpen > 0) drawMotes(ctx, C, t, { n: 70, t0: T.open, hw: 1.15, zmin: Math.max(1.5, C.pos[2] + 1), zmax: 45, a: clamp(aOpen / 1.2), visible: (z) => t > T.open + 0.1 + Math.abs(z - ZD) * 0.021 + 0.3 });

    // ---- impact: ripples, crown, jet, flash
    const pImp = C.p(0, 0, ZD);
    if (aImp >= 0 && pImp) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const rings = [[0, 1.7, 0.9], [0.1, 1.25, 0.7], [0.24, 2.3, 0.5], [0.42, 3.1, 0.35], [0.7, 4.2, 0.25]];
      for (const [dl, rmax, A] of rings) {
        const a = aImp - dl; if (a <= 0) continue;
        const R = rmax * (1 - Math.exp(-a * 1.35)), al = A * Math.exp(-a * 0.75);
        if (al < 0.01) continue;
        ctx.beginPath(); let first = true;
        for (let i = 0; i <= 72; i++) { const an = (i / 72) * TAU; const p = C.p(Math.sin(an) * R, 0, ZD + Math.cos(an) * R); if (!p) { first = true; continue; } if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
        ctx.strokeStyle = `rgba(214,236,255,${al})`; ctx.lineWidth = 1 + 2.4 * Math.exp(-a * 1.2); ctx.stroke();
        ctx.strokeStyle = `rgba(214,236,255,${al * 0.25})`; ctx.lineWidth = 7; ctx.stroke();
      }
      // crown droplets (ballistic, slow motion gravity)
      const g = 4.2;
      for (let i = 0; i < 18; i++) {
        const an = (i / 18) * TAU + Z.rnds(i, 31) * 0.2, vr = 0.45 + 0.55 * Z.rnd(i, 32), vy = 1.0 + 0.9 * Z.rnd(i, 33);
        const tl = (2 * vy) / g;
        if (aImp < tl) {
          const pos = a => [Math.sin(an) * vr * a, vy * a - 0.5 * g * a * a, ZD + Math.cos(an) * vr * a];
          const p = C.p(...pos(aImp)), q = C.p(...pos(Math.max(0, aImp - 0.045)));
          if (p && q) { ctx.strokeStyle = 'rgba(235,246,255,0.9)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); D.glow(ctx, p[0], p[1], 10, '#DDF3FF', 0.5); }
        } else {
          const a = aImp - tl; if (a > 0.8) continue;
          const lx = Math.sin(an) * vr * tl, lz = ZD + Math.cos(an) * vr * tl, R = 0.25 * (1 - Math.exp(-a * 3)), al = 0.5 * Math.exp(-a * 3);
          ctx.beginPath(); let first = true;
          for (let k = 0; k <= 24; k++) { const b = (k / 24) * TAU; const p = C.p(lx + Math.sin(b) * R, 0, lz + Math.cos(b) * R); if (!p) continue; if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
          ctx.strokeStyle = `rgba(214,236,255,${al})`; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
      // Worthington jet + detaching droplet
      if (aImp < 0.62) {
        const hj = 0.38 * Math.sin(Math.PI * clamp(aImp / 0.62));
        const a0 = C.p(0, 0, ZD), a1 = C.p(0, hj, ZD);
        if (a0 && a1) { ctx.strokeStyle = 'rgba(235,246,255,0.85)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke(); }
      }
      if (aImp > 0.22 && aImp < 1.05) {
        const a = aImp - 0.22, y = 0.3 + 0.95 * a - 2.1 * a * a;
        if (y > 0) { const p = C.p(0, y, ZD); if (p) { ctx.fillStyle = 'rgba(240,248,255,0.95)'; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, TAU); ctx.fill(); D.glow(ctx, p[0], p[1], 16, '#DDF3FF', 0.5); } }
      }
      // flash + anamorphic streak
      const k = Math.exp(-aImp * 3.4);
      D.glow(ctx, pImp[0], pImp[1], 120 + 200 * k, '#FFF4E4', 0.95 * k + 0.1 * Math.exp(-aImp * 0.6));
      ctx.save(); ctx.translate(pImp[0], pImp[1]); ctx.scale(1, 0.018);
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1100);
      sg.addColorStop(0, `rgba(210,238,255,${0.85 * k})`); sg.addColorStop(1, 'rgba(210,238,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-1100, -1100, 2200, 2200); ctx.restore();
      ctx.restore();
    }

    // ---- the falling tear (and its reflection rising to meet it)
    if (aImp < 0) {
      const yd = dropY(T, t);
      const p = C.p(0, yd, ZD), q = C.p(0, -yd, ZD);
      const r = 25;
      // refraction source: what is behind the drop, captured before we draw it
      const rc = refrCanvas(), rx = rc.getContext('2d');
      if (p) {
        rx.setTransform(1, 0, 0, 1, 0, 0); rx.clearRect(0, 0, 128, 128);
        const R = r * 9;
        rx.drawImage(ctx.canvas, p[0] - R, p[1] - R * 0.2, 2 * R, 2 * R, 0, 0, 128, 128);
        // slow-motion trail
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const tg = ctx.createLinearGradient(p[0], p[1] - 260, p[0], p[1] - r);
        tg.addColorStop(0, 'rgba(200,230,255,0)'); tg.addColorStop(1, 'rgba(200,230,255,0.14)');
        ctx.fillStyle = tg; ctx.fillRect(p[0] - 1.2, p[1] - 260, 2.4, 260 - r);
        ctx.restore();
        D.glow(ctx, p[0], p[1], r * 4, '#BFE6FF', 0.12);
        drawTearDrop(ctx, p[0], p[1], r, t, 1, rc, false);
      }
      if (q && q[1] > C.yh && q[1] < H + 80) {
        ctx.save(); ctx.globalAlpha = 0.42 * sstep(C.yh, C.yh + 40, q[1]);
        drawTearDrop(ctx, q[0], q[1], r * 0.96, t, 1, null, true);
        ctx.restore();
      }
    }
    // cinematic vignette (heavier while falling)
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.25, W / 2, H * 0.5, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(2,1,6,${0.78 - 0.25 * sstep(T.open, T.dolly, t)})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------------ the run
  function runTimes(S) {
    const a = S.args, t0 = S.shot.t0, t1 = S.shot.t1, au = Z.audio || {};
    let fr = a.freezeAt;
    if (fr == null) { const st = (au.stops || []).find(s => s.start > t0 + 0.3 && s.start < t1 + 0.6); fr = st ? st.start : Infinity; }
    let slow = a.slowAt;
    if (slow == null) { const db = (au.downbeats || []).find(d => d > t0 + 0.25); slow = db && db < fr ? db : Infinity; }
    return { t0, t1, fr, slow };
  }
  const V1 = 8.5, V2 = 1.5, RAMPD = 0.4;
  function runDist(t, T) {
    t = Math.min(t, T.fr);
    if (t <= T.slow) return V1 * (t - T.t0);
    const d0 = V1 * (T.slow - T.t0), a = t - T.slow;
    if (a <= RAMPD) { const s = a / RAMPD; return d0 + V1 * a + (V2 - V1) * RAMPD * (s * s * s - s * s * s * s / 2); }
    return d0 + V1 * RAMPD + (V2 - V1) * RAMPD * 0.5 + V2 * (a - RAMPD);
  }
  const runSpeed = (t, T) => (t >= T.fr ? 0 : t <= T.slow ? V1 : lerp(V1, V2, sstep(0, 1, (t - T.slow) / RAMPD)));

  // her image, with the hair/ribbon side streaming as columns (flag-like flutter perpendicular to the flow)
  function drawRunner(ctx, img, x, y, h, o) {
    const s = h / img.height, w = img.width * s;
    const ax = 0.235, ay = 0.985, split = 0.56;
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(1, o.sy || 1);
    const x0 = -w * ax, y0 = -h * ay;
    const sw = img.width * split;
    ctx.drawImage(img, 0, 0, sw + 1, img.height, x0, y0, w * split + s, h);
    const N = 56, tt = o.ft;
    for (let i = 0; i < N; i++) {
      const u0 = split + (1 - split) * (i / N), u1 = split + (1 - split) * ((i + 1) / N);
      const k = (u0 - split) / (1 - split);
      const dy = o.amp * k * k * Math.sin(k * 5.2 - tt * o.speed) + o.amp * 0.3 * k * Math.sin(tt * 2.3 + k * 2);
      const sxp = u0 * img.width, swp = (u1 - u0) * img.width;
      ctx.drawImage(img, sxp, 0, swp + 0.6, img.height, x0 + u0 * w, y0 + dy, (u1 - u0) * w + 0.6, h);
    }
    ctx.restore();
    return { w, x0: x - w * ax, y0: y - h * ay };
  }

  function drawRun(ctx, S) {
    const t = S.t, T = runTimes(S), a = S.args;
    const img = Z.imgSync(a.char || 'assets/char/run.png');
    const tf = Math.min(t, T.fr);                          // frozen world time
    const dist = runDist(t, T), v = runSpeed(t, T), vk = v / V1;
    const zh = 20 + dist;
    // tracking camera: left of the road, slightly ahead of her, looking back across the road
    const yaw = Math.PI / 2 + 0.3, F = [Math.sin(yaw), 0, Math.cos(yaw)], R = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const tgt = [0.05, 0.92, zh - 0.25], dcam = 2.75, lat = -0.62;
    const sh = D.shake(tf, 1, 24, 7);
    const shk = 0.012 * vk * (t < T.fr ? 1 : 0);
    const pos = [tgt[0] - F[0] * dcam + R[0] * lat, 1.02 + sh[1] * shk * 0.5, tgt[2] - F[2] * dcam + R[2] * lat];
    const pitch = 0.035 + sh[0] * shk * 0.02 + 0.004 * Z.fbm1(tf * 0.8, 2);
    const C = camera3(pos, yaw + 0.004 * Z.fbm1(tf * 0.6, 4), pitch, 1060);
    const dawnX = -260;
    const roll = -0.045;
    // freeze punch
    const af = t - T.fr, punch = af > 0 ? 1 + 0.035 * E.outExpo(clamp(af / 0.12)) : 1;

    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(roll); ctx.scale(punch, punch); ctx.translate(-W / 2, -H / 2);
    drawWorld(ctx, C, tf, { dawn: 0.85, dawnX, starShift: -dist * 2, glints: runGlints(zh) });
    // road (tiles rushing past), a fixed world strip along z
    const hw = 1.15, rowL = 1.0, nc = 4, gap = 0.055, cw = (2 * hw) / nc;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // spill glow of the road on the ground
    {
      const gc = glowCanvas(), gx = gc.getContext('2d');
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'source-over'; gx.filter = 'none'; gx.clearRect(0, 0, 480, 270);
      gx.setTransform(0.25, 0, 0, 0.25, 0, 0); gx.filter = 'blur(8px)'; gx.globalCompositeOperation = 'lighter';
      for (let z = zh - 60; z < zh + 14; z += 6) { const P = gquad(C, -hw * 1.7, hw * 1.7, z, z + 6); if (pathPoly(gx, P)) { gx.fillStyle = rgb(rampAt(0.35 + 0.4 * sstep(zh + 10, zh - 50, z)), 0.45); gx.fill(); } }
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.filter = 'none';
      ctx.drawImage(gc, 0, 0, W, H);
    }
    const blurL = Math.min(0.9, v / 30 * 1.1);               // motion smear length (m) per frame-ish
    const r0 = Math.floor((zh - 60) / rowL), r1 = Math.ceil((zh + 14) / rowL);
    const pulseT = tf;
    for (let r = r0; r <= r1; r++) {
      const za = r * rowL + gap / 2, zb = (r + 1) * rowL - gap / 2, zc = (za + zb) / 2;
      const rel = zc - zh;                                     // + ahead of her (toward the camera side / the dawn)
      const tone = 0.3 + 0.45 * sstep(10, -50, rel);           // ahead: cooler/whiter, behind: warm (fades to the past)
      const col = rampAt(tone);
      const fade = sstep(-60, -30, rel) * (1 - sstep(8, 14, rel));
      const pulse = S.clock.pulse(pulseT + rel * 0.01, 6.5);
      for (let q = 0; q < nc; q++) {
        const br = ((0.34 + 0.4 * Z.rnd(r, q, 3)) + 0.45 * pulse) * fade;
        if (br < 0.01) continue;
        const x0 = -hw + q * cw + gap / 2, x1 = x0 + cw - gap;
        const P = gquad(C, x0, x1, za, zb + blurL); if (!pathPoly(ctx, P)) continue;
        ctx.fillStyle = rgb(col, Math.min(0.85, 0.2 * br / (1 + blurL))); ctx.fill();
        ctx.strokeStyle = rgb(col, Math.min(1, 0.42 * br / (1 + blurL * 0.6))); ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
    for (const sx of [-1, 0, 1]) railLine(ctx, C, sx * hw, zh - 400, zh + 30, sx ? 0.02 : 0.026, null, sx ? 0.8 : 1);
    ctx.restore();

    // air motes streaking past (world-fixed, wrapped around her)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const span = 60, zz = zh + 12 - Z.fract(Z.rnd(i, 501) - (dist) / span) * span;
      const x = lerp(-2.6, 9, Z.rnd(i, 502)), y = 0.1 + 2.6 * Z.rnd(i, 503);
      const p = C.p(x, y, zz), q = C.p(x, y, zz + Math.max(0.05, v * 0.045)); if (!p || !q) continue;
      const al = (0.25 + 0.5 * Z.rnd(i, 504)) * Math.min(1, 3 / p[2]) * (0.5 + 0.5 * Math.sin(tf * 3 + i));
      ctx.strokeStyle = rgb(rampAt(0.3 + 0.4 * Z.rnd(i, 505)), al); ctx.lineWidth = Math.max(1, 5 / p[2]);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
    ctx.restore();

    // ---- her
    if (img) {
      const tq = Z.quant(tf, 12);
      const dq = runDist(tq, T);
      const ph = dq / 1.9;                                        // strides
      const foot = C.p(0, 0, zh), head = C.p(0, 1.62, zh);
      if (foot && head) {
        const hpx = (foot[1] - head[1]) * 1.02;
        const bob = -Math.abs(Math.sin(Math.PI * ph)) * 16 * (0.4 + 0.6 * vk);
        const rock = 0.028 * Math.sin(TAU * ph * 0.5) * (0.4 + 0.6 * vk);
        const sq = 1 - 0.018 * Math.pow(Math.cos(Math.PI * ph), 8);
        const fx = foot[0], fy = foot[1] + bob;
        // scratch: her, lit
        const sc = Z.scratch[0], sx = sc.getContext('2d');
        sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1; sx.filter = 'none'; sx.clearRect(0, 0, W, H);
        const ro = { rot: rock - 0.05, sy: sq, amp: 15 * (0.35 + 0.65 * vk), speed: 7.5, ft: tq };
        const bb = drawRunner(sx, img, fx, fy, hpx, ro);
        sx.globalCompositeOperation = 'source-atop';
        // night: cool violet wash
        sx.fillStyle = 'rgba(34,22,58,0.30)'; sx.fillRect(0, 0, W, H);
        // road uplight on legs/skirt
        let g = sx.createLinearGradient(0, fy, 0, fy - hpx * 0.6);
        g.addColorStop(0, 'rgba(255,236,210,0.34)'); g.addColorStop(1, 'rgba(255,236,210,0)');
        sx.fillStyle = g; sx.fillRect(0, fy - hpx, W, hpx + 40);
        // dawn key from the left
        g = sx.createLinearGradient(bb.x0, 0, bb.x0 + bb.w * 0.7, 0);
        g.addColorStop(0, 'rgba(255,190,140,0.24)'); g.addColorStop(1, 'rgba(255,190,140,0)');
        sx.fillStyle = g; sx.fillRect(0, 0, W, H);
        sx.globalCompositeOperation = 'source-over';
        // reflection on the glossy road
        const rs = Z.scratch[1], rx = rs.getContext('2d');
        rx.setTransform(1, 0, 0, 1, 0, 0); rx.globalCompositeOperation = 'source-over'; rx.globalAlpha = 1; rx.filter = 'none'; rx.clearRect(0, 0, W, H);
        rx.save(); rx.translate(0, foot[1] * 2 + 6); rx.scale(1, -1); rx.drawImage(sc, 0, 0); rx.restore();
        rx.globalCompositeOperation = 'destination-in';
        g = rx.createLinearGradient(0, foot[1], 0, foot[1] + hpx * 0.45);
        g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        rx.fillStyle = g; rx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(rs, 0, 0); ctx.restore();
        // warm rim from the dawn side, then her
        D.rim(ctx, img, fx, fy, hpx, '#FFB070', [-5, -2], { anchor: [0.235, 0.985], rot: ro.rot, key: 'runrim' });
        ctx.drawImage(sc, 0, 0);
        // also on the foreground layer, so she runs in front of the lyric typography
        if (S.fg && S.fg !== ctx) { S.fg.save(); S.fg.setTransform(ctx.getTransform()); S.fg.drawImage(sc, 0, 0); S.fg.restore(); }
        // contact glow where her foot meets the road
        D.glow(ctx, fx + 8, foot[1] + 2, 70, '#FFF1D6', 0.28 * (1 - Math.min(1, -bob / 16) * 0.6));
      }
    }

    // speed lines: screen-space streaks, driven by distance (they slow down and freeze with her)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const slA = 0.2 + 0.8 * vk;
    for (let i = 0; i < 44; i++) {
      const y = Z.rnd(i, 601) * H;
      if (y > 250 && y < 760 && Z.rnd(i, 606) < 0.75) continue;         // keep her body clear
      const len = (160 + 620 * Z.rnd(i, 602)) * (0.5 + 0.5 * vk);
      const x = Z.fract(Z.rnd(i, 603) + dist * (0.05 + 0.05 * Z.rnd(i, 604))) * (W + len + 200) - len - 100;
      const al = (0.05 + 0.13 * Z.rnd(i, 605)) * slA;
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      g.addColorStop(0, 'rgba(255,240,220,0)'); g.addColorStop(0.8, `rgba(255,240,220,${al})`); g.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, len, 1 + 2 * Z.rnd(i, 607));
    }
    ctx.restore();
    ctx.restore();   // roll/punch

    // freeze: camera-flash frame, then a cooler, calmer still
    if (af >= 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.42 * clamp(af / 0.08); ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * Math.exp(-af * 26); ctx.fillStyle = '#FFF4E6'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      if ((a.freezeStyle ?? 'photo') === 'photo') {
        const k = E.outExpo(clamp(af / 0.2)), m = lerp(0, 26, k);
        ctx.save(); ctx.fillStyle = 'rgba(239,230,214,0.9)';
        ctx.fillRect(0, 0, W, m); ctx.fillRect(0, H - m, W, m); ctx.fillRect(0, 0, m, H); ctx.fillRect(W - m, 0, m, H);
        ctx.restore();
      }
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(3,2,8,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  function runGlints(zh) {
    const base = glints(97, 160, -1.5, 40, 1, 60);
    // wrap along z around her so the ground sparkle streams past
    return base.map(g => [g[0], zh - 30 + Z.fract((g[1] - zh) / 60) * 60, g[2]]);
  }

  Z.scene('road', {
    preload: a => (a.mode === 'run' ? [a.char || 'assets/char/run.png'] : []),
    draw(ctx, S) {
      ctx.save();
      ctx.fillStyle = '#030207'; ctx.fillRect(0, 0, W, H);
      if (S.args.mode === 'run') drawRun(ctx, S); else drawTear(ctx, S);
      ctx.restore();
    },
  });
})();
