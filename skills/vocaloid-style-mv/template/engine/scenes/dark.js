/* vocaloid-style-mv scenes: dark — the night-side set pieces.
 *
 *   thread {hand, light, stops, kickAt, arriveAt}                         shot 06   ribbon → one travelling thread toward a far point of light
 *   fall   {char, freeze:[[t0,t1]], pulse:[t], vp:[x,y], speed, h}        shot 12   falling toward a tiny square of dawn; time-freeze on the stop
 *   flame  {mode:'breathe'|'grow'|'dark', img, face, stops:[[t0,t1]], flameAt, zoomAt, zoomTo, igniteAt}   shots 15 / 31 / 50
 *   ink    {char, seed, h, x, y}                                          shot 46   sumi tendrils curl around her in a pale fog void
 *
 * Pure functions of song time. The only integration (fall speed) runs from the shot start with a fixed dt.
 * Drawn things (thread, flame tongues, ink growth, hair) move on 12 fps; camera, light and particles run on full time.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const CH = 'assets/char/';
  const cl = Z.clamp, lerp = Z.lerp, inv = Z.inv, sm = Z.smooth;
  const DBG = (Z.__darkDebug = {});

  // =====================================================================================
  // local helpers
  // =====================================================================================
  const bufs = new Map();
  const buf = (key, w = W, h = H) => { let c = bufs.get(key); if (!c) { c = Z.canvas(w, h); bufs.set(key, c); } return c; };
  const fresh = c => { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, c.width, c.height); return x; };
  const cover = x => x.fillRect(-2400, -2400, W + 4800, H + 4800);             // fill "everything" in world space
  const scaledT = (m, s) => [m.a * s, m.b * s, m.c * s, m.d * s, m.e * s, m.f * s];

  // audio stops (kind 'stop') overlapping [a,b], as [[t0,t1]...]
  const audioStops = (a, b, kinds = ['stop']) => ((Z.audio && Z.audio.stops) || []).filter(s => kinds.includes(s.kind) && s.end > a && s.start < b).map(s => [s.start, s.end]);
  // song time with frozen intervals removed: motion holds during a stop and resumes after it
  const heldTime = (t, stops) => { let d = 0; for (const [a, b] of stops) d += cl(t - a, 0, b - a); return t - d; };
  // eased count of beats passed in (ta, t]: steps up on each beat
  const beatSteps = (clock, ta, t, len = 0.25, ease = E.outExpo) => {
    let c = 0; for (let k = clock.beat(ta + 1e-4) + 1, guard = 0; guard < 64; k++, guard++) { const bt = clock.at(k); if (bt > t) break; c += ease(cl((t - bt) / len)); }
    return c;
  };

  // ---- polylines
  const catmull = (P, per = 16) => {
    const out = [], m = P.length;
    for (let k = 0; k < m - 1; k++) {
      const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(m - 1, k + 2)];
      for (let j = 0; j < per; j++) {
        const f = j / per, f2 = f * f, f3 = f2 * f, o = [0, 0];
        for (let c = 0; c < 2; c++) o[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * f3);
        out.push(o);
      }
    }
    out.push([P[m - 1][0], P[m - 1][1]]); return out;
  };
  const resample = (P, n) => {                           // n+1 points evenly spaced by arc length
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[cum.length - 1], out = []; let j = 0;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L; while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      out.push([lerp(P[j][0], P[j + 1][0], f), lerp(P[j][1], P[j + 1][1], f)]);
    }
    return { pts: out, len: L };
  };
  const normals = P => P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; return [-ty / l, tx / l]; });
  const polyline = (x, P) => { x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]); };
  // variable-width ribbon (tapered stroke) appended to the current path
  const ribbon = (x, P, wd) => {
    const n = P.length; if (n < 2) return; const N = normals(P);
    x.moveTo(P[0][0] + N[0][0] * wd[0] / 2, P[0][1] + N[0][1] * wd[0] / 2);
    for (let i = 1; i < n; i++) x.lineTo(P[i][0] + N[i][0] * wd[i] / 2, P[i][1] + N[i][1] * wd[i] / 2);
    for (let i = n - 1; i >= 0; i--) x.lineTo(P[i][0] - N[i][0] * wd[i] / 2, P[i][1] - N[i][1] * wd[i] / 2);
    x.closePath();
  };

  // ---- layers
  // fn draws (in the caller's world space) into a low-res buffer; it is blurred there and added to ctx (cheap glow / bleed)
  const soft = (ctx, key, scale, blur, alpha, fn, comp = 'lighter') => {
    const w = Math.round(W * scale), h = Math.round(H * scale), A0 = buf(key + ':a', w, h), B0 = buf(key + ':b', w, h);
    const xa = fresh(A0); xa.setTransform(...scaledT(ctx.getTransform(), scale)); fn(xa, scale);
    const xb = fresh(B0); xb.filter = `blur(${blur}px)`; xb.drawImage(A0, 0, 0); xb.filter = 'none';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = comp; ctx.globalAlpha = alpha; ctx.drawImage(B0, 0, 0, W, H); ctx.restore();
  };
  // metaball ("gooey") mask: black shapes on white at low res → blur + contrast → multiplied onto ctx
  const gooey = (ctx, key, scale, blur, contrast, fn, alpha = 1) => {
    const M = 60, w = Math.round((W + 2 * M) * scale), h = Math.round((H + 2 * M) * scale), A0 = buf(key + ':a', w, h), B0 = buf(key + ':b', w, h);
    const xa = fresh(A0); xa.fillStyle = '#fff'; xa.fillRect(0, 0, w, h);
    const m = ctx.getTransform(); xa.setTransform(m.a * scale, m.b * scale, m.c * scale, m.d * scale, (m.e + M) * scale, (m.f + M) * scale);
    xa.fillStyle = '#000'; fn(xa);
    const xb = fresh(B0); xb.fillStyle = '#fff'; xb.fillRect(0, 0, w, h); xb.filter = `blur(${blur}px) contrast(${contrast})`; xb.drawImage(A0, 0, 0); xb.filter = 'none';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha;
    ctx.drawImage(B0, M * scale, M * scale, W * scale, H * scale, 0, 0, W, H); ctx.restore();
  };
  // draw a sprite (paint(x) in world space, may be many drawImage calls) through a light model:
  // shade(x) runs with 'source-atop' (inside the sprite only); o.multiply(x) is an optional colour multiply.
  // The shaded sprite stays in buf('lit') (screen space) until the next lit() call.
  const lit = (ctx, paint, shade, o = {}) => {
    const M = buf('litM'), xm = fresh(M); xm.setTransform(ctx.getTransform()); paint(xm);
    const c = buf('lit'), x = fresh(c); x.drawImage(M, 0, 0); x.setTransform(ctx.getTransform());
    if (shade) { x.save(); x.globalCompositeOperation = 'source-atop'; shade(x); x.restore(); }
    if (o.multiply) {
      x.save(); x.globalCompositeOperation = 'multiply'; o.multiply(x); x.restore();
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(M, 0, 0); x.restore();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= o.alpha ?? 1; if (o.comp) ctx.globalCompositeOperation = o.comp; ctx.drawImage(c, 0, 0); ctx.restore();
    return c;
  };
  // placement of an image: image point (px,py) at world (x,y), scale s, rotation r
  const placed = (img, px, py, x, y, s, r = 0) => {
    const c = Math.cos(r), sn = Math.sin(r);
    return {
      img, s, r,
      map: (u, v) => { const dx = (u - px) * s, dy = (v - py) * s; return [x + dx * c - dy * sn, y + dx * sn + dy * c]; },
      dir: (du, dv) => [du * c - dv * sn, du * sn + dv * c],
      apply: q => { q.translate(x, y); if (r) q.rotate(r); q.scale(s, s); q.translate(-px, -py); },
    };
  };
  const vignette = (ctx, a, r0 = 0.35, rgb = '6,3,10') => {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * r0, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  };
  // inner rim light: the part of the silhouette within (dx,dy) of its edge on the side the light comes from (cached)
  // light from direction L lights the edge facing L: pass (dx,dy) = -L * width, e.g. light from above → (0, +w)
  const rimCache = new Map();
  const innerRim = (img, dx, dy, color) => {
    const key = img.width + 'x' + img.height + color + dx + ',' + dy; if (rimCache.has(key)) return rimCache.get(key);
    const c = Z.canvas(img.width, img.height), x = c.getContext('2d');
    x.drawImage(Z.tinted(img, color, 'irim' + key), 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(img, dx, dy);
    rimCache.set(key, c); return c;
  };
  // hair/ribbon wind: horizontal strips of the TOP part of the image (v < split) displaced by a wave travelling to the tips
  const hairWarp = (x, src, tq, split, amp, freq = 1.4, speed = 8) => {
    const w = src.width, h = src.height, sy = Math.round(h * split);
    x.drawImage(src, 0, sy, w, h - sy, 0, sy, w, h - sy);
    const N = 30;
    for (let i = 0; i < N; i++) {
      const y0 = Math.round(sy * i / N), y1 = Math.round(sy * (i + 1) / N), vm = (y0 + y1) / 2 / sy, k = Math.pow(1 - vm, 1.6);
      const dx = amp * k * Math.sin(TAU * freq * (1 - vm) - tq * speed) + amp * 0.4 * k * Math.sin(tq * 2.3 + vm * 4);
      x.drawImage(src, 0, y0, w, y1 - y0 + 1, dx, y0, w, y1 - y0 + 1);
    }
  };
  // the same on vertical columns right of u0 (hair blowing sideways), displaced vertically
  const colWarp = (x, src, tq, u0, amp, freq = 1.1, speed = 3.2) => {
    const w = src.width, h = src.height, sx = Math.round(w * u0);
    x.drawImage(src, 0, 0, sx, h, 0, 0, sx, h);
    const N = 36;
    for (let i = 0; i < N; i++) {
      const xa = sx + Math.round((w - sx) * i / N), xb = sx + Math.round((w - sx) * (i + 1) / N), um = ((xa + xb) / 2 - sx) / (w - sx), k = Math.pow(um, 1.5);
      const dy = amp * k * Math.sin(TAU * freq * um - tq * speed) + amp * 0.3 * k * Math.sin(tq * 1.9 + um * 3);
      x.drawImage(src, xa, 0, xb - xa + 1, h, xa, dy, xb - xa + 1, h);
    }
  };
  // soft noise texture (cached): for fog / nebula / ink density
  const texCache = new Map();
  const noiseTex = (key, n, rmin, rmax, amin, amax, seed, w = 480, h = 270) => {
    if (texCache.has(key)) return texCache.get(key);
    const c = Z.canvas(w, h), x = c.getContext('2d'), R = Z.rng(seed);
    for (let i = 0; i < n; i++) {
      const px = R() * w, py = R() * h, r = lerp(rmin, rmax, R() * R()), a = lerp(amin, amax, R());
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        if (px + ox + r < 0 || px + ox - r > w || py + oy + r < 0 || py + oy - r > h) continue;
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, 2 * r, 2 * r);
      }
    }
    texCache.set(key, c); return c;
  };
  // draw a tileable texture scrolled by (ox,oy) screen px, scaled to cover the frame
  const scrollTex = (ctx, tex, ox, oy, sw, sh) => {
    const x0 = ((ox % sw) + sw) % sw - sw, y0 = ((oy % sh) + sh) % sh - sh;
    for (let yy = y0; yy < H; yy += sh) for (let xx = x0; xx < W; xx += sw) ctx.drawImage(tex, xx, yy, sw, sh);
  };

  // closed-form rising embers from a source: each loops with its own lifetime and re-spawns at a new seeded spot
  const embers = (ctx, t, o) => {
    const n = o.n | 0, seed = o.seed || 5, [l0, l1] = o.life || [1.4, 2.8];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const life = lerp(l0, l1, Z.rnd(i, seed)), cyc = t / life + Z.rnd(i, seed + 1), k = Z.fract(cyc), gen = Math.floor(cyc), age = k * life;
      const sx = o.x + Z.rnds(i, gen, seed + 2) * o.spread, sy = o.y + Z.rnds(i, gen, seed + 3) * o.spread * 0.25;
      const x = sx + Math.sin(age * (1.3 + Z.rnd(i, seed + 4) * 2.2) + i) * (o.wob ?? 16) * k + Z.rnds(i, gen, seed + 5) * (o.drift ?? 70) * k;
      const y = sy - (o.rise ?? 140) * age - 18 * age * age;
      const a = (o.alpha ?? 1) * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.1)), 0.6) * (0.6 + 0.4 * Math.sin(t * 17 + i * 2.3));
      if (a < 0.02) continue;
      const r = (o.size || 2.4) * (0.5 + Z.rnd(i, seed + 6)) * (1 - 0.55 * k);
      const col = k < 0.3 ? '#FFD08A' : k < 0.6 ? '#FFA552' : '#F0663A';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, Z.rgba('#FFF4DA', a)); g.addColorStop(0.25, Z.rgba(col, a * 0.8)); g.addColorStop(1, Z.rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.restore();
  };

  // the vermilion thread: soft glow + tapered body + specular core + frayed fibres at the free end
  const fibrePaths = (P, nb, nf, o) => {
    const N = normals(P), out = [];
    for (let j = 0; j < (o.fibres ?? 7); j++) {
      const sp = Z.rnds(j, 71) * (o.spread ?? 18), reach = 0.45 + 0.55 * Z.rnd(j, 72), cu = Z.rnds(j, 73);
      const m = Math.max(3, Math.round(nf * reach)), F = [];
      for (let i = 0; i < m; i++) {
        const k = nb - 1 + i, v = i / (nf - 1);
        const off = sp * Math.pow(v, 1.35) + cu * 7 * Math.sin(v * 7 + (o.t || 0) * 2.5 + j) * v;
        F.push([P[k][0] + N[k][0] * off, P[k][1] + N[k][1] * off]);
      }
      out.push(F);
    }
    return out;
  };
  const threadDraw = (ctx, P, o) => {
    const n = P.length; if (n < 4) return;
    const nf = Math.max(3, Math.round(n * (o.fray ?? 0.16))), nb = n - nf + 1, body = P.slice(0, nb);
    const wd = body.map((_, i) => { const u = i / (nb - 1); return lerp(o.w1, o.w0, Math.pow(1 - u, o.taper ?? 2.2)); });
    const fib = fibrePaths(P, nb, nf, o);
    const glowPass = (x, wmul) => {
      x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = o.glowColor || '#FF4A30';
      x.lineWidth = (o.glowW || 10) * wmul; x.beginPath(); polyline(x, body); x.stroke();
      x.lineWidth = (o.glowW || 10) * wmul * 0.45; x.beginPath(); for (const F of fib) polyline(x, F); x.stroke();
    };
    soft(ctx, (o.key || 'thr') + 'w', 0.25, (o.blur ?? 3) * 3, (o.glow ?? 0.7) * 0.55, x => glowPass(x, 2.2));
    soft(ctx, (o.key || 'thr') + 'n', 0.5, (o.blur ?? 3), (o.glow ?? 0.7), x => glowPass(x, 1));
    ctx.save();
    ctx.fillStyle = o.color || '#C8373A'; ctx.beginPath(); ribbon(ctx, body, wd); ctx.fill();
    ctx.strokeStyle = o.hi || '#FF9A78'; ctx.globalAlpha = o.hiA ?? 0.75; ctx.lineWidth = Math.max(0.7, o.w1 * 0.55); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); polyline(ctx, body.slice(0, Math.max(2, nb - 1))); ctx.stroke();
    ctx.lineWidth = o.fw || 1; ctx.strokeStyle = o.fibre || o.hi || '#FF9A78';
    for (const F of fib) {
      for (let seg = 0; seg < 3; seg++) {
        const i0 = Math.floor(seg * (F.length - 1) / 3), i1 = Math.floor((seg + 1) * (F.length - 1) / 3); if (i1 <= i0) continue;
        ctx.globalAlpha = (o.fibreA ?? 0.9) * (1 - seg / 3.2);
        ctx.beginPath(); polyline(ctx, F.slice(i0, i1 + 1)); ctx.stroke();
      }
    }
    ctx.restore();
  };

  // =====================================================================================
  // 06 · thread — 「ほどけた糸みたいな明日を」
  // Dark violet. Her wrist ribbon unravels into one vermilion thread that floats across the frame toward a far point of
  // light. The thread grows while a travelling wave runs along it; it holds on the stop, and the accent after the stop
  // launches a tug that whips along the thread and lands on the next beat as a flare of the light.
  // =====================================================================================
  const HR = { pivot: [230, 1480], tail: [845, 968], tailDir: [0.52, 0.86] };    // hand_reach.png landmarks (image px)

  Z.scene('thread', {
    preload: a => [a.hand || CH + 'hand_reach.png'],
    draw(ctx, S) {
      const a = S.args, t = S.t, t0 = S.shot.t0, t1 = S.shot.t1, dur = S.dur, clock = S.clock;
      const img = Z.imgSync(a.hand || CH + 'hand_reach.png');
      const stops = a.stops || audioStops(t0, t1);
      const te = heldTime(t, stops), tq = Z.quant(te, 12);
      const kickT = a.kickAt ?? (stops.length ? stops[stops.length - 1][1] : t0 + dur * 0.74);
      const arriveT = a.arriveAt ?? Math.max(kickT + 0.2, clock.at(clock.beat(kickT) + 1));
      const L = a.light || [1700, 250];
      const pe = E.inOutSine(cl((t - t0) / dur));
      // growth of the thread (fraction of the full path): shoots out, slows as it nears the light, completes on the tug
      const gIn = inv(t0 + 0.06, kickT - 0.12, te);
      const g = cl(0.02 + 0.9 * (1 - Math.pow(1 - gIn, 2.4)) + 0.08 * E.outExpo(inv(kickT, arriveT, t)));
      const tugU = (t - kickT) / Math.max(0.1, arriveT - kickT);
      const arrive = t >= arriveT ? Math.exp(-(t - arriveT) * 2.6) : 0;
      const beat = clock.pulse(tq, 6);

      // ---- camera: slow push that drifts toward the light
      const camZ = 1 + 0.06 * pe, camX = -70 * pe, camY = 20 * pe;
      const cam = k => { ctx.translate(W / 2, H / 2); const z = 1 + (camZ - 1) * k; ctx.scale(z, z); ctx.translate(-W / 2 + camX * k, -H / 2 + camY * k); };

      // ---- background field (parallax 0.35): violet dark, a nebula of breath around the light
      ctx.save(); cam(0.35);
      ctx.fillStyle = '#0A0511'; cover(ctx);
      let gr = ctx.createRadialGradient(L[0], L[1], 0, L[0], L[1], 1700);
      gr.addColorStop(0, '#4E1F56'); gr.addColorStop(0.15, '#31143C'); gr.addColorStop(0.45, '#1B0C26'); gr.addColorStop(1, 'rgba(10,5,17,0)');
      ctx.fillStyle = gr; cover(ctx);
      gr = ctx.createRadialGradient(260, 980, 0, 260, 980, 1000);
      gr.addColorStop(0, 'rgba(58,34,96,0.55)'); gr.addColorStop(1, 'rgba(58,34,96,0)');
      ctx.fillStyle = gr; cover(ctx);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const neb = noiseTex('neb', 70, 30, 150, 0.04, 0.16, 5);
      ctx.globalAlpha = 0.22; ctx.filter = 'none';
      const tint = Z.tinted(neb, '#8C3C8C', 'neb-v');
      scrollTex(ctx, tint, -t * 9, t * 4, 2400, 1350);
      ctx.globalAlpha = 0.14; scrollTex(ctx, Z.tinted(neb, '#C0506A', 'neb-r'), t * 14 + 700, -t * 6 + 300, 1900, 1070);
      ctx.restore();

      // ---- far dust (parallax 0.6)
      ctx.save(); cam(0.6); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 80; i++) {
        const x = Z.fract(Z.rnd(i, 301) + t * 0.004 * (0.5 + Z.rnd(i, 302))) * (W + 200) - 100;
        const y = Z.fract(Z.rnd(i, 303) - t * 0.006 * (0.5 + Z.rnd(i, 304))) * (H + 200) - 100;
        const r = 0.7 + 1.5 * Z.rnd(i, 307), al = (0.15 + 0.4 * Z.rnd(i, 308)) * (0.55 + 0.45 * Math.sin(t * (0.7 + Z.rnd(i, 309)) + i));
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2); gg.addColorStop(0, Z.rgba('#E6B6E8', al)); gg.addColorStop(1, 'rgba(230,182,232,0)');
        ctx.fillStyle = gg; ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
      }
      ctx.restore();

      // ---- main layer: light, hand, thread
      ctx.save(); cam(1);
      const lp = 0.3 + 0.5 * g + 0.9 * arrive + 0.12 * clock.downPulse(t, 4);
      D.glow(ctx, L[0], L[1], 420 * (0.75 + 0.5 * lp), '#7A2350', 0.32 * lp);
      D.glow(ctx, L[0], L[1], 160 * (0.8 + 0.6 * lp), '#F0663A', 0.32 * lp);

      const rot = (a.handRot ?? 0.1) + 0.035 * E.inOutSine(inv(t0, t1, tq)) + 0.007 * Math.sin(tq * 1.9) + 0.012 * (t >= kickT ? Math.exp(-(t - kickT) * 4) : 0);
      const hs = (a.handH ?? 1120) / img.height;
      const pl = placed(img, HR.pivot[0], HR.pivot[1], a.handX ?? 150, a.handY ?? 1200, hs, rot);
      const paintHand = src => x => { x.save(); pl.apply(x); x.drawImage(src, 0, 0); x.restore(); };
      lit(ctx, paintHand(img), x => {
        const gg = x.createLinearGradient(L[0], L[1], 80, H + 40);
        gg.addColorStop(0, 'rgba(26,8,36,0)'); gg.addColorStop(0.6, 'rgba(26,8,36,0.16)'); gg.addColorStop(1, 'rgba(14,5,22,0.62)');
        x.fillStyle = gg; cover(x);
        x.fillStyle = 'rgba(92,40,120,0.12)'; cover(x);
      });
      // thin warm rim on the edges that face the light (upper right)
      const rim = innerRim(img, -7, 6, '#FFB08A');
      ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * lp; paintHand(rim)(ctx);
      ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(4px)'; ctx.globalAlpha = 0.35 + 0.3 * lp; paintHand(rim)(ctx); ctx.restore();

      // thread path: from the ribbon's lower tail, a low float, then a long S rising toward the light
      const T0 = pl.map(HR.tail[0], HR.tail[1]), td = pl.dir(HR.tailDir[0], HR.tailDir[1]);
      const X = f => lerp(T0[0], L[0], f), Y = f => lerp(T0[1], L[1], f);
      const ctrl0 = [T0, [T0[0] + td[0] * 70, T0[1] + td[1] * 70], [X(0.2), Y(0.0) + 95], [X(0.4), Y(0.1) + 70], [X(0.58), Y(0.36)], [X(0.76), Y(0.66) - 10], [X(0.92), Y(0.9) - 6], [L[0] - 40, L[1] + 62]];
      const ctrl = ctrl0.map((c, i) => (i < 2 ? c : [c[0] + Z.fbm1(tq * 0.35 + i * 3.1, 11) * 30, c[1] + Z.fbm1(tq * 0.3 + i * 5.7, 12) * 30]));
      const base = resample(catmull(ctrl, 20), 300).pts, Nn = normals(base), n = base.length;
      const P = base.map((q, i) => {
        const u = i / (n - 1);
        const A = 30 * sm(0, 0.25, u) * (0.45 + 0.9 * u) * (1 + 0.45 * beat);
        const wv = Math.sin(TAU * 2.1 * u - 3.4 * tq) + 0.35 * Math.sin(TAU * 4.7 * u - 6.1 * tq + 1.7);
        const bump = tugU > -0.3 && tugU < 1.5 ? Math.exp(-Math.pow((u - tugU) / 0.075, 2)) * 64 * sm(0, 0.12, u) * (1 - 0.35 * cl(tugU)) : 0;
        const d = A * wv - bump;
        return [q[0] + Nn[i][0] * d, q[1] + Nn[i][1] * d];
      });
      const vis = P.slice(0, Math.max(5, Math.round(g * (n - 1)) + 1));
      threadDraw(ctx, vis, { key: 'thr06', t: tq, w0: 7.5, w1: 1.7, taper: 3.2, fray: 0.2, fibres: 12, spread: 34, fw: 1.1, glow: 0.8 + 0.35 * arrive, glowW: 9 });

      // motes shed by the frayed end, drifting toward the light
      const end = vis[vis.length - 1];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const k = Z.fract(t * (0.35 + 0.25 * Z.rnd(i, 401)) + Z.rnd(i, 402));
        const x = lerp(end[0], L[0], k * 0.55) + Z.rnds(i, 403) * 80 * k + Math.sin(t * 2 + i) * 8;
        const y = lerp(end[1], L[1], k * 0.55) + Z.rnds(i, 404) * 60 * k;
        const al = Math.sin(Math.PI * k) * (0.35 + 0.65 * arrive) * 0.85, r = 1.1 + 1.5 * Z.rnd(i, 405);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3); gg.addColorStop(0, Z.rgba('#FFC39A', al)); gg.addColorStop(1, 'rgba(255,120,80,0)');
        ctx.fillStyle = gg; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      }
      // the point of light: core + anamorphic streak + faint cross
      const cr = 2.4 + 2.6 * lp;
      gr = ctx.createRadialGradient(L[0], L[1], 0, L[0], L[1], cr * 6);
      gr.addColorStop(0, Z.rgba('#FFFBF0', 1)); gr.addColorStop(0.18, Z.rgba('#FFE3B0', 0.9)); gr.addColorStop(1, 'rgba(255,165,82,0)');
      ctx.fillStyle = gr; ctx.fillRect(L[0] - cr * 6, L[1] - cr * 6, cr * 12, cr * 12);
      const sw = 160 + 340 * lp;
      gr = ctx.createLinearGradient(L[0] - sw, 0, L[0] + sw, 0);
      gr.addColorStop(0, 'rgba(255,150,110,0)'); gr.addColorStop(0.5, Z.rgba('#FFD2B0', cl(0.3 * lp, 0, 0.6))); gr.addColorStop(1, 'rgba(255,150,110,0)');
      ctx.fillStyle = gr; ctx.fillRect(L[0] - sw, L[1] - 1.1, 2 * sw, 2.2);
      const vh = 40 + 90 * lp;
      gr = ctx.createLinearGradient(0, L[1] - vh, 0, L[1] + vh);
      gr.addColorStop(0, 'rgba(255,200,160,0)'); gr.addColorStop(0.5, Z.rgba('#FFE3B0', cl(0.22 * lp, 0, 0.5))); gr.addColorStop(1, 'rgba(255,200,160,0)');
      ctx.fillStyle = gr; ctx.fillRect(L[0] - 0.8, L[1] - vh, 1.6, 2 * vh);
      ctx.restore();
      ctx.restore();

      // ---- foreground bokeh (parallax 1.5): a few out-of-focus violet discs
      ctx.save(); cam(1.5); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = lerp(-100, W + 100, Z.rnd(i, 501)) + t * (6 + 8 * Z.rnd(i, 502)), y = lerp(80, H - 60, Z.rnd(i, 503)) - t * 5;
        const r = 50 + 70 * Z.rnd(i, 504), al = 0.035 + 0.03 * Z.rnd(i, 505);
        const gg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r); gg.addColorStop(0, Z.rgba('#B070C0', al)); gg.addColorStop(0.92, Z.rgba('#C88AD0', al * 1.4)); gg.addColorStop(1, 'rgba(200,138,208,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
      vignette(ctx, 0.6, 0.32, '5,2,9');
    },
  });

  // =====================================================================================
  // 12 · fall — 「ねぇどこまで落ちれば / 朝に触れられるの」
  // She falls backward down a dark shaft; light streaks and bokeh rush up past her toward a tiny square of dawn at the
  // vanishing point. Time freezes on the stop (only film grain keeps moving); on 「朝に」 the dawn square pulses and a
  // square ring of light leaves it; the kick restarts the fall with a surge.
  // =====================================================================================
  const FALL = { pivot: [448, 812], ribbon: [793, 502] };                  // fall.png landmarks (image px)
  let streakSprite = null;
  const getStreakSprite = () => {
    if (streakSprite) return streakSprite;
    const c = Z.canvas(64, 512), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.18, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.filter = 'blur(10px)'; x.fillRect(22, 20, 20, 472);
    return (streakSprite = c);
  };

  Z.scene('fall', {
    preload: a => [a.char || CH + 'fall.png'],
    draw(ctx, S) {
      const a = S.args, t = S.t, t0 = S.shot.t0, t1 = S.shot.t1;
      const img = Z.imgSync(a.char || CH + 'fall.png');
      const frz = a.freeze || audioStops(t0, t1);
      const te = heldTime(t, frz), tq = Z.quant(te, 12), t1h = heldTime(t1, frz);
      const pe = cl((te - t0) / Math.max(0.1, t1h - t0));
      const kickH = frz.length ? heldTime(frz[0][1], frz) : -1e9;
      const pulses = a.pulse || (frz.length ? [frz[0][1] - 0.04] : []);
      // fall speed (world units / s), integrated from the shot start with a fixed dt → deterministic for any t
      const spd = τ => (a.speed ?? 1) * (0.85 + 0.3 * sm(t0 + 0.6, t0 + 1.4, τ) + (τ > kickH ? 1.8 * Math.exp(-(τ - kickH) * 2.4) : 0) + 0.8 * sm(t1h - 0.9, t1h, τ));
      let dist = 0; { const dt = 1 / 120; for (let τ = t0; τ < te - 1e-9; τ += dt) { const h = Math.min(dt, te - τ); dist += h * spd(τ + h / 2); } }
      const v = spd(te);
      const pul = pulses.reduce((m, pt) => Math.max(m, t >= pt ? Math.exp(-(t - pt) * 3.0) : 0), 0);
      const vp = a.vp || [1040, 84];
      const bt = S.clock.pulse(te, 7);

      // camera: slow roll + push
      const rot = -0.05 + 0.08 * E.inOutSine(pe) + 0.016 * Math.sin(te * 0.9 + 1);
      const zoom = 1.0 + 0.07 * E.inOutSine(pe);
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);

      // ---- abyss + the dawn's faint shaft of air
      ctx.fillStyle = '#03070D'; cover(ctx);
      let g = ctx.createRadialGradient(vp[0], vp[1], 0, vp[0], vp[1], 1400);
      g.addColorStop(0, '#1A3A56'); g.addColorStop(0.2, '#0D2135'); g.addColorStop(0.55, '#061220'); g.addColorStop(1, 'rgba(3,7,13,0)');
      ctx.fillStyle = g; cover(ctx);
      soft(ctx, 'fallcone', 0.25, 10, 1, x => {
        const gg = x.createLinearGradient(vp[0], vp[1], vp[0], vp[1] + 1050);
        gg.addColorStop(0, Z.rgba('#FFB070', 0.2 + 0.3 * pul)); gg.addColorStop(0.35, Z.rgba('#8A6A80', 0.08 + 0.07 * pul)); gg.addColorStop(1, 'rgba(60,70,100,0)');
        x.fillStyle = gg; x.beginPath(); x.moveTo(vp[0] - 12, vp[1]); x.lineTo(vp[0] + 12, vp[1]); x.lineTo(vp[0] + 380, vp[1] + 1100); x.lineTo(vp[0] - 380, vp[1] + 1100); x.closePath(); x.fill();
      });

      // ---- the dawn square (far away, behind everything)
      const sq = lerp(22, 14, pe) * (1 + 0.9 * pul) * (1 + 0.08 * bt);
      D.glow(ctx, vp[0], vp[1], 420 + 380 * pul, '#F0663A', 0.10 + 0.22 * pul);
      D.glow(ctx, vp[0], vp[1], 80 + 150 * pul, '#FFA552', 0.55 + 0.4 * pul);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = Z.rgba('#FFE3B0', 0.9); ctx.fillRect(vp[0] - sq / 2 - 1.5, vp[1] - sq / 2 - 1.5, sq + 3, sq + 3);
      ctx.fillStyle = '#FFFBF0'; ctx.fillRect(vp[0] - sq / 2, vp[1] - sq / 2, sq, sq);
      for (const pt of pulses) {                                     // square rings leaving the dawn on 「朝に」
        for (const [lag, amp] of [[0, 1], [0.12, 0.5]]) {
          const k = inv(pt + lag, pt + lag + 1.1, t); if (k <= 0 || k >= 1) continue;
          const r = 14 + 900 * E.outCubic(k);
          ctx.strokeStyle = Z.rgba('#FFE3B0', amp * 0.6 * Math.pow(1 - k, 1.6)); ctx.lineWidth = 1 + 3.5 * (1 - k);
          ctx.strokeRect(vp[0] - r, vp[1] - r, 2 * r, 2 * r);
        }
      }
      ctx.restore();

      // ---- streaks + bokeh rushing up toward the vanishing point (three depth tiers)
      const dmax = 1500;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const streak = (i, seed, rate, bright, wmul, lmul) => {
        const th = lerp(0.03, 0.97, Z.rnd(i, seed)) * Math.PI;
        const k = Z.fract(Z.rnd(i, seed + 1) + dist * rate * (0.7 + 0.6 * Z.rnd(i, seed + 2)));
        const z = 1 + 9 * k, d = dmax * (0.7 + 0.6 * Z.rnd(i, seed + 3)) / z;
        const len = Math.min(1300, ((d * d / dmax) * (0.28 + 0.42 * v) + 8) * lmul);
        const cx = Math.cos(th), cy = Math.sin(th);
        const hx = vp[0] + cx * d, hy = vp[1] + cy * d, tx = hx + cx * len, ty = hy + cy * len;
        const al = sm(0, 0.06, k) * (1 - sm(0.4, 0.95, k)) * (0.2 + 0.8 * Z.rnd(i, seed + 4)) * bright;
        if (al < 0.02) return;
        const warm = Z.rnd(i, seed + 5) < 0.1;
        const lg = ctx.createLinearGradient(hx, hy, tx, ty);
        lg.addColorStop(0, Z.rgba(warm ? '#FFC58A' : '#E0EEFF', al)); lg.addColorStop(0.3, Z.rgba(warm ? '#FF9A5A' : '#8FB2C9', al * 0.5)); lg.addColorStop(1, Z.rgba(warm ? '#F0663A' : '#3F6284', 0));
        ctx.strokeStyle = lg; ctx.lineWidth = (0.5 + 2.4 * d / dmax) * wmul;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      };
      for (let i = 0; i < 150; i++) streak(i, 1, 0.24, 0.6, 1, 1);
      for (let i = 0; i < 26; i++) streak(i, 11, 0.36, 1.0, 1.8, 1.5);
      for (let i = 0; i < 40; i++) {
        const th = lerp(0.02, 0.98, Z.rnd(i, 21)) * Math.PI;
        const k = Z.fract(Z.rnd(i, 22) + dist * (0.08 + 0.1 * Z.rnd(i, 23)));
        const z = 1 + 7 * k, d = dmax * (0.6 + 0.7 * Z.rnd(i, 24)) / z;
        const x = vp[0] + Math.cos(th) * d, y = vp[1] + Math.sin(th) * d, r = 3 + 48 * Math.pow(d / dmax, 1.6);
        const al = sm(0, 0.1, k) * (1 - sm(0.5, 1, k)) * (0.35 + 0.65 * Z.rnd(i, 25)) * (0.8 + 0.5 * bt);
        if (al < 0.02) continue;
        const col = Z.rnd(i, 26) < 0.15 ? '#FFB27A' : Z.rnd(i, 27) < 0.5 ? '#7FC4EA' : '#4A8CB8';
        ctx.save(); ctx.translate(x, y); ctx.rotate(th); ctx.scale(1 + 0.5 * v, 1);                 // bokeh stretched along its motion
        ctx.fillStyle = Z.rgba(col, 0.12 * al); ctx.strokeStyle = Z.rgba(col, 0.32 * al); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();

      // ---- her (camera follows imperfectly: bob + slow tumble)
      const bob = [Z.fbm1(te * 0.45, 3) * 24, Z.fbm1(te * 0.38, 9) * 18];
      const s = (a.h ?? 940) / img.height;
      const tumble = 0.05 - 0.07 * E.inOutSine(pe) + 0.012 * Math.sin(tq * 1.2);
      const pl = placed(img, FALL.pivot[0], FALL.pivot[1], 960 + bob[0], 610 + bob[1], s, tumble);
      const hairAmp = 12 + 7 * v;
      const paint = src => x => { x.save(); pl.apply(x); hairWarp(x, src, tq, 0.24, hairAmp); x.restore(); };
      lit(ctx, paint(img), x => {
        const yTop = pl.map(448, 150)[1], yBot = pl.map(448, 1600)[1];
        const gg = x.createLinearGradient(0, yTop, 0, yBot);
        gg.addColorStop(0, Z.rgba('#08121F', 0.1)); gg.addColorStop(0.45, 'rgba(8,18,31,0.4)'); gg.addColorStop(1, 'rgba(4,9,17,0.78)');
        x.fillStyle = gg; cover(x);
        x.fillStyle = 'rgba(20,58,86,0.24)'; cover(x);
      });
      // rim lights inside her silhouette: warm from the dawn above, cold from the rushing light below
      const rw = innerRim(img, 0, 10, '#FFC890'), rc = innerRim(img, 0, -9, '#6FB8E8');
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * pul; paint(rw)(ctx);
      ctx.globalAlpha = 0.45; paint(rc)(ctx);
      ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(5px)';
      ctx.globalAlpha = 0.45 + 0.5 * pul; paint(rw)(ctx);
      ctx.globalAlpha = 0.3; paint(rc)(ctx);
      ctx.restore();

      // ---- the red thread from her ribbon streams up, fluttering in the updraft
      const r0 = pl.map(FALL.ribbon[0], FALL.ribbon[1]);
      const ux0 = 0.28, uy0 = -0.96, TL = 250 + 50 * v;
      const [ux, uy] = [ux0 * Math.cos(tumble) - uy0 * Math.sin(tumble), ux0 * Math.sin(tumble) + uy0 * Math.cos(tumble)], px = -uy, py = ux;
      const ctrl = [r0, [r0[0] + ux * TL * 0.2 + px * 14, r0[1] + uy * TL * 0.2 + py * 14], [r0[0] + ux * TL * 0.5 - px * 22, r0[1] + uy * TL * 0.5 - py * 22], [r0[0] + ux * TL * 0.8 + px * 18, r0[1] + uy * TL * 0.8 + py * 18], [r0[0] + ux * TL + px * 30, r0[1] + uy * TL + py * 30]];
      const bp = resample(catmull(ctrl, 14), 110).pts, bn = normals(bp);
      const TP = bp.map((q, i) => { const u = i / (bp.length - 1), d = (6 + 30 * u) * u * (Math.sin(TAU * 1.7 * u - tq * 10) + 0.35 * Math.sin(TAU * 3.9 * u - tq * 16 + 1)); return [q[0] + bn[i][0] * d, q[1] + bn[i][1] * d]; });
      threadDraw(ctx, TP, { key: 'thr12', t: tq, w0: 7, w1: 1.4, taper: 2, fray: 0.26, fibres: 9, spread: 22, glow: 0.55, glowW: 8 });

      // ---- updraft motes + near streaks passing in front of her (soft, fast, out of focus)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 60; i++) {
        const k = Z.fract(Z.rnd(i, 81) + dist * (0.9 + 0.8 * Z.rnd(i, 82)));
        const x = lerp(-100, W + 100, Z.rnd(i, 83)), y = lerp(H + 80, -80, k), len = 10 + 40 * v * Z.rnd(i, 84);
        ctx.strokeStyle = Z.rgba('#BFD8F0', 0.25 * Z.rnd(i, 85) * sm(0, 0.1, k) * (1 - sm(0.85, 1, k))); ctx.lineWidth = 1 + Z.rnd(i, 86);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      const spr = getStreakSprite();
      for (let i = 0; i < 7; i++) {
        const k = Z.fract(Z.rnd(i, 51) + dist * (0.55 + 0.35 * Z.rnd(i, 52)));
        const x0 = lerp(120, 1800, Z.rnd(i, 53)), x = lerp(x0, vp[0], 0.25 * k), y = lerp(H + 700, -900, k);
        const sc = 1.6 + 2.2 * Z.rnd(i, 54), al = (0.07 + 0.1 * Z.rnd(i, 55)) * sm(0, 0.15, k) * (1 - sm(0.8, 1, k)) * (0.6 + 0.5 * v);
        ctx.globalAlpha = al; ctx.drawImage(spr, x - 32 * sc, y, 64 * sc, 512 * sc * (0.8 + 0.5 * v));
      }
      ctx.restore();

      ctx.restore();   // camera
      vignette(ctx, 0.7, 0.3, '2,5,10');
    },
  });

  // =====================================================================================
  // 15 / 31 / 50 · flame — 「もう それでも 消えないで」 / 「小さな火が消えない」 / 「怖くても」
  // =====================================================================================
  // flame landmarks per image: [coreX, coreY, baseY, maskRx, maskRy, coreR] (image px)
  const FLAME_AT = {
    'assets/char/flame_hands.png': [588, 632, 662, 150, 235, 46],
    'assets/char/alt/flame_hands.png': [527, 655, 688, 130, 210, 42],
  };
  // the painted flame is removed once (diffusion in-paint) so the procedural flame is the only light source;
  // the crop edges of the painting (top / left / right) are feathered so they never read as hard lines
  const deflameCache = new Map();
  const deflamed = (key, img, fa) => {
    if (deflameCache.has(key)) return deflameCache.get(key);
    const c = Z.canvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const [cx, cy, , rx, ry, cr] = fa, ecx = cx, ecy = cy - ry * 0.3;
    const x0 = Math.max(0, Math.floor(ecx - rx - 6)), y0 = Math.max(0, Math.floor(ecy - ry - 6));
    const x1 = Math.min(img.width, Math.ceil(ecx + rx + 6)), y1 = Math.min(img.height, Math.ceil(ecy + ry + 6));
    const w = x1 - x0, h = y1 - y0, id = x.getImageData(x0, y0, w, h), d = id.data;
    let m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const X = x0 + i, Y = y0 + j; if (((X - ecx) / rx) ** 2 + ((Y - ecy) / ry) ** 2 > 1) continue;
      const k = (j * w + i) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
      const flame = r > 170 && b < 0.45 * r && g > 0.3 * r;
      const core = Math.hypot(X - cx, Y - cy) < cr && r + g + b > 540;
      if (flame || core) m[j * w + i] = 1;
    }
    for (let it = 0; it < 3; it++) {
      const m2 = m.slice();
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const q = j * w + i; if (!m[q] && (m[q - 1] || m[q + 1] || m[q - w] || m[q + w])) m2[q] = 1; }
      m = m2;
    }
    const F = new Float32Array(w * h * 3); let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let q = 0; q < w * h; q++) if (!m[q]) { sr += d[q * 4]; sg += d[q * 4 + 1]; sb += d[q * 4 + 2]; sn++; }
    for (let q = 0; q < w * h; q++) { if (m[q]) { F[q * 3] = sr / sn * 0.6; F[q * 3 + 1] = sg / sn * 0.6; F[q * 3 + 2] = sb / sn * 0.6; } else { F[q * 3] = d[q * 4]; F[q * 3 + 1] = d[q * 4 + 1]; F[q * 3 + 2] = d[q * 4 + 2]; } }
    const idx = []; for (let q = 0; q < w * h; q++) { const i = q % w, j = (q / w) | 0; if (m[q] && i > 0 && j > 0 && i < w - 1 && j < h - 1) idx.push(q); }
    for (let it = 0; it < 220; it++) for (const q of idx) for (let c3 = 0; c3 < 3; c3++) F[q * 3 + c3] = 0.25 * (F[(q - 1) * 3 + c3] + F[(q + 1) * 3 + c3] + F[(q - w) * 3 + c3] + F[(q + w) * 3 + c3]);
    for (const q of idx) { d[q * 4] = F[q * 3]; d[q * 4 + 1] = F[q * 3 + 1]; d[q * 4 + 2] = F[q * 3 + 2]; }
    x.putImageData(id, x0, y0);
    // feather the crop edges
    x.globalCompositeOperation = 'destination-out';
    const fe = (gx0, gy0, gx1, gy1, rx0, ry0, rw, rh) => { const g = x.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(rx0, ry0, rw, rh); };
    const fw = Math.round(img.width * 0.09);
    fe(16, 0, 16 + fw, 0, 0, 0, 16 + fw, img.height);
    fe(img.width - 16, 0, img.width - 16 - fw, 0, img.width - 16 - fw, 0, 16 + fw, img.height);
    fe(0, 16, 0, 16 + fw * 0.8, 0, 0, img.width, 16 + fw * 0.8);
    deflameCache.set(key, c); DBG.deflamed = c; return c;
  };

  // one tongue of a cel flame appended to the current path. base (bx,by), height h, half-width w, lean, 12-fps time, seed
  const tongue = (x, bx, by, h, w, lean, t, sd) => {
    const N = 18, Lp = [], Rp = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, sw = Math.pow(s, 1.6);
      const cx = bx + lean * h * Math.pow(s, 1.4) + h * 0.13 * sw * Math.sin(t * 7.3 + sd * 2.1 - s * 3.4) + h * 0.05 * sw * Math.sin(t * 12.9 + sd * 5 - s * 6.5);
      const prof = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.5)), 1.25) * (1 + 0.09 * Math.sin(s * 13 - t * 9 + sd * 3));
      const y = by - h * s, ww = w * prof;
      Lp.push([cx - ww, y]); Rp.push([cx + ww, y]);
    }
    x.moveTo(Lp[0][0], Lp[0][1]); for (const q of Lp) x.lineTo(q[0], q[1]); for (let i = N; i >= 0; i--) x.lineTo(Rp[i][0], Rp[i][1]); x.closePath();
  };
  const FLAME_LAYERS = [['#E0452C', 1.0, 0], ['#FF7A2E', 0.8, 0.05], ['#FFB445', 0.6, 0.1], ['#FFE6A6', 0.4, 0.14], ['#FFFDF5', 0.22, 0.17]];
  // procedural anime flame. (x,y) = base of the flame; size = height at I = 1; I = intensity (0 = out, 1 = normal, 2 = roaring)
  const drawFlame = (ctx, x, y, size, I, tq, o = {}) => {
    if (I <= 0.003) return 0;
    const fl = 1 + 0.08 * Z.noise1(tq * 6, 3) + 0.05 * Z.noise1(tq * 13, 7);
    const h = size * (0.14 + 0.86 * Math.pow(I, 0.85)) * fl, w = h * (0.26 + 0.24 * (1 - cl(I)));
    const Ia = Math.pow(cl(I, 0, 2), 0.8), gl = o.glow ?? 1;
    D.glow(ctx, x, y - h * 0.4, h * 3.2, '#FF4A20', 0.16 * Ia * gl);
    D.glow(ctx, x, y - h * 0.32, h * 1.1, '#FFB35C', 0.2 * Ia * gl);
    const n = (f, s) => Z.noise1(tq * f, s);
    // [dx (× w), height, width, lean, seed, base lift (× h)]
    const T = [[0, 1, 1, 0, 0, 0], [-0.5, 0.56 + 0.16 * n(5, 11), 0.5, -0.3, 1, 0.1], [0.52, 0.5 + 0.18 * n(5.5, 12), 0.46, 0.34, 2, 0.12],
      [-0.22, 0.78 + 0.14 * n(4, 13), 0.4, -0.1, 3, 0.04], [0.26, 0.7 + 0.14 * n(4.5, 14), 0.36, 0.14, 4, 0.05]];
    ctx.save();
    if (I < 0.6) {                                                  // guttering: the blue root of a dying flame
      const b = 1 - I / 0.6;
      const gg = ctx.createRadialGradient(x, y - h * 0.15, 0, x, y - h * 0.15, w * 1.3);
      gg.addColorStop(0, Z.rgba('#9FC0FF', 0.9 * b)); gg.addColorStop(0.55, Z.rgba('#3A6BD8', 0.55 * b)); gg.addColorStop(1, 'rgba(58,107,216,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gg; ctx.fillRect(x - w * 1.4, y - h * 0.15 - w * 1.4, w * 2.8, w * 2.8); ctx.globalCompositeOperation = 'source-over';
    }
    if (I > 0.25) for (let j = 0; j < 3; j++) {                     // wisps that tear off the tip and rise
      const ph = tq * (1.3 + 0.3 * j) + j / 3, k = Z.fract(ph), sd = Math.floor(ph);
      const wx = x + Z.rnds(sd, j, 61) * w * 0.9 + Math.sin(k * 5 + j) * w * 0.3, wy = y - h * (0.88 + 0.8 * k);
      const ws = h * 0.2 * (1 - k) * cl((I - 0.25) * 2);
      if (ws < 1) continue;
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillStyle = '#FF7A2E'; ctx.beginPath(); tongue(ctx, wx, wy, ws, ws * 0.3, 0, tq, 20 + j); ctx.fill();
      ctx.fillStyle = '#FFD27A'; ctx.beginPath(); tongue(ctx, wx, wy - ws * 0.05, ws * 0.55, ws * 0.15, 0, tq, 20 + j); ctx.fill();
    }
    ctx.globalAlpha = o.alpha ?? 1;
    for (const [col, k, lift] of FLAME_LAYERS) {
      ctx.fillStyle = col; ctx.beginPath();
      for (const [dx, th, tw, lean, sd, bl] of T) { if (k < 0.5 && sd > 2) continue; tongue(ctx, x + dx * w * k, y - (lift + bl * k) * h, h * th * Math.pow(k, 0.9), w * tw * k, lean, tq, sd); }
      ctx.fill();
    }
    ctx.restore();
    return h;
  };
  // relight sparks: a closed-form burst (age = seconds since the burst)
  const sparks = (ctx, x, y, age, scale, n = 30, seed = 9) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const life = 0.45 + 0.7 * Z.rnd(i, seed); if (age > life) continue;
      const th = -Math.PI / 2 + Z.rnds(i, seed + 1) * 1.25, sp = (380 + 820 * Z.rnd(i, seed + 2)) * scale, kd = 3.2;
      const pos = tt => { const f = (1 - Math.exp(-kd * tt)) / kd; return [x + Math.cos(th) * sp * f, y + Math.sin(th) * sp * f - 60 * scale * tt * tt]; };
      const [ax, ay] = pos(Math.max(0, age - 0.035)), [bx, by] = pos(age), k = age / life;
      ctx.strokeStyle = Z.rgba(k < 0.4 ? '#FFF1C8' : '#FFA552', 0.95 * (1 - k)); ctx.lineWidth = (1.2 + 1.6 * Z.rnd(i, seed + 3)) * scale * (1 - 0.5 * k);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.restore();
  };
  // re-composite the fingertips (from the lit character layer) over the base of the flame so it sits IN her hands
  const frontFingers = (ctx, litC, bx, by, s) => {
    const c = buf('fing'), x = fresh(c);
    x.drawImage(litC, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    const R = 230 * s, cy = by - 222 * s;                              // big circle above: its outside (below the fingertip arc) is kept
    const g = x.createRadialGradient(bx, cy, R - 14 * s, bx, cy, R + 12 * s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g; x.fillRect(bx - 170 * s, by - 60 * s, 340 * s, 260 * s);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore();
  };

  function flameHands(ctx, S, mode) {
    const a = S.args, t = S.t, t0 = S.shot.t0, t1 = S.shot.t1, p = S.p, clock = S.clock;
    const path = a.img || CH + 'flame_hands.png', img = Z.imgSync(path);
    const fa = a.flameAt || FLAME_AT[path] || [img.width * 0.5, img.height * 0.45, img.height * 0.48, 140, 220, 40];
    const base = deflamed(path, img, fa);
    const tq = Z.quant(t, 12);
    const stops = a.stops || audioStops(t0, t1);
    let I, s, fx, fy, flood = 0, white = 0, spark = -1, emb = 6;

    if (mode === 'grow') {
      // the flame grows beat by beat; warm light floods the frame; the camera pulls back to reveal her face
      const nBeats = Math.max(1, beatSteps(clock, t0, t1 - 0.02, 0.001));
      const G = 0.5 * E.inOutSine(p) + 0.5 * beatSteps(clock, t0, t) / nBeats;
      I = 0.55 + 1.0 * G + 0.08 * clock.pulse(t, 7) + 0.1 * clock.downPulse(t, 5);
      const k = E.inOutCubic(p);
      s = lerp(1.24, 1.0, k); fx = 960; fy = lerp(560, 608, k);
      flood = sm(0.05, 0.95, G); emb = Math.round(10 + 60 * G);
    } else {
      // breathe: the flame breathes with the voice; it gutters on the stop, relights, swells; the last beat zooms into it → white
      const tz = a.zoomAt ?? clock.at(clock.beat(t1 - 0.06));
      const push = E.inOutSine(inv(t0, tz, t)), zk = inv(tz, t1, t);
      s = lerp(0.98, 1.1, push) * Math.exp(Math.log(a.zoomTo || 16) * E.inCubic(zk));
      fx = 960; fy = lerp(lerp(590, 612, push), 540, E.inOutSine(zk));
      I = 0.82 + 0.08 * Math.sin(TAU * (t - t0) / (4 * clock.spb)) + 0.1 * clock.pulse(t, 6) + 0.1 * S.env.vocal(t);
      I *= sm(t0 - 0.1, t0 + 0.3, t);
      let lastEnd = t0;
      for (const [a0, a1] of stops) {
        const gut = sm(a0 - 0.01, a0 + 0.07, t) * (1 - sm(a1 - 0.03, a1 + 0.04, t));
        I = lerp(I, 0.03 + 0.035 * (0.5 + 0.5 * Z.noise1(t * 22, 5)), gut);
        if (t >= a1 - 0.03) I *= 1 + 0.6 * Math.exp(-Math.max(0, t - a1) * 5) * sm(a1 - 0.03, a1 + 0.05, t);
        if (t >= a1) spark = t - a1;
        lastEnd = Math.max(lastEnd, a1);
      }
      I *= 1 + 0.25 * E.inOutSine(inv(lastEnd, tz, t)) + 1.6 * E.inQuad(zk);
      white = E.inCubic(inv(tz + 0.1, t1, t));
      emb = Math.round(6 + 14 * cl(I - 0.5));
    }
    const light = Math.max(0, I) * (1 + 0.035 * Z.noise1(t * 24, 17));
    const ix = fx - fa[0] * s, iy = fy - fa[1] * s, bx = fx, by = fy + (fa[2] - fa[1]) * s;

    // ---- the dark (and the warm flood of the grown flame)
    D.fill(ctx, '#040205');
    if (flood > 0) {
      const g = ctx.createRadialGradient(bx, by - 60 * s, 0, bx, by - 60 * s, 1500);
      g.addColorStop(0, Z.rgba('#F0663A', 0.85 * flood)); g.addColorStop(0.25, Z.rgba('#C8373A', 0.65 * flood)); g.addColorStop(0.55, Z.rgba('#7A2350', 0.5 * flood)); g.addColorStop(1, Z.rgba('#3A1745', 0.4 * flood));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      D.rays(ctx, bx, by - 80 * s, 18, 1600, '#FFA552', 0.07 * flood, t, 5);
    }
    // ---- her, lit only by the flame
    const R = s * (170 + 1100 * Math.pow(Math.min(light, 1.6), 0.9)) * (1 + 0.5 * flood);
    const dmax = lerp(0.95, 0.5, flood), lvl = cl(0.62 - light) * 0.95;
    const litC = lit(ctx, x => x.drawImage(base, ix, iy, img.width * s, img.height * s), x => {
      const g = x.createRadialGradient(fx, fy, R * 0.05, fx, fy, R);
      g.addColorStop(0, 'rgba(8,3,8,0)'); g.addColorStop(0.3, `rgba(8,3,8,${dmax * 0.3})`); g.addColorStop(0.7, `rgba(8,3,8,${dmax * 0.82})`); g.addColorStop(1, `rgba(6,2,6,${dmax})`);
      x.fillStyle = g; cover(x);
      if (lvl > 0) { x.fillStyle = `rgba(6,2,6,${lvl})`; cover(x); }
    });
    D.glow(ctx, fx, fy - 20 * s, R * 0.45, '#FF6A2A', 0.05 * Math.min(light, 1.6));
    // ---- the flame, held in her hands
    const h = drawFlame(ctx, bx, by, 250 * s, I, tq, { glow: mode === 'grow' ? 0.8 : 1 });
    frontFingers(ctx, litC, bx, by, s);
    D.glow(ctx, bx, by - h * 0.25, h * 0.9, '#FF8A3A', 0.12 * Math.min(light, 1.6));
    if (spark >= 0 && spark < 1.3) sparks(ctx, bx, by - h * 0.45, spark, s, 34);
    embers(ctx, t, { n: emb, x: bx, y: by - h * 0.7, spread: 45 * s, rise: 150 * s, life: [1.1, 2.4], size: 2.3 * s, alpha: cl(0.4 + 0.6 * I, 0, 1), seed: 17 });
    if (flood > 0) embers(ctx, t, { n: Math.round(50 * flood), x: W / 2, y: H + 30, spread: 1000, rise: 170, life: [2.2, 4.2], size: 2.8, alpha: 0.8 * flood, seed: 23, drift: 120 });
    vignette(ctx, lerp(0.75, 0.5, flood), 0.3, '4,1,4');
    if (white > 0) D.fill(ctx, '#FFF6E8', white);
  }

  function flameDark(ctx, S) {
    const a = S.args, t = S.t, t0 = S.shot.t0, p = S.p, clock = S.clock;
    const img = Z.imgSync(a.face || CH + 'bust_calm.png');
    const tq = Z.quant(t, 12);
    const st0 = audioStops(t0 - 0.05, t0 + 0.3).find(s => s[0] <= t0 + 0.1);
    const ign = a.igniteAt ?? (st0 ? st0[1] : t0 + 0.12);
    const hb = clock.pulse(t, 9) + 0.55 * clock.pulse(t - 0.16, 12);        // lub-dub on every beat
    let I = sm(ign - 0.05, ign + 0.05, t) * (1 + 0.6 * Math.exp(-Math.max(0, t - ign) * 5));
    I *= (0.64 + 0.36 * Math.min(1.2, hb)) * (1 + 0.05 * Z.noise1(t * 20, 4));
    for (const [a0, a1] of a.stops || []) I *= 1 - sm(a0 - 0.02, a0 + 0.05, t) * (1 - sm(a1 - 0.02, a1 + 0.1, t));
    D.fill(ctx, '#030204');
    if (I <= 0.002) return;
    const s = (a.h ?? 1190) / img.height * (1 + 0.045 * E.inOutSine(p)) * (1 + 0.006 * hb);
    const fp = a.faceAt || [430, 330], fs = a.facePos || [930, 410];
    const ix = fs[0] - fp[0] * s, iy = fs[1] - fp[1] * s + 18 * (1 - E.outCubic(p));
    const L = [fs[0] + 50, H + 170];
    D.glow(ctx, L[0], H + 60, 1000 * (0.6 + 0.4 * I), '#4A1414', 0.55 * I);
    const paint = src => x => { x.save(); x.translate(ix, iy); x.scale(s, s); colWarp(x, src, tq, 0.5, 9); x.restore(); };
    const R = 720 + 560 * I;
    lit(ctx, paint(img), x => {
      const g = x.createRadialGradient(L[0], L[1], R * 0.2, L[0], L[1], R);
      g.addColorStop(0, 'rgba(6,3,6,0)'); g.addColorStop(0.45, 'rgba(6,3,6,0.42)'); g.addColorStop(0.8, 'rgba(6,3,6,0.88)'); g.addColorStop(1, 'rgba(5,2,5,0.97)');
      x.fillStyle = g; cover(x);
      const lvl = cl(1 - I) * 0.9; if (lvl > 0) { x.fillStyle = `rgba(4,2,4,${lvl})`; cover(x); }
    }, { multiply: x => { const g = x.createRadialGradient(L[0], L[1], 0, L[0], L[1], R * 1.1); g.addColorStop(0, '#FFD6A8'); g.addColorStop(0.5, '#FF9A5E'); g.addColorStop(1, '#6A4C7A'); x.fillStyle = g; cover(x); } });
    // warm under-rim on the edges that face the flame below
    const rim = innerRim(img, 0, -8, '#FFA060');
    ctx.save(); ctx.globalAlpha = 0.6 * cl(I); paint(rim)(ctx); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(4px)'; ctx.globalAlpha = 0.4 * cl(I); paint(rim)(ctx); ctx.restore();
    D.glow(ctx, L[0], H + 70, 460, '#FF6A2A', 0.34 * I);
    D.glow(ctx, L[0], H + 40, 170, '#FFD8A0', 0.3 * I);
    embers(ctx, t, { n: 18, x: L[0], y: H + 30, spread: 320, rise: 110, life: [2.6, 4.2], size: 2.2, alpha: 0.75 * cl(I), seed: 31, drift: 90 });
    vignette(ctx, 0.8 - 0.18 * Math.min(1, hb) * cl(I), 0.28, '3,1,3');
  }

  Z.scene('flame', {
    preload: a => ((a.mode || 'breathe') === 'dark' ? [a.face || CH + 'bust_calm.png'] : [a.img || CH + 'flame_hands.png']),
    draw(ctx, S) { const m = S.args.mode || 'breathe'; if (m === 'dark') flameDark(ctx, S); else flameHands(ctx, S, m); },
  });

  // =====================================================================================
  // 46 · ink — 「絶望の形を抱きしめたまま」
  // A pale fog void. Sumi tendrils grow from the edges and the ground (12 fps, lurching forward on every beat), reach
  // for her and curl into fern-like croziers just short of her; two pass behind her, so they read as wrapping around
  // her, and one thin coil climbs her legs in front. Ink pools on the ground and stains the corners. A thin warm rim
  // light holds her edge. The ink never covers her.
  // =====================================================================================
  const INKC = '#0D0B10';
  // a tightening spiral (fern crozier) from point p with heading th
  const crozier = (p, th, cd, r0, turns = 1.1, ds = 4, shrink = 0.972) => {
    const out = []; let [x, y] = p, r = r0, acc = 0;
    while (acc < turns * TAU && r > 2) { th += cd * ds / r; acc += ds / r; x += Math.cos(th) * ds; y += Math.sin(th) * ds; out.push([x, y]); r *= shrink; }
    return out;
  };
  const endHeading = P => { const a = P[P.length - 2], b = P[P.length - 1]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  // [control points, curl dir, crozier radius, turns, base width, delay, dur]
  const INK_MAIN = [
    // wraps (pass behind her)
    [[[-60, 1030], [260, 950], [600, 850], [860, 800], [1080, 790], [1270, 740], [1400, 640]], 1, 58, 1.15, 62, 0.0, 3.1],
    [[[1990, 150], [1680, 250], [1380, 360], [1150, 420], [820, 470], [640, 430], [540, 320]], -1, 52, 1.1, 56, 0.35, 3.2],
    // reachers (curl short of her)
    [[[-50, 640], [220, 610], [460, 560], [640, 520]], -1, 46, 1.2, 50, 0.25, 2.8],
    [[[-60, -40], [200, 110], [430, 180], [630, 220]], 1, 42, 1.15, 44, 0.9, 2.8],
    [[[1980, 980], [1720, 880], [1470, 850], [1260, 880]], 1, 40, 1.2, 50, 0.15, 2.7],
    [[[1990, 610], [1720, 590], [1470, 540], [1290, 500]], -1, 44, 1.15, 46, 0.6, 2.9],
    [[[1900, -60], [1700, 80], [1500, 140], [1330, 170]], -1, 36, 1.2, 40, 1.1, 2.7],
    [[[520, 1120], [600, 1030], [700, 985], [770, 975]], -1, 26, 1.25, 30, 0.5, 2.3],
    [[[760, -70], [740, 40], [700, 110]], 1, 24, 1.2, 22, 1.5, 2.2],
  ];
  const inkCache = new Map();
  const inkNet = (seed) => {
    if (inkCache.has(seed)) return inkCache.get(seed);
    const R = Z.rng(seed), T = [];
    INK_MAIN.forEach(([ctrl, cd, r0, turns, w0, dl, du], i) => {
      const jit = ctrl.map((c, k) => (k === 0 ? c : [c[0] + R.range(-18, 18), c[1] + R.range(-14, 14)]));
      const body = resample(catmull(jit, 16), Math.round(jit.length * 22)).pts;
      const pts = body.concat(crozier(body[body.length - 1], endHeading(body), cd, r0, turns));
      T.push({ pts, w0, delay: dl, dur: du, seed: i * 7 + 1 });
      const nb = 2 + (R() < 0.6 ? 1 : 0);
      for (let b = 0; b < nb; b++) {                                   // curlicue branches off the main stroke
        const f = 0.22 + 0.5 * R(), k = Math.floor(f * (body.length - 1)), side = R() < 0.5 ? -1 : 1;
        const h0 = endHeading(body.slice(0, k + 2)) + side * (0.5 + 0.5 * R());
        const stem = []; let [x, y] = body[k], th = h0;
        for (let q = 0; q < 10 + R() * 14; q++) { th += side * 0.03; x += Math.cos(th) * 5; y += Math.sin(th) * 5; stem.push([x, y]); }
        const bp = [body[k]].concat(stem, crozier(stem[stem.length - 1], th, side, 14 + R() * 16, 1.0 + 0.4 * R(), 3, 0.96));
        T.push({ pts: bp, w0: w0 * (0.28 + 0.14 * R()) * (1 - f * 0.5), delay: dl + f * du * 0.8, dur: 0.9 + 0.7 * R(), seed: i * 7 + b + 3 });
      }
    });
    // one thin coil climbing her legs (front where it faces the camera)
    const hx = [], hf = [];
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, y = lerp(995, 640, u), ph = -0.9 + u * 3.1 * Math.PI, rx = lerp(95, 175, sm(0, 1, u));
      hx.push([960 + Math.sin(ph) * rx, y + Math.cos(ph) * 12]); hf.push(Math.cos(ph) > 0);
    }
    const hEnd = crozier(hx[hx.length - 1], endHeading(hx), -1, 22, 1.1, 3, 0.965);
    for (const q of hEnd) { hx.push(q); hf.push(false); }
    T.push({ pts: hx, front: hf, w0: 12, wEnd: 2.2, delay: 0.8, dur: 3.2, seed: 99 });
    // ground pools and corner stains [x, y, rmax, flatten, delay, dur]
    const pools = [];
    for (let i = 0; i < 16; i++) { const x = lerp(-80, 2000, i / 15) + R.range(-40, 40), nearFeet = Math.abs(x - 960) < 260; pools.push([x, 1100 + R.range(0, 40), nearFeet ? R.range(40, 70) : R.range(90, 180), 0.42, R.range(0, 1.2), R.range(2.6, 3.6)]); }
    pools.push([960, 994, 130, 0.17, 0.2, 3.2]);                                     // the puddle she stands in
    for (const [x, y] of [[-150, -130], [2070, -130], [-170, 1190], [2090, 1190]]) pools.push([x, y, R.range(300, 400), 1, R.range(0.1, 0.8), 3.6]);
    const net = { T, pools }; inkCache.set(seed, net); return net;
  };
  // grown part of a tendril as a filled tapered shape (sel: point filter for the front/back split)
  const tendrilShape = (x, tn, f, sel) => {
    const n = tn.pts.length, m = Math.floor(f * (n - 1)) + 1; if (m < 3) return;
    const tip = Math.min(22, m - 1), P = tn.pts.slice(0, m);
    const wd = P.map((_, j) => {
      const u = j / (n - 1), prof = tn.wEnd != null ? lerp(tn.w0, tn.wEnd, u) : tn.w0 * Math.pow(1 - u, 1.15) + 1.3;
      return prof * Math.pow(cl((m - 1 - j) / tip), 0.6) * (1 + 0.22 * Z.noise1(j * 0.11, tn.seed));
    });
    if (!sel) { ribbon(x, P, wd); return; }
    let run = [];
    const flush = () => { if (run.length > 2) ribbon(x, run.map(j => P[j]), run.map(j => wd[j])); run = []; };
    for (let j = 0; j < m; j++) { if (sel(j)) run.push(j); else flush(); }
    flush();
  };
  // render ink shapes into a full-res layer (with density mottling), then bleed + composite
  const inkLayer = (ctx, key, shapes, alpha = 0.95) => {
    const c = buf(key), x = fresh(c); x.setTransform(ctx.getTransform());
    x.fillStyle = '#000'; x.beginPath(); shapes(x); x.fill();
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out';
    x.globalAlpha = 0.28; x.drawImage(noiseTex('inkmot', 900, 1.5, 9, 0.2, 0.9, 12), 0, 0, W, H);
    x.globalAlpha = 0.18; x.drawImage(noiseTex('inkmot2', 160, 10, 60, 0.2, 0.7, 13), 0, 0, W, H);
    soft(ctx, key + 'bl', 0.5, 7, 0.42, (y, sc) => { y.setTransform(sc, 0, 0, sc, 0, 0); y.drawImage(c, 0, 0); }, 'source-over');
    soft(ctx, key + 'bl2', 0.25, 10, 0.25, (y, sc) => { y.setTransform(sc, 0, 0, sc, 0, 0); y.drawImage(c, 0, 0); }, 'source-over');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(c, 0, 0); ctx.restore();
  };

  Z.scene('ink', {
    preload: a => [a.char || CH + 'hug_self.png'],
    draw(ctx, S) {
      const a = S.args, t = S.t, t0 = S.shot.t0, p = S.p, clock = S.clock;
      const img = Z.imgSync(a.char || CH + 'hug_self.png');
      const tq = Z.quant(t, 12);
      const ti = (tq - t0) + 0.1 * beatSteps(clock, t0, tq, 0.22);          // ink time: 12 fps, lurching forward on every beat
      const net = inkNet(a.seed || 7);
      const grow = tn => { const k = cl((ti - tn.delay) / tn.dur); return 1 - Math.pow(1 - k, 2.0); };

      const z = 1 + 0.06 * E.inOutSine(p);
      ctx.save(); ctx.translate(W / 2, H * 0.52); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.52);

      // ---- pale fog void (mid-grey fog, a paler halo behind her, the lost warm source of the rim light)
      let g = ctx.createLinearGradient(0, -100, 0, H + 100);
      g.addColorStop(0, '#C9C4C3'); g.addColorStop(0.5, '#B9B3B3'); g.addColorStop(0.82, '#A7A0A2'); g.addColorStop(1, '#8C8589');
      ctx.fillStyle = g; cover(ctx);
      g = ctx.createRadialGradient(960, 500, 0, 960, 500, 720);
      g.addColorStop(0, 'rgba(238,232,226,0.9)'); g.addColorStop(0.45, 'rgba(232,226,220,0.45)'); g.addColorStop(1, 'rgba(232,226,220,0)');
      ctx.fillStyle = g; cover(ctx);
      g = ctx.createRadialGradient(1500, 160, 0, 1500, 160, 820);
      g.addColorStop(0, 'rgba(255,208,160,0.42)'); g.addColorStop(0.4, 'rgba(255,208,160,0.12)'); g.addColorStop(1, 'rgba(255,208,160,0)');
      ctx.fillStyle = g; cover(ctx);
      const fog = noiseTex('fog', 90, 20, 110, 0.05, 0.14, 77);
      ctx.save(); ctx.globalAlpha = 0.5; scrollTex(ctx, fog, -t * 26, 0, 2880, 1620);
      ctx.globalAlpha = 0.3; scrollTex(ctx, fog, t * 14 + 900, 380, 1920, 1080); ctx.restore();
      g = ctx.createRadialGradient(960, 992, 0, 960, 992, 330);                     // ground contact shadow
      g.addColorStop(0, 'rgba(40,34,40,0.4)'); g.addColorStop(1, 'rgba(40,34,40,0)');
      ctx.save(); ctx.translate(960, 992); ctx.scale(1, 0.15); ctx.translate(-960, -992); ctx.fillStyle = g; ctx.fillRect(600, 640, 720, 720); ctx.restore();

      // ---- ink behind her
      gooey(ctx, 'inkpool', 0.25, 4, 14, x => {
        for (const [px, py, rmax, fl, dl, du] of net.pools) {
          const k = 1 - Math.pow(1 - cl((ti - dl) / du), 2), r = rmax * (0.15 + 0.85 * k) * (1 + 0.04 * Math.sin(tq * 2 + px));
          if (k <= 0) continue; x.beginPath(); x.ellipse(px, py, r, r * fl + 8, 0, 0, TAU); x.fill();
        }
      }, 0.92);
      inkLayer(ctx, 'inkback', x => {
        for (const tn of net.T) { const f = grow(tn); if (f <= 0) continue; tendrilShape(x, tn, f, tn.front ? j => !tn.front[j] : null); }
      });

      // ---- her: standing still, hugging herself, a thin warm rim from the upper right
      const s = (a.h ?? 880) / img.height, cx = a.x ?? 960, fy = a.y ?? 992;
      const br = 1 + 0.004 * Math.sin(tq * 1.7);
      const paint = src => x => { x.save(); x.translate(cx, fy); x.scale(s, s * br); x.drawImage(src, -img.width / 2, -img.height); x.restore(); };
      lit(ctx, paint(img), x => {
        const gg = x.createLinearGradient(0, fy - img.height * s, 0, fy);
        gg.addColorStop(0, 'rgba(60,54,62,0.12)'); gg.addColorStop(0.55, 'rgba(46,40,50,0.24)'); gg.addColorStop(1, 'rgba(14,12,17,0.6)');
        x.fillStyle = gg; cover(x);
      });
      const rim = innerRim(img, -9, 7, '#FFC27A'), rp = paint(rim);
      ctx.save(); ctx.globalAlpha = 0.95; rp(ctx); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(5px)'; ctx.globalAlpha = 0.55; rp(ctx); ctx.restore();

      // ---- ink in front (the coil around her legs)
      inkLayer(ctx, 'inkfront', x => { for (const tn of net.T) { if (!tn.front) continue; const f = grow(tn); if (f > 0) tendrilShape(x, tn, f, j => tn.front[j]); } });

      ctx.restore();   // camera
      vignette(ctx, 0.55, 0.38, '30,26,32');
    },
  });
})();
