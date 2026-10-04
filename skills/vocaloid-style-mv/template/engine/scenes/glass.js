/* vocaloid-style-mv scenes: glass — the glass heart and the shattering sky (「砕けた心を / 拾い上げて」).
 *
 *   heart       {mode:'shatter'|'gather'|'burn'|'sun', heart, char, bg, ...}   shots 18 / 19 / 40 / 53 / 54
 *   skyShatter  {bg, char, night, ...}                                          shot 39
 *
 * Everything is a closed-form function of song time t (shards, embers, fireflies, falling sky pieces).
 * The only state is caches of immutable sprites (fractured shard canvases, star field, ground), built lazily on
 * first use and keyed by the args that shape them, plus scratch canvases that are fully redrawn before every use,
 * so any frame renders identically in any order.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const P = {
    ink: '#140B1E', shadow: '#3A1745', dusk: '#7A2350', verm: '#C8373A', sunset: '#F0663A', glow: '#FFA552', hi: '#FFE3B0', hot: '#FFF6E4',
    ff: '#DDFF7A', ffCore: '#F6FFE0', ffHalo: '#9BD86A', starCool: '#BFD4FF',
  };
  const HEART = 'assets/bg/prop_heart.png', KNEEL = 'assets/char/kneel_pick.png', SKY = 'assets/bg/bg_sky.png', BACK = 'assets/char/back_sunset.png';
  const clamp = Z.clamp, lerp = Z.lerp, inv = Z.inv, smooth = Z.smooth;
  const burst = (x, k) => (x <= 0 ? 0 : 1 - Math.exp(-x / k));     // speed ramp: fast pop, then hang (slow motion)
  const decay = (x, k) => (x < 0 ? 0 : Math.exp(-x * k));

  // ---------------------------------------------------------------- beats (the tempo drifts: always read the real beat list)
  function beatIdx(S, t) { const B = S.clock.beats; let lo = 0, hi = B.length; while (lo < hi) { const m = (lo + hi) >> 1; if (B[m] < t - 0.04) lo = m + 1; else hi = m; } return lo; }
  function beatT(S, i) { const B = S.clock.beats; return i < B.length ? B[i] : B[B.length - 1] + (i - B.length + 1) * S.clock.spb; }

  // ---------------------------------------------------------------- geometry
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const bbox = p => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
  const centroid = p => {
    let x = 0, y = 0, s = 0;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], c = a[0] * b[1] - b[0] * a[1]; s += c; x += (a[0] + b[0]) * c; y += (a[1] + b[1]) * c; }
    s *= 3; return Math.abs(s) < 1e-9 ? [p[0][0], p[0][1]] : [x / s, y / s];
  };
  const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

  // Radial glass fracture around an impact point: spokes (long radial cracks) crossed by partial concentric rings,
  // some cells split along a diagonal into sharp triangles. Neighbouring cells share the exact same jagged crack lines.
  // o: { spokes, radii:[0,...], rj (radius jitter), wig (angle jitter), skip(j) (prob. that ring j is missing), split, jag, seg }
  function radialFracture(seed, cx, cy, o) {
    const R = Z.rng(seed), ns = o.spokes, radii = o.radii, nr = radii.length;
    const gaps = []; for (let i = 0; i < ns; i++) gaps.push(R.range(0.45, 1.55));
    const gsum = gaps.reduce((a, b) => a + b, 0), th = []; let acc = R() * TAU;
    for (let i = 0; i < ns; i++) { th.push(acc); acc += (gaps[i] / gsum) * TAU; }
    const V = [];
    for (let i = 0; i < ns; i++) {
      V.push([]);
      for (let j = 0; j < nr; j++) {
        if (radii[j] === 0) { V[i].push([cx, cy]); continue; }
        const r = radii[j] * (1 + R.range(-o.rj, o.rj)), a = th[i] + R.range(-o.wig, o.wig);
        V[i].push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
    }
    const dist = p => Math.hypot(p[0] - cx, p[1] - cy);
    const jagged = (A, B, key) => {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), pts = [A];
      if (len > 2) {
        const n = Math.max(1, Math.round(len / o.seg)), nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len, r = Z.rng(Z.hash(seed, key));
        for (let k = 1; k < n; k++) { const f = (k + r.range(-0.3, 0.3)) / n, off = r.range(-1, 1) * Math.min(len * o.jag, o.jagMax || 10); pts.push([A[0] + (B[0] - A[0]) * f + nx * off, A[1] + (B[1] - A[1]) * f + ny * off]); }
      }
      pts.push(B); return pts;
    };
    const SP = [], RG = [], ringOn = [], edges = [], cells = [];
    for (let i = 0; i < ns; i++) {
      SP.push([]); RG.push([]); ringOn.push([]);
      for (let j = 0; j < nr - 1; j++) SP[i].push(jagged(V[i][j], V[i][j + 1], i * 131 + j));
      for (let j = 0; j < nr; j++) {
        const i2 = (i + 1) % ns;
        ringOn[i].push(j === nr - 1 ? true : j === 0 ? false : R() > o.skip(j));
        RG[i].push(j === 0 ? null : jagged(V[i][j], V[i2][j], 7777 + i * 131 + j));
      }
    }
    const rev = a => a.slice().reverse();
    const addEdge = (pts, d0, kind) => edges.push({ pts, len: plen(pts), d0, kind });
    for (let i = 0; i < ns; i++) for (let j = 0; j < nr - 1; j++) addEdge(SP[i][j], dist(V[i][j]), 'spoke');
    for (let i = 0; i < ns; i++) for (let j = 1; j < nr - 1; j++) if (ringOn[i][j]) {
      const i2 = (i + 1) % ns, fw = R() < 0.5;
      addEdge(fw ? RG[i][j] : rev(RG[i][j]), Math.min(dist(V[i][j]), dist(V[i2][j])) + 6, 'ring');
    }
    const mkPoly = (parts) => {
      const poly = [];
      for (const pts of parts) for (const p of pts) { const q = poly[poly.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) poly.push(p); }
      const f = poly[0], l = poly[poly.length - 1]; if (poly.length > 1 && Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) poly.pop();
      return poly;
    };
    for (let i = 0; i < ns; i++) {
      const i2 = (i + 1) % ns;
      let j = 0;
      while (j < nr - 1) {
        let je = j + 1; while (je < nr - 1 && !ringOn[i][je]) je++;
        const outI = []; for (let k = j; k < je; k++) outI.push(SP[i][k]);
        const backI2 = []; for (let k = je - 1; k >= j; k--) backI2.push(rev(SP[i2][k]));
        const inner = j > 0 ? [rev(RG[i][j])] : [];
        if (je - j === 1 && j >= 1 && R() < o.split) {
          // diagonal split into two sharp pieces
          const flipD = R() < 0.5;
          if (!flipD) {
            const dg = jagged(V[i][j], V[i2][je], 99999 + i * 131 + j);
            addEdge(dg, dist(V[i][j]) + 4, 'diag');
            cells.push({ poly: mkPoly([SP[i][j], RG[i][je], rev(dg)]), ring: j });
            cells.push({ poly: mkPoly([dg, rev(SP[i2][j]), rev(RG[i][j])]), ring: j });
          } else {
            const dg = jagged(V[i2][j], V[i][je], 99999 + i * 131 + j);
            addEdge(dg, dist(V[i2][j]) + 4, 'diag');
            cells.push({ poly: mkPoly([SP[i][j], rev(dg), rev(RG[i][j])]), ring: j });
            cells.push({ poly: mkPoly([dg, RG[i][je], rev(SP[i2][j])]), ring: j });
          }
        } else cells.push({ poly: mkPoly([...outI, RG[i][je], ...backI2, ...inner]), ring: j });
        j = je;
      }
    }
    for (const c of cells) { c.c = centroid(c.poly); c.area = Math.abs(area(c.poly)); }
    return { cells, edges };
  }
  function tracePartial(x, pts, f, len, ox, oy) {
    let rem = f * len; x.moveTo(pts[0][0] - ox, pts[0][1] - oy);
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1], sl = Math.hypot(bx - ax, by - ay);
      if (sl >= rem) { const k = sl > 0 ? rem / sl : 0; x.lineTo(ax + (bx - ax) * k - ox, ay + (by - ay) * k - oy); return; }
      x.lineTo(bx - ox, by - oy); rem -= sl;
    }
  }
  const pathOf = (poly, ox, oy) => { const p = new Path2D(); poly.forEach(([x, y], i) => (i ? p.lineTo(x - ox, y - oy) : p.moveTo(x - ox, y - oy))); p.closePath(); return p; };

  // ---------------------------------------------------------------- shard sprites: textured glass with bevel + bright rim, and variants
  function shardSprites(poly, tex, o) {
    const b = bbox(poly), pad = o.pad ?? 14;
    const ox = Math.floor(b[0] - pad), oy = Math.floor(b[1] - pad), w = Math.max(2, Math.ceil(b[2] + pad) - ox), h = Math.max(2, Math.ceil(b[3] + pad) - oy);
    const path = pathOf(poly, ox, oy);
    const mk = (fn) => { const c = Z.canvas(w, h), x = c.getContext('2d'); x.lineJoin = 'round'; x.lineCap = 'round'; fn(x); if (o.mask) { x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(o.mask, -ox, -oy); } return c; };
    const base = mk(x => {
      x.save(); x.clip(path); x.drawImage(tex, -ox, -oy);
      x.strokeStyle = o.bevel || 'rgba(30,8,24,0.45)'; x.lineWidth = o.bevelW ?? 8; x.stroke(path);
      x.strokeStyle = o.edge || '#FFF3D6'; x.lineWidth = o.edgeW ?? 3; x.stroke(path);
      x.restore();
    });
    const glow = mk(x => {
      x.shadowColor = o.glow; x.shadowBlur = o.glowBlur ?? 12; x.strokeStyle = o.glow; x.lineWidth = o.glowW ?? 4; x.stroke(path);
      x.shadowBlur = 0; x.strokeStyle = o.glowCore || '#FFF1D0'; x.lineWidth = o.coreW ?? 1.4; x.stroke(path);
    });
    const out = { base, glow, ox, oy, w, h };
    if (o.dark) out.dark = mk(x => {                                  // the piece with the light gone out of it (tilted away / fallen into night)
      x.save(); x.clip(path); x.drawImage(tex, -ox, -oy);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = o.dark; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over'; x.strokeStyle = 'rgba(6,8,20,0.45)'; x.lineWidth = 8; x.stroke(path);
      x.strokeStyle = o.darkEdge || '#9FB8E8'; x.lineWidth = 2.4; x.stroke(path);
      x.restore();
    });
    if (o.char) out.char = mk(x => {                                  // burning: ember-glass (the heart's facets glowing like coal)
      x.save(); x.clip(path); x.drawImage(tex, -ox, -oy);
      x.globalCompositeOperation = 'multiply'; x.fillStyle = '#8A2410'; x.fillRect(0, 0, w, h); x.fillStyle = '#9A3A2A'; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(20,4,6,0.6)'; x.lineWidth = 9; x.stroke(path);
      x.strokeStyle = '#FF6A2A'; x.lineWidth = 6; x.stroke(path);
      x.strokeStyle = '#FFE0A0'; x.lineWidth = 2; x.stroke(path);
      x.restore();
    });
    if (o.flame) out.flame = mk(x => {
      x.shadowColor = '#FF3A10'; x.shadowBlur = 16; x.strokeStyle = '#FF5A1F'; x.lineWidth = 6; x.stroke(path);
      x.shadowBlur = 0; x.strokeStyle = '#FFC060'; x.lineWidth = 2; x.stroke(path);
    });
    return out;
  }
  // draw a sprite about its pivot with an in-plane spin and a fake 3D flip (scale across an in-plane axis)
  function drawPiece(ctx, spr, img, x, y, spin, axis, flip, scl, alpha, comp) {
    if (alpha <= 0.004 || !img) return;
    let cf = Math.cos(flip); if (Math.abs(cf) < 0.035) cf = cf < 0 ? -0.035 : 0.035;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(axis); ctx.scale(cf * scl, scl); ctx.rotate(spin - axis);
    if (comp) ctx.globalCompositeOperation = comp;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, spr.ox - spr.px, spr.oy - spr.py);
    ctx.restore();
  }

  // ---------------------------------------------------------------- light helpers
  function sparkle(ctx, x, y, r, a, col = P.hot, rot = 0, halo = true) {
    if (a <= 0.004 || r <= 0.6) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(rot);
    if (halo) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5); g.addColorStop(0, Z.rgba(col, a * 0.8)); g.addColorStop(1, Z.rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(-r * 0.5, -r * 0.5, r, r); }
    const k = r * 0.07, rv = r * 0.72;
    ctx.fillStyle = Z.rgba(col, a);
    ctx.beginPath(); ctx.moveTo(0, -rv); ctx.quadraticCurveTo(k, -k, r, 0); ctx.quadraticCurveTo(k, k, 0, rv); ctx.quadraticCurveTo(-k, k, -r, 0); ctx.quadraticCurveTo(-k, -k, 0, -rv); ctx.fill();
    ctx.restore();
  }
  function ring(ctx, x, y, r, w, col, a) {
    if (a <= 0.004 || r <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = Z.rgba(col, a); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
  }
  // comet trail through a list of points (old -> new), tapering, additive
  function trail(ctx, pts, col, w0, a0, core = P.hot) {
    if (pts.length < 2 || a0 <= 0.004) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const n = pts.length - 1;
    for (let k = 1; k <= n; k++) {
      const f = k / n; ctx.strokeStyle = Z.rgba(col, a0 * f * f); ctx.lineWidth = w0 * (0.25 + 0.75 * f);
      ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
    }
    ctx.strokeStyle = Z.rgba(core, a0 * 0.8); ctx.lineWidth = Math.max(1, w0 * 0.22);
    ctx.beginPath(); ctx.moveTo(pts[Math.floor(n * 0.5)][0], pts[Math.floor(n * 0.5)][1]); for (let k = Math.floor(n * 0.5) + 1; k <= n; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
    ctx.restore();
  }
  // thin crisp sun rays (triangles with a fading gradient), alternating long/short
  function sunRays(ctx, x, y, n, r0, len, col, a, rot, seed) {
    if (a <= 0.004 || len <= 1) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r0 + len); g.addColorStop(0, Z.rgba(col, a)); g.addColorStop(0.3, Z.rgba(col, a * 0.4)); g.addColorStop(1, Z.rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU, L = r0 + len * (i % 2 ? 0.5 : 1) * (0.8 + 0.4 * Z.rnd(i, seed)), wd = (i % 2 ? 0.008 : 0.016) * (0.8 + 0.4 * Z.rnd(i, seed + 1));
      ctx.moveTo(Math.cos(an - wd) * r0, Math.sin(an - wd) * r0); ctx.lineTo(Math.cos(an) * L, Math.sin(an) * L); ctx.lineTo(Math.cos(an + wd) * r0, Math.sin(an + wd) * r0);
    }
    ctx.fill(); ctx.restore();
  }
  // hand-drawn flame tongues rising from a point (on 2s like drawn fire)
  function tongues(ctx, x, y, size, tq, seed, a, n = 3) {
    if (a <= 0.01 || size < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const fx = x + Z.rnds(k, seed) * size * 0.4, fh = size * (0.55 + 0.6 * Z.rnd(k, seed + 1)) * (0.7 + 0.3 * Math.sin(tq * 23 + k * 2.1 + seed));
      const fw = fh * 0.24, sway = Math.sin(tq * 9 + k + seed) * fw * 0.9;
      const g = ctx.createLinearGradient(fx, y, fx, y - fh);
      g.addColorStop(0, Z.rgba('#FFE0A0', a)); g.addColorStop(0.35, Z.rgba('#FF7A2A', a * 0.75)); g.addColorStop(1, Z.rgba('#C8373A', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - fw, y);
      ctx.quadraticCurveTo(fx - fw * 0.9, y - fh * 0.55, fx + sway, y - fh); ctx.quadraticCurveTo(fx + fw * 0.9, y - fh * 0.55, fx + fw, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function vignette(ctx, a, col = '8,4,14') {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${a})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ---------------------------------------------------------------- backdrops (dusk-violet / burning / pre-sun) with a cached screentone falloff
  const htCache = new Map();
  function halftoneLayer(kind, cx, cy) {
    const key = kind + '|' + Math.round(cx) + '|' + Math.round(cy); let c = htCache.get(key); if (c) return c;
    c = Z.canvas(W, H); const x = c.getContext('2d');
    const col = kind === 'burn' ? '#44141A' : kind === 'sun' ? '#2E1020' : '#43205A';
    D.halftone(x, [0, 0, W, H], 12, (px, py) => { const d = Math.hypot((px - cx) / W, (py - cy) / H * 0.8); return smooth(0.3, 0.85, d) * 0.85; }, col);
    htCache.set(key, c); return c;
  }
  const BACK_STOPS = {
    dusk: ['#4E2059', '#2B1239', '#170A22', '#0A0512'],
    burn: ['#5A1A16', '#2E0C10', '#140609', '#060203'],
    sun: ['#3A1020', '#1F0A14', '#0E050A', '#050204'],
  };
  function backdrop(ctx, kind, cx, cy, flash = 0) {
    const K = BACK_STOPS[kind] || BACK_STOPS.dusk;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1300);
    g.addColorStop(0, K[0]); g.addColorStop(0.3, K[1]); g.addColorStop(0.65, K[2]); g.addColorStop(1, K[3]);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5; ctx.drawImage(halftoneLayer(kind, cx, cy), 0, 0);
    // a soft cone of light from above (stage light on the prop)
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, Z.rgba(kind === 'burn' ? '#FF7A4A' : '#C98AE0', 0.07)); lg.addColorStop(1, Z.rgba('#000000', 0));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(cx - 90, 0); ctx.lineTo(cx + 90, 0); ctx.lineTo(cx + 520, H); ctx.lineTo(cx - 520, H); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (flash > 0.003) D.glow(ctx, cx, cy, 1500, kind === 'dusk' ? P.dusk : P.verm, 0.55 * flash);
  }

  // ---------------------------------------------------------------- characters: seam-free wind warp, shading, local light and a crisp directional rim
  const pool = new Map();
  function poolCanvas(slot, w, h) {
    let c = pool.get(slot);
    if (!c || c.width < w || c.height < h) { c = Z.canvas(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0)); pool.set(slot, c); }
    const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none'; x.clearRect(0, 0, w + 2, h + 2);
    return c;
  }
  // horizontal-strip hair-wind warp on INTEGER rows of an identity-transform canvas (no anti-aliased seams between strips)
  function waveInto(x, img, dx, dy, w, h, t, wave) {
    if (!wave || !wave.amp) { x.drawImage(img, dx, dy, w, h); return; }
    const from = wave.from ?? 0.3, amp = wave.amp, fr = wave.freq ?? 2.2, sp = wave.speed ?? 3.2, tt = wave.q ? Z.quant(t, wave.q) : t;
    const rows = Math.max(1, Math.round(h)), band = Math.max(2, Math.round(h / 90));
    for (let r = 0; r < rows; r += band) {
      const r1 = Math.min(rows, r + band), v0 = r / rows, k = clamp((v0 - from) / (1 - from));
      const off = amp * k * k * Math.sin(v0 * fr * TAU - tt * sp) + amp * 0.35 * k * Math.sin(tt * 1.7 + v0 * 3);
      x.drawImage(img, 0, v0 * img.height, img.width, ((r1 - r) / rows) * img.height, dx + off, dy + r, w, r1 - r);
    }
  }
  // o: { t, wave, breathe, alpha, shade:[color,a], sil:color, silDetail:a, light:{x,y,r,a}, rim:{color, offs:[[dx,dy]..], a} }
  function drawFigure(ctx, img, x, y, h, o = {}) {
    const t = o.t || 0, br = 1 + (o.breathe || 0) * 0.012 * Math.sin(t * 2.1);
    const s = h / img.height, w = img.width * s, hh = Math.round(h * br), amp = o.wave && o.wave.amp ? o.wave.amp : 0, pad = 14 + Math.ceil(amp);
    const X0 = Math.floor(x - w / 2 - pad), Y0 = Math.floor(y - hh - pad), cw = Math.ceil(w + 2 * pad) + 2, ch = hh + 2 * pad + 2;
    const dx = x - w / 2 - X0, dy = y - hh - Y0 | 0;
    const A = poolCanvas('figA', cw, ch); waveInto(A.getContext('2d'), img, dx, dy, w, hh, t, o.wave);
    const B = poolCanvas('figB', cw, ch), bx = B.getContext('2d');
    bx.drawImage(A, 0, 0);
    if (o.sil) {
      bx.globalCompositeOperation = 'source-in'; bx.fillStyle = o.sil; bx.fillRect(0, 0, cw, ch);
      if (o.silDetail) { bx.globalCompositeOperation = 'source-atop'; bx.globalAlpha = o.silDetail; bx.drawImage(A, 0, 0); bx.globalAlpha = 1; }
    } else if (o.shade) {
      bx.globalCompositeOperation = 'multiply'; bx.globalAlpha = o.shade[1]; bx.fillStyle = o.shade[0]; bx.fillRect(0, 0, cw, ch);
      bx.globalAlpha = 1; bx.globalCompositeOperation = 'destination-in'; bx.drawImage(A, 0, 0);
    }
    bx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.globalAlpha *= o.alpha ?? 1;
    ctx.drawImage(B, 0, 0, cw, ch, X0, Y0, cw, ch);
    const L = o.light;
    if (L && L.a > 0.01) {
      const C = poolCanvas('figL', cw, ch), cx = C.getContext('2d');
      cx.drawImage(A, 0, 0); cx.globalCompositeOperation = 'destination-in';
      const g = cx.createRadialGradient(L.x - X0, L.y - Y0, 0, L.x - X0, L.y - Y0, L.r), la = Math.min(1, L.a);
      g.addColorStop(0, `rgba(0,0,0,${la})`); g.addColorStop(0.45, `rgba(0,0,0,${la * 0.45})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, cw, ch);
      ctx.drawImage(C, 0, 0, cw, ch, X0, Y0, cw, ch);
    }
    if (o.rim && o.rim.a > 0.01) {
      const R = poolCanvas('figR', cw, ch), rx = R.getContext('2d');
      for (const [ox, oy] of o.rim.offs) rx.drawImage(A, ox, oy);
      rx.globalCompositeOperation = 'source-in'; rx.fillStyle = o.rim.color; rx.fillRect(0, 0, cw, ch);
      rx.globalCompositeOperation = 'destination-out'; rx.drawImage(A, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (o.alpha ?? 1) * Math.min(1, o.rim.a);
      ctx.drawImage(R, 0, 0, cw, ch, X0, Y0, cw, ch);
    }
    ctx.restore();
  }
  // anchor points (image px) of the kneeling pose: glowing shard in the chest hand, the picking hand, shards on the floor
  const POSE = {
    'assets/char/kneel_pick.png': { chest: [515, 512], hand: [283, 1170], floor: [[136, 1090], [80, 1102], [123, 1151], [87, 1170], [360, 1150], [304, 1184], [488, 1214], [225, 1264], [357, 1267], [760, 1170]] },
    'assets/char/alt/kneel_pick.png': { chest: [405, 580], hand: [406, 1188], floor: [[521, 1190], [619, 1214], [272, 1237], [461, 1257], [519, 1280], [365, 1284]] },
  };
  const poseOf = (path, img) => POSE[path] || { chest: [img.width * 0.5, img.height * 0.4], hand: [img.width * 0.35, img.height * 0.85], floor: [] };

  // ================================================================= THE HEART
  const HEART_H = 610;                                    // display height of the heart (px)
  const heartCache = new Map();
  function heartBuild(path) {
    let HB = heartCache.get(path); if (HB) return HB;
    const img = Z.imgSync(path), iw = img.width, ih = img.height, HS = HEART_H / ih;
    const w = Math.round(iw * HS), h = Math.round(ih * HS);
    // split the prop into the heart body and the loose chips around it (alpha connected components, init only)
    const c0 = Z.canvas(iw, ih), x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(img, 0, 0);
    const d = x0.getImageData(0, 0, iw, ih).data, N = iw * ih, lab = new Int32Array(N).fill(-1), stack = new Int32Array(N), comps = [];
    for (let p0 = 0; p0 < N; p0++) {
      if (lab[p0] >= 0 || d[p0 * 4 + 3] < 32) continue;
      const L = comps.length; let sp = 0, cnt = 0, bx0 = iw, by0 = ih, bx1 = 0, by1 = 0;
      stack[sp++] = p0; lab[p0] = L;
      while (sp) {
        const q = stack[--sp], qx = q % iw, qy = (q / iw) | 0; cnt++;
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
        if (qx > 0 && lab[q - 1] < 0 && d[(q - 1) * 4 + 3] >= 32) { lab[q - 1] = L; stack[sp++] = q - 1; }
        if (qx < iw - 1 && lab[q + 1] < 0 && d[(q + 1) * 4 + 3] >= 32) { lab[q + 1] = L; stack[sp++] = q + 1; }
        if (qy > 0 && lab[q - iw] < 0 && d[(q - iw) * 4 + 3] >= 32) { lab[q - iw] = L; stack[sp++] = q - iw; }
        if (qy < ih - 1 && lab[q + iw] < 0 && d[(q + iw) * 4 + 3] >= 32) { lab[q + iw] = L; stack[sp++] = q + iw; }
      }
      comps.push({ L, cnt, bb: [bx0, by0, bx1, by1] });
    }
    const main = comps.reduce((m, c) => (c.cnt > m.cnt ? c : m), comps[0]);
    const bodyD = new ImageData(new Uint8ClampedArray(d), iw, ih);
    for (let p = 0; p < N; p++) if (lab[p] >= 0 && lab[p] !== main.L) bodyD.data[p * 4 + 3] = 0;
    const cb = Z.canvas(iw, ih); cb.getContext('2d').putImageData(bodyD, 0, 0);
    const body = Z.canvas(w, h); body.getContext('2d').drawImage(cb, 0, 0, w, h);
    const hotBody = Z.canvas(w, h); { const x = hotBody.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = '#FF6A4A'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-in'; x.drawImage(body, 0, 0); }
    const alphaAt = (x, y) => { const u = Math.round(x / HS), v = Math.round(y / HS); if (u < 0 || v < 0 || u >= iw || v >= ih) return 0; const q = v * iw + u; return lab[q] === main.L ? d[q * 4 + 3] : 0; };
    const chips = [];
    for (const cp of comps) {
      if (cp === main || cp.cnt < 50) continue;
      const [a0, b0, a1, b1] = cp.bb, pw = a1 - a0 + 5, ph = b1 - b0 + 5, cd = new ImageData(pw, ph);
      for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) {
        const sxp = a0 - 2 + xx, syp = b0 - 2 + yy; if (sxp < 0 || syp < 0 || sxp >= iw || syp >= ih) continue;
        const q = syp * iw + sxp; if (lab[q] !== cp.L) continue; for (let k = 0; k < 4; k++) cd.data[(yy * pw + xx) * 4 + k] = d[q * 4 + k];
      }
      const cc = Z.canvas(pw, ph); cc.getContext('2d').putImageData(cd, 0, 0);
      const cs = Z.canvas(Math.max(2, Math.round(pw * HS)), Math.max(2, Math.round(ph * HS))); cs.getContext('2d').drawImage(cc, 0, 0, cs.width, cs.height);
      chips.push({ img: cs, x: (a0 - 2 + pw / 2) * HS, y: (b0 - 2 + ph / 2) * HS });
    }
    // top contour of the glass (for flames licking up from the burning heart)
    const top = [];
    for (let k = 0; k < 14; k++) { const x = w * (0.1 + 0.8 * (k + 0.5) / 14); for (let y = 0; y < h; y += 3) if (alphaAt(x, y) > 120) { top.push([x, y + 8]); break; } }
    // fracture: radial glass cracks from an impact point just above the glowing core
    const ix = w * 0.5, iy = h * 0.43;
    const fr = radialFracture(1807, ix, iy, { spokes: 14, radii: [0, 26, 62, 112, 172, 244, 330, 440, 600], rj: 0.14, wig: 0.06, skip: j => (j < 3 ? 0.15 : 0.38), split: 0.45, jag: 0.05, jagMax: 6, seg: 20 });
    let Rmax = 1;
    for (const e of fr.edges) {
      const m = e.pts[(e.pts.length / 2) | 0];
      e.inside = alphaAt(m[0], m[1]) > 60 || alphaAt(e.pts[0][0], e.pts[0][1]) > 60;
      if (e.inside) Rmax = Math.max(Rmax, e.d0 + (e.kind === 'spoke' ? e.len * 0.35 : 0));
    }
    // shards: keep the cells that actually cover glass; pivot at their alpha-weighted centroid
    const shards = [], R = Z.rng(2204);
    let Dmax = 1;
    for (const c of fr.cells) {
      const bb = bbox(c.poly); let n = 0, sx = 0, sy = 0;
      for (let y = bb[1]; y <= bb[3]; y += 3) for (let x = bb[0]; x <= bb[2]; x += 3) if (inPoly(x, y, c.poly) && alphaAt(x, y) > 90) { n++; sx += x; sy += y; }
      if (n < 10) continue;
      const px = sx / n, py = sy / n, dx = px - ix, dy = py - iy, dd = Math.hypot(dx, dy) || 1;
      const ang = Math.atan2(dy, dx) + R.range(-0.25, 0.25);
      const spr = shardSprites(c.poly, body, { mask: body, edge: '#FFF1D2', edgeW: 3, bevel: 'rgba(60,12,20,0.4)', bevelW: 7, glow: '#FFA552', glowBlur: 10, glowW: 3.5, pad: 16, char: true, flame: true });
      spr.px = px; spr.py = py;
      Dmax = Math.max(Dmax, dd);
      shards.push({
        spr, px, py, cov: n * 9, dist: dd, dx: Math.cos(ang), dy: Math.sin(ang), rn: R(), size: Math.sqrt(n * 9),
        A: (24 + 0.45 * dd) * R.range(0.75, 1.35), V: (18 + 0.16 * dd) * R.range(0.6, 1.5),
        psA: R.range(-0.9, 0.9), psV: R.range(-0.55, 0.55), axis: R() * Math.PI, phA: R.range(-1.3, 1.3), phV: R.range(-1.7, 1.7),
        z: R.range(-0.18, 0.42), gph: R() * TAU,
      });
    }
    shards.sort((a, b) => a.z - b.z);
    HB = { img, HS, w, h, body, hotBody, chips, fr, Rmax, ix, iy, shards, Dmax, top, crackC: Z.canvas(w + 40, h + 40) };
    heartCache.set(path, HB); return HB;
  }

  // glowing cracks crawling across the intact heart (heart space), clipped to the glass
  function drawHeartCracks(HB, Rf, heat, burn) {
    const c = HB.crackC, x = c.getContext('2d'), pad = 20;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, c.width, c.height);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const passes = burn
      ? [['#FF3A10', 10, 0.25], ['#FF7A2A', 4.2, 0.6], ['#FFE0A0', 1.5, 1]]
      : [['#FF8A3A', 10, 0.14 + 0.12 * heat], ['#FFB060', 4, 0.5], ['#FFF8EC', 1.5, 1]];
    for (const [col, lw, a] of passes) {
      x.strokeStyle = col; x.globalAlpha = a;
      for (let bucket = 0; bucket < 3; bucket++) {                 // wider near the impact, hairlines far out
        x.lineWidth = lw * [1.45, 1.0, 0.7][bucket];
        x.beginPath();
        for (const e of HB.fr.edges) {
          if (!e.inside) continue;
          const bk = e.d0 < HB.Rmax * 0.22 ? 0 : e.d0 < HB.Rmax * 0.5 ? 1 : 2; if (bk !== bucket) continue;
          const f = (Rf - e.d0) / e.len; if (f <= 0) continue;
          tracePartial(x, e.pts, clamp(f), e.len, -pad, -pad);
        }
        x.stroke();
      }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in'; x.drawImage(HB.body, pad, pad);
    return c;
  }

  // shard position in heart space after the break (tau = t - tbreak), closed form
  function shardPos(s, tau, liftPx = 0) {
    const r = s.A * burst(tau, 0.085) + s.V * tau;
    return [s.px + s.dx * r, s.py + s.dy * r + 22 * tau * tau - liftPx];
  }

  // ---------------------------------------------------------------- mode: shatter / burn
  function drawBreak(ctx, S, burn) {
    const a = S.args, t = S.t, t0 = S.shot.t0, tq = S.tq;
    const HB = heartBuild(a.heart || HEART);
    const i0 = beatIdx(S, t0), nB = a.breakBeat ?? (burn ? 1 : 2);
    const tb = a.breakAt ?? beatT(S, i0 + nB);
    const tm = nB >= 2 ? beatT(S, i0 + 1) : t0 + (tb - t0) * 0.45;
    const hx = a.x ?? 960, hy = a.y ?? 470;
    const ox = hx - HB.w / 2, oy = hy - HB.h / 2, ix = ox + HB.ix, iy = oy + HB.iy;
    const tau = t - tb, broken = tau >= 0, impact = broken && tau < 0.067;       // 2 impact frames: shards backlit
    const kind = burn ? 'burn' : 'dusk';
    if (a.bg) { D.cover(ctx, Z.imgSync(a.bg), { zoom: 1.08 }); D.fill(ctx, burn ? '#2a0608' : '#1a0a28', 0.6, 'multiply'); }
    else backdrop(ctx, kind, hx, hy, broken ? decay(tau, 2.6) : 0);
    if (burn) D.embers(ctx, t, { n: 70, seed: 53, area: [0, H * 0.2, W, H + 60], color: '#FF7A2A', rise: 90, size: 2.4, alpha: 0.7 });
    // crack progress: a first crawl from the shot start, a jump on the next beat, completion during the anticipation
    const k1 = E.outExpo(inv(t0 + 0.02, t0 + 0.4, t)), k2 = E.outExpo(inv(tm, tm + 0.3, t)), k3 = E.inQuad(inv(tb - 0.3, tb, t));
    const crackK = clamp((burn ? 0.4 : 0.28) * k1 + (burn ? 0.3 : 0.34) * k2 + (burn ? 0.3 : 0.38) * k3);
    const ant = E.inCubic(inv(tb - 0.3, tb, t));                     // squeeze + tremble before it goes
    const zoom = 1 + 0.05 * E.inOutSine(S.p) + (broken ? 0.045 * decay(tau, 3.5) : 0.012 * ant);
    const amp = broken ? 9 * decay(tau, 7) : 0.6 + 2.4 * decay(t - tm, 12) * (t > tm ? 1 : 0) + 1.5 * decay(t - t0, 12) + 4.5 * ant;
    const [sx, sy] = D.shake(t, amp, 24, 7);
    ctx.save();
    ctx.translate(hx + sx, hy + sy); ctx.scale(zoom, zoom); ctx.translate(-hx, -hy);
    const heat = broken ? 0 : clamp(0.15 + 0.55 * crackK + 0.35 * ant);
    D.glow(ctx, ix, iy, 560 + 220 * heat, burn ? P.verm : P.dusk, 0.28 + 0.3 * heat);
    // measuring ring (the master circle) around the heart: turns on 2s, blown outward by the shockwave
    {
      const ringK = broken ? E.outCubic(inv(0, 0.8, tau)) : 0, rr = 372 + 900 * ringK, ra = (broken ? 0.3 * (1 - ringK) : 0.22) * (burn ? 0.8 : 1);
      if (ra > 0.005) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(ix, iy); ctx.rotate(tq * 0.12);
        ctx.strokeStyle = Z.rgba(burn ? '#FF8A5A' : '#E9B8E6', ra); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0.08, TAU - 0.08); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr + 14, Math.PI * 0.1, Math.PI * 0.62); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr + 14, Math.PI * 1.1, Math.PI * 1.62); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 72; i++) { const an = (i / 72) * TAU, l = i % 6 === 0 ? 14 : 6; ctx.moveTo(Math.cos(an) * (rr - 4), Math.sin(an) * (rr - 4)); ctx.lineTo(Math.cos(an) * (rr - 4 - l), Math.sin(an) * (rr - 4 - l)); }
        ctx.stroke(); ctx.restore();
      }
    }
    // loose chips orbiting the heart (already broken off)
    for (let k = 0; k < HB.chips.length; k++) {
      const c = HB.chips[k], ph = k * 1.9;
      let x = ox + c.x + 6 * Math.sin(tq * 1.3 + ph), y = oy + c.y + 7 * Math.cos(tq * 1.1 + ph), rot = 0.2 * Math.sin(tq * 0.9 + ph);
      if (broken) { const dx = x - ix, dy = y - iy, dd = Math.hypot(dx, dy) || 1, r = 160 * burst(tau, 0.1) + 90 * tau; x += (dx / dd) * r; y += (dy / dd) * r + 20 * tau * tau; rot += 2 * burst(tau, 0.2) * (k % 2 ? 1 : -1); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c.img, -c.img.width / 2, -c.img.height / 2); ctx.restore();
    }
    if (!broken) {
      // ---- the intact heart: bob + slow Y-wobble on 2s, heartbeat on the beat, squeeze before the break
      const wob = 0.15 * Math.sin(tq * 1.6), bob = 7 * Math.sin(tq * 2.1);
      const sc = (1 + 0.02 * S.clock.pulse(t, 9)) * (1 - 0.055 * ant);
      ctx.save();
      ctx.translate(ix, iy + bob); ctx.scale(sc * Math.cos(wob), sc); ctx.translate(-HB.ix, -HB.iy);
      ctx.drawImage(burn ? HB.hotBody : HB.body, 0, 0);
      if (burn) { ctx.globalAlpha = 0.55; ctx.drawImage(HB.body, 0, 0); ctx.globalAlpha = 1; }
      const cc = drawHeartCracks(HB, HB.Rmax * crackK, heat, burn);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(cc, -20, -20); ctx.globalCompositeOperation = 'source-over';
      if (burn) for (let k = 0; k < HB.top.length; k++) { const [fx, fy] = HB.top[k]; tongues(ctx, fx, fy, 40 + 50 * crackK + 20 * Z.rnd(k, 5), tq, k * 3.7, 0.55 + 0.35 * crackK, 2); }
      ctx.restore();
      // light pushing out through the cracks
      D.glow(ctx, ix, iy + bob, 80 + 240 * heat, burn ? '#FF7A3A' : P.hi, 0.1 + 0.4 * heat * heat);
      D.glow(ctx, ix, iy + bob, 28 + 50 * ant, P.hot, 0.2 * heat + 0.6 * ant);
      if (ant > 0.02) sparkle(ctx, ix, iy + bob, 60 + 300 * ant, 0.8 * ant, P.hot, 0.2);
      // sparks spitting off the crack front on the beat hits
      for (const [tt, n] of [[t0 + 0.02, 10], [tm, 16]]) {
        const dt = t - tt; if (dt < 0 || dt > 0.6) continue;
        for (let i = 0; i < n; i++) {
          const an = Z.rnd(i, tt * 100) * TAU, sp = 180 + 420 * Z.rnd(i, 7, tt * 100), r = 60 + sp * burst(dt, 0.18);
          sparkle(ctx, ix + Math.cos(an) * r, iy + Math.sin(an) * r + 90 * dt * dt, 12 * (1 - dt / 0.6), 1 - dt / 0.6, burn ? '#FFB060' : P.hot, an, false);
        }
      }
    } else {
      // ---- the break: flash core, rays, shockwave, shards in slow motion, glitter
      const pul = S.clock.pulse(t, 7);
      D.rays(ctx, ix, iy, 22, 1500, burn ? '#FF7A3A' : P.glow, 0.34 * decay(tau, 2.2) + 0.06 + 0.05 * pul, t, 5);
      D.glow(ctx, ix, iy, 240 + 1100 * burst(tau, 0.16), P.hot, 0.95 * decay(tau, 4.5));
      ring(ctx, ix, iy, 50 + 1250 * E.outCubic(inv(0, 0.75, tau)), 16 * (1 - inv(0, 0.75, tau)) + 1, burn ? '#FFB070' : P.hi, 0.75 * Math.pow(1 - inv(0, 0.75, tau), 1.5));
      ring(ctx, ix, iy, 30 + 700 * E.outCubic(inv(0.05, 0.9, tau)), 3, P.hot, 0.5 * (1 - inv(0.05, 0.9, tau)));
      const lift = burn ? 90 : 0;
      for (const s of HB.shards) {
        const tig = tb + 0.05 + 0.42 * (s.dist / HB.Dmax) + 0.1 * s.rn, b = burn ? clamp((t - tig) / 0.9) : 0;
        const [px, py] = shardPos(s, tau, burn ? lift * Math.pow(Math.max(0, t - tig), 2) : 0);
        const spin = s.psA * burst(tau, 0.12) + s.psV * tau, flip = s.phA * burst(tau, 0.12) + s.phV * tau;
        const scl = (1 + s.z * tau + 0.05 * burst(tau, 0.1)) * (1 - 0.5 * E.inQuad(b));
        const glint = Math.pow(Math.max(0, Math.cos(flip * 2 + s.gph)), 26);
        const X = ox + px, Y = oy + py;
        if (impact) { drawPiece(ctx, s.spr, s.spr.char, X, Y, spin, s.axis, flip, scl, 1); continue; }
        if (tau < 0.2) for (let g = 1; g <= 3; g++) {              // motion smear in the first frames of the burst
          const tg = Math.max(0, tau - g * 0.022), [gx, gy] = shardPos(s, tg);
          drawPiece(ctx, s.spr, s.spr.glow, ox + gx, oy + gy, s.psA * burst(tg, 0.12), s.axis, s.phA * burst(tg, 0.12), 1, 0.35 * (1 - g / 4) * (1 - tau / 0.2), 'lighter');
        }
        const fadeOut = burn ? 1 - smooth(0.8, 1, b) : 1;
        drawPiece(ctx, s.spr, s.spr.base, X, Y, spin, s.axis, flip, scl, (1 - smooth(0.05, 0.45, b)) * fadeOut);
        if (burn && b > 0) {
          drawPiece(ctx, s.spr, s.spr.char, X, Y, spin, s.axis, flip, scl, smooth(0.0, 0.35, b) * fadeOut);
          const fl = 0.65 + 0.35 * Math.sin(tq * 31 + s.rn * 40);
          drawPiece(ctx, s.spr, s.spr.flame, X, Y, spin, s.axis, flip, scl, fl * smooth(0, 0.15, b) * (1 - smooth(0.75, 1, b)) * 1.1, 'lighter');
          tongues(ctx, X, Y - s.size * 0.25 * scl, s.size * 0.9 * scl * (0.6 + 0.8 * Math.sin(Math.PI * Math.min(1, b * 1.2))), tq, s.rn * 50, 0.8 * (1 - smooth(0.7, 1, b)), s.size > 60 ? 3 : 2);
        }
        const ga = (0.45 + 0.55 * decay(tau, 2.4) + 0.25 * pul) * (1 - b) + glint * 0.9;
        drawPiece(ctx, s.spr, s.spr.glow, X, Y, spin, s.axis, flip, scl, ga, 'lighter');
        if (glint > 0.3 && s.size > 45) sparkle(ctx, X + s.dx * 16, Y + s.dy * 16, 26 * glint * scl + 6, glint, P.hot, 0.3);
        if (burn) for (let j = 0; j < 7; j++) {                    // embers peeling off the burning shard
          const tbirth = tig + j * 0.1 + 0.05 * Z.rnd(j, s.rn * 1e3), age = t - tbirth, life = 0.8 + 0.5 * Z.rnd(j, 3, s.rn * 1e3);
          if (age < 0 || age > life) continue;
          const [bx, by] = shardPos(s, tbirth - tb, lift * Math.pow(Math.max(0, tbirth - tig), 2));
          const k = age / life, ex = ox + bx + Math.sin(age * 6 + j * 2 + s.rn * 9) * 22 * k + Z.rnds(j, s.rn * 77) * 30 * k;
          const ey = oy + by - (130 + 90 * Z.rnd(j, 5, s.rn * 1e3)) * age - 60 * age * age;
          D.glow(ctx, ex, ey, 9 + 5 * (1 - k), k < 0.4 ? '#FFD08A' : '#FF6A2A', Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(t * 23 + j)));
        }
      }
      // glitter: glass dust catching the light
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 170; i++) {
        const an = Z.rnd(i, 91) * TAU, A = 90 + 520 * Math.pow(Z.rnd(i, 92), 0.7), V = 15 + 90 * Z.rnd(i, 93);
        const r = A * burst(tau, 0.07) + V * tau, x = ix + Math.cos(an) * r, y = iy + Math.sin(an) * r * 0.9 + 35 * tau * tau - (burn ? 110 * tau * tau : 0);
        const tw = Math.pow(Math.abs(Math.sin(t * (4 + 6 * Z.rnd(i, 94)) + i)), 6), sz = 1 + 2.2 * Z.rnd(i, 95);
        const al = (0.35 + 0.65 * tw) * (0.4 + 0.6 * decay(tau, 1.2));
        ctx.fillStyle = Z.rgba(burn ? (i % 3 ? '#FFB060' : '#FF6A2A') : (i % 4 ? '#FFE3B0' : '#FFFFFF'), al);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        if (tw > 0.85 && i % 3 === 0) sparkle(ctx, x, y, 14 * tw, al, P.hot, 0, false);
      }
      ctx.restore();
      // what remains: the light that was inside the heart
      const orb = 1 - 0.35 * decay(tau, 3);
      D.glow(ctx, ix, iy, (110 + 50 * pul) * orb, burn ? '#FF8A3A' : P.hi, 0.7);
      D.glow(ctx, ix, iy, 34 + 12 * pul, P.hot, 0.9);
      sparkle(ctx, ix, iy, 70 + 60 * pul + 200 * decay(tau, 3), 0.7 + 0.3 * pul, P.hot, 0.785 * Math.min(1, tau * 2));
    }
    ctx.restore();
    if (broken) D.fill(ctx, burn ? '#FF9A5A' : '#FFD9B0', (impact ? 0.5 : 0.3) * decay(tau, 9), 'lighter');
    D.dust(ctx, t, { n: 46, seed: burn ? 44 : 43, color: burn ? 'rgba(255,170,110,0.35)' : 'rgba(255,214,190,0.28)' });
    if (burn) D.embers(ctx, t, { n: 40, seed: 57, area: [0, H * 0.5, W, H + 80], color: '#FF5A1F', rise: 140, size: 3.2, alpha: 0.8, wind: 0.2 });
    vignette(ctx, 0.55);
  }

  // ---------------------------------------------------------------- mode: gather (shards drift back into her hands; optional firefly metamorphosis)
  function gatherPlan(S, HB, K, t0, t1) {
    // the K biggest shards; the biggest ones land on the beats, the rest in between
    const list = HB.shards.slice().sort((a, b) => b.cov - a.cov).slice(0, K);
    const beats = []; for (let i = beatIdx(S, t0 + 0.3); beatT(S, i) < t1 - 0.03; i++) beats.push(beatT(S, i));
    const nb = Math.min(beats.length, list.length), rest = list.length - nb;
    return list.map((s, k) => {
      const R = Z.rng(Z.hash(k, 4411));
      const ta = k < nb ? beats[k] : lerp(t0 + 0.28, t1 - 0.06, (k - nb + 0.15 + 0.7 * R()) / Math.max(1, rest));
      const far = R() < 0.35;
      return { s, k, ta, T: 0.85 + 0.55 * R(), th: k * 2.39996 + R.range(-0.3, 0.3), rho: far ? 780 + 260 * R() : 330 + 330 * R(), far,
        side: R() < 0.5 ? -1 : 1, bend: R.range(0.22, 0.5), sz: R.range(0.9, 1.25), psi0: R.range(-2.5, 2.5), phi0: R() * TAU, phw: R.range(-3, 3), toHand: k % 5 === 3, rn: R() };
    });
  }
  function drawGather(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, t1 = S.shot.t1;
    const cpath = a.char || KNEEL, cimg = Z.imgSync(cpath), pose = poseOf(cpath, cimg);
    const ff = a.firefly ?? /firefl/.test(a.bg || '');
    const HB = heartBuild(a.heart || HEART);
    const chH = a.charH ?? (a.bg ? 900 : 1000), cx = a.charX ?? 960, cy = a.charY ?? (a.bg ? 1090 : 1062), sc = chH / cimg.height;
    const toScr = ([u, v]) => [cx + (u - cimg.width / 2) * sc, cy - (cimg.height - v) * sc];
    const chest = a.target || toScr(pose.chest), hand = toScr(pose.hand);
    if (a.bg) {
      D.cover(ctx, Z.imgSync(a.bg), { zoom: 1.06 + 0.03 * E.inOutSine(S.p), y: 0.15 });
      D.fill(ctx, ff ? '#1b2448' : '#2a1238', 0.45, 'multiply');
      D.vgrad(ctx, [[0, 'rgba(8,10,24,0)'], [0.6, 'rgba(8,10,24,0.12)'], [1, 'rgba(8,10,24,0.6)']]);
    } else backdrop(ctx, 'dusk', chest[0], chest[1], 0);
    if (ff) D.fireflies(ctx, t, { n: 30, seed: 27, area: [0, H * 0.35, W, H], color: P.ff, size: 2.2, alpha: 0.7 });
    const plan = gatherPlan(S, HB, a.n ?? 24, t0, t1);
    const landed = plan.reduce((acc, q) => acc + smooth(q.ta, q.ta + 0.25, t), 0) / plan.length;
    const landPulse = plan.reduce((m, q) => Math.max(m, t >= q.ta ? decay(t - q.ta, 6) * (q.k < 5 ? 1 : 0.5) : 0), 0);
    const zoom = 1 + 0.065 * E.inOutSine(S.p) + 0.006 * S.clock.pulse(t, 8);
    ctx.save();
    ctx.translate(chest[0], chest[1]); ctx.scale(zoom, zoom); ctx.translate(-chest[0], -chest[1]);
    if (!a.bg) {                                                    // floor light pool
      ctx.save(); ctx.translate(cx, cy - 30); ctx.scale(1, 0.16);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 620); g.addColorStop(0, 'rgba(255,165,82,0.28)'); g.addColorStop(0.5, 'rgba(122,35,80,0.18)'); g.addColorStop(1, 'rgba(122,35,80,0)');
      ctx.fillStyle = g; ctx.fillRect(-620, -620, 1240, 1240); ctx.restore();
    }
    const warm = ff ? '#E8FF9A' : P.glow;
    D.glow(ctx, chest[0], chest[1], 420 + 380 * landed, ff ? '#6FA86A' : P.dusk, 0.22 + 0.3 * landed);
    drawFigure(ctx, cimg, cx, cy, chH, {
      t: S.tq, breathe: 0.8, wave: { amp: 6, from: 0.35, q: 12, speed: 2.2 },
      shade: [ff ? '#1A2658' : '#2A1842', ff ? 0.72 : 0.66],
      light: { x: chest[0], y: chest[1], r: 330 + 330 * landed, a: 0.4 + 0.55 * landed },
      rim: ff ? { color: '#FF9A6A', offs: [[-2, -3], [2, -3]], a: 0.55 } : { color: '#D9A2E8', offs: [[0, -3]], a: 0.35 },
    });
    pose.floor.forEach(([u, v], i) => {                             // shards still lying on the floor twinkle
      const [fx, fy] = toScr([u, v]), tw = Math.pow(Math.abs(Math.sin(t * (1.3 + 0.4 * Z.rnd(i, 3)) + i * 1.7)), 14);
      sparkle(ctx, fx, fy, 6 + 16 * tw, 0.2 + 0.7 * tw, ff ? P.ffCore : P.hot, 0.2);
    });
    D.glow(ctx, chest[0], chest[1], 110 + 240 * landed + 60 * landPulse, warm, 0.3 + 0.5 * landed);
    D.glow(ctx, chest[0], chest[1], 24 + 36 * landed + 30 * landPulse, P.hot, 0.45 + 0.45 * landed);
    for (const q of plan) {
      const s = q.s, P1 = q.toHand ? hand : chest;
      const P0 = q.far
        ? [chest[0] + Math.cos(q.th) * q.rho * 1.5, chest[1] + Math.sin(q.th) * q.rho * 0.8]
        : [clamp(chest[0] + Math.cos(q.th) * q.rho * 1.45, 90, W - 90), clamp(chest[1] + Math.sin(q.th) * q.rho * 0.85, 70, H - 230)];
      const mx = (P0[0] + P1[0]) / 2, my = (P0[1] + P1[1]) / 2, L = Math.max(1, Math.hypot(P1[0] - P0[0], P1[1] - P0[1]));
      const Cp = [mx - ((P1[1] - P0[1]) / L) * L * q.bend * q.side, my + ((P1[0] - P0[0]) / L) * L * q.bend * q.side];
      const ts = q.ta - q.T, uRaw = clamp((t - ts) / q.T), u = E.inOutCubic(uRaw);
      const bez = uu => { const m = 1 - uu; return [m * m * P0[0] + 2 * m * uu * Cp[0] + uu * uu * P1[0], m * m * P0[1] + 2 * m * uu * Cp[1] + uu * uu * P1[1]]; };
      const hov = 1 - u, hx = hov * 10 * Math.sin(t * 1.1 + q.k), hy = hov * 12 * Math.cos(t * 0.9 + q.k * 1.3);
      if (t < q.ta) {
        const [x0, y0] = bez(u), x = x0 + hx, y = y0 + hy;
        const scl = lerp(q.sz, 0.28, E.inQuad(u)), spin = q.psi0 * (1 - u) + 0.25 * Math.sin(t * 0.7 + q.k) * hov, flip = q.phi0 + t * q.phw * (1 - u) * 0.35;
        const glint = Math.pow(Math.max(0, Math.cos(flip * 2 + s.gph)), 22);
        const glass = ff ? 1 - smooth(0.2, 0.6, uRaw) : 1, fly = ff ? smooth(0.15, 0.55, uRaw) : 0;
        if (uRaw > 0.01) {                                          // comet trail along the curve
          const tp = []; for (let j = 12; j >= 0; j--) { const uu = E.inOutCubic(Math.max(0, uRaw - j * 0.022)), [bx, by] = bez(uu); tp.push([bx + hx, by + hy]); }
          trail(ctx, tp, ff ? P.ff : P.glow, (ff ? 9 : 7) * (0.6 + 0.4 * scl), 0.55 * Math.min(1, uRaw * 5), ff ? P.ffCore : P.hot);
        }
        if (glass > 0.01) {
          drawPiece(ctx, s.spr, s.spr.base, x, y, spin, s.axis, flip, scl, glass);
          drawPiece(ctx, s.spr, s.spr.glow, x, y, spin, s.axis, flip, scl, glass * (0.45 + 0.55 * u + glint), 'lighter');
          if (glint > 0.5) sparkle(ctx, x, y, 22 * glint * scl + 4, glint * 0.8, P.hot, 0.3);
        }
        if (fly > 0.01) {
          const bl = 0.75 + 0.25 * Math.sin(t * 9 + q.k);
          D.glow(ctx, x, y, 34 * scl + 12, P.ff, fly * 0.55 * bl); D.glow(ctx, x, y, 7, P.ffCore, fly * bl);
        }
      } else if (ff) {
        // after landing the firefly lifts off her hands and circles her, flashing once per bar
        const age = t - q.ta, an = q.th + age * (0.7 + 0.6 * q.rn) * q.side, rad = 26 + 130 * E.outCubic(clamp(age / 1.4));
        const x = P1[0] + Math.cos(an) * rad, y = P1[1] + Math.sin(an) * rad * 0.55 - 70 * age;
        const ph = Z.fract(t / 1.83 + q.rn), bl = 0.35 + 0.65 * Math.exp(-Math.pow(Math.min(ph, 1 - ph) / 0.16, 2));
        D.glow(ctx, x, y, 30, P.ff, 0.5 * bl); D.glow(ctx, x, y, 6, P.ffCore, bl);
      }
      const dl = t - q.ta;                                          // landing spark
      if (dl >= 0 && dl < 0.5) {
        const k = dl / 0.5, big = q.k < 5;
        sparkle(ctx, P1[0], P1[1], (big ? 80 : 40) * E.outBack(Math.min(1, dl / 0.12)) * (1 - k), 1 - k, ff ? P.ffCore : P.hot, 0.785 * (q.k % 2));
        ring(ctx, P1[0], P1[1], 12 + (big ? 90 : 50) * E.outExpo(k), 2.2 * (1 - k), ff ? P.ff : P.hi, 0.8 * (1 - k));
        for (let j = 0; j < 6; j++) {
          const an = (j / 6) * TAU + q.rn * 3, r = 70 * burst(dl, 0.1);
          sparkle(ctx, P1[0] + Math.cos(an) * r, P1[1] + Math.sin(an) * r + 40 * dl * dl, 9 * (1 - k), 1 - k, ff ? P.ff : P.hi, an, false);
        }
      }
    }
    ctx.restore();
    D.dust(ctx, t, { n: 40, seed: 45, color: ff ? 'rgba(220,255,170,0.25)' : 'rgba(255,214,190,0.25)' });
    vignette(ctx, 0.5, ff ? '4,8,18' : '8,4,14');
  }

  // ---------------------------------------------------------------- mode: sun (embers and burning shards spiral together into a reborn sun)
  function drawSun(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, tq = S.tq;
    const HB = heartBuild(a.heart || HEART);
    const cpath = a.char || KNEEL, cimg = Z.imgSync(cpath);
    const tf = a.fuseAt ?? beatT(S, beatIdx(S, t0) + (a.fuseBeat ?? 2));
    const Fx = a.sunX ?? 960, Fy = a.sunY ?? 300, Rs = a.sunR ?? 128;
    const tau = t - tf, born = tau >= 0, bornK = born ? E.outBack(clamp(tau / 0.3), 1.6) : 0;
    const pul = S.clock.pulse(t, 7);
    const gatherK = born ? 1 : E.inCubic(inv(t0 - 0.25, tf, t));
    // the dark, then the whole frame floods with P1 light from the new sun
    backdrop(ctx, 'sun', Fx, Fy, 0);
    const flood = born ? E.outCubic(clamp(tau / 0.5)) : 0.18 * gatherK;
    if (flood > 0.003) {
      const g = ctx.createRadialGradient(Fx, Fy, 0, Fx, Fy, 1650);
      [[0, P.hi], [0.1, P.glow], [0.22, P.sunset], [0.4, P.verm], [0.62, P.dusk], [0.85, P.shadow], [1, P.ink]].forEach(([k, c]) => g.addColorStop(k, c));
      ctx.save(); ctx.globalAlpha = flood; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.3 * flood; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(halftoneLayer('sun', Fx, Fy), 0, 0); ctx.restore();
    }
    const zoom = 1 + 0.035 * E.inOutSine(S.p) + (born ? 0.03 * decay(tau, 4) : 0.015 * gatherK);
    const [sx, sy] = D.shake(t, born ? 8 * decay(tau, 6) : 1 + 3 * gatherK * gatherK, 24, 9);
    ctx.save(); ctx.translate(Fx + sx, Fy + sy + 150); ctx.scale(zoom, zoom); ctx.translate(-Fx, -Fy - 150);
    if (born) {
      // the sun: flat disc, crisp ring, soft halo, fine rays, an anamorphic streak
      const rot = t * 0.04, br = 1 + 0.06 * pul;
      D.rays(ctx, Fx, Fy, 26, 1700, P.glow, 0.1 * flood + 0.05 * pul, t, 13);
      sunRays(ctx, Fx, Fy, 40, Rs * 1.3, 980 * bornK * br, P.hi, 0.42 * flood, rot, 21);
      D.glow(ctx, Fx, Fy, Rs * 4.2 * bornK, P.glow, 0.5);
      D.glow(ctx, Fx, Fy, Rs * 1.9 * bornK, P.hi, 0.45);
      ctx.save(); ctx.translate(Fx, Fy); ctx.scale(1, 0.022); D.glow(ctx, 0, 0, 1500 * bornK, P.hi, 0.55); ctx.restore();
      ring(ctx, Fx, Fy, Rs * 1.2 * bornK * br, 2.2, P.hi, 0.9 * flood);
      ring(ctx, Fx, Fy, Rs * (1.55 + 0.1 * pul) * bornK, 1.2, P.hi, 0.45 * flood);
      D.disc(ctx, Fx, Fy, Rs * bornK, '#FFF3DA', 1);
      ring(ctx, Fx, Fy, Rs + 1400 * E.outCubic(clamp(tau / 0.9)), 14 * (1 - clamp(tau / 0.9)) + 1, P.hot, 0.8 * Math.pow(1 - clamp(tau / 0.9), 1.4));
      ring(ctx, Fx, Fy, Rs + 700 * E.outCubic(clamp((tau - 0.08) / 0.8)), 4, P.hi, 0.5 * (1 - clamp((tau - 0.08) / 0.8)));
    } else {
      // the vortex gathering: a hot core and faint spiral arms
      D.glow(ctx, Fx, Fy, 80 + 300 * gatherK, P.sunset, 0.2 + 0.5 * gatherK);
      D.glow(ctx, Fx, Fy, 16 + 70 * gatherK, P.hot, 0.3 + 0.7 * gatherK * gatherK);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(Fx, Fy); ctx.lineCap = 'round';
      for (let arm = 0; arm < 4; arm++) {
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) { const f = k / 40, r = 40 + 560 * f * (1 - 0.5 * gatherK), an = arm * (TAU / 4) + t * 2.2 + f * 3.4; k ? ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r * 0.82) : ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r * 0.82); }
        ctx.strokeStyle = Z.rgba(P.glow, 0.1 + 0.2 * gatherK); ctx.lineWidth = 2 + 3 * gatherK; ctx.stroke();
      }
      ctx.restore();
      if (gatherK > 0.6) sparkle(ctx, Fx, Fy, 80 + 360 * E.inQuad(inv(0.6, 1, gatherK)), 0.9 * inv(0.6, 1, gatherK), P.hot, 0.3);
    }
    // converging embers + burning shards: spiral in, accelerate, white-hot as they reach the core
    const spiral = (i, lead, r0, th0, dir, tt) => {
      const u = clamp((tt - (t0 - lead)) / (tf - (t0 - lead))), e = E.inCubic(u);
      const r = r0 * (1 - e), th = th0 + dir * (1.5 + 1.2 * Z.rnd(i, 5)) * E.inQuad(u);
      return [Fx + Math.cos(th) * r, Fy + Math.sin(th) * r * 0.82, u];
    };
    if (!born || tau < 0.06) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const lead = 0.1 + 1.0 * Z.rnd(i, 61), r0 = 300 + 820 * Math.sqrt(Z.rnd(i, 62)), th0 = Z.rnd(i, 63) * TAU, dir = i % 2 ? 1 : -1;
        const [x, y, u] = spiral(i, lead, r0, th0, dir, t);
        if (u >= 1) continue;
        const [x2, y2] = spiral(i, lead, r0, th0, dir, t - 0.05);
        const hotK = smooth(0.5, 1, u), col = hotK > 0.5 ? '#FFE9C0' : i % 3 ? '#FFA552' : '#FF6A2A';
        const al = (0.5 + 0.5 * Math.sin(t * 19 + i) ** 2) * (0.55 + 0.45 * u);
        ctx.strokeStyle = Z.rgba(col, al); ctx.lineWidth = 1.4 + 2.2 * Z.rnd(i, 64);
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
        if (i % 5 === 0) D.glow(ctx, x, y, 10 + 8 * Z.rnd(i, 65), col, al * 0.7);
      }
      ctx.restore();
      HB.shards.slice().sort((p, q) => q.cov - p.cov).slice(0, 18).forEach((s, i) => {
        const lead = 0.2 + 0.7 * Z.rnd(i, 71), r0 = 360 + 480 * Z.rnd(i, 72), th0 = Z.rnd(i, 73) * TAU, dir = i % 2 ? 1 : -1;
        const [x, y, u] = spiral(i + 500, lead, r0, th0, dir, t);
        if (u >= 1) return;
        const scl = 0.95 * (1 - 0.8 * E.inQuad(u)), spin = t * (1.2 + Z.rnd(i, 74)) * dir, flip = t * 2.1 + i;
        drawPiece(ctx, s.spr, s.spr.char, x, y, spin, s.axis, flip, scl, 1);
        drawPiece(ctx, s.spr, s.spr.flame, x, y, spin, s.axis, flip, scl, 0.7 + 0.3 * Math.sin(tq * 29 + i * 5), 'lighter');
        tongues(ctx, x, y - s.size * 0.2 * scl, s.size * 0.8 * scl, tq, i * 7.3, 0.7, 2);
      });
    }
    if (born) {                                                     // sparks thrown off the new sun
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 120; i++) {
        const an = Z.rnd(i, 81) * TAU, sp = 260 + 700 * Z.rnd(i, 82), r = Rs * 0.8 + sp * burst(tau, 0.25) + 40 * tau;
        const x = Fx + Math.cos(an) * r, y = Fy + Math.sin(an) * r * 0.9 + 60 * tau * tau, al = decay(tau, 1.1) * (0.5 + 0.5 * Math.sin(t * 21 + i) ** 2);
        const sz = 1.5 + 2.5 * Z.rnd(i, 83);
        ctx.fillStyle = Z.rgba(i % 3 ? P.hi : P.glow, al); ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.restore();
    }
    // her, kneeling beneath it: a silhouette in the vortex light, then lit from above with a hot rim
    const chH = a.charH ?? 580, cx = a.charX ?? 960, cy = a.charY ?? 1100;
    drawFigure(ctx, cimg, cx, cy, chH, {
      t: tq, breathe: 0.6, wave: { amp: born ? 12 : 5, from: 0.35, q: 12, speed: 3 },
      shade: [born ? '#6A2440' : '#2A0E1E', born ? 0.62 : 0.88],
      light: { x: Fx, y: Fy + 60, r: 1000, a: born ? 0.2 + 0.55 * flood : 0.25 * gatherK },
      rim: { color: born ? '#FFE0A8' : '#FF9A5A', offs: [[0, -4], [-3, -3], [3, -3]], a: born ? 1 : 0.2 + 0.6 * gatherK },
    });
    ctx.restore();
    if (born) D.fill(ctx, '#FFE7C4', 0.55 * decay(tau, 8), 'lighter');
    D.embers(ctx, t, { n: 70, seed: 58, area: [0, H * 0.3, W, H + 80], color: '#FF7A2A', rise: 120, size: 2.8, alpha: born ? 0.9 : 0.5, wind: 0.1 });
    vignette(ctx, born ? 0.45 : 0.6, '14,4,8');
  }

  Z.scene('heart', {
    preload: a => [a.heart || HEART, a.bg, (a.mode === 'gather' || a.mode === 'sun') ? (a.char || KNEEL) : null].filter(Boolean),
    draw(ctx, S) {
      const m = S.args.mode || 'shatter';
      if (m === 'gather') drawGather(ctx, S);
      else if (m === 'sun') drawSun(ctx, S);
      else drawBreak(ctx, S, m === 'burn');
    },
  });

  // ================================================================= THE SKY BREAKS
  const SM = 140, SW = W + 2 * SM, SH = H + 2 * SM;       // sky space = frame + margin (the camera moves)
  const skyCache = new Map();
  function skyBuild(bgPath, seed, ix, iy, night) {
    const key = [bgPath, seed, ix, iy, night].join('|'); let SB = skyCache.get(key); if (SB) return SB;
    const img = Z.imgSync(bgPath);
    const tex = Z.canvas(SW, SH), tx = tex.getContext('2d'), s = Math.max(SW / img.width, SH / img.height);
    tx.drawImage(img, (SW - img.width * s) / 2, (SH - img.height * s) / 2, img.width * s, img.height * s);
    const cx = ix + SM, cy = iy + SM;
    const fr = radialFracture(seed, cx, cy, { spokes: 17, radii: [0, 60, 150, 270, 430, 630, 880, 1190, 1560, 2050, 2700], rj: 0.12, wig: 0.05, skip: j => (j < 3 ? 0.1 : 0.3), split: 0.42, jag: 0.035, jagMax: 12, seg: 34 });
    const R = Z.rng(seed + 5);
    const inFrame = c => { const b = bbox(c.poly); return b[2] > 0 && b[0] < SW && b[3] > 0 && b[1] < SH; };
    const cells = fr.cells.filter(c => c.area > 300 && inFrame(c));
    let maxD = 1; for (const c of cells) maxD = Math.max(maxD, Math.hypot(c.c[0] - cx, c.c[1] - cy));
    const pieces = [];
    for (const c of cells) {
      const dx = c.c[0] - cx, dy = c.c[1] - cy, dd = Math.hypot(dx, dy) || 1, near = 1 - dd / maxD;
      const spr = shardSprites(c.poly, tex, {
        edge: '#FFE9C8', edgeW: 2.2, bevel: 'rgba(20,6,26,0.5)', bevelW: 8, glow: near > 0.6 ? '#FFB060' : '#FF8A48', glowBlur: 10 + 6 * near, glowW: 2 + 1.6 * near, glowCore: '#FFEFD8', coreW: 1 + 0.4 * near,
        pad: 22, dark: '#6A78B8', darkEdge: '#B8CCF4',
      });
      spr.px = c.c[0]; spr.py = c.c[1];
      const size = Math.sqrt(c.area);
      pieces.push({
        spr, x: c.c[0], y: c.c[1], ring: c.ring, dist: dd, near, dx: dx / dd, dy: dy / dd, ang: Math.atan2(dy, dx), size,
        g: 1500 / Math.sqrt(Math.max(1, size / 100)) * R.range(0.85, 1.15), vx: R.range(15, 60), vy: R.range(-30, 5), psV: R.range(-0.18, 0.18), psA: R.range(-0.35, 0.35),
        axis: R() * Math.PI, phV: R.range(0.6, 1.5) * (R() < 0.5 ? -1 : 1), gph: R() * TAU, jit: R(), fg: false, zv: R.range(0.03, 0.14),
      });
    }
    // a few big upper pieces tumble toward the lens instead of away
    pieces.filter(p => p.y < SM + H * 0.5 && p.y > SM + 60 && p.size > 230 && p.near < 0.7).sort((p, q) => q.size - p.size).slice(0, 3).forEach(p => { p.fg = true; p.zv = 0.5 + 0.25 * p.jit; });
    // night behind: gradient, milky way, stars, and a last line of afterglow on the horizon (残光)
    const nc = Z.canvas(SW, SH), nx = nc.getContext('2d'), RS = Z.rng(seed + 9);
    const gg = nx.createLinearGradient(0, 0, 0, SH);
    gg.addColorStop(0, night); gg.addColorStop(0.55, '#0B1430'); gg.addColorStop(0.8, '#1A1E45'); gg.addColorStop(0.9, '#3A1D4A'); gg.addColorStop(1, '#6A2644');
    nx.fillStyle = gg; nx.fillRect(0, 0, SW, SH);
    const curve = u => [lerp(-200, SW + 200, u), lerp(SH * 0.78, -80, u) + 130 * Math.sin(u * 2.8 + 0.3)];
    nx.save(); nx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 110; i++) {                          // soft band built from overlapping clouds of light
      const u = RS(), [bx, by] = curve(u), off = (RS() - 0.5) * 260, r = 70 + 190 * RS(), px = bx + 0.55 * off, py = by + 0.83 * off;
      const g = nx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${110 + 60 * RS() | 0},${120 + 40 * RS() | 0},215,${0.035 + 0.05 * RS()})`); g.addColorStop(1, 'rgba(90,100,200,0)');
      nx.fillStyle = g; nx.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 6000; i++) {                         // star dust in the band
      const u = RS(), gs = (RS() + RS() + RS() - 1.5) * 150, [bx, by] = curve(u), x = bx + 0.55 * gs, y = by + 0.83 * gs, a = (0.05 + 0.22 * RS()) * (1 - Math.abs(gs) / 230);
      nx.fillStyle = `rgba(${210 + 45 * RS() | 0},${210 + 40 * RS() | 0},255,${Math.max(0, a)})`; nx.fillRect(x, y, 1.3, 1.3);
    }
    nx.restore();
    nx.save(); nx.filter = 'blur(10px)'; nx.strokeStyle = 'rgba(4,6,16,0.5)'; nx.lineWidth = 26; nx.beginPath();
    for (let k = 0; k <= 50; k++) { const u = k / 50, [bx, by] = curve(u), o2 = 45 * Z.fbm1(u * 7, 3); k ? nx.lineTo(bx + o2 * 0.55, by + o2 * 0.83) : nx.moveTo(bx + o2 * 0.55, by + o2 * 0.83); }
    nx.stroke(); nx.restore();
    for (let i = 0; i < 1600; i++) {
      const x = RS() * SW, y = RS() * SH * 0.9, m = Math.pow(RS(), 3), r = 0.5 + 1.3 * m, c = RS();
      nx.fillStyle = c < 0.2 ? `rgba(255,220,190,${0.3 + 0.7 * m})` : c < 0.45 ? `rgba(190,210,255,${0.3 + 0.7 * m})` : `rgba(240,244,255,${0.25 + 0.75 * m})`;
      nx.beginPath(); nx.arc(x, y, r, 0, TAU); nx.fill();
    }
    const stars = [];
    for (let i = 0; i < 55; i++) stars.push({ x: RS() * SW, y: RS() * SH * 0.8, r: 5 + 15 * Math.pow(RS(), 2.2), f: 0.8 + 2.4 * RS(), ph: RS() * TAU, cool: RS() < 0.7 });
    // ground silhouette: embankment, grass blades, a lone utility pole with wires running out of frame
    const gc = Z.canvas(SW, SH + 200), gx = gc.getContext('2d');
    const gy = x => SM + 1004 - 34 * ((x - SM) / W - 0.5) + 12 * Z.fbm1((x - SM) / 230, 6) - 20 * Math.exp(-Math.pow((x - SM - 380) / 260, 2));
    gx.beginPath(); gx.moveTo(0, gy(0));
    for (let x = 0; x <= gc.width; x += 6) gx.lineTo(x, gy(x));
    gx.lineTo(gc.width, gc.height); gx.lineTo(0, gc.height); gx.closePath();
    gx.fillStyle = '#07050D'; gx.fill();
    gx.strokeStyle = 'rgba(130,110,170,0.45)'; gx.lineWidth = 1.4; gx.stroke();
    gx.fillStyle = '#07050D';
    for (let x = 0; x <= gc.width; x += 3) {
      if (Z.rnd(x, 3) > 0.42) continue;
      const hgt = 3 + 15 * Math.pow(Z.rnd(x, 4), 2), lean = Z.rnds(x, 5) * 6, y0 = gy(x) + 2;
      gx.beginPath(); gx.moveTo(x - 1.6, y0); gx.quadraticCurveTo(x + lean * 0.3, y0 - hgt * 0.6, x + lean, y0 - hgt); gx.quadraticCurveTo(x + lean * 0.3 + 0.8, y0 - hgt * 0.5, x + 1.6, y0); gx.fill();
    }
    const px = SM + 250, pTop = SM + 560;
    gx.beginPath(); gx.moveTo(px - 7, gy(px) + 4); gx.lineTo(px - 4, pTop); gx.lineTo(px + 4, pTop); gx.lineTo(px + 7, gy(px) + 4); gx.fill();
    gx.fillRect(px - 52, pTop + 26, 104, 7); gx.fillRect(px - 36, pTop + 58, 72, 6);
    gx.strokeStyle = '#07050D'; gx.lineWidth = 1.6;
    for (const [x0, y0, x1, y1, sag] of [[px - 48, pTop + 29, SW, SM + 250, 110], [px + 48, pTop + 29, SW, SM + 300, 120], [px - 32, pTop + 61, SW, SM + 380, 100], [px - 48, pTop + 29, -20, SM + 700, 40], [px + 48, pTop + 29, -20, SM + 740, 50]]) {
      gx.beginPath(); gx.moveTo(x0, y0); gx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) + sag, x1, y1); gx.stroke();
    }
    SB = { pieces, night: nc, stars, ground: gc, gy, cx, cy };
    skyCache.set(key, SB); return SB;
  }

  function drawSkyShatter(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0;
    const ix = a.impact ? a.impact[0] : 1150, iy = a.impact ? a.impact[1] : 300;
    const SB = skyBuild(a.bg || SKY, a.seed ?? 3913, ix, iy, a.night || '#070b1c');
    // release schedule: one band per beat from the first release beat (default: the first downbeat inside the shot), centre first
    const i0 = beatIdx(S, t0) + (a.releaseBeat ?? 1), nBands = a.bands ?? 5;
    const bandT = b => beatT(S, i0 + b);
    const relOf = p => bandT(Math.min(nBands - 1, Math.floor(nBands * Math.pow(1 - p.near, 1.15)))) + 0.16 * p.jit + 0.05 * (0.5 + 0.5 * Math.sin(p.ang * 2));
    let rel = 0; for (const p of SB.pieces) if (t >= relOf(p)) rel++;
    const revealK = rel / SB.pieces.length;
    let jolt = 0; for (let b = 0; b < nBands; b++) if (t >= bandT(b)) jolt += decay(t - bandT(b), 9) * (b === 0 ? 1.4 : 1);
    const [jx, jy] = D.shake(t, 1 + 7 * jolt, 24, 5);
    const zoom = 1 + 0.06 * E.inOutSine(S.p) + 0.008 * jolt, ccx = 960, ccy = 520;
    const cam = par => { ctx.translate(ccx + jx * par, ccy + jy * par + 18 * S.p * par); ctx.scale(1 + (zoom - 1) * par, 1 + (zoom - 1) * par); ctx.translate(-ccx - SM, -ccy - SM); };
    ctx.fillStyle = a.night || '#070b1c'; ctx.fillRect(0, 0, W, H);
    ctx.save(); cam(0.35); ctx.drawImage(SB.night, 0, 0);
    for (const st of SB.stars) {
      const tw = 0.45 + 0.55 * Math.sin(t * st.f + st.ph) ** 2;
      sparkle(ctx, st.x, st.y, st.r * (0.7 + 0.3 * tw), 0.25 + 0.6 * tw * revealK + 0.15, st.cool ? P.starCool : '#FFE8CF', 0, true);
    }
    ctx.restore();
    ctx.save(); cam(1);
    const falling = [], fgs = [];
    const crackA = 0.55 + 0.3 * S.clock.pulse(t, 6);
    for (const p of SB.pieces) {
      const tr = relOf(p), tau = t - tr;
      if (tau < 0) {
        const lo = E.inQuad(inv(tr - 0.42, tr, t)), trem = lo * Math.sin(t * 70 + p.jit * 20) * 1.6;
        const x = p.x + p.dx * 5 * lo + trem, y = p.y + p.dy * 5 * lo;
        drawPiece(ctx, p.spr, p.spr.base, x, y, 0.012 * lo * (p.jit < 0.5 ? -1 : 1), p.axis, 0, 1, 1);
        drawPiece(ctx, p.spr, p.spr.glow, x, y, 0, p.axis, 0, 1, (crackA + 0.6 * lo) * (0.45 + 0.55 * p.near), 'lighter');
      } else (p.fg ? fgs : falling).push([p, tau]);
    }
    const fallDraw = ([p, tau]) => {
      const tf2 = Math.max(0, tau - 0.06);
      const x = p.x + p.dx * p.vx * tau, y = p.y + p.vy * tau + 0.5 * p.g * tf2 * tf2 * (p.fg ? 1.3 : 1);
      const scl = 1 + p.zv * tau + (p.fg ? 0.45 * tau * tau : 0);
      if (y - p.size * 0.8 * scl > SM + H + 60) return;
      const spin = p.psV * tau + 0.5 * p.psA * tau * tau, flip = p.phV * tau * (p.fg ? 0.6 : 1);
      const lit = Math.abs(Math.cos(flip)), darkK = clamp((1 - lit) * 0.7 + tau * 0.22 + (p.fg ? 0.25 : 0)) * 0.85;
      const glint = Math.pow(Math.max(0, Math.cos(flip * 2 + p.gph)), 30);
      drawPiece(ctx, p.spr, p.spr.base, x, y, spin, p.axis, flip, scl, 0.94);
      drawPiece(ctx, p.spr, p.spr.dark, x, y, spin, p.axis, flip, scl, darkK);
      drawPiece(ctx, p.spr, p.spr.glow, x, y, spin, p.axis, flip, scl, 0.8 * decay(tau, 1.3) + 0.3 + glint * 0.8, 'lighter');
      if (glint > 0.05) drawPiece(ctx, p.spr, p.spr.base, x, y, spin, p.axis, flip, scl, glint * 0.45, 'lighter');
      if (glint > 0.45) sparkle(ctx, x - p.dx * p.size * 0.3 * scl, y - p.size * 0.25 * scl, 24 + 40 * glint, glint, P.hot, 0.3);
    };
    falling.sort((u, v) => u[1] - v[1]).forEach(fallDraw);
    // glass debris shaken loose with every release
    ctx.globalCompositeOperation = 'lighter';
    for (const p of SB.pieces) {
      const tr = relOf(p), tau = t - tr; if (tau < -0.1 || tau > 1.6) continue;
      const sd = p.jit * 1e3;
      for (let j = 0; j < 7; j++) {
        const ta = Math.max(0, tau + 0.1 * Z.rnd(j, sd)), ox = Z.rnds(j, 1, sd) * p.size * 0.45, oy = Z.rnds(j, 2, sd) * p.size * 0.45;
        const x = p.x + ox + Z.rnds(j, 3, sd) * 60 * ta, y = p.y + oy + 0.5 * 1400 * ta * ta;
        const tw = Math.pow(Math.abs(Math.sin(t * (7 + 5 * Z.rnd(j, 4)) + j)), 5), al = (0.3 + 0.7 * tw) * (1 - ta / 1.7);
        ctx.fillStyle = Z.rgba(j % 3 ? '#FFE3B0' : '#FFFFFF', al); ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        if (tw > 0.9 && j % 2) sparkle(ctx, x, y, 12, al, P.hot, 0, false);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // ground, pole, her: small, backlit, looking up
    ctx.drawImage(SB.ground, 0, 0);
    const cimg = Z.imgSync(a.char || BACK), chX = (a.charX ?? 1070) + SM, chH = a.charH ?? 400, gyv = SB.gy(chX) + 5;
    const coolK = smooth(0.35, 0.8, revealK);
    const rimCol = coolK < 0.5 ? '#FFB070' : '#A9CCFF';
    drawFigure(ctx, cimg, chX, gyv, chH, {
      t: S.tq, breathe: 0.5, wave: { amp: 8, from: 0.12, q: 12, speed: 3.4 },
      sil: '#0B0714', silDetail: 0.14,
      rim: { color: rimCol, offs: [[3, -3], [-2, -3]], a: 0.95 },
    });
    fgs.sort((u, v) => u[1] - v[1]).forEach(fallDraw);            // pieces tumbling past the lens
    ctx.restore();
    D.vgrad(ctx, [[0, 'rgba(7,11,28,0.35)'], [0.4, 'rgba(7,11,28,0)'], [1, 'rgba(7,11,28,0)']], revealK);
    vignette(ctx, 0.5, '5,6,16');
  }

  Z.scene('skyShatter', {
    preload: a => [a.bg || SKY, a.char || BACK],
    draw(ctx, S) { drawSkyShatter(ctx, S); },
  });
})();
