#!/usr/bin/env node
/* Render individual frames of the engine to PNG (fast visual review) and tile them into a contact sheet.
 *   node tools/stills.mjs --times 1,5.5,12 [--url engine/index.html] [--out render/stills] [--sheet name] [--canvas out]
 *   node tools/stills.mjs --range 60:80:0.5      (start:end:step)
 * Serves the project root on a free localhost port, opens --url headless (GPU), calls window.renderFrame(t) for each
 * time and saves the canvas; the contact sheet (<out>/<sheet>.jpg) is tiled with Python + Pillow.
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { ROOT, cliArg as arg, handleHelp, launchBrowser, gpuArgs, pythonCmd } from './kit_env.mjs';

handleHelp(`
stills.mjs -- render engine frames to PNG + a contact sheet
  node tools/stills.mjs --times 1,5.5,12 [options]
  node tools/stills.mjs --range 60:80:0.5 [options]      start:end:step (end exclusive)
  --url PAGE        page relative to the project root (query allowed)   [engine/index.html]
  --out DIR         output dir (relative to the project root)          [render/stills]
  --sheet NAME      contact sheet file name (without .jpg)               [sheet]
  --canvas ID       id of the canvas to capture                          [out]
Env: BROWSER_CHANNEL, BROWSER_ANGLE, PYTHON (see tools/kit_env.mjs)`);

let times = arg('times', '') ? arg('times').split(',').map(Number) : [];
if (arg('range')) { const [a, b, s] = arg('range').split(':').map(Number); for (let t = a; t < b - 1e-9; t += s) times.push(+t.toFixed(3)); }
if (!times.length) { console.error('nothing to render: pass --times or --range (see --help)'); process.exit(1); }
const pageUrl = arg('url', 'engine/index.html');
const outDir = path.resolve(ROOT, arg('out', 'render/stills'));
const sheet = arg('sheet', 'sheet');
const canvasId = arg('canvas', 'out');
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.lrc': 'text/plain; charset=utf-8', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser({ headless: true, args: [...gpuArgs(), '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const s = `[page ${m.type()}] ${m.text().slice(0, 300)}`; errors.push(s); console.log(s); } });
page.on('pageerror', e => { errors.push(String(e)); console.log('[pageerror]', String(e).slice(0, 500)); });
await page.goto(`${origin}/${pageUrl.replace(/^\/+/, '')}`);
const meta = await page.evaluate(() => window.ready);
console.log('ready', JSON.stringify(meta));
const files = [];
for (const t of times) {
  const t0 = Date.now();
  const b64 = await page.evaluate(async ({ t, id }) => { await window.renderFrame(t); return document.getElementById(id).toDataURL('image/png').split(',')[1]; }, { t, id: canvasId });
  const f = path.join(outDir, `t${t.toFixed(2).padStart(7, '0')}.png`);
  fs.writeFileSync(f, Buffer.from(b64, 'base64')); files.push([t, f]);
  console.log(`t=${t.toFixed(2)}  ${Date.now() - t0} ms`);
}
await browser.close(); server.close();
// contact sheet
if (files.length > 1) {
  const py = `
from PIL import Image, ImageDraw, ImageFont
import json,sys,math
files=json.loads(sys.argv[1]); out=sys.argv[2]
ar=Image.open(files[0][1]).size; ar=ar[0]/ar[1]                     # keep the frame aspect (16:9 or 9:16)
w,h=(480,round(480/ar)) if ar>=1 else (round(400*ar),400)
cols=min(4 if ar>=1 else 6,len(files)); rows=math.ceil(len(files)/cols)
S=Image.new('RGB',(cols*w,rows*(h+22)),(16,16,16)); d=ImageDraw.Draw(S)
for i,(t,f) in enumerate(files):
    im=Image.open(f).convert('RGB').resize((w,h)); x=(i%cols)*w; y=(i//cols)*(h+22)
    S.paste(im,(x,y)); d.text((x+6,y+h+4),'t=%.2f'%t,fill=(230,230,230))
S.save(out,quality=88)`;
  const outSheet = path.join(outDir, `${sheet}.jpg`);
  const [cmd, ...pre] = pythonCmd();
  execFileSync(cmd, [...pre, '-c', py, JSON.stringify(files), outSheet]);
  console.log('sheet', outSheet);
}
if (errors.length) console.log(`${errors.length} page errors/warnings`);
