/* vocaloid-style-mv engine — base scenes. Special-purpose scenes live in engine/scenes/*.js and register with Z.scene too. */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080;
  const ease = n => (typeof n === 'function' ? n : E[n] || E.inOutSine);

  // ------------------------------------------------------------------ solid / gradient
  Z.scene('solid', {
    draw(ctx, S) {
      const a = S.args;
      if (a.grad) D.vgrad(ctx, a.grad); else D.fill(ctx, a.color || '#000');
      if (a.embers) D.embers(ctx, S.t, a.embers);
      if (a.fireflies) D.fireflies(ctx, S.t, a.fireflies);
    },
  });

  // ------------------------------------------------------------------ JIZURA full frame (its own backgrounds + lyric)
  Z.scene('jz', {
    draw(ctx, S) { JZ.drawPlan(S.args.plan || 'main', ctx, S.t, 'normal'); },
  });

  // ------------------------------------------------------------------ illustrated shot: background + characters + fx
  // args: {
  //   bg, bgFrom, bgTo, bgEase, beatZoom, shake,
  //   tint: [{ color, a, comp }] | grad: stops (overlay), night: 0..1 (darken toward blue),
  //   chars: [{ img, x, y, h, x2, y2, h2, ease, anchor, flip, sway, breathe, wave, rim, sil, alpha,
  //             in: { dur, dx, dy, ds, alpha:true, ease }, out: { at, dur, dx, dy, alpha:true }, q (koma fps) }],
  //   fx: [{ type: 'embers'|'fireflies'|'rain'|'dust'|'feathers'|'rays'|'glow'|'cracks', ...opts }],
  //   vignette: 0..1, letter: ...
  // }
  const assetsOf = a => [a.bg, ...(a.chars || []).map(c => c.img), ...(a.layers || []).map(l => l.img)].filter(Boolean);
  Z.scene('illust', {
    preload: a => assetsOf(a),
    draw(ctx, S) {
      const a = S.args, t = S.t, lt = S.lt, p = S.p;
      // ---------------- background with camera move
      if (a.bg) {
        const img = Z.imgSync(a.bg);
        const k = ease(a.bgEase)(p);
        const v = D.viewLerp(a.bgFrom || { zoom: 1.06 }, a.bgTo || a.bgFrom || { zoom: 1.12 }, k);
        if (a.beatZoom) v.zoom *= 1 + a.beatZoom * S.clock.pulse(t, 8);
        if (a.shake) { const [sx, sy] = D.shake(t, a.shake); v.x += sx / 400; v.y += sy / 300; }
        D.cover(ctx, img, v);
      } else if (a.grad) D.vgrad(ctx, a.grad);
      else D.fill(ctx, a.color || '#140B1E');
      // background tints
      for (const tn of a.tint || []) D.fill(ctx, tn.color, tn.a ?? 0.5, tn.comp || 'multiply');
      if (a.overlayGrad) D.vgrad(ctx, a.overlayGrad, a.overlayA ?? 1, a.overlayComp || 'source-over');
      // extra image layers (parallax cut-outs)
      for (const L of a.layers || []) {
        const img = Z.imgSync(L.img); const k = ease(L.ease)(p);
        const x = Z.lerp(L.x, L.x2 ?? L.x, k), y = Z.lerp(L.y, L.y2 ?? L.y, k), h = Z.lerp(L.h, L.h2 ?? L.h, k);
        D.sprite(ctx, img, x, y, h, { anchor: L.anchor || [0.5, 0.5], alpha: L.alpha ?? 1, rot: L.rot || 0, t });
      }
      // fx behind characters
      for (const f of a.fxBack || []) fx(ctx, S, f);
      // ---------------- characters
      for (const c of a.chars || []) drawChar(ctx, S, c);
      // fx in front
      for (const f of a.fx || []) fx(ctx, S, f);
      if (a.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(8,4,14,${a.vignette})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    },
  });

  function drawChar(ctx, S, c) {
    const img = Z.imgSync(c.img); if (!img) return;
    if (c.front && S.fg) ctx = S.fg;                       // in front of the lyric layer (text passes behind her)
    const t = c.q ? Z.quant(S.t, c.q) : S.t, lt = t - S.shot.t0, p = Z.clamp(lt / S.dur);
    const k = ease(c.ease || 'inOutSine')(p);
    let x = Z.lerp(c.x, c.x2 ?? c.x, k), y = Z.lerp(c.y, c.y2 ?? c.y, k), h = Z.lerp(c.h, c.h2 ?? c.h, k), alpha = c.alpha ?? 1, rot = c.rot || 0;
    if (c.in) {
      const d = Z.clamp((lt - (c.in.at || 0)) / (c.in.dur || 0.5)), e = ease(c.in.ease || 'outExpo')(d);
      x += (c.in.dx || 0) * (1 - e); y += (c.in.dy || 0) * (1 - e); h *= 1 + (c.in.ds || 0) * (1 - e); rot += (c.in.rot || 0) * (1 - e);
      if (c.in.alpha !== false) alpha *= d > 0 ? Math.min(1, e * 1.4) : 0;
    }
    if (c.out) {
      const d = Z.clamp((lt - c.out.at) / (c.out.dur || 0.4)), e = ease(c.out.ease || 'inExpo')(d);
      x += (c.out.dx || 0) * e; y += (c.out.dy || 0) * e; h *= 1 + (c.out.ds || 0) * e;
      if (c.out.alpha !== false) alpha *= 1 - e;
    }
    if (alpha <= 0.001) return;
    if (c.beatBump) h *= 1 + c.beatBump * S.clock.pulse(S.t, 10);
    const opt = { anchor: c.anchor || [0.5, 1], rot, flip: c.flip, sway: c.sway ?? 0.012, breathe: c.breathe ?? 1, t, alpha, phase: c.phase || 0,
      wave: c.wave === false ? null : Object.assign({ amp: 10, from: 0.3, q: 12 }, c.wave || {}) };
    if (c.shadow) { ctx.save(); ctx.globalAlpha = c.shadow.a ?? 0.5; D.silhouette(ctx, img, x + (c.shadow.dx || 30), y + (c.shadow.dy || 0), h, c.shadow.color || '#140B1E', Object.assign({}, opt, { key: 'sh' + c.img })); ctx.restore(); }
    if (c.rim) D.rim(ctx, img, x, y, h, c.rim.color || '#FFA552', c.rim.off || [7, -3], Object.assign({}, opt, { key: 'rim' + c.img + c.rim.color }));
    if (c.sil) D.silhouette(ctx, img, x, y, h, c.sil, Object.assign({}, opt, { key: 'sil' + c.img + c.sil }));
    else D.sprite(ctx, img, x, y, h, opt);
    if (c.glowAt) D.glow(ctx, x + c.glowAt[0] * h, y - c.glowAt[1] * h, c.glowAt[2] * h, c.glowColor || '#FFA552', c.glowA ?? 0.9);
  }

  function fx(ctx, S, f) {
    const t = S.t;
    switch (f.type) {
      case 'embers': D.embers(ctx, t, f); break;
      case 'fireflies': D.fireflies(ctx, t, f); break;
      case 'rain': D.rain(ctx, t, f); break;
      case 'dust': D.dust(ctx, t, f); break;
      case 'feathers': D.feathers(ctx, t, f); break;
      case 'rays': D.rays(ctx, f.x, f.y, f.n || 18, f.len || 1400, f.color || '#FFA552', f.a ?? 0.18, t, f.seed || 3); break;
      case 'glow': D.glow(ctx, f.x, f.y, f.r, f.color || '#FFA552', (f.a ?? 0.8) * (1 + (f.beat || 0) * S.clock.pulse(t, 8))); break;
      case 'cracks': {
        const net = D.crackNet(f.seed || 1, f.x ?? W / 2, f.y ?? H * 0.3, f.n || 22, f.reach || 1100);
        const pr = f.prog != null ? f.prog : Z.clamp((S.lt - (f.at || 0)) / (f.dur || 1.2));
        D.cracks(ctx, net, E.outCubic(pr), f); break;
      }
      case 'grad': D.vgrad(ctx, f.stops, f.a ?? 1, f.comp || 'source-over'); break;
      case 'fill': D.fill(ctx, f.color, f.a ?? 0.5, f.comp || 'source-over'); break;
      case 'custom': f.fn(ctx, S); break;
    }
  }
  Z.fx = fx;
  Z.drawChar = drawChar;
})();
