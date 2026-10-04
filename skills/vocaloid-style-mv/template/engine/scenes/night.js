/* vocaloid-style-mv scenes: night — rain, the wet floor and the passing train.
 *   wetFloor  shots 24 / 25   {mode:'fall'|'count', bg, words}
 *             fall : glowing mincho words fall like raindrops (one landing per beat) into the wet street,
 *                    sink through their own reflections, splash, ripple in perspective and leave a warm glow.
 *             count: top-down close-up of one dark puddle; exactly one amber drop per beat, concentric ripples that
 *                    refract the reflected night, a DotGothic16 counter 01, 02, 03 … and a small HUD.
 *   train     shot 33         {bg, chars, freeze, exitAt, dir, hero, heroX}
 *             night crossing, lamps alternating per beat (small elements, bloom + spill), a train strobes through the
 *             foreground with her images in the lit windows, freezes on the stop, and leaves light streaks behind.
 * Post helpers for the timeline: Z.night.post.fall · Z.night.post.count · Z.night.post.train  (shot.post = helper)
 * Every visual is a closed-form function of song time t; caches hold only immutable, arg-keyed art.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const sat = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => { const k = sat((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const dec = (x, k) => (x < 0 ? 0 : Math.exp(-x * k));
  const C = {
    ink: '#140B1E', amber: '#FFA552', glow: '#F4A640', hi: '#FFE3B0', cream: '#FFF3DC', ember: '#D8542A',
    navy: '#0B1524', steel: '#1E3552', haze: '#3F6284', mist: '#8FB2C9', cyan: '#39C6E0', verm: '#C8373A', lamp: '#FF2A1E',
  };
  const BG_WET = 'assets/bg/bg_wetstreet.png', BG_CROSS = 'assets/bg/bg_crossing_night.png';
  const DEF_WORDS = ['願い', 'ねがい', '祈り', '夢', '明日'];
  const DEF_CHARS = ['assets/char/bust_sing.png', 'assets/char/bust_calm.png', 'assets/char/eyes_ecu.png', 'assets/char/smile_dawn.png'];

  // ------------------------------------------------------------------ fonts (loaded in init: frame 0 never falls back)
  const FONTS = ['800 100px "Shippori Mincho B1"', '700 100px "Shippori Mincho B1"', '400 100px "DotGothic16"'];
  let fontsP = null;
  const loadFonts = () => fontsP || (fontsP = Promise.all(FONTS.map(f => document.fonts.load(f, '願いねがい祈り夢明日0123456789COUNTRAIN:./'))).catch(() => {}));
  const font = (px, fam, weight) => `${weight} ${px}px ${Z.FONT[fam] || fam}, "Noto Serif JP", serif`;

  // ------------------------------------------------------------------ shared helpers
  // same maths as D.cover (no rotation), but returns the image->screen mapping so scene elements can be pinned to the plate
  function coverMap(img, v, dx = 0, dy = 0) {
    const s = Math.max(W / img.width, H / img.height) * (v.zoom ?? 1);
    const dw = img.width * s, dh = img.height * s, mx = Math.max(0, (dw - W) / 2), my = Math.max(0, (dh - H) / 2);
    const ox = W / 2 + (v.x || 0) * mx - dw / 2 + dx, oy = H / 2 + (v.y || 0) * my - dh / 2 + dy;
    return { s, ox, oy, dw, dh, X: bx => ox + bx * s, Y: by => oy + by * s };
  }
  const beatsIn = (a, b) => { const out = []; for (const x of Z.clock.beats) { if (x >= b) break; if (x >= a) out.push(x); } return out; };
  const isDown = bt => Z.clock.inBar(bt + 1e-4) === 0;
  const spbAround = (a, b) => { const bs = beatsIn(a - 1.5, b + 1.5); return bs.length > 2 ? (bs[bs.length - 1] - bs[0]) / (bs.length - 1) : Z.clock.spb; };
  const planCache = new Map();
  const cached = (key, fn) => { let v = planCache.get(key); if (v === undefined) { v = fn(); planCache.set(key, v); } return v; };

  // additive elliptical glow from a cached radial sprite (cheap, any aspect)
  const glowCache = new Map();
  function glowSprite(color) {
    let c = glowCache.get(color); if (c) return c;
    c = Z.canvas(128, 128); const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, Z.rgba(color, 1)); g.addColorStop(0.18, Z.rgba(color, 0.55)); g.addColorStop(0.5, Z.rgba(color, 0.14)); g.addColorStop(1, Z.rgba(color, 0));
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowCache.set(color, c); return c;
  }
  function glowE(ctx, x, y, rx, ry, color, a) {
    if (!(a > 0.003) || rx < 0.5 || ry < 0.2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const spr = glowSprite(color);
    for (let k = a; k > 0.003; k -= 1) { ctx.globalAlpha = Math.min(1, k); ctx.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2); }
    ctx.restore();
  }
  function vignette(ctx, a, inner = 0.3, col = '4,6,14') {
    const g = ctx.createRadialGradient(W / 2, H * 0.52, H * inner, W / 2, H * 0.52, H * 1.05);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${a})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // glowing vertical word (縦書き), built once per word at 180 px and scaled on draw
  const SMALL_V = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);
  const wordCache = new Map();
  function wordSprite(word) {
    let s = wordCache.get(word); if (s) return s;
    const size = 180, pitch = 1.0, chars = [...word], pad = Math.round(size * 0.6);
    const w = size + pad * 2, h = Math.round(size * pitch * chars.length) + pad * 2;
    const c = Z.canvas(w, h), x = c.getContext('2d');
    x.font = font(size, 'mincho', 800); x.textAlign = 'center'; x.textBaseline = 'middle';
    const each = () => chars.forEach((ch, i) => {
      let gx = w / 2, gy = pad + size * pitch * (i + 0.5);
      if (SMALL_V.has(ch)) { gx += size * 0.1; gy -= size * 0.1; }
      x.fillText(ch, gx, gy);
    });
    x.shadowColor = 'rgba(255,110,30,0.95)'; x.shadowBlur = size * 0.55; x.fillStyle = '#FF9440'; each(); each();
    x.shadowColor = 'rgba(255,205,140,1)'; x.shadowBlur = size * 0.14; x.fillStyle = '#FFCF8A'; each();
    x.shadowBlur = 0; x.fillStyle = '#FFF4E2'; each();
    s = { c, w, h, size, pad, n: chars.length }; wordCache.set(word, s); return s;
  }

  // =================================================================== wetFloor
  const WET = { hz: 518, vx: 880, iw: 1672, ih: 941 };             // horizon / vanishing point of bg_wetstreet (image px)
  const FALL_HERO = [846, 812];                                   // ground spot of the hero word (image px)
  const FALL_SPOTS = [[430, 700], [1290, 640], [1030, 568], [250, 610], [1010, 880], [1450, 770], [720, 604]];

  function fallPlan(S) {
    const a = S.args, sh = S.shot, words = a.words || DEF_WORDS;
    return cached('fall|' + sh.id + '|' + sh.t0 + '|' + sh.t1 + '|' + words.join(','), () => {
      const spots = a.spots || FALL_SPOTS, hs = a.heroSpot || FALL_HERO;
      const bs = beatsIn(sh.t0 + (a.lead ?? 0.25), sh.t1 + 0.02);
      const heroAt = a.heroAt ?? sh.t0 + (sh.t1 - sh.t0) * 0.66;
      let hi = -1, best = 1e9;
      bs.forEach((b, i) => { const d = Math.abs(b - heroAt); if (isDown(b) && d < best) { best = d; hi = i; } });
      // words[0] = hero (the downbeat hit); the last landing echoes words[1] (just sung); the rest cycle words[2..]
      const rest = words.length > 2 ? words.slice(2) : words.slice(1).length ? words.slice(1) : words;
      const nNon = bs.length - (hi >= 0 ? 1 : 0);
      let n = 0;
      return bs.map((b, i) => {
        if (i === hi) return { t: b, word: words[0], bx: hs[0], by: hs[1], hero: true, seed: i + 1 };
        const sp = spots[n % spots.length], w = n === nNon - 1 && words.length > 1 ? words[1] : rest[n % rest.length]; n++;
        return { t: b, word: w, bx: sp[0], by: sp[1], hero: false, seed: i + 1 };
      });
    });
  }
  function landGeo(L, M) {
    const near = sat((L.by - WET.hz) / (WET.ih - WET.hz)), k = M.s / 1.15;
    return {
      x: M.X(L.bx), y: M.Y(L.by), near,
      size: (34 + 118 * Math.pow(near, 0.9)) * (L.hero ? 1.3 : 1) * k,
      ratio: 0.1 + 0.3 * near,
      tf: (0.5 + 0.55 * (1 - near)) * (L.hero ? 1.12 : 1),
      dist: (360 + 1050 * near) * k * (L.hero ? 1.12 : 1),
    };
  }

  // reflection mask of the plate: bright / saturated parts of the ground (the reflections that should shimmer)
  const maskCache = new Map();
  function reflMask(img, key) {
    let m = maskCache.get(key); if (m) return m;
    const sw = 418, sh = 235, c = Z.canvas(sw, sh), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh), p = d.data, hzS = (WET.hz / WET.ih) * sh + 1;
    for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) {
      const i = (y * sw + xx) * 4, r = p[i], g = p[i + 1], b = p[i + 2];
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
      let a = sstep(0.2, 0.42, mx) + sstep(0.12, 0.3, mx - mn) * 0.8;
      a = y < hzS ? 0 : Math.min(1, a) * sstep(hzS, hzS + 6, y);
      p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = a * 255;
    }
    x.putImageData(d, 0, 0);
    m = Z.canvas(sw, sh); const mx2 = m.getContext('2d'); mx2.filter = 'blur(1.5px)'; mx2.drawImage(c, 0, 0);
    maskCache.set(key, m); return m;
  }

  // plate + horizontal strip shimmer on the reflections
  function drawPlateShimmer(ctx, img, M, t, key, amp = 1) {
    const base = Z.scratch[0], bx = base.getContext('2d');
    bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over'; bx.filter = 'none';
    bx.fillStyle = '#000'; bx.fillRect(0, 0, W, H);
    bx.drawImage(img, M.ox, M.oy, M.dw, M.dh);
    ctx.drawImage(base, 0, 0);
    const hy = Math.max(0, Math.floor(M.Y(WET.hz)));
    if (hy >= H) return;
    const sh = Z.scratch[1], sx = sh.getContext('2d');
    sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; sx.globalCompositeOperation = 'source-over'; sx.filter = 'none';
    sx.clearRect(0, 0, W, H);
    const step = 3;
    for (let y = hy; y < H; y += step) {
      const k = (y - hy) / (H - hy);
      const dx = amp * (1 + 7 * k) * (0.62 * Math.sin(y * 0.105 - t * 6.1) + 0.38 * Math.sin(y * 0.031 + t * 2.3 + Z.noise1(y * 0.02, 5) * 3));
      sx.drawImage(base, 0, y, W, step, dx, y, W, step);
    }
    sx.globalCompositeOperation = 'destination-in';
    sx.drawImage(reflMask(img, key), M.ox, M.oy, M.dw, M.dh);
    sx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sh, 0, 0);
  }

  // tiny rain rings on the ground plane (closed form: each ring slot re-spawns every `life` s at a hashed spot)
  function rainRings(ctx, t, M, n, alpha, seed = 7) {
    ctx.save(); ctx.lineWidth = 1.2;
    const hzY = M.Y(WET.hz);
    for (let i = 0; i < n; i++) {
      const life = 0.42 + 0.25 * Z.rnd(i, seed), ph = Z.rnd(i, seed + 1) * life;
      const c = Math.floor((t + ph) / life), age = (t + ph) / life - c;
      const bx = Z.rnd(i, c, seed + 2) * WET.iw, byn = Math.pow(Z.rnd(i, c, seed + 3), 0.6);
      const by = WET.hz + 8 + (WET.ih - WET.hz - 8) * byn;
      const x = M.X(bx), y = M.Y(by); if (y < hzY || y > H + 20 || x < -30 || x > W + 30) continue;
      const near = sat((by - WET.hz) / (WET.ih - WET.hz));
      const r = (2 + 26 * near) * M.s / 1.15 * (0.15 + E.outCubic(age));
      const a = alpha * (1 - age) * (0.4 + 0.6 * near);
      ctx.strokeStyle = `rgba(190,210,255,${a})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.1 + 0.3 * near), 0, 0, TAU); ctx.stroke();
      if (age < 0.12) { ctx.strokeStyle = `rgba(220,232,255,${alpha * 0.8 * (1 - age / 0.12)})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10 * near * M.s); ctx.stroke(); }
    }
    ctx.restore();
  }

  // one falling word: glyphs above the water line, mirror image below it; after impact it sinks through the surface
  function drawWord(ctx, L, G, t) {
    const age = t - L.t;
    if (age < -G.tf || age > 0.6) return;
    const sp = wordSprite(L.word), sc = G.size / sp.size;
    let yb, vel;
    if (age < 0) { const u = 1 + age / G.tf; yb = G.y - G.dist * (1 - (0.4 * u + 0.6 * u * u)); vel = G.dist * (0.4 + 1.2 * u) / G.tf; }
    else { vel = G.dist * 1.6 / G.tf * 0.42; yb = G.y + vel * age; }
    const alphaIn = sat((age + G.tf) / 0.14) * (age < 0 ? 0.8 + 0.2 * sat(1 + age / 0.25) : 1);
    const dw = sp.w * sc, dh = sp.h * sc, x0 = G.x - dw / 2, y0 = yb + sp.pad * sc - dh, top = yb - sp.n * sp.size * sc;
    // above the surface
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, G.y); ctx.clip();
    if (age < 0) {
      const len = Math.min(vel * 0.08, G.size * 2.2);
      const g = ctx.createLinearGradient(0, top - len, 0, top + G.size * 0.3);
      g.addColorStop(0, 'rgba(255,170,90,0)'); g.addColorStop(1, `rgba(255,205,150,${0.42 * alphaIn})`);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
      ctx.fillRect(G.x - G.size * 0.03, top - len, G.size * 0.06, len + G.size * 0.3);
      for (let k = 1; k <= 2; k++) { ctx.globalAlpha = alphaIn * 0.16 / k; ctx.drawImage(sp.c, x0, y0 - vel * k / 55, dw, dh); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = alphaIn; ctx.drawImage(sp.c, x0, y0, dw, dh);
    ctx.restore();
    // mirror image below the surface (strip-wobbled)
    ctx.save(); ctx.beginPath(); ctx.rect(0, G.y, W, H - G.y); ctx.clip();
    ctx.translate(0, 2 * G.y); ctx.scale(1, -1);
    ctx.globalAlpha = alphaIn * 0.38;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const sy = (i / N) * sp.h, shh = sp.h / N, k = 1 - i / N;
      const dx = Math.sin(i * 1.7 + t * 11 + L.seed) * G.size * 0.05 * (0.4 + k);
      ctx.drawImage(sp.c, 0, sy, sp.w, shh, x0 + dx, y0 + sy * sc, dw, shh * sc + 0.6);
    }
    ctx.restore();
  }

  // impact: flash + anamorphic flare + reflection flare, Worthington jet, crown droplets, perspective ripples, lingering glow
  // ripple wavefronts of one impact: leading ring + trailing rings packed closer (dispersion)
  const rippleRings = (age, size, hero) => {
    const out = [];
    const R = size * (0.3 + (3.0 + 1.2 * hero) * (1 - Math.exp(-age * 1.25)) + 0.35 * age);
    for (let j = 0; j < 4; j++) {
      const r = R * (1 - 0.14 * j) - size * 0.05 * j; if (r <= size * 0.08) continue;
      const A = Math.pow(sat(1 - age / (2.4 + 0.6 * hero)), 1.5) * (1 - j * 0.2) * sat(age / 0.05);
      if (A > 0.01) out.push({ r, A, j });
    }
    return out;
  };
  function drawImpact(ctx, L, G, t, plate) {
    const age = t - L.t; if (age < 0 || age > 4) return;
    const { x, y, size, ratio } = G, hero = L.hero ? 1 : 0;
    // lingering glow under the water (残光)
    const lin = (0.3 * dec(age, 1.4) + 0.11) * sat(1 - (age - 2.6) / 1.2);
    glowE(ctx, x, y + size * 0.04, size * 1.5, size * 1.5 * ratio * 1.4, '#FF8A3A', lin * 1.3);
    glowE(ctx, x, y + size * 0.6, size * 0.35, size * 1.2, '#FF9A4A', lin * 0.7);
    const rings = rippleRings(age, size, hero);
    // refraction: the plate re-drawn slightly magnified inside each wavefront band -> reflections kink along the ring
    if (plate) for (const { r, A } of rings) {
      const bw = size * 0.09 + r * 0.035, ry = r * ratio;
      ctx.save(); ctx.beginPath();
      ctx.ellipse(x, y, r + bw, (r + bw) * ratio, 0, 0, TAU); ctx.ellipse(x, y, Math.max(1, r - bw), Math.max(0.5, (r - bw) * ratio), 0, 0, TAU);
      ctx.clip('evenodd');
      ctx.translate(x, y); ctx.scale(1 + 0.07 * A, 1 + 0.16 * A); ctx.translate(-x, -y - ry * 0.02);
      ctx.drawImage(plate, 0, 0); ctx.restore();
    }
    // wavefront highlights (brighter on the far side, which faces the lights) + troughs
    ctx.save(); ctx.lineCap = 'round';
    for (const { r, A, j } of rings) {
      const ry = r * ratio;
      ctx.lineWidth = Math.max(1, size * 0.028 * (1 - 0.15 * j));
      ctx.strokeStyle = `rgba(4,7,18,${A * 0.35})`; ctx.beginPath(); ctx.ellipse(x, y + ry * 0.1, r * 0.965, ry * 0.965, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(190,208,255,${A * 0.22})`; ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(232,240,255,${A * 0.4})`; ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      const warm = A * dec(age, 1.5);
      if (warm > 0.02) { ctx.strokeStyle = `rgba(255,186,105,${warm * 0.55})`; ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); }
    }
    ctx.restore();
    // jet + crown
    if (age < 0.5) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (age < 0.34) {
        const jh = size * (0.9 + 0.5 * hero) * Math.sin(Math.PI * age / 0.34), jw = size * 0.06;
        const g = ctx.createLinearGradient(0, y - jh, 0, y);
        g.addColorStop(0, 'rgba(255,240,215,0.95)'); g.addColorStop(1, 'rgba(255,160,80,0.2)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - jh / 2, jw * (1 - 0.5 * age / 0.34), jh / 2, 0, 0, TAU); ctx.fill();
        glowE(ctx, x, y - jh, jw * 2.2, jw * 2.2, '#FFE8C8', 0.8);
      }
      const nd = 11 + 5 * hero, life = 0.46;
      for (let i = 0; i < nd; i++) {
        const k = age / (life * (0.7 + 0.3 * Z.rnd(i, L.seed, 3))); if (k >= 1) continue;
        const th = (i / nd) * TAU + Z.rnds(i, L.seed) * 0.3, out = size * (0.5 + 0.9 * Z.rnd(i, L.seed, 1)), up = size * (0.45 + 0.8 * Z.rnd(i, L.seed, 2));
        const px = x + Math.cos(th) * out * E.outCubic(k), py = y + Math.sin(th) * out * ratio * E.outCubic(k) - up * 4 * k * (1 - k);
        const rr = size * 0.035 * (1 - k * 0.6);
        glowE(ctx, px, py, rr * 3.5, rr * 3.5, '#FFC98A', (1 - k) * 0.9);
      }
      ctx.restore();
    }
    // flash + flares (tight: the word must stay readable as it sinks)
    const f = dec(age, 12);
    glowE(ctx, x, y, size * (1.1 + 0.5 * hero), size * (0.7 + 0.3 * hero), '#FFC990', f * 0.75);
    glowE(ctx, x, y, size * 0.28, size * 0.2, '#FFFFFF', f * 0.9);
    glowE(ctx, x, y, size * (5 + 5 * hero), size * 0.07, '#FFC27A', dec(age, 5) * (0.55 + 0.35 * hero));
    glowE(ctx, x, y + size * 1.4, size * 0.22, size * 1.6, '#FFB067', dec(age, 4) * 0.4);
  }

  function drawFall(ctx, S) {
    const a = S.args, t = S.t, img = Z.imgSync(a.bg || BG_WET);
    const plan = fallPlan(S), hero = plan.find(l => l.hero);
    const v = D.viewLerp(a.from || { zoom: 1.1, x: 0.12, y: 0.25 }, a.to || { zoom: 1.2, x: -0.04, y: -0.55 }, E.inOutSine(S.p));
    const kick = hero ? dec(t - hero.t, 6.5) : 0;
    v.zoom *= 1 + 0.014 * kick;
    const hand = [Z.fbm1(t * 0.35, 3) * 6, Z.fbm1(t * 0.3, 9) * 5];
    const M = coverMap(img, v, hand[0], hand[1] + Math.sin(Math.max(0, t - (hero ? hero.t : 1e9)) * 34) * 7 * kick);
    drawPlateShimmer(ctx, img, M, t, a.bg || BG_WET, a.shimmer ?? 1);
    const hy = M.Y(WET.hz);
    // atmosphere: darker sky, cool mist on the horizon
    D.vgrad(ctx, [[0, 'rgba(6,8,22,0.55)'], [0.45, 'rgba(6,8,22,0)'], [1, 'rgba(6,8,22,0)']], 1, 'source-over', [0, 0, W, hy]);
    glowE(ctx, M.X(WET.vx), hy, 1100, 90, '#3F6284', 0.35);
    // far + mid rain
    D.rain(ctx, t, { n: 260, seed: 31, angle: 0.07, speed: 1500, len: 36, width: 1, color: 'rgba(170,190,235,0.26)' });
    D.rain(ctx, t, { n: 90, seed: 43, angle: 0.075, speed: 1900, len: 70, width: 1.4, color: 'rgba(190,205,245,0.2)' });
    rainRings(ctx, t, M, 120, 0.55);
    // words, impacts
    const geos = plan.map(L => landGeo(L, M));
    plan.forEach((L, i) => drawImpact(ctx, L, geos[i], t, Z.scratch[0]));
    plan.forEach((L, i) => drawWord(ctx, L, geos[i], t));
    // near rain, heavier drops (a few catch the street light)
    D.rain(ctx, t, { n: 30, seed: 77, angle: 0.08, speed: 2600, len: 160, width: 2.4, color: 'rgba(205,220,255,0.16)' });
    D.rain(ctx, t, { n: 8, seed: 91, angle: 0.08, speed: 2400, len: 190, width: 2.2, color: 'rgba(255,214,160,0.22)' });
    vignette(ctx, 0.55, 0.32);
  }

  // ------------------------------------------------------------------ count: top-down puddle
  // puddle centre / radii (screen px), foreshortening k (ry/rx of a circle on the ground), reflected street lamp position
  const CNT = { cx: 960, cy: 566, rx: 760, ry: 336, k: 0.6, lampX: 1236, lampY: 404 };
  // impact spots (relative to the puddle centre) — a rising row of counted wishes
  const CNT_SPOTS = [[-560, 150], [-372, 64], [-190, 124], [-8, 26], [172, 88], [352, -24], [522, 36], [640, -76], [-80, -150]];
  function countPlan(S) {
    const a = S.args, sh = S.shot;
    return cached('count|' + sh.id + '|' + sh.t0 + '|' + sh.t1, () => {
      const bs = beatsIn(sh.t0 + (a.lead ?? 0.2), sh.t1 + 0.7), spots = a.spots || CNT_SPOTS;
      return bs.map((b, i) => ({ t: b, n: i + 1, u: spots[i % spots.length][0], v: spots[i % spots.length][1], seed: 101 + i }));
    });
  }
  const countCam = p => ({ rot: Z.lerp(-0.03, 0.012, E.inOutSine(p)), zoom: Z.lerp(1.0, 1.06, E.inOutSine(p)) });
  const worldCache = new Map();
  function puddlePath() {
    return cached('puddlePath', () => {
      const pts = [], N = 140;
      for (let i = 0; i < N; i++) {
        const th = (i / N) * TAU, c = Math.cos(th), s = Math.sin(th);
        const wob = 1 + 0.12 * Z.fbm1(c * 1.6 + 7, 11) + 0.1 * Z.fbm1(s * 1.9 + 3, 17) + 0.035 * Math.sin(th * 5 + 1) + 0.012 * Math.sin(th * 23);
        pts.push([CNT.cx + c * CNT.rx * wob, CNT.cy + s * CNT.ry * wob]);
      }
      return pts;
    });
  }
  const tracePath = (ctx, pts) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  // static art for the count shot: asphalt (aggregate, lamp pool, wet margin, rim) and the reflected night (plate crop)
  function countWorld(img, key) {
    let w = worldCache.get(key); if (w) return w;
    const MW = 2112, MH = 1188, ox = (MW - W) / 2, oy = (MH - H) / 2;
    const hw = MW / 2, hh = MH / 2, a = Z.canvas(hw, hh), ax = a.getContext('2d', { willReadFrequently: true });
    const d = ax.createImageData(hw, hh), p = d.data;
    const c0 = [11, 13, 21], c1 = [86, 92, 112];
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      let n = 0.32 * Z.rnd(x >> 3, y >> 3, 1) + 0.3 * Z.rnd(x >> 2, y >> 2, 2) + 0.22 * Z.rnd(x >> 1, y >> 1, 3) + 0.16 * Z.rnd(x, y, 4);
      n = Math.pow(n, 2.1);
      const s = Z.rnd(x >> 1, y >> 1, 9);
      if (s > 0.986) n = Math.min(1, n + 0.38); else if (s < 0.012) n *= 0.25;
      const i = (y * hw + x) * 4;
      p[i] = c0[0] + (c1[0] - c0[0]) * n; p[i + 1] = c0[1] + (c1[1] - c0[1]) * n; p[i + 2] = c0[2] + (c1[2] - c0[2]) * n; p[i + 3] = 255;
    }
    ax.putImageData(d, 0, 0);
    const asph = Z.canvas(MW, MH), sx = asph.getContext('2d');
    sx.drawImage(a, 0, 0, MW, MH);
    // pool of street-lamp light on the asphalt (the lamp stands just off frame, upper right) + cool falloff
    let g = sx.createRadialGradient(ox + 1700, oy - 60, 0, ox + 1700, oy - 60, 1500);
    g.addColorStop(0, 'rgba(150,170,220,0.34)'); g.addColorStop(0.5, 'rgba(110,130,190,0.12)'); g.addColorStop(1, 'rgba(110,130,190,0)');
    sx.fillStyle = g; sx.fillRect(0, 0, MW, MH);
    g = sx.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, 'rgba(4,6,12,0.35)'); g.addColorStop(0.6, 'rgba(4,6,12,0)'); g.addColorStop(1, 'rgba(4,6,12,0.25)');
    sx.fillStyle = g; sx.fillRect(0, 0, MW, MH);
    // wet margin: darker, glossy asphalt around the water
    const pts = puddlePath();
    const grow = (f, fy) => pts.map(([x, y]) => [ox + CNT.cx + (x - CNT.cx) * f, oy + CNT.cy + (y - CNT.cy) * fy]);
    sx.save(); sx.filter = 'blur(30px)'; sx.fillStyle = 'rgba(3,4,10,0.62)'; sx.beginPath(); tracePath(sx, grow(1.12, 1.2)); sx.fill(); sx.restore();
    // satellite puddles
    for (const [px, py, r, rot] of [[1790, 960, 74, 0.2], [210, 150, 58, -0.1], [1650, 140, 36, 0.3], [140, 930, 96, 0.1], [520, 1010, 30, 0]]) {
      sx.save(); sx.translate(ox + px, oy + py); sx.rotate(rot);
      sx.fillStyle = 'rgba(3,5,12,0.5)'; sx.filter = 'blur(10px)'; sx.beginPath(); sx.ellipse(0, 0, r * 2, r * 1.1, 0, 0, TAU); sx.fill();
      sx.filter = 'none'; const pg = sx.createLinearGradient(0, -r, 0, r); pg.addColorStop(0, '#16213c'); pg.addColorStop(1, '#070b16');
      sx.fillStyle = pg; sx.beginPath(); sx.ellipse(0, 0, r * 1.6, r * CNT.k, 0, 0, TAU); sx.fill();
      sx.strokeStyle = 'rgba(160,180,230,0.18)'; sx.lineWidth = 1.5; sx.beginPath(); sx.ellipse(0, 0, r * 1.6, r * CNT.k, 0, Math.PI * 1.1, Math.PI * 1.9); sx.stroke();
      sx.restore();
    }
    // reflected night: plate sky crop (lamp, wires, rooftops), mirrored, lamp placed at (lampX, lampY), cooled + darkened
    const refl = Z.canvas(MW, MH), rx = refl.getContext('2d');
    g = rx.createLinearGradient(0, 0, 0, MH); g.addColorStop(0, '#0b1528'); g.addColorStop(1, '#050a16');
    rx.fillStyle = g; rx.fillRect(0, 0, MW, MH);
    const cw = 820, chh = 430, cxs = 852, sc = Math.max(MW / cw, MH / chh) * 1.3;
    const lx = MW / 2 - (1265 - cxs - cw / 2) * sc, ly = MH / 2 + (95 - chh / 2) * sc;     // lamp head before placement
    rx.save(); rx.filter = 'blur(4px)'; rx.globalAlpha = 0.9;
    rx.translate(CNT.lampX + ox - lx, CNT.lampY + oy - ly);
    rx.translate(MW / 2, MH / 2); rx.scale(-1, 1);
    rx.drawImage(img, cxs, 0, cw, chh, -cw * sc / 2, -chh * sc / 2, cw * sc, chh * sc);
    rx.restore();
    rx.globalCompositeOperation = 'multiply'; rx.fillStyle = '#434f78'; rx.fillRect(0, 0, MW, MH);
    rx.globalCompositeOperation = 'lighter';
    g = rx.createRadialGradient(CNT.lampX + ox, CNT.lampY + oy, 0, CNT.lampX + ox, CNT.lampY + oy, 300);
    g.addColorStop(0, 'rgba(225,235,255,0.75)'); g.addColorStop(0.12, 'rgba(170,190,240,0.3)'); g.addColorStop(1, 'rgba(120,140,210,0)');
    rx.fillStyle = g; rx.fillRect(0, 0, MW, MH);
    rx.globalCompositeOperation = 'source-over';
    w = { asph, refl, ox, oy, MW, MH }; worldCache.set(key, w); return w;
  }

  // count ripples: leading ring + dispersion-packed followers
  const cntRings = age => {
    const out = [], R = 24 + 360 * (1 - Math.exp(-age * 1.15)) + 50 * age;
    for (let j = 0; j < 4; j++) {
      const r = R * (1 - 0.13 * j) - 6 * j; if (r < 8) continue;
      const A = Math.pow(sat(1 - age / 2.3), 1.4) * (1 - 0.2 * j) * sat(age / 0.04);
      if (A > 0.01) out.push({ r, A, j });
    }
    return out;
  };

  function drawCount(ctx, S) {
    const a = S.args, t = S.t, img = Z.imgSync(a.bg || BG_WET);
    const plan = countPlan(S), world = countWorld(img, 'cw|' + (a.bg || BG_WET));
    const p = S.p, cam = countCam(p), rot = cam.rot;
    const last = plan.filter(d => d.t <= t).pop();
    const nudge = last ? dec(t - last.t, 9) : 0, zoom = cam.zoom * (1 + 0.006 * nudge);
    ctx.save();
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H);
    ctx.translate(CNT.cx, CNT.cy); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-CNT.cx, -CNT.cy);
    ctx.drawImage(world.asph, -world.ox, -world.oy);
    // wet glints on the asphalt (static specks that twinkle with the rain)
    for (let i = 0; i < 90; i++) {
      const gx = Z.rnd(i, 81) * (W + 160) - 80, gy = Z.rnd(i, 82) * (H + 100) - 50;
      const dx = (gx - CNT.cx) / CNT.rx, dy = (gy - CNT.cy) / CNT.ry; if (dx * dx + dy * dy < 1.25) continue;
      const tw = Math.pow(Math.max(0, Math.sin(t * (1.5 + 3 * Z.rnd(i, 83)) + i * 7.1)), 10);
      if (tw > 0.03) glowE(ctx, gx, gy, 7, 5, '#C8D8FF', tw * 0.9);
    }
    // puddle: reflection with parallax (the reflected sky is "deeper" than the ground)
    const pts = puddlePath();
    ctx.save(); ctx.beginPath(); tracePath(ctx, pts); ctx.clip();
    const drawRefl = (s, cx = CNT.cx, cy = CNT.cy) => {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      ctx.translate(CNT.cx, CNT.cy); ctx.rotate(-rot * 0.8); ctx.translate(-CNT.cx - 22 * p, -CNT.cy + 12 * p);
      ctx.drawImage(world.refl, -world.ox, -world.oy); ctx.restore();
    };
    drawRefl(1 + 0.02 * p);
    // ripple refraction: wavefront bands of the reflection re-drawn magnified about each impact
    for (const d of plan) {
      const age = t - d.t; if (age < 0 || age > 2.3) continue;
      const px = CNT.cx + d.u, py = CNT.cy + d.v;
      for (const { r, A } of cntRings(age)) {
        const bw = 12 + r * 0.05;
        ctx.save(); ctx.beginPath();
        ctx.ellipse(px, py, r + bw, (r + bw) * CNT.k, 0, 0, TAU); ctx.ellipse(px, py, Math.max(1, r - bw), Math.max(1, r - bw) * CNT.k, 0, 0, TAU);
        ctx.clip('evenodd');
        drawRefl((1 + 0.02 * p) * (1 + 0.06 * A), px, py);
        ctx.restore();
      }
    }
    // darker toward the rim
    const sg = ctx.createRadialGradient(CNT.cx, CNT.cy, CNT.ry * 0.6, CNT.cx, CNT.cy, CNT.rx * 1.15);
    sg.addColorStop(0, 'rgba(0,0,6,0)'); sg.addColorStop(1, 'rgba(0,0,6,0.6)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    // rain micro-rings on the water
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 52; i++) {
      const life = 0.55 + 0.3 * Z.rnd(i, 61), ph = Z.rnd(i, 62) * life, c = Math.floor((t + ph) / life), age = (t + ph) / life - c;
      const th = Z.rnd(i, c, 63) * TAU, rr = Math.sqrt(Z.rnd(i, c, 64)) * 0.95;
      const x = CNT.cx + Math.cos(th) * CNT.rx * rr, y = CNT.cy + Math.sin(th) * CNT.ry * rr, r = 3 + 30 * E.outCubic(age) * (0.5 + Z.rnd(i, c, 65));
      const near = dec(Math.hypot(x - CNT.lampX, (y - CNT.lampY) / CNT.k) / 500, 1);
      ctx.strokeStyle = `rgba(170,192,240,${(0.12 + 0.3 * near) * (1 - age)})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * CNT.k, 0, 0, TAU); ctx.stroke();
    }
    // lingering glows of counted drops (embers under the water), pulsing faintly on beats
    const pulse = S.clock.pulse(t, 6);
    for (const d of plan) {
      const age = t - d.t; if (age < 0) continue;
      const px = CNT.cx + d.u, py = CNT.cy + d.v, l = 0.34 + 0.6 * dec(age, 1.4) + 0.1 * pulse;
      glowE(ctx, px, py, 130, 130 * CNT.k, '#FF7424', l * 0.75);
      glowE(ctx, px, py, 34, 34 * CNT.k, '#FFD49A', l);
    }
    // wavefront highlights: bright where they catch the reflected lamp, dim elsewhere
    const hg = ctx.createRadialGradient(CNT.lampX, CNT.lampY, 0, CNT.lampX, CNT.lampY, 900);
    hg.addColorStop(0, 'rgba(240,246,255,0.95)'); hg.addColorStop(0.35, 'rgba(200,215,255,0.42)'); hg.addColorStop(1, 'rgba(160,180,230,0.14)');
    ctx.lineCap = 'round';
    for (const d of plan) {
      const age = t - d.t; if (age < 0 || age > 2.4) continue;
      const px = CNT.cx + d.u, py = CNT.cy + d.v;
      for (const { r, A, j } of cntRings(age)) {
        ctx.lineWidth = 2.8 - j * 0.45;
        ctx.globalAlpha = A * 0.5; ctx.strokeStyle = '#02040c'; ctx.beginPath(); ctx.ellipse(px, py + 4, r - 3, (r - 3) * CNT.k, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = A; ctx.strokeStyle = hg; ctx.beginPath(); ctx.ellipse(px, py, r, r * CNT.k, 0, 0, TAU); ctx.stroke();
        const warm = A * dec(age, 1.8);
        if (warm > 0.02) { ctx.globalAlpha = warm * 0.7; ctx.strokeStyle = '#FFB468'; ctx.beginPath(); ctx.ellipse(px, py, r, r * CNT.k, 0, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore(); // puddle clip
    // meniscus rim: a thin light edge on the far side of the water
    ctx.save(); ctx.beginPath(); tracePath(ctx, pts);
    const rg = ctx.createLinearGradient(0, CNT.cy - CNT.ry * 1.1, 0, CNT.cy + CNT.ry * 1.1);
    rg.addColorStop(0, 'rgba(170,190,240,0.34)'); rg.addColorStop(0.5, 'rgba(170,190,240,0.06)'); rg.addColorStop(1, 'rgba(170,190,240,0.02)');
    ctx.strokeStyle = rg; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    // constellation thread between counted drops (draw-on after each impact)
    ctx.save(); ctx.strokeStyle = 'rgba(255,190,120,0.32)'; ctx.lineWidth = 1.3; ctx.setLineDash([2, 7]);
    for (let i = 1; i < plan.length; i++) {
      const d = plan[i], age = t - d.t; if (age < 0) continue;
      const q = E.outCubic(sat(age / 0.3)), p0 = [CNT.cx + plan[i - 1].u, CNT.cy + plan[i - 1].v], p1 = [CNT.cx + d.u, CNT.cy + d.v];
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(Z.lerp(p0[0], p1[0], q), Z.lerp(p0[1], p1[1], q)); ctx.stroke();
    }
    ctx.restore();
    // falling drops (+ their mirror image rising to meet them), impacts
    for (const d of plan) {
      const age = t - d.t, px = CNT.cx + d.u, py = CNT.cy + d.v;
      if (age < 0 && age > -0.46) {
        const u = E.inQuad(1 + age / 0.46), sx = Z.lerp(px + (px - CNT.cx) * 0.55, px, u), sy = Z.lerp(py - 760, py, u), s = Z.lerp(3.4, 1, u);
        glowE(ctx, sx, sy, 34 * s, 34 * s * 1.25, '#FF9A40', 0.55 + 0.45 * u);
        glowE(ctx, sx, sy, 9 * s, 12 * s, '#FFF2DC', 0.9);
        const my = Z.lerp(py + 240, py, u), ms = Z.lerp(0.45, 1, u);
        glowE(ctx, px, my, 22 * ms, 22 * ms * 0.8, '#FF9A40', 0.35 * u);
      }
      if (age >= 0 && age < 0.6) {
        const f = dec(age, 11);
        glowE(ctx, px, py, 170, 170 * CNT.k, '#FFC98C', f * 0.9);
        glowE(ctx, px, py, 34, 34 * CNT.k, '#FFFFFF', f);
        glowE(ctx, px, py, 560, 9, '#FFC27A', dec(age, 6) * 0.45);
        for (let i = 0; i < 12; i++) {
          const k = age / (0.42 * (0.7 + 0.3 * Z.rnd(i, d.seed))); if (k >= 1) continue;
          const th = (i / 12) * TAU + Z.rnds(i, d.seed, 1) * 0.25, out = 40 + 70 * Z.rnd(i, d.seed, 2), up = 30 + 60 * Z.rnd(i, d.seed, 3);
          const x = px + Math.cos(th) * out * E.outCubic(k), y = py + Math.sin(th) * out * CNT.k * E.outCubic(k) - up * 4 * k * (1 - k);
          glowE(ctx, x, y, 9, 9, '#FFCB8C', (1 - k) * 0.9);
        }
      }
    }
    ctx.restore(); // camera
    // top-down rain streaks (screen space, falling away from the lens)
    ctx.save(); ctx.strokeStyle = 'rgba(175,195,240,0.10)'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 44; i++) {
      const life = 0.32, ph = Z.rnd(i, 71) * life, c = Math.floor((t + ph) / life), k = (t + ph) / life - c;
      const x0 = Z.rnd(i, c, 72) * W, y0 = Z.rnd(i, c, 73) * H * 0.9;
      const dx = (x0 - W / 2) * 0.06, len = 70 * (1 - k);
      const x = x0 + dx * k * 3, y = y0 + 160 * k;
      ctx.moveTo(x, y); ctx.lineTo(x + dx * len / 70, y + len);
    }
    ctx.stroke(); ctx.restore();
    vignette(ctx, 0.62, 0.34, '2,3,8');
    drawCountHUD(ctx, S, plan);
  }

  // HUD: impact brackets + DotGothic16 odometer counter + beat ticks + timecode
  function drawCountHUD(ctx, S, plan) {
    const t = S.t, a = S.args;
    const done = plan.filter(d => d.t <= t + 1e-6), n = done.length, last = done[done.length - 1];
    const tone = a.hudColor || C.hi, hudA = a.hudAlpha ?? 0.78;
    ctx.save();
    ctx.textBaseline = 'middle';
    // impact brackets (camera-space position approximated in screen space)
    if (last) {
      const age = t - last.t;
      if (age < 0.9) {
        const { rot, zoom } = countCam(S.p);
        const lx = last.u * zoom, ly = last.v * zoom, cx = CNT.cx + lx * Math.cos(rot) - ly * Math.sin(rot), cy = CNT.cy + lx * Math.sin(rot) + ly * Math.cos(rot);
        const e = E.outExpo(sat(age / 0.16)), s = Z.lerp(1.7, 1, e), al = hudA * sat(age / 0.03) * sat((0.9 - age) / 0.3);
        const bw = 86 * s, bh = 56 * s, L = 16;
        ctx.strokeStyle = Z.rgba(tone, al); ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = cx + sx * bw, y = cy + sy * bh; ctx.moveTo(x - sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * L); }
        ctx.stroke();
        ctx.font = font(20, 'dot', 400); ctx.fillStyle = Z.rgba(tone, al); ctx.textAlign = 'left';
        ctx.fillText(String(last.n).padStart(2, '0'), cx + bw + 10, cy - bh + 6);
      }
    }
    // counter block, bottom right
    const xR = W - 112, yB = H - 96;
    ctx.textAlign = 'left'; ctx.font = font(21, 'dot', 400); ctx.fillStyle = Z.rgba(tone, hudA * 0.8);
    ctx.fillText('COUNT', xR - 262, yB - 178);
    ctx.fillRect(xR - 180, yB - 178, 180, 1);
    const age = last ? t - last.t : 1e3, e = E.outExpo(sat(age / 0.14));
    ctx.save(); ctx.beginPath(); ctx.rect(xR - 300, yB - 158, 300, 124); ctx.clip();
    ctx.font = font(124, 'dot', 400); ctx.textAlign = 'right';
    const cur = String(n).padStart(2, '0'), prev = String(Math.max(0, n - 1)).padStart(2, '0');
    ctx.shadowColor = 'rgba(255,160,70,0.8)'; ctx.shadowBlur = 22;
    if (e < 1 && n > 0) {
      ctx.fillStyle = Z.rgba(tone, hudA * (1 - e)); ctx.fillText(prev, xR, yB - 96 - e * 110);
      ctx.fillStyle = Z.rgba(tone, hudA); ctx.fillText(cur, xR, yB - 96 + (1 - e) * 110);
    } else { ctx.fillStyle = Z.rgba(tone, hudA); ctx.fillText(cur, xR, yB - 96); }
    ctx.restore();
    // beat ticks
    const total = Math.max(8, plan.length);
    for (let i = 0; i < total; i++) {
      const x = xR - (total - i) * 20 + 8, on = i < n;
      ctx.fillStyle = on ? Z.rgba('#FFB060', hudA) : Z.rgba(tone, hudA * 0.25);
      if (on) ctx.fillRect(x, yB - 10, 12, 12); else ctx.fillRect(x, yB - 5, 12, 2);
    }
    // top-left timecode + rain gauge
    const secs = 7 + Math.floor(t - S.shot.t0), blink = S.clock.phase(t) < 0.5;
    ctx.font = font(22, 'dot', 400); ctx.textAlign = 'left'; ctx.fillStyle = Z.rgba(tone, hudA * 0.7);
    ctx.fillText('23' + (blink ? ':' : ' ') + '41' + (blink ? ':' : ' ') + String(secs).padStart(2, '0'), 112, 96);
    ctx.font = font(18, 'dot', 400); ctx.fillStyle = Z.rgba(tone, hudA * 0.45);
    ctx.fillText('RAIN  7.5mm/h   水面観測', 112, 128);
    ctx.restore();
  }

  Z.scene('wetFloor', {
    preload: a => [a.bg || BG_WET],
    init: loadFonts,
    draw(ctx, S) { if ((S.args.mode || 'fall') === 'count') drawCount(ctx, S); else drawFall(ctx, S); },
  });

  // =================================================================== train
  // crossing lamps on bg_crossing_night (image px): lens centre, lens radius, alternation side
  const LAMPS = [
    { x: 146.7, y: 334.3, r: 22.8, side: 0, post: 0 }, { x: 303.7, y: 332.7, r: 23, side: 1, post: 0 },
    { x: 1451.75, y: 408.25, r: 15.6, side: 0, post: 1 }, { x: 1543.75, y: 408.25, r: 15.6, side: 1, post: 1 },
  ];
  const ARM_LAMPS = [{ x: 683.4, y: 657, w: 22, h: 8, side: 1 }, { x: 1129.5, y: 651.5, w: 19, h: 7, side: 0 }];
  // bg copy with every lamp switched off (lenses repainted as dark red glass)
  const offCache = new Map();
  function lampsOffPlate(img, key) {
    let c = offCache.get(key); if (c) return c;
    c = Z.canvas(img.width, img.height); const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    for (const L of LAMPS) {
      const g = x.createRadialGradient(L.x - L.r * 0.25, L.y - L.r * 0.3, 0, L.x, L.y, L.r + 1.8);
      g.addColorStop(0, '#4a141b'); g.addColorStop(0.7, '#2c0b11'); g.addColorStop(1, '#16060a');
      x.fillStyle = g; x.beginPath(); x.arc(L.x, L.y, L.r + 1.8, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,150,140,0.16)'; x.lineWidth = L.r * 0.12; x.beginPath(); x.arc(L.x, L.y, L.r * 0.72, Math.PI * 1.1, Math.PI * 1.5); x.stroke();
    }
    for (const A of ARM_LAMPS) { x.fillStyle = '#2a0c10'; x.fillRect(A.x - A.w / 2 - 1, A.y - A.h / 2 - 1, A.w + 2, A.h + 2); }
    offCache.set(key, c); return c;
  }
  // lamp brightness: one side per beat, soft incandescent attack and a glowing tail into the next beat
  function lampLevels(tl) {
    const C0 = Z.clock, i = C0.beat(tl), ph = C0.phase(tl);
    const on = ((i % 2) + 2) % 2;
    const envOn = sat(ph / 0.045) * (1 - 0.25 * ph) * (1 - 0.55 * sstep(0.8, 1, ph));
    const tail = 0.34 * dec(ph, 9) + 0.035;
    return [on === 0 ? envOn : tail, on === 1 ? envOn : tail];
  }

  // ---- train geometry (screen px; u runs from the nose (0) toward the tail)
  const TRN = { P: 1560, G: 66, N: 4, roofY: 468, winW: 250, winH: 212, doorW: 196, PAR: 0 };
  function trainLayout(N, P, G) {
    return cached('trainLayout|' + N + '|' + P + '|' + G, () => {
      const cars = [], wins = [];
      for (let i = 0; i < N; i++) {
        const cs = i * P, BL = i === N - 1 ? P - G : P - G;
        const el = [];
        let u = cs;
        const seq = i === 0 ? [['nose', 176], ['gap', 30], ['cab', 150], ['gap', 40], ['door', 196], ['gap', 34], ['win', 250], ['gap', 28], ['win', 250], ['gap', 34], ['door', 196], ['gap', 34], ['win', 150]]
          : [['gap', 46], ['win', 250], ['gap', 34], ['door', 196], ['gap', 34], ['win', 250], ['gap', 28], ['win', 250], ['gap', 34], ['door', 196], ['gap', 34], ['win', 150]];
        for (const [type, w] of seq) { if (type !== 'gap') { const e = { type, u0: u, u1: u + w, car: i }; el.push(e); if (type === 'win') wins.push(e); } u += w; }
        cars.push({ i, u0: cs, u1: cs + BL, el });
      }
      return { cars, wins, L: N * P - G };
    });
  }

  // window interiors: warm carriage (ceiling light, far windows, straps, seat backs) + optionally her, lit warm
  const CROPS = {
    'assets/char/bust_sing.png': [[300, 150, 520, 420], [160, 60, 900, 560]],
    'assets/char/bust_calm.png': [[210, 150, 500, 390], [80, 40, 900, 600]],
    'assets/char/eyes_ecu.png': [[360, 300, 900, 520], [250, 150, 1180, 700]],
    'assets/char/smile_dawn.png': [[300, 120, 520, 440], [160, 40, 900, 620]],
  };
  const interiorCache = new Map();
  function interior(w, h, charPath, crop, seed) {
    const key = w + 'x' + h + '|' + (charPath || '-') + '|' + (crop ? crop.join(',') : '') + '|' + seed;
    let c = interiorCache.get(key); if (c) return c;
    c = Z.canvas(w, h); const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#FFF1D2'); g.addColorStop(0.35, '#F7CE94'); g.addColorStop(1, '#B9794A');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // far-side windows (the night through the carriage)
    const fy0 = h * 0.2, fy1 = h * 0.6, fw = 84, gap = 16, off = Z.rnd(seed, 1) * (fw + gap);
    for (let fx = -off; fx < w; fx += fw + gap) {
      const fg = x.createLinearGradient(0, fy0, 0, fy1); fg.addColorStop(0, '#1b2440'); fg.addColorStop(1, '#2d3858');
      x.fillStyle = fg; x.beginPath(); x.roundRect(fx, fy0, fw, fy1 - fy0, 6); x.fill();
      x.fillStyle = 'rgba(255,220,170,0.10)'; x.fillRect(fx + 6, fy0 + 6, fw - 12, 4);
    }
    // ceiling light + strap rail + straps
    x.fillStyle = '#FFFBF0'; x.fillRect(0, h * 0.045, w, h * 0.035);
    x.fillStyle = 'rgba(255,245,220,0.5)'; x.fillRect(0, h * 0.02, w, h * 0.09);
    x.strokeStyle = 'rgba(70,40,28,0.85)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, h * 0.15); x.lineTo(w, h * 0.15); x.stroke();
    for (let sx = 14 + Z.rnd(seed, 2) * 30; sx < w; sx += 44) {
      x.lineWidth = 2; x.beginPath(); x.moveTo(sx, h * 0.15); x.lineTo(sx, h * 0.25); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.ellipse(sx, h * 0.285, 7, 9, 0, 0, TAU); x.stroke();
    }
    // seat backs
    x.fillStyle = '#5a3222'; x.fillRect(0, h * 0.74, w, h * 0.26);
    x.fillStyle = '#9c6440'; x.fillRect(0, h * 0.74, w, h * 0.025);
    // her
    const img = charPath ? Z.imgSync(charPath) : null;
    if (img) {
      const [cx0, cy0, cw, ch] = crop || [0, 0, img.width, img.height];
      const s = Math.max(w / cw, h / ch), dw = cw * s, dh = ch * s;
      x.drawImage(img, cx0, cy0, cw, ch, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    // warm grade + ceiling bounce + edge falloff
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#FFD6A4'; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'screen';
    const tg = x.createLinearGradient(0, 0, 0, h); tg.addColorStop(0, 'rgba(255,236,200,0.35)'); tg.addColorStop(0.4, 'rgba(255,236,200,0)');
    x.fillStyle = tg; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
    const vg = x.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, 'rgba(40,14,6,0)'); vg.addColorStop(1, 'rgba(40,14,6,0.55)');
    x.fillStyle = vg; x.fillRect(0, 0, w, h);
    interiorCache.set(key, c); return c;
  }

  // one car, baked once (body, stripes, doors, windows with interiors, roof gear, gangway, speed streaks)
  const carCache = new Map();
  function carSprite(car, N, P, G, chars, content, key) {
    const k = key + '|car' + car.i;
    let c = carCache.get(k); if (c) return c;
    const R = TRN.roofY, top = R - 40, h = H + 20 - top, w = P;
    c = Z.canvas(w, h); const x = c.getContext('2d');
    x.translate(G, -top);                                          // body at [G, P]; the gangway behind it at [0, G]
    const bodyW = car.u1 - car.u0, isFront = car.i === 0, isTail = car.i === N - 1;
    // local x: car front (toward travel) at the right edge, tail at the left: lx = bodyW - (u - u0)
    const LX = u => bodyW - (u - car.u0);
    const yEave = R + 30, yWinT = R + 110, yWinB = yWinT + TRN.winH, yBot = R + 548, ySkirt = R + 590;
    // gangway (between this car's rear and the next car)
    if (!isTail) {
      x.fillStyle = '#06080f'; x.fillRect(-G + 20, R + 70, G - 40, 440);
      x.strokeStyle = 'rgba(80,90,120,0.35)'; x.lineWidth = 1;
      for (let yy = R + 80; yy < R + 505; yy += 12) { x.beginPath(); x.moveTo(-G + 20, yy); x.lineTo(-20, yy); x.stroke(); }
      x.fillStyle = '#05060b'; x.fillRect(-G, R + 560, G, 26);
    }
    // body silhouette
    x.save();
    x.beginPath();
    if (isFront) {
      // slanted nose on the right
      x.moveTo(0, R + 22); x.quadraticCurveTo(0, R, 22, R);
      x.lineTo(bodyW - 120, R); x.bezierCurveTo(bodyW - 40, R + 6, bodyW - 12, R + 120, bodyW - 4, R + 300);
      x.lineTo(bodyW, ySkirt - 30); x.lineTo(bodyW - 20, ySkirt); x.lineTo(0, ySkirt);
    } else {
      x.moveTo(0, R + 22); x.quadraticCurveTo(0, R, 22, R); x.lineTo(bodyW - 22, R); x.quadraticCurveTo(bodyW, R, bodyW, R + 22);
      x.lineTo(bodyW, ySkirt); x.lineTo(0, ySkirt);
    }
    x.closePath();
    const bg = x.createLinearGradient(0, R, 0, ySkirt);
    bg.addColorStop(0, '#1a2033'); bg.addColorStop(0.08, '#121829'); bg.addColorStop(0.55, '#0c111f'); bg.addColorStop(1, '#06080f');
    x.fillStyle = bg; x.fill();
    x.clip();
    // roof sheen + eave line
    x.fillStyle = 'rgba(150,170,215,0.22)'; x.fillRect(0, R + 3, bodyW, 2);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, yEave, bodyW, 3);
    x.fillStyle = 'rgba(140,160,210,0.10)'; x.fillRect(0, yEave + 3, bodyW, 2);
    // stripes (the vermilion thread runs along the train)
    x.fillStyle = C.verm; x.fillRect(0, yWinB + 26, bodyW, 13);
    x.fillStyle = 'rgba(200,55,58,0.55)'; x.fillRect(0, yWinT - 22, bodyW, 4);
    // skirt
    x.fillStyle = '#05070c'; x.fillRect(0, yBot, bodyW, ySkirt - yBot);
    x.fillStyle = 'rgba(120,140,190,0.12)'; x.fillRect(0, yBot, bodyW, 2);
    // elements
    for (const e of car.el) {
      const x1 = LX(e.u0), x0 = LX(e.u1), ew = x1 - x0;
      if (e.type === 'win' || e.type === 'cab') {
        const wi = content.get(e);
        const img = e.type === 'cab' ? null : interior(Math.round(ew), TRN.winH, wi && wi.char, wi && wi.crop, wi ? wi.seed : e.u0);
        x.save(); x.beginPath(); x.roundRect(x0, yWinT, ew, TRN.winH, 14); x.clip();
        if (img) x.drawImage(img, x0, yWinT);
        else { const cg = x.createLinearGradient(0, yWinT, 0, yWinB); cg.addColorStop(0, '#223052'); cg.addColorStop(1, '#0b1122'); x.fillStyle = cg; x.fillRect(x0, yWinT, ew, TRN.winH); x.fillStyle = 'rgba(120,255,200,0.35)'; x.fillRect(x0 + 16, yWinB - 40, 26, 6); x.fillStyle = 'rgba(255,190,90,0.5)'; x.fillRect(x0 + 52, yWinB - 40, 12, 6); }
        // glass: dark sky reflection at the top, diagonal sheen
        const gg = x.createLinearGradient(x0, yWinT, x0 + ew * 0.6, yWinB);
        gg.addColorStop(0, 'rgba(150,175,230,0.16)'); gg.addColorStop(0.35, 'rgba(150,175,230,0.02)'); gg.addColorStop(0.36, 'rgba(255,255,255,0.07)'); gg.addColorStop(0.5, 'rgba(255,255,255,0)');
        x.fillStyle = gg; x.fillRect(x0, yWinT, ew, TRN.winH);
        x.restore();
        x.strokeStyle = '#04060b'; x.lineWidth = 7; x.beginPath(); x.roundRect(x0, yWinT, ew, TRN.winH, 14); x.stroke();
        x.strokeStyle = 'rgba(255,215,160,0.22)'; x.lineWidth = 1.5; x.beginPath(); x.roundRect(x0 + 5, yWinT + 5, ew - 10, TRN.winH - 10, 10); x.stroke();
      } else if (e.type === 'door') {
        x.fillStyle = '#10162a'; x.fillRect(x0, R + 70, ew, yBot - R - 78);
        x.strokeStyle = '#04060b'; x.lineWidth = 4; x.strokeRect(x0, R + 70, ew, yBot - R - 78);
        x.beginPath(); x.moveTo(x0 + ew / 2, R + 70); x.lineTo(x0 + ew / 2, yBot - 8); x.stroke();
        const dw = (ew - 3 * 18) / 2;
        for (const dx of [x0 + 18, x0 + 36 + dw]) {
          const img = interior(Math.round(dw), 206, null, null, Math.round(dx));
          x.save(); x.beginPath(); x.roundRect(dx, R + 104, dw, 206, 10); x.clip(); x.drawImage(img, dx, R + 104); x.restore();
          x.strokeStyle = '#04060b'; x.lineWidth = 5; x.beginPath(); x.roundRect(dx, R + 104, dw, 206, 10); x.stroke();
        }
        x.fillStyle = C.verm; x.fillRect(x0, yWinB + 26, ew, 13);
      } else if (e.type === 'nose') {
        // windshield + headlight housing
        x.fillStyle = '#0a0f1e'; x.beginPath(); x.moveTo(x0 + 40, R + 40); x.lineTo(x1 - 50, R + 40); x.quadraticCurveTo(x1 - 14, R + 120, x1 - 10, R + 250); x.lineTo(x0 + 40, R + 250); x.closePath(); x.fill();
        const wg = x.createLinearGradient(x0, R + 40, x1, R + 250); wg.addColorStop(0, 'rgba(120,150,210,0.25)'); wg.addColorStop(0.5, 'rgba(120,150,210,0.02)'); wg.addColorStop(1, 'rgba(255,255,255,0.1)');
        x.fillStyle = wg; x.fill();
        x.fillStyle = '#1c2236'; x.fillRect(x1 - 56, R + 408, 48, 30);
      }
      // panel seams at element edges
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(x0 - 14, R + 34, 1.5, yBot - R - 34);
    }
    // roof gear
    x.restore();
    x.fillStyle = '#0d1220'; x.beginPath(); x.roundRect(bodyW * 0.36, R - 24, bodyW * 0.28, 26, 6); x.fill();
    x.fillStyle = 'rgba(140,160,210,0.2)'; x.fillRect(bodyW * 0.36 + 6, R - 22, bodyW * 0.28 - 12, 2);
    // bogies + wheels (mostly below frame)
    x.fillStyle = '#030408';
    for (const bf of [0.16, 0.84]) {
      const bx = bodyW * bf; x.fillRect(bx - 150, ySkirt - 6, 300, 40);
      for (const wx of [bx - 90, bx + 90]) { x.beginPath(); x.arc(wx, ySkirt + 40, 46, 0, TAU); x.fill(); }
    }
    // speed streaks baked on the body (they blur into long light lines)
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const yy = R + 36 + Z.rnd(car.i, i, 5) * 520, xx = Z.rnd(car.i, i, 6) * bodyW, ll = 120 + 480 * Z.rnd(car.i, i, 7);
      const warm = Z.rnd(car.i, i, 8) < 0.35;
      x.fillStyle = warm ? 'rgba(255,190,120,0.10)' : 'rgba(170,190,240,0.08)'; x.fillRect(xx, yy, ll, 1.4);
    }
    x.globalCompositeOperation = 'source-over';
    c.top = top; carCache.set(k, c); return c;
  }

  // window content assignment (hero window resolved against the freeze)
  function trainPlan(S) {
    const a = S.args, sh = S.shot, chars = a.chars || a.windowChars || DEF_CHARS;
    const key = 'train|' + sh.id + '|' + sh.t0 + '|' + sh.t1 + '|' + chars.join(',') + '|' + (a.freeze || '') + '|' + (a.exitAt || '') + '|' + (a.heroX || '') + '|' + (a.hero ?? '');
    return cached(key, () => {
      const N = a.cars || TRN.N, P = TRN.P, G = TRN.G, lay = trainLayout(N, P, G);
      const fr = a.freeze || [116.76, 116.93];
      const exitAt = a.exitAt ?? 117.85;
      const tt = t => t - sat((t - fr[0]) / Math.max(1e-6, fr[1] - fr[0])) * (fr[1] - fr[0]);
      const v = P / spbAround(sh.t0, sh.t1);
      const L = lay.L;
      // front position (dir +1, screen px): tail clears the right edge at exitAt
      let base = t => W + L + v * (tt(t) - tt(exitAt));
      // hero window: the one nearest heroX at the freeze, shifted there exactly
      const heroX = a.heroX ?? 1010;
      let best = null, bd = 1e9;
      for (const e of lay.wins) { if (e.u1 - e.u0 < 200) continue; const xc = base(fr[0]) - (e.u0 + e.u1) / 2; const d = Math.abs(xc - heroX); if (d < bd) { bd = d; best = e; } }
      const shift = best ? heroX - (base(fr[0]) - (best.u0 + best.u1) / 2) : 0;
      const front = t => base(t) + shift;
      // contents
      const content = new Map();
      let ci = 0;
      lay.wins.forEach((e, i) => {
        const heroCh = chars[(a.hero ?? 0) % chars.length];
        if (e === best) { content.set(e, { char: heroCh, crop: (CROPS[heroCh] || [])[0], seed: 900 + i, hero: true }); return; }
        const show = e.u1 - e.u0 >= 200 && Z.rnd(i, 44) < 0.62;
        if (show) { const ch = chars[ci++ % chars.length]; const cr = CROPS[ch] || []; content.set(e, { char: ch, crop: cr[(i >> 1) % Math.max(1, cr.length)], seed: 300 + i }); }
        else content.set(e, { char: null, crop: null, seed: 500 + i });
      });
      return { N, P, G, lay, fr, exitAt, tt, v, front, best, content, key };
    });
  }

  function drawTrain(ctx, S) {
    const a = S.args, t = S.t, img = Z.imgSync(a.bg || BG_CROSS), plan = trainPlan(S);
    const { fr, tt, v, lay } = plan;
    const frozen = t >= fr[0] && t < fr[1];
    const tl = frozen ? fr[0] : t;                                // lamp / camera clock (holds during the freeze)
    const xf = plan.front(t), xt = xf - lay.L;                   // nose / tail x (moving right)
    const onScreen = xf > -200 && xt < W + 200;
    const pres = sat(Math.min((xf + 300) / 900, (W + 600 - xt) / 900));
    const noseNear = dec(Math.abs(xf - W * 0.5) / 900, 1) * (xf > -400 && xf < W + 900 ? 1 : 0);
    // camera: slow push, handheld drift, buffeting while the train passes
    const cam = D.viewLerp(a.from || { zoom: 1.1, x: -0.05, y: -1 }, a.to || { zoom: 1.155, x: 0.08, y: -1 }, E.inOutSine(S.p));
    cam.zoom *= 1 + 0.008 * S.clock.downPulse(tl, 5);
    const bump = D.shake(tl, 2.2 * pres + 4 * noseNear, 24, 5), drift = [Z.fbm1(tl * 0.4, 21) * 7, Z.fbm1(tl * 0.33, 23) * 5];
    const M = coverMap(img, cam, drift[0] + bump[0], drift[1] + bump[1]);
    ctx.drawImage(lampsOffPlate(img, a.bg || BG_CROSS), M.ox, M.oy, M.dw, M.dh);
    // night air: deepen the top, faint mist at the far end of the line
    D.vgrad(ctx, [[0, 'rgba(4,6,18,0.5)'], [0.35, 'rgba(4,6,18,0)'], [1, 'rgba(4,6,18,0)']]);
    glowE(ctx, M.X(840), M.Y(585), 700, 70, '#3F6284', 0.3);
    // ---- lamps (behind the train)
    const lv = lampLevels(tl);
    const lamp = LAMPS.map(L => ({ x: M.X(L.x), y: M.Y(L.y), r: L.r * M.s, e: lv[L.side], post: L.post }));
    for (const L of lamp) {
      // scene spill (soft, wide, low alpha: small-area strobe only)
      glowE(ctx, L.x, L.y, L.r * 15, L.r * 12, '#FF1C10', 0.2 * L.e);
      // lit lens
      if (L.e > 0.02) {
        ctx.save(); ctx.globalAlpha = sat(L.e * 1.1);
        const g = ctx.createRadialGradient(L.x - L.r * 0.15, L.y - L.r * 0.15, 0, L.x, L.y, L.r * 1.02);
        g.addColorStop(0, '#FFF3E6'); g.addColorStop(0.28, '#FF8A70'); g.addColorStop(0.7, '#FF2A1E'); g.addColorStop(1, '#C8140E');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, L.r * 1.02, 0, TAU); ctx.fill(); ctx.restore();
      }
      glowE(ctx, L.x, L.y, L.r * 4.2, L.r * 4.2, '#FF3A22', 0.85 * L.e);
    }
    // ground spill under each post + barrier-arm lamps
    glowE(ctx, M.X(250), M.Y(720), 420, 120, '#FF2414', 0.16 * Math.max(lv[0], lv[1]));
    glowE(ctx, M.X(1500), M.Y(650), 300, 80, '#FF2414', 0.14 * Math.max(lv[0], lv[1]));
    for (const A of ARM_LAMPS) {
      const e = lv[A.side], x = M.X(A.x), y = M.Y(A.y);
      ctx.save(); ctx.globalAlpha = sat(e); ctx.fillStyle = '#FF4A36'; ctx.fillRect(x - A.w * M.s / 2, y - A.h * M.s / 2, A.w * M.s, A.h * M.s); ctx.restore();
      glowE(ctx, x, y, 60, 26, '#FF2A1E', 0.7 * e);
    }
    // ---- headlight beam running ahead of the nose (the train announces itself from the left)
    const hlY = TRN.roofY + 420;
    if (xf > -2200 && xf < W + 1400) {
      const beamA = sat((xf + 2200) / 2000) * (xf < W ? 1 : sat(1 - (xf - W) / 1400));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bgR = ctx.createLinearGradient(xf, 0, xf + 1600, 0);
      bgR.addColorStop(0, `rgba(255,236,200,${0.34 * beamA})`); bgR.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = bgR; ctx.beginPath(); ctx.moveTo(xf, hlY - 16); ctx.lineTo(xf + 1600, hlY - 260); ctx.lineTo(xf + 1600, hlY + 340); ctx.lineTo(xf, hlY + 16); ctx.closePath(); ctx.fill();
      ctx.restore();
      glowE(ctx, xf + 500, hlY + 200, 900, 220, '#FFE6C0', 0.22 * beamA);
    }
    // ---- the train, motion-blurred along x (shutter 0.5; sharp on the freeze)
    if (onScreen) {
      const acc = Z.scratch[2], ax = acc.getContext('2d');
      ax.setTransform(1, 0, 0, 1, 0, 0); ax.globalAlpha = 1; ax.globalCompositeOperation = 'source-over'; ax.filter = 'none';
      ax.clearRect(0, 0, W, H);
      const blur = frozen ? 0 : v * (a.shutter ?? 0.5) / 30, taps = blur > 1 ? (a.taps || 7) : 1;
      const sprites = lay.cars.map(c => carSprite(c, plan.N, plan.P, plan.G, null, plan.content, plan.key));
      ax.globalCompositeOperation = taps > 1 ? 'lighter' : 'source-over';
      for (let k = 0; k < taps; k++) {
        const off = taps > 1 ? blur * (k / (taps - 1) - 0.5) : 0;
        ax.globalAlpha = 1 / taps;
        lay.cars.forEach((c, i) => {
          const x0 = xf - c.u1 - plan.G + off + bump[0] * 0.6, spr = sprites[i];
          if (x0 > W || x0 + spr.width < 0) return;
          ax.drawImage(spr, x0, spr.top + bump[1] * 0.6);
        });
      }
      ax.globalAlpha = 1; ax.globalCompositeOperation = 'source-over';
      ctx.drawImage(acc, 0, 0);
      // static light on the moving surface: lamp rim on the roof edge, red glints on the glass, window glow
      for (const L of lamp) {
        if (L.e < 0.02) continue;
        const occ = trainAt(plan, xf, L.x);
        if (occ <= 0) continue;
        glowE(ctx, L.x, TRN.roofY + 2, 320, 8, '#FF3A22', 0.9 * L.e * occ);
        glowE(ctx, L.x, TRN.roofY + 2, 110, 3, '#FFC0B0', 0.8 * L.e * occ);
        glowE(ctx, L.x, TRN.roofY + 60, 380, 70, '#FF1E10', 0.14 * L.e * occ);
        glowE(ctx, L.x + 40, TRN.roofY + 150, 60, 26, '#FF5A40', 0.3 * L.e * occ);
      }
      // warm spill of the window band onto the body (smeared)
      for (const e of lay.wins) {
        const xc = xf - (e.u0 + e.u1) / 2; if (xc < -300 || xc > W + 300) continue;
        glowE(ctx, xc - 30, TRN.roofY + 110 + TRN.winH / 2, (e.u1 - e.u0) * 0.75 + blur, TRN.winH * 0.75, '#FF9A48', 0.16);
      }
      // headlight + glare at the nose, tail lights
      glowE(ctx, xf - 26, hlY, 340, 140, '#FFE2B8', 0.75);
      glowE(ctx, xf - 26, hlY, 60, 34, '#FFFFFF', 1.2);
      glowE(ctx, xf - 26, hlY, 1400, 14, '#FFD8A8', 0.55);
      for (const ty of [hlY - 10, hlY + 22]) { glowE(ctx, xt + 18, ty, 40, 16, '#FF2A1E', 0.9); glowE(ctx, xt + 18, ty, 10, 6, '#FFD0C0', 0.9); }
    }
    // ---- light that stays after the train (tail streaks: window band, vermilion thread, tail lights)
    drawAfterStreaks(ctx, plan, xf, xt, t, tl);
    // ---- the freeze: her window caught
    if (frozen && plan.best) drawFreeze(ctx, plan, xf, t - fr[0]);
    vignette(ctx, 0.5, 0.36);
  }
  // is the train body (not a coupling gap) at screen x? (1 body, 0 gap / outside)
  function trainAt(plan, xf, x) {
    const u = xf - x; if (u < 0 || u > plan.lay.L) return 0;
    const inCar = u - Math.floor(u / plan.P) * plan.P; return inCar > plan.P - plan.G ? 0 : 1;
  }
  function drawAfterStreaks(ctx, plan, xf, xt, t, tl) {
    if (xt < -50) return;
    const decay = plan.v * 0.5, x1 = Math.min(W, xt), R = TRN.roofY;
    if (x1 <= 0) return;
    const lines = [
      { y: R + 110 + 12, w: 3, c: [255, 240, 214], a: 0.5 }, { y: R + 110 + TRN.winH * 0.5, w: 120, c: [255, 170, 90], a: 0.07 },
      { y: R + 110 + TRN.winH - 16, w: 2, c: [255, 200, 140], a: 0.3 }, { y: R + 110 + TRN.winH + 32, w: 9, c: [255, 70, 56], a: 0.55 },
      { y: R + 410, w: 3, c: [255, 50, 40], a: 0.55 }, { y: R + 442, w: 3, c: [255, 50, 40], a: 0.45 },
    ];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of lines) {
      const g = ctx.createLinearGradient(xt, 0, xt - decay * 3, 0);
      for (let i = 0; i <= 6; i++) {
        const k = i / 6, I = Math.exp(-k * 3), cyan = 1 - I;
        const col = L.c.map((c, j) => Math.round(Z.lerp(c, [57, 198, 224][j], cyan * 0.8)));
        g.addColorStop(k, `rgba(${col[0]},${col[1]},${col[2]},${L.a * I})`);
      }
      ctx.fillStyle = g; ctx.fillRect(0, L.y - L.w / 2, x1, L.w);
    }
    ctx.restore();
  }
  function drawFreeze(ctx, plan, xf, age) {
    const e = plan.best, x0 = xf - e.u1, w = e.u1 - e.u0, y0 = TRN.roofY + 110, h = TRN.winH;
    // everything else settles back a touch
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.roundRect(x0 - 6, y0 - 6, w + 12, h + 12, 18);
    ctx.fillStyle = 'rgba(4,6,14,0.3)'; ctx.fill('evenodd'); ctx.restore();
    glowE(ctx, x0 + w / 2, y0 + h / 2, w * 1.1, h * 1.1, '#FFB060', 0.28);
    // capture brackets snap on
    const k = E.outExpo(sat(age / 0.09)), m = Z.lerp(70, 20, k), L = 34;
    ctx.save(); ctx.strokeStyle = Z.rgba(C.hi, 0.92); ctx.lineWidth = 3; ctx.beginPath();
    for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = sx ? x0 + w + m : x0 - m, y = sy ? y0 + h + m : y0 - m, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L);
    }
    ctx.stroke(); ctx.restore();
  }

  Z.scene('train', {
    preload: a => [a.bg || BG_CROSS, ...(a.chars || a.windowChars || DEF_CHARS)],
    init: loadFonts,
    draw(ctx, S) { drawTrain(ctx, S); },
  });

  // =================================================================== post helpers for the timeline
  Z.night = {
    post: {
      fall: S => ({ lutA: 'P2', lutMix: 0.22, bloom: 0.5, bloomThreshold: 0.62, grain: 0.06, vignette: 0.3, ca: 1.2, beatCA: 1.2, contrast: 1.04 }),
      count: S => ({ lutA: 'P2', lutMix: 0.2, bloom: 0.55, bloomThreshold: 0.6, grain: 0.065, vignette: 0.25, ca: 0.8, contrast: 1.05 }),
      train: S => {
        const fr = S.args.freeze || [116.76, 116.93], f = S.t >= fr[0] && S.t < fr[1] ? 1 : 0;
        return { lutA: 'P4', lutMix: 0.18, bloom: 0.55, bloomThreshold: 0.6, grain: f ? 0.09 : 0.06, vignette: 0.28, ca: 1.4 + 1.5 * f, saturation: f ? 0.72 : 1, contrast: 1.05, boil: f ? 0.6 : 1.1 };
      },
    },
  };
})();
