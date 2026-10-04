#!/usr/bin/env node
// preview_style_fx.mjs -- visual smoke test of key GLSL recipes from the style cookbook (STYLE_RESEARCH.md) rendered onto
// the procedural dusk scene (assets/style/dusk_scene_gray.png, from tools/style_palette_sheet.py) -> docs/style_fx_preview.png
// (4x4 grid, 1920x1080). Software WebGL (SwiftShader) on purpose: the result does not depend on the GPU.
//   node tools/preview_style_fx.mjs [--md docs/STYLE_RESEARCH.md] [--out docs/style_fx_preview.png]
// The cookbook is examples/zanko/STYLE_RESEARCH.md in the kit repo (not in the installed skill folder; online:
// https://raw.githubusercontent.com/EGSECDA/vocaloid-style-mv-pipeline/main/examples/zanko/STYLE_RESEARCH.md);
// copy it to docs/ or point --md at it.
// Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cliArg, handleHelp, launchBrowser } from './kit_env.mjs';

handleHelp(`
preview_style_fx.mjs -- render 16 cookbook shaders on the dusk test scene into one contact sheet
  node tools/preview_style_fx.mjs [--md FILE] [--out FILE]
  --md FILE    style cookbook with #### <ID> headings and \`\`\`glsl blocks   [docs/STYLE_RESEARCH.md]
  --out FILE   output PNG (relative to the project root)                  [docs/style_fx_preview.png]
Needs assets/style/dusk_scene_gray.png and assets/style/luts/P1..P5 (python tools/style_palette_sheet.py).`);

const mdPath = path.resolve(ROOT, cliArg('md', 'docs/STYLE_RESEARCH.md'));
const outPath = path.resolve(ROOT, cliArg('out', 'docs/style_fx_preview.png'));
if (!fs.existsSync(mdPath)) {
  console.error(`style cookbook not found: ${mdPath}\n  copy <kit repo>/examples/zanko/STYLE_RESEARCH.md to docs/ or pass --md <path>\n  (online: https://raw.githubusercontent.com/EGSECDA/vocaloid-style-mv-pipeline/main/examples/zanko/STYLE_RESEARCH.md)`);
  process.exit(1);
}
const lines = fs.readFileSync(mdPath, 'utf8').split(/\r?\n/);
const blocks = []; let id = null;
for (let i = 0; i < lines.length; i++) {
  const h = lines[i].match(/^#### ([A-Z]\d\d)/); if (h) id = h[1];
  if (lines[i] === '```glsl') {
    let j = i + 1; const buf = [];
    while (lines[j] !== '```') buf.push(lines[j++]);
    blocks.push({ id, src: buf.join('\n') }); i = j;
  }
}
const common = blocks.find(b => b.src.includes('@common')).src;
const get = (bid, k = 0) => blocks.filter(b => b.id === bid && !b.src.includes('@common'))[k].src;
const shaders = {
  L01: get('L01'), L02: get('L02'), L03A: get('L03', 0), L03B: get('L03', 1), L04: get('L04'), L06: get('L06'),
  K02: get('K02'), E06: get('E06'), E07: get('E07'), E08: get('E08'), E11: get('E11'), F01: get('F01'),
  F03: get('F03'), F04: get('F04'), F06: get('F06'), F08: get('F08'), F13: get('F13'), B02: get('B02'),
};
const dataUrl = (p) => {
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { console.error(`missing ${f}: run  python tools/style_palette_sheet.py  first`); process.exit(1); }
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
};
const imgs = {
  scene: dataUrl('assets/style/dusk_scene_gray.png'),
  P1: dataUrl('assets/style/luts/P1_oumagatoki.png'), P2: dataUrl('assets/style/luts/P2_zansho.png'),
  P3: dataUrl('assets/style/luts/P3_fumikiri.png'), P4: dataUrl('assets/style/luts/P4_hotarubi.png'),
  P5: dataUrl('assets/style/luts/P5_taishoku.png'),
};

const browser = await launchBrowser({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent('<canvas id=g width=640 height=360></canvas><canvas id=o width=1920 height=1080></canvas>');
const png = await page.evaluate(async ({ common, shaders, imgs }) => {
  const W = 640, H = 360;
  const gl = document.getElementById('g').getContext('webgl2', { preserveDrawingBuffer: true });
  const out = document.getElementById('o').getContext('2d');
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const load = (src) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; });
  const tex = (source, w, h) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const T = {};
  for (const [k, v] of Object.entries(imgs)) T[k] = tex(await load(v));
  const VS = `#version 300 es
out vec2 vUv; void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const vs = sh(gl.VERTEX_SHADER, VS);
  const P = {};
  for (const [k, body] of Object.entries(shaders)) {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, common + '\n' + body)); gl.linkProgram(p); P[k] = p;
  }
  const fbos = [];
  const target = () => { const t = tex(null, W, H); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); fbos.push(f); return { t, f }; };
  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const run = (name, u, dst) => {
    const p = P[name]; gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, W, H);
    const all = { uRes: [W, H], uTime: 12.3, uPulse: 0, uBarPhase: 0, uEnergy: .5, uSeed: 1.7, ...u };
    let unit = 0;
    for (const [n, v] of Object.entries(all)) {
      const loc = gl.getUniformLocation(p, n); if (loc === null) continue;
      if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(loc, unit++); }
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v); else if (v.length === 3) gl.uniform3fv(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return dst;
  };
  const grade = (lut, extra = {}) => run('L01', { uTex: T.scene, uLut: T[lut], uLut2: T[lut], uMix: 0, uAmount: 1, uSteps: 0, uOffset: 0, ...extra }, target()).t;
  const S1 = grade('P1'), S2 = grade('P2'), S4 = grade('P4'), S5 = grade('P5');
  const sun = [0.70, 0.36];
  // afterimage source frame: title burnt in + sun
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const x = c2.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#FFE3B0'; x.font = '900 190px "Yu Mincho", "MS Mincho", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('残光', W / 2, H / 2 - 10);
  x.fillStyle = '#FFA552'; x.beginPath(); x.arc(W * 0.70, H * 0.64, 22, 0, 7); x.fill();
  const TITLE = tex(c2);
  let accA = target(), accB = target();
  run('L03A', { uTex: TITLE, uPrev: accB.t, uRetain: 0.947, uThresh: 0.3 }, accA);
  for (let i = 0; i < 12; i++) { [accA, accB] = [accB, accA]; run('L03A', { uTex: S4, uPrev: accB.t, uRetain: 0.947, uThresh: 0.9 }, accA); }

  const items = [
    ['L01 gradient map P1', () => run('L01', { uTex: T.scene, uLut: T.P1, uLut2: T.P1, uMix: 0, uAmount: 1, uSteps: 0, uOffset: 0 })],
    ['L11 cel bands P2 (steps 6)', () => run('L01', { uTex: T.scene, uLut: T.P2, uLut2: T.P2, uMix: 0, uAmount: 1, uSteps: 6, uOffset: 0 })],
    ['L02 duotone flip P1', () => run('L02', { uTex: T.scene, uDark: hex('#140B1E'), uLight: hex('#FFA552'), uFlip: 1 })],
    ['L03 afterimage: title 0.5 s later over P4', () => run('L03B', { uTex: S4, uAcc: accA.t, uAmt: 1, uBlurPx: 3, uNegative: 1 })],
    ['E08 film burn p=.45 (P1 -> P4)', () => run('E08', { uTex: S1, uNext: S4, uP: .45, uOrigin: sun })],
    ['E06 sunset iris r=.30 (P1 -> P4)', () => run('E06', { uTex: S1, uNext: S4, uSun: sun, uRadius: .30, uHorizon: .30 })],
    ['E11 barrier-arm wipe a=.55', () => run('E11', { uTex: S1, uNext: S4, uPivot: [-0.02, 0.08], uAngle: .55, uStripePx: 30, uColA: hex('#FFC21A'), uColB: hex('#0A0A0C') })],
    ['E07 sumi ink wipe p=.45 (P5 -> P2)', () => run('E07', { uTex: S5, uNext: S2, uP: .45, uOrigin: [.35, .55] })],
    ['F03 halftone P5', () => run('F03', { uTex: S5, uCell: 7, uAngle: .7854, uInk: hex('#241C1A'), uPaper: hex('#EFE6D6') })],
    ['F13 riso 2-plate P1', () => run('F13', { uTex: T.scene, uInkA: hex('#7A2350'), uInkB: hex('#FFA552'), uPaper: hex('#F4EFE6'), uOffA: [3, -2], uOffB: [-2, 1] })],
    ['F06 VHS on P5', () => run('F06', { uTex: S5, uAmt: 1 })],
    ['L06 god rays on P1', () => run('L06', { uTex: S1, uOcc: T.scene, uSun: sun, uDensity: .9, uDecay: .965, uExposure: .55, uFalloff: 2, uRayCol: hex('#FFA552') })],
    ['F08 1-bit Bayer P4', () => run('F08', { uTex: T.scene, uDark: hex('#050F16'), uLight: hex('#DDFF7A'), uPix: 3 })],
    ['F04 CA 10px + F01 grain/vignette', () => { const t = run('F04', { uTex: S1, uAmtPx: 10 }, target()).t; return run('F01', { uTex: t, uGrain: .08, uVig: .45 }); }],
    ['L04 light leak on P2', () => run('L04', { uTex: S2, uTint: hex('#FFA552'), uAmt: .6, uSeed: 3.1 })],
    ['K02 crash zoom .25 on P1', () => run('K02', { uTex: S1, uCenter: [.5, .5], uStrength: .25 })],
  ];
  out.fillStyle = '#111'; out.fillRect(0, 0, 1920, 1080);
  items.forEach(([label, fn], i) => {
    fn(); const cx = (i % 4) * 480, cy = Math.floor(i / 4) * 270;
    out.drawImage(gl.canvas, cx, cy, 480, 270);
    out.fillStyle = 'rgba(0,0,0,.6)'; out.fillRect(cx, cy, 480, 24);
    out.fillStyle = '#fff'; out.font = '15px "Yu Gothic", sans-serif'; out.fillText(label, cx + 8, cy + 17);
  });
  return document.getElementById('o').toDataURL('image/png');
}, { common, shaders, imgs });
await browser.close();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(png.split(',')[1], 'base64'));
console.log('wrote ' + outPath);
