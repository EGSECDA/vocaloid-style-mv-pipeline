/* vocaloid-style-mv scenes: typo — typographic set pieces.
 *   kanjiSlam : chorus-downbeat monument kanji slammed per beat behind a character (shots 16, 38, 52, 56)
 *   typeCard  : 'quiet' single mincho line on black (shot 29) · 'flicker' glitching 救って per beat → white (shot 37)
 *   tunnel    : one-take push through rings of lyric text toward a point of light that blooms into dawn (shot 61)
 * Post helpers for the timeline (shot.post): Z.typo.post.kanjiSlam · Z.typo.post.typeCard · Z.typo.post.tunnel
 * Everything is a pure function of song time; caches hold immutable art only (glyph sprites, rims, noise, beat lists);
 * per-frame work buffers are fully overwritten before use.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, FR = 1 / 30, TAU = Math.PI * 2;
  const C = {
    ink: '#140B1E', shadow: '#3A1745', dusk: '#7A2350', verm: '#C8373A', sunset: '#F0663A', glow: '#FFA552', hi: '#FFE3B0',
    cyan: '#39C6E0', paper: '#F4EFE6', navy: '#0B1524', steel: '#1E3552', haze: '#3F6284',
  };

  // ------------------------------------------------------------------ small helpers
  // CSS cubic-bezier easing (Newton + bisection fallback)
  const bez = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = u => ((ax * u + bx) * u + cx) * u, sy = u => ((ay * u + by) * u + cy) * u, dx = u => (3 * ax * u + 2 * bx) * u + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 6; i++) { const e = sx(u) - x, d = dx(u); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; u -= e / d; }
      if (!(u >= 0 && u <= 1) || Math.abs(sx(u) - x) > 1e-3) { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { u = (lo + hi) / 2; if (sx(u) < x) lo = u; else hi = u; } }
      return sy(u);
    };
  };
  const EZ = {
    out: bez(0.16, 1, 0.3, 1),          // house expo-out (entrances)
    inn: bez(0.7, 0, 0.84, 0),          // house expo-in (exits)
    io: bez(0.65, 0, 0.35, 1),          // camera moves
    soft: bez(0.33, 0, 0.2, 1),         // quiet fades
  };
  const hexRGB = h => Z.hex(h);
  const mixRGB = (a, b, k) => { const A = typeof a === 'string' ? hexRGB(a) : a, B = typeof b === 'string' ? hexRGB(b) : b; return [0, 1, 2].map(i => A[i] + (B[i] - A[i]) * k); };
  const css = (rgb, a = 1) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
  const mix = (a, b, k, al = 1) => css(mixRGB(a, b, Z.clamp(k)), al);
  const damp = (u, amp, rate, hz) => (u < 0 ? 0 : amp * Math.exp(-u * rate) * Math.cos(u * TAU * hz));   // damped spring
  const fq = (t, fps) => Math.floor(t * fps + 1e-6);                    // frame index on a koma grid
  const resetCtx = x => { x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; };

  // fonts used by these scenes (loaded in init so frame 0 never uses a fallback)
  const FONTS = ['900 100px "Zen Old Mincho"', '700 100px "Zen Old Mincho"', '400 100px "Dela Gothic One"', '400 100px "Shippori Mincho B1"',
    '500 100px "Shippori Mincho B1"', '700 100px "Shippori Mincho B1"', '800 100px "Shippori Mincho B1"', '400 100px "DotGothic16"', '500 100px "Zen Kaku Gothic New"', '900 100px "Zen Kaku Gothic New"'];
  let fontsP = null;
  const loadFonts = () => fontsP || (fontsP = Promise.all(FONTS.map(f => document.fonts.load(f, '救って夜光残暗闇果遅会言何わないAZ09'))).catch(() => {}));
  const fontStr = (px, fam, weight) => `${weight} ${px}px ${Z.FONT[fam] || fam}, "Noto Serif JP", serif`;

  // beats that fall inside a shot (the first one is snapped to the shot start)
  const beatCache = new Map();
  function shotBeats(S) {
    const t0 = S.shot.t0, t1 = S.shot.t1, key = S.shot.id + '|' + t0 + '|' + t1;
    let b = beatCache.get(key); if (b) return b;
    b = S.clock.beats.filter(x => x >= t0 - 0.045 && x < t1 - 0.045).slice();
    if (!b.length || b[0] > t0 + 0.045) b.unshift(t0); else b[0] = Math.min(b[0], t0);
    beatCache.set(key, b); return b;
  }
  const beatIndex = (b, t) => { let k = 0; for (let i = 0; i < b.length; i++) if (b[i] <= t + 1e-6) k = i; return k; };

  const SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
  const PARTICLE = new Set([...'はがをにへとでのもやかねよ']);
  const isKana = ch => /[぀-ヿ]/.test(ch);

  // ------------------------------------------------------------------ texture: scene-side film grain (cached tile, re-seeded on 24s)
  let grainTile = null;
  function filmGrain(ctx, t, a, comp = 'overlay') {
    if (!grainTile) {
      grainTile = Z.canvas(256, 256); const x = grainTile.getContext('2d'), id = x.createImageData(256, 256), R = Z.rng(4242);
      for (let i = 0; i < id.data.length; i += 4) { const v = (R() * 0.6 + R() * 0.4) * 255 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      x.putImageData(id, 0, 0);
    }
    const f = fq(t, 24);
    ctx.save(); resetCtx(ctx); ctx.globalCompositeOperation = comp; ctx.globalAlpha = a;
    ctx.translate(-(Z.rnd(f, 1) * 256 | 0), -(Z.rnd(f, 2) * 256 | 0));
    ctx.fillStyle = ctx.createPattern(grainTile, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  }
  // tileable value-noise (for flame tongues), stretched vertically when drawn
  let noiseTile = null;
  function getNoise() {
    if (noiseTile) return noiseTile;
    const N = 128, c = Z.canvas(N, N), x = c.getContext('2d'), id = x.createImageData(N, N);
    const lat = (i, j, p) => Z.rnd(((i % p) + p) % p, ((j % p) + p) % p, 777 + p);
    const vn = (u, v, p) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      return Z.lerp(Z.lerp(lat(i, j, p), lat(i + 1, j, p), su), Z.lerp(lat(i, j + 1, p), lat(i + 1, j + 1, p), su), sv); };
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const n = 0.55 * vn(xx / 16, yy / 16, 8) + 0.3 * vn(xx / 8, yy / 8, 16) + 0.15 * vn(xx / 4, yy / 4, 32);
      const a = Z.clamp((n - 0.36) * 3.2);
      const o = (yy * N + xx) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = a * 255 | 0;
    }
    x.putImageData(id, 0, 0); noiseTile = c; return c;
  }

  // ------------------------------------------------------------------ cached glyph art
  const artCache = new Map();
  // monument glyph sprite: textured fill + ink outline (+ burning inner edge), ink box centred in the canvas
  function glyphArt(ch, st) {
    const key = [ch, st.fam, st.weight, st.px, st.color, st.style].join('|');
    let A = artCache.get(key); if (A) return A;
    const px = st.px, font = fontStr(px, st.fam, st.weight);
    const m0 = Z.canvas(8, 8).getContext('2d'); m0.font = font;
    const m = m0.measureText(ch);
    const l = m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight, as = m.actualBoundingBoxAscent, de = m.actualBoundingBoxDescent;
    const pad = Math.ceil(px * 0.07), w = Math.ceil(l + r + 2 * pad), h = Math.ceil(as + de + 2 * pad), ox = pad + l, oy = pad + as;
    const style = st.style || 'default';
    const base = hexRGB(st.color);
    let top, mid = base, bot;
    if (style === 'night') { top = mixRGB(base, C.navy, 0.55); bot = mixRGB(base, '#FF7A4A', 0.2); }
    else if (style === 'fire') { top = mixRGB(base, '#1A0508', 0.72); mid = mixRGB(base, '#2A0608', 0.45); bot = mixRGB(base, '#FF6A2A', 0.2); }
    else { top = mixRGB(base, C.dusk, 0.55); bot = mixRGB(base, C.sunset, 0.45); }
    // --- fill
    const fill = Z.canvas(w, h), fx = fill.getContext('2d');
    fx.font = font; fx.textAlign = 'left'; fx.textBaseline = 'alphabetic';
    const g = fx.createLinearGradient(0, pad, 0, h - pad);
    g.addColorStop(0, css(top)); g.addColorStop(0.5, css(mid)); g.addColorStop(1, css(bot));
    fx.fillStyle = g; fx.fillText(ch, ox, oy);
    fx.globalCompositeOperation = 'source-atop';
    // screentone: dots grow toward the upper-left (the shade side)
    fx.globalAlpha = style === 'night' ? 0.42 : style === 'fire' ? 0.5 : 0.3;
    const step = Math.max(9, Math.round(px / 95));
    D.halftone(fx, [0, 0, w, h], step, (x, y) => Z.clamp(0.95 - (x / w) * 0.75 - (y / h) * 0.85) * 1.05, style === 'night' ? '#050A18' : C.ink);
    // a lit band along the lower edge (sunset bounce)
    fx.globalAlpha = style === 'fire' ? 0.35 : 0.5; const g2 = fx.createLinearGradient(0, h * 0.7, 0, h);
    g2.addColorStop(0, 'rgba(255,170,90,0)'); g2.addColorStop(1, style === 'night' ? 'rgba(255,120,80,0.55)' : 'rgba(255,200,120,0.7)');
    fx.fillStyle = g2; fx.fillRect(0, 0, w, h);
    // print speckle: knock tiny holes out of the ink (riso / paper tooth)
    fx.globalCompositeOperation = 'destination-out'; fx.globalAlpha = 1;
    const R = Z.rng(Z.hash(ch.charCodeAt(0), px));
    fx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, s = 0.6 + R() * px / 700; fx.fillRect(x, y, s, s); }
    fx.globalCompositeOperation = 'source-over';
    // --- ink outline (drawn under the fill, misregistered)
    const line = Z.canvas(w, h), lx = line.getContext('2d');
    lx.font = font; lx.textAlign = 'left'; lx.textBaseline = 'alphabetic';
    lx.lineJoin = 'round'; lx.lineWidth = px * 0.03; lx.strokeStyle = style === 'night' ? '#03060F' : style === 'fire' ? '#0A0204' : C.ink;
    lx.strokeText(ch, ox, oy); lx.fillStyle = lx.strokeStyle; lx.fillText(ch, ox, oy);
    // --- burning inner edge (fire): hot stroke clipped to the glyph, plus char marks
    let edge = null;
    if (style === 'fire') {
      edge = Z.canvas(w, h); const ex = edge.getContext('2d');
      ex.font = font; ex.textAlign = 'left'; ex.textBaseline = 'alphabetic'; ex.lineJoin = 'round';
      ex.filter = `blur(${Math.round(px * 0.01)}px)`; ex.lineWidth = px * 0.04; ex.strokeStyle = '#C8401E'; ex.strokeText(ch, ox, oy);
      ex.filter = `blur(${Math.round(px * 0.004)}px)`; ex.lineWidth = px * 0.016; ex.strokeStyle = '#FF9A3A'; ex.strokeText(ch, ox, oy);
      ex.filter = 'none'; ex.lineWidth = px * 0.005; ex.strokeStyle = '#FFEBB8'; ex.strokeText(ch, ox, oy);
      ex.globalCompositeOperation = 'destination-in'; ex.fillStyle = '#fff'; ex.fillText(ch, ox, oy);
    }
    // --- stroke-only outline (afterimage ghost)
    const ring = Z.canvas(w, h), rx = ring.getContext('2d');
    rx.font = font; rx.textAlign = 'left'; rx.textBaseline = 'alphabetic'; rx.lineJoin = 'round';
    rx.lineWidth = px * 0.012; rx.strokeStyle = C.cyan; rx.strokeText(ch, ox, oy);
    rx.globalAlpha = 0.18; rx.fillStyle = C.cyan; rx.fillText(ch, ox, oy);
    A = { fill, line, edge, ring, w, h, inkH: as + de, inkW: l + r, px, ch };
    artCache.set(key, A); return A;
  }

  // rim-light art for a character image: inner edge band on the light side + soft outer halo (cached)
  function rimArt(img, key, color, dx, dy) {
    const k = 'rim|' + key + '|' + color + '|' + dx + '|' + dy;
    let R = artCache.get(k); if (R) return R;
    const w = img.width, h = img.height;
    const band = Z.canvas(w, h), bx = band.getContext('2d');
    bx.drawImage(Z.tinted(img, color, 'tt' + key), 0, 0);
    bx.globalCompositeOperation = 'destination-out'; bx.drawImage(img, dx, dy);
    const inner = Z.canvas(w, h), ix = inner.getContext('2d');
    ix.filter = 'blur(1.5px)'; ix.drawImage(band, 0, 0); ix.filter = 'none';
    ix.globalCompositeOperation = 'destination-in'; ix.drawImage(img, 0, 0);
    const halo = Z.canvas(w, h), hx = halo.getContext('2d');
    hx.filter = 'blur(16px)'; hx.drawImage(Z.tinted(img, color, 'tt' + key), -dx, -dy * 0.5); hx.filter = 'none';
    hx.globalCompositeOperation = 'destination-out'; hx.drawImage(img, 0, 0);     // halo lives outside the silhouette only
    R = { inner, halo }; artCache.set(k, R); return R;
  }

  // ------------------------------------------------------------------ characters: seam-free wind warp through an offscreen buffer
  // The warp is rendered at image resolution into a padded buffer with integer strip boundaries (no overlaps → no seams
  // with 'lighter' / 'multiply' passes). Buffers are overwritten every call; they carry no state between frames.
  const warpBufs = new Map();
  function warpImage(img, slot, wind, t) {
    const padY = wind && wind.axis === 'col' ? Math.ceil(wind.amp * 1.6) + 2 : 0, padX = wind && wind.axis !== 'col' ? Math.ceil(wind.amp * 1.6) + 2 : 0;
    const cw = img.width + 2 * padX, ch = img.height + 2 * padY;
    let c = warpBufs.get(slot);
    if (!c || c.width !== cw || c.height !== ch) { c = Z.canvas(cw, ch); warpBufs.set(slot, c); }
    const x = c.getContext('2d'); resetCtx(x); x.clearRect(0, 0, cw, ch);
    const tt = wind && wind.q ? Z.quant(t, wind.q) : t;
    if (!wind || !wind.amp) x.drawImage(img, padX, padY);
    else if (wind.axis === 'col') {
      const N = 72, from = wind.from, dir = wind.dir || -1, amp = wind.amp, fr = wind.freq ?? 1.6, sp = wind.speed ?? 5;
      for (let i = 0; i < N; i++) {
        const s0 = Math.round(i / N * img.width), s1 = Math.round((i + 1) / N * img.width); if (s1 <= s0) continue;
        const u0 = s0 / img.width, uc = (s0 + s1) / 2 / img.width;
        const k = dir < 0 ? Z.clamp((from - uc) / from) : Z.clamp((uc - from) / (1 - from));
        const ph = (dir < 0 ? 1 - u0 : u0) * fr * TAU;
        const dy = k <= 0 ? 0 : amp * Math.pow(k, 1.6) * Math.sin(ph - tt * sp) + amp * 0.3 * k * Math.sin(tt * 2.3 + u0 * 5);
        x.drawImage(img, s0, 0, s1 - s0, img.height, padX + s0, padY + dy, s1 - s0, img.height);
      }
    } else {
      const N = 80, from = wind.from ?? 0.3, amp = wind.amp, fr = wind.freq ?? 2.2, sp = wind.speed ?? 3.2;
      for (let i = 0; i < N; i++) {
        const s0 = Math.round(i / N * img.height), s1 = Math.round((i + 1) / N * img.height); if (s1 <= s0) continue;
        const v0 = s0 / img.height, k = Z.clamp((v0 - from) / (1 - from));
        const dx = amp * k * k * Math.sin(v0 * fr * TAU - tt * sp) + amp * 0.35 * k * Math.sin(tt * 1.7 + v0 * 3);
        x.drawImage(img, 0, s0, img.width, s1 - s0, padX + dx, padY + s0, img.width, s1 - s0);
      }
    }
    c.padX = padX; c.padY = padY; c.iw = img.width; c.ih = img.height;
    return c;
  }
  // draw a warped buffer so that the ORIGINAL image box lands at anchor (x,y) with height h
  function drawWarped(ctx, c, x, y, h, o = {}) {
    const s = h / c.ih, w = c.iw * s, [ax, ay] = o.anchor || [0.5, 1];
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; if (o.comp) ctx.globalCompositeOperation = o.comp;
    ctx.drawImage(c, x - w * ax - c.padX * s, y - h * ay - c.padY * s, c.width * s, c.height * s);
    ctx.restore();
  }
  // per-frame silhouette of a warped buffer
  const silBufs = new Map();
  function silhouetteOf(c, slot, color) {
    let b = silBufs.get(slot);
    if (!b || b.width !== c.width || b.height !== c.height) { b = Z.canvas(c.width, c.height); silBufs.set(slot, b); }
    const x = b.getContext('2d'); resetCtx(x); x.clearRect(0, 0, b.width, b.height);
    x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, b.width, b.height);
    b.padX = c.padX; b.padY = c.padY; b.iw = c.iw; b.ih = c.ih;
    return b;
  }

  // manga focus lines (集中線) — random wedges pointing at (cx,cy), re-seeded on 2s
  function focusLines(ctx, cx, cy, seed, a, color, rIn = 520, n = 110) {
    if (a <= 0.01) return;
    const R = Z.rng(seed), L = 2300;
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha = a; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const th = R() * TAU, r0 = rIn * (0.8 + R() * 0.8), wd = (0.003 + R() * 0.01);
      ctx.moveTo(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0);
      ctx.lineTo(cx + Math.cos(th - wd) * L, cy + Math.sin(th - wd) * L);
      ctx.lineTo(cx + Math.cos(th + wd) * L, cy + Math.sin(th + wd) * L);
      ctx.closePath();
    }
    ctx.fill(); ctx.restore();
  }

  // ===================================================================================== kanjiSlam
  // Variant presets. Every field can be overridden through args. sky: 'sunset' | 'night' | 'day' (+ skyGrad, see drawSky).
  const SLAM = {
    default: {
      char: 'assets/char/profile_sing.png', charX: 1330, charY: 1100, charH: 1000, face: [0.745, 0.235], bg: 'assets/bg/bg_sky.png',
      color: C.verm, fam: 'minchoHeavy', weight: 900, sky: 'sunset', rim: '#FFB36B', rimOff: [7, 2], rimA: 0.75, haloA: 0.55, voiceDir: -0.62,
      wind: { axis: 'col', from: 0.6, dir: -1, amp: 20, freq: 1.4, speed: 6.2, q: 12 },
      slots: [{ x: 560, y: 545, s: 1.3, r: -0.035 }, { x: 640, y: 520, s: 1.42, r: 0.05 }, { x: 470, y: 600, s: 1.58, r: 0.065 }, { x: 600, y: 505, s: 1.5, r: -0.07 }],
      frames: [{ z: 1, dx: 0, dy: 0 }, { z: 1.14, dx: 40, dy: 20 }, { z: 0.95, dx: -20, dy: 0 }, { z: 1.24, dx: 70, dy: 40 }],
      lines: 'ink',
    },
    night: {
      char: 'assets/char/lookup_tear.png', charX: 1340, charY: 1110, charH: 1150, face: [0.33, 0.25], bg: 'assets/bg/bg_sky.png',
      color: '#D23A36', fam: 'minchoHeavy', weight: 900, sky: 'night', rim: '#FF6A4D', rimOff: [8, 3], rimA: 0.9, haloA: 0.7, voiceDir: null,
      wind: { axis: 'col', from: 0.56, dir: 1, amp: 18, freq: 1.3, speed: 5.4, q: 12 },
      slots: [{ x: 620, y: 540, s: 1.36, r: 0.03 }, { x: 580, y: 560, s: 1.5, r: -0.04 }, { x: 680, y: 520, s: 1.62, r: 0.055 }, { x: 600, y: 540, s: 1.45, r: -0.03 }],
      frames: [{ z: 1, dx: 0, dy: 0 }, { z: 1.16, dx: 30, dy: 20 }, { z: 1.34, dx: 50, dy: 50 }, { z: 1.1, dx: 0, dy: 0 }],
      lines: 'light',
    },
    hand: {
      char: 'assets/char/hand_reach.png', charX: 1360, charY: 1430, charH: 1700, face: [0.5, 0.26], bg: 'assets/bg/bg_sky.png',
      color: C.verm, fam: 'minchoHeavy', weight: 900, sky: 'sunset', rim: '#FFC07A', rimOff: [7, 4], rimA: 0.7, haloA: 0.5, voiceDir: null,
      wind: { axis: 'col', from: 0.63, dir: 1, amp: 26, freq: 1.2, speed: 6.5, q: 12 },
      slots: [{ x: 640, y: 560, s: 1.36, r: -0.04 }, { x: 580, y: 540, s: 1.5, r: 0.045 }, { x: 700, y: 600, s: 1.6, r: -0.06 }, { x: 600, y: 520, s: 1.55, r: 0.06 }],
      frames: [{ z: 1, dx: 0, dy: 0 }, { z: 1.05, dx: -10, dy: -50 }, { z: 1.1, dx: -20, dy: -100 }, { z: 1.16, dx: -30, dy: -160 }],
      lines: 'ink',
    },
  };
  function slamCfg(a) {
    const v = SLAM[a.variant] ? a.variant : 'default';
    const c = Object.assign({}, SLAM[v], a);
    c.variant = v; c.fire = !!a.fire;
    if (!a.glyphs) c.glyphs = v === 'night' ? ['夜'] : ['救', 'って', '救', 'って'];
    if (a.bg === null) c.bg = null;
    return c;
  }

  // lay out one word for beat k: returns [{ch, x, y, s (ink height / H), r}]
  function layoutWord(word, slot, k) {
    const chars = [...word];
    if (chars.length === 1) return [{ ch: chars[0], x: slot.x, y: slot.y, s: slot.s, r: slot.r }];
    if (chars.length === 2 && SMALL.has(chars[0])) {
      // small kana + monument kana (って): the big kana is kept ≤ 1.1 H so its defining strokes stay in frame;
      // the small one sits low-left or high-left, alternating on each occurrence
      const alt = Math.floor(k / 2) % 2;
      const big = { ch: chars[1], x: slot.x + 260, y: 600 + (alt ? 20 : 0), s: Math.min(slot.s, 1.1), r: slot.r };
      const small = alt === 0
        ? { ch: chars[0], x: 215, y: 470, s: 0.4, r: slot.r * 1.8 }
        : { ch: chars[0], x: 230, y: 800, s: 0.38, r: -slot.r * 1.5 };
      return [small, big];
    }
    // generic: horizontal row that bleeds past the frame
    const n = chars.length, s = slot.s * (n === 2 ? 0.95 : 0.8), adv = s * H * 0.95;
    return chars.map((ch, i) => ({ ch, x: slot.x + (i - (n - 1) / 2) * adv, y: slot.y, s: s * (PARTICLE.has(ch) || SMALL.has(ch) ? 0.7 : 1), r: slot.r }));
  }
  const glyphXform = (ctx, g, A, scale, rot = 0) => { const sc = (g.s * H / A.inkH) * scale; ctx.translate(g.x, g.y); ctx.rotate(g.r + rot); ctx.scale(sc, sc); };

  // one drawn word: afterimage / shadow / outline / fill / fire edge / impact smear
  function drawWord(ctx, glyphs, cfg, st, o) {
    for (const g of glyphs) {
      const A = glyphArt(g.ch, st);
      ctx.save(); glyphXform(ctx, g, A, o.scale, o.rot);
      const x0 = -A.w / 2, y0 = -A.h / 2;
      if (o.ghost) {                                   // complementary afterimage (残像)
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.ghost;
        ctx.drawImage(A.ring, x0, y0);
      } else {
        if (o.shadow) { ctx.globalAlpha = o.shadow; ctx.drawImage(Z.tinted(A.line, cfg.sky === 'night' ? '#01030A' : '#0A0410', 'sh' + A.ch + A.px), x0 + A.px * 0.035, y0 + A.px * 0.028); ctx.globalAlpha = 1; }
        ctx.drawImage(A.line, x0 + A.px * 0.004, y0 + A.px * 0.003);
        ctx.drawImage(A.fill, x0, y0);
        if (A.edge && o.burn) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.burn; ctx.drawImage(A.edge, x0, y0); }
        if (o.smear) {                                 // impact smear: two larger translucent copies
          ctx.globalCompositeOperation = 'source-over';
          for (const [k, al] of [[1.16, 0.28], [1.38, 0.13]]) { ctx.globalAlpha = al * o.smear; ctx.drawImage(A.fill, x0 * k, y0 * k, A.w * k, A.h * k); }
        }
      }
      ctx.restore();
    }
  }

  // fire rising from a glyph silhouette: low-res buffers, upward smears in three temperatures, eroded by scrolling noise
  const fireBufs = {};
  const fbuf = (name, w, h) => { let c = fireBufs[name]; if (!c) { c = fireBufs[name] = Z.canvas(w, h); } const x = c.getContext('2d'); resetCtx(x); x.clearRect(0, 0, w, h); return [c, x]; };
  function drawFire(ctx, glyphs, st, scale, cam, t, amt) {
    const q = 4, fw = W / q, fh = H / q;
    const tq = Z.quant(t, 12);
    // 1. silhouette at 1/4 res in camera space
    const [sC, sX] = fbuf('sil', fw, fh);
    sX.setTransform(1 / q, 0, 0, 1 / q, 0, 0); cam(sX, 1);
    for (const g of glyphs) { const A = glyphArt(g.ch, st); sX.save(); glyphXform(sX, g, A, scale); sX.drawImage(A.line, -A.w / 2, -A.h / 2); sX.restore(); }
    resetCtx(sX); sX.globalCompositeOperation = 'source-in'; sX.fillStyle = '#fff'; sX.fillRect(0, 0, fw, fh);
    const noise = getNoise();
    const layer = (name, color, n, step, erode, alpha) => {
      const [c, x] = fbuf(name, fw, fh);
      x.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= n; i++) { x.globalAlpha = alpha * (1 - i / (n + 1)); x.drawImage(sC, Math.sin(tq * 3 + i * 0.7) * i * 0.35, -i * step * amt); }
      if (erode) {                                                    // flame tongues: vertical streaky noise scrolling up
        x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in';
        const pat = x.createPattern(noise, 'repeat');
        const sy = (tq * 55 * erode) % (128 * 3), sx = Math.sin(tq * 1.3) * 6;
        x.save(); x.scale(0.9, 3); x.translate(sx, sy / 3); x.fillStyle = pat; x.fillRect(-sx - 10, -sy / 3 - 10, fw / 0.9 + 20, fh / 3 + 140); x.restore();
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'destination-out'; x.drawImage(sC, 0, 1.2);   // flames live outside the glyph
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, fw, fh);
      return c;
    };
    const red = layer('r', '#D8402A', 16, 3.4, 1.0, 0.6);
    const org = layer('o', '#FF9A3A', 10, 2.5, 1.4, 0.65);
    const yel = layer('y', '#FFE9A8', 4, 1.4, 0, 0.7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85; ctx.drawImage(red, 0, 0, W, H);
    ctx.globalAlpha = 0.9; ctx.drawImage(org, 0, 0, W, H);
    ctx.globalAlpha = 0.8; ctx.drawImage(yel, 0, 0, W, H);
    ctx.restore();
  }

  // sky backdrop per variant. cfg.sky: 'sunset' (default: dusk grade + a low sun) | 'night' (blue grade + stars) |
  // 'day' (the plate as painted; without a bg image a daylight gradient, cfg.skyGrad = vgrad stops). fire: true wins over both.
  function drawSky(ctx, S, cfg, view) {
    const img = cfg.bg ? Z.imgSync(cfg.bg) : null;
    if (img) D.cover(ctx, img, view);
    else if (cfg.sky === 'day') D.vgrad(ctx, cfg.skyGrad || [[0, '#2E9BEA'], [0.6, '#86CFFF'], [1, '#EAF8FF']]);
    else D.vgrad(ctx, [[0, '#1a0e2a'], [0.6, '#5a1a3a'], [1, '#e0603a']]);
    if (cfg.sky === 'night') {
      D.fill(ctx, '#0E2346', 1, 'color');
      D.vgrad(ctx, [[0, 'rgba(3,6,16,0.92)'], [0.55, 'rgba(8,16,40,0.55)'], [1, 'rgba(40,20,50,0.25)']], 1, 'multiply');
      D.vgrad(ctx, [[0.55, 'rgba(200,55,58,0)'], [1, 'rgba(200,55,58,0.35)']], 1, 'lighter');
      const tq = Z.quant(S.t, 12);                                     // stars twinkle on 12s
      ctx.save(); ctx.fillStyle = '#E8F0FF';
      for (let i = 0; i < 90; i++) {
        const x = Z.rnd(i, 71) * W, y = Z.rnd(i, 72) * H * 0.6, a = 0.25 + 0.75 * Math.abs(Math.sin(tq * (1 + Z.rnd(i, 73) * 3) + i));
        ctx.globalAlpha = a * (0.4 + 0.6 * Z.rnd(i, 74)); const r = 0.7 + 1.6 * Z.rnd(i, 75); ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      ctx.restore();
    } else if (cfg.fire) {
      D.vgrad(ctx, [[0, 'rgba(10,3,8,0.9)'], [0.5, 'rgba(40,6,12,0.6)'], [1, 'rgba(90,20,10,0.2)']], 1, 'multiply');
      D.vgrad(ctx, [[0.45, 'rgba(200,55,58,0)'], [1, 'rgba(240,90,40,0.5)']], 1, 'screen');
    } else if (cfg.sky === 'day') {
      // daylight: keep the plate as painted (no dusk multiply, no low sun behind her shoulder)
    } else {
      D.vgrad(ctx, [[0, 'rgba(20,11,30,0.6)'], [0.45, 'rgba(58,23,69,0.2)'], [1, 'rgba(0,0,0,0)']], 1, 'multiply');
      D.glow(ctx, W * 0.74, H * 0.92, 760, '#FFB070', 0.32);             // the low sun behind her shoulder
    }
  }

  Z.scene('kanjiSlam', {
    preload: a => { const c = slamCfg(a); return [c.char, c.bg].filter(Boolean); },
    init: loadFonts,
    draw(ctx, S) {
      const cfg = slamCfg(S.args), t = S.t, lt = S.lt, fire = cfg.fire, night = cfg.sky === 'night';
      const beats = shotBeats(S), k = beatIndex(beats, t), Tb = beats[k], u = t - Tb;
      const Tn = k + 1 < beats.length ? beats[k + 1] : S.shot.t1;
      const antic = E.inQuad(Z.clamp((t - (Tn - 2 * FR)) / (2 * FR)));   // 2-frame wind-up before the next slam
      const word = cfg.glyphs[Math.min(k, cfg.glyphs.length - 1)];
      const prevWord = k > 0 ? cfg.glyphs[Math.min(k - 1, cfg.glyphs.length - 1)] : null;
      const rekick = k >= cfg.glyphs.length;                              // glyph list exhausted: re-frame the last glyph instead of a new slam
      const slot = cfg.slots[k % cfg.slots.length];
      const glyphs = layoutWord(word, slot, k);
      const st = { fam: cfg.fam, weight: cfg.weight, px: 1500, color: cfg.color, style: fire ? 'fire' : night ? 'night' : 'default' };
      const sgn = k % 2 ? -1 : 1;
      // ---------------- camera: slow push + per-beat kick (damped spring), shake, roll
      const push = 1 + 0.035 * EZ.io(S.p);
      const kick = damp(u, rekick ? 0.035 : 0.06, 11, 1.6) - 0.022 * antic;
      const shAmp = (rekick ? 9 : 18) * Math.exp(-u * 13) + (fire ? 2.2 : 0);
      const [shx, shy] = D.shake(t, shAmp, 24, 17 + k);
      const roll = sgn * 0.016 * Math.exp(-u * 7) + 0.004 * Math.sin(lt * 1.3);
      const cam = (c2, depth) => {                                        // camera with parallax depth
        const z = 1 + (push - 1) * depth + kick * depth;
        c2.translate(W / 2 + shx * depth, H / 2 + shy * depth); c2.rotate(roll * depth); c2.scale(z, z); c2.translate(-W / 2, -H / 2);
      };
      // ---------------- sky
      ctx.save(); cam(ctx, 0.35);
      drawSky(ctx, S, cfg, { zoom: 1.12 + 0.02 * k, x: -0.3 + 0.1 * (k % 3), y: night ? -0.2 : 0.35 });
      ctx.restore();
      // ---------------- character buffers for this frame (wind-warped once, reused by shadow / halo / body / rim)
      const cimg = Z.imgSync(cfg.char);
      const fr = cfg.frames[k % cfg.frames.length];
      const cs = cimg ? cfg.charH / cimg.height : 1;
      const faceX = cfg.charX + (cfg.face[0] - 0.5) * (cimg ? cimg.width : 0) * cs, faceY = cfg.charY - (1 - cfg.face[1]) * cfg.charH;
      const cz = fr.z * (1 + 0.02 * Math.min(u, 0.8));
      const cX = faceX + (cfg.charX - faceX) * cz + fr.dx, cY = faceY + (cfg.charY - faceY) * cz + fr.dy, cH = cfg.charH * cz;
      const bob = Math.sin(Z.quant(t, 12) * 2.1) * 4;
      let body = null, rimI = null, rimH = null;
      if (cimg) {
        const rim = rimArt(cimg, cfg.char, cfg.rim, cfg.rimOff[0], cfg.rimOff[1]);
        body = warpImage(cimg, 'slamBody', cfg.wind, t); rimI = warpImage(rim.inner, 'slamRimI', cfg.wind, t); rimH = warpImage(rim.halo, 'slamRimH', cfg.wind, t);
      }
      // ---------------- glyph layer (offscreen so the character's cast shadow lands only on the type)
      const gc = Z.scratch[1], gx = gc.getContext('2d');
      resetCtx(gx); gx.clearRect(0, 0, W, H);
      gx.save(); cam(gx, 1);
      if (k > 0 && !rekick) {                                             // afterimage of the previous word, drifting and fading in cyan
        const pg = layoutWord(prevWord, cfg.slots[(k - 1) % cfg.slots.length], k - 1);
        const ga = 0.85 * Math.exp(-u * 5.5);
        if (ga > 0.01) drawWord(gx, pg, cfg, st, { scale: 1.02 + u * 0.12, ghost: ga });
      }
      const gScale = (rekick ? 1 + damp(u, 0.08, 14, 2.4) : 1 + damp(u, 0.27, 16, 2.6)) + 0.022 * Math.min(u, 0.6) - 0.03 * antic;
      const smear = rekick ? 0 : Math.exp(-u * 40);
      const burn = fire ? 0.7 + 0.3 * Z.noise1(Z.quant(t, 15) * 6, 3) : 0;
      drawWord(gx, glyphs, cfg, st, { scale: gScale, shadow: 0.55, smear, burn });
      gx.restore();
      if (body) {                                                         // cast shadow onto the type only
        gx.save(); gx.globalCompositeOperation = 'source-atop'; cam(gx, 1.15);
        drawWarped(gx, silhouetteOf(body, 'slamSil', night ? '#02040C' : '#2A0A1A'), cX - 70, cY + 26 + bob, cH, { alpha: night ? 0.55 : 0.42 });
        gx.restore();
      }
      if (fire) drawFire(gx, glyphs, st, gScale, cam, t, 0.9 + 0.35 * S.clock.pulse(t, 5));
      ctx.drawImage(gc, 0, 0);
      // ---------------- impact: shock ring + focus lines behind the character
      const gl = glyphs[glyphs.length - 1], gcx = gl.x, gcy = gl.y;
      ctx.save(); cam(ctx, 1);
      if (!rekick) {
        for (let j = 0; j < 2; j++) {
          const q = Z.clamp((u - j * 0.05) / 0.55); if (q <= 0 || q >= 1) continue;
          const rr = 160 + 1500 * EZ.out(q);
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = mix(C.hi, C.glow, j * 0.6, (1 - q) * (1 - q) * (j ? 0.5 : 0.8));
          ctx.lineWidth = (j ? 3 : 14) * (1 - q) + 1; ctx.beginPath(); ctx.arc(gcx, gcy, rr, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
      const fl = (rekick ? 0.4 : 0.8) * Math.exp(-u * 5.5);
      focusLines(ctx, faceX, faceY, Z.hash(fq(t, 12), k, 3), fl, cfg.lines === 'light' ? 'rgba(255,220,200,0.9)' : 'rgba(20,11,30,0.95)', 600, 120);
      // hand variant: the light it reaches for (behind the hand, pulsing per beat)
      if (cfg.variant === 'hand' && cimg) {
        const hx = cX + (cfg.face[0] - 0.5) * cimg.width * (cH / cimg.height), hy = cY - (1 - cfg.face[1]) * cH;
        ctx.save(); cam(ctx, 1.15);
        D.glow(ctx, hx + 30, hy - 60, 520 + 120 * S.clock.pulse(t, 6), '#FFE9B8', 0.55 + 0.3 * S.clock.pulse(t, 6));
        ctx.restore();
      }
      // ---------------- character with rim light and hair wind
      if (body) {
        ctx.save(); cam(ctx, 1.15);
        drawWarped(ctx, rimH, cX, cY + bob, cH, { comp: 'lighter', alpha: cfg.haloA * (fire ? 1.3 : 1) });
        drawWarped(ctx, body, cX, cY + bob, cH);
        if (night) drawWarped(ctx, silhouetteOf(body, 'slamNight', '#0A1A3A'), cX, cY + bob, cH, { comp: 'multiply', alpha: 0.3 });
        if (fire) drawWarped(ctx, silhouetteOf(body, 'slamFire', '#5A1008'), cX, cY + bob, cH, { comp: 'multiply', alpha: 0.35 });
        drawWarped(ctx, rimI, cX, cY + bob, cH, { comp: 'lighter', alpha: cfg.rimA * (fire ? 1.25 : 1) });
        // voice rings from the mouth (drawn arcs, on 12s)
        if (cfg.voiceDir != null) {
          const mx = cX + (cfg.face[0] - 0.5) * cimg.width * (cH / cimg.height), my = cY - (1 - cfg.face[1]) * cH + bob;
          ctx.globalCompositeOperation = 'lighter';
          for (let j = 0; j < 3; j++) {
            const q = Z.clamp((Z.quant(u, 12) - j * 0.08) / 0.5); if (q <= 0 || q >= 1) continue;
            const rr = 60 + 480 * EZ.out(q);
            ctx.strokeStyle = Z.rgba(C.hi, (1 - q) * 0.7); ctx.lineWidth = 4 * (1 - q) + 1.2;
            ctx.beginPath(); ctx.arc(mx, my, rr, cfg.voiceDir - 0.5, cfg.voiceDir + 0.5); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // ---------------- particles
      const emb = fire ? 170 : night ? 40 : 70;
      D.embers(ctx, t, { n: emb, seed: 311, area: [0, H * 0.2, W, H * 1.1], color: night ? '#FF6A4D' : C.glow, rise: fire ? 190 : 120, size: fire ? 3.6 : 3, wind: -0.6 - 0.8 * S.clock.pulse(t, 4), alpha: 0.9 });
      if (!rekick && u < 0.9) {                                           // spark burst on each slam (ballistic, closed form)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const n = fire ? 70 : 36;
        for (let i = 0; i < n; i++) {
          const th = Z.rnd(i, k, 51) * TAU, sp = 500 + 1300 * Z.rnd(i, k, 52), life = 0.35 + 0.5 * Z.rnd(i, k, 53);
          const q = u / life; if (q >= 1) continue;
          const x = gcx + Math.cos(th) * sp * u, y = gcy + Math.sin(th) * sp * u + 700 * u * u;
          const len = 26 * (1 - q) + 4;
          ctx.strokeStyle = Z.rgba(i % 3 ? C.glow : C.hi, (1 - q) * 0.9); ctx.lineWidth = 2.2 * (1 - q) + 0.6;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(th) * len, y - Math.sin(th) * len); ctx.stroke();
        }
        ctx.restore();
      }
      // ---------------- heat distortion (fire): smooth horizontal shimmer, strongest at the top
      if (fire) heatHaze(ctx, t, 3);
      // ---------------- small lyric column: typographic scale contrast against the monument
      drawSlamHUD(ctx, S, cfg, k);
      // ---------------- flash, vignette, grain
      if (k === 0 && !cfg.noFlash) D.fill(ctx, '#FFF4DC', 0.95 * Math.exp(-u * 11));
      else if (!rekick) D.glow(ctx, gcx, gcy, 1100, C.hi, 0.3 * Math.exp(-u * 14));
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, night ? 'rgba(2,4,12,0.6)' : fire ? 'rgba(10,2,4,0.6)' : 'rgba(20,6,16,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      filmGrain(ctx, t, 0.1, 'overlay');
    },
  });

  function drawSlamHUD(ctx, S, cfg, k) {
    const words = cfg.glyphs, x = 86, y0 = 104, size = 30;
    ctx.save();
    ctx.font = fontStr(size, 'mincho', 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let y = y0;
    words.forEach((w, i) => {
      const on = i === Math.min(k, words.length - 1);
      for (const ch of w) {
        ctx.fillStyle = on ? (cfg.sky === 'night' ? '#FF6A4D' : C.hi) : 'rgba(244,239,230,0.38)';
        const dx = SMALL.has(ch) ? size * 0.1 : 0, dy = SMALL.has(ch) ? -size * 0.1 : 0;
        ctx.fillText(ch, x + dx, y + dy); y += size * 1.12;
      }
      y += size * 0.35;
    });
    ctx.fillStyle = 'rgba(244,239,230,0.5)'; ctx.fillRect(x - 0.5, y + 8, 1, 90);
    ctx.font = fontStr(16, 'dot', 400); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,239,230,0.65)';
    ctx.fillText(String(k + 1).padStart(2, '0') + ' / ' + String(shotBeats(S).length).padStart(2, '0'), x - 8, y + 120);
    ctx.restore();
  }

  function heatHaze(ctx, t, amp) {
    const sc = Z.scratch[0], sx = sc.getContext('2d');
    resetCtx(sx); sx.globalCompositeOperation = 'copy'; sx.drawImage(ctx.canvas, 0, 0); sx.globalCompositeOperation = 'source-over';
    const tq = Z.quant(t, 15), N = 120, sh = H / N;
    ctx.save(); resetCtx(ctx);
    for (let i = 0; i < N; i++) {
      const y = Math.round(i * sh), y1 = Math.round((i + 1) * sh), k = 0.25 + 0.75 * (1 - i / N);
      const dx = amp * k * (Math.sin(i * 0.22 - tq * 7) + 0.45 * Math.sin(i * 0.53 + tq * 11));
      ctx.drawImage(sc, 0, y, W, y1 - y, dx, y, W, y1 - y);
    }
    ctx.restore();
  }

  // ===================================================================================== typeCard
  // args: lines, mode 'quiet' | 'flicker', size, fam, weight, color (text; default paper white, or ink on a light paper),
  //   paper (background colour; default near-black -- flicker's type is additive light, keep its paper dark),
  //   ruleColor (the hairline; default vermilion), rule, vertical, sub, x / y, lead / stagger / fade / gap
  const cardCfg = a => Object.assign({ lines: ['もう何も言わない'], mode: 'quiet', size: null, fam: null, color: null, vertical: false, rule: true, sub: null, weight: null }, a);
  const lightPaper = a => { if (!a.paper) return false; const [r, g, b] = hexRGB(a.paper); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140; };

  Z.scene('typeCard', {
    init: loadFonts,
    draw(ctx, S) {
      const a = cardCfg(S.args);
      if (a.mode === 'flicker') drawFlicker(ctx, S, a); else drawQuiet(ctx, S, a);
    },
  });

  // ink-box metrics per glyph (proportional, optically spaced — Canvas has no 'palt')
  const inkCache = new Map();
  function inkBox(ch, fam, weight) {
    const k = ch + '|' + fam + '|' + weight; let b = inkCache.get(k); if (b) return b;
    const x = Z.canvas(8, 8).getContext('2d'); x.font = fontStr(100, fam, weight); x.textAlign = 'center'; x.textBaseline = 'middle';
    const m = x.measureText(ch);
    b = { l: m.actualBoundingBoxLeft / 100, r: m.actualBoundingBoxRight / 100, t: m.actualBoundingBoxAscent / 100, b: m.actualBoundingBoxDescent / 100 };
    inkCache.set(k, b); return b;
  }

  // ---- quiet: one small line, character-by-character, a vermilion hairline; silence
  function drawQuiet(ctx, S, a) {
    D.fill(ctx, a.paper || '#060408');
    const lt = S.lt, size = a.size || 42, fam = a.fam || 'mincho', weight = a.weight || 500, col = hexRGB(a.color || (lightPaper(a) ? C.ink : C.paper));
    const chars = [...(a.lines[0] || '')], vert = !!a.vertical;
    const lead = a.lead ?? 0.1, stag = a.stagger ?? Math.min(0.12, 1.0 / Math.max(1, chars.length)), fade = a.fade ?? 0.6;
    // optical sizes: kanji 1, kana .92, the particle も .86 ; constant gap between ink boxes
    const rel = chars.map(ch => (ch === 'も' ? 0.88 : isKana(ch) ? 0.93 : 1));
    const gap = size * (a.gap ?? 0.36);
    const boxes = chars.map((ch, i) => inkBox(ch, fam, weight));
    const ext = boxes.map((b, i) => (vert ? (b.t + b.b) : (b.l + b.r)) * size * rel[i]);
    const total = ext.reduce((s, v) => s + v, 0) + gap * (chars.length - 1);
    const cx = a.x ?? W / 2, cy = a.y ?? H * 0.47;
    const hold = 0.96 - 0.1 * Z.smooth(S.dur - 0.7, S.dur, lt);           // the line dims a touch at the very end
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let pos = (vert ? cy : cx) - total / 2;
    chars.forEach((ch, i) => {
      const t0 = lead + i * stag, k = Z.clamp((lt - t0) / fade), e = EZ.soft(k), b = boxes[i], px = size * rel[i];
      if (k > 0) {
        const blur = (1 - e) * 6;
        ctx.save(); ctx.globalAlpha = e * hold;
        if (blur > 0.25) ctx.filter = `blur(${blur.toFixed(2)}px)`;
        ctx.font = fontStr(Math.round(px * 10) / 10, fam, weight); ctx.fillStyle = css(col);
        const drift = (1 - e) * 7;
        if (vert) ctx.fillText(ch, cx - (b.r - b.l) / 2 * px, pos + b.t * px + drift);                  // ink box top at pos
        else ctx.fillText(ch, pos + b.l * px, cy + drift - (b.b - b.t) / 2 * px * 0.0);
        ctx.restore();
      }
      pos += ext[i] + gap;
    });
    // hairline rule (the red thread): drawn from the centre outward, still creeping through the hold; ticks arrive last
    if (a.rule) {
      const k = EZ.out(Z.clamp((lt - lead - 0.2) / 1.3)), creep = 1 + 0.05 * Z.clamp((lt - 1.2) / 1.6);
      const len = (total * 0.66 + 30) * k * creep, off = size * 1.05;
      ctx.fillStyle = Z.rgba(a.ruleColor || C.verm, 0.95);
      if (vert) ctx.fillRect(cx + off, cy - len / 2, 1.5, len); else ctx.fillRect(cx - len / 2, cy + off, len, 1.5);
      const tk = EZ.soft(Z.clamp((lt - lead - 1.0) / 0.35));
      if (tk > 0) {
        ctx.globalAlpha = tk * 0.85; const th = 9 * tk;
        if (vert) { ctx.fillRect(cx + off - th / 2, cy - len / 2, th, 1.5); ctx.fillRect(cx + off - th / 2, cy + len / 2 - 1.5, th, 1.5); }
        else { ctx.fillRect(cx - len / 2, cy + off - th / 2, 1.5, th); ctx.fillRect(cx + len / 2 - 1.5, cy + off - th / 2, 1.5, th); }
        ctx.globalAlpha = 1;
      }
    }
    if (a.sub) {
      const k = EZ.soft(Z.clamp((lt - lead - 0.8) / 0.8));
      ctx.font = fontStr(15, 'mincho', 500); ctx.fillStyle = css(col, 0.42 * k);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      ctx.fillText(a.sub, cx, cy + size * 1.05 + 36);
    }
    ctx.restore();
    filmGrain(ctx, S.t, 0.035, 'screen');
  }

  // ---- flicker: black, 救って per beat, glitch + RGB split, builds to white at the shot end
  function drawFlicker(ctx, S, a) {
    const t = S.t, lt = S.lt, beats = shotBeats(S), k = beatIndex(beats, t), u = t - beats[k];
    const n = beats.length, T1 = S.shot.t1, lastB = beats[n - 1];
    const toWhite = Math.pow(Z.clamp((t - lastB) / Math.max(0.2, T1 - lastB)), 2.1);   // luminance ramp, not a flash
    const text = a.lines[0] || '救って', fam = a.fam || 'dela', weight = a.weight || 400;
    D.fill(ctx, a.paper || '#040305');
    // per-beat typographic layouts (the last four beats; earlier ones reuse the first)
    const pi = Math.min(3, Math.max(0, k - (n - 4)));
    const LAY = [
      { parts: [[text, 960, 540, 250]], hold: 0.2, gl: 1.0, frame: true },
      { parts: [[[...text][0], 560, 520, 760], [[...text].slice(1).join(''), 1380, 700, 300]], hold: 0.3, gl: 0.8 },
      { parts: [[text, 960, 540, 560]], hold: 9, gl: 0.6 },
      { parts: [[text, 960, 530, 720]], hold: 9, gl: 0.45 },
    ];
    const L = LAY[pi];
    const gf = fq(t, 15);                                                 // glitch pattern re-rolls on 2s
    const flick = L.hold < 1 ? (u < L.hold ? (gf % 3 === 1 ? 0.55 : 1) : Math.max(0, 1 - (u - L.hold) / 0.1)) : 1;
    const collapse = L.hold < 1 ? Z.clamp((u - L.hold + 0.06) / 0.12) : 0;  // CRT collapse when the short flickers die
    const splitPx = (5 + 30 * L.gl * Math.exp(-u * 7)) * (1 + toWhite);
    if (flick > 0) {
      const tc = Z.scratch[1], tx = tc.getContext('2d');
      resetCtx(tx); tx.clearRect(0, 0, W, H);
      const sy = 1 - 0.97 * E.inQuad(collapse), sxk = 1 + 0.3 * collapse;
      tx.translate(960, 540); tx.scale(sxk, sy); tx.translate(-960, -540);
      const kick = 1 + damp(u, 0.1, 18, 2.4) + 0.03 * Math.min(u, 0.5);
      tx.textAlign = 'center'; tx.textBaseline = 'middle'; tx.globalCompositeOperation = 'lighter';
      const jy = (gf % 2 ? 1 : -1) * 3 * L.gl;
      for (const [str, x, y, px] of L.parts) {
        tx.font = fontStr(Math.round(px * kick), fam, weight);
        tx.fillStyle = '#FF0000'; tx.fillText(str, x - splitPx, y + jy);
        tx.fillStyle = '#00FF00'; tx.fillText(str, x, y);
        tx.fillStyle = '#0000FF'; tx.fillText(str, x + splitPx * 0.8, y - jy);
      }
      resetCtx(tx);
      if (L.frame) {                                                      // viewfinder frame around the first, small flicker
        tx.strokeStyle = 'rgba(244,239,230,0.55)'; tx.lineWidth = 2;
        const fw = 760, fh = 330; tx.strokeRect(960 - fw / 2, 540 - fh / 2, fw, fh);
        tx.fillStyle = 'rgba(200,55,58,0.9)'; tx.fillRect(960 - fw / 2 + 14, 540 - fh / 2 + 14, 10, 10);
      }
      // CRT scanlines inside the type
      tx.globalCompositeOperation = 'destination-out'; tx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = gf % 3; y < H; y += 3) tx.fillRect(0, y, W, 1);
      tx.globalCompositeOperation = 'source-over';
      // slice displacement: copy bands with random offsets
      const R = Z.rng(Z.hash(gf, 91));
      ctx.save(); ctx.globalAlpha = flick;
      let y = 0;
      while (y < H) {
        const bh = Math.round(10 + R() * 70), off = R() < 0.32 * L.gl + 0.04 ? (R() - 0.5) * 240 * L.gl : 0;
        ctx.drawImage(tc, 0, y, W, bh, off, y, W, bh);
        y += bh;
      }
      ctx.restore();
      // block noise near the type
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16 * L.gl; i++) {
        const [, x0, y0, px] = L.parts[i % L.parts.length];
        const bw = 20 + R() * 160, bh2 = 3 + R() * 20, x = x0 + (R() - 0.5) * px * 2.4, yy = y0 + (R() - 0.5) * px * 0.9;
        ctx.fillStyle = ['rgba(255,40,60,0.5)', 'rgba(60,220,255,0.45)', 'rgba(255,255,255,0.3)'][i % 3];
        ctx.fillRect(x, yy, bw, bh2);
      }
      ctx.restore();
      if (pi >= 2) D.glow(ctx, 960, 540, 900, '#FFF6EE', 0.3 * Math.exp(-u * 9));
    } else {
      const y = (Z.fract(lt * 0.7) * H) | 0;                             // between flickers: one scan line drifting
      ctx.fillStyle = 'rgba(244,239,230,0.07)'; ctx.fillRect(0, y, W, 2);
    }
    drawMorse(ctx, S);
    filmGrain(ctx, t, 0.05, 'screen');
    if (toWhite > 0) {
      // light floods out of the word (warm, additive) and becomes the whole frame — a luminance ramp, never a strobe
      const r = 220 + 2000 * Math.pow(toWhite, 1.3);
      const g = ctx.createRadialGradient(960, 540, 0, 960, 540, r);
      g.addColorStop(0, `rgba(255,250,240,${Math.min(1, toWhite * 2)})`); g.addColorStop(0.35, `rgba(255,222,180,${Math.min(1, toWhite * 1.3)})`); g.addColorStop(0.75, `rgba(240,140,110,${0.5 * toWhite})`); g.addColorStop(1, 'rgba(200,90,90,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      D.fill(ctx, '#FFF4E6', Math.pow(toWhite, 1.7) * 0.94);
      // the word's negative afterimage stays on the white (残像)
      const neg = Z.clamp((toWhite - 0.35) / 0.65);
      if (neg > 0) {
        const [str, x, y, px] = LAY[2].parts[0];
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fontStr(Math.round(px * (1.02 + 0.06 * neg)), fam, weight);
        ctx.filter = `blur(${(2 + 5 * (1 - neg)).toFixed(1)}px)`; ctx.fillStyle = `rgba(24,70,86,${0.55 * neg})`; ctx.fillText(str, x, y);
        ctx.restore();
      }
    }
  }

  // SOS in morse (··· ––– ···): the quiet signal under the noise; one element lights per 1/9 of the shot
  function drawMorse(ctx, S) {
    const el = [1, 1, 1, 3, 3, 3, 1, 1, 1], lt = S.lt, dur = S.dur, unit = 14, gap = 12, h = 4;
    let total = 0; for (const e of el) total += e * unit + gap; total -= gap;
    let x = W / 2 - total / 2; const y = H - 96;
    const lit = Math.floor(Z.clamp(lt / (dur * 0.92)) * el.length + 1e-6);
    ctx.save();
    el.forEach((e, i) => {
      ctx.fillStyle = i < lit ? 'rgba(200,55,58,0.95)' : 'rgba(244,239,230,0.16)';
      ctx.fillRect(x, y - h / 2, e * unit, h); x += e * unit + gap;
    });
    ctx.font = fontStr(16, 'dot', 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(244,239,230,0.45)';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillText('SOS', W / 2 + 3, y + 26);
    ctx.restore();
  }

  // ===================================================================================== tunnel
  const tunnelCfg = a => Object.assign({ words: ['暗闇の果てで', 'まだ遅くない', 'あなたに会いたい', '光', '残光'], toward: 'dawn', f: 820, v0: 3.1, v1: 9.5, fadeIn: 0.18 }, a);
  const tunnelVP = lt => [W / 2 + 34 * Math.sin(lt * 0.85 + 0.4) + 12 * Math.sin(lt * 2.1), H / 2 + 20 * Math.sin(lt * 0.6 + 1.3)];
  const LATIN = ['AT THE END OF THE DARKNESS', 'IT IS NOT TOO LATE', 'I STILL WANT TO SEE YOU', 'ZANKŌ — AFTERGLOW', 'HOLD ON TO THE LAST LIGHT'];

  // camera travel (world units) — accelerating, continuous past the shot end
  const travel = (lt, dur, v0, v1) => {
    if (lt <= 0) return v0 * lt;
    if (lt <= dur) return v0 * lt + (v1 - v0) * lt * lt * lt / (3 * dur * dur);
    return v0 * dur + (v1 - v0) * dur / 3 + v1 * (lt - dur);
  };
  // objects are built once per shot: each has a crossing time tc (when it leaves the frame) → a fixed world depth
  const tunCache = new Map();
  function tunnelObjects(S, a) {
    const key = S.shot.id + '|' + S.shot.t0 + '|' + S.shot.t1 + '|' + a.words.join('/');
    let L = tunCache.get(key); if (L) return L;
    const t0 = S.shot.t0, t1 = S.shot.t1, dur = t1 - t0, B = S.clock.beats;
    const bs = B.filter(b => b > t0 - 1.5 && b < t1 + 5);
    const w = a.words, wordFor = tc => {
      if (a.plan) { let wd = a.plan[0][1]; for (const [tt, ww] of a.plan) if (tc >= tt) wd = ww; return wd; }
      if (w.length >= 5) { if (tc < t0 + 0.95) return w[1]; if (tc < t0 + 3.05) return w[0]; if (tc < t1 - 0.2) return w[2]; return w[3]; }
      return w[Math.min(w.length - 1, Math.floor(Z.clamp((tc - t0) / dur) * w.length))];
    };
    L = [];
    bs.forEach((b, i) => {
      const bi = S.clock.beat(b + 1e-4), nb = bs[i + 1] ?? b + 0.46, sp = nb - b, ib = S.clock.inBar(b + 1e-4);
      const final = Math.abs(b - t1) < 0.06;
      if (ib % 2 === 0 || final) {
        // lyric ring on beats 1 & 3 (bigger on the downbeat); the one crossing at the shot end carries the last word
        L.push({ type: 'text', tc: b, R: 1.6, gs: ib === 0 ? 0.34 : 0.27, word: wordFor(b), tilt: [Z.rnds(bi, 1) * 0.2, Z.rnds(bi, 2) * 0.2], spin: (bi % 4 ? 1 : -1) * (0.1 + 0.08 * Z.rnd(bi, 3)), ph: Z.rnd(bi, 4) * TAU, beat: true, down: ib === 0, id: bi });
      } else {
        // off-beats: an engraved dial ring + a small Latin ring inside it
        L.push({ type: 'dial', tc: b, R: 1.9, tilt: [Z.rnds(bi, 21) * 0.15, Z.rnds(bi, 22) * 0.15], spin: 0.22 * (bi % 4 === 1 ? 1 : -1), ph: Z.rnd(bi, 8) * TAU, beat: true, id: bi * 7 + 2 });
        L.push({ type: 'latin', tc: b + sp * 0.22, R: 1.12, gs: 0.07, text: LATIN[Math.floor(Z.rnd(bi, 9) * LATIN.length)], spin: -0.28, ph: Z.rnd(bi, 10) * TAU, tilt: [0, 0], id: bi * 7 + 3 });
      }
      L.push({ type: 'circle', tc: b + sp * 0.5, R: 1.3 + 0.9 * Z.rnd(bi, 5), tilt: [Z.rnds(bi, 6) * 0.3, Z.rnds(bi, 7) * 0.3], lw: 0.01, id: bi * 7 + 1 });
      if (bi % 4 === 1 || bi % 4 === 3) L.push({ type: 'cross', tc: b + sp * 0.7, x: (bi % 8 < 4 ? -1 : 1) * (1.55 + 0.5 * Z.rnd(bi, 12)), y: Z.rnds(bi, 13) * 0.9, sz: 0.8 + 0.3 * Z.rnd(bi, 14), rot: Z.rnds(bi, 15) * 0.25, id: bi * 7 + 4 });
      if (bi % 4 === 2) L.push({ type: 'frame', tc: b + sp * 0.62, R: 2.3, rot: Z.rnd(bi, 16) < 0.5 ? Math.PI / 4 : 0, id: bi * 7 + 5 });
    });
    tunCache.set(key, L); return L;
  }

  Z.scene('tunnel', {
    preload: a => (a.reveal ? [a.reveal] : []),
    init: loadFonts,
    draw(ctx, S) {
      const a = tunnelCfg(S.args), t = S.t, lt = S.lt, dur = S.dur, f = a.f;
      const prog = Z.clamp(lt / dur);
      const glowK = Math.pow(prog, 2.3);                                   // light growth: slow, then blooming
      const [vx, vy] = tunnelVP(lt);
      const s = travel(lt, dur, a.v0, a.v1);
      const v = lt < dur ? a.v0 + (a.v1 - a.v0) * (lt / dur) ** 2 : a.v1;
      const pulse = S.clock.pulse(t, 7), dpulse = S.clock.downPulse(t, 5);
      const roll = 0.09 * lt + 0.035 * Math.sin(lt * 1.7) + 0.05 * damp(S.clock.since(t), 1, 6, 0.8) * (S.clock.inBar(t) % 2 ? 1 : -1);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      // ---------------- the light IS the background: a painted radial ramp whose radius grows (gold → rose → violet → night)
      const Rl = 26 + 1450 * glowK + 40 * pulse + 90 * dpulse * glowK;     // radius of the rose zone
      const dark1 = mixRGB('#120c22', '#241634', glowK);
      const Rout = Math.max(1350, Rl * 2.1);
      const bg = ctx.createRadialGradient(vx, vy, 0, vx, vy, Rout);
      const st = (r, c) => bg.addColorStop(Z.clamp(r / Rout), typeof c === 'string' ? c : css(c));
      st(0, '#FFF8EC'); st(Rl * 0.05, '#FFEBCB'); st(Rl * 0.2, '#FFCB92'); st(Rl * 0.45, '#F79E84'); st(Rl * 0.72, '#D97F95');
      st(Rl * 1.0, mixRGB('#5a3a78', '#8a5388', glowK)); st(Rl * 1.45, mixRGB('#1a1030', '#43285a', glowK)); st(Rl * 2.1, dark1); st(Rout, dark1);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      if (Rl * 2.1 < 1350) { const g2 = ctx.createRadialGradient(vx, vy, Rl * 2.1, vx, vy, 1350); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(7,5,13,0.85)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H); }
      D.glow(ctx, vx, vy, 14 + 60 * glowK, '#FFFFFF', 0.9);             // hot core
      D.rays(ctx, vx, vy, 26, 1500, mix('#B06A8A', '#FFD9B0', glowK), 0.035 + 0.08 * glowK, lt * 3, 9);
      // ---------------- objects in depth (far → near)
      const objs = tunnelObjects(S, a), near = 0.22, far = 22;
      const vis = [];
      for (const o of objs) {
        const zb = (o.R || 1.6) * f / 1020;                               // depth at which it leaves the frame (≈ its crossing)
        const z = zb + travel(o.tc - S.shot.t0, dur, a.v0, a.v1) - s;
        if (z < near || z > far) continue;
        vis.push([z, o]);
      }
      vis.sort((p, q) => q[0] - p[0]);
      const proj = (x, y, z) => { const X = x * cr - y * sr, Y = x * sr + y * cr; const k = f / z; return [vx + X * k, vy + Y * k, k]; };
      const lit = hexRGB('#FFEBD0'), ink = hexRGB('#2a1430');
      for (const [z, o] of vis) {
        const rS = (o.R || 1) * f / z;
        const fogA = 1 - Z.smooth(far * 0.3, far * 0.95, z);
        const nearA = 1 - Z.smooth(1150, 1900, rS);
        let al = fogA * nearA; if (al < 0.01) continue;
        // in front of the light a ring reads as a silhouette; out in the dark it glows (words that were light become shadow)
        const sil = 1 - Z.smooth(Rl * 0.55, Rl * 1.05, rS);
        const inLight = 1 - Z.smooth(Rl * 0.2, Rl * 0.7, rS);            // deep inside the glow: dissolve into it
        al *= 1 - 0.75 * inLight * Z.smooth(3, 10, z);
        const deep = Z.smooth(5, far * 0.85, z);                         // far rings sink toward the fog
        const colRGB = mixRGB(mixRGB(lit, ink, sil), mixRGB('#7a68a8', '#F4B8A8', sil), deep * 0.55);
        const passing = o.beat ? Math.exp(-Math.abs(t - o.tc) * 9) : 0;   // lit up as it crosses on its beat
        drawTunnelObj(ctx, o, z, lt, proj, f, colRGB, al, sil, passing, glowK);
      }
      // ---------------- streaks (dust flying past), closed form in travel
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const Ls = 20, nS = 240, streak = 0.05 + v * 0.05;
      for (let i = 0; i < nS; i++) {
        const th = Z.rnd(i, 31) * TAU, rw = 0.4 + 3.2 * Math.pow(Z.rnd(i, 32), 0.7);
        const z = near + 0.1 + ((Z.rnd(i, 33) * Ls - s) % Ls + Ls) % Ls;
        if (z > far) continue;
        const x = Math.cos(th) * rw, y = Math.sin(th) * rw;
        const [ax, ay] = proj(x, y, z), [bx, by] = proj(x, y, z + streak);
        const aa = (1 - Z.smooth(4, Ls, z)) * 0.65 * (0.4 + 0.6 * Z.rnd(i, 34)) * (1 - 0.6 * glowK);
        if (aa < 0.02) continue;
        ctx.strokeStyle = mix(i % 5 ? '#B9A6F0' : C.glow, '#FFD2B0', glowK, aa);
        ctx.lineWidth = Math.min(3.5, 0.8 + 5 / z);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.restore();
      // ---------------- anamorphic streak through the light
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sw = 380 + 1900 * glowK, shh = 2 + 5 * glowK;
      const sg = ctx.createLinearGradient(vx - sw, 0, vx + sw, 0);
      sg.addColorStop(0, 'rgba(255,190,170,0)'); sg.addColorStop(0.5, `rgba(255,236,214,${0.28 + 0.3 * glowK})`); sg.addColorStop(1, 'rgba(255,190,170,0)');
      ctx.fillStyle = sg; ctx.fillRect(vx - sw, vy - shh / 2, sw * 2, shh);
      ctx.restore();
      // ---------------- dawn wash (never a full white-out: the last word must stay legible for the cut)
      const wo = Math.pow(Z.clamp((lt - (dur - 0.6)) / 0.6), 2);
      if (wo > 0) { const g3 = ctx.createRadialGradient(vx, vy, 0, vx, vy, 1400); g3.addColorStop(0, `rgba(255,244,226,${0.4 * wo})`); g3.addColorStop(1, `rgba(255,206,180,${0.25 * wo})`); ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H); }
      // ---------------- the name of the light: 残光 surfaces inside the glow for the last bar, ink on light
      const title = a.words[a.words.length - 1];
      const tk = Z.clamp((lt - (dur - 1.75)) / 1.75);
      if (tk > 0) {
        const sz = 44 + 236 * EZ.io(tk);
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fontStr(Math.round(sz), 'minchoHeavy', 900);
        if ('letterSpacing' in ctx) ctx.letterSpacing = Math.round(sz * (0.5 - 0.36 * EZ.out(tk))) + 'px';   // tracking closes as it arrives
        ctx.globalAlpha = EZ.soft(Z.clamp(tk * 2.5));
        ctx.fillStyle = '#2a1224'; ctx.fillText(title, vx + sz * 0.02, vy);
        ctx.restore();
        const rk = EZ.soft(Z.clamp((tk - 0.45) / 0.4));                  // small Latin line under it
        if (rk > 0) { ctx.save(); ctx.font = fontStr(18, 'dot', 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; if ('letterSpacing' in ctx) ctx.letterSpacing = '9px'; ctx.fillStyle = `rgba(42,18,36,${0.7 * rk})`; ctx.fillText('ZANKŌ — AFTERGLOW', vx + 4, vy + sz * 0.66 + 14); ctx.restore(); }
      }
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(3,2,6,${0.6 * (1 - glowK)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      filmGrain(ctx, t, 0.07, 'overlay');
      if (a.fadeIn > 0 && lt < a.fadeIn) D.fill(ctx, '#000', 1 - EZ.soft(lt / a.fadeIn));
    },
  });

  // text / geometry drawing for one tunnel object at depth z
  function drawTunnelObj(ctx, o, z, lt, proj, f, rgb, al, sil, passing, glowK) {
    ctx.save();
    ctx.globalCompositeOperation = sil > 0.4 ? 'source-over' : 'lighter';
    const k = f / z;
    const ringPt = (R, th, tilt) => {                               // point on a tilted ring (world) → [x,y,z]
      const x = R * Math.cos(th), y0 = R * Math.sin(th);
      const y = y0 * Math.cos(tilt[0]), zz = y0 * Math.sin(tilt[0]);
      const x2 = x * Math.cos(tilt[1]) + zz * Math.sin(tilt[1]), z2 = -x * Math.sin(tilt[1]) + zz * Math.cos(tilt[1]);
      return [x2, y, z + z2];
    };
    if (o.type === 'text' || o.type === 'latin') {
      const isText = o.type === 'text', word = isText ? o.word : o.text;
      const chars = isText ? [...word, '　', '・', '　'] : [...(word + '   ·   ')];
      const fam = isText ? 'mincho' : 'dot', weight = isText ? 800 : 400;
      ctx.font = fontStr(100, fam, weight); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const R = o.R, gs = o.gs * (isText && word.length <= 2 ? 1.5 : 1);
      const advs = chars.map(ch => (ch === '　' ? 0.55 : ch === '・' ? 0.6 : ctx.measureText(ch).width / 100) * gs * (isText ? 1.06 : 1.25));
      const unit = advs.reduce((s2, v) => s2 + v, 0), circ = TAU * R, reps = Math.max(1, Math.floor(circ / unit));
      const scaleA = circ / (reps * unit);
      const rot = o.ph + (o.spin || 0) * lt;
      const aBase = al * (isText ? 1 : 0.5) * (1 + 0.5 * passing);
      ctx.fillStyle = css(mixRGB(rgb, sil > 0.5 ? rgb : '#FFFFFF', passing * 0.5), Math.min(1, aBase));
      let th = rot;
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < chars.length; i++) {
          const dth = advs[i] * scaleA / R, thc = th + dth / 2;
          th += dth;
          if (chars[i] === '　') continue;
          const p = ringPt(R, thc, o.tilt), q = ringPt(R, thc + 0.01, o.tilt);
          if (p[2] < 0.2) continue;
          const [sx, sy, kk] = proj(p[0], p[1], p[2]), [qx, qy] = proj(q[0], q[1], q[2]);
          const px = gs * kk;
          if (sx < -px || sx > W + px || sy < -px || sy > H + px) continue;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(qy - sy, qx - sx)); ctx.scale(px / 100, px / 100);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    } else if (o.type === 'circle') {
      ctx.strokeStyle = css(rgb, al * 0.6); ctx.lineWidth = Math.max(1, o.lw * k);
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 96; i++) { const p = ringPt(o.R, (i / 96) * TAU, o.tilt); if (p[2] < 0.2) { first = true; continue; } const [sx, sy] = proj(p[0], p[1], p[2]); if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy); }
      ctx.stroke();
    } else if (o.type === 'dial') {
      const rot = o.ph + o.spin * lt;
      ctx.strokeStyle = css(rgb, al * (0.5 + 0.5 * passing)); ctx.lineWidth = Math.max(1, 0.009 * k);
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const th = rot + (i / 120) * TAU, L = i % 10 === 0 ? 0.17 : i % 5 === 0 ? 0.09 : 0.04;
        const p = ringPt(o.R, th, o.tilt), q = ringPt(o.R + L, th, o.tilt);
        if (p[2] < 0.2 || q[2] < 0.2) continue;
        const [ax, ay] = proj(p[0], p[1], p[2]), [bx, by] = proj(q[0], q[1], q[2]);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
      ctx.stroke();
      // thin inner circle
      ctx.lineWidth = Math.max(1, 0.005 * k); ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 96; i++) { const p = ringPt(o.R, (i / 96) * TAU, o.tilt); if (p[2] < 0.2) { first = true; continue; } const [sx, sy] = proj(p[0], p[1], p[2]); if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy); }
      ctx.stroke();
    } else if (o.type === 'frame') {
      ctx.strokeStyle = css(rgb, al * 0.45); ctx.lineWidth = Math.max(1, 0.012 * k);
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) { const th = o.rot + (i / 4) * TAU + Math.PI / 4; const [sx, sy] = proj(Math.cos(th) * o.R * 1.414, Math.sin(th) * o.R * 1.414, z); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
      ctx.stroke();
    } else if (o.type === 'cross') {
      // railway crossbuck ✕: two bars with diagonal hazard stripes, lit rim toward the light
      const [cx, cy, kk] = proj(o.x, o.y, z);
      const L = o.sz * kk, Wd = 0.12 * o.sz * kk;
      if (L < 4) { ctx.restore(); return; }
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(cx, cy); ctx.rotate(o.rot);
      const body = css(mixRGB('#120a1c', '#2a1530', glowK), al), stripe = css(mixRGB('#D9A441', '#FFD9A0', glowK), al * (0.75 - 0.35 * sil));
      for (const ang of [Math.PI / 4, -Math.PI / 4]) {
        ctx.save(); ctx.rotate(ang);
        ctx.beginPath(); ctx.rect(-L / 2, -Wd / 2, L, Wd); ctx.fillStyle = body; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = stripe;
        const sw = Wd * 1.1;
        for (let xx = -L / 2 - Wd; xx < L / 2 + Wd; xx += sw * 2) { ctx.beginPath(); ctx.moveTo(xx, Wd / 2); ctx.lineTo(xx + sw, Wd / 2); ctx.lineTo(xx + sw + Wd, -Wd / 2); ctx.lineTo(xx + Wd, -Wd / 2); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = css(mixRGB('#FFE0C0', '#FFF4E0', glowK), al * (0.35 + 0.4 * glowK)); ctx.lineWidth = Math.max(1, Wd * 0.08);
        ctx.strokeRect(-L / 2, -Wd / 2, L, Wd);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ===================================================================================== post helpers
  const slamPost = S => {
    const cfg = slamCfg(S.args), beats = shotBeats(S), k = beatIndex(beats, S.t), u = S.t - beats[k];
    const hit = Math.exp(-u * 14);
    const P = { ca: 1.2 + 6 * hit, bloom: 0.28 + 0.3 * hit, bloomThreshold: 0.82, zoomBlur: 0.06 * Math.exp(-u * 26), zoomCenter: [0.33, 0.5], vignette: 0.25, boil: 1.0 };
    if (cfg.fire) Object.assign(P, { lutA: 'ember', lutMix: 0.18, bloom: 0.42 + 0.3 * hit, bloomThreshold: 0.7, contrast: 1.05 });
    else if (cfg.sky === 'night') Object.assign(P, { lutA: 'night', lutMix: 0.1, bloom: 0.35 + 0.3 * hit, bloomThreshold: 0.75 });
    else if (cfg.sky === 'day') Object.assign(P, { lutMix: 0, bloom: 0.1 + 0.15 * hit, bloomThreshold: 0.93, vignette: 0.1 });   // no dusk palette, no milky sky
    else Object.assign(P, { lutA: 'P1', lutMix: 0.1 });
    return P;
  };
  const cardPost = S => {
    const a = cardCfg(S.args);
    if (a.mode !== 'flicker') return lightPaper(a) ? { boil: 0.35, bloom: 0.05, bloomThreshold: 0.95, vignette: 0.1, ca: 0 } : { boil: 0.35, bloom: 0.2, vignette: 0.4, ca: 0 };
    const beats = shotBeats(S), k = beatIndex(beats, S.t), u = S.t - beats[k];
    return { boil: 0.8, glitch: 0.3 * Math.exp(-u * 8) + 0.04, ca: 2.5 + 4 * Math.exp(-u * 10), bloom: 0.5, bloomThreshold: 0.6, vignette: 0.35 };
  };
  const tunnelPost = S => {
    const lt = S.lt, dur = S.dur, p = Z.clamp(lt / dur), g = Math.pow(p, 2.4), [vx, vy] = tunnelVP(lt);
    const settle = 1 - Z.smooth(dur - 0.9, dur - 0.2, lt);               // zoom blur relaxes so the final title reads
    return { zoomBlur: (0.008 + 0.03 * p + 0.02 * S.clock.pulse(S.t, 10)) * (0.08 + 0.92 * settle), zoomCenter: [vx / W, vy / H], bloom: 0.42 + 0.15 * g, bloomThreshold: 0.72 + 0.12 * g, ca: 1.2, vignette: 0.2, boil: 0.6 };
  };
  Z.typo = { post: { kanjiSlam: slamPost, typeCard: cardPost, tunnel: tunnelPost }, vp: tunnelVP, bez };
})();
