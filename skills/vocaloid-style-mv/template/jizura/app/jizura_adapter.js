/* vocaloid-style-mv ⇄ JIZURA adapter: drive the JIZURA 字面 engine (MIT, (c) 2026 hakoniwa (github.com/852wa)) as a
 * deterministic lyric layer.
 *
 * Load order: seeded Math.random shim → jizura_engine.js (tools/build_jizura_bundle.mjs) → this file.
 *
 *   JZ.setAudio({ duration, beats:[s…], energy:[0..1…], energyRate:Hz })   our own librosa beat grid / envelope
 *   await JZ.setProject(partialProject)  → summary   (merged over J.defaultProject(); builds the plan, loads fonts)
 *   JZ.renderAt(t, { mode })             → { canvas, ms }   mode: 'normal' | 'transparent' | 'back' | 'front'
 *   JZ.drawInto(ctx, t, mode)            draws straight into a host canvas (ctx.canvas size decides the scale)
 *   JZ.cuts()                            compact list of the planned cuts (for the director's timeline)
 *
 * Rendering is a pure function of t: the planner is seeded (J.rng), the renderer's only Math.random calls happen
 * while building its grain/paper textures, and the page seeds Math.random before the engine loads.
 */
(() => {
  'use strict';
  const HUD_CHARS = '0123456789:./-_()【】・No.LYRICRECUNTITLEDXYlinebpminterlude—─／ ';
  const S = { project: null, plan: null, audio: null, R: null, canvas: null, ctx: null };

  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function mergeProject(p) {
    const base = J.defaultProject();
    const out = Object.assign({}, base, p || {});
    out.fx = Object.assign({}, base.fx, (p && p.fx) || {});
    out.timing = Object.assign({}, base.timing, (p && p.timing) || {});
    if (p && p.enabled) {
      out.enabled = JSON.parse(JSON.stringify(base.enabled));
      for (const [g, m] of Object.entries(p.enabled)) Object.assign(out.enabled[g] || (out.enabled[g] = {}), m);
    }
    return out;
  }

  const JZ = {
    state: S,

    setAudio(a) {
      S.audio = a ? {
        duration: a.duration,
        beats: Array.from(a.beats || []),
        energy: a.energy ? Float32Array.from(a.energy) : null,
        energyRate: a.energyRate || 0,
        bpm: a.bpm || 0,
      } : null;
      return !!S.audio;
    },

    async setProject(p) {
      S.project = mergeProject(p);
      S.plan = J.plan(S.project, S.audio);
      const [w, h] = J.outputSize(S.project);
      if (!S.canvas) S.canvas = mkCanvas(w, h);
      if (S.canvas.width !== w || S.canvas.height !== h) { S.canvas.width = w; S.canvas.height = h; }
      S.ctx = S.canvas.getContext('2d');
      S.R = S.R || new J.Renderer();
      const text = S.project.lyrics + (S.project.title || '') + (S.project.artist || '') + HUD_CHARS;
      await J.ensureFonts(text, J.fontsOfPlan(S.plan));
      J.glyphs.maxRes = h >= 1000 ? 768 : 512;
      return JZ.summary();
    },

    summary() {
      const pl = S.plan;
      return {
        W: pl.W, H: pl.H, fps: pl.fps, duration: pl.duration, style: pl.styleKey, lang: pl.lang,
        lines: pl.lines.length, cuts: pl.cuts.length, events: pl.events.length, beats: pl.beats.length,
        fonts: J.fontsOfPlan(pl),
        missingFonts: J.fontsOfPlan(pl).filter(k => J.FONTS[k] && !document.fonts.check(J.fontCSS(k, 32), '字')),
      };
    },

    cuts() {
      return S.plan.cuts.map(c => ({
        i: c.index, line: c.line, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text,
        layout: c.layout, enter: c.enter, hold: c.hold, exit: c.exit, bg: c.bg, cam: c.cam, trans: c.trans || null,
        decor: (c.decor || []).map(d => d.id || d.type || d), scheme: c.scheme,
      }));
    },

    optsFor(mode, scale) {
      if (mode === 'back' || mode === 'front') return { scale, transparent: true, layer: mode };
      if (mode === 'transparent') return { scale, transparent: true };
      return { scale };
    },

    renderAt(t, { mode = 'normal' } = {}) {
      const t0 = performance.now();
      S.R.frame(S.ctx, S.plan, t, JZ.optsFor(mode, S.canvas.width / S.plan.W));
      return { canvas: S.canvas, ms: performance.now() - t0 };
    },

    drawInto(ctx, t, mode = 'front') {
      S.R.frame(ctx, S.plan, t, JZ.optsFor(mode, ctx.canvas.width / S.plan.W));
    },

    // ---- several independent plans (one per look), rendered by name
    plans: {},
    async addPlan(name, p) {
      const project = mergeProject(p);
      const plan = J.plan(project, S.audio);
      // p.schemes: which of the style's colour schemes the cuts may use (each cut's scheme is remapped into that set)
      //   'dark'   schemes with a dark background (luminance < 0.25): light text, for night / dusk films
      //            (light-background schemes draw dark text that vanishes over night scenes)
      //   'light'  schemes with a light background (luminance > 0.6): dark text, for daylight / bright films
      //   [i, …]   explicit scheme indices of the style
      // A style with no matching scheme keeps JIZURA's own choice (e.g. crimson, hud, mono have no light scheme).
      if (p.schemes === 'dark' || p.schemes === 'light' || Array.isArray(p.schemes)) {
        const pick = test => plan.style.schemes.map((s, i) => (test(J.lum(s.bg)) ? i : -1)).filter(i => i >= 0);
        const ok = Array.isArray(p.schemes) ? p.schemes : p.schemes === 'dark' ? pick(l => l < 0.25) : pick(l => l > 0.6);
        if (ok.length) for (const c of plan.cuts) c.scheme = ok[(c.scheme | 0) % ok.length];
      }
      const R = new J.Renderer();
      JZ.plans[name] = { project, plan, R };
      const text = project.lyrics + (project.title || '') + (project.artist || '') + HUD_CHARS;
      await J.ensureFonts(text, J.fontsOfPlan(plan));
      J.glyphs.maxRes = 768;
      return { name, cuts: plan.cuts.length, lines: plan.lines.length, style: plan.styleKey, lang: plan.lang, fonts: J.fontsOfPlan(plan) };
    },
    drawPlan(name, ctx, t, mode = 'front') {
      const P = JZ.plans[name]; if (!P) throw new Error('no JIZURA plan ' + name);
      P.R.frame(ctx, P.plan, t, JZ.optsFor(mode, ctx.canvas.width / P.plan.W));
    },
    cutsOf(name) {
      return JZ.plans[name].plan.cuts.map(c => ({ i: c.index, line: c.line, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text, layout: c.layout, enter: c.enter, hold: c.hold, exit: c.exit, bg: c.bg, cam: c.cam, trans: c.trans || null }));
    },

    async analyzeAudioUrl(url) {
      const blob = await (await fetch(url)).blob();
      const a = await J.analyzeAudio(new File([blob], url.split('/').pop()));
      JZ.setAudio(a);
      return { bpm: a.bpm, beats: a.beats.length, duration: a.duration };
    },
  };
  window.JZ = JZ;
})();
