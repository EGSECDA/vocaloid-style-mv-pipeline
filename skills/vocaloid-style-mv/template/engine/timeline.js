/* engine/timeline.js -- THE EDIT. This default timeline is the procedural demo film 「蛍火」 (HOTARUBI) for the
 * synthetic demo song (demo/make_demo_song.py + demo/lyrics_demo.lrc). It uses no image assets at all: only scenes
 * from engine/scenes/*.js, the drawing toolkit (Z.draw) and the JIZURA lyric layer, so a fresh install can render
 * it end to end. It is also the STARTING POINT for a new film: keep the structure (helpers, JIZURA plans and
 * curation, looks, HUD, global FX, vertical config), replace the shots with your storyboard (docs/STORYBOARD.md).
 *
 * How the engine uses this file (engine/core/main.js):
 *   - it is loaded after the scene files and before main.js; main.js calls `await Z.setup(audio)` once, with
 *     analysis/audio.json already loaded (beats, bars, sections, stops, impacts ... see references/03)
 *   - setup fills Z.SHOTS = [{ id, t0, t1, scene, args, lyric, plan, post, trans, text, hud }] and sets
 *     window.__zankoMeta.duration (the render length; render_final.mjs reads it when --end is not given)
 *   - every frame is a pure function of song time t: no Date.now(), no unseeded Math.random (use Z.rnd / S.rng)
 * Shot fields, scene args, post params and transitions: references/05-engine.md. JIZURA: references/06-jizura.md.
 *
 * Demo storyboard (bar numbers = audio.json bars[].index, the same numbers as analysis/sections.json):
 *   s01  intro   bar 1      typeCard     the title in near silence
 *   s02  verse   bars 2-3   illust       night sky, stars, hills, a few fireflies              「夜の底で」
 *   s03  verse   bars 4-5   illust       one light ignites on the downbeat after the gap        「小さな光が」
 *   s04  pre     bar 6      illust       star trails wheel around the pole                     「名前も知らない」
 *   s05  pre     bar 7      converge     every light spirals into one point -> white            「手のひらに」
 *   s06  chorus  bar 8      kanjiSlam    灯 / れ slammed on each beat                           「灯れ、灯れ!」
 *   s07  chorus  bar 9      illust       a field of rising fireflies                            「この夜を」
 *   s08  chorus  bar 10     illust       the fireflies gather into the kanji 蛍                  「蛍火」
 *   s09  chorus  bar 11     illust       dawn                                                   「朝まで」
 *   s10  post    bar 12     kanjiSlam    蛍 / 火 on fire (the chorus motif returns), dead stop
 *   s11  tail    +2 s       afterimage   the title's retinal afterimage + credit (song is silent)
 * On another song this timeline still runs: it covers bars 1-12 and the end card, so it doubles as a quick look
 * at a new song's beat grid before you write the real edit.
 *
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
 */
(() => {
  'use strict';
  const Z = window.Z, D = Z.draw, E = Z.ease;
  const W = 1920, H = 1080;

  // ------------------------------------------------------------------ film identity (new_project.py --title / --title-sub / --artist / --credit set these)
  Z.TITLE = '蛍火';                                   // HUD, vertical header, end card
  Z.TITLE_SUB = 'HOTARUBI';                           // small Latin line under the title ('' = none)
  Z.ARTIST = 'NikusonP';                              // artist name, used by the 9:16 header -- ask the artist
  Z.CREDIT = 'Music / Lyrics / Movie：NikusonP';      // title lockups, end card, vertical footer -- ask the artist

  // ------------------------------------------------------------------ colour script of the demo (one palette, kept everywhere)
  // firefly yellow-green on a navy night, a warm accent only at dawn. Scenes that take a palette object (Z.INTRO.ember,
  // Z.INTRO.fireRing) get FF instead of their 残光 default (orange fire).
  const FF = { void: '#020308', ink: '#0B1524', shadow: '#16324A', dusk: '#1E5A4A', verm: '#5E9E34', sunset: '#9BD86A',
    glow: '#DDFF7A', hi: '#F2FFC8', core: '#FFFFFF' };
  const NIGHT = [[0, '#02040b'], [0.5, '#081429'], [0.85, '#10284a'], [1, '#173458']];

  // ================================================================== small custom fx (illust `fx: [{ type: 'custom', fn }]`)
  // Each factory returns an fx spec; fn(ctx, S) draws on the scene layer and must be a pure function of S.t.
  // twinkling star field (stars twinkle on 12 fps = hand-drawn 2コマ timing; positions are fixed per seed)
  const stars = (n = 170, seed = 5, top = 0.72, color = '#E8F0FF', alpha = 1) => ({ type: 'custom', fn: (ctx, S) => {
    const tq = Z.quant(S.t, 12);
    ctx.save(); ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Z.rnd(i, seed) * W, y = Math.pow(Z.rnd(i, seed + 1), 1.35) * H * top;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(tq * (0.6 + 2.4 * Z.rnd(i, seed + 2)) + i));
      const r = 0.7 + 2.0 * Math.pow(Z.rnd(i, seed + 3), 3);
      ctx.globalAlpha = alpha * tw * (0.2 + 0.8 * Z.rnd(i, seed + 4));
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
    ctx.restore();
  } });
  // a hill silhouette from 1-D noise, drifting sideways (parallax depth without a background painting)
  const ridge = (y, amp, color, { drift = 8, seed = 1, scale = 420, rim = null } = {}) => ({ type: 'custom', fn: (ctx, S) => {
    const off = S.lt * drift, pts = [];
    for (let x = -16; x <= W + 16; x += 12) pts.push([x, y - amp * (0.5 + 0.55 * Z.fbm1((x + off) / scale, seed, 3))]);
    ctx.save(); ctx.beginPath(); ctx.moveTo(-16, H + 16);
    for (const [x, yy] of pts) ctx.lineTo(x, yy);
    ctx.lineTo(W + 16, H + 16); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    if (rim) { ctx.beginPath(); pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.strokeStyle = rim; ctx.lineWidth = 1.6; ctx.stroke(); }
    ctx.restore();
  } });
  // star trails turning around a celestial pole (cx, cy): arcs that lengthen with the shot's time, fading tails
  const starTrails = (cx, cy, { n = 340, seed = 13, speed = 0.16, reach = 2100 } = {}) => ({ type: 'custom', fn: (ctx, S) => {
    const turn = speed * S.t, len = speed * (0.8 + S.lt);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const r = 40 + Math.sqrt(Z.rnd(i, seed)) * reach, a1 = Z.rnd(i, seed + 1) * Z.TAU + turn, w = 0.9 + 2.0 * Math.pow(Z.rnd(i, seed + 2), 3);
      const col = Z.rnd(i, seed + 3) < 0.12 ? '#FFD9A0' : Z.rnd(i, seed + 3) < 0.3 ? '#BFD4FF' : '#EEF3FF', al = 0.35 + 0.65 * Z.rnd(i, seed + 4);
      for (let k = 0; k < 3; k++) {                                   // three segments, fading toward the tail
        ctx.strokeStyle = Z.rgba(col, al * (1 - k * 0.33)); ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(cx, cy, r, a1 - len * (k + 1) / 3, a1 - len * k / 3); ctx.stroke();
      }
    }
    ctx.restore();
  } });
  // the first light: a faint glow breathing in the dark that ignites at tOn (ember + a ring of light, firefly palette)
  const firstLight = (x, y, tOn) => ({ type: 'custom', fn: (ctx, S) => {
    const t = S.t, on = Z.clamp((t - tOn) / 0.06), dt = Math.max(0, t - tOn);
    const wx = x + 34 * Z.fbm1(t * 0.3, 7), wy = y + 22 * Z.fbm1(t * 0.27, 8);              // it wanders a little
    const I = (1 - on) * (0.1 + 0.07 * Math.sin(t * 2.6)) + on * (0.75 + 0.9 * Math.exp(-dt * 2.5) + 0.25 * S.clock.pulse(t, 6));
    if (on > 0) Z.INTRO.fireRing(ctx, wx, wy, 26 + 980 * E.outExpo(Z.clamp(dt / 1.5)), 1.1 * Math.exp(-dt * 1.4), t, FF, { w: 0.45 });
    if (on > 0) D.glow(ctx, wx, wy, 260 + 140 * S.clock.pulse(t, 5), FF.sunset, 0.35 * on);    // soft halo once it is lit
    Z.INTRO.ember(ctx, wx, wy, I, t, { pal: FF, streak: on * (180 + 1100 * Math.exp(-dt * 3)) });
  } });
  // fireflies that gather into the shape of a glyph between t0 and t1 (points sampled once from the rendered glyph)
  const glyphCache = new Map();
  const glyphPoints = (ch, n, fam = 'minchoHeavy') => {
    const key = ch + n + fam; if (glyphCache.has(key)) return glyphCache.get(key);
    const s = 256, c = Z.canvas(s, s), x = c.getContext('2d', { willReadFrequently: true });
    D.font(x, s * 0.9, fam, 900); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText(ch, s / 2, s / 2);
    const d = x.getImageData(0, 0, s, s).data, pts = [], R = Z.rng(Z.hash(ch.codePointAt(0)));
    for (let guard = 0; pts.length < n && guard < n * 80; guard++) {
      const px = Math.floor(R() * s), py = Math.floor(R() * s);
      if (d[(py * s + px) * 4 + 3] > 128) pts.push([px / s - 0.5, py / s - 0.5]);
    }
    glyphCache.set(key, pts); return pts;
  };
  const swarmGlyph = (ch, cx, cy, size, t0, t1, n = 460) => ({ type: 'custom', fn: (ctx, S) => {
    const pts = glyphPoints(ch, n), k = E.inOutCubic(Z.inv(t0, t1, S.t));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    pts.forEach(([u, v], i) => {
      const sx = Z.rnd(i, 7) * W, sy = H * (0.35 + 0.65 * Z.rnd(i, 8));                      // where it starts, scattered
      const x = Z.lerp(sx, cx + u * size, k) + Z.fbm1(S.t * 0.4 + i, 3) * 24 * (1 - 0.75 * k);
      const y = Z.lerp(sy, cy + v * size, k) + Z.fbm1(S.t * 0.4 + i * 1.3, 5) * 24 * (1 - 0.75 * k);
      const a = (0.45 + 0.55 * Math.abs(Math.sin(S.t * 2.2 + i))) * (0.4 + 0.6 * k);
      const r = 7 + 4 * Z.rnd(i, 9);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, Z.rgba(FF.hi, a)); g.addColorStop(0.3, Z.rgba(FF.glow, a * 0.6)); g.addColorStop(1, Z.rgba(FF.glow, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
    ctx.restore();
  } });
  // a 1x1 transparent image: `afterimage` always cuts a character silhouette out of its sun disc; the demo has no
  // character art, so it gets an empty one. With a real character, pass assets/char/REF_master.png (the default).
  const NO_IMAGE = (() => Z.canvas(1, 1).toDataURL('image/png'))();

  // ================================================================== setup: runs once, after analysis/audio.json is loaded
  Z.setup = async (audio) => {
    // ---- timing helpers: cuts always come from the analysed grid, never from n * 60 / bpm (tempo drifts in real songs)
    const lastBar = audio.bars.length ? audio.bars[audio.bars.length - 1].index : 0;
    const B = n => {                                       // start of bar n (bars[].index, as in sections.json); past the end -> the music's end
      const b = audio.bars.find(x => x.index === n);
      return b ? b.start : n > lastBar ? audio.music_cut : 0;
    };
    const nb = t => audio.beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), audio.beats[0] ?? t);   // nearest beat
    const END = B(13);                                     // the demo's last bar ends on the dead stop (music_cut on the demo song)
    const TAIL = 2.0;                                      // end card runs past the music; render_final pads the audio with silence

    // ---- sections -> looks. main.js merges Z.LOOK_DEFAULT, then Z.LOOKS[section.look], then the shot's own post.
    const secs = audio.sections || [];
    for (const s of secs) s.look = s.label;                // analysis/sections.json labels: intro verse pre-chorus chorus ...
    Z.sectionAt = t => { let s = secs[0] || null; for (const x of secs) if (x.start <= t + 1e-6) s = x; return s; };
    Z.LOOK_DEFAULT = { boil: 1.0, bloom: 0.32, bloomThreshold: 0.72, grain: 0.05, vignette: 0.35, lutMix: 0 };   // night / dusk film
    // Daylight film: { boil: 1.0, bloom: 0.15, bloomThreshold: 0.93, grain: 0.04, vignette: 0.1, lutMix: 0 } -- the bloom
    // bright-pass keys on max(R,G,B), so with a 0.72 threshold every sky / cloud pixel blooms and the frame turns milky.
    Z.LOOKS = {
      verse: { boil: 0.9, grain: 0.06 },
      'pre-chorus': { boil: 1.1, beatCA: 1.5 },
      chorus: { boil: 1.2, bloom: 0.42, beatBloom: 0.15, beatCA: 2 },
      'post-chorus': { boil: 1.2, bloom: 0.45, beatCA: 3 },
    };

    // ---- global punctuation: one flash on the chorus downbeat, a kick-driven shake only inside the chorus
    // (keep full-frame flashes rare and in ONE place: <= 3 per second, never strobing -- references/09)
    const FLASH = [[B(8), 0.85], [B(10), 0.45]];
    const CHORUS = [B(8), END];
    Z.globalFX = (P, t) => {
      for (const [ft, a] of FLASH) { const d = t - ft; if (d >= 0 && d < 0.35) P.flash = Math.max(P.flash || 0, a * Math.exp(-d * 11)); }
      if (t >= CHORUS[0] && t < CHORUS[1]) {
        const q = Math.floor(t * 12), amp = 4 * Math.pow(Z.env.low(t), 3);       // only the kicks move the frame
        P.shake = [(P.shake ? P.shake[0] : 0) + Z.rnds(q, 91) * amp, (P.shake ? P.shake[1] : 0) + Z.rnds(q, 92) * amp];
        P.exposure = (P.exposure || 0) + 0.06 * Z.clock.downPulse(t, 7);
      }
    };

    // ---- JIZURA lyric plans from analysis/lyrics_mv.lrc (the demo: copy demo/lyrics_demo.lrc there). Without the
    // file the film renders with no lyric layer (and shots that name a plan simply draw no text).
    let lrc = '';
    try { const r = await fetch(Z.ROOT + 'analysis/lyrics_mv.lrc'); if (r.ok) lrc = await r.text(); } catch (e) { /* no lyrics yet */ }
    if (!lrc.trim()) console.warn('analysis/lyrics_mv.lrc missing: rendering without the JIZURA lyric layer');
    lrc = lrc.replace(/^﻿/, '').replace(/^\[ti:.*\]\s*$/m, '');   // no [ti:]: JIZURA would add its own title card
    if (lrc.trim() && window.J) {
      JZ.setAudio({ duration: audio.duration, beats: audio.beats, energy: null, energyRate: 0 });
      // Curate JIZURA's ~860 parts for the film's tone: deny novelty objects, UI gimmicks, horror and 和 props, opaque
      // plates and full-frame effects (our post pass owns flashes). These lists come from 残光 (examples/zanko/timeline.js
      // in the kit repo); adapt them per film -- references/06 §5.
      // Any change here (or to `seed`, MOODS) re-rolls every cut of the plan: re-render the stills afterwards.
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
      DENY.decor += ' dataColumns timecodeBar rainStreaks';           // this film: no data tables / timecodes (the HUD has them), no rain
      DENY.layout += ' shadowPlay glitchGrid';                        // opaque plates: a grey floor (9:16) / beige glyph tiles
      DENY.trans += ' knStutterCut';                                  // blacks out the picture under the lyric in front mode
      // Optional mood filter on JIZURA's part tags (J.registry(group)[key].tags: glitch calm pop graphic editorial
      // emotional ...). null = off: only the deny-lists curate (the demo and 残光 render this way). An array keeps only
      // parts tagged with one of the moods (parts without tags -- the plain cut / none -- stay on), e.g.
      // night / ballad film ['emotional', 'calm', 'editorial', 'glitch'], bright / upbeat film ['pop', 'emotional', 'graphic', 'calm'].
      const MOODS = null;
      const enabled = {};
      for (const g of J.GROUP_KEYS) {
        enabled[g] = {}; const deny = new Set((DENY[g] || '').split(/\s+/).filter(Boolean));
        for (const k of J.order(g)) {
          const d = J.registry(g)[k] || {}, tags = Array.isArray(d.tags) ? d.tags : null;
          // horror set: hr* keys / set 'horror' (not the 'horror' tag: JIZURA also puts it on core parts like center, blur)
          let ok = !deny.has(k) && !/^hr[A-Z]/.test(k) && d.set !== 'horror';
          if (ok && MOODS && tags && !tags.some(m => MOODS.includes(m))) ok = false;
          if (k === 'none') ok = true;
          enabled[g][k] = ok;
        }
      }
      const common = {
        enabled, lyrics: lrc, fps: 30, res: 1080, aspect: '16:9', seed: 128, unify: true, typeset: true, extra: true, wa: false, horror: false,
        colors: { accentOn: true, accent: FF.glow, ghostA: '#39C6E0', ghostB: '#9BD86A' }, schemes: 'dark',   // daylight film: schemes: 'light' (dark text) -- references/06 §4
        fx: { motion: 0.7, glitch: 0.4, chroma: 0.55, decor: 0.4, density: 0.5, texture: 0.5, flash: false, koma: 12, hud: 'off', bgSwitch: 0.3 } };
      // one plan per look; a shot picks one with `plan:` (default 'main'). 'cf' = centre-free: text in bands left /
      // right of the centre, for shots whose subject sits in the middle (a face, the first light, the 蛍 glyph).
      // `mood` is a label only: J.plan ignores it (JIZURA's おまかせ randomiser is the only reader). The tone comes from
      // `style`, `fx` (motion / glitch / chroma / decor / density), `enabled` (DENY, MOODS) and `schemes`.
      await JZ.addPlan('main', Object.assign({}, common, { style: 'gold', mood: 'emotional' }));
      await JZ.addPlan('cf', Object.assign({}, common, { style: 'gold', mood: 'emotional', centerFree: true }));
      await JZ.addPlan('noir', Object.assign({}, common, { style: 'noir', mood: 'glitch', fx: Object.assign({}, common.fx, { glitch: 0.65, chroma: 0.8 }) }));
      await JZ.addPlan('mono', Object.assign({}, common, { style: 'mono', mood: 'graphic', seed: 129, fx: Object.assign({}, common.fx, { motion: 0.85, chroma: 0.9 }) }));
    }
    // fonts used outside the scenes' own init (swarmGlyph samples Zen Old Mincho; HUD + end-card credit): a face that is
    // first requested mid-render loads asynchronously and the first frames of each worker would differ
    const TXT = Z.TITLE + Z.TITLE_SUB + Z.CREDIT + '蛍火灯れ0123456789:/.—♩=';
    await Promise.all(['900 100px "Zen Old Mincho"', '400 17px "DotGothic16"', '400 24px "Zen Kaku Gothic New"'].map(f => document.fonts.load(f, TXT)));

    // ================================================================== shots
    // shot(id, t0, t1, scene, args, extra):  extra = { lyric, plan, post, trans, text, hud }
    //   lyric: 'front' (default: JIZURA text over the scene) | 'full' | 'backfront' | 'none' (the scene IS the typography)
    //   post : object or S => object (WebGL post params, merged over the section look)
    //   trans: { type, dur, ... } transition INTO this shot: cut xfade flash black iris irisClose barrier wipe slices push zoom ink shatter
    const S = [];
    const shot = (id, t0, t1, scene, args, extra = {}) => { if (t1 > t0 + 1e-3) S.push(Object.assign({ id, t0, t1, scene, args }, extra)); };

    // ===== INTRO (bar 1): the title in the quiet
    shot('s01', 0, B(2), 'typeCard', { lines: [Z.TITLE], size: 112, fam: 'minchoHeavy', weight: 700, ruleColor: FF.glow, sub: [Z.TITLE_SUB, 'a vocaloid-style-mv-pipeline demo'].filter(Boolean).join('  ·  '), lead: 0.25 },
      { lyric: 'none', hud: false, post: { boil: 0, bloom: 0.4, grain: 0.04 } });

    // ===== VERSE (bars 2-5)
    shot('s02', B(2), B(4), 'illust', {
      grad: NIGHT,
      fxBack: [stars(), { type: 'glow', x: 1480, y: 230, r: 420, color: '#BFD4FF', a: 0.32 }, { type: 'rays', x: 1480, y: 230, n: 14, len: 1700, color: '#BFD4FF', a: 0.05 },
        ridge(820, 150, '#0a1a2c', { drift: 10, seed: 3, scale: 520 }), ridge(930, 120, '#050c16', { drift: 22, seed: 9, scale: 380 })],
      fx: [{ type: 'fireflies', n: 16, area: [0, H * 0.62, W, H], alpha: 0.75, color: FF.glow }, { type: 'dust', n: 36, color: 'rgba(190,210,255,0.35)' }],
      vignette: 0.55,
    }, { trans: { type: 'xfade', dur: 0.5 }, post: { lutA: 'night', lutMix: 0.2 } });
    shot('s03', B(4), B(6), 'illust', {
      grad: [[0, '#010207'], [0.7, '#050b16'], [1, '#0b1a2a']],
      fxBack: [stars(90, 11, 0.6, '#DDE6FF', 0.6), ridge(900, 110, '#03070d', { drift: 6, seed: 4 })],
      fx: [firstLight(960, 560, B(5)), { type: 'fireflies', n: 6, area: [200, H * 0.7, W - 200, H], alpha: 0.4, color: FF.glow }],
      vignette: 0.6,
    }, { plan: 'cf', trans: { type: 'black', dur: 0.3 }, post: { lutMix: 0, bloom: 0.55, bloomThreshold: 0.55 } });

    // ===== PRE-CHORUS (bars 6-7)
    shot('s04', B(6), B(7), 'illust', {
      grad: [[0, '#01030a'], [0.6, '#06112a'], [1, '#0d2244']],
      fxBack: [starTrails(1460, 140), { type: 'glow', x: 1460, y: 140, r: 260, color: '#BFD4FF', a: 0.18 }],
      fx: [ridge(930, 120, '#02050b', { drift: 4, seed: 15, rim: 'rgba(191,212,255,0.18)' })], vignette: 0.5,
    }, { plan: 'noir', trans: { type: 'slices', dur: 0.3 }, post: { lutA: 'night', lutMix: 0.15, bloom: 0.4 } });
    shot('s05', B(7), B(8), 'converge', { seed: 7 }, { plan: 'cf', post: S => Object.assign(Z.INTRO.post.converge(S), { lutA: 'P4', lutMix: 0.12 }) });

    // ===== CHORUS (bars 8-11)
    const slamSlots = [{ x: 960, y: 560, s: 1.25, r: -0.035 }, { x: 980, y: 540, s: 1.4, r: 0.05 }, { x: 940, y: 580, s: 1.5, r: 0.06 }, { x: 960, y: 520, s: 1.45, r: -0.06 }];
    shot('s06', B(8), B(9), 'kanjiSlam', { glyphs: ['灯', 'れ', '灯', 'れ'], variant: 'night', char: null, bg: null, color: '#D2F56A', slots: slamSlots },
      { lyric: 'none', hud: false, post: S => Object.assign(Z.typo.post.kanjiSlam(S), { lutA: 'night', lutMix: 0.12 }) });
    shot('s07', B(9), B(10), 'illust', {
      grad: [[0, '#02060c'], [0.55, '#0a2030'], [1, '#14423f']],
      fxBack: [stars(120, 21, 0.55), { type: 'glow', x: 960, y: 1080, r: 900, color: FF.sunset, a: 0.35, beat: 0.5 }, { type: 'rays', x: 960, y: 1150, n: 22, len: 1800, color: FF.glow, a: 0.07 }],
      fx: [ridge(960, 90, '#020509', { drift: 30, seed: 12 }), { type: 'embers', n: 130, color: FF.glow, rise: 150, size: 3.2, area: [0, 300, W, H + 80], wind: 0.15 },
        { type: 'fireflies', n: 40, alpha: 0.8, color: FF.glow }],
      vignette: 0.4,
    }, { plan: 'mono', trans: { type: 'flash', dur: 0.16, color: '#F2FFC8' }, post: { lutA: 'P4', lutMix: 0.12, bloom: 0.55 } });
    shot('s08', B(10), B(11), 'illust', {
      grad: NIGHT,
      fxBack: [stars(150, 31), ridge(940, 100, '#03080f', { drift: 12, seed: 6, rim: 'rgba(221,255,122,0.25)' })],
      fx: [swarmGlyph('蛍', 960, 470, 600, B(10) + 0.1, B(10) + 1.25), { type: 'fireflies', n: 30, alpha: 0.7, color: FF.glow },
        { type: 'glow', x: 960, y: 470, r: 520, color: FF.sunset, a: 0.22, beat: 0.6 }],
      vignette: 0.5,
    }, { plan: 'cf', trans: { type: 'iris', dur: 0.35, cx: 960, cy: 470, color: FF.glow }, post: { lutMix: 0, bloom: 0.6, bloomThreshold: 0.6 } });
    shot('s09', B(11), B(12), 'illust', {
      grad: [[0, '#1b1640'], [0.4, '#4f3670'], [0.72, '#d9908f'], [0.9, '#ffd2a6'], [1, '#fff0d8']],
      fxBack: [stars(60, 41, 0.35, '#FFF2E0', 0.4), { type: 'glow', x: 960, y: 960, r: 680, color: '#FFD9B0', a: 0.32, beat: 0.25 },
        { type: 'rays', x: 960, y: 960, n: 24, len: 2000, color: '#FFE3B0', a: 0.08 }],
      fx: [ridge(900, 130, '#1a1030', { drift: 14, seed: 8 }), ridge(980, 90, '#0b0718', { drift: 30, seed: 2 }),
        { type: 'fireflies', n: 18, alpha: 0.45, color: FF.glow }, { type: 'dust', n: 50, color: 'rgba(255,236,210,0.55)' }],
      vignette: 0.3,
    }, { plan: 'cf', trans: { type: 'flash', dur: 0.25, color: '#FFE9C8' }, post: { lutA: 'dawn', lutMix: 0.15, bloom: 0.38, bloomThreshold: 0.8 } });

    // ===== POST-CHORUS (bar 12): the chorus motif comes back on fire, and the song stops dead on the next downbeat
    shot('s10', B(12), END, 'kanjiSlam', { glyphs: ['蛍', '火', '蛍', '火'], variant: 'night', char: null, bg: null, fire: true, color: '#B8E05A', slots: slamSlots },
      { lyric: 'none', hud: false, trans: { type: 'flash', dur: 0.12, color: '#F2FFC8' }, post: Z.typo.post.kanjiSlam });

    // ===== END CARD (after the dead stop): hard cut to the title's afterimage (the colour is the complement of FF.glow)
    shot('s11', END, END + TAIL, 'afterimage', { text: Z.TITLE, sub: Z.TITLE_SUB.toLowerCase(), credit: Z.CREDIT, color: '#A88BFF', char: NO_IMAGE },
      { lyric: 'none', hud: false, post: S => Object.assign(Z.INTRO.post.afterimage(S), { boil: 0 }) });

    Z.SHOTS = S;
    window.__zankoMeta.duration = END + TAIL;                  // render length (frames = duration * 30)

    // ---- HUD: tiny corner typography on the text layer (skipped on shots with hud:false and in the vertical build)
    const SEC_NAME = { intro: 'INTRO', verse: 'A-MELO', 'pre-chorus': 'B-MELO', chorus: 'SABI', 'post-chorus': 'POST', bridge: 'C-MELO', outro: 'OUTRO', tail: '—' };
    Z.hud = (ctx, St) => {
      const t = St.t, fade = Z.clamp((t - B(2)) / 0.6) * Z.clamp((END - t) / 0.3);
      if (fade <= 0) return;
      const sec = Z.sectionAt(t), si = Math.max(0, secs.indexOf(sec)), bar = Math.max(0, St.clock.bar(t) + 1);
      const f = Math.floor(t * 30), tc = [Math.floor(t / 60) % 60, Math.floor(t) % 60, f % 30].map(n => String(n).padStart(2, '0')).join(':');
      ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#F4EFE6'; ctx.strokeStyle = '#F4EFE6'; ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.textBaseline = 'top';
      D.font(ctx, 17, 'dot', 400); ctx.textAlign = 'left';
      ctx.fillText(Z.TITLE_SUB ? `${Z.TITLE} / ${Z.TITLE_SUB}` : Z.TITLE, 44, 36);
      ctx.beginPath(); ctx.moveTo(44, 60); ctx.lineTo(44 + 150 + 40 * St.clock.pulse(t, 6), 60); ctx.stroke();
      if (sec) ctx.fillText(`SEC.${String(si).padStart(2, '0')}  ${SEC_NAME[sec.label] || String(sec.label).toUpperCase()}`, 44, 68);
      ctx.textAlign = 'right';
      ctx.fillText(tc, W - 44, 36);
      ctx.fillText(`BAR ${String(bar).padStart(3, '0')} / ${String(lastBar).padStart(3, '0')}`, W - 44, 58);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillText('♩=' + (60 / (St.clock.spb || 0.5)).toFixed(1), 44, H - 38);
      const ib = St.clock.inBar(t);                            // beat tick: 4 squares, the current beat filled
      for (let i = 0; i < 4; i++) { const x = W - 44 - (4 - i) * 16; ctx.strokeRect(x, H - 52, 10, 10); if (i === ib) ctx.fillRect(x, H - 52, 10, 10); }
      ctx.globalAlpha = 0.35 * fade; ctx.fillRect(44, H - 30, (W - 88) * Z.clamp(t / END), 1);   // song progress hairline
    };

    // ---- 9:16 vertical build (engine/vertical.html + vertical.js): which shots keep the whole 16:9 composition
    // (pure typography / graphics), which vertical JIZURA plan each 16:9 plan maps to, header / footer text and when
    // the header + credit footer are shown (the footer is Z.CREDIT), the lyric schemes of the vertical plans and the
    // [r, g, b] tint of the blurred surround (a daylight film: schemes: 'light', ambience: a light tint).
    Z.VERTICAL_CFG = {
      full: ['s01', 's04', 's06', 's10', 's11'],
      planMap: { main: 'v_main', cf: 'v_main', noir: 'v_noir', mono: 'v_mono' },
      title: Z.TITLE, sub: Z.TITLE_SUB, artist: Z.ARTIST, credits: [B(2), END],
      schemes: 'dark', ambience: [10, 6, 18],
    };
  };
})();
