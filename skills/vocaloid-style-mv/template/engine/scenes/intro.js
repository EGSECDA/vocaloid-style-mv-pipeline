/* vocaloid-style-mv scenes: intro — the light that opens and closes the film.
 *
 *   ember      {mode:'breathe'|'ignite'|'collapse', stops, flares, blackFrom, crackAt, bg, keys}   shots 01 · 02 · 65
 *   titleRiff  {variant:'intro'|'outro', recap:[{bg,char,view,cx,h}], char, sky, cues, exit,   shots 03 · 64
 *               glyphs:['残','光'], ruby:['ざん','こう'] (reading per glyph; false = none), sub:'afterglow',
 *               hud:{title, when, bpm, geo, place, len} (the six corner strings; defaults are 残光's)}
 *   converge   {seed, whiteAt}                                                                   shot 51
 *   afterimage {text:'残光', sub:'afterglow', credit, color}                                     shot 66
 *
 * Everything is a closed-form function of song time (beat lists come from Z.audio). The title lockup
 * geometry is shared (LK) so the outro title, the collapse and the cyan afterimage line up exactly.
 * Helpers for the timeline: Z.INTRO.post.<scene>(S) (recommended post params) and Z.INTRO.black(S).
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, CX = W / 2, CY = H / 2, TAU = Math.PI * 2;
  const clamp = Z.clamp, lerp = Z.lerp, inv = Z.inv, rgba = Z.rgba;

  // ================================================================== palettes
  const P1 = { void: '#050208', ink: '#140B1E', shadow: '#3A1745', dusk: '#7A2350', verm: '#C8373A', sunset: '#F0663A', glow: '#FFA552', hi: '#FFE3B0', core: '#FFF6E6' };
  const DAWN = { void: '#07051a', ink: '#120d24', shadow: '#3a2d63', dusk: '#9a6aa0', verm: '#e0707e', sunset: '#f3a6a0', glow: '#ffd9b0', hi: '#fffaf0', core: '#ffffff' };
  const CYAN = '#39C6E0';

  // ================================================================== motion helpers
  // CSS cubic-bezier easing (Newton, bisection fallback)
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = u => ((ax * u + bx) * u + cx) * u, sy = u => ((ay * u + by) * u + cy) * u, dx = u => (3 * ax * u + 2 * bx) * u + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 6; i++) { const e = sx(u) - x, d = dx(u); if (Math.abs(e) < 1e-6) return sy(u); if (Math.abs(d) < 1e-6) break; u -= e / d; }
      let lo = 0, hi = 1; u = x;
      for (let i = 0; i < 30; i++) { const v = sx(u); if (Math.abs(v - x) < 1e-7) break; if (v < x) lo = u; else hi = u; u = (lo + hi) / 2; }
      return sy(u);
    };
  }
  const EZ = {
    out: bezier(0.16, 1, 0.3, 1),     // house expo-out: entrances
    in: bezier(0.7, 0, 0.84, 0),      // expo-in: exits
    io: bezier(0.83, 0, 0.17, 1),     // hard in-out: camera snaps, layout moves
    soft: bezier(0.45, 0, 0.2, 1),    // gentle settle
    whip: bezier(0.6, -0.28, 0.2, 1), // anticipation (pulls back first) + fast settle
  };
  const seg = (t, t0, d) => clamp((t - t0) / d);
  const hit = (t, t0, k = 8) => (t < t0 ? 0 : Math.exp(-(t - t0) * k));
  // slam scale: s0 on the cue → 1, one overshoot below 1, settles in ~6 frames
  const slam = (dt, s0 = 1.35, f = 22, z = 12) => (dt < 0 ? s0 : 1 + (s0 - 1) * Math.exp(-z * dt) * Math.cos(f * dt));
  const pad = (n, k = 2) => String(Math.floor(n)).padStart(k, '0');

  // beats starting at (or just before) t0; extrapolated past the end of the song
  const beatCache = new Map();
  function beatsFrom(t0, n = 20) {
    const key = t0.toFixed(3) + '|' + n; let r = beatCache.get(key); if (r) return r;
    const b = (Z.audio && Z.audio.beats) || []; let i = 0;
    while (i < b.length && b[i] < t0 - 0.04) i++;
    r = [];
    for (let k = 0; k < n; k++) r.push(i + k < b.length ? b[i + k] : (b.length ? b[b.length - 1] : t0) + (i + k - b.length + 1) * 0.46);
    beatCache.set(key, r); return r;
  }
  const lastBeatBefore = t => { const b = (Z.audio && Z.audio.beats) || []; let x = null; for (const v of b) { if (v < t - 0.05) x = v; else break; } return x ?? t - 0.46; };
  const strongOnsets = (t0, t1, thr = 0.5) => ((Z.audio && Z.audio.onsets_strong) || []).filter(o => o.t > t0 && o.t < t1 && o.strength >= thr).map(o => o.t);

  // ================================================================== fonts & type helpers
  const FONTS = ['900 200px "Zen Old Mincho"', '400 20px "DotGothic16"', '500 40px "Zen Kaku Gothic New"', '300 40px "Zen Kaku Gothic New"',
    '400 40px "Zen Kaku Gothic New"', '700 40px "Zen Kaku Gothic New"', '500 40px "Shippori Mincho B1"', '300 40px "Noto Serif JP"', '400 40px "Noto Serif JP"', '300 40px "Noto Sans JP"'];
  let fontsReady = null;
  const loadFonts = () => fontsReady || (fontsReady = Promise.all(FONTS.map(f => document.fonts.load(f, '残光ざんこうafterglowZANKŌ0123456789').catch(() => null))));

  const inkM = new Map();
  function ink(ch, fam = 'minchoHeavy', weight = 900) {
    const key = ch + '|' + fam + '|' + weight; let m = inkM.get(key); if (m) return m;
    const c = Z.canvas(8, 8).getContext('2d'); D.font(c, 1000, fam, weight);
    const t = c.measureText(ch);
    m = { cx: (t.actualBoundingBoxRight - t.actualBoundingBoxLeft) / 2, cy: (t.actualBoundingBoxDescent - t.actualBoundingBoxAscent) / 2,
      w: t.actualBoundingBoxRight + t.actualBoundingBoxLeft, h: t.actualBoundingBoxAscent + t.actualBoundingBoxDescent };
    if (document.fonts.check(`${weight} 100px ${Z.FONT[fam] || fam}`)) inkM.set(key, m);
    return m;
  }
  // glyph centred on its ink box at (x,y); size = em in px. fill may be a colour or a function (ctx) → style (in 1000-unit glyph space)
  function glyph(ctx, ch, x, y, size, o = {}) {
    const fam = o.fam || 'minchoHeavy', wt = o.weight || 900, m = ink(ch, fam, wt), k = size / 1000;
    ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(k * (o.sx ?? 1), k * (o.sy ?? 1));
    D.font(ctx, 1000, fam, wt); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.fill) { ctx.fillStyle = typeof o.fill === 'function' ? o.fill(ctx, m) : o.fill; ctx.fillText(ch, -m.cx, -m.cy); }
    if (o.stroke) { ctx.lineWidth = (o.lw || 2) / k; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ch, -m.cx, -m.cy); }
    ctx.restore();
    return m;
  }
  // DotGothic16 HUD line; DotGothic has no Ō, so macrons are drawn as a pixel bar
  function hud(ctx, str, x, y, o = {}) {
    const size = o.size || 20;
    ctx.save(); D.font(ctx, size, 'dot', 400); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
    ctx.fillStyle = o.color || P1.glow; ctx.globalAlpha *= o.alpha ?? 0.8;
    const plain = str.replace(/Ō/g, 'O').replace(/ō/g, 'o');
    const w = ctx.measureText(plain).width;
    const x0 = Math.round(o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x);
    ctx.fillText(plain, x0, Math.round(y));
    let i = -1;
    while ((i = str.indexOf('Ō', i + 1)) >= 0) {
      const pre = ctx.measureText(plain.slice(0, i)).width, cw = ctx.measureText('O').width;
      ctx.fillRect(Math.round(x0 + pre + cw * 0.2), Math.round(y - size * 0.96), Math.round(cw * 0.6), Math.max(2, Math.round(size * 0.09)));
    }
    ctx.restore();
    return w;
  }
  const POOL = [...'0123456789ABCDEFXZ#%+=/<>ｱｳｶｻﾀﾅﾊﾏﾗ・:'];
  // scramble-decode: resolved prefix + a few flickering chars (re-rolled at 24 fps)
  function scramble(str, t, t0, cps = 26, seed = 1, tail = 3) {
    const chars = [...str], k = (t - t0) * cps; if (k <= 0) return '';
    const n = Math.floor(k), q = Math.floor(t * 24 + 1e-6); let s = '';
    for (let i = 0; i < chars.length && i < n + tail; i++) s += (i < n || chars[i] === ' ') ? chars[i] : POOL[Z.hash(i, q, seed) % POOL.length];
    return s;
  }
  const clockStr = t => { const s = Math.max(0, t), ss = Math.floor(s + 1e-6), ff = Math.floor((s * 30 + 1e-6) % 30); return `17:${pad(42 + Math.floor(ss / 60))}:${pad(ss % 60)}.${pad(ff)}`; };

  // ================================================================== cached textures
  const texCache = new Map();
  // print screen (rotated dot grid); dots grow toward the bottom-left
  function halftone(color, step = 12) {
    const key = 'ht' + color + step; let c = texCache.get(key); if (c) return c;
    c = Z.canvas(W, H); const x = c.getContext('2d'); x.fillStyle = color; x.beginPath();
    const ang = 0.26, ca = Math.cos(ang), sa = Math.sin(ang), R = Math.hypot(W, H) / 2 + step;
    for (let v = -R; v <= R; v += step) for (let u = -R; u <= R; u += step) {
      const px = CX + u * ca - v * sa, py = CY + u * sa + v * ca;
      if (px < -step || px > W + step || py < -step || py > H + step) continue;
      const f = clamp(0.1 + 0.9 * (py / H) * 0.8 + 0.2 * (1 - px / W) + 0.08 * Z.rnds(Math.round(u), Math.round(v), 5));
      const r = step * 0.52 * Math.pow(f, 1.4);
      if (r > 0.4) { x.moveTo(px + r, py); x.arc(px, py, r, 0, TAU); }
    }
    x.fill(); texCache.set(key, c); return c;
  }
  // mottled paper / film density (soft-light overlay)
  function paper() {
    let c = texCache.get('paper'); if (c) return c;
    const s = Z.canvas(240, 135), x = s.getContext('2d'), R = Z.rng(77), id = x.createImageData(240, 135);
    for (let i = 0; i < id.data.length; i += 4) { const v = 118 + (R() - 0.5) * 70; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0);
    c = Z.canvas(W, H); const y = c.getContext('2d'); y.imageSmoothingEnabled = true; y.filter = 'blur(2px)'; y.drawImage(s, 0, 0, W, H);
    texCache.set('paper', c); return c;
  }
  // film grain, applied in-scene with 'overlay' (black stays black). Four tiles, re-picked and re-offset at 24 fps.
  const grainTiles = [];
  function grain(ctx, t, amt = 0.06) {
    if (amt <= 0) return;
    if (!grainTiles.length) for (let k = 0; k < 4; k++) {
      const c = Z.canvas(256, 256), x = c.getContext('2d'), id = x.createImageData(256, 256), R = Z.rng(900 + k);
      for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (R() + R() + R() - 1.5) * 92; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
      x.putImageData(id, 0, 0); grainTiles.push(c);
    }
    const q = Math.floor(t * 24 + 1e-6), ox = Math.floor(Z.rnd(q, 1) * 256), oy = Math.floor(Z.rnd(q, 2) * 256);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amt;
    ctx.fillStyle = ctx.createPattern(grainTiles[q % 4], 'repeat'); ctx.translate(-ox, -oy); ctx.fillRect(ox, oy, W, H);
    ctx.restore();
  }
  // character cut-out filled with a sky image (for the silhouette inside the sun)
  function skyCutout(charPath, skyPath, tone) {
    const key = 'cut|' + charPath + '|' + skyPath + '|' + tone; let c = texCache.get(key); if (c) return c;
    const img = Z.imgSync(charPath), sky = Z.imgSync(skyPath); if (!img) return null;
    c = Z.canvas(img.width, img.height); const x = c.getContext('2d');
    if (sky) { const s = Math.max(img.width / sky.width, img.height / sky.height) * 1.15; x.drawImage(sky, (img.width - sky.width * s) * 0.5, (img.height - sky.height * s) * 0.25, sky.width * s, sky.height * s); }
    else { x.fillStyle = tone; x.fillRect(0, 0, img.width, img.height); }
    x.globalCompositeOperation = 'multiply';
    const g = x.createLinearGradient(0, 0, 0, img.height); g.addColorStop(0, '#5a3a6e'); g.addColorStop(0.55, tone); g.addColorStop(1, '#1a0d24');
    x.fillStyle = g; x.fillRect(0, 0, img.width, img.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
    texCache.set(key, c); return c;
  }

  // ================================================================== light primitives
  // the ember: halo + hot core + optional anamorphic streak (all additive)
  function ember(ctx, x, y, I, t, o = {}) {
    const P = o.pal || P1;
    const k = Math.max(0, I * (1 + 0.07 * Z.noise1(t * 17, 3) + 0.05 * Z.noise1(t * 43, 5)));
    if (k <= 0.002) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R1 = 40 + 300 * k;
    let g = ctx.createRadialGradient(x, y, 0, x, y, R1);
    g.addColorStop(0, rgba(P.sunset, Math.min(1, 0.42 * k))); g.addColorStop(0.1, rgba(P.verm, 0.26 * Math.min(1.2, k)));
    g.addColorStop(0.38, rgba(P.dusk, 0.08 * Math.min(1.2, k))); g.addColorStop(1, rgba(P.dusk, 0));
    ctx.fillStyle = g; ctx.fillRect(x - R1, y - R1, 2 * R1, 2 * R1);
    const R2 = 7 + 30 * k;
    g = ctx.createRadialGradient(x, y, 0, x, y, R2);
    g.addColorStop(0, rgba(P.hi, Math.min(1, 0.85 * k + 0.15))); g.addColorStop(0.3, rgba(P.glow, 0.6 * Math.min(1, k)));
    g.addColorStop(1, rgba(P.sunset, 0));
    ctx.fillStyle = g; ctx.fillRect(x - R2, y - R2, 2 * R2, 2 * R2);
    if (o.streak > 1) {
      const L = o.streak;
      for (const [hh, a] of [[2.2, 0.55], [9, 0.12]]) {
        ctx.save(); ctx.translate(x, y); ctx.scale(L / hh, 1);
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, hh);
        g.addColorStop(0, rgba(P.hi, a * Math.min(1, k))); g.addColorStop(0.35, rgba(P.glow, a * 0.4 * Math.min(1, k))); g.addColorStop(1, rgba(P.sunset, 0));
        ctx.fillStyle = g; ctx.fillRect(-hh, -hh, 2 * hh, 2 * hh); ctx.restore();
      }
    }
    const rc = 1.1 + 2.4 * Math.min(1.5, k);
    ctx.fillStyle = rgba(P.core, Math.min(1, 0.6 + k)); ctx.beginPath(); ctx.arc(x, y, rc, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // heat shimmer: render the ember into a buffer, blit it back in horizontal strips displaced by rising sine waves
  const shimBuf = Z.canvas(1600, 900), shimX = shimBuf.getContext('2d');
  function emberShimmer(ctx, x, y, I, t, o = {}) {
    const bx = 800, by = 520;
    shimX.setTransform(1, 0, 0, 1, 0, 0); shimX.globalCompositeOperation = 'source-over'; shimX.globalAlpha = 1; shimX.clearRect(0, 0, 1600, 900);
    ember(shimX, bx, by, I, t, o);
    const amp = (o.shimmer ?? 1) * (1.2 + 3.2 * Math.min(1.2, I)), step = 4;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let yy = 0; yy < 900; yy += step) {
      const above = by + 14 - yy;                                   // heat rises: only rows above (and at) the ember wobble
      const m = clamp(above / 40) * (1 - clamp((above - 40) / 520)) + 0.12;
      const dx = amp * m * (Math.sin(yy * 0.071 + t * 7.3) + 0.55 * Math.sin(yy * 0.183 - t * 11.9 + 1.7) + 0.3 * Z.noise1(yy * 0.05 + t * 3, 9));
      ctx.drawImage(shimBuf, 0, yy, 1600, step, x - bx + dx, y - by + yy, 1600, step);
    }
    ctx.restore();
  }
  // glowing ring made of fire (annulus glow + wobbling line + travelling hot spots)
  function fireRing(ctx, x, y, R, I, t, P = P1, o = {}) {
    if (R < 0.5 || I <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const w = (o.w ?? 1) * (22 + 55 * Math.min(1.5, I));
    const r0 = Math.max(0, R - w), r1 = R + w * 1.7, kR = (R - r0) / (r1 - r0);
    let g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    g.addColorStop(0, rgba(P.verm, 0)); g.addColorStop(kR * 0.6, rgba(P.verm, 0.1 * I)); g.addColorStop(kR, rgba(P.sunset, Math.min(0.9, 0.5 * I)));
    g.addColorStop(kR + (1 - kR) * 0.3, rgba(P.verm, 0.16 * I)); g.addColorStop(1, rgba(P.dusk, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.fill();
    const N = Math.max(48, Math.min(220, Math.round(R * 0.9))), wob = (o.wobble ?? 1) * (0.8 + 1.6 * I);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU;
      const rr = R + wob * (1.6 * Math.sin(3 * th + t * 2.1) + 1.1 * Math.sin(7 * th - t * 3.7 + 1.3) + 0.7 * Math.sin(13 * th + t * 6.1 + 0.4));
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(P.glow, Math.min(1, 0.55 * I)); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = rgba(P.hi, Math.min(1, 0.95 * I)); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      const c = t * (0.8 + j * 0.41) * (j % 2 ? -1 : 1) + j * 2.1;
      ctx.beginPath(); ctx.arc(x, y, R, c, c + 0.28 + 0.1 * j); ctx.strokeStyle = rgba(P.core, Math.min(1, 0.55 * I)); ctx.lineWidth = 3.2; ctx.stroke();
    }
    ctx.restore();
  }
  // rising sparks (continuous, closed form)
  function sparks(ctx, t, o) {
    const n = o.n || 10, seed = o.seed || 3, P = o.pal || P1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const life = lerp(o.lifeMin ?? 1.3, o.lifeMax ?? 3.0, Z.rnd(i, seed)), ph = Z.rnd(i, seed + 1) * life;
      const cyc = Math.floor((t + ph) / life), age = t + ph - cyc * life, k = age / life;
      const r = j => Z.rnd(i, cyc, seed + j);
      const vx = (r(2) - 0.5) * (o.vx ?? 50), vy = -(o.rise ?? 1) * (26 + 70 * r(3)), curl = 6 + 20 * r(4), w = 2 + 3 * r(5), sx = (r(6) - 0.5) * (o.spread ?? 20);
      const pos = a => [o.x + sx + vx * a + Math.sin(a * w + r(7) * 6) * curl * a, o.y + vy * a - 9 * a * a];
      const [x1, y1] = pos(age), [x0, y0] = pos(Math.max(0, age - 0.06));
      const al = Math.pow(Math.sin(Math.PI * k), 0.7) * (0.55 + 0.45 * Math.sin(t * 23 + i * 5)) * (o.alpha ?? 1);
      if (al < 0.02) continue;
      ctx.strokeStyle = rgba(P.glow, 0.18 * al); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = rgba(P.hi, al); ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.restore();
  }
  // one radial burst of sparks at te (ballistic with drag), optionally leaving a ring of radius o.ring
  function burst(ctx, t, te, o) {
    const dt = t - te, life = o.life || 1.1; if (dt < 0 || dt > life) return;
    const n = o.n || 24, seed = o.seed || 9, P = o.pal || P1, drag = o.drag ?? 3.2, sp0 = o.speed ?? 900;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Z.rnds(i, seed) * 0.4, sp = sp0 * (0.35 + 0.65 * Z.rnd(i, seed + 1)), li = life * (0.5 + 0.5 * Z.rnd(i, seed + 2));
      if (dt > li) continue;
      const R0 = (o.ring || 0) * (1 + 0.04 * Z.rnds(i, seed + 3));
      const d = s => R0 + sp * (1 - Math.exp(-drag * s)) / drag;
      const px = s => o.x + Math.cos(a) * d(s), py = s => o.y + Math.sin(a) * d(s) + (o.grav ?? 90) * s * s;
      const al = Math.pow(1 - dt / li, 1.4);
      const s0 = Math.max(0, dt - 0.045);
      ctx.strokeStyle = rgba(P.glow, 0.3 * al); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px(s0), py(s0)); ctx.lineTo(px(dt), py(dt)); ctx.stroke();
      ctx.strokeStyle = rgba(P.core, al); ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.restore();
  }
  // glass fracture starting on a ring of radius R0 (cached per seed): straight radial cracks with sharp kinks,
  // short spurs, and concentric connectors between neighbours (spider-web glass). d0 = distance at which a line starts growing.
  const crackSets = new Map();
  function crackSet(seed, n, R0) {
    const key = seed + '|' + n + '|' + R0; let L = crackSets.get(key); if (L) return L;
    const R = Z.rng(seed); L = [];
    const radials = [];
    const along = (pts, d) => { for (let i = 1; i < pts.length; i++) if (pts[i][2] >= d) { const f = (d - pts[i - 1][2]) / (pts[i][2] - pts[i - 1][2]); return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; } return null; };
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + R.range(-0.2, 0.2), len = R() < 0.3 ? R.range(180, 380) : R.range(420, 1150);
      let x = Math.cos(a0) * R0, y = Math.sin(a0) * R0, d = 0; const pts = [[x, y, 0]];
      while (d < len) { const st = R.range(50, 140), a = a0 + R.range(-0.13, 0.13); x += Math.cos(a) * st; y += Math.sin(a) * st; d += st; pts.push([x, y, d]); }
      radials.push(pts); L.push({ pts, len: d, d0: 0, w: R.range(1.0, 2.2) });
      for (let s = 0; s < 2; s++) if (R() < 0.55) {                                // spurs
        const sd = R.range(0.2, 0.8) * d, p = along(pts, sd); if (!p) continue;
        const sa = a0 + R.sign() * R.range(0.45, 1.0), sl = R.range(40, 190);
        const q = [[p[0], p[1], 0], [p[0] + Math.cos(sa) * sl * 0.55, p[1] + Math.sin(sa) * sl * 0.55, sl * 0.55], [p[0] + Math.cos(sa + R.range(-0.2, 0.2)) * sl, p[1] + Math.sin(sa + R.range(-0.2, 0.2)) * sl, sl]];
        L.push({ pts: q, len: sl, d0: sd, w: R.range(0.6, 1.2) });
      }
    }
    for (const ring of [R.range(130, 200), R.range(330, 460), R.range(620, 760)]) {  // concentric connectors
      for (let i = 0; i < n; i++) {
        if (R() < 0.45) continue;
        const pa = along(radials[i], ring * R.range(0.92, 1.08)), pb = along(radials[(i + 1) % n], ring * R.range(0.92, 1.08));
        if (!pa || !pb) continue;
        const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, k = R.range(0.97, 1.06);
        const l1 = Math.hypot(mx * k - pa[0], my * k - pa[1]), l2 = l1 + Math.hypot(pb[0] - mx * k, pb[1] - my * k);
        L.push({ pts: [[pa[0], pa[1], 0], [mx * k, my * k, l1], [pb[0], pb[1], l2]], len: l2, d0: ring * 1.05, w: R.range(0.6, 1.3), conn: true });
      }
    }
    crackSets.set(key, L); return L;
  }
  function drawCracks(ctx, x, y, lines, front, P = P1, o = {}) {
    if (front <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
    const tips = [];
    for (const pass of [{ c: P.sunset, w: 5.5, a: 0.2 }, { c: P.glow, w: 2.2, a: 0.42 }, { c: P.core, w: 0.9, a: 0.95 }]) {
      ctx.strokeStyle = rgba(pass.c, Math.min(1, pass.a * (o.alpha ?? 1)));
      for (const ln of lines) {
        const vis = front - ln.d0; if (vis <= 0) continue;
        ctx.lineWidth = ln.w * pass.w; ctx.beginPath(); ctx.moveTo(ln.pts[0][0], ln.pts[0][1]);
        let ex = ln.pts[0][0], ey = ln.pts[0][1];
        for (let i = 1; i < ln.pts.length; i++) {
          const [xa, ya, da] = ln.pts[i - 1], [xb, yb, db] = ln.pts[i];
          if (db <= vis) { ctx.lineTo(xb, yb); ex = xb; ey = yb; continue; }
          const f = (vis - da) / (db - da); ex = lerp(xa, xb, f); ey = lerp(ya, yb, f); ctx.lineTo(ex, ey); break;
        }
        ctx.stroke();
        if (pass.w === 0.9 && vis < ln.len) tips.push([ex, ey]);
      }
    }
    if (o.tips) for (const [ex, ey] of tips) { const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 7); g.addColorStop(0, rgba(P.core, 0.7 * o.tips)); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.fillRect(ex - 7, ey - 7, 14, 14); }
    ctx.restore();
  }

  // ================================================================== ember scene
  const DEF_STOPS = [[1.75, 1.90], [3.80, 4.25], [4.99, 5.16], [5.90, 6.10]];
  const DEF_FLARES = [[2.40, 2.73], [4.57, 5.60]];
  const inStops = (t, stops) => { for (const [a, b] of stops) if (t >= a && t < b) return true; return false; };

  function emberHud(ctx, S, level, P = P1, alpha = 1) {
    const t = S.t, x = 96, y = H - 108;
    const title = '残光 / ZANKŌ', n = Math.floor(clamp((t - 0.62) * 8.5, 0, 99)), chars = [...title];
    const shown = chars.slice(0, n).join('');
    ctx.save(); ctx.globalAlpha *= alpha;
    const w = hud(ctx, shown, x, y, { size: 22, color: P.glow, alpha: 0.9 });
    const typing = n < chars.length;
    if (t > 0.3 && (typing || Math.floor(t * 2.4) % 2 === 0)) { ctx.fillStyle = rgba(P.glow, 0.85); ctx.fillRect(Math.round(x + w + (n ? 6 : 0)), y - 18, 10, 20); }
    if (t > 1.0) {
      const ca = clamp((t - 1.0) * 4);
      hud(ctx, clockStr(t), x, y + 30, { size: 18, color: P.hi, alpha: 0.55 * ca });
      const on = S.clock.pulse(t, 7);
      ctx.fillStyle = rgba(P.verm, (0.35 + 0.65 * on) * ca); ctx.beginPath(); ctx.arc(x + 172, y + 24, 3.5, 0, TAU); ctx.fill();
      for (let i = 0; i < 12; i++) { const lit = level * 12 > i + 0.5; ctx.fillStyle = rgba(i > 8 ? P.hi : P.glow, (lit ? 0.85 : 0.14) * ca); ctx.fillRect(x + i * 9, y + 44, 6, 6); }
    }
    ctx.restore();
  }
  function voidGlow(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }

  function breathe(ctx, S) {
    const a = S.args, t = S.t, env = S.env;
    D.fill(ctx, '#000');
    const stops = a.stops || DEF_STOPS;
    if (inStops(t, stops)) return;
    const fadeIn = E.inOutSine(inv(0.12, 1.25, t - Math.min(0, S.shot.t0)));
    const breath = 0.5 - 0.5 * Math.cos((t - 0.35) * TAU / 2.8);
    let fl = 0;
    for (const [f0, f1] of a.flares || DEF_FLARES) fl = Math.max(fl, clamp((t - f0) / 0.05) * (t < f1 ? 1 : Math.exp(-(t - f1) * 7)));
    const chop = Z.rnd(Math.floor(t * 16 + 1e-6), 7) > 0.3 ? 1 : 0.35;             // vocal-chop stutter on 16ths
    let relight = 0; for (const [, b] of stops) relight = Math.max(relight, hit(t, b, 14));
    const I = fadeIn * (0.2 + 0.14 * breath + 0.42 * env.mid(t) + 0.45 * env.rms(t) + 0.22 * env.low(t) + 0.2 * env.vocal(t) + 0.85 * fl * chop + 0.5 * relight);
    const x = CX + 3 * Z.noise1(t * 0.7, 21), y = CY + 2.5 * Z.noise1(t * 0.6, 22);
    voidGlow(ctx, CX, CY, 900, '#1a0c1f', 0.55 * fadeIn);
    // a faint thump ring on the first low hit (foreshadows the ignition)
    for (const th of a.thumps || [2.83]) { const dt = t - th; if (dt > 0 && dt < 1.2) { const e = EZ.out(dt / 1.2); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P1.glow, 0.22 * (1 - e) * (1 - e)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 12 + 520 * e, 0, TAU); ctx.stroke(); ctx.restore(); } }
    emberShimmer(ctx, x, y, I, t, { streak: (90 + 260 * env.rms(t)) * fadeIn + 820 * fl * chop + 380 * relight });
    sparks(ctx, t, { x, y: y - 4, n: 9, seed: 4, alpha: clamp(I * 1.3) * fadeIn, spread: 10 });
    for (const [f0] of a.flares || DEF_FLARES) burst(ctx, t, f0, { x, y, n: 16, seed: Math.round(f0 * 10), speed: 420, life: 0.9, grav: -30, drag: 3.5 });
    grain(ctx, t, a.grain ?? 0.07);
    emberHud(ctx, S, clamp(I), P1);
  }

  function ignite(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, env = S.env, P = P1;
    D.fill(ctx, '#000');
    const blackFrom = a.blackFrom ?? lastBeatBefore(S.shot.t1);
    if (t >= blackFrom || inStops(t, a.stops || [])) return;
    const B = beatsFrom(t0, 12).filter(b => b < blackFrom - 0.02);
    const crackAt = a.crackAt ?? 8.44;
    const build = inv(t0, blackFrom, t), rise = inv(crackAt, blackFrom, t);
    const ign = seg(t, t0, 0.6);
    const pulse = S.clock.pulse(t, 9);
    const R = (a.ring ?? 176) * EZ.out(ign) * (1 + 0.14 * E.inQuad(build)) * (1 + 0.03 * pulse);
    const zoom = 1 + 0.09 * E.inQuad(build) + 0.012 * pulse + 0.04 * hit(t, t0, 6);
    const [shx, shy] = D.shake(t, 7 * env.rms(t) * rise + 16 * hit(t, t0, 9), 24, 5);
    const I = 0.55 + 0.3 * env.rms(t) + 0.2 * env.low(t) + 0.9 * hit(t, t0, 4) + 0.3 * pulse + 0.35 * rise;
    voidGlow(ctx, CX, CY, 1100, '#2a0f24', 0.5 + 0.3 * build);
    ctx.save(); ctx.translate(CX + shx, CY + shy); ctx.scale(zoom, zoom); ctx.translate(-CX, -CY);
    // guide rings (sonar) that light up on beats
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1;
    for (const [m, al] of [[1.45, 0.1], [1.95, 0.07], [2.7, 0.05]]) { ctx.strokeStyle = rgba(P.glow, (al + 0.18 * pulse) * EZ.out(seg(t, t0 + 0.15 * m, 0.6))); ctx.beginPath(); ctx.arc(CX, CY, R * m, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // ignition shockwave
    { const dt = t - t0; if (dt >= 0 && dt < 0.9) { const e = EZ.out(dt / 0.9); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P.hi, 0.7 * (1 - e)); ctx.lineWidth = 2 + 10 * (1 - e); ctx.beginPath(); ctx.arc(CX, CY, 40 + 1100 * e, 0, TAU); ctx.stroke(); ctx.restore(); } }
    // beat rings
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const tb of B) { const dt = t - tb; if (dt < 0 || dt > 1.3) continue; const e = EZ.out(dt / 1.3); ctx.strokeStyle = rgba(P.glow, 0.55 * (1 - e) * (1 - e)); ctx.lineWidth = 1 + 2.5 * (1 - e); ctx.beginPath(); ctx.arc(CX, CY, R + 30 + 680 * e, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // cracks, growing in beat-steps from the crack cue
    if (t >= crackAt) {
      const steps = B.filter(b => b >= crackAt - 0.02);
      const lv = [110, 330, 720, 1250];
      let front = 0, snap = 0;
      steps.forEach((tb, i) => { if (t >= tb) { front = lerp(i ? lv[Math.min(i - 1, lv.length - 1)] : 0, lv[Math.min(i, lv.length - 1)], EZ.out(seg(t, tb, 0.16))); snap = Math.max(snap, hit(t, tb, 9)); } });
      front += 45 * (t - crackAt);
      drawCracks(ctx, CX, CY, crackSet(a.seed || 5, 17, Math.round((a.ring ?? 176) * 1.02)), front, P, { alpha: 0.75 + 0.8 * snap, tips: 1 });
    }
    // the ring (born from the ember; the ember core dims once the ring has taken its light)
    const pre = 1 - ign;
    ember(ctx, CX, CY, 0.25 + 0.35 * (1 - ign) + 2.6 * hit(t, t0, 7) + 0.2 * pulse, t, { streak: 1400 * hit(t, t0, 5) });
    fireRing(ctx, CX, CY, R, I * Math.min(1, ign * 4), t, P, { wobble: 0.45 });
    if (pre > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; D.glow(ctx, CX, CY, 260 * pre + 60, P.hi, 0.7 * pre); ctx.restore(); }
    // sparks: ignition burst + one per beat thrown off the ring
    burst(ctx, t, t0, { x: CX, y: CY, ring: 40, n: 48, seed: 61, speed: 1500, life: 1.4, grav: 120 });
    B.forEach((tb, i) => { if (i > 0) burst(ctx, t, tb, { x: CX, y: CY, ring: R, n: 14, seed: 70 + i, speed: 520, life: 0.8, grav: 160 }); });
    sparks(ctx, t, { x: CX, y: CY - R * 0.2, n: 18, seed: 8, spread: R * 1.6, alpha: 0.7, rise: 1.4 });
    ctx.restore();
    grain(ctx, t, a.grain ?? 0.07);
    emberHud(ctx, S, clamp(I * 0.7), P);
  }

  // shot 65: the dawn world implodes into one point of light
  function collapse(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, t1 = a.end ?? S.shot.t1, P = P1;
    D.fill(ctx, '#000');
    const img = Z.imgSync(a.bg || 'assets/bg/bg_crossing_dawn.png');
    const RF = 1150;
    const keys = collapseKeys(a, t0, t1);
    let f = keys[0][1];
    for (let i = 1; i < keys.length; i++) { const [ta, fa] = keys[i - 1], [tb, fb, ez] = keys[i]; if (t >= ta) f = lerp(fa, fb, (EZ[ez] || EZ.out)(seg(t, ta, tb - ta))); }
    if (t >= t1) f = 0;
    const u = clamp((t - t0) / (t1 - t0));
    const R = RF * f;
    const hits = keys.filter(k => k[3]).map(k => k[0]);
    let hf = 0; for (const h of hits) hf = Math.max(hf, hit(t, h, 10));
    const focus = a.focus || [200, 40];           // sun of bg_crossing_dawn relative to frame centre (cover, zoom 1)
    const k = EZ.io(clamp(u / 0.7));
    // the picture shrinks with the iris, but never so much that the visible part of the circle shows its edges
    const fxk = Math.abs(focus[0]) * k, fyk = Math.abs(focus[1]) * k;
    const need = Math.max(Math.min(R, W / 2) / Math.max(1, W / 2 - fxk), Math.min(R, H / 2) / Math.max(1, H / 2 - fyk));
    const sImg = Math.max(Math.pow(Math.max(f, 1e-4), 0.55), need);
    const twist = 2.6 * E.inQuad(clamp((t - keys[2][0]) / (t1 - keys[2][0])));
    if (img && R > 1.5) {
      const view = { zoom: 1, x: 0, y: 0 };
      const N = twist > 0.02 ? 9 : 1;
      for (let j = 0; j < N; j++) {
        const ri = R * j / N, ro = j === N - 1 ? R + 2 : R * (j + 1) / N + 1;
        const rot = twist * Math.pow(1 - (j + 0.5) / N, 2);
        ctx.save();
        ctx.beginPath(); ctx.arc(CX, CY, ro, 0, TAU); if (ri > 0) ctx.arc(CX, CY, ri, 0, TAU, true); ctx.clip();
        ctx.translate(CX, CY); ctx.rotate(rot); ctx.scale(sImg, sImg); ctx.translate(-CX - focus[0] * k, -CY - focus[1] * k);
        D.cover(ctx, img, view);
        ctx.restore();
      }
      // energy condensing: the picture burns toward white as it shrinks
      ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R + 1, 0, TAU); ctx.clip();
      const burn = Math.pow(1 - f, 1.6) * 0.85 + 0.35 * hf;
      const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(2, R));
      g.addColorStop(0, rgba(P.core, Math.min(1, burn * 1.1))); g.addColorStop(0.6, rgba(P.glow, burn * 0.55)); g.addColorStop(1, rgba(P.sunset, burn * 0.35));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(CX - R - 2, CY - R - 2, 2 * R + 4, 2 * R + 4);
      ctx.restore();
    }
    // light streaks sucked inward from the dark
    const sAmt = E.inOutSine(inv(0.12, 0.5, u)) * (1 - inv(0.965, 0.99, u)) * (1.1 + 1.4 * hf);
    inwardStreaks(ctx, t, R, sAmt, { seed: 3, n: 160, twist, speed: 0.8 + 2.2 * u, len: 0.7 + 1.1 * u });
    // inward shock rings on the hits
    for (const h of hits) { const dt = t - h; if (dt >= 0 && dt < 0.35) { const e = EZ.out(dt / 0.35); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(P.hi, 0.6 * (1 - e)); ctx.lineWidth = 2 + 6 * (1 - e); ctx.beginPath(); ctx.arc(CX, CY, R + 30 + 500 * (1 - e), 0, TAU); ctx.stroke(); ctx.restore(); } }
    // the rim of the iris is the ring of fire again (shot 02 in reverse)
    const rimI = clamp(inv(0.95, 0.75, f)) * (0.45 + 0.6 * (1 - f)) + 0.8 * hf;
    if (R > 14) fireRing(ctx, CX, CY, R, rimI, t, P, { w: 0.55 + 0.6 * (1 - f) });
    // … ending on a tiny ember (the same ember as shot 01), with one last heartbeat as it lands
    const land = keys[keys.length - 1][0];
    const eI = clamp(inv(0.2, 0.01, f)) * 0.5 + 0.9 * hit(t, land, 9) * (t >= land ? 1 : 0);
    if (eI > 0.01) ember(ctx, CX, CY, eI, t, { streak: 90 + 900 * hit(t, land, 7) * (t >= land ? 1 : 0) });
    grain(ctx, t, a.grain ?? 0.06);
  }
  const keyCache = new Map();
  function collapseKeys(a, t0, t1) {
    if (a.keys) return a.keys;
    const ck = t0 + '|' + t1; let K = keyCache.get(ck); if (K) return K;
    const b = beatsFrom(t0, 10);
    const hitsT = strongOnsets(b[4] + 0.1, t1 - 0.3, 0.5).slice(0, 3);
    while (hitsT.length < 3) hitsT.push(lerp(b[4], b[7], (hitsT.length + 1) / 4));
    K = [[t0, 1.0], [b[3], 0.86, 'soft'], [b[4] - 0.1, 0.9, 'soft'], [b[4], 0.66, 'out', 1],
      [hitsT[0], 0.5, 'out', 1], [hitsT[1], 0.35, 'out', 1], [hitsT[2], 0.25, 'out', 1], [b[7], 0.15, 'soft', 1], [t1 - 0.17, 0.003, 'in']];
    keyCache.set(ck, K); return K;
  }

  Z.scene('ember', {
    preload: a => (a.mode === 'collapse' ? [a.bg || 'assets/bg/bg_crossing_dawn.png'] : []),
    init: loadFonts,
    draw(ctx, S) {
      const m = S.args.mode || 'breathe';
      if (m === 'ignite') return ignite(ctx, S);
      if (m === 'collapse') return collapse(ctx, S);
      return breathe(ctx, S);
    },
  });

  // ================================================================== title lockup geometry (shared)
  const LK = { x: 960, y: 500, r: 218, gdx: 470, gsize: 400, rubyY: 258, rubySize: 34, subY: 874, subSize: 28 };
  const DEF_RECAP = [
    { bg: 'assets/bg/bg_crossing.png', char: 'assets/char/back_sunset.png', h: 2.1, cy: 1.25 },
    { bg: 'assets/bg/bg_platform.png', char: 'assets/char/sit_knees.png', h: 1.35, cy: 1.02 },
    { bg: 'assets/bg/bg_door.png', view: { zoom: 1.2 } },
    { bg: 'assets/bg/bg_train_night.png', char: 'assets/char/bust_calm.png', h: 1.5, cy: 1.08 },
    { bg: 'assets/bg/bg_wetstreet.png', view: { zoom: 1.15, y: 0.4 } },
    { bg: 'assets/bg/bg_fireflies.png', char: 'assets/char/kneel_pick.png', h: 1.45, cy: 1.05 },
    { bg: 'assets/bg/bg_rooftop.png', char: 'assets/char/turn_smile.png', h: 2.0, cy: 1.3 },
    { bg: 'assets/bg/bg_crossing_night.png', char: 'assets/char/run.png', h: 1.8, cy: 1.15 },
    { bg: 'assets/bg/bg_embankment.png', char: 'assets/char/back_sunset.png', h: 1.7, cy: 1.1 },
    { bg: 'assets/bg/bg_sky.png', char: 'assets/char/lookup_tear.png', h: 1.5, cy: 1.08 },
    { bg: 'assets/bg/bg_classroom.png', view: { zoom: 1.1 } },
    { bg: 'assets/bg/bg_crossing_dawn.png', char: 'assets/char/smile_dawn.png', h: 1.45, cy: 1.06 },
  ];
  const CUES = {
    intro: { sun: 0, hud: 1, hud2: 2, zan: 3, cross: 4, ko: 5, split: 6, neg: 7, sil: 8, lock: 12, exit: 15 },
    outro: { sun: 0, hud: 0, hud2: 1, zan: 2, cross: 3, ko: 4, split: 5, neg: -1, sil: -1, lock: 8, exit: 15 },
  };

  function titlePreload(a) {
    const out = [a.char || 'assets/char/REF_master.png', a.sky || 'assets/bg/bg_sky.png'];
    if (a.variant === 'outro') for (const r of a.recap || DEF_RECAP) { if (r.bg) out.push(r.bg); if (r.char) out.push(r.char); }
    if (a.variant === 'outro') out.push(a.final || 'assets/bg/bg_crossing_dawn.png');
    return out;
  }

  function drawTitle(ctx, S) {
    const a = S.args, outro = a.variant === 'outro', P = outro ? DAWN : P1, t = S.t, t0 = S.shot.t0, env = S.env;
    const cue = Object.assign({}, outro ? CUES.outro : CUES.intro, a.cues || {});
    const B = beatsFrom(t0, 20), at = k => (k < 0 ? 1e9 : B[k]);
    const T = k => t - at(k);                                    // time since cue k
    const pulse = S.clock.pulse(t, 9);
    const tLock = at(cue.lock), tExit = at(cue.exit), tEnd = S.shot.t1;
    const lockK = EZ.io(seg(t, tLock - 0.02, 0.5));
    const exitK = a.exit === false ? 0 : EZ.in(seg(t, tExit + 0.05, tEnd - tExit - 0.05));

    // ---------------- sun
    let sunR = lerp(250, LK.r, lockK);
    const sunIn = seg(t, at(cue.sun), 0.5);
    sunR *= outro ? EZ.out(sunIn) : lerp(176 / 250, 1, EZ.out(sunIn));
    sunR *= 1 + 0.02 * pulse;
    // ping-pong: the sun whips away from each monument, returns home on the split
    const shZ = EZ.whip(seg(t, at(cue.zan) - 0.03, 0.34)), shK = EZ.whip(seg(t, at(cue.ko) - 0.03, 0.34)), home = EZ.io(seg(t, at(cue.split) - 0.04, 0.42));
    const sunX = lerp(LK.x + 330 * shZ - 660 * shK, LK.x, home), sunY = lerp(CY, LK.y, lockK);
    // ---------------- camera: push into the sun during the silhouette build, snap back on the lockup
    const silK = cue.sil >= 0 ? E.inOutSine(seg(t, at(cue.sil), tLock - at(cue.sil))) : 0;
    let zoom = 1 + 0.2 * silK * (1 - lockK) + 0.012 * pulse;
    const slams = [cue.zan, cue.ko].map(at);
    let shake = 0; for (const s of slams) shake += 22 * hit(t, s, 9);
    shake += 10 * hit(t, tLock, 8) + 12 * hit(t, at(cue.sun), 8);
    for (const s of slams) zoom *= 1 - 0.03 * clamp((t - (s - 0.07)) / 0.07) * (t < s ? 1 : 0);   // 2-frame pull-back before each slam
    const [shx, shy] = D.shake(t, shake, 24, 17);

    // ---------------- background
    background(ctx, S, P, outro, sunX, sunY, sunR, pulse);
    ctx.save();
    ctx.translate(sunX + shx, sunY + shy); ctx.scale(zoom, zoom); ctx.translate(-sunX, -sunY);

    // ---------------- measure lines + crossbuck (behind everything)
    measure(ctx, t, at, cue, P, sunX, sunY, sunR, lockK, exitK);
    crossbuck(ctx, t, at(cue.cross), P, sunX, sunY, sunR, lockK, exitK, pulse, B);

    // ---------------- monumental glyphs → lockup
    glyphs(ctx, S, P, at, cue, sunX, sunY, lockK, exitK, outro);

    // ---------------- sun disc (+ silhouette / recap window) and its instruments
    sunGlow(ctx, sunX, sunY, sunR, P, 0.5 + 0.5 * pulse + hit(t, at(cue.sun), 3));
    const Rdisc = sunR * (1 + exitK * 6.5);
    disc(ctx, S, P, outro, sunX, sunY, Rdisc, sunR, at, cue, exitK);
    rings(ctx, t, at, cue, P, sunX, sunY, sunR, pulse, B, lockK, exitK);
    if (outro) recapPanels(ctx, S, P, B, cue, sunX, sunY, exitK);
    // sparks thrown off on the slams and the lockup
    for (const s of [...slams, tLock]) burst(ctx, t, s, { x: sunX, y: sunY, ring: sunR * 1.05, n: 30, seed: Math.round(s * 7), speed: 900, life: 1.0, grav: 80, pal: P });
    burst(ctx, t, at(cue.sun), { x: sunX, y: sunY, ring: sunR, n: 40, seed: 5, speed: 1300, life: 1.2, grav: 60, pal: P });
    D.embers(ctx, t, { n: 26, seed: outro ? 41 : 31, area: [0, H * 0.3, W, H * 1.05], color: P.glow, size: 2.2, rise: 70, alpha: 0.55 * (1 - exitK) });
    ctx.restore();

    // ---------------- lockup small type (screen-fixed, after the camera has snapped home)
    lockupType(ctx, t, tLock, P, 1 - EZ.out(seg(t, tExit, 0.3)), a);
    grain(ctx, t, a.grain ?? 0.07);
    hudCorners(ctx, S, P, at, cue, outro, 1 - exitK);
    // ---------------- accents: flash on the sun cue / slams / lockup, 2-frame negative on cue.neg
    let fl = 0.6 * hit(t, at(cue.sun), 34) + 0.3 * hit(t, slams[0], 40) + 0.3 * hit(t, slams[1], 40) + 0.4 * hit(t, tLock, 30);
    if (fl > 0.01) D.fill(ctx, P.hi, Math.min(0.8, fl), 'lighter');
    if (cue.neg >= 0 && T(cue.neg) >= 0 && T(cue.neg) < 0.07) D.fill(ctx, '#ffffff', 1, 'difference');
    if (!outro && a.exit !== false && exitK > 0) D.fill(ctx, P.hi, 0.9 * Math.pow(exitK, 3), 'source-over');
  }

  function background(ctx, S, P, outro, sx, sy, r, pulse) {
    if (outro) D.vgrad(ctx, [[0, P.void], [0.55, P.ink], [1, '#2a1f4a']]);
    else D.vgrad(ctx, [[0, '#0b0612'], [0.6, P.ink], [1, '#1c0d22']]);
    const R = r * 4.2, g = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, R);
    g.addColorStop(0, rgba(outro ? P.sunset : P.verm, 0.26 + 0.08 * pulse)); g.addColorStop(0.35, rgba(P.dusk, 0.12)); g.addColorStop(1, rgba(P.dusk, 0));
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = outro ? 0.3 : 0.45; ctx.drawImage(paper(), 0, 0);
    ctx.restore();
  }

  function sunGlow(ctx, x, y, r, P, k) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R = r * 2.6, g = ctx.createRadialGradient(x, y, r * 0.9, x, y, R);
    g.addColorStop(0, rgba(P.sunset, 0.34 * k)); g.addColorStop(0.3, rgba(P.verm, 0.12 * k)); g.addColorStop(1, rgba(P.dusk, 0));
    ctx.fillStyle = g; ctx.fillRect(x - R, y - R, 2 * R, 2 * R); ctx.restore();
  }

  function disc(ctx, S, P, outro, x, y, R, r, at, cue, exitK) {
    const t = S.t, a = S.args;
    if (R < 1) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    if (!outro) {
      const g = ctx.createRadialGradient(x - R * 0.15, y - R * 0.3, R * 0.05, x, y, R);
      g.addColorStop(0, P.core); g.addColorStop(0.45, P.hi); g.addColorStop(0.82, P.glow); g.addColorStop(1, P.sunset);
      ctx.fillStyle = g; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
      // silhouette (sky-filled cut-out) rising into the sun
      if (cue.sil >= 0 && t >= at(cue.sil)) {
        const k = EZ.out(seg(t, at(cue.sil), 0.8)), fade = 1 - clamp(exitK * 2.2);
        const charPath = a.char || 'assets/char/REF_master.png', img = Z.imgSync(charPath);
        const cut = skyCutout(charPath, a.sky || 'assets/bg/bg_sky.png', P.dusk);
        if (img && cut && fade > 0) {
          const h = r * 1.86, bottom = y + r * 1.02 + (1 - k) * r * 1.1;
          const tq = Z.quant(t, 12);
          const sway = 0.006 * Math.sin(tq * 1.4);
          const rimC = Z.tinted(img, P.core, 'rimcore' + charPath);
          ctx.globalAlpha = fade * clamp(k * 1.5);
          for (const [dx, dy] of [[-3, -2], [3, -2], [0, -4], [-2, 2], [2, 2]]) D.sprite(ctx, rimC, x + dx, bottom + dy, h, { anchor: [0.46, 1], rot: sway });
          D.sprite(ctx, cut, x, bottom, h, { anchor: [0.46, 1], rot: sway });
          ctx.globalAlpha = 1;
        }
      }
      // faint print screen on the sun
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.1; ctx.drawImage(halftone(P.sunset, 9), 0, 0);
    } else {
      // outro: the sun is a window; each beat shows a recap frame of the film, the last one is the dawn crossing (full-frame cover)
      const rec = a.recap || DEF_RECAP, B = beatsFrom(S.shot.t0, 20);
      let bi = 0; for (let i = 0; i < 20; i++) if (t >= B[i] - 0.02) bi = i;
      const finalBeat = cue.exit;
      const item = bi >= finalBeat ? { bg: a.final || 'assets/bg/bg_crossing_dawn.png', view: { zoom: 1 } } : rec[bi % rec.length];
      const dtb = t - B[bi], bgI = Z.imgSync(item.bg);
      const zin = bi >= finalBeat ? 1 : 1 + 0.07 * (1 - EZ.out(clamp(dtb / 0.46)));
      if (bgI) {
        const v = Object.assign({ zoom: 1 }, item.view || {});
        ctx.save(); ctx.translate(x, y); ctx.scale(zin, zin); ctx.translate(-x, -y);
        if (bi >= finalBeat) D.cover(ctx, bgI, v);
        else { ctx.translate(x - CX, y - CY); D.cover(ctx, bgI, Object.assign({}, v, { zoom: (v.zoom || 1) * 0.75 })); }
        ctx.restore();
      }
      if (item.char && Z.imgSync(item.char)) {
        const ci = Z.imgSync(item.char), hh = r * (item.h || 1.6);
        D.sprite(ctx, ci, x + (item.cx || 0) * r, y + r * (item.cy || 1.05), hh, { anchor: [0.5, 1], t: Z.quant(t, 12), breathe: 1 });
      }
      // dawn wash + per-beat flash inside the window
      if (bi < finalBeat) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba(P.glow, 0.45); ctx.fillRect(x - R, y - R, 2 * R, 2 * R); }
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(P.core, 0.7 * hit(t, B[bi], 20)); ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    ctx.restore();
    // crisp limb
    ctx.save(); ctx.strokeStyle = rgba(P.hi, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function rings(ctx, t, at, cue, P, x, y, r, pulse, B, lockK, exitK) {
    const t0 = at(cue.sun), fade = 1 - exitK;
    if (t < t0 || fade <= 0) return;
    // beat-stepped rotation (clockwork): 7.5° per beat with an outBack snap
    let steps = 0; for (const b of B) if (t >= b) steps += E.outBack(clamp((t - b) / 0.2), 2.2);
    const rotT = steps * (TAU / 48);
    const draw = (i, d) => EZ.out(seg(t, t0 + 0.06 * i + (d || 0), 0.55));
    ctx.save(); ctx.lineCap = 'butt';
    // 1: thin limb echo
    ctx.strokeStyle = rgba(P.hi, 0.55 * fade); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 1.12, -Math.PI / 2, -Math.PI / 2 + TAU * draw(0)); ctx.stroke();
    // 2: vermilion arc (300°) rotating against the ticks
    const a2 = -Math.PI / 2 - rotT * 0.5 - t * 0.25;
    ctx.strokeStyle = rgba(P.verm, 0.95 * fade); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, r * 1.23, a2, a2 + TAU * 0.83 * draw(1)); ctx.stroke();
    ctx.fillStyle = rgba(P.hi, fade); ctx.beginPath(); const ea = a2 + TAU * 0.83 * draw(1); ctx.arc(x + Math.cos(ea) * r * 1.23, y + Math.sin(ea) * r * 1.23, 5, 0, TAU); ctx.fill();
    // 3: tick ring
    const n = 120, dr = draw(2, 0.25);
    ctx.strokeStyle = rgba(P.hi, 0.6 * fade); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < n * dr; i++) {
      const th = rotT + (i / n) * TAU, L = i % 10 === 0 ? 16 : i % 5 === 0 ? 9 : 5, r0 = r * 1.34;
      ctx.moveTo(x + Math.cos(th) * r0, y + Math.sin(th) * r0); ctx.lineTo(x + Math.cos(th) * (r0 + L), y + Math.sin(th) * (r0 + L));
    }
    ctx.stroke();
    // degree labels on the tick ring (every 90°)
    if (dr > 0.99 && lockK < 0.99) for (let q = 0; q < 4; q++) {
      const th = rotT + q * Math.PI / 2, rr = r * 1.34 + 32;
      ctx.save(); ctx.translate(x + Math.cos(th) * rr, y + Math.sin(th) * rr); ctx.rotate(th + Math.PI / 2);
      hud(ctx, pad(q * 90, 3), 0, 5, { size: 13, color: P.hi, alpha: 0.6 * fade * (1 - lockK), align: 'center' }); ctx.restore();
    }
    // 4: progress arc → fills to 360° exactly on the lockup
    if (cue.sil >= 0) {
      const pk = EZ.io(seg(t, at(cue.sil), at(cue.lock) - at(cue.sil)));
      if (pk > 0) { ctx.strokeStyle = rgba(P.glow, 0.9 * fade * (1 - 0.6 * lockK)); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * pk); ctx.stroke(); }
    }
    // 5: big faint orbit + a travelling satellite dot
    ctx.strokeStyle = rgba(P.hi, 0.14 * fade); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 2.35, -Math.PI / 2, -Math.PI / 2 + TAU * draw(4, 0.3)); ctx.stroke();
    const sa = t * 0.9 + rotT; ctx.fillStyle = rgba(P.glow, 0.8 * fade * draw(4, 0.5)); ctx.beginPath(); ctx.arc(x + Math.cos(sa) * r * 2.35, y + Math.sin(sa) * r * 2.35, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // outro: a contact sheet builds around the lockup — one small frame per beat, clockwise on the crossbuck arms
  function recapPanels(ctx, S, P, B, cue, x, y, exitK) {
    const t = S.t, a = S.args, rec = a.recap || DEF_RECAP, n = rec.length;
    const t0 = B[cue.lock]; if (t < t0 - 0.02 || exitK >= 1) return;
    const angs = [-Math.PI + 0.7, -0.7, 0.7, Math.PI - 0.7], d = 575, pw = 232, ph = 130;
    let cur = -1; for (let k = 0; k < cue.exit - cue.lock; k++) if (t >= B[cue.lock + k] - 0.02) cur = k;
    ctx.save(); ctx.globalAlpha *= 1 - exitK;
    for (let slot = 0; slot < 4; slot++) {
      let last = -1; for (let k = slot; k <= cur; k += 4) last = k;       // latest beat that lit this slot
      if (last < 0) continue;
      const tb = B[cue.lock + last], dt = t - tb, lit = last === cur;
      const item = rec[(cue.lock + last + 5) % n], img = Z.imgSync(item.bg);
      const px = x + Math.cos(angs[slot]) * d, py = y + Math.sin(angs[slot]) * d;
      const pop = EZ.out(clamp(dt / 0.28)), s = lerp(0.82, 1, pop) * (lit ? 1 : 0.94);
      ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
      ctx.globalAlpha *= lit ? 1 : 0.42;
      ctx.save(); ctx.beginPath(); ctx.rect(-pw / 2, -ph / 2, pw, ph); ctx.clip();
      if (img) { const sc = Math.max(pw / img.width, ph / img.height) * 1.08; ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc); }
      if (item.char && Z.imgSync(item.char)) D.sprite(ctx, Z.imgSync(item.char), 0, ph / 2 + ph * 0.05, ph * (item.h || 1.6) * 0.62, { anchor: [0.5, 1] });
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(P.core, 0.8 * hit(t, tb, 18)); ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
      ctx.strokeStyle = rgba(P.hi, lit ? 0.95 : 0.6); ctx.lineWidth = 1.5; ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
      const lx = px - pw / 2, ly = py + ph / 2 + 18;
      hud(ctx, `#${pad(((cue.lock + last + 5) % n) + 1)}  ${clockStr(tb).slice(3, 8)}`, lx, ly, { size: 13, color: P.hi, alpha: (lit ? 0.8 : 0.4) * (1 - exitK) });
    }
    ctx.restore();
  }

  function measure(ctx, t, at, cue, P, x, y, r, lockK, exitK) {
    const fade = 1 - exitK; if (fade <= 0) return;
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(P.hi, 0.32 * fade); ctx.fillStyle = rgba(P.hi, 0.32 * fade);
    const gap = r * 1.62;
    // horizontal axis through the sun
    const hx = EZ.out(seg(t, at(cue.sun) + 0.05, 0.7)) * 1100;
    ctx.beginPath(); ctx.moveTo(x - gap, y); ctx.lineTo(x - gap - hx, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + hx, y); ctx.stroke();
    ctx.beginPath();
    for (let d = gap + 24; d < gap + hx; d += 24) { const L = Math.round((d - gap) / 24) % 5 === 0 ? 10 : 4; ctx.moveTo(x - d, y - L); ctx.lineTo(x - d, y); ctx.moveTo(x + d, y - L); ctx.lineTo(x + d, y); }
    ctx.stroke();
    // vertical axis
    const vy = EZ.out(seg(t, at(cue.hud) + 0.02, 0.7)) * 800;
    ctx.beginPath(); ctx.moveTo(x, y - gap); ctx.lineTo(x, y - gap - vy); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + vy); ctx.stroke();
    // frame rules (baseline grid) sliding in from opposite sides
    const fr = EZ.out(seg(t, at(cue.hud2), 0.8));
    ctx.strokeStyle = rgba(P.hi, 0.18 * fade);
    ctx.beginPath(); ctx.moveTo(-400, 132); ctx.lineTo(-400 + (W + 800) * fr, 132); ctx.moveTo(W + 400, H - 132); ctx.lineTo(W + 400 - (W + 800) * fr, H - 132); ctx.stroke();
    ctx.restore();
  }

  // the railway crossbuck ✕ as geometry: two long boards crossing behind the sun, striped like the sign
  // (vermilion / clear instead of yellow / black), drawn on from the centre, flicking a few degrees on beats
  function crossbuck(ctx, t, tc, P, x, y, r, lockK, exitK, pulse, B) {
    if (t < tc) return;
    const k = EZ.out(seg(t, tc, 0.55)), fade = (1 - exitK) * lerp(1, 0.5, lockK);
    let flick = 0; B.forEach((b, i) => { if (b > tc && t >= b) flick += (i % 2 ? 1 : -1) * 0.018 * E.outBack(clamp((t - b) / 0.18), 2) * (1 - lockK); });
    const ang = 0.7 + flick, r0 = r * 1.66, L = 1500 * k, hw = 23, st = 44;
    ctx.save(); ctx.translate(x, y);
    for (const s of [1, -1]) for (const side of [0, 1]) {
      ctx.save(); ctx.rotate(s * ang + side * Math.PI);
      ctx.beginPath(); ctx.rect(r0, -hw, L, 2 * hw); ctx.clip();
      ctx.fillStyle = rgba(P.verm, 0.5 * fade); ctx.beginPath();
      for (let d = r0 - st; d < r0 + L; d += st) { ctx.moveTo(d, hw); ctx.lineTo(d + st * 0.5, hw); ctx.lineTo(d + st * 0.5 + 2 * hw * 0.7, -hw); ctx.lineTo(d + 2 * hw * 0.7, -hw); ctx.closePath(); }
      ctx.fill();
      ctx.strokeStyle = rgba(P.hi, 0.55 * fade); ctx.lineWidth = 1.5; ctx.strokeRect(r0 + 0.75, -hw + 0.75, L - 1.5, 2 * hw - 1.5);
      ctx.restore();
    }
    ctx.restore();
  }

  function glyphs(ctx, S, P, at, cue, x, y, lockK, exitK, outro) {
    const t = S.t, tz = at(cue.zan), tk = at(cue.ko), ts = at(cue.split);
    if (t < tz - 0.001) return;
    const splitK = EZ.io(seg(t, ts - 0.04, 0.42));
    // layout keyframes: mono (solo monument) → split (both, cropped by the frame edges) → lock (lockup)
    const zMono = { x: 560, y: 560, s: 1480 }, kMono = { x: 1380, y: 530, s: 1480 };
    const zSplit = { x: 250, y: 540, s: 940 }, kSplit = { x: 1670, y: 540, s: 940 };
    const zLock = { x: LK.x - LK.gdx, y: LK.y, s: LK.gsize }, kLock = { x: LK.x + LK.gdx, y: LK.y, s: LK.gsize };
    const mix = (A, B2, C, ks, kl) => ({ x: lerp(lerp(A.x, B2.x, ks), C.x, kl), y: lerp(lerp(A.y, B2.y, ks), C.y, kl), s: lerp(lerp(A.s, B2.s, ks), C.s, kl) });
    // beat pushes between split and lock (glyphs breathe apart on each beat)
    const Bs = beatsFrom(S.shot.t0, 20).filter(b => b > ts + 0.1 && b < at(cue.lock) - 0.1);
    let push = 0; for (const b of Bs) push += 14 * EZ.out(seg(t, b, 0.25));
    push *= 1 - lockK;
    const exitOut = EZ.in(seg(t, at(cue.exit), 0.4));
    const [g0, g1] = S.args.glyphs || ['残', '光'];   // the two title glyphs (args.glyphs)
    const showZan = t < tk || splitK > 0;             // 光 replaces 残 until the split
    const list = [];
    // after 光 has slammed, 残 slides back in from beyond the left edge on the split
    if (showZan) { const L = mix(t >= tk ? { x: -620, y: 540, s: 940 } : zMono, zSplit, zLock, splitK, lockK); L.x -= push + exitOut * 900; L.ch = g0; L.dt = t - tz; list.push(L); }
    if (t >= tk) { const L = mix(kMono, kSplit, kLock, splitK, lockK); L.x += push + exitOut * 900; L.ch = g1; L.dt = t - tk; list.push(L); }
    for (const L of list) {
      const sc = slam(L.dt, 1.32);
      const s = L.s * sc;
      const col = lockK;                               // colour moves from vermilion monument to cream title
      if (lockK < 0.999) monument(ctx, L.ch, L.x, L.y, s, P, 1 - col, outro);
      if (lockK > 0.001) {
        const off = 7 * lockK;
        glyph(ctx, L.ch, L.x + off, L.y + off, s, { fill: P.verm, alpha: col });
        glyph(ctx, L.ch, L.x, L.y, s, { fill: P.hi, alpha: col });
      }
    }
  }
  // monumental glyph, printed like a two-colour riso: a glow-coloured plate slightly off-register behind
  // a vermilion plate, with an ink dot screen that deepens toward the bottom
  const MONO_GRAD = { intro: ['#E24A3B', '#C8373A', '#8C2342'], outro: ['#f6b2a6', '#e0707e', '#8a5a98'] };
  function monument(ctx, ch, x, y, s, P, alpha, outro) {
    if (alpha <= 0.001) return;
    const sc = Z.scratch[0], sx = sc.getContext('2d'), G = MONO_GRAD[outro ? 'outro' : 'intro'];
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1; sx.filter = 'none'; sx.clearRect(0, 0, W, H);
    sx.setTransform(ctx.getTransform());
    const off = s * 0.007;
    glyph(sx, ch, x - off, y - off * 0.8, s, { fill: outro ? P.glow : P.sunset });
    glyph(sx, ch, x, y, s, { fill: c => { const g = c.createLinearGradient(0, -520, 0, 520); g.addColorStop(0, G[0]); g.addColorStop(0.5, G[1]); g.addColorStop(1, G[2]); return g; } });
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'source-atop'; sx.globalAlpha = outro ? 0.35 : 0.5; sx.drawImage(halftone(P.ink, 12), 0, 0);
    sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= alpha; ctx.drawImage(sc, 0, 0); ctx.restore();
  }

  function lockupType(ctx, t, tl, P, alpha, a = {}) {
    if (t < tl || alpha <= 0) return;
    const zx = LK.x - LK.gdx, kx = LK.x + LK.gdx;
    ctx.save(); ctx.globalAlpha *= alpha;
    // ruby: one mora at a time, rising into place (args.ruby: the reading of each glyph, centred over it)
    const ruby = [];
    (a.ruby === false ? [] : a.ruby || ['ざん', 'こう']).slice(0, 2).forEach((rd, j) => {
      const chs = [...rd]; chs.forEach((ch, i) => ruby.push([ch, j ? kx : zx, (i - (chs.length - 1) / 2) * 2]));
    });
    ruby.forEach(([ch, base, side], i) => {
      const k = EZ.out(seg(t, tl + 0.12 + i * 0.06, 0.45)); if (k <= 0) return;
      const px = Math.round(base + side * LK.rubySize * 0.62);
      ctx.save(); ctx.globalAlpha *= k; D.font(ctx, LK.rubySize, 'gothic', 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = P.glow; ctx.fillText(ch, px, LK.rubyY + 16 * (1 - k)); ctx.restore();
    });
    // 'afterglow' (args.sub): tracking closes in from wide
    const k2 = EZ.out(seg(t, tl + 0.3, 1.4));
    if (k2 > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(k2 * 2); D.font(ctx, LK.subSize, 'serif', 300); ctx.letterSpacing = (lerp(46, 14, k2)).toFixed(1) + 'px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.hi; ctx.fillText(a.sub ?? 'afterglow', LK.x + lerp(23, 7, k2), LK.subY); ctx.restore();
      // rule + end ticks
      const rk = EZ.out(seg(t, tl + 0.2, 0.8)), rw = 290 * rk;
      ctx.strokeStyle = rgba(P.hi, 0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(LK.x - rw, LK.subY + 34); ctx.lineTo(LK.x + rw, LK.subY + 34);
      ctx.moveTo(LK.x - rw, LK.subY + 28); ctx.lineTo(LK.x - rw, LK.subY + 40); ctx.moveTo(LK.x + rw, LK.subY + 28); ctx.lineTo(LK.x + rw, LK.subY + 40); ctx.stroke();
    }
    // author credit under the rule (Z.CREDIT; nothing when it is empty, like the 9:16 footer)
    const k3 = EZ.out(seg(t, tl + 0.55, 0.9));
    if (k3 > 0 && Z.CREDIT) {
      ctx.save(); ctx.globalAlpha *= clamp(k3 * 1.4) * 0.9; D.font(ctx, 25, 'gothic', 500); ctx.letterSpacing = (lerp(18, 4, k3)).toFixed(1) + 'px';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = P.hi; ctx.fillText(Z.CREDIT, LK.x + 2, LK.subY + 84 + 10 * (1 - k3)); ctx.restore();
    }
    ctx.restore();
  }

  function hudCorners(ctx, S, P, at, cue, outro, alpha) {
    const t = S.t; if (alpha <= 0) return;
    const m = 96, top = 78, bot = H - 70;
    ctx.save(); ctx.globalAlpha *= alpha;
    const t1 = at(cue.hud), t2 = at(cue.hud2);
    // corner strings (args.hud overrides any of them; len = the song length shown before the running clock)
    const HS = Object.assign({ title: '「残光」 ZANKŌ — afterglow', when: outro ? 'DAWN / 夜明け' : 'DUSK / 逢魔が時', bpm: 'BPM 131 · 4/4',
      geo: '35°41′N 139°46′E', place: '踏切 No.7 — 上り', len: '03:44' }, S.args.hud || {});
    hud(ctx, scramble(HS.title, t, t1, 30, 1), m, top, { size: 20, color: P.hi, alpha: 0.8 });
    hud(ctx, scramble(HS.when, t, t1 + 0.12, 30, 2), m, top + 26, { size: 16, color: P.glow, alpha: 0.6 });
    hud(ctx, scramble(HS.bpm, t, t1 + 0.05, 30, 3), W - m, top, { size: 20, color: P.hi, alpha: 0.8, align: 'right' });
    hud(ctx, scramble(`BAR ${pad(Math.max(0, S.clock.bar(t) + 1), 3)} · ${S.clock.inBar(t) + 1}/4`, t, t1 + 0.18, 30, 4), W - m, top + 26, { size: 16, color: P.glow, alpha: 0.6, align: 'right' });
    hud(ctx, scramble(HS.geo, t, t2, 30, 5), m, bot, { size: 18, color: P.hi, alpha: 0.7 });
    hud(ctx, scramble(HS.place, t, t2 + 0.1, 30, 6), m, bot - 26, { size: 16, color: P.glow, alpha: 0.55 });
    hud(ctx, scramble(HS.len + ' / ' + clockStr(t), t, t2 + 0.05, 30, 7), W - m, bot, { size: 18, color: P.hi, alpha: 0.7, align: 'right' });
    hud(ctx, scramble(outro ? 'END TITLE · ' + pad(recapIndex(S) + 1) + '/12' : 'MAIN TITLE', t, t2 + 0.15, 30, 8), W - m, bot - 26, { size: 16, color: P.glow, alpha: 0.55, align: 'right' });
    // crop marks
    const ck = EZ.out(seg(t, t1, 0.5)) * 18;
    ctx.strokeStyle = rgba(P.hi, 0.5); ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[56, 40, 1, 1], [W - 56, 40, -1, 1], [56, H - 40, 1, -1], [W - 56, H - 40, -1, -1]]) { ctx.moveTo(cx + sx * ck, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * ck); }
    ctx.stroke(); ctx.restore();
  }
  const recapIndex = S => { const B = beatsFrom(S.shot.t0, 20); let bi = 0; for (let i = 0; i < 20; i++) if (S.t >= B[i] - 0.02) bi = i; return bi % 12; };

  Z.scene('titleRiff', { preload: titlePreload, init: loadFonts, draw: drawTitle });

  // ================================================================== converge (shot 51): every motif spirals into one point → white
  // light streaks falling inward toward radius R (shared with the collapse)
  function inwardStreaks(ctx, t, R, amt, o = {}) {
    if (amt <= 0.01) return;
    const P = o.pal || P1, n = o.n || 130, seed = o.seed || 3, twist = o.twist || 0, speed = o.speed ?? 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const th = Z.rnd(i, seed) * TAU + twist * 0.35 + t * 0.15;
      const rate = (0.9 + 1.6 * Z.rnd(i, seed + 1)) * speed, fi = Z.fract(t * rate + Z.rnd(i, seed + 2));
      const Rmax = 1250 + 250 * Z.rnd(i, seed + 3);
      const rh = lerp(Rmax, R + 6, E.inCubic(fi)), len = (30 + 260 * fi) * (0.5 + Z.rnd(i, seed + 4)) * (o.len ?? 1);
      const al = amt * Math.sin(Math.PI * fi) * (0.25 + 0.6 * Z.rnd(i, seed + 5));
      const rt = rh + len, dth = 0.05 + 0.1 * twist / 2.6;
      ctx.strokeStyle = rgba(i % 3 ? P.glow : P.hi, Math.min(1, al)); ctx.lineWidth = 0.8 + 1.8 * Z.rnd(i, seed + 6);
      ctx.beginPath(); ctx.moveTo(CX + Math.cos(th) * rh, CY + Math.sin(th) * rh); ctx.lineTo(CX + Math.cos(th - dth) * rt, CY + Math.sin(th - dth) * rt); ctx.stroke();
    }
    ctx.restore();
  }

  function convergeDraw(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, t1 = S.shot.t1, P = P1;
    const whiteAt = a.whiteAt ?? t1;
    const u = clamp((t - t0) / (whiteAt - t0));
    const B = beatsFrom(t0 - 0.05, 8).filter(b => b < whiteAt - 0.05);
    const swirlAt = tt => { let k = 0; for (const b of B) k += 0.42 * EZ.out(seg(tt, b, 0.32)); const uu = clamp((tt - t0) / (whiteAt - t0)); return k + uu * uu * 2.2 + uu * 0.8; };
    const swirl = swirlAt(t);
    const pulse = S.clock.pulse(t, 8);
    const spin = 0.95, seed = a.seed || 7;
    const SQ = 0.9;                                          // slight vertical squash: a vortex seen at an angle
    const spiral = (th0, r) => th0 + spin * Math.log(1400 / (r + 26)) * 1.6 + swirl;
    D.vgrad(ctx, [[0, '#06030a'], [0.5, '#120a1b'], [1, '#08040c']]);
    voidGlow(ctx, CX, CY, 1000, P.shadow, 0.35 + 0.3 * u);
    voidGlow(ctx, CX, CY, 420, P.verm, 0.08 + 0.25 * u * u);
    // vortex arms: wide soft log-spirals that give the space its whirlpool structure
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let j = 0; j < 6; j++) {
      const th0 = (j / 6) * TAU + 0.4;
      ctx.beginPath();
      for (let q = 0; q <= 70; q++) { const r = 1500 * Math.pow(1 - q / 70, 1.4) + 20, th = spiral(th0, r); const px = CX + Math.cos(th) * r, py = CY + Math.sin(th) * r * SQ; q ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = rgba(P.shadow, 0.05 + 0.04 * u); ctx.lineWidth = 90; ctx.stroke();
      ctx.strokeStyle = rgba(P.dusk, 0.035); ctx.lineWidth = 22; ctx.stroke();
    }
    ctx.restore();
    // particle kinematics: log spiral, accelerating inward; arrival times spread toward the end
    const kin = (i, sd, R0min, R0max, arrMin) => {
      const R0 = lerp(R0min, R0max, Z.rnd(i, sd)), th0 = Z.rnd(i, sd + 1) * TAU;
      const s0 = -0.45 + 0.4 * Z.rnd(i, sd + 2), arr = lerp(arrMin, 1.02, Math.pow(Z.rnd(i, sd + 3), 0.6));
      return tt => {
        const uu = clamp((tt - t0) / (whiteAt - t0)), v = clamp((uu - s0) / (arr - s0));
        const r = R0 * (1 - E.inCubic(v) * 0.985) * (1 - 0.3 * v);
        const th = th0 + spin * Math.log(R0 / (r + 26)) * 1.6 + swirlAt(tt);
        return [CX + Math.cos(th) * r, CY + Math.sin(th) * r * SQ, r, v];
      };
    };
    // inward-contracting rings on each beat
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of B) { const dt = t - b; if (dt < 0 || dt > 0.46) continue; const e = E.inCubic(dt / 0.46), rr = 30 + 1150 * (1 - e); ctx.strokeStyle = rgba(P.hi, 0.5 * clamp(dt / 0.05) * (1 - e * 0.6)); ctx.lineWidth = 1.5 + 4 * e; ctx.beginPath(); ctx.ellipse(CX, CY, rr, rr * SQ, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
    inwardStreaks(ctx, t, 30, E.inQuad(inv(0.35, 1, u)) * 0.8, { seed: 13, n: 90, twist: swirl, speed: 0.7 + u });
    // vermilion threads: the ribbon's red line, reeled into the centre
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let j = 0; j < 9; j++) {
      const th0 = (j / 9) * TAU + Z.rnds(j, seed) * 0.3, len = 1000 + 800 * Z.rnd(j, seed + 1);
      const tip = lerp(420 + 520 * Z.rnd(j, seed + 2), 0, E.inQuad(clamp(u * (1.02 + 0.2 * Z.rnd(j, seed + 3)))));
      const pts = [];
      for (let q = 0; q <= 72; q++) {
        const s = q / 72, r = tip + s * len;
        const th = spiral(th0, r) + 0.04 * Math.sin(s * 11 - t * 5 + j) * s;
        pts.push([CX + Math.cos(th) * r, CY + Math.sin(th) * r * SQ, s]);
      }
      for (const [lw, al, col, comp] of [[20, 0.08, P.verm, 'lighter'], [5.5, 0.95, P.verm, 'source-over'], [2, 0.55, P.sunset, 'lighter'], [0.8, 0.45, P.hi, 'lighter']]) {
        ctx.globalCompositeOperation = comp;
        for (let q = 1; q < pts.length; q++) {
          const s = pts[q][2], fa = Math.pow(1 - s, 1.1) * clamp(s * 14);
          if (fa < 0.02) continue;
          ctx.strokeStyle = rgba(col, al * fa); ctx.lineWidth = lw * (1 - 0.55 * s);
          ctx.beginPath(); ctx.moveTo(pts[q - 1][0], pts[q - 1][1]); ctx.lineTo(pts[q][0], pts[q][1]); ctx.stroke();
        }
      }
    }
    ctx.restore();
    // glass shards: flat triangles tumbling on the spiral, glinting when they face the light
    for (let i = 0; i < 34; i++) {
      const [x, y, r, v] = kin(i, seed + 10, 380, 1300, 0.45)(t); if (v >= 1 || r < 22) continue;
      const sz = (22 + 58 * Math.pow(Z.rnd(i, seed + 20), 1.6)) * clamp(r / 260), rot = t * (0.8 + 2.4 * Z.rnd(i, seed + 21)) * (i % 2 ? 1 : -1) + i;
      const face = Math.abs(Math.cos(rot * 0.7)), glint = Math.pow(Math.max(0, Math.sin(rot * 1.7 + i)), 14);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.25 + 0.75 * face);
      const tri = [[0, -sz], [sz * 0.75, sz * 0.55], [-sz * 0.55, sz * 0.35 + sz * 0.3 * Z.rnd(i, 3)]];
      ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath();
      // glass: dark body, warm reflection of the core on one facet, cool rim
      const g = ctx.createLinearGradient(-sz, -sz, sz, sz); g.addColorStop(0, rgba(P.glow, 0.28 + 0.5 * glint)); g.addColorStop(0.45, rgba('#2a1838', 0.35)); g.addColorStop(1, rgba('#7fb4d0', 0.14 + 0.2 * glint));
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(glint > 0.2 ? P.core : '#cfe6f0', 0.4 + 0.6 * glint); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tri[0][0] * 0.6, tri[0][1] * 0.6); ctx.lineTo(tri[1][0] * 0.6, tri[1][1] * 0.6); ctx.strokeStyle = rgba(P.hi, 0.35 * face); ctx.stroke();
      ctx.restore();
      if (glint > 0.25) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = glint * 26; ctx.strokeStyle = rgba(P.core, glint * 0.9); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - gl, y); ctx.lineTo(x + gl, y); ctx.moveTo(x, y - gl * 0.6); ctx.lineTo(x, y + gl * 0.6); ctx.stroke(); ctx.restore(); }
    }
    // fireflies + embers (streaks along their path)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const fire = i < 44, f = kin(i, seed + (fire ? 30 : 50), 250, 1350, 0.3);
      const [x, y, r, v] = f(t); if (v >= 1 || r < 10) continue;
      const [px, py] = f(t - (fire ? 0.02 : 0.035));
      const col = fire ? '#C8F060' : (i % 3 ? P.glow : P.sunset);
      const blink = fire ? 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * (2 + Z.rnd(i, 3)) + i)), 2) : 0.6 + 0.4 * Math.sin(t * 19 + i);
      const al = blink * clamp(r / 100) * (0.75 + 0.4 * u);
      if (fire) {                                  // firefly: soft green bloom + small bright head
        const rr = 10 + 8 * Z.rnd(i, 4), g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, rgba('#F2FFC8', Math.min(1, al))); g.addColorStop(0.25, rgba(col, 0.55 * al)); g.addColorStop(1, rgba('#9BD86A', 0));
        ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
        ctx.strokeStyle = rgba(col, 0.35 * al); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      } else {                                     // ember: orange streak, hot tip
        ctx.strokeStyle = rgba(col, 0.3 * al); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = rgba(col, Math.min(1, 0.9 * al)); ctx.lineWidth = 1.8; ctx.stroke();
        ctx.fillStyle = rgba(P.core, Math.min(1, al)); ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // the point everything falls into
    const coreR = 16 + 80 * u * u + 26 * pulse;
    ember(ctx, CX, CY, 0.8 + 1.8 * u + 0.6 * pulse, t, { streak: 360 + 1500 * u * u });
    D.glow(ctx, CX, CY, coreR * 3.2, P.hi, 0.55 + 0.4 * u);
    grain(ctx, t, a.grain ?? 0.07);
    // white-out
    const wk = E.inExpo(seg(t, whiteAt - 0.34, 0.34));
    if (wk > 0) {
      const R = lerp(coreR, 1200, wk);
      ctx.save(); ctx.fillStyle = rgba('#FFF8EE', Math.min(1, 0.4 + wk)); ctx.beginPath(); ctx.arc(CX, CY, R, 0, TAU); ctx.fill(); ctx.restore();
      D.fill(ctx, '#FFF8EE', E.inQuad(seg(t, whiteAt - 0.12, 0.12)));
    }
    if (t >= whiteAt) D.fill(ctx, '#FFF8EE', 1);
  }
  Z.scene('converge', { init: loadFonts, draw: convergeDraw });

  // ================================================================== afterimage (shot 66): the negative of the title on the retina
  function lockupMask(a) {
    const key = 'mask|' + (a.text || '残光') + '|' + (a.sub || 'afterglow') + '|' + (a.char || '');
    let c = texCache.get(key); if (c) return c;
    c = Z.canvas(W, H); const x = c.getContext('2d');
    const chars = [...(a.text || '残光')];
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(LK.x, LK.y, LK.r, 0, TAU); x.fill();
    const img = Z.imgSync(a.char || 'assets/char/REF_master.png');
    if (img) { x.save(); x.globalCompositeOperation = 'destination-out'; D.sprite(x, img, LK.x, LK.y + LK.r * 1.02, LK.r * 1.86, { anchor: [0.46, 1] }); x.restore(); }
    glyph(x, chars[0], LK.x - LK.gdx, LK.y, LK.gsize, { fill: '#fff' });
    if (chars[1]) glyph(x, chars[1], LK.x + LK.gdx, LK.y, LK.gsize, { fill: '#fff' });
    D.font(x, LK.subSize, 'serif', 300); x.letterSpacing = '14px'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = 0.8;
    x.fillText(a.sub || 'afterglow', LK.x + 7, LK.subY);
    texCache.set(key, c); return c;
  }
  function ghosts(a, color) {
    const key = 'ghost|' + color + '|' + (a.text || '') + (a.sub || '') + (a.char || ''); let G = texCache.get(key); if (G) return G;
    const m = lockupMask(a);
    const sharp = Z.canvas(W, H), sx = sharp.getContext('2d');
    sx.drawImage(m, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = color; sx.fillRect(0, 0, W, H);
    const mid = Z.canvas(W / 2, H / 2), mx = mid.getContext('2d'); mx.filter = 'blur(3px)'; mx.drawImage(sharp, 0, 0, W / 2, H / 2);
    const soft = Z.canvas(W / 4, H / 4), so = soft.getContext('2d'); so.filter = 'blur(6px)'; so.drawImage(sharp, 0, 0, W / 4, H / 4);
    const halo = Z.canvas(W / 8, H / 8), hx = halo.getContext('2d'); hx.filter = 'blur(5px)'; hx.drawImage(sharp, 0, 0, W / 8, H / 8);
    const fringe = Z.canvas(W / 4, H / 4), fx = fringe.getContext('2d'); fx.filter = 'blur(4px)'; fx.drawImage(m, 0, 0, W / 4, H / 4);
    fx.filter = 'none'; fx.globalCompositeOperation = 'source-in'; fx.fillStyle = '#2a62d6'; fx.fillRect(0, 0, W / 4, H / 4);
    G = { sharp, mid, soft, halo, fringe }; texCache.set(key, G); return G;
  }
  function afterDraw(ctx, S) {
    const a = S.args, lt = S.lt, dur = S.dur, t = S.t;
    D.fill(ctx, '#000');
    const color = a.color || CYAN;
    const G = ghosts(a, color);
    // the retina: appears within ~0.2 s, decays, flickers once or twice (blinks), gone by the end
    const rise = EZ.out(seg(lt, 0, 0.22));
    const decay = Math.exp(-lt / 1.25);
    const flick = 1 + 0.12 * Z.noise1(lt * 2.3, 91) - 0.35 * Math.exp(-Math.pow((lt - 1.55) / 0.07, 2));
    const end = 1 - E.inOutSine(seg(lt, dur - 1.0, 0.92));
    const I = rise * decay * flick * end;
    if (I > 0.003) {
      const q = clamp(lt / 2.2);
      const dx = 9 * lt + 3 * Math.sin(lt * 1.3), dy = 5 * lt + 2 * Math.sin(lt * 0.9 + 1), sc = 1 + 0.012 * lt;
      ctx.save(); ctx.translate(CX + dx, CY + dy); ctx.scale(sc, sc); ctx.rotate(0.004 * lt); ctx.translate(-CX, -CY);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, I * 0.5 * (1 - q)); ctx.drawImage(G.fringe, -10, -6, W + 20, H + 12);
      ctx.globalAlpha = Math.min(1, I * 0.3 * (1 - q)); ctx.drawImage(G.sharp, 0, 0);
      ctx.globalAlpha = Math.min(1, I * 0.7); ctx.drawImage(G.mid, 0, 0, W, H);
      ctx.globalAlpha = Math.min(1, I * (0.45 + 0.55 * q)); ctx.drawImage(G.soft, 0, 0, W, H);
      ctx.globalAlpha = Math.min(1, I * 0.55); ctx.drawImage(G.halo, -14, -9, W + 28, H + 18);
      ctx.restore();
    }
    grain(ctx, t, a.grain ?? 0.05);
    // credit line (real text, dim)
    const ck = E.inOutSine(seg(lt, 0.75, 0.8)) * (1 - E.inOutSine(seg(lt, dur - 0.95, 0.75)));
    if (ck > 0.003) {
      ctx.save(); ctx.globalAlpha = 0.78 * ck; D.font(ctx, 24, 'gothic', 400); ctx.letterSpacing = '5px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a9c3cc'; ctx.fillText(a.credit || '「残光」 — MV', CX + 3, H - 96); ctx.restore();
    }
  }
  Z.scene('afterimage', { preload: a => [a.char || 'assets/char/REF_master.png'], init: loadFonts, draw: afterDraw });

  // ================================================================== timeline helpers
  Z.INTRO = {
    LK, beatsFrom, EZ, ember, fireRing,
    // 1 on frames the ember scene renders as pure black (micro-stops, the 溜め before the riff) — use as post.fade for true black
    black(S) {
      const a = S.args || {}, t = S.t;
      if (a.mode === 'ignite') return t >= (a.blackFrom ?? lastBeatBefore(S.shot.t1)) || inStops(t, a.stops || []) ? 1 : 0;
      if (a.mode === 'collapse') return 0;
      return inStops(t, a.stops || DEF_STOPS) ? 1 : 0;
    },
    // grain is 0 because these scenes add their own (the core post grain currently shows vertical banding)
    post: {
      ember: S => {
        const m = S.args.mode, u = clamp((S.t - S.shot.t0) / S.dur);
        return { boil: m === 'collapse' ? 0.4 : 0.5, bloom: m === 'collapse' ? 0.4 : 0.5, bloomThreshold: m === 'collapse' ? 0.78 : 0.5, grain: 0, vignette: m === 'collapse' ? 0.35 : 0.25, lutMix: 0,
          fade: Z.INTRO.black(S), flash: m === 'ignite' ? 0.35 * hit(S.t, S.shot.t0, 14) : 0,
          zoomBlur: m === 'collapse' ? 0.16 * Math.pow(u, 3) : 0, zoomCenter: [0.5, 0.5] };
      },
      titleRiff: S => ({ boil: 0.8, bloom: 0.4, bloomThreshold: 0.9, grain: 0, vignette: 0.28, lutMix: 0, ca: 0.6, beatCA: 1.2 }),
      converge: S => ({ boil: 0.6, bloom: 0.5, bloomThreshold: 0.62, grain: 0, vignette: 0.3, lutMix: 0, zoomBlur: 0.1 * Math.pow(Z.smooth(0.6, 1, S.p), 2), zoomCenter: [0.5, 0.5] }),
      afterimage: S => ({ boil: 0.25, bloom: 0.55, bloomThreshold: 0.35, grain: 0, vignette: 0.15, lutMix: 0 }),
    },
  };
})();
