/* vocaloid-style-mv engine — drawing toolkit shared by all scenes (Canvas2D). Everything is a pure function of its args. */
(() => {
  'use strict';
  const Z = window.Z;
  const W = 1920, H = 1080;
  const D = (Z.draw = {});

  // ---------------------------------------------------------------- framing
  // Draw img to cover the frame. view = { zoom, x, y, rot } where x/y in [-1,1] pan within the spare margin.
  D.cover = (ctx, img, view = {}, alpha = 1) => {
    const zoom = view.zoom ?? 1, rot = view.rot || 0;
    const s = Math.max(W / img.width, H / img.height) * zoom;
    const dw = img.width * s, dh = img.height * s;
    const mx = Math.max(0, (dw - W) / 2), my = Math.max(0, (dh - H) / 2);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(W / 2 + (view.x || 0) * mx, H / 2 + (view.y || 0) * my);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  };
  // interpolate two views
  D.viewLerp = (a, b, k) => ({ zoom: Z.lerp(a.zoom ?? 1, b.zoom ?? 1, k), x: Z.lerp(a.x || 0, b.x || 0, k), y: Z.lerp(a.y || 0, b.y || 0, k), rot: Z.lerp(a.rot || 0, b.rot || 0, k) });

  // camera shake (deterministic, on 2s by default)
  D.shake = (t, amp, fps = 24, seed = 1) => { const q = Math.floor(t * fps); return [Z.rnds(q, seed) * amp, Z.rnds(q, seed + 7) * amp]; };

  // ---------------------------------------------------------------- characters
  // sprite: draw a character image anchored at (x,y) (anchor = bottom-centre by default) with height h.
  // opt: { anchor:[ax,ay], rot, alpha, flip, sway (rad), breathe (0..1), wave:{amp,freq,speed,from} (hair wind strip warp), t }
  D.sprite = (ctx, img, x, y, h, opt = {}) => {
    const s = h / img.height, w = img.width * s;
    const [ax, ay] = opt.anchor || [0.5, 1];
    const t = opt.t || 0;
    ctx.save();
    ctx.globalAlpha *= opt.alpha ?? 1;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y);
    const sway = (opt.sway || 0) * Math.sin(t * 1.3 + (opt.phase || 0));
    ctx.rotate((opt.rot || 0) + sway);
    const br = 1 + (opt.breathe || 0) * 0.012 * Math.sin(t * 2.1 + (opt.phase || 0));
    ctx.scale(opt.flip ? -1 : 1, br);
    const x0 = -w * ax, y0 = -h * ay;
    if (opt.wave && opt.wave.amp) {
      // horizontal strips displaced by a travelling sine, stronger further from `from` (0 = top)
      const N = 90, from = opt.wave.from ?? 0.25, amp = opt.wave.amp, fr = opt.wave.freq ?? 2.2, sp = opt.wave.speed ?? 3.2;
      const tt = opt.wave.q ? Z.quant(t, opt.wave.q) : t;
      for (let i = 0; i < N; i++) {
        const v0 = i / N, v1 = (i + 1) / N;
        const k = Z.clamp((v0 - from) / (1 - from));
        const dx = amp * k * k * Math.sin(v0 * fr * Z.TAU - tt * sp) + amp * 0.35 * k * Math.sin(tt * 1.7 + v0 * 3);
        ctx.drawImage(img, 0, v0 * img.height, img.width, (v1 - v0) * img.height + 1, x0 + dx, y0 + v0 * h, w, (v1 - v0) * h + 1);
      }
    } else ctx.drawImage(img, x0, y0, w, h);
    ctx.restore();
    return { w, h };
  };

  // silhouette (sprite filled with colour) — for shadow play / rim light
  D.silhouette = (ctx, img, x, y, h, color, opt = {}) => {
    const c = Z.tinted(img, color, opt.key || ('sil' + img.width + 'x' + img.height));
    return D.sprite(ctx, c, x, y, h, opt);
  };
  // rim light: draw a tinted copy offset behind
  D.rim = (ctx, img, x, y, h, color, off = [6, -4], opt = {}) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(3px)';
    D.silhouette(ctx, img, x + off[0], y + off[1], h, color, opt);
    ctx.restore();
  };

  // ---------------------------------------------------------------- light
  D.glow = (ctx, x, y, r, color, a = 1) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Z.rgba(color, a)); g.addColorStop(0.25, Z.rgba(color, a * 0.45)); g.addColorStop(1, Z.rgba(color, 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  };
  D.disc = (ctx, x, y, r, color, a = 1) => { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Z.TAU); ctx.fill(); ctx.restore(); };
  // crepuscular rays from (x,y)
  D.rays = (ctx, x, y, n, len, color, a, t, seed = 3) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Z.TAU + Z.rnds(i, seed) * 0.2 + t * 0.02;
      const wdt = 0.02 + 0.05 * Z.rnd(i, seed + 1);
      const al = a * (0.3 + 0.7 * Z.rnd(i, seed + 2)) * (0.6 + 0.4 * Math.sin(t * 0.8 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, len);
      g.addColorStop(0, Z.rgba(color, al)); g.addColorStop(1, Z.rgba(color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, len, ang - wdt, ang + wdt); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- particles (closed-form, deterministic)
  // embers rising: n particles, each with a lifetime loop; area = [x0,y0,x1,y1]
  D.embers = (ctx, t, o = {}) => {
    const n = o.n ?? 80, seed = o.seed ?? 11, [x0, y0, x1, y1] = o.area || [0, 0, W, H];
    const col = o.color || '#FFA552', rise = o.rise ?? 120, size = o.size ?? 3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const life = 3 + 4 * Z.rnd(i, seed), ph = Z.rnd(i, seed + 1) * life;
      const k = Z.fract((t + ph) / life);
      const x = Z.lerp(x0, x1, Z.rnd(i, seed + 2)) + Math.sin(t * (0.6 + Z.rnd(i, seed + 3)) + i) * 30 * k + (o.wind || 0) * k * 200;
      const y = Z.lerp(y1, y0, Z.rnd(i, seed + 4)) - k * rise * life;
      const flick = 0.55 + 0.45 * Math.sin(t * 13 + i * 3.1);
      const a = Math.sin(k * Math.PI) * flick * (o.alpha ?? 1);
      const r = size * (0.5 + Z.rnd(i, seed + 5)) * (1 - k * 0.5);
      if (a <= 0.01) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, Z.rgba('#FFF1D0', a)); g.addColorStop(0.3, Z.rgba(col, a * 0.8)); g.addColorStop(1, Z.rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.restore();
  };
  // fireflies: slow wander, blinking
  D.fireflies = (ctx, t, o = {}) => {
    const n = o.n ?? 40, seed = o.seed ?? 21, [x0, y0, x1, y1] = o.area || [0, H * 0.3, W, H];
    const col = o.color || '#DDFF7A';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = Z.lerp(x0, x1, Z.rnd(i, seed)), by = Z.lerp(y0, y1, Z.rnd(i, seed + 1));
      const x = bx + Z.fbm1(t * 0.25 + i, seed) * 160, y = by + Z.fbm1(t * 0.22 + i * 1.7, seed + 5) * 90;
      const blink = Math.pow(Z.clamp(Math.sin(t * (0.9 + Z.rnd(i, seed + 2)) + i * 2.3)), 3) * (o.alpha ?? 1);
      if (blink < 0.02) continue;
      const r = (o.size ?? 3) * (0.7 + Z.rnd(i, seed + 3) * 0.8);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
      g.addColorStop(0, Z.rgba('#F6FFE0', blink)); g.addColorStop(0.2, Z.rgba(col, blink * 0.7)); g.addColorStop(1, Z.rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    }
    ctx.restore();
  };
  // rain streaks
  D.rain = (ctx, t, o = {}) => {
    const n = o.n ?? 260, seed = o.seed ?? 31, ang = o.angle ?? 0.18, sp = o.speed ?? 1900, len = o.len ?? 60;
    ctx.save(); ctx.strokeStyle = o.color || 'rgba(200,220,255,0.35)'; ctx.lineWidth = o.width ?? 1.4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = Z.rnd(i, seed) * (W + 400) - 200, ph = Z.rnd(i, seed + 1);
      const y = Z.fract(ph + t * sp / (H + 200) * (0.8 + 0.4 * Z.rnd(i, seed + 2))) * (H + 200) - 100;
      const dx = Math.sin(ang) * len, dy = Math.cos(ang) * len;
      ctx.moveTo(x + y * Math.tan(ang), y); ctx.lineTo(x + y * Math.tan(ang) + dx, y + dy);
    }
    ctx.stroke(); ctx.restore();
  };
  // dust motes in light
  D.dust = (ctx, t, o = {}) => {
    const n = o.n ?? 70, seed = o.seed ?? 41;
    ctx.save(); ctx.fillStyle = o.color || 'rgba(255,230,190,0.5)';
    for (let i = 0; i < n; i++) {
      const x = Z.fract(Z.rnd(i, seed) + t * 0.004 * (1 + Z.rnd(i, seed + 3))) * W;
      const y = Z.fract(Z.rnd(i, seed + 1) + Math.sin(t * 0.3 + i) * 0.01 - t * 0.003) * H;
      const r = 0.8 + 2.2 * Z.rnd(i, seed + 2);
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.7 + i));
      ctx.beginPath(); ctx.arc(x, y, r, 0, Z.TAU); ctx.fill();
    }
    ctx.restore();
  };
  // falling feathers (simple drawn shapes) — tegaki style
  D.feathers = (ctx, t, o = {}) => {
    const n = o.n ?? 14, seed = o.seed ?? 51;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const life = 6 + 4 * Z.rnd(i, seed), k = Z.fract((t + Z.rnd(i, seed + 1) * life) / life);
      const x = Z.rnd(i, seed + 2) * W + Math.sin(k * 7 + i) * 120, y = -80 + k * (H + 160);
      const rot = Math.sin(k * 9 + i) * 0.9, s = (0.6 + Z.rnd(i, seed + 3) * 0.8) * (o.size ?? 1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
      ctx.fillStyle = o.color || 'rgba(244,239,230,0.92)'; ctx.strokeStyle = o.line || 'rgba(20,11,30,0.9)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.bezierCurveTo(16, -30, 18, 10, 2, 44); ctx.bezierCurveTo(-14, 16, -16, -24, 0, -46); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.quadraticCurveTo(3, 0, 1, 50); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- glass cracks (voronoi-ish network grown from impact points)
  // returns a cached list of polylines for (seed, cx, cy); draw with D.cracks(ctx, lines, progress, style)
  const crackCache = new Map();
  D.crackNet = (seed, cx, cy, n = 22, reach = 1100) => {
    const key = seed + '|' + cx + '|' + cy + '|' + n;
    if (crackCache.has(key)) return crackCache.get(key);
    const R = Z.rng(seed), lines = [];
    for (let i = 0; i < n; i++) {                                        // radial cracks
      const a0 = (i / n) * Z.TAU + R.range(-0.12, 0.12);
      let x = cx, y = cy, a = a0; const pts = [[x, y]]; let L = 0; const maxL = reach * R.range(0.45, 1);
      while (L < maxL) { const st = R.range(30, 90); a += R.range(-0.28, 0.28); x += Math.cos(a) * st; y += Math.sin(a) * st; L += st; pts.push([x, y, L / maxL]); }
      lines.push({ pts, w: R.range(1.2, 3.6), d0: 0 });
    }
    for (let ring = 1; ring <= 4; ring++) {                              // concentric connectors
      const rr = ring * reach * R.range(0.12, 0.2);
      for (let i = 0; i < n; i++) {
        if (R() < 0.35) continue;
        const a0 = (i / n) * Z.TAU, a1 = ((i + 1) / n) * Z.TAU; const pts = [];
        for (let k = 0; k <= 4; k++) { const a = Z.lerp(a0, a1, k / 4); const r = rr * R.range(0.9, 1.1); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]); }
        lines.push({ pts, w: R.range(0.8, 2), d0: ring * 0.18 });
      }
    }
    crackCache.set(key, lines); return lines;
  };
  D.cracks = (ctx, lines, prog, o = {}) => {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [{ c: o.glow || '#FFA552', w: 5, a: 0.55, comp: 'lighter', blur: 'blur(4px)' }, { c: o.core || '#FFF3D6', w: 1, a: 1, comp: 'source-over', blur: 'none' }]) {
      ctx.globalCompositeOperation = pass.comp; ctx.filter = pass.blur; ctx.strokeStyle = Z.rgba(pass.c, pass.a * (o.alpha ?? 1));
      for (const ln of lines) {
        const local = Z.clamp((prog - ln.d0) / (1 - ln.d0 + 1e-6));
        if (local <= 0) continue;
        const n = ln.pts.length, upto = local * (n - 1);
        ctx.lineWidth = ln.w * pass.w * (o.width ?? 1);
        ctx.beginPath(); ctx.moveTo(ln.pts[0][0], ln.pts[0][1]);
        for (let i = 1; i < n; i++) {
          if (i > upto + 1) break;
          const f = Math.min(1, upto - (i - 1));
          const [xa, ya] = ln.pts[i - 1], [xb, yb] = ln.pts[i];
          ctx.lineTo(Z.lerp(xa, xb, f), Z.lerp(ya, yb, f));
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- typography
  Z.FONT = {
    mincho: '"Shippori Mincho B1"', minchoHeavy: '"Zen Old Mincho"', tokumin: '"Kaisei Tokumin"', serif: '"Noto Serif JP"',
    gothic: '"Zen Kaku Gothic New"', dela: '"Dela Gothic One"', sans: '"Noto Sans JP"', hand: '"Klee One"', brush: '"Yuji Syuku"', dot: '"DotGothic16"',
  };
  D.font = (ctx, size, fam = 'mincho', weight = 700) => { ctx.font = `${weight} ${size}px ${Z.FONT[fam] || fam}, "Noto Serif JP", serif`; };

  const ROT_V = new Set([...'ー―…‥〜～－（）「」『』【】〈〉《》［］｛｝→←—']);
  const PUNCT_V = new Set([...'、。，．']);
  const SMALL_V = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
  // vertical text column; returns glyph boxes. o: { size, fam, weight, pitch, color, stroke, strokeW, reveal (0..1 chars shown), glow }
  D.vtext = (ctx, text, x, yTop, o = {}) => {
    const size = o.size || 96, pitch = o.pitch || 1.04, chars = [...text];
    D.font(ctx, size, o.fam || 'mincho', o.weight || 700);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const shown = o.reveal == null ? chars.length : o.reveal * chars.length;
    let y = yTop + size / 2;
    chars.forEach((ch, i) => {
      const k = Z.clamp(shown - i);
      if (k > 0) {
        let gx = x, gy = y, rot = 0;
        if (ROT_V.has(ch)) rot = Math.PI / 2; else if (PUNCT_V.has(ch)) { gx += size * 0.55; gy -= size * 0.55; } else if (SMALL_V.has(ch)) { gx += size * 0.1; gy -= size * 0.1; }
        ctx.save(); ctx.translate(gx, gy + (1 - k) * size * 0.25); ctx.rotate(rot); ctx.globalAlpha *= k;
        if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowR || 24; }
        if (o.stroke) { ctx.lineWidth = o.strokeW || size * 0.08; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ch, 0, 0); }
        ctx.fillStyle = o.color || '#F4EFE6'; ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
      y += size * pitch;
    });
    return { x, y0: yTop, y1: y, size };
  };
  // horizontal text with per-char reveal / stagger. o: { size, fam, weight, color, stroke, glow, align, reveal, spacing, jitter }
  D.htext = (ctx, text, x, y, o = {}) => {
    const size = o.size || 96, chars = [...text];
    D.font(ctx, size, o.fam || 'mincho', o.weight || 700);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const sp = (o.spacing ?? 0) * size;
    const widths = chars.map(c => ctx.measureText(c).width + sp);
    const total = widths.reduce((a, b) => a + b, 0) - sp;
    let cx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
    const shown = o.reveal == null ? chars.length : o.reveal * chars.length;
    chars.forEach((ch, i) => {
      const k = Z.clamp(shown - i);
      if (k > 0) {
        ctx.save();
        const jx = o.jitter ? Z.rnds(i, o.jitterSeed || 0) * o.jitter : 0, jy = o.jitter ? Z.rnds(i, (o.jitterSeed || 0) + 9) * o.jitter : 0;
        ctx.translate(cx + widths[i] / 2 + jx, y + jy + (1 - k) * size * 0.3); ctx.globalAlpha *= k;
        if (o.scaleIn) ctx.scale(Z.lerp(o.scaleIn, 1, Z.ease.outBack(k)), Z.lerp(o.scaleIn, 1, Z.ease.outBack(k)));
        ctx.textAlign = 'center';
        if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowR || 24; }
        if (o.stroke) { ctx.lineWidth = o.strokeW || size * 0.08; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ch, 0, 0); }
        ctx.fillStyle = o.color || '#F4EFE6'; ctx.fillText(ch, 0, 0);
        ctx.restore();
      }
      cx += widths[i];
    });
    return { x0: cx - total, x1: cx, w: total };
  };

  // halftone dot field (screentone) inside a rect, dot size from a function of position
  D.halftone = (ctx, rect, step, fn, color = '#140B1E') => {
    const [x0, y0, x1, y1] = rect; ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    for (let y = y0; y < y1; y += step) for (let x = x0 + ((Math.round((y - y0) / step) % 2) * step) / 2; x < x1; x += step) {
      const r = fn(x, y) * step * 0.5; if (r > 0.3) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Z.TAU); }
    }
    ctx.fill(); ctx.restore();
  };

  // screen-space overlay helpers
  D.fill = (ctx, color, a = 1, comp = 'source-over') => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = comp; ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore(); };
  D.vgrad = (ctx, stops, a = 1, comp = 'source-over', rect = [0, 0, W, H]) => {
    const [x0, y0, x1, y1] = rect; const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [k, c] of stops) g.addColorStop(k, c);
    ctx.save(); ctx.globalCompositeOperation = comp; ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore();
  };
})();
