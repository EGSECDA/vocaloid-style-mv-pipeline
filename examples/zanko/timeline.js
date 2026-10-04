/* 残光 — the edit. See docs/STORYBOARD.md for the shot list this implements.
 * Times come from analysis/audio.json (bars / beats) so every cut lands on the music. */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080;
  const A = 'assets/char/', BG = 'assets/bg/';

  // ------------------------------------------------------------------ helpers used by custom fx
  // same view the illust scene computes for its background (to pin effects onto the painting)
  const viewAt = (S) => {
    const a = S.args, k = (E[a.bgEase] || E.inOutSine)(S.p);
    const v = D.viewLerp(a.bgFrom || { zoom: 1.06 }, a.bgTo || a.bgFrom || { zoom: 1.12 }, k);
    if (a.beatZoom) v.zoom *= 1 + a.beatZoom * S.clock.pulse(S.t, 8);
    return v;
  };
  // image-normalised (u,v) → screen point under D.cover(view)
  const coverPt = (img, view, u, v) => {
    const s = Math.max(W / img.width, H / img.height) * (view.zoom ?? 1);
    const dw = img.width * s, dh = img.height * s, mx = Math.max(0, (dw - W) / 2), my = Math.max(0, (dh - H) / 2);
    const cx = W / 2 + (view.x || 0) * mx, cy = H / 2 + (view.y || 0) * my;
    const x = (u - 0.5) * dw, y = (v - 0.5) * dh, r = view.rot || 0;
    return [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r), s];
  };
  const bgPt = (S, u, v) => coverPt(Z.imgSync(S.args.bg), viewAt(S), u, v);

  // long cast shadow of a character toward the camera
  const longShadow = (img, x, y, h, len = 2.4, skew = -0.35, color = '#140B1E', alpha = 0.55) => ({ type: 'custom', fn: (ctx, S) => {
    const im = Z.imgSync(img); if (!im) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.transform(1, 0, skew, -len * 0.35, 0, 0);
    ctx.filter = 'blur(2px)'; D.silhouette(ctx, im, 0, 0, h, color, { key: 'lsh' + img }); ctx.restore();
  } });
  // bright bands sweeping across (passing train windows / street lights)
  const lightSweep = (color = '#FFE3B0', a = 0.22, speed = 900, n = 3, ang = -0.25) => ({ type: 'custom', fn: (ctx, S) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const period = 1.9 + i * 0.37, x = ((S.t * speed / period + i * 700) % (W + 1400)) - 700;
      ctx.save(); ctx.translate(x, H / 2); ctx.rotate(ang);
      const g = ctx.createLinearGradient(-160, 0, 160, 0); g.addColorStop(0, Z.rgba(color, 0)); g.addColorStop(0.5, Z.rgba(color, a)); g.addColorStop(1, Z.rgba(color, 0));
      ctx.fillStyle = g; ctx.fillRect(-160, -H, 320, 2 * H); ctx.restore();
    }
    ctx.restore();
  } });
  // a setting sun that sinks and leaves a ring of light (残光)
  const sinkingSun = (u, v, r, drop = 90, ringFrom = 0.35) => ({ type: 'custom', fn: (ctx, S) => {
    const [x, y, s] = bgPt(S, u, v), rr = r * s / 1.6;
    const k = E.inOutSine(S.p);
    D.glow(ctx, x, y + drop * k, rr * 5, '#FFA552', 0.55 * (1 - k * 0.6));
    D.disc(ctx, x, y + drop * k, rr, '#FFE3B0', 1 - k * 0.7);
    const ring = Z.clamp((S.p - ringFrom) / (1 - ringFrom));
    if (ring > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = Z.rgba('#FFA552', 0.75 * ring); ctx.lineWidth = 3 + 5 * ring;
      ctx.shadowColor = '#FF7A3A'; ctx.shadowBlur = 28;
      ctx.beginPath(); ctx.arc(x, y, rr * (1.25 + 0.5 * ring), 0, Z.TAU); ctx.stroke(); ctx.restore();
    }
  } });
  // points sampled from a glyph (cached) — for particles forming a character
  const glyphCache = new Map();
  const glyphPoints = (ch, size, n, fam = 'minchoHeavy', seed = 3) => {
    const key = ch + size + n + fam; if (glyphCache.has(key)) return glyphCache.get(key);
    const c = Z.canvas(size, size), x = c.getContext('2d');
    D.font(x, size * 0.9, fam, 900); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(ch, size / 2, size / 2);
    const d = x.getImageData(0, 0, size, size).data, pts = [], R = Z.rng(seed);
    let guard = 0;
    while (pts.length < n && guard++ < n * 60) { const px = Math.floor(R() * size), py = Math.floor(R() * size); if (d[(py * size + px) * 4 + 3] > 128) pts.push([px / size - 0.5, py / size - 0.5]); }
    glyphCache.set(key, pts); return pts;
  };
  const fireflyGlyph = (ch, cx, cy, size, t0, t1) => ({ type: 'custom', fn: (ctx, S) => {
    const pts = glyphPoints(ch, 256, 420), k = E.inOutCubic(Z.inv(t0, t1, S.t));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    pts.forEach(([u, v], i) => {
      const sx = Z.rnd(i, 7) * W, sy = H * (0.4 + 0.6 * Z.rnd(i, 8));
      const x = Z.lerp(sx, cx + u * size, k) + Z.fbm1(S.t * 0.4 + i, 3) * 20 * (1 - k * 0.7);
      const y = Z.lerp(sy, cy + v * size, k) + Z.fbm1(S.t * 0.4 + i * 1.3, 5) * 20 * (1 - k * 0.7);
      const a = (0.45 + 0.55 * Math.abs(Math.sin(S.t * 2 + i))) * (0.35 + 0.65 * k);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, Z.rgba('#F6FFE0', a)); g.addColorStop(0.3, Z.rgba('#DDFF7A', a * 0.6)); g.addColorStop(1, Z.rgba('#DDFF7A', 0));
      ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18);
    });
    ctx.restore();
  } });
  // sound-wave arcs from a point on every beat
  const soundRings = (x, y, color = '#9CC2C0', dir = 0) => ({ type: 'custom', fn: (ctx, S) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const bt = S.clock.at(S.clock.beat(S.t) - k); const age = S.t - bt; if (age < 0 || age > 1.8) continue;
      const r = 40 + age * 520, a = Math.max(0, 1 - age / 1.8);
      ctx.strokeStyle = Z.rgba(color, a * 0.8); ctx.lineWidth = 3 + 6 * a;
      ctx.beginPath(); ctx.arc(x, y, r, dir - 0.8, dir + 0.8); ctx.stroke();
    }
    ctx.restore();
  } });
  // heart glow pulsing on beats
  const heartGlow = (x, y, r, color = '#FFA552') => ({ type: 'custom', fn: (ctx, S) => {
    const p = 0.55 + 0.45 * S.clock.pulse(S.t, 5);
    D.glow(ctx, x, y, r * (0.8 + 0.3 * p), color, 0.8 * p); D.glow(ctx, x, y, r * 0.25, '#FFF1D0', 0.9 * p);
  } });
  // tear drop falling from a point
  const tearDrop = (u, v, t0, fallDur = 1.6) => ({ type: 'custom', fn: (ctx, S) => {
    const k = Z.clamp((S.t - t0) / fallDur); if (k <= 0) return;
    const [x0, y0] = bgPt(S, u, v), y = y0 + E.inQuad(k) * (H - y0 + 80);
    ctx.save(); ctx.fillStyle = 'rgba(220,240,255,0.85)'; ctx.beginPath(); ctx.ellipse(x0, y, 7, 11, 0, 0, Z.TAU); ctx.fill();
    D.glow(ctx, x0, y, 40, '#9CC2C0', 0.6); ctx.restore();
  } });
  // lamp pair alternating on beats (crossing)
  const lamps = (pairs) => ({ type: 'custom', fn: (ctx, S) => {
    const on = S.clock.beat(S.t) % 2 === 0 ? 0 : 1, pulse = 0.7 + 0.3 * S.clock.pulse(S.t, 4);
    for (const [u1, v1, u2, v2, rr] of pairs) {
      const [xa, ya, s] = bgPt(S, u1, v1), [xb, yb] = bgPt(S, u2, v2);
      const [x, y] = on ? [xb, yb] : [xa, ya];
      D.glow(ctx, x, y, rr * s * 6, '#FF4B3A', 0.8 * pulse); D.glow(ctx, x, y, rr * s * 1.3, '#FFD0C0', 0.9 * pulse);
    }
  } });

  // ------------------------------------------------------------------ setup: sections, JIZURA plans, shots
  Z.CREDIT = 'Music / Lyrics / Movie：NikusonP';
  Z.setup = async (audio) => {
    const B = n => (n >= 122 ? audio.music_cut : audio.bars[n].start);
    const beats = audio.beats;
    const nb = t => { let best = beats[0]; for (const b of beats) if (Math.abs(b - t) < Math.abs(best - t)) best = b; return best; };

    Z.LOOK_DEFAULT = { boil: 1.1, bloom: 0.3, bloomThreshold: 0.72, grain: 0.06, vignette: 0.35, lutMix: 0 };

    // global punctuation: flashes on the big downbeats, letterbox during the 3D showcases
    const FLASH = [[62.53, 0.9], [79.24, 0.7], [130.68, 0.85], [154.46, 0.6], [183.56, 1.0], [198.32, 0.9]];
    const CHORUS = [[62.53, 79.24], [130.68, 147.15], [183.56, 212.67]];
    Z.globalFX = (P, t) => {
      for (const [ft, a] of FLASH) { const d = t - ft; if (d >= 0 && d < 0.35) P.flash = Math.max(P.flash || 0, a * Math.exp(-d * 11)); }
      if (CHORUS.some(([a, b]) => t >= a && t < b)) {
        const low = Z.env.low(t), q = Math.floor(t * 12);
        const amp = 5 * Math.pow(low, 3);                                   // only the kicks move the frame
        P.shake = [(P.shake ? P.shake[0] : 0) + Z.rnds(q, 91) * amp, (P.shake ? P.shake[1] : 0) + Z.rnds(q, 92) * amp];
        P.exposure = (P.exposure || 0) + 0.08 * Z.clock.downPulse(t, 7);
      }
    };

    // ---- JIZURA lyric plans (our curated LRC with JIZURA markup)
    let lrc;
    try { const r = await fetch(Z.ROOT + 'analysis/lyrics_mv.lrc'); if (!r.ok) throw 0; lrc = await r.text(); }
    catch (e) { lrc = await (await fetch(Z.ROOT + 'analysis/lyrics_draft.lrc')).text(); }
    lrc = lrc.replace(/^\[ti:.*\]\s*$/m, '');
    JZ.setAudio({ duration: audio.duration, beats: audio.beats, energy: null, energyRate: 0 });
    // curate JIZURA's 860 parts for a melancholic tegaki MV: keep emotional / calm / editorial / glitch parts,
    // drop novelty objects, UI gimmicks, horror and wa props, and full-frame panel effects (our post pass owns those)
    const DENY = {
      layout: 'scatter ring wave labels pill knSeesaw knGearWords knTumble knPadGrid knPathRide zigzag arcTop gridCells bubble ticker searchBar chat notification ticket hanging wordCloud bounceLine elastic stickerBomb keycaps bubbles slotMachine flipBoard dotMatrix equalizer tape contents numbered poster ema ransom newspaper vinyl cassette bookSpine stampSheet calendar chochin routeMap stationSign noren tanzaku omikuji kakejiku shoji clapper warningLabel priceTag nameTag stickyNotes karuta cube flipCards accordion pile blocks balloons magnets tiles bulbs ledScroll billboard crowdBubbles crossword wordSearch puzzle dominoes burst fisheye origami zipper mosaicTiles stencil tyIndexTable tyStatCount typeSpecimen dictionary proofread magazine headlineDeck footnote ribbon flag pendulum knCollide knSlamStack halftoneBig tySquare tyRotBlock subtitleBar tile kaleido polaroid postcard letterPaper genkou panels splitScreen splitHalves wall cylinder cube',
      fx: 'panelWipe irisTrans doors blindsTrans splitSlide gridRepeat whiteFrame blackFrame strobe colorBars mirrorFlash starGlint focusLines speedLines halftone duotone kaleido bulge squash snapshot loopScroll crtOff tvStatic zoomStutter negativeRing edgeDetect hueShift posterize ditherBit rotateSnap invert bandInvert flash bloomFlash',
      decor: 'dots arrows shapes qrBlock triangleSpin checkerStrip confetti petals heartsStars kamon seigaiha asanoha hanabi chochin shimenawa sensu momiji namiGashira memphis zigzagRibbon polkaPatch stripeCircle starburst cursorClick windowChrome progressBar toggleSwitch notifBell likeCounter mediaControls volumeBars musicNotes bubbles dandelion vines cloudPuffs tapePieces highlightMark staple paperClip indexTabs punchHoles swatches spinner tally qrBlock bracketsJP loopArrows halfCircles decoCorners tyColophon dateStamp tyTypeScale tyTextRule',
      cam: 'knCardFlip jelly bounce knJumpCut knTiltKick knReadPan knShearKick knRushIn',
      treat: 'boxed marker knWordPlate circled sticker splitColor rainbow chrome',
      enter: 'bubbles stickerPeel crumple loadingBar tokoroten',
      exit: 'balloonOff crumpleOut peelOff',
      bg: 'argyle tartan chevron houndstooth herringbone polka checker retroGrid eqBars kaleidoscope fireworks sunburst bigStripes isoCubes seigaiha asanoha tvBars splitDiag spiralArms squareTunnel moire',
      trans: 'knCornerSwing knStripSlam checker cubeTurn spinOut doorsOpen pixelate',
    };
    const REG = { layout: J.LAYOUTS, enter: J.ENTER, exit: J.EXIT, hold: J.HOLD, decor: J.DECOR, treat: J.TREAT, bg: J.BG, cam: J.CAM, fx: J.FXE, trans: J.TRANS };
    const enabled = {};
    for (const g of J.GROUP_KEYS) {
      enabled[g] = {}; const deny = new Set((DENY[g] || '').split(/\s+/).filter(Boolean));
      for (const k of J.order(g)) {
        const d = (REG[g] || {})[k] || {}, moods = Array.isArray(d.moods) ? d.moods : null;
        let ok = !deny.has(k) && !/^hr[A-Z]/.test(k);
        if (ok && moods && !moods.some(m => ['emotional', 'calm', 'editorial', 'glitch'].includes(m))) ok = false;
        if (ok && moods && moods.includes('horror')) ok = false;
        if (k === 'none') ok = true;
        enabled[g][k] = ok;
      }
    }
    const common = {
      enabled, lyrics: lrc, fps: 30, res: 1080, aspect: '16:9', seed: 2609, unify: true, typeset: true, extra: true, wa: false, horror: false,
      colors: { accentOn: true, accent: '#FFA552', ghostA: '#39C6E0', ghostB: '#C8373A' }, schemes: 'dark',
      fx: { motion: 0.7, glitch: 0.45, chroma: 0.6, decor: 0.45, density: 0.5, texture: 0.5, flash: false, koma: 12, hud: 'off', bgSwitch: 0.3 } };
    await JZ.addPlan('main', Object.assign({}, common, { style: 'gold', mood: 'emotional' }));
    await JZ.addPlan('cf', Object.assign({}, common, { style: 'gold', mood: 'emotional', centerFree: true }));
    await JZ.addPlan('noir', Object.assign({}, common, { style: 'noir', mood: 'glitch', fx: Object.assign({}, common.fx, { glitch: 0.7, chroma: 0.8 }) }));
    await JZ.addPlan('mono', Object.assign({}, common, { style: 'mono', mood: 'graphic', seed: 2610, fx: Object.assign({}, common.fx, { motion: 0.85, chroma: 0.9 }) }));

    // ---- shots
    const S = [];
    const shot = (id, t0, t1, scene, args, extra = {}) => S.push(Object.assign({ id, t0, t1, scene, args }, extra));

    // ===== INTRO 1 (蕾): the ember
    const introStops = [[1.75, 1.90], [3.80, 4.25], [4.99, 5.16], [5.90, 6.10]];
    shot('s01', 0, B(4), 'ember', { mode: 'breathe', stops: introStops }, { lyric: 'none', post: { boil: 0, bloom: 0.6, lutMix: 0 } });
    shot('s02', B(4), B(6), 'ember', { mode: 'ignite' }, { lyric: 'none', post: { boil: 0.6, bloom: 0.7 } });
    // ===== INTRO 2: title sequence on the riff
    shot('s03', B(6), B(10), 'titleRiff', { variant: 'intro' }, { lyric: 'none', post: { boil: 0.8, bloom: 0.45, beatCA: 2.5, grain: 0.07 } });

    // ===== VERSE 1a — P1 dusk, the cracked sky
    shot('s04', B(10), nb(20.76), 'illust', {
      bg: BG + 'bg_sky.png', bgFrom: { zoom: 1.28, y: -0.7 }, bgTo: { zoom: 1.12, y: 0.55 }, bgEase: 'inOutCubic',
      fxBack: [{ type: 'glow', x: 1130, y: 330, r: 520, color: '#FFA552', a: 0.45 }, { type: 'cracks', seed: 4, x: 1130, y: 330, n: 26, reach: 1300, at: 0.25, dur: 2.2, width: 0.75, alpha: 0.95 }],
      chars: [{ img: A + 'back_sunset.png', front: true, x: 880, y: 1330, h: 1180, y2: 1290, rim: { color: '#FFA552' }, wave: { amp: 16, from: 0.2 }, in: { dur: 1.4, dy: 160, ease: 'outCubic' } }],
      fx: [{ type: 'dust', n: 40 }], vignette: 0.45,
    }, { trans: { type: 'iris', dur: 0.55, cx: 960, cy: 540 }, post: { lutA: 'P1', lutMix: 0.18, ca: 1 } });
    shot('s05', nb(20.76), nb(24.53), 'illust', {
      bg: BG + 'bg_crossing.png', bgFrom: { zoom: 1.06, x: 0.1 }, bgTo: { zoom: 1.2, x: 0.25, y: 0.1 },
      fxBack: [longShadow(A + 'hug_self.png', 960, 860, 380, 3.2, -0.55)],
      chars: [{ img: A + 'hug_self.png', x: 960, y: 860, h: 380, rim: { color: '#FF9A55', off: [4, -2] }, wave: { amp: 5 } }],
      fx: [{ type: 'embers', n: 26, area: [0, 500, W, H], alpha: 0.6 }], vignette: 0.5,
    }, { plan: 'main', post: { lutA: 'P1', lutMix: 0.25 } });
    shot('s06', nb(24.53), nb(28.25), 'thread', { hand: A + 'hand_reach.png' }, { post: { lutA: 'P1', lutMix: 0.1, bloom: 0.45 } });
    shot('s07', nb(28.25), B(18), 'illust', {
      bg: BG + 'bg_platform.png', bgFrom: { zoom: 1.32, x: -0.55, y: 0.2 }, bgTo: { zoom: 1.06, x: -0.1 }, bgEase: 'outCubic',
      chars: [{ img: A + 'sit_knees.png', x: 640, y: 930, h: 440, x2: 700, y2: 900, h2: 380, rim: { color: '#FFB36B', off: [5, -3] }, wave: { amp: 6 } }],
      fx: [{ type: 'dust', n: 50 }], vignette: 0.45,
    }, { trans: { type: 'xfade', dur: 0.5 }, post: { lutA: 'P1', lutMix: 0.22 } });

    // ===== VERSE 1b — drums enter, night creeps in (P2)
    shot('s08', B(18), nb(35.73), 'illust', {
      bg: BG + 'bg_door.png', bgFrom: { zoom: 1.0, x: 0.1 }, bgTo: { zoom: 1.45, x: 0.42, y: 0.08 }, bgEase: 'inOutCubic', beatZoom: 0.008,
      fx: [{ type: 'custom', fn: (ctx, S) => { const [x, y, s] = bgPt(S, 0.655, 0.45); D.glow(ctx, x, y, 240 * s * (0.8 + S.p), '#FFA552', 0.35 + 0.4 * S.p); } }, { type: 'rain', n: 120, color: 'rgba(170,190,255,0.22)' }],
      vignette: 0.55,
    }, { trans: { type: 'cut' }, post: { lutA: 'P2', lutMix: 0.3 } });
    shot('s09', nb(35.73), nb(39.45), 'illust', {
      bg: A + 'eyes_ecu.png', bgFrom: { zoom: 1.04, y: 0.1 }, bgTo: { zoom: 1.2, x: 0.05, y: 0.15 },
      fx: [{ type: 'custom', fn: (ctx, S) => { const [x, y] = bgPt(S, 0.693, 0.536); D.glow(ctx, x, y, 60, '#FFF1D0', 0.5 + 0.4 * Math.sin(S.t * 3)); } }],
      vignette: 0.4,
    }, { trans: { type: 'flash', dur: 0.12 }, post: S => ({ lutA: 'P1', lutMix: 0.12, glitch: Math.max(0, 1 - Math.abs(S.t - B(20)) * 6) * 0.8, ca: 1.5 }) });
    shot('s10', nb(39.45), nb(43.20), 'illust', {
      grad: [[0, '#070b1c'], [0.6, '#122344'], [1, '#1f3656']],
      chars: [{ img: A + 'hand_reach.png', x: 1220, y: 1250, h: 1250, rot: -0.12, x2: 1180, y2: 1210, sway: 0.02, wave: false, rim: { color: '#9CC2C0', off: [-6, -4] } }],
      fx: [{ type: 'dust', n: 110, color: 'rgba(200,225,255,0.55)' }, { type: 'glow', x: 1330, y: 200, r: 420, color: '#8FB2C9', a: 0.25 }], vignette: 0.6,
    }, { trans: { type: 'xfade', dur: 0.35 }, plan: 'cf', post: { lutA: 'night', lutMix: 0.55, saturation: 0.85 } });
    shot('s11', nb(43.20), nb(47.00), 'illust', {
      bg: BG + 'bg_train_night.png', bgFrom: { zoom: 1.05 }, bgTo: { zoom: 1.25, y: 0.1 },
      chars: [{ img: A + 'sit_knees.png', x: 960, y: 1030, h: 400, rim: { color: '#9CC2C0', off: [-4, -2] }, wave: { amp: 4 } }],
      fx: [lightSweep('#DDE8FF', 0.16, 1400, 3)], vignette: 0.5,
    }, { post: { lutA: 'night', lutMix: 0.4 } });

    // ===== PRE-CHORUS 1 — falling (P3 / P4)
    shot('s12', nb(47.00), nb(50.87), 'fall', { char: A + 'fall.png' }, { plan: 'noir', trans: { type: 'black', dur: 0.3 }, post: { lutMix: 0, bloom: 0.5, ca: 1.5 } });
    shot('s13', nb(50.87), nb(54.43), 'jz', { plan: 'noir' }, { lyric: 'none', post: { boil: 0.5, lutA: 'P1_duo', lutMix: 0.25, beatCA: 3 } });
    shot('s14', nb(54.43), B(32), 'illust', {
      grad: [[0, '#050F16'], [0.7, '#0C2233'], [1, '#17405A']],
      chars: [{ img: A + 'bust_calm.png', x: 960, y: 1120, h: 1060, h2: 1140, breathe: 3, wave: { amp: 12, from: 0.35 }, rim: { color: '#DDFF7A', off: [5, -4] } }],
      fx: [{ type: 'fireflies', n: 26, alpha: 0.7 }], vignette: 0.55,
    }, { plan: 'cf', trans: { type: 'xfade', dur: 0.4 }, post: { lutA: 'P4', lutMix: 0.35 } });
    // ===== BREAK 1 — the small flame
    shot('s15', B(32), B(34), 'flame', { mode: 'breathe', img: A + 'flame_hands.png', stops: [[60.13, 60.47]] }, { plan: 'cf', trans: { type: 'black', dur: 0.25 }, post: { bloom: 0.6 } });

    // ===== CHORUS 1 — P1 on fire
    shot('s16', B(34), nb(64.12), 'kanjiSlam', { glyphs: ['救', 'って', '救', 'って'], char: A + 'profile_sing.png', bg: BG + 'bg_sky.png' }, { lyric: 'none', post: { lutA: 'P1', lutMix: 0.2, beatCA: 4, bloom: 0.4 } });
    shot('s17', nb(64.12), nb(65.98), 'illust', {
      bg: BG + 'bg_sky.png', bgFrom: { zoom: 1.2, y: 0.3 }, bgTo: { zoom: 1.28, y: 0.35 }, beatZoom: 0.02,
      fxBack: [{ type: 'cracks', seed: 4, x: 1130, y: 260, n: 26, reach: 1500, prog: 1, width: 0.8 }, { type: 'glow', x: 1130, y: 260, r: 600, color: '#FFA552', a: 0.5 }],
      chars: [{ img: A + 'lookup_tear.png', front: true, x: 1020, y: 1120, h: 1150, wave: { amp: 26, from: 0.25, speed: 5 }, rim: { color: '#FFA552' } }],
      fx: [{ type: 'embers', n: 70, wind: 0.6 }],
    }, { post: { lutA: 'P1', lutMix: 0.2, ca: 2 } });
    shot('s18', nb(65.98), nb(67.83), 'heart', { mode: 'shatter' }, { post: { lutA: 'P1', lutMix: 0.1, bloom: 0.55 } });
    shot('s19', nb(67.83), nb(69.67), 'heart', { mode: 'gather', char: A + 'kneel_pick.png' }, { plan: 'cf', post: { lutA: 'P1', lutMix: 0.15, bloom: 0.5 } });
    shot('s20', nb(69.67), nb(73.95), 'panels', {
      panels: [{ char: A + 'bust_sing.png', bg: BG + 'bg_sky.png' }, { img: A + 'eyes_ecu.png' }, { char: A + 'hand_reach.png', bg: BG + 'bg_crossing.png' }], collapseAt: B(39),
    }, { post: { lutA: 'P1', lutMix: 0.18, beatCA: 2.5 } });
    shot('s21', nb(73.95), B(42), 'illust', {
      bg: BG + 'bg_embankment.png', bgFrom: { zoom: 1.08, x: -0.3 }, bgTo: { zoom: 1.22, x: -0.55, y: 0.05 },
      fxBack: [sinkingSun(0.24, 0.42, 26, 70, 0.3)],
      chars: [{ img: A + 'back_sunset.png', x: 1380, y: 1010, h: 560, wave: { amp: 10, from: 0.2 }, rim: { color: '#FFA552', off: [-5, -3] } }],
      fx: [{ type: 'embers', n: 40, area: [0, 400, W, H], alpha: 0.7 }, { type: 'rays', x: 470, y: 420, n: 16, len: 1600, a: 0.12 }], vignette: 0.4,
    }, { trans: { type: 'iris', dur: 0.45, cx: 470, cy: 420 }, post: { lutA: 'P1', lutMix: 0.2 } });
    shot('s22', B(42), B(43), 'ref', { shot: 's21', mode: 'freeze', at: 77.69 }, { post: { lutA: 'P1', lutMix: 0.2 } });

    // ===== POST-CHORUS — 3D showcase A
    shot('s23', B(43), B(47), 'seq', { pattern: 'blender/renders/A/f_####.jpg', t0: B(43), fps: 30, frames: 222 }, { lyric: 'none', trans: { type: 'shatter', dur: 0.5 }, post: { boil: 0.5, bloom: 0.4, beatCA: 2 } });

    // ===== VERSE 2 — night & rain
    shot('s24', B(47), nb(89.78), 'wetFloor', { mode: 'fall', bg: BG + 'bg_wetstreet.png' }, { trans: { type: 'flash', dur: 0.2, color: '#9CC2C0' }, post: { lutA: 'night', lutMix: 0.25 } });
    shot('s25', nb(89.78), nb(93.35), 'wetFloor', { mode: 'count' }, { post: { lutA: 'night', lutMix: 0.3 } });
    shot('s26', nb(93.35), nb(97.17), 'illust', {
      grad: [[0, '#0b0a12'], [1, '#1a1426']],
      fxBack: [{ type: 'rays', x: 960, y: -120, n: 10, len: 1500, color: '#E9D9B8', a: 0.16 }, { type: 'glow', x: 960, y: 980, r: 520, color: '#E9D9B8', a: 0.18 }],
      chars: [{ img: A + 'hug_self.png', x: 960, y: 1060, h: 940, rim: { color: '#E9D9B8', off: [4, -3] }, wave: { amp: 5 } }],
      fx: [{ type: 'feathers', n: 18 }, { type: 'feathers', n: 8, seed: 77, size: 1.6, color: 'rgba(20,11,30,0.95)', line: 'rgba(244,239,230,0.6)' }], vignette: 0.6,
    }, { plan: 'cf', trans: { type: 'xfade', dur: 0.3 }, post: { lutA: 'P2', lutMix: 0.3, saturation: 0.8 } });
    shot('s27', nb(97.17), nb(101.09), 'illust', {
      bg: BG + 'bg_train_night.png', bgFrom: { zoom: 1.35, x: -0.3 }, bgTo: { zoom: 1.45, x: 0.3 }, tint: [{ color: '#0b1524', a: 0.45, comp: 'multiply' }],
      chars: [{ img: A + 'bust_calm.png', x: 900, y: 1110, h: 1040, wave: { amp: 8, from: 0.35 } }],
      fx: [lightSweep('#FFE3B0', 0.2, 1100, 2, 0.2), { type: 'feathers', n: 6, seed: 9 }], vignette: 0.5,
    }, { plan: 'cf', post: { lutA: 'night', lutMix: 0.35 } });
    shot('s28', nb(101.09), nb(102.91), 'illust', {
      bg: BG + 'bg_rooftop.png', bgFrom: { zoom: 1.45, y: 0.2 }, bgTo: { zoom: 1.02 }, bgEase: 'outExpo', tint: [{ color: '#101a3a', a: 0.5 }],
      chars: [{ img: A + 'turn_smile.png', x: 960, y: 1120, h: 1100, x2: 1000, y2: 860, h2: 360, ease: 'outExpo', wave: { amp: 14 } }],
      vignette: 0.5,
    }, { post: { lutA: 'night', lutMix: 0.45 } });
    shot('s29', nb(102.91), nb(104.49), 'typeCard', { lines: ['もう何も要らない'], mode: 'quiet' }, { lyric: 'none', trans: { type: 'cut' }, post: { boil: 0 } });
    shot('s30', nb(104.49), nb(107.94), 'illust', {
      grad: [[0, '#0b0a12'], [1, '#231423']],
      chars: [{ img: A + 'bust_calm.png', x: 960, y: 1110, h: 1080, h2: 1160, wave: { amp: 8, from: 0.35 }, rim: { color: '#FFA552', off: [4, -3] } }],
      fx: [heartGlow(960, 890, 230)], vignette: 0.55,
    }, { plan: 'cf', trans: { type: 'iris', dur: 0.4, cx: 960, cy: 890 }, post: { lutA: 'P1', lutMix: 0.15 } });
    shot('s31', nb(107.94), B(60), 'flame', { mode: 'grow', img: A + 'flame_hands.png' }, { plan: 'cf', post: { lutA: 'P1', lutMix: 0.12, bloom: 0.55 } });
    shot('s32', B(60), nb(114.70), 'ref', { shot: 's31', mode: 'melt', at: 110.4 }, { post: { lutA: 'night', lutMix: 0.3 } });

    // ===== PRE-CHORUS 2 — the crossing at night
    shot('s33', nb(114.70), nb(119.19), 'train', { bg: BG + 'bg_crossing_night.png' }, { plan: 'noir', trans: { type: 'barrier', dur: 0.45 }, post: { lutA: 'P4', lutMix: 0.1, bloom: 0.5 } });
    shot('s34', nb(119.19), B(67), 'illust', {
      grad: [[0, '#050F16'], [1, '#17405A']],
      chars: [{ img: A + 'profile_sing.png', x: 720, y: 1100, h: 1000, x2: 760, wave: { amp: 18, from: 0.25 }, rim: { color: '#DDFF7A', off: [6, -3] } }],
      fx: [soundRings(1380, 420, '#9CC2C0', 0), { type: 'fireflies', n: 18, alpha: 0.6 }], vignette: 0.5,
    }, { plan: 'noir', post: { lutA: 'P4', lutMix: 0.3, beatCA: 2 } });
    shot('s35', B(67), nb(127.28), 'illust', {
      bg: BG + 'bg_crossing_night.png', bgFrom: { zoom: 1.35, x: -0.6, y: 0.1 }, bgTo: { zoom: 1.5, x: -0.35, y: 0.15 }, beatZoom: 0.012,
      fxBack: [lamps([[0.075, 0.35, 0.165, 0.35, 10]]), { type: 'rain', n: 90, color: 'rgba(170,190,255,0.18)' }],
      chars: [{ img: A + 'bust_sing.png', front: true, x: 1240, y: 1110, h: 1080, x2: 1200, h2: 1140, wave: { amp: 16, from: 0.3 }, rim: { color: '#FF4B3A', off: [-8, -3] } }],
      fx: [{ type: 'fireflies', n: 14, alpha: 0.5 }], vignette: 0.55,
    }, { plan: 'noir', trans: { type: 'slices', dur: 0.35 }, post: { lutA: 'P4', lutMix: 0.15, bloom: 0.5, beatCA: 2.5 } });
    shot('s36', nb(127.28), B(70), 'illust', {
      bg: BG + 'bg_rooftop.png', bgFrom: { zoom: 1.1 }, bgTo: { zoom: 1.2 }, tint: [{ color: '#101a3a', a: 0.55 }],
      chars: [{ img: A + 'reach_viewer.png', x: 960, y: 1130, h: 1100, h2: 2300, y2: 1500, ease: 'inExpo', wave: { amp: 18, from: 0.2 } }],
      vignette: 0.5,
    }, { plan: 'cf', post: S => ({ lutA: 'night', lutMix: 0.4, fade: Z.clamp((S.p - 0.85) / 0.15) }) });
    shot('s37', B(70), B(71), 'typeCard', { lines: ['ここにいて'], mode: 'quiet' }, { lyric: 'none', post: { boil: 0, beatCA: 5 } });

    // ===== CHORUS 2 — P1 → P4, the sky breaks into night
    shot('s38', B(71), nb(132.22), 'kanjiSlam', { glyphs: ['救', 'って', '救', 'って'], char: A + 'sing_power.png', variant: 'night', bg: BG + 'bg_sky.png' }, { lyric: 'none', post: { lutA: 'P1', lutMix: 0.2, beatCA: 4 } });
    shot('s39', nb(132.22), nb(135.87), 'skyShatter', { bg: BG + 'bg_sky.png', char: A + 'back_sunset.png' }, { post: { lutA: 'P1', lutB: 'P4', lutMix: 0.15, bloom: 0.5 } });
    shot('s40', nb(135.87), nb(137.71), 'heart', { mode: 'gather', char: A + 'kneel_pick.png', bg: BG + 'bg_fireflies.png' }, { plan: 'cf', post: { lutA: 'P4', lutMix: 0.2, bloom: 0.5 } });
    shot('s41', nb(137.71), nb(141.95), 'panels', {
      panels: [{ bg: BG + 'bg_crossing_night.png' }, { char: A + 'bust_sing.png', bg: BG + 'bg_fireflies.png' }, { img: A + 'eyes_ecu.png' }, { char: A + 'hand_reach.png', bg: BG + 'bg_sky.png' }],
    }, { post: { lutA: 'P4', lutMix: 0.15, beatCA: 2.5 } });
    shot('s42', nb(141.95), B(79), 'illust', {
      bg: BG + 'bg_crossing_night.png', bgFrom: { zoom: 1.08 }, bgTo: { zoom: 1.2, y: 0.1 },
      fxBack: [lamps([[0.075, 0.35, 0.165, 0.35, 10], [0.86, 0.44, 0.915, 0.44, 7]])],
      chars: [{ img: A + 'back_sunset.png', x: 960, y: 1060, h: 700, wave: { amp: 12, from: 0.2 }, rim: { color: '#FF4B3A', off: [-5, -2] } }],
      fx: [fireflyGlyph('光', 960, 330, 520, 142.4, 145.4), { type: 'fireflies', n: 30 }], vignette: 0.45,
    }, { post: { lutA: 'P4', lutMix: 0.12, bloom: 0.55 } });
    shot('s43', B(79), B(80), 'ref', { shot: 's42', mode: 'rewind', span: 3.5 }, { post: { lutA: 'P4', lutMix: 0.1 } });

    // ===== INTERLUDE — 3D showcase B
    shot('s44', B(80), B(84), 'seq', { pattern: 'blender/renders/B/f_####.jpg', t0: B(80), fps: 30, frames: 220 }, { lyric: 'none', trans: { type: 'cut' }, post: { boil: 0.5, bloom: 0.5 } });

    // ===== BRIDGE — memories → despair → road of tears
    shot('s45', B(84), nb(161.91), 'memories', {
      photos: [{ bg: BG + 'bg_classroom.png', caption: '放課後' }, { bg: BG + 'bg_platform.png', caption: 'あの日の駅' }, { bg: BG + 'bg_embankment.png', caption: '帰り道' }, { bg: BG + 'bg_train.png', caption: '夕方の電車' }],
      char: A + 'turn_smile.png',
    }, { trans: { type: 'flash', dur: 0.3 }, post: { lutA: 'P5', lutMix: 0.25, grain: 0.09 } });
    shot('s46', nb(161.91), B(90), 'ink', { char: A + 'hug_self.png' }, { plan: 'cf', trans: { type: 'ink', dur: 0.6 }, post: { saturation: 0.7 } });
    shot('s47', B(90), nb(169.19), 'illust', {
      grad: [[0, '#07060c'], [1, '#1a1026']],
      fxBack: [{ type: 'glow', x: 960, y: 420, r: 700, color: '#3A1745', a: 0.5 }],
      chars: [{ img: A + 'face_tear.png', x: 960, y: 1180, h: 1300, h2: 1380, y2: 1220, wave: { amp: 6, from: 0.45 }, rim: { color: '#9CC2C0', off: [-5, -3] } }],
      fx: [{ type: 'custom', fn: (ctx, S) => { const t0 = 166.6, k = Z.clamp((S.t - t0) / 2.2); if (k <= 0) return; const x = 872, y = 540 + E.inQuad(k) * 700;
        ctx.save(); ctx.fillStyle = 'rgba(225,242,255,0.9)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 13, 0, 0, Z.TAU); ctx.fill(); ctx.restore(); D.glow(ctx, x, y, 46, '#9CC2C0', 0.7); } },
        { type: 'dust', n: 30, color: 'rgba(200,220,255,0.35)' }], vignette: 0.65,
    }, { plan: 'cf', trans: { type: 'xfade', dur: 0.4 }, post: { lutA: 'P2', lutMix: 0.3, saturation: 0.75 } });
    shot('s48', nb(169.19), nb(176.48), 'road', { mode: 'tear' }, { trans: { type: 'black', dur: 0.3 }, post: { bloom: 0.55, lutA: 'dawn', lutMix: 0.08 } });
    shot('s49', nb(176.48), nb(179.9), 'road', { mode: 'run', char: A + 'run.png' }, { post: { bloom: 0.55, beatCA: 2 } });

    // ===== BREAK 3 — 怖くても
    shot('s50', nb(179.9), nb(181.6), 'flame', { mode: 'dark', face: A + 'bust_calm.png', stops: [[181.6, 181.9]] }, { plan: 'cf', trans: { type: 'black', dur: 0.2 }, post: { bloom: 0.5 } });
    shot('s51', nb(181.6), B(100), 'converge', {}, { lyric: 'none', post: { bloom: 0.7, beatCA: 3 } });

    // ===== LAST CHORUS — everything on fire
    shot('s52', B(100), nb(185.12), 'kanjiSlam', { glyphs: ['救', 'って', '救', 'って'], char: A + 'profile_sing.png', bg: BG + 'bg_sky.png', fire: true }, { lyric: 'none', post: { lutA: 'P1', lutMix: 0.25, beatCA: 5, bloom: 0.55 } });
    shot('s52b', nb(185.12), nb(186.94), 'illust', {
      bg: BG + 'bg_sky.png', bgFrom: { zoom: 1.3, y: 0.2, rot: -0.03 }, bgTo: { zoom: 1.38, y: 0.3, rot: 0.02 }, beatZoom: 0.03,
      fxBack: [{ type: 'cracks', seed: 12, x: 700, y: 200, n: 30, reach: 1800, prog: 1, width: 1.2 }, { type: 'glow', x: 700, y: 200, r: 800, color: '#FF7A3A', a: 0.55, beat: 0.4 }],
      chars: [{ img: A + 'sing_power.png', front: true, x: 1120, y: 1130, h: 1180, wave: { amp: 34, from: 0.2, speed: 7 }, rim: { color: '#FFA552' }, in: { dur: 0.35, dx: 120, ds: 0.08 } }],
      fx: [{ type: 'embers', n: 140, wind: 1.0, size: 4 }],
    }, { plan: 'mono', post: { lutA: 'P1', lutMix: 0.25, bloom: 0.55, beatCA: 4 } });
    shot('s53', nb(186.94), nb(188.75), 'heart', { mode: 'burn' }, { plan: 'mono', post: { lutA: 'P1', lutMix: 0.15, bloom: 0.6 } });
    shot('s54', nb(188.75), nb(190.57), 'heart', { mode: 'sun', char: A + 'kneel_pick.png' }, { plan: 'cf', post: { lutA: 'P1', lutMix: 0.15, bloom: 0.65 } });
    shot('s56', nb(190.57), nb(192.39), 'kanjiSlam', { glyphs: ['救', 'って', '救', 'って'], char: A + 'hand_reach.png', variant: 'hand', bg: BG + 'bg_sky.png', fire: true }, { lyric: 'none', post: { lutA: 'P1', lutMix: 0.25, beatCA: 5 } });
    shot('s55', nb(192.39), nb(194.77), 'burst', { cuts: [
      { bg: BG + 'bg_crossing.png', char: A + 'bust_sing.png' }, { bg: BG + 'bg_platform.png', char: A + 'profile_sing.png' },
      { bg: BG + 'bg_embankment.png', char: A + 'face_tear.png' }, { bg: BG + 'bg_rooftop.png', char: A + 'turn_smile.png' }, { bg: BG + 'bg_sky.png', char: A + 'hands_shards.png' }] }, { plan: 'mono', post: { lutA: 'P1', lutMix: 0.2, beatCA: 4 } });
    shot('s57', nb(194.77), B(107), 'illust', {
      bg: BG + 'bg_sky.png', bgFrom: { zoom: 1.15, y: 0.4 }, bgTo: { zoom: 1.35, y: 0.5 }, beatZoom: 0.03,
      fxBack: [{ type: 'cracks', seed: 8, x: 1000, y: 250, n: 30, reach: 1700, prog: 1, width: 1.1, alpha: 1 }, { type: 'glow', x: 1000, y: 250, r: 900, color: '#FFE3B0', a: 0.7, beat: 0.5 }, { type: 'rays', x: 1000, y: 250, n: 24, len: 2000, a: 0.22 }],
      chars: [{ img: A + 'lookup_tear.png', front: true, x: 960, y: 1130, h: 1180, wave: { amp: 30, from: 0.25, speed: 6 }, rim: { color: '#FFE3B0' } }],
      fx: [{ type: 'embers', n: 110, wind: 0.8 }],
    }, { plan: 'mono', post: { lutA: 'P1', lutMix: 0.25, bloom: 0.6, beatCA: 3 } });
    shot('s58', B(107), nb(198.32), 'illust', {
      bg: BG + 'bg_crossing.png', bgFrom: { zoom: 1.05 }, bgTo: { zoom: 1.3, x: 0.25, y: 0.05 }, bgEase: 'inCubic',
      fxBack: [sinkingSun(0.664, 0.472, 22, 50, 0.2)],
      chars: [{ img: A + 'back_sunset.png', x: 960, y: 1090, h: 780, wave: { amp: 16, from: 0.2 }, rim: { color: '#FFA552' } }],
      fx: [{ type: 'embers', n: 90 }, { type: 'rays', x: 1275, y: 505, n: 20, len: 1800, a: 0.18 }],
    }, { plan: 'mono', post: S => ({ lutA: 'P1', lutMix: 0.2, bloom: 0.5 + 0.4 * S.p, flash: Math.pow(Z.clamp((S.t - 197.8) / 0.52), 2) * 0.9 }) });
    // 「ひかりを残して」 — the climax line: she leaps into an exploding sun
    shot('s58b', nb(198.32), nb(200.02), 'illust', {
      grad: [[0, '#3A1745'], [0.45, '#C8373A'], [0.8, '#F0663A'], [1, '#FFA552']],
      fxBack: [{ type: 'glow', x: 960, y: 470, r: 1100, color: '#FFE3B0', a: 0.8, beat: 0.5 }, { type: 'rays', x: 960, y: 470, n: 32, len: 2200, color: '#FFE3B0', a: 0.3 },
        { type: 'custom', fn: (ctx, S) => { const k = E.outExpo(Z.clamp(S.lt / 1.2)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = Z.rgba('#FFF1D0', 0.8 * (1 - k)); ctx.lineWidth = 18 * (1 - k) + 2; ctx.beginPath(); ctx.arc(960, 470, 120 + k * 1300, 0, Z.TAU); ctx.stroke(); ctx.restore(); D.disc(ctx, 960, 470, 170, '#FFF4DC', 0.95); } }],
      chars: [{ img: A + 'jump.png', front: true, x: 960, y: 1180, h: 1120, y2: 1120, h2: 1180, ease: 'outCubic', wave: { amp: 30, from: 0.2, speed: 6 }, sil: null, rim: { color: '#FFF1D0' }, in: { dur: 0.5, dy: 260, ds: -0.1 } }],
      fx: [{ type: 'embers', n: 160, size: 4, rise: 180 }],
    }, { post: { lutA: 'P1', lutMix: 0.15, bloom: 0.6, beatCA: 3 } });

    // ===== LAST CHORUS 2 — climax → dawn
    shot('s59', nb(200.02), nb(203.28), 'burst', { cuts: [
      { bg: BG + 'bg_crossing_night.png', char: A + 'run.png' }, { bg: BG + 'bg_sky.png', char: A + 'turn_smile.png' },
      { bg: BG + 'bg_rooftop.png', char: A + 'sing_power.png' }, { bg: BG + 'bg_embankment.png', char: A + 'reach_viewer.png' },
      { bg: BG + 'bg_platform.png', char: A + 'lookup_tear.png' }, { bg: BG + 'bg_crossing_dawn.png', char: A + 'bust_sing.png' }, { bg: BG + 'bg_crossing_dawn.png', char: A + 'jump.png', view: { zoom: 1.3, x: 0.2, y: 0.25 } }], grade: 'night2dawn' }, { post: S => ({ lutA: 'night', lutB: 'dawn', lutBlend: S.p, lutMix: 0.3, beatCA: 4, bloom: 0.5 }) });
    shot('s60', nb(203.28), B(112), 'illust', {
      bg: BG + 'bg_crossing_dawn.png', bgFrom: { zoom: 1.02 }, bgTo: { zoom: 1.18, y: 0.1 },
      fxBack: [{ type: 'rays', x: 1150, y: 560, n: 22, len: 1900, color: '#FFD9B0', a: 0.09 }, { type: 'glow', x: 1150, y: 560, r: 420, color: '#FFD9B0', a: 0.28 }],
      chars: [{ img: A + 'back_sunset.png', x: 900, y: 1150, h: 1000, x2: 1020, y2: 900, h2: 470, ease: 'inOutSine', wave: { amp: 12, from: 0.2 }, rim: { color: '#FFD9B0', off: [-5, -3] } }],
      fx: [{ type: 'dust', n: 60, color: 'rgba(255,230,200,0.6)' }],
    }, { trans: { type: 'flash', dur: 0.25 }, post: { lutA: 'dawn', lutMix: 0.2, bloom: 0.5 } });
    shot('s61', B(112), B(114), 'tunnel', { words: ['黒闇の果てで', 'まだ遅くない', 'あなたに会いたい', '光', '残光'], toward: 'dawn' }, { lyric: 'none', post: { bloom: 0.6 } });
    shot('s62', B(114), nb(210.78), 'illust', {
      bg: BG + 'bg_crossing_dawn.png', bgFrom: { zoom: 1.25, y: 0.2 }, bgTo: { zoom: 1.3, y: 0.25 }, fxBack: [{ type: 'glow', x: 1150, y: 520, r: 560, color: '#FFD9B0', a: 0.3 }],
      chars: [{ img: A + 'reach_viewer.png', front: true, x: 960, y: 1120, h: 1120, h2: 1220, wave: { amp: 16, from: 0.2 }, rim: { color: '#FFD9B0' } }],
    }, { plan: 'cf', trans: { type: 'flash', dur: 0.2, color: '#FFD9B0' }, post: { lutA: 'dawn', lutMix: 0.1, bloom: 0.32, bloomThreshold: 0.8, exposure: -0.12 } });
    shot('s63', nb(210.78), B(116), 'illust', {
      bg: BG + 'bg_crossing_dawn.png', bgFrom: { zoom: 1.4, x: 0.4, y: 0.3 }, bgTo: { zoom: 1.45, x: 0.45, y: 0.3 },
      fxBack: [{ type: 'glow', x: 1500, y: 480, r: 620, color: '#FFD9B0', a: 0.34 }, { type: 'rays', x: 1500, y: 480, n: 18, len: 1800, color: '#FFE3B0', a: 0.08 }],
      chars: [{ img: A + 'smile_dawn.png', front: true, x: 780, y: 1120, h: 1100, wave: { amp: 14, from: 0.3 }, rim: { color: '#FFE3B0', off: [7, -3] } }],
      fx: [{ type: 'dust', n: 50, color: 'rgba(255,240,215,0.7)' }],
    }, { plan: 'cf', post: { lutA: 'dawn', lutMix: 0.08, bloom: 0.3, bloomThreshold: 0.82, exposure: -0.15, contrast: 1.05 } });

    // ===== OUTRO — title reprise, collapse, afterimage
    shot('s64', B(116), B(120), 'titleRiff', { variant: 'outro', recap: [
      { bg: BG + 'bg_crossing.png', char: A + 'back_sunset.png' }, { bg: BG + 'bg_sky.png', char: A + 'lookup_tear.png' }, { bg: BG + 'bg_door.png' },
      { bg: BG + 'bg_wetstreet.png' }, { bg: BG + 'bg_crossing_night.png', char: A + 'profile_sing.png' }, { bg: BG + 'bg_fireflies.png', char: A + 'kneel_pick.png' },
      { bg: BG + 'bg_classroom.png' }, { bg: BG + 'bg_crossing_dawn.png', char: A + 'smile_dawn.png' }] }, { lyric: 'none', trans: { type: 'flash', dur: 0.2, color: '#FFE3B0' }, post: { bloom: 0.45, beatCA: 2.5 } });
    shot('s65', B(120), B(122), 'ember', { mode: 'collapse', bg: BG + 'bg_crossing_dawn.png' }, { lyric: 'none', post: { bloom: 0.6 } });
    shot('s66', B(122), 226.54, 'afterimage', { text: '残光', sub: 'afterglow', credit: 'Music / Lyrics / Movie：NikusonP' }, { lyric: 'none', post: { boil: 0, bloom: 0.5, grain: 0.05 } });

    Z.SHOTS = S;
    window.__zankoMeta.duration = 226.54;

    // ---- HUD: tiny corner typography (title, timecode, section, bar counter, beat tick, song progress)
    const SEC_NAME = { intro: 'INTRO', verse: 'A-MELO', 'pre-chorus': 'B-MELO', break: 'BREAK', chorus: 'SABI', 'post-chorus': 'INTER', interlude: 'INTER', bridge: 'C-MELO', 'last-chorus': 'LAST SABI', outro: 'OUTRO', tail: '—' };
    const secs = audio.sections;
    Z.sectionAt = t => { let s = secs[0]; for (const x of secs) if (x.start <= t + 1e-6) s = x; return s; };
    const HUD_OFF = new Set(['s01', 's02', 's03', 's29', 's37', 's64', 's65', 's66']);
    Z.hud = (ctx, St) => {
      const t = St.t; if (HUD_OFF.has(St.shot.id) || t < 10.3) return;
      const fade = Z.clamp((t - 17.8) / 0.8) * Z.clamp((212.6 - t) / 0.6);
      if (fade <= 0) return;
      const sec = Z.sectionAt(t), si = secs.indexOf(sec), bar = Math.max(0, St.clock.bar(t) + 1);
      const f = Math.floor(t * 30), tc = [Math.floor(t / 3600), Math.floor(t / 60) % 60, Math.floor(t) % 60, f % 30].map(n => String(n).padStart(2, '0')).join(':');
      ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#F4EFE6'; ctx.strokeStyle = '#F4EFE6'; ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
      ctx.textBaseline = 'top';
      D.font(ctx, 17, 'dot', 400); ctx.textAlign = 'left';
      ctx.fillText('残光 / NikusonP', 44, 36);
      ctx.beginPath(); ctx.moveTo(44, 60); ctx.lineTo(44 + 150 + 40 * St.clock.pulse(t, 6), 60); ctx.stroke();
      ctx.fillText(`SEC.${String(si).padStart(2, '0')}  ${SEC_NAME[sec.label] || sec.label.toUpperCase()}`, 44, 68);
      ctx.textAlign = 'right';
      ctx.fillText(tc, W - 44, 36);
      ctx.fillText(`BAR ${String(bar).padStart(3, '0')} / 121`, W - 44, 58);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillText('♩=' + (60 / (St.clock.spb || 0.46)).toFixed(1), 44, H - 38);
      // beat tick: 4 squares, current beat filled
      const ib = St.clock.inBar(t);
      for (let i = 0; i < 4; i++) { const x = W - 44 - (4 - i) * 16; ctx.strokeRect(x, H - 52, 10, 10); if (i === ib) ctx.fillRect(x, H - 52, 10, 10); }
      // song progress hairline
      ctx.globalAlpha = 0.35 * fade; ctx.fillRect(44, H - 30, (W - 88) * Z.clamp(t / 223.54), 1);
    };
  };
})();
