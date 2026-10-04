/* vocaloid-style-mv scenes: meta — scenes about other shots and about the edit itself.
 *
 *   panels  manga コマ割り split screen: slanted ink gutters, staggered 8th-note wipes, per-beat punch-ins,
 *           collapse into one full-frame panel with a rhythmic zoom                        (shots 20, 41)
 *   burst   one composed mini-shot per beat: punchy framing, character pop, smear, flash, speed lines,
 *           optional night→dawn grade across the burst                                     (shots 55, 59)
 *   ref     re-renders another shot and processes it: freeze (22) / rewind (43) / melt (32)
 *   seq     Blender image sequence in sync with song time, optional overlays               (shots 23, 44)
 *
 * Every draw is a pure function of t. Buffers are private to this file and allocated per nesting depth, so
 * a ref that re-renders a panels shot (or another ref) never shares a canvas with itself.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const INK = '#140B1E', PAPER = '#F4EFE6';
  const ez = n => (typeof n === 'function' ? n : E[n] || E.inOutSine);

  // ================================================================ private buffers / textures
  let depth = 0;
  const pool = new Map();
  const buf = (name, w = W, h = H) => {
    const k = name + '@' + depth; let c = pool.get(k);
    if (!c || c.width !== w || c.height !== h) { c = Z.canvas(w, h); pool.set(k, c); }
    return c;
  };
  const cx2 = c => c.getContext('2d');
  const reset = x => { x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.shadowBlur = 0; x.shadowColor = 'rgba(0,0,0,0)'; };
  const wipe = c => { const x = cx2(c); reset(x); x.clearRect(0, 0, c.width, c.height); return x; };
  // run a scene body one nesting level deeper
  const nest = fn => async (ctx, S) => { depth++; try { return await fn(ctx, S); } finally { depth--; } };

  // paper tooth (baked once, deterministic)
  let paperC = null;
  const paper = () => {
    if (paperC) return paperC;
    const w = 960, h = 540, c = Z.canvas(w, h), x = cx2(c), R = Z.rng(9127);
    const id = x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 238 + (R() - 0.5) * 26 + (R() < 0.004 ? -40 : 0);
      id.data[i * 4] = v; id.data[i * 4 + 1] = v - 3; id.data[i * 4 + 2] = v - 9; id.data[i * 4 + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    x.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 26; i++) {                                    // soft blotches
      const bx = R() * w, by = R() * h, r = 60 + R() * 200, g = x.createRadialGradient(bx, by, 0, bx, by, r);
      g.addColorStop(0, `rgba(200,185,170,${0.12 + R() * 0.12})`); g.addColorStop(1, 'rgba(200,185,170,0)');
      x.fillStyle = g; x.fillRect(bx - r, by - r, 2 * r, 2 * r);
    }
    x.strokeStyle = 'rgba(110,90,80,0.16)'; x.lineWidth = 0.7;         // fibres
    for (let i = 0; i < 220; i++) {
      const fx = R() * w, fy = R() * h, a = R() * TAU, l = 6 + R() * 22;
      x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + Math.cos(a + 0.6) * l * 0.5, fy + Math.sin(a + 0.6) * l * 0.5, fx + Math.cos(a) * l, fy + Math.sin(a) * l); x.stroke();
    }
    return (paperC = c);
  };

  // VHS static (baked once)
  let staticC = null;
  const staticTex = () => {
    if (staticC) return staticC;
    const w = 640, h = 256, c = Z.canvas(w, h), x = cx2(c), R = Z.rng(4410), id = x.createImageData(w, h);
    for (let yy = 0; yy < h; yy++) {
      const row = 0.35 + 0.65 * R();
      for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4, v = R() < 0.5 ? 0 : 255 * Math.pow(R(), 0.6) * row;
        id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255;
      }
    }
    x.putImageData(id, 0, 0);
    return (staticC = c);
  };

  // scanline pattern (baked once)
  let scanC = null;
  const scanlines = () => {
    if (scanC) return scanC;
    const c = Z.canvas(W, H), x = cx2(c);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(30,26,40,0.55)';
    for (let y = 0; y < H; y += 4) x.fillRect(0, y + 2, W, 2);
    return (scanC = c);
  };

  // ================================================================ determinism: bitmap warm-up
  // Chromium rasterises the FIRST draw of an ImageBitmap differently from later draws (measured: up to 78/255 on
  // sprite edges), so a worker that seeks straight to a frame would not match a sequential render. Drawing every
  // preloaded image once at a few scales before frame 0 makes all real draws "second draws" (verified bit-exact).
  // Runs once from any meta scene's init (Z.META_WARMUP = false disables it). Belongs in core/main.js after preload.
  let warmed = false;
  const warmC = () => { const c = Z.canvas(64, 64); return c; };
  let warmX = null;
  const warmOne = img => { if (!warmX) warmX = cx2(warmC()); for (const k of [1, 0.5, 0.25, 0.125]) warmX.drawImage(img, 0, 0, Math.max(1, img.width * k), Math.max(1, img.height * k)); };
  const warmup = () => { if (warmed || Z.META_WARMUP === false) return; warmed = true; for (const img of Z.loaded.values()) warmOne(img); };
  const warmedSeq = new WeakSet();

  // ================================================================ small geometry helpers
  const polyPath = (x, P) => { x.beginPath(); x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]); x.closePath(); };
  const bbox = P => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const centroid = P => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
  // keep n·p <= c of a convex polygon
  const clipHalf = (P, nx, ny, c) => {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const da = a[0] * nx + a[1] * ny - c, db = b[0] * nx + b[1] * ny - c;
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    return out;
  };
  // half-plane of line A→B, keeping the side that contains R, pulled inward by off px
  const hp = (ax, ay, bx, by, rx, ry, off = 0) => {
    let nx = ay - by, ny = bx - ax; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    let c = nx * ax + ny * ay;
    if (nx * rx + ny * ry - c > 0) { nx = -nx; ny = -ny; c = -c; }
    return { nx, ny, c: c - off };
  };
  const norm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

  // eighth-note times from the real beat grid: first = t0, then the next n-1 eighths after t0 + 0.06
  const eighthsFrom = (C, t0, n) => {
    const out = [t0], bs = C.beats;
    for (let j = Math.max(0, C.idx(t0) - 1); j < bs.length - 1 && out.length < n; j++) {
      for (const e of [bs[j], (bs[j] + bs[j + 1]) / 2]) if (e > t0 + 0.06 && out.length < n) out.push(e);
    }
    while (out.length < n) out.push(out[out.length - 1] + C.spb / 2);
    return out;
  };

  // map an image-space point of a D.cover()'d background to frame/content space
  const coverPoint = (img, v, px, py) => {
    const s = Math.max(W / img.width, H / img.height) * (v.zoom ?? 1);
    const dw = img.width * s, dh = img.height * s, mx = Math.max(0, (dw - W) / 2), my = Math.max(0, (dh - H) / 2);
    let x = (px - img.width / 2) * s, y = (py - img.height / 2) * s;
    if (v.rot) { const c = Math.cos(v.rot), sn = Math.sin(v.rot); [x, y] = [x * c - y * sn, x * sn + y * c]; }
    return [W / 2 + (v.x || 0) * mx + x, H / 2 + (v.y || 0) * my + y, s];
  };
  // crossing lamps that alternate per beat (image-space positions of the lamp discs)
  const LAMPS = {
    'assets/bg/bg_crossing_night.png': { a: [[147, 333], [1450, 407]], b: [[303, 333], [1543, 407]], r: 32 },
  };
  function lamps(x, S, path, img, v, spec) {
    const L = spec === true ? LAMPS[path] : spec; if (!L) return;
    const on = ((S.clock.beat(S.t) % 2) + 2) % 2, pulse = S.clock.pulse(S.t, 5);
    [L.a, L.b].forEach((grp, gi) => {
      for (const [px, py] of grp) {
        const [cx, cy, s] = coverPoint(img, v, px, py), r = (L.r || 30) * s;
        if (gi === on) {
          D.glow(x, cx, cy, r * 7, '#FF3B2E', 0.55 + 0.35 * pulse);
          D.disc(x, cx, cy, r * 0.95, '#FF6A55');
          D.glow(x, cx, cy, r * 1.3, '#FFE0D0', 0.9);
        } else D.disc(x, cx, cy, r * 1.04, '#1C0709', 0.9);
      }
    });
  }

  // ================================================================ graphic line systems (tegaki: re-drawn on 12 fps)
  // 集中線 focus lines: wedges converging toward (cx,cy), leaving an elliptical clearing of radii (rx,ry)
  function focusLines(x, t, o) {
    const q = Math.floor(t * (o.fps || 12) + 1e-6), R = Z.rng(Z.hash(o.seed || 1, q));
    const n = o.n || 110, rx = o.rx || 420, ry = o.ry || rx * 0.8, Rout = o.rout || 2600;
    x.save(); x.globalAlpha *= o.alpha ?? 1; x.fillStyle = o.color || INK; x.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ((i + R.range(-0.45, 0.45)) / n) * TAU, k = 1 + R() * (o.spread ?? 0.7);
      const hw = (o.width ?? 0.011) * (0.25 + R() * R() * 1.8);
      const ix = o.cx + Math.cos(a) * rx * k, iy = o.cy + Math.sin(a) * ry * k;
      x.moveTo(ix, iy);
      x.lineTo(o.cx + Math.cos(a - hw) * Rout, o.cy + Math.sin(a - hw) * Rout);
      x.lineTo(o.cx + Math.cos(a + hw) * Rout, o.cy + Math.sin(a + hw) * Rout);
      x.closePath();
    }
    x.fill(); x.restore();
  }
  // 流線 speed lines: parallel tapered streaks along angle `ang`, streaming at `speed` px/s
  function speedLines(x, t, o) {
    const n = o.n || 46, ang = o.angle ?? 0, seed = o.seed || 3, ws = o.scale || 1, sp = (o.speed ?? 2600) * ws;
    const [x0, y0, x1, y1] = o.area || [0, 0, W, H], span = Math.hypot(x1 - x0, y1 - y0) + 900 * ws;
    const tq = Z.quant(t, o.fps || 24);
    x.save(); x.globalAlpha *= o.alpha ?? 1; x.fillStyle = o.color || PAPER;
    x.translate((x0 + x1) / 2, (y0 + y1) / 2); x.rotate(ang);
    x.beginPath();
    for (let i = 0; i < n; i++) {
      const across = (Z.rnd(i, seed) - 0.5) * span, len = (180 + 620 * Z.rnd(i, seed + 1)) * ws, w = (0.8 + 3.2 * Z.rnd(i, seed + 2) ** 2) * ws;
      const along = Z.fract(Z.rnd(i, seed + 3) + tq * sp * (0.6 + 0.8 * Z.rnd(i, seed + 4)) / span) * span - span / 2;
      x.moveTo(along, across - w); x.lineTo(along + len, across); x.lineTo(along, across + w); x.closePath();
    }
    x.fill(); x.restore();
  }

  // ================================================================ manga tone backgrounds (cached per spec)
  const toneCache = new Map();
  function toneCanvas(spec = {}) {
    const key = JSON.stringify(spec);
    if (toneCache.has(key)) return toneCache.get(key);
    const c = Z.canvas(W, H), x = cx2(c);
    const c0 = spec.c0 || '#C8373A', c1 = spec.c1 || '#7A2350';
    const g = x.createLinearGradient(W * 0.2, 0, W * 0.8, H);
    g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (spec.sun) {                                                    // flat disc (the master shape)
      const [sx, sy, sr] = spec.sun;
      x.fillStyle = spec.sunColor || '#F6C88E'; x.beginPath(); x.arc(sx, sy, sr, 0, TAU); x.fill();
      x.strokeStyle = Z.rgba(spec.sunColor || '#F6C88E', 0.5); x.lineWidth = 3;
      for (const k of [1.18, 1.36]) { x.beginPath(); x.arc(sx, sy, sr * k, 0, TAU); x.stroke(); }
    }
    // screentone: dots grow toward the lower-left corner (and inside the disc's lower half)
    const dot = spec.dot || INK, step = spec.step || 13, sun = spec.sun;
    D.halftone(x, [0, 0, W, H], step, (px, py) => {
      let v = Z.clamp(0.1 + 0.8 * ((py / H) * 0.75 + (1 - px / W) * 0.45) - 0.35);
      if (sun) { const d = Math.hypot(px - sun[0], py - sun[1]) / sun[2]; if (d < 1) v = Z.clamp((py - sun[1]) / sun[2]) * 0.55; }
      return Math.pow(v, 1.3) * (spec.density ?? 0.95);
    }, Z.rgba(dot, spec.dotA ?? 0.55));
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = spec.paper ?? 0.55;
    x.drawImage(paper(), 0, 0, W, H);
    toneCache.set(key, c);
    return c;
  }

  // character spec from a panel/cut description
  const charSpec = (P, dflt) => {
    if (!P.char) return null;
    const base = typeof P.char === 'string' ? { img: P.char } : Object.assign({}, P.char);
    return Object.assign({ x: dflt.x, y: dflt.y, h: dflt.h, anchor: [0.5, 1], flip: P.flip, wave: { amp: 9, from: 0.35 }, q: 12, sway: 0.006 },
      P.charX != null ? { x: P.charX } : {}, P.charY != null ? { y: P.charY } : {}, P.charH != null ? { h: P.charH } : {}, base);
  };
  // a rim silhouette that moves exactly like Z.drawChar's sprite (same sway / breathe / hair wave)
  const rimUnder = (x, S, spec, color, dx, dy, alpha = 0.9) => {
    const img = Z.imgSync(spec.img); if (!img || !color) return;
    const t = spec.q ? Z.quant(S.t, spec.q) : S.t;
    x.save(); x.globalAlpha *= alpha;
    D.silhouette(x, img, spec.x + dx, spec.y + dy, spec.h, color, { anchor: spec.anchor || [0.5, 1], flip: spec.flip, rot: spec.rot || 0, sway: spec.sway ?? 0.012, breathe: spec.breathe ?? 1, t, phase: spec.phase || 0,
      wave: spec.wave === false ? null : Object.assign({ amp: 10, from: 0.3, q: 12 }, spec.wave || {}), key: 'metaRim|' + spec.img + '|' + color });
    x.restore();
  };
  const imgsOf = list => {
    const out = [];
    for (const P of list || []) {
      for (const k of ['bg', 'img']) if (P[k]) out.push(P[k]);
      if (P.char) out.push(typeof P.char === 'string' ? P.char : P.char.img);
      if (P.alt) out.push(...imgsOf([P.alt]));
      if (P.illust) { if (P.illust.bg) out.push(P.illust.bg); for (const c of P.illust.chars || []) out.push(c.img); for (const l of P.illust.layers || []) out.push(l.img); }
    }
    return out.filter(Boolean);
  };

  // ================================================================ PANELS
  // args: { panels:[P...], collapseAt:null|s, hero:0, style:'manga', gutter:22, margin:22, gutterColor, keyline,
  //         openAt:[...], openDur:0.34, order:[slot...], layout:[{poly:[[x,y]..], dir:[dx,dy]}...], collapseDur, collapseZoom, shake }
  // P: { bg | img (opaque, covers), view, viewTo, char (path | drawChar spec), charX, charY, charH, flip,
  //      tone:{c0,c1,dot,sun:[x,y,r],sunColor} (when no bg), lines:'focus'|'speed'|null, lineColor, linesAt:[x,y], linesR,
  //      focus:[fx,fy], focusTo, zoom:[z0,z1], punch:{zoom,focus}|false, alt:{...P overrides on punch}, lamps:true|{a,b,r},
  //      tint:[{color,a,comp}], fx:[...], fxBack:[...], illust:{illust args} (rendered via Z.drawSceneAs), dir:[dx,dy] }
  const LAYOUTS = {
    1: g => [{ lines: [], dir: [1, 0] }],
    2: g => [
      { lines: [hp(1090, 0, 830, H, 0, H / 2, g / 2)], dir: [1, 0.15] },
      { lines: [hp(1090, 0, 830, H, W, H / 2, g / 2)], dir: [-1, 0] },
    ],
    3: g => [
      { lines: [hp(1060, 0, 905, H, 0, H / 2, g / 2)], dir: [0.25, 1] },
      { lines: [hp(1060, 0, 905, H, W, H / 2, g / 2), hp(0, 560, W, 478, W, 0, g / 2)], dir: [-1, 0.08] },
      { lines: [hp(1060, 0, 905, H, W, H / 2, g / 2), hp(0, 560, W, 478, W, H, g / 2)], dir: [-0.1, -1] },
    ],
    4: g => [
      { lines: [hp(0, 405, W, 330, 0, H, g / 2), hp(1135, 0, 985, H, 0, H, g / 2)], dir: [0.25, 1] },
      { lines: [hp(0, 405, W, 330, 0, 0, g / 2)], dir: [-1, 0.06] },
      { lines: [hp(0, 405, W, 330, 0, H, g / 2), hp(1135, 0, 985, H, W, H, g / 2), hp(0, 742, W, 705, W, 0, g / 2)], dir: [-1, 0.06] },
      { lines: [hp(0, 405, W, 330, 0, H, g / 2), hp(1135, 0, 985, H, W, H, g / 2), hp(0, 742, W, 705, W, H, g / 2)], dir: [-0.1, -1] },
    ],
  };
  const OPEN_ORDER = { 1: [0], 2: [1, 0], 3: [1, 2, 0], 4: [1, 2, 3, 0] };   // Japanese reading order, hero lands last

  const slotPoly = (slot, m, grow) => {
    if (slot.poly) { if (!grow) return slot.poly; const [cx, cy] = centroid(slot.poly); return slot.poly.map(([x, y]) => [Z.lerp(x, cx + (x - cx) * 4, grow), Z.lerp(y, cy + (y - cy) * 4, grow)]); }
    let P = [[m, m], [W - m, m], [W - m, H - m], [m, H - m]];
    for (const l of slot.lines) P = clipHalf(P, l.nx, l.ny, l.c + grow * 3000);
    return P;
  };

  async function panelContent(x, S, P, i, pt) {
    if (P.illust) {
      const c = buf('panel.ill' + i);
      await Z.drawSceneAs('illust', cx2(c), S.t, P.illust, S.shot.t0, S.shot.t1, S.shot.id + ':p' + i);
      x.drawImage(c, 0, 0);
    } else if (P.bg || P.img) {
      const path = P.bg || P.img, img = Z.imgSync(path);
      const v = D.viewLerp(P.view || { zoom: 1.04 }, P.viewTo || P.view || { zoom: 1.1 }, E.inOutSine(S.p));
      if (img) D.cover(x, img, v);
      if (P.lamps && img) lamps(x, S, path, img, v, P.lamps);
    } else x.drawImage(toneCanvas(P.tone || {}), 0, 0);
    for (const f of P.fxBack || []) Z.fx(x, S, f);
    const fc = P.linesAt || [pt.fx, pt.fy];
    const lr = Array.isArray(P.linesR) ? P.linesR : [P.linesR || 330, (P.linesR || 330) * 1.2];
    if (P.lines === 'focus') focusLines(x, S.t, { cx: fc[0], cy: fc[1], rx: lr[0], ry: lr[1], color: P.lineColor || INK, alpha: P.linesA ?? 0.8, seed: 11 + i, spread: 0.55 });
    if (pt.impact > 0) {                                                     // collapse impact: a denser burst behind the character
      const k = pt.impact;
      focusLines(x, S.t, { cx: fc[0], cy: fc[1], rx: lr[0] * Z.lerp(1.5, 0.95, k), ry: lr[1] * Z.lerp(1.5, 0.95, k), color: P.impactColor || P.lineColor || INK, alpha: E.outQuad(k), n: 170, seed: 99, width: 0.014, spread: 0.4, fps: 24 });
    }
    if (P.lines === 'speed') speedLines(x, S.t, { angle: P.linesAngle ?? -Math.PI / 2, color: P.lineColor || PAPER, alpha: P.linesA ?? 0.6, seed: 7 + i, speed: 2600, n: P.linesN || 70, fps: 12, area: pt.win, scale: 1 / pt.s });
    const ch = charSpec(P, { x: W / 2, y: H + 30, h: H * 1.02 });
    if (ch) {
      if (P.rim) rimUnder(x, S, ch, P.rim.color || '#FFA552', (P.rim.off || [8, -4])[0], (P.rim.off || [8, -4])[1], P.rim.a ?? 0.9);
      Z.drawChar(x, S, ch);
    }
    for (const f of P.fx || []) Z.fx(x, S, f);
    for (const tn of P.tint || []) D.fill(x, tn.color, tn.a ?? 0.4, tn.comp || 'multiply');
  }

  async function drawPanels(ctx, S) {
    const a = S.args, t = S.t, T0 = S.shot.t0, C = S.clock;
    const list = (a.panels || []).slice(0, 4);
    const n = Math.max(1, list.length), g = a.gutter ?? 22, m = a.margin ?? 22;
    const slots = a.layout || LAYOUTS[n](g);
    const hero = Z.clamp(a.hero ?? 0, 0, n - 1);
    const order = a.order || OPEN_ORDER[n];
    const opens = a.openAt || eighthsFrom(C, T0, n);
    const openT = []; order.forEach((si, k) => { openT[si] = opens[k]; });
    const openDur = a.openDur ?? 0.36;
    const tc = a.collapseAt ?? null, cDur = a.collapseDur ?? 0.2;
    const kC = tc != null ? E.inOutExpo(Z.inv(tc - cDur, tc, t)) : 0;
    const after = tc != null && t >= tc;

    // beat punches: every beat after the last panel landed, round-robin in opening order (cut 1 frame early)
    const lead = 1 / 30, lastOpen = Math.max(...opens);
    const punches = list.map(() => []);
    let j = 0;
    for (const b of C.beats) if (b > lastOpen + openDur * 0.5 && b < (tc != null ? tc - 0.08 : S.shot.t1)) punches[order[j++ % n]].push(b - lead);

    const bg = a.gutterColor || INK;
    D.fill(ctx, bg);
    ctx.save();
    // page shake on downbeats (panels only, not after collapse)
    const shk = (a.shake ?? 7) * C.downPulse(t, 9) * (1 - kC);
    if (shk > 0.2) { const [sx, sy] = D.shake(t, shk, 24, 5); ctx.translate(sx, sy); }

    const drawOrder = [...order.filter(i => i !== hero), hero].filter(i => i < n);
    const heroC = centroid(slotPoly(slots[hero], m, 0));
    const pen = a.keyline || PAPER;
    for (const i of drawOrder) {
      const P0 = list[i]; if (!P0) continue;
      if (after && i !== hero) continue;
      // the panel border is inked first (a quick pen stroke around the frame), then the wipe opens it
      const kb = E.outCubic(Z.inv(openT[i] - 0.16, openT[i] + 0.08, t));
      if (kb > 0 && t < openT[i] + openDur) {
        const B0 = slotPoly(slots[i], m, 0);
        let per = 0; for (let q = 0; q < B0.length; q++) { const u = B0[q], v = B0[(q + 1) % B0.length]; per += Math.hypot(v[0] - u[0], v[1] - u[1]); }
        ctx.save(); polyPath(ctx, B0); ctx.setLineDash([per * kb, per + 10]); ctx.lineDashOffset = 0;
        ctx.strokeStyle = Z.rgba(pen, 0.9); ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
      }
      if (t < openT[i] - 1e-6) continue;
      const eo = E.outExpo(Z.inv(openT[i], openT[i] + openDur, t));
      const isHero = i === hero;
      const full = slotPoly(slots[i], isHero ? Z.lerp(m, -60, kC) : m, isHero ? kC : 0);
      // wipe clip along the slot direction
      const d = norm(P0.dir || slots[i].dir || [1, 0]);
      let lo = 1e9, hi = -1e9; for (const p of full) { const v = p[0] * d[0] + p[1] * d[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const Pw = eo >= 1 ? full : clipHalf(full, d[0], d[1], lo + eo * (hi - lo + 2));
      if (Pw.length < 3) continue;
      // non-hero panels are shoved off the page by the collapse
      let px = 0, py = 0;
      if (!isHero && kC > 0) { const [cx, cy] = centroid(full), v = norm([cx - heroC[0], cy - heroC[1]]); px = v[0] * kC * 520; py = v[1] * kC * 520; }
      // punch state
      const past = punches[i].filter(b => b <= t + 1e-6);
      const variant = past.length % 2 === 1, since = past.length ? t - past[past.length - 1] : 1e9;
      const P = variant && P0.alt ? Object.assign({}, P0, P0.alt) : P0;
      // camera
      const pk = E.inOutSine(S.p);
      const z = P.zoom || [1, 1.06];
      let zoom = Z.lerp(z[0], z[1], pk), f = P.focus || [0.5, 0.5];
      if (P.focusTo) f = [Z.lerp(f[0], P.focusTo[0], pk), Z.lerp(f[1], P.focusTo[1], pk)];
      if (variant && P.punch !== false && !P0.alt) { const pu = P.punch || {}; zoom *= pu.zoom ?? 1.32; if (pu.focus) f = pu.focus; }
      zoom *= 1 + 0.07 * (1 - E.outExpo(Z.clamp(since / 0.22)));            // punch settle
      zoom *= 1 + 0.09 * (1 - eo);                                          // open settle
      if (isHero && tc != null) {                                           // rhythmic zoom after the collapse (ratchet per beat)
        let r = 0;
        for (const b of C.beats) { if (b < tc - 0.05) continue; if (b > t + lead) break; r += E.outExpo(Z.clamp((t - (b - lead)) / 0.16)); }
        zoom *= 1 + (a.collapseZoom ?? 0.045) * r + 0.018 * C.pulse(t, 12) * (after ? 1 : 0);
      }
      const [bx0, by0, bx1, by1] = bbox(full), bw = bx1 - bx0, bh = by1 - by0;
      const s = Math.max(bw / W, bh / H) * zoom;
      let fx = f[0] * W, fy = f[1] * H;
      if (P.bg || P.img || P.illust) { const hw = bw / 2 / s, hh = bh / 2 / s; fx = Z.clamp(fx, Math.min(hw, W / 2), Math.max(W - hw, W / 2)); fy = Z.clamp(fy, Math.min(hh, H / 2), Math.max(H - hh, H / 2)); }
      const slide = (1 - eo) * 110;

      ctx.save();
      ctx.translate(px, py);
      polyPath(ctx, Pw); ctx.clip();
      ctx.save();
      ctx.translate((bx0 + bx1) / 2 - d[0] * slide, (by0 + by1) / 2 - d[1] * slide);
      ctx.scale(s, s); ctx.translate(-fx, -fy);
      const impact = isHero && tc != null && t >= tc - 1e-6 ? 1 - Z.clamp((t - tc) / 0.45) : 0;
      const hw = bw / 2 / s, hh = bh / 2 / s;
      await panelContent(ctx, S, P, i, { fx, fy, impact, s, win: [fx - hw, fy - hh, fx + hw, fy + hh] });
      ctx.restore();
      // punch flash: 1 frame negative, 1 frame paper wash (small area, photosafe)
      if (since < 1 / 30) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-100, -100, W + 200, H + 200); ctx.globalCompositeOperation = 'source-over'; }
      else if (since < 2 / 30) { ctx.globalAlpha = 0.28; ctx.fillStyle = PAPER; ctx.fillRect(-100, -100, W + 200, H + 200); ctx.globalAlpha = 1; }
      // wipe leading edge: a bright pen stroke riding the wipe
      if (eo < 1 && eo > 0) {
        const c = lo + eo * (hi - lo + 2);
        ctx.strokeStyle = Z.rgba(a.keyline || PAPER, 0.9 * (1 - eo)); ctx.lineWidth = 10;
        const ox = d[0] * c, oy = d[1] * c;
        ctx.beginPath(); ctx.moveTo(ox - d[1] * 3000, oy + d[0] * 3000); ctx.lineTo(ox + d[1] * 3000, oy - d[0] * 3000); ctx.stroke();
      }
      ctx.restore();
      // keyline
      if (!(isHero && kC >= 1)) {
        ctx.save(); ctx.translate(px, py);
        polyPath(ctx, Pw); ctx.strokeStyle = Z.rgba(a.keyline || PAPER, (a.keylineA ?? 0.92) * (isHero ? 1 - kC : 1)); ctx.lineWidth = a.keylineW ?? 3.5; ctx.lineJoin = 'miter'; ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    // collapse impact: 集中線 burst + one paper flash on the landing
    if (tc != null && t >= tc - 1e-6) {
      const dt = t - tc;
      if (dt < 0.1) D.fill(ctx, PAPER, 0.7 * (1 - dt / 0.1));
      // the one remaining panel: a keyline that settles in from the frame edge
      const kl = E.outExpo(Z.clamp((dt - 0.05) / 0.5)), inset = Z.lerp(-6, a.finalInset ?? 20, kl);
      if (a.finalFrame !== false) { ctx.save(); ctx.strokeStyle = Z.rgba(a.keyline || PAPER, 0.85 * kl); ctx.lineWidth = 3.5; ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset); ctx.restore(); }
    }
  }

  Z.scene('panels', {
    preload: a => imgsOf(a.panels),
    init: async () => { warmup(); toneCanvas({}); paper(); },
    draw: nest(drawPanels),
  });

  // ================================================================ BURST
  // args: { cuts:[{ bg, view:{zoom,x,y}, viewTo, char, charX, charY, charH, flip, rim:'#hex', tint:[...], dir:±1, lamps }],
  //         every:1, lead:1/30, flash:'alt'|'all'|'none'|[k...], flashColor, speed:true, grade:null|'night2dawn', roll:0.018 }
  const flashOn = (spec, k) => spec === 'all' ? true : spec === 'none' || spec === false ? false : Array.isArray(spec) ? spec.includes(k) : k % 2 === 1;

  // night → dawn: strong on the background, `k` scales it down for the unify pass over the character
  function gradeNightDawn(x, gk, k = 1) {
    const night = Math.pow(1 - gk, 1.1), dawn = E.inOutSine(gk), mid = Math.sin(Math.PI * gk);
    if (night > 0.01) { D.fill(x, '#34427A', 0.55 * night * k, 'multiply'); D.fill(x, '#0A1030', 0.2 * night * k, 'screen'); }
    if (mid > 0.01) D.fill(x, '#7A4A8C', 0.22 * mid * k, 'soft-light');
    if (dawn > 0.01) {
      D.fill(x, '#FFA07C', 0.34 * dawn * k, 'soft-light');
      D.vgrad(x, [[0, 'rgba(255,190,150,0)'], [0.55, 'rgba(255,170,120,0)'], [1, 'rgba(255,184,138,0.55)']], 0.7 * dawn * k, 'screen');
    }
  }
  const mixHex = (h1, h2, k) => { const a = Z.hex(h1), b = Z.hex(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

  async function drawBurst(ctx, S) {
    const a = S.args, cuts = a.cuts || [];
    if (!cuts.length) { D.fill(ctx, INK); return; }
    const C = S.clock, t = S.t, T0 = S.shot.t0, lead = a.lead ?? 1 / 30, every = Math.max(1, a.every || 1);
    const i0 = Math.max(0, C.idx(T0 + lead + 0.005));
    const i = Math.max(i0, C.idx(t + lead));
    const k = Math.floor((i - i0) / every);
    const cs = k === 0 ? T0 : C.beats[i0 + k * every] - lead;
    const nb = C.beats[i0 + (k + 1) * every];
    const ce = nb != null ? nb - lead : cs + C.spb * every;
    const lc = Math.max(0, t - cs), cd = Math.max(0.1, ce - cs), u = Z.clamp(lc / cd), f = Math.floor(lc * 30 + 1e-6);
    let nCuts = 0; for (let j = i0; j < C.beats.length && C.beats[j] - lead < S.shot.t1 - 0.05; j += every) nCuts++;
    const cut = cuts[k % cuts.length], pass = Math.floor(k / cuts.length);
    const dir = cut.dir ?? ((k % 2 ? -1 : 1) * (pass % 2 ? -1 : 1));

    const B = buf('burst'), bx = wipe(B);
    // ---- background: punchy framing + quick push (camera: full frame rate)
    if (cut.bg) {
      const img = Z.imgSync(cut.bg);
      const v0 = Object.assign({ zoom: 1.24, x: -0.55 * dir, y: 0.05 }, cut.view || {});
      const v1 = Object.assign({}, v0, { zoom: v0.zoom * 1.075, x: v0.x + 0.3 * dir }, cut.viewTo || {});
      const push = E.outQuart(u);
      const v = D.viewLerp(v0, v1, push);
      v.zoom *= 1 + 0.035 * (1 - E.outExpo(Z.clamp(lc / 0.2)));        // arrival overshoot
      if (img) D.cover(bx, img, v);
      if (cut.lamps && img) lamps(bx, S, cut.bg, img, v, cut.lamps);
    } else D.fill(bx, cut.color || INK);
    const gk = a.grade === 'night2dawn' ? (nCuts > 1 ? Z.clamp((k + 0.35 * u) / (nCuts - 1)) : S.p) : -1;
    if (gk >= 0) gradeNightDawn(bx, gk, 1);
    // speed lines behind the character, streaming against the push
    if (a.speed !== false) {
      const sa = 1 - Z.clamp(lc / (cd * 0.7));
      if (sa > 0) speedLines(bx, t, { angle: dir > 0 ? Math.PI : 0, color: cut.lineColor || '#FFF4DC', alpha: 0.34 * sa * sa, seed: 30 + k, n: 22, speed: 3600, area: [0, 0, W, H], scale: 0.7 });
    }
    // ---- character pop (drawn: 12 fps)
    const ch = charSpec(cut, { x: W * (0.5 + 0.17 * dir), y: H + 30, h: H * 1.0 });
    if (ch) {
      const lq = Math.max(0, Z.quant(t, 12) - cs);
      const pop = E.outExpo(Z.clamp(lq / 0.24));
      const spec = Object.assign({}, ch, { x: ch.x - dir * 150 * (1 - pop), h: ch.h * Z.lerp(0.93, 1, pop) * (1 + 0.03 * E.outCubic(u)), wave: ch.wave, q: 0 });
      // hard cel rim toward the light (quantised colours so the tint cache stays small)
      const rim = cut.rim !== undefined ? cut.rim : a.rim !== undefined ? a.rim : (gk >= 0 ? mixHex('#7FA8FF', '#FFB38A', Math.round(gk * 4) / 4) : '#FFA552');
      if (rim) {
        const rd = cut.rimDir ?? -dir;
        rimUnder(bx, S, spec, rim, 10 * rd, -6, cut.rimA ?? 0.9);
      }
      Z.drawChar(bx, S, spec);
    }
    for (const tn of cut.tint || []) D.fill(bx, tn.color, tn.a ?? 0.4, tn.comp || 'multiply');
    if (gk >= 0) gradeNightDawn(bx, gk, 0.35);
    // vignette
    const vg = bx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(8,4,14,0)'); vg.addColorStop(1, 'rgba(8,4,14,0.55)'); bx.fillStyle = vg; bx.fillRect(0, 0, W, H);

    // ---- composite: dutch roll + arrival smear
    const roll = dir * (a.roll ?? 0.018) * (1 - 0.4 * E.outCubic(u)), ov = 1.045;
    const put = (dx, al) => { ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2 + dx, H / 2); ctx.rotate(roll); ctx.scale(ov, ov); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore(); };
    if (k > 0 && f === 0) { put(dir * 90, 1); put(dir * 45, 0.55); put(0, 0.5); }
    else if (k > 0 && f === 1) { put(dir * 22, 1); put(0, 0.6); }
    else put(0, 1);
    // ---- 1-frame flash between cuts (≤ 3/s: at most every other beat)
    if (k > 0 && flashOn(a.flash ?? 'alt', k)) {
      const fc = a.flashColor || '#FFF4DC';
      if (f === 0) D.fill(ctx, fc, 0.88); else if (f === 1) D.fill(ctx, fc, 0.3);
    }
    if (a.hud) {
      ctx.save(); D.font(ctx, 22, 'dot', 400); ctx.fillStyle = 'rgba(244,239,230,0.75)'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`CUT ${String(k + 1).padStart(2, '0')}/${String(nCuts).padStart(2, '0')}`, 64, H - 52); ctx.restore();
    }
  }

  Z.scene('burst', {
    preload: a => imgsOf(a.cuts),
    init: async () => { warmup(); },
    draw: nest(drawBurst),
  });

  // ================================================================ REF (freeze / rewind / melt)
  // args: { shot:'id', mode:'freeze'|'rewind'|'melt', at, span,
  //   freeze: live:true (plays the source until `at`), crackAt, crackXY:[x,y], crackAngle, crackSeed, desat:0.88, push:0.025, jitter:1.2, split:8
  //   rewind: span:3, from (default shot t0), follow:true (cross into earlier shots), hold:0.1, fps:15, osd:true
  //   melt:   meltAt (default t0+0.45), meltEnd (default t1), cols:72, seed, depth:1.25, live:false, rate }
  const frames = new Map();
  async function frozen(id, at) {
    const key = id + '@' + at.toFixed(4);
    let e = frames.get(key);
    if (e) { frames.delete(key); frames.set(key, e); return e; }
    const c = Z.canvas(W, H);
    await Z.renderShot(id, at, cx2(c));
    e = { c, grey: null, cold: null };
    frames.set(key, e);
    while (frames.size > 6) frames.delete(frames.keys().next().value);
    return e;
  }
  const greyOf = e => {
    if (e.grey) return e.grey;
    const c = Z.canvas(W, H), x = cx2(c);
    x.filter = 'grayscale(1) contrast(1.12) brightness(0.96)'; x.drawImage(e.c, 0, 0); x.filter = 'none';
    return (e.grey = c);
  };
  const coldInto = (dst, src) => {
    const x = cx2(dst); reset(x); x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0);
    D.fill(x, '#3A62B8', 0.88, 'color'); D.fill(x, '#86A4E6', 0.45, 'multiply'); D.fill(x, '#071433', 0.35, 'screen');
    return dst;
  };
  const coldOf = e => e.cold || (e.cold = coldInto(Z.canvas(W, H), e.c));
  // highlights only (darks crushed to black), cooled: the light that runs in the melt
  const hiInto = (dst, src) => {
    const x = cx2(dst); reset(x); x.clearRect(0, 0, W, H);
    x.filter = 'contrast(2.6) brightness(0.62) saturate(1.2)'; x.drawImage(src, 0, 0); x.filter = 'none';
    D.fill(x, '#5C86E0', 0.55, 'color'); D.fill(x, '#000', 0.08);
    return dst;
  };
  const hiOf = e => e.hi || (e.hi = hiInto(Z.canvas(W, H), e.c));
  // the highlight map smeared vertically (squash to 1/18 height and back): soft light streaks, no echoes
  const vsmearInto = (dst, src) => {
    const sm = buf('melt.vs', W, Math.round(H / 18)), sx = wipe(sm);
    sx.drawImage(src, 0, 0, W, sm.height);
    const x = cx2(dst); reset(x); x.clearRect(0, 0, W, H); x.drawImage(sm, 0, 0, W, H);
    x.globalCompositeOperation = 'lighten'; x.globalAlpha = 0.55; x.drawImage(src, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    return dst;
  };
  const hiVOf = e => e.hiV || (e.hiV = vsmearInto(Z.canvas(W, H), hiOf(e)));

  function missing(ctx, msg) {
    D.fill(ctx, INK);
    ctx.save(); D.font(ctx, 28, 'dot', 400); ctx.fillStyle = 'rgba(244,239,230,0.7)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(msg, W / 2, H / 2); ctx.restore();
  }

  // ---- freeze -----------------------------------------------------------------
  const crackCache = new Map();
  function crackGeom(seed, cx, cy, ang) {
    const key = [seed, cx, cy, ang].join('|');
    if (crackCache.has(key)) return crackCache.get(key);
    const R = Z.rng(seed);
    // glass: long straight runs with sharp kinks, mean-reverting to the main direction
    const walk = (a0, maxL = 1e9, lo = 46, hi = 130, jit = 0.26) => {
      const pts = []; let x = cx, y = cy, a = a0, L = 0;
      while (x > -80 && x < W + 80 && y > -80 && y < H + 80 && L < maxL) {
        const st = R.range(lo, hi); a = a0 + (a - a0) * 0.3 + R.range(-jit, jit);
        x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push([x, y, L]);
      }
      return pts;
    };
    const A = walk(ang), B = walk(ang + Math.PI);
    const halves = [[[cx, cy, 0], ...A], [[cx, cy, 0], ...B]];
    const reach = Math.max(A.length ? A[A.length - 1][2] : 0, B.length ? B[B.length - 1][2] : 0);
    // split outline: the crack extended far beyond the frame, so the two side polygons always cover every corner
    const ea = A[A.length - 1] || [cx, cy], eb = B[B.length - 1] || [cx, cy], dx = Math.cos(ang), dy = Math.sin(ang);
    const main = [[eb[0] - dx * 4000, eb[1] - dy * 4000], ...B.slice().reverse(), [cx, cy], ...A, [ea[0] + dx * 4000, ea[1] + dy * 4000]];
    const branches = [];
    for (let b = 0; b < 6; b++) {                                          // side cracks off the main line
      const src = b % 2 ? A : B; if (src.length < 4) continue;
      const p = src[Math.floor(R.range(1, src.length - 2))];
      const a0 = ang + (src === B ? Math.PI : 0) + R.sign() * R.range(0.45, 1.0);
      const pts = [[p[0], p[1], p[2]]]; let x = p[0], y = p[1], a = a0, L = p[2]; const maxL = R.range(60, 200);
      while (L - p[2] < maxL) { a += R.range(-0.2, 0.2); const st = R.range(26, 60); x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push([x, y, L]); }
      branches.push(pts);
    }
    for (let b = 0; b < 9; b++) {                                          // star fracture at the impact
      const a0 = (b / 9) * TAU + R.range(-0.2, 0.2), pts = [[cx, cy, 0]]; let x = cx, y = cy, L = 0; const maxL = R.range(24, 90);
      while (L < maxL) { const st = R.range(12, 30); const a = a0 + R.range(-0.25, 0.25); x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push([x, y, L]); }
      branches.push(pts);
    }
    const ring = [];                                                       // a broken concentric ring around the impact
    for (let b = 0; b < 9; b++) { if (R() < 0.3) continue; const r = R.range(26, 44), a0 = (b / 9) * TAU, a1 = ((b + 1) / 9) * TAU; ring.push([[cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], [cx + Math.cos(a1) * r * R.range(0.9, 1.1), cy + Math.sin(a1) * r * R.range(0.9, 1.1)]]); }
    const g = { main, halves, reach, branches, ring };
    crackCache.set(key, g);
    return g;
  }
  const strokeUpTo = (x, pts, r) => {
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, al] = pts[i - 1], [bx, by, bl] = pts[i];
      if (bl <= r) x.lineTo(bx, by);
      else { const k = Z.clamp((r - al) / (bl - al)); x.lineTo(Z.lerp(ax, bx, k), Z.lerp(ay, by, k)); break; }
    }
    x.stroke();
  };

  async function drawFreeze(ctx, S) {
    const a = S.args, t = S.t, T0 = S.shot.t0, T1 = S.shot.t1;
    const at = a.at ?? T0;
    if (!Z.shotById(a.shot)) return missing(ctx, 'ref: no shot ' + a.shot);
    if (t < at && a.live !== false) { await Z.renderShot(a.shot, t, ctx); return; }
    const F = await frozen(a.shot, at), G = greyOf(F);
    const crackAt = a.crackAt ?? null;
    const k = E.outCubic(Z.inv(at, a.desatEnd ?? (crackAt ?? at + 1.1), t)) * (a.desat ?? 0.88);
    const q = Math.floor(t * 12 + 1e-6), ph = q % 2 ? 1 : -1, jit = (a.jitter ?? 1.2) * Z.clamp((t - at) / 0.1);
    const push = 1 + (a.push ?? 0.025) * E.inOutSine(Z.inv(at, T1 + 0.4, t));
    const frame = (x, dx, dy) => {
      x.save(); x.translate(W / 2 + ph * jit * 0.9 + dx, H / 2 - ph * jit * 0.55 + dy); x.rotate(ph * 0.0007 * jit); x.scale(push, push);
      x.drawImage(F.c, -W / 2, -H / 2);
      if (k > 0) { x.globalAlpha = k; x.drawImage(G, -W / 2, -H / 2); }
      x.restore();
    };
    const cxy = a.crackXY || [W * 0.57, H * 0.43], ang = a.crackAngle ?? -0.58;
    const geo = crackAt != null ? crackGeom(a.crackSeed ?? 23, cxy[0], cxy[1], ang) : null;
    const dt = crackAt != null ? t - crackAt : -1;
    if (dt < 0.06) frame(ctx, 0, 0);
    else {                                                                    // the frame splits along the crack
      const sep = (a.split ?? 8) * E.outCubic(Z.clamp((dt - 0.06) / Math.max(0.2, T1 - crackAt))) + 1.2;
      const nx = -Math.sin(ang), ny = Math.cos(ang), M = geo.main, e0 = M[0], e1 = M[M.length - 1];
      for (const sg of [1, -1]) {
        ctx.save();
        const poly = [...M, [e1[0] + nx * sg * 5000, e1[1] + ny * sg * 5000], [e0[0] + nx * sg * 5000, e0[1] + ny * sg * 5000]];
        polyPath(ctx, poly); ctx.clip();
        frame(ctx, nx * sg * sep / 2, ny * sg * sep / 2);
        ctx.restore();
      }
    }
    // the stopped world goes cold and flat; the film keeps flickering
    if (k > 0) D.fill(ctx, '#9AA6C4', 0.26 * k, 'multiply');
    D.fill(ctx, '#000', 0.05 * Z.rnd(q, 77) * Z.clamp((t - at) / 0.2));
    // crack
    if (geo && dt >= 0) {
      const grow = E.outExpo(Z.clamp(dt / 0.1)) * geo.reach;
      const sep = dt < 0.06 ? 0 : (a.split ?? 8) * E.outCubic(Z.clamp((dt - 0.06) / Math.max(0.2, T1 - crackAt)));
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'miter';
      // light leaking through the split
      ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(5px)';
      ctx.strokeStyle = 'rgba(255,226,180,0.22)'; ctx.lineWidth = 6 + sep * 1.6;
      for (const hlf of geo.halves) strokeUpTo(ctx, hlf, grow);
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#FBF6EE'; ctx.lineWidth = 1.5 + sep * 0.7;
      for (const hlf of geo.halves) strokeUpTo(ctx, hlf, grow);
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,250,240,0.85)';
      for (const br of geo.branches) strokeUpTo(ctx, br, grow);
      if (grow > 60) { ctx.beginPath(); for (const [p, q] of geo.ring) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); }
      ctx.restore();
      D.glow(ctx, cxy[0], cxy[1], 380, '#FFE3B0', 0.8 * (1 - E.outQuad(Z.clamp(dt / 0.35))));
      D.glow(ctx, cxy[0], cxy[1], 60, '#FFFFFF', 0.9 * (1 - E.outQuad(Z.clamp(dt / 0.5))));
    }
  }

  // ---- rewind (VHS) ---------------------------------------------------------------
  const sortedShots = () => (Z.SHOTS || []).slice().sort((p, q) => p.t0 - q.t0);
  function pickShot(id, ts, self) {
    const base = id ? Z.shotById(id) : null;
    if (base && (ts >= base.t0 - 1e-6 || self.args.follow === false)) return base;
    let s = null;
    for (const x of sortedShots()) { if (x.t0 > ts + 1e-6) break; if (x !== self && x.scene !== 'ref') s = x; }
    return s || base;
  }
  const timecode = s => { s = Math.max(0, s); const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `0:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; };

  async function drawRewind(ctx, S) {
    const a = S.args, t = S.t, T0 = S.shot.t0, dur = S.dur, C = S.clock;
    const span = a.span ?? 3, from = a.from ?? T0;
    const tq = Z.quant(t, a.fps ?? 15), fr = Math.floor(tq * 15 + 1e-6);
    // tape transport: engages slowly, spools up; catches for a moment on every beat (stutter)
    const bi = C.idx(tq), lb = bi >= 0 ? C.beats[bi] : -1, hold = a.hold ?? 0.1;
    const catching = lb > T0 + 0.05 && tq - lb < hold;
    const tt = catching ? lb : tq;
    const u = Z.clamp((tt - T0) / Math.max(0.2, dur - (a.tail ?? 0.12)));
    const f = 0.1 * u + 0.9 * Math.pow(u, 1.8);
    const ts = from - span * f + Z.rnds(fr, 5) * 0.012;
    // source
    const src = buf('rw.src'), sx = wipe(src);
    const shot = pickShot(a.shot, ts, S.shot);
    if (shot) await Z.renderShot(shot.id, ts, sx); else D.fill(sx, '#000');
    // luma: horizontally softened
    const soft = buf('rw.soft', W / 2, H), so = wipe(soft); so.drawImage(src, 0, 0, W / 2, H);
    const out = buf('rw.out'), ox = wipe(out);
    ox.drawImage(soft, 0, 0, W, H);
    // chroma: tiny colour copy, bled to the right, applied as hue/sat only
    const ch = buf('rw.ch', 200, 112), cc = wipe(ch); cc.drawImage(src, 0, 0, 200, 112);
    ox.globalCompositeOperation = 'color'; ox.globalAlpha = 0.9; ox.drawImage(ch, 12, 2, W, H);
    ox.globalCompositeOperation = 'screen'; ox.globalAlpha = 0.22; ox.drawImage(ch, 26, 0, W, H);
    ox.globalAlpha = 1; ox.globalCompositeOperation = 'source-over';
    D.fill(ox, '#1B1733', 0.42, 'screen');                                    // tape black lift
    D.fill(ox, '#D8D2E6', 0.12, 'multiply');
    ox.globalCompositeOperation = 'multiply'; ox.globalAlpha = 0.5; ox.drawImage(scanlines(), 0, 0); ox.globalAlpha = 1; ox.globalCompositeOperation = 'source-over';
    // tracking bands (scroll upward while rewinding)
    const bands = [0, 1, 2].map(b => ({ y: Z.fract(Z.rnd(b, 3) - tq * (0.42 + 0.35 * b) * (b === 2 ? -0.5 : 1)) * (H + 300) - 150, h: 26 + 70 * Z.rnd(b, 5, fr >> 2), s: b === 2 ? 0.45 : 1 }));
    // vertical hold slip when the tape catches
    const vr = catching && tq - lb < 0.07 ? 34 + 20 * Z.rnd(bi, 9) : 0;
    // strips with line jitter
    const SH = 6;
    for (let y = 0; y < H; y += SH) {
      let dx = Z.rnds(y, fr) * 1.8;
      for (const b of bands) { const w = Math.exp(-(((y - b.y) / b.h) ** 2)); if (w > 0.02) dx += w * b.s * (26 + 40 * Z.rnds(y >> 3, fr, 1)); }
      if (y > H - 24) dx += 38 + 20 * Z.rnds(y, fr, 2);                     // head-switching skew
      ctx.drawImage(out, 0, y, W, SH, dx, y - vr, W, SH);
    }
    if (vr) { ctx.fillStyle = '#000'; ctx.fillRect(0, H - vr, W, vr); ctx.fillStyle = 'rgba(240,240,255,0.8)'; ctx.fillRect(0, H - vr + 5, W, 3); }
    // band snow + dropouts
    const st = staticTex();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of bands) {
      ctx.globalAlpha = 0.5 * b.s;
      ctx.drawImage(st, Z.rnd(fr, 1, b.y) * 300, Z.rnd(fr, 2) * 180, 320, 60, 0, b.y - b.h * 0.6, W, b.h * 1.2);
    }
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#F0F0FF';
    for (let d = 0; d < 26; d++) {
      const b = bands[d % 3], yy = b.y + Z.rnds(d, fr) * b.h * 0.8, xx = Z.rnd(d, fr, 3) * W, ww = 20 + 160 * Z.rnd(d, fr, 4) ** 2;
      ctx.fillRect(xx, yy, ww, 1.6);
    }
    ctx.globalAlpha = 0.3; ctx.drawImage(st, Z.rnd(fr, 7) * 300, 0, 320, 12, 0, H - 22, W, 22);
    ctx.restore();
    // OSD (part of the video signal: it jitters with it)
    if (a.osd !== false) {
      ctx.save();
      const ox0 = 118 + Z.rnds(fr, 11) * 1.5, oy0 = 128 - vr;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4; ctx.shadowBlur = 0;
      ctx.fillStyle = '#F2F2F6';
      D.font(ctx, 64, 'dot', 400); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('REW', ox0, oy0);
      const tw = ctx.measureText('REW').width;
      const blink = Math.floor(t * 3) % 2 === 0 || !catching;
      if (blink) for (let j = 0; j < 2; j++) {
        const x0 = ox0 + tw + 26 + j * 38; ctx.beginPath(); ctx.moveTo(x0, oy0); ctx.lineTo(x0 + 40, oy0 - 25); ctx.lineTo(x0 + 40, oy0 + 25); ctx.closePath(); ctx.fill();
      }
      D.font(ctx, 44, 'dot', 400);
      ctx.textAlign = 'right'; ctx.fillText(timecode(ts), W - 120, H - 120 - vr);
      ctx.textAlign = 'left'; ctx.fillText('SP', 118, H - 120 - vr);
      ctx.restore();
    }
  }

  // ---- melt ------------------------------------------------------------------------
  const colCache = new Map();
  function meltCols(seed, n) {
    const key = seed + '|' + n; if (colCache.has(key)) return colCache.get(key);
    const R = Z.rng(seed), avg = W / n, cols = [];
    let x = 0, i = 0;
    while (x < W) {
      const w = Math.min(W - x, Math.max(4, Math.round(avg * R.range(0.55, 1.45))));
      const xc = (x + w / 2) / W;
      // a liquid front: broad smooth waves + a little per-column raggedness; a few columns run fast (drips)
      const d = 0.34 * (0.5 + 0.5 * Z.fbm1(xc * 3.2, seed)) + 0.12 * (0.5 + 0.5 * Z.noise1(xc * 17, seed + 1)) + 0.035 * R();
      const fast = R() < 0.09 ? R.range(1.35, 1.7) : 1;
      const s = (0.78 + 0.44 * (0.5 + 0.5 * Z.fbm1(xc * 7.5, seed + 3))) * fast * R.range(0.93, 1.07);
      cols.push({ x, w, d: Z.clamp(d, 0, 0.6), s, i: i++ });
      x += w;
    }
    colCache.set(key, cols); return cols;
  }

  async function drawMelt(ctx, S) {
    const a = S.args, t = S.t, T0 = S.shot.t0, T1 = S.shot.t1;
    const at = a.at ?? T0;
    if (!Z.shotById(a.shot)) return missing(ctx, 'ref: no shot ' + a.shot);
    let src, cold, hi;
    if (a.live) {
      src = buf('melt.live'); await Z.renderShot(a.shot, at + (t - T0) * (a.rate ?? 0.25), cx2(src));
      cold = coldInto(buf('melt.cold'), src); hi = vsmearInto(buf('melt.hiV'), hiInto(buf('melt.hi'), src));
    } else { const F = await frozen(a.shot, at); src = F.c; cold = coldOf(F); hi = hiVOf(F); }
    const m0 = a.meltAt ?? T0 + 0.45, m1 = a.meltEnd ?? T1;
    const tau = (t - m0) / (m1 - m0);
    const dp = a.depth ?? 0.95, drip = a.drip ?? 0.42, K = 7;
    // the void underneath
    D.vgrad(ctx, [[0, '#010309'], [0.55, '#040B1A'], [1, '#081830']]);
    const cols = meltCols(a.seed ?? 5, a.cols ?? 128);
    ctx.save();
    for (const c of cols) {
      const l = Math.max(0, tau - c.d) / (1 - c.d);
      const y = H * dp * c.s * Math.pow(l, 2.5);                       // the column slides (gravity)
      const dl = H * drip * c.s * Math.pow(l, 1.3);                     // its light oozes further down
      const cool = Z.clamp(l * 1.35);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.drawImage(src, c.x, 0, c.w, H, c.x, y, c.w, H);
      if (cool > 0.01) { ctx.globalAlpha = cool; ctx.drawImage(cold, c.x, 0, c.w, H, c.x, y, c.w, H); }
      if (y > 3) {                                                      // smear left behind above the column
        const tr = Math.min(y, 40 + y * 0.35);
        ctx.globalCompositeOperation = 'lighten';
        for (let k = 1; k <= 3; k++) { ctx.globalAlpha = 0.5 * (1 - k / 4); ctx.drawImage(hi, c.x, 0, c.w, H, c.x, y - tr * k / 3, c.w, H); }
      }
      if (dl > 3) {                                                     // drips: running max downward (bright pixels run)
        ctx.globalCompositeOperation = 'lighten';
        for (let k = 1; k <= K; k++) {
          ctx.globalAlpha = 0.95 * (1 - (k - 1) / (K + 1));
          ctx.drawImage(hi, c.x, 0, c.w, H, c.x, y + dl * k / K, c.w, H);
        }
      }
    }
    ctx.restore();
    // soft, drip-shaped column tops (the front darkens into the void instead of ending in a hard edge)
    ctx.save();
    for (const c of cols) {
      const l = Math.max(0, tau - c.d) / (1 - c.d); if (l <= 0) continue;
      const y = H * dp * c.s * Math.pow(l, 2.5), fall = 22 + 50 * Z.clamp(l * 2);
      const g = ctx.createLinearGradient(0, y - 2, 0, y + fall);
      g.addColorStop(0, 'rgba(2,5,14,1)'); g.addColorStop(1, 'rgba(2,5,14,0)');
      ctx.fillStyle = g; ctx.fillRect(c.x, y - 2, c.w, fall + 2);
    }
    // droplets that detach from the front and fall (closed form in t: detach time per drop, then gravity)
    const nd = a.drops ?? 46, grav = 2600;
    ctx.globalCompositeOperation = 'lighter';
    for (let q = 0; q < nd; q++) {
      const c = cols[Math.floor(Z.rnd(q, 71) * cols.length)];
      const td = c.d + (1 - c.d) * Z.lerp(0.12, 0.85, Z.rnd(q, 72));       // detach at this melt progress
      const t0d = m0 + td * (m1 - m0); if (t < t0d) continue;
      const ld = (td - c.d) / (1 - c.d), y0 = H * dp * c.s * Math.pow(ld, 2.5) + 8;
      const dt = t - t0d, yy = y0 + 0.5 * grav * (0.35 + 0.65 * Z.rnd(q, 73)) * dt * dt;
      if (yy > H + 60) continue;
      const xx = c.x + c.w * Z.rnd(q, 74), v = grav * dt, len = Math.min(140, 6 + v * 0.045), r = 1.6 + 2.2 * Z.rnd(q, 75);
      const al = 0.85 * Z.clamp(dt / 0.08);
      const g = ctx.createLinearGradient(0, yy - len, 0, yy);
      g.addColorStop(0, 'rgba(120,170,255,0)'); g.addColorStop(1, `rgba(200,225,255,${al})`);
      ctx.fillStyle = g; ctx.fillRect(xx - r * 0.5, yy - len, r, len);
      D.glow(ctx, xx, yy, r * 6, '#A8C8FF', 0.55 * al);
    }
    ctx.restore();
    // everything cools toward blue as the pitch falls; the dark closes in from the top
    const tk = Z.clamp(tau);
    if (tk > 0) {
      D.vgrad(ctx, [[0, 'rgba(1,3,9,0.9)'], [0.3 * tk + 0.06, 'rgba(1,3,9,0.3)'], [0.45 * tk + 0.14, 'rgba(1,3,9,0)']], Z.clamp(tk * 2.2));
      D.fill(ctx, '#2E4F9A', 0.22 * tk, 'color');
    }
    if (tau < 0) D.fill(ctx, '#000', 0.12 * Z.clamp((t - T0) / 0.3));   // the stop: a held breath before the melt
  }

  Z.scene('ref', {
    preload: () => [],
    init: async () => { warmup(); try { await document.fonts.load('400 64px "DotGothic16"', 'REW SP 0:12'); } catch (e) { /* font optional */ } staticTex(); scanlines(); },
    draw: nest(async (ctx, S) => {
      const m = S.args.mode || 'freeze';
      if (m === 'rewind') return drawRewind(ctx, S);
      if (m === 'melt') return drawMelt(ctx, S);
      return drawFreeze(ctx, S);
    }),
  });

  // ================================================================ SEQ (Blender image sequences)
  // args: { pattern:'blender/renders/A/f_####.jpg', t0 (default shot t0), fps:30, frames, offset:0, view:{zoom,x,y}, rate:1,
  //         overlay: null | { leak:0..1, flash:0..1 (downbeats), letterbox:0..1, introFlash:s, vignette:0..1, grade:[{color,a,comp}] } }
  const warned = new Set();
  function lightLeak(x, t, amt, seed = 3) {
    const lx = W * (0.88 + 0.16 * Z.noise1(t * 0.23, seed)), ly = H * (0.18 + 0.35 * Z.noise1(t * 0.19, seed + 3));
    const r = H * (1.0 + 0.35 * Z.noise1(t * 0.31, seed + 5)), al = amt * (0.6 + 0.4 * Z.noise1(t * 0.6, seed + 9));
    const g = x.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, Z.rgba('#FFC27A', 0.55 * al)); g.addColorStop(0.35, Z.rgba('#FF6A3A', 0.28 * al)); g.addColorStop(1, 'rgba(255,80,40,0)');
    x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, W, H);
    const lx2 = W * (0.05 + 0.1 * Z.noise1(t * 0.17, seed + 11)), ly2 = H * (0.85 + 0.1 * Z.noise1(t * 0.2, seed + 13)), r2 = H * 0.7;
    const g2 = x.createRadialGradient(lx2, ly2, 0, lx2, ly2, r2);
    g2.addColorStop(0, Z.rgba('#FF4F6A', 0.3 * al)); g2.addColorStop(1, 'rgba(255,79,106,0)');
    x.fillStyle = g2; x.fillRect(0, 0, W, H); x.restore();
  }

  async function drawSeq(ctx, S) {
    const a = S.args, t = S.t, fps = a.fps || 30, t0 = a.t0 ?? S.shot.t0, frames = Math.max(1, a.frames || 1);
    const n = Z.clamp(1 + Math.floor((t - t0) * fps * (a.rate ?? 1) + 1e-6), 1, frames) + (a.offset || 0);
    let img = null;
    if (a.pattern) {
      try { img = await Z.seqFrame(a.pattern, n); } catch (e) { if (!warned.has(a.pattern)) { warned.add(a.pattern); console.warn('seq: missing ' + Z.seqPath(a.pattern, n)); } }
      // prefetch the next frames while this one is composited (content is identical either way: determinism holds)
      if (img && a.prefetch !== 0) for (let k = 1; k <= (a.prefetch ?? 2); k++) { const m = n + k; if (m - (a.offset || 0) <= frames) Z.seqFrame(a.pattern, m).catch(() => {}); }
    }
    if (img && !warmedSeq.has(img)) { warmOne(img); warmedSeq.add(img); }
    if (img) D.cover(ctx, img, a.view || {});
    else {
      D.vgrad(ctx, [[0, '#1B1030'], [1, '#07040C']]);
      ctx.save(); D.font(ctx, 26, 'dot', 400); ctx.fillStyle = 'rgba(244,239,230,0.55)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`SEQ  ${a.pattern || '(no pattern)'}  #${String(n).padStart(4, '0')}`, 80, H - 80);
      ctx.fillStyle = 'rgba(244,239,230,0.35)'; ctx.fillRect(80, H - 60, (W - 160) * (n / frames), 3); ctx.restore();
    }
    const o = a.overlay; if (!o) return;
    for (const tn of o.grade || []) D.fill(ctx, tn.color, tn.a ?? 0.3, tn.comp || 'soft-light');
    if (o.leak) lightLeak(ctx, t, o.leak, o.seed || 3);
    if (o.flash) { const p = S.clock.downPulse(t, 7); if (p > 0.01) D.fill(ctx, o.flashColor || '#FFE3B0', 0.35 * o.flash * p, 'screen'); }
    if (o.vignette) { const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(8,4,14,0)'); g.addColorStop(1, `rgba(8,4,14,${o.vignette})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (o.introFlash) { const k = 1 - Z.clamp((t - S.shot.t0) / o.introFlash); if (k > 0) D.fill(ctx, '#FFF4DC', 0.9 * k * k); }
    if (o.letterbox) {
      const k = E.outExpo(Z.clamp((t - S.shot.t0) / 0.7)) * o.letterbox, bh = 0.1203 * H * k;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    }
  }

  Z.scene('seq', {
    preload: () => [],
    init: async () => { warmup(); try { await document.fonts.load('400 26px "DotGothic16"', 'SEQ #0123456789'); } catch (e) { /* optional */ } },
    draw: nest(drawSeq),
  });
})();
