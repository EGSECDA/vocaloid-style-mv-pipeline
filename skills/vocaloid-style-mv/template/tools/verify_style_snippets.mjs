#!/usr/bin/env node
// verify_style_snippets.mjs -- verifies the code sketches in the style cookbook (STYLE_RESEARCH.md):
//  - every ```glsl block (with the "@common" block prepended) compiles + links as a WebGL2 program in headless Chromium
//    (software SwiftShader on purpose, so the check does not depend on the GPU)
//  - every ```js block passes `node --check`, and the concatenated blocks pass small unit tests
//   node tools/verify_style_snippets.mjs [--md docs/STYLE_RESEARCH.md]
// The cookbook is examples/zanko/STYLE_RESEARCH.md in the kit repo (not in the installed skill folder; online:
// https://raw.githubusercontent.com/EGSECDA/vocaloid-style-mv-pipeline/main/examples/zanko/STYLE_RESEARCH.md);
// copy it to docs/ or point --md at it.
// Exit code 1 when anything fails. Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { ROOT, cliArg, handleHelp, launchBrowser } from './kit_env.mjs';

handleHelp(`
verify_style_snippets.mjs -- compile every glsl block and test every js block of the style cookbook
  node tools/verify_style_snippets.mjs [--md FILE]
  --md FILE    cookbook markdown (relative to the project root)     [docs/STYLE_RESEARCH.md]
Env: BROWSER_CHANNEL (falls back to Playwright's bundled Chromium)`);

const mdPath = path.resolve(ROOT, cliArg('md', 'docs/STYLE_RESEARCH.md'));
if (!fs.existsSync(mdPath)) {
  console.error(`style cookbook not found: ${mdPath}\n  copy <kit repo>/examples/zanko/STYLE_RESEARCH.md to docs/ or pass --md <path>\n  (online: https://raw.githubusercontent.com/EGSECDA/vocaloid-style-mv-pipeline/main/examples/zanko/STYLE_RESEARCH.md)`);
  process.exit(1);
}
const md = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
const blocks = [...md.matchAll(/```(glsl|js)\n([\s\S]*?)```/g)].map((m, i) => {
  const line = md.slice(0, m.index).split('\n').length;
  return { lang: m[1], src: m[2], line, i };
});
const glsl = blocks.filter(b => b.lang === 'glsl');
const js = blocks.filter(b => b.lang === 'js');
const common = glsl.find(b => b.src.includes('@common'));
if (!common) throw new Error('no @common glsl block');
let failures = 0;

// ---------- JS ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tegaki-js-'));
for (const b of js) {
  const f = path.join(tmp, `b${b.i}.js`);
  fs.writeFileSync(f, b.src);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); console.log(`JS   ok   line ${b.line}`); }
  catch (e) { failures++; console.log(`JS   FAIL line ${b.line}\n${e.stderr}`); }
}
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(js.map(b => b.src).join('\n;\n') + `
;globalThis.__api = { makeClock, quantize, layoutVertical, scramble, glyphsOnPath, triAffine, mouthTrack,
  springStep, stutterTime, trainSpeed, stepEmbers, firefly, crossingLamps, drawStrokeOrder, EMBER_RAMP };`, ctx);
const A = ctx.__api;
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const tests = {
  triAffine() {
    const s = [[0, 0], [10, 0], [0, 10]], d = [[5, 7], [25, 9], [3, 30]];
    const [a, b, c, dd, e, f] = A.triAffine(s, d);
    return s.every(([x, y], k) => approx(a * x + c * y + e, d[k][0]) && approx(b * x + dd * y + f, d[k][1]));
  },
  makeClock() {
    const spb = 60 / 129.2, beats = Array.from({ length: 16 }, (_, i) => 0.464 + i * spb);
    const c = A.makeClock(beats, 129.2);
    return c.beatIndex(0.1) === -1 && c.beatIndex(beats[5] + 0.01) === 5 && approx(c.beatPhase(beats[3] + spb / 2), 0.5, 1e-9)
      && approx(c.barPhase(beats[4]), 0) && approx(c.barPhase(beats[6]), 0.5) && c.pulse(beats[2]) === 1
      && c.isDownbeat(beats[8] + 0.001) && !c.isDownbeat(beats[9] + 0.001) && approx(A.quantize(1.09, 12), 1.0833333333333333);
  },
  makeClockDownbeats() {
    // analysis/audio.json style: pickup beat, downbeat = beats[k] with k % 4 == 1, drifting tempo
    const beats = []; let tb = 0.494;
    for (let i = 0; i < 40; i++) { beats.push(tb); tb += 60 / (128.3 + i * 0.1); }
    const downbeats = beats.filter((_, k) => k % 4 === 1);
    const c = A.makeClock(beats, 130.5, downbeats);
    return c.barIndex(beats[0]) === -1 && c.barIndex(beats[1]) === 0 && approx(c.barPhase(beats[1]), 0) && approx(c.barPhase(beats[5]), 0)
      && c.barPhase(beats[3]) > 0.49 && c.barPhase(beats[3]) < 0.51 && c.isDownbeat(beats[5] + 0.001) && !c.isDownbeat(beats[4] + 0.001)
      && approx(c.localBpm(beats[10] + 0.01), 128.3 + 10 * 0.1, 1e-6);
  },
  layoutVertical() {
    const g = A.layoutVertical('あ、ー', 100, 0, 100);
    return g.length === 3 && g[0].y === 50 && g[1].x === 150 && g[1].y === 100 && g[2].rot === Math.PI / 2;
  },
  glyphsOnPath() {
    const g = A.glyphsOnPath([[0, 0], [100, 0], [100, 100]], 'abc', 50, 50);
    return g.length === 3 && approx(g[0].x, 50) && approx(g[1].x, 100) && approx(g[1].y, 0) && approx(g[2].y, 50) && approx(g[2].rot, Math.PI / 2);
  },
  scramble() { return A.scramble('残光', 1, 3) === '残光' && [...A.scramble('残光', 0, 3)].length === 2; },
  mouthTrack() { const m = A.mouthTrack([0, 0, 0.9, 0.9, 0.9, 0.9, 0, 0, 0, 0]); return m.length === 10 && m.includes(2) && m[m.length - 1] === 0; },
  springStep() { const s = { x: 0, v: 0 }; for (let i = 0; i < 240; i++) A.springStep(s, 1, 1 / 24); return approx(s.x, 1, 1e-3); },
  stutterTime() { return approx(A.stutterTime(10.05, 10, 0.1, 3), 9.95, 1e-9) && approx(A.stutterTime(10.25, 10, 0.1, 3), 9.95, 1e-9) && A.stutterTime(11, 10, 0.1, 3) === 11; },
  trainSpeed() { return approx(A.trainSpeed(120, 129.2), 120 * 2 * 129.2 / 60); },
  stepEmbers() { const ps = [{ x: 500, y: 500, vx: 0, vy: 0, life: 1, ttl: 2 }]; for (let i = 0; i < 24; i++) A.stepEmbers(ps, 1 / 24, i / 24); return ps[0].y < 500 && ps[0].life < 1; },
  firefly() {
    const a = A.firefly(3, 12.3, 1, 1920, 1080, 1.858), b = A.firefly(3, 12.3, 1, 1920, 1080, 1.858);
    const s1 = [0, 1, 2].map(i => A.firefly(i, 1.858 * 5.5, 1, 1920, 1080, 1.858, 1).glow);
    return a.x === b.x && a.glow >= 0 && a.glow <= 1 && s1.every(g => approx(g, s1[0]));
  },
  crossingLamps() {
    const spb = 60 / 129.2, beats = Array.from({ length: 8 }, (_, i) => i * spb);
    const c = A.makeClock(beats, 129.2);
    const l0 = A.crossingLamps(c, 0.03), l1 = A.crossingLamps(c, spb + 0.03);
    return l0.left > l0.right && l1.right > l1.left;
  },
  emberRamp() { return A.EMBER_RAMP.length === 5; },
};
for (const [name, fn] of Object.entries(tests)) {
  let ok = false; try { ok = fn(); } catch (e) { console.log(e); }
  if (!ok) failures++;
  console.log(`TEST ${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

// ---------- GLSL ----------
const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const sources = glsl.filter(b => b !== common).map(b => {
  let body = b.src;
  if (!/void\s+main\s*\(/.test(body)) body += '\nvoid main(){ fragColor = vec4(0.); }';
  return { line: b.line, fs: common.src + '\n' + body };
});
sources.unshift({ line: common.line, fs: common.src + '\nvoid main(){ fragColor = vec4(fbm(vUv), 0., 0., 1.); }' });

const browser = await launchBrowser({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent('<canvas id=c width=64 height=64></canvas>');
const results = await page.evaluate(({ VS, sources }) => {
  const gl = document.getElementById('c').getContext('webgl2');
  if (!gl) return [{ line: 0, ok: false, log: 'no webgl2' }];
  const renderer = gl.getParameter(gl.RENDERER);
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = mk(gl.VERTEX_SHADER, VS);
  const out = [{ line: -1, ok: gl.getShaderParameter(vs, gl.COMPILE_STATUS), log: 'vertex ' + renderer + ' ' + (gl.getShaderInfoLog(vs) || '') }];
  for (const s of sources) {
    const fs = mk(gl.FRAGMENT_SHADER, s.fs);
    let ok = gl.getShaderParameter(fs, gl.COMPILE_STATUS), log = gl.getShaderInfoLog(fs) || '';
    if (ok) {
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      ok = gl.getProgramParameter(p, gl.LINK_STATUS); log += gl.getProgramInfoLog(p) || '';
      if (ok) { gl.useProgram(p); gl.drawArrays(gl.TRIANGLES, 0, 3); const e = gl.getError(); if (e) { ok = false; log += ' glError ' + e; } }
    }
    out.push({ line: s.line, ok, log });
  }
  return out;
}, { VS, sources });
await browser.close();
for (const r of results) {
  if (!r.ok) failures++;
  console.log(`GLSL ${r.ok ? 'ok  ' : 'FAIL'} line ${r.line} ${r.ok && r.line >= 0 ? '' : r.log}`);
}
console.log(`\n${blocks.length} blocks (${glsl.length} glsl, ${js.length} js), ${Object.keys(tests).length} unit tests, failures: ${failures}`);
process.exit(failures ? 1 : 0);
