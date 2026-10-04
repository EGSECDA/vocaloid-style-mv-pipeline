#!/usr/bin/env node
// render_frames.mjs -- deterministic browser -> video renderer
// -----------------------------------------------------------------------------------------
// Drives a page that exposes   window.ready (Promise)   and   window.renderFrame(t) (async)
// through headless Edge/Chrome (GPU via ANGLE), captures every frame and encodes with ffmpeg.
//
//   node tools/render_frames.mjs --url engine/index.html --out render/final.mp4 \
//        --start 0 --end 224.32 --fps 30 --workers 3 --audio audio/song.wav
//
// Frame n (0-based, absolute) always shows t = n / fps. --start/--end accept seconds ("12.5"),
// frames ("375f") or "m:ss.xxx"; the range is [round(start*fps), round(end*fps)) (end exclusive).
// Without --end the page's window.__zankoMeta.duration is used (engine/core/main.js contract).
// Run with --help for all options; tools/render_final.mjs wraps this for the final master + audio mux.
// Env: BROWSER_CHANNEL (default msedge on Windows, else chrome), BROWSER_ANGLE, FFMPEG (see tools/kit_env.mjs).
// Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
// -----------------------------------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { browserChannel, gpuArgs, launchBrowser, FFMPEG } from './kit_env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');

// ------------------------------------------------------------------ args
const HELP = `
render_frames.mjs  --url <page> [options]
  --url PATH|URL        page (path relative to --root, absolute file under root, or http(s) URL)   [engine/index.html]
  --root DIR            static server root                                                         [${PROJECT}]
  --start T  --end T    range: seconds | <n>f frames | m:ss.xxx  (end exclusive; default end = window.__zankoMeta.duration)
  --fps N               frames per second                                                          [30]
  --width W --height H  output size                                                                [1920x1080]
  --out PATH            .mp4/.mkv/.mov file, or a directory for a PNG sequence                     [render/out.mp4]
  --workers N           split range into N contiguous segments rendered in parallel               [1]
  --browsers M          number of browser processes the workers are spread over                    [=workers]
  --channel C           msedge | chrome | chromium (bundled)  (env BROWSER_CHANNEL)                [${browserChannel()}]
  --mode M              raw | rawvf | rawpbo | blob | dataurl | cdpshot | screenshot | webcodecs    [raw]
  --img png|jpeg|webp   image format for blob/dataurl/cdpshot/screenshot modes                     [png]
  --quality Q           jpeg/webp quality 0-100                                                    [95]
  --inflight K          max frames in flight page->node (raw/blob/rawvf)                           [3]
  --codec nvenc|x264|hevc|none   video encoder ('none' = capture only, discard)                    [nvenc]
  --cq N                nvenc constant quality (vbr, -b:v 0)                                       [17]
  --crf N               libx264 crf                                                                [15]
  --preset P            encoder preset (nvenc p1..p7, x264 ultrafast..veryslow)                    [p7 | slow]
  --gop N               keyframe interval                                                          [2*fps]
  --wc-bitrate BPS      webcodecs bitrate (VBR)                                                    [60e6]
  --audio PATH          audio to mux (AAC 320k)
  --audio-offset S      audio-file time of engine t=0 (audio sample at file time t+S plays at t)  [0]
  --preview             half-res fast mode (w/2 x h/2, nvenc p3 cq 23)
  --selector CSS        capture canvas selector                                                    [canvas]
  --keep-parts          keep per-worker segment files
  --stats FILE          write JSON stats
  --allow-software      do not abort when the page runs on SwiftShader / WARP
  --verbose             forward page console
`;
function parseArgs(argv) {
  const a = {
    url: 'engine/index.html', root: PROJECT, start: '0', end: null, fps: 30, width: 1920, height: 1080,
    out: path.join(PROJECT, 'render', 'out.mp4'), workers: 1, browsers: 0, channel: browserChannel(), mode: 'raw',
    img: 'png', quality: 95, inflight: 3, codec: 'nvenc', cq: 17, crf: 15, preset: null, gop: 0,
    wcBitrate: 60e6, audio: null, audioOffset: 0, preview: false, selector: 'canvas', keepParts: false,
    stats: null, allowSoftware: false, verbose: false, timeoutReady: 180000,
  };
  const map = { 'audio-offset': 'audioOffset', 'keep-parts': 'keepParts', 'allow-software': 'allowSoftware', 'wc-bitrate': 'wcBitrate', 'timeout-ready': 'timeoutReady' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--help' || k === '-h') { console.log(HELP); process.exit(0); }
    if (!k.startsWith('--')) throw new Error('bad arg ' + k);
    let key = k.slice(2); key = map[key] || key;
    if (!(key in a)) throw new Error('unknown option ' + k);
    if (typeof a[key] === 'boolean') { a[key] = true; continue; }
    const v = argv[++i];
    a[key] = typeof a[key] === 'number' ? Number(v) : v;
  }
  if (a.preview) {
    a.width = Math.round(a.width / 2); a.height = Math.round(a.height / 2);
    if (a.codec === 'nvenc') { a.preset = a.preset || 'p3'; a.cq = 23; }
    if (a.codec === 'x264') { a.preset = a.preset || 'veryfast'; a.crf = 22; }
  }
  if (!a.browsers) a.browsers = a.workers;
  if (!a.gop) a.gop = 2 * a.fps;
  return a;
}
function parseTime(s, fps) {
  if (s == null) return null;
  s = String(s).trim();
  if (/^\d+f$/.test(s)) return { frame: parseInt(s, 10) };
  if (s.includes(':')) { const p = s.split(':').map(Number); let v = 0; for (const x of p) v = v * 60 + x; return { frame: Math.round(v * fps) }; }
  return { frame: Math.round(Number(s) * fps) };
}

// ------------------------------------------------------------------ static server + capture sink
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.wasm': 'application/wasm', '.glsl': 'text/plain', '.txt': 'text/plain', '.bin': 'application/octet-stream',
  '.ktx2': 'application/octet-stream', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.exr': 'application/octet-stream',
};
function startServer(root, sinks) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/__cap/')) {
      try {
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        const sink = sinks.get(u.searchParams.get('w'));
        if (!sink) throw new Error('no sink ' + u.searchParams.get('w'));
        const kind = u.pathname.slice(7);
        if (kind === 'frame') await sink.push(Number(u.searchParams.get('i')), body);
        else if (kind === 'chunk') await sink.push(Number(u.searchParams.get('i')), body);
        else if (kind === 'meta') sink.meta = JSON.parse(body.toString());
        res.writeHead(204); return res.end();
      } catch (e) { console.error('[server]', e); res.writeHead(500); return res.end(String(e)); }
    }
    let p = decodeURIComponent(u.pathname);
    const file = path.join(root, p);
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403); return res.end(); }
    let st; try { st = await fsp.stat(file); } catch { res.writeHead(404); return res.end('not found ' + p); }
    if (st.isDirectory()) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const s = range[1] ? +range[1] : 0, e = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': e - s + 1, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
  server.keepAliveTimeout = 60000;
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Ordered sink: frames may arrive out of order (several in flight); written strictly by index.
class OrderedSink {
  constructor(first, writeFn) { this.next = first; this.pending = new Map(); this.write = writeFn; this.chain = Promise.resolve(); this.bytes = 0; this.count = 0; this.writeMs = 0; }
  push(i, buf) {
    this.pending.set(i, buf);
    this.chain = this.chain.then(async () => {
      while (this.pending.has(this.next)) {
        const b = this.pending.get(this.next); this.pending.delete(this.next);
        const t0 = performance.now(); await this.write(b); this.writeMs += performance.now() - t0;
        this.bytes += b.length; this.count++; this.next++;
      }
    });
    return this.chain;
  }
}
async function writeStream(stream, buf) {
  if (stream.write(buf)) return;
  // wait for 'drain' (or 'close' if ffmpeg died); remove both listeners so long renders do not accumulate them
  await new Promise((resolve) => {
    const done = () => { stream.off('drain', done); stream.off('close', done); resolve(); };
    stream.on('drain', done); stream.on('close', done);
  });
}

// ------------------------------------------------------------------ ffmpeg
function colorArgs() {
  return ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
}
function encoderArgs(a) {
  if (a.codec === 'nvenc' || a.codec === 'hevc') {
    return [
      '-c:v', a.codec === 'hevc' ? 'hevc_nvenc' : 'h264_nvenc', '-preset', a.preset || 'p7', '-tune', 'hq',
      '-rc', 'vbr', '-cq', String(a.cq), '-b:v', '0', '-maxrate', '120M', '-bufsize', '240M',
      ...(a.codec === 'hevc' ? ['-profile:v', 'main'] : ['-profile:v', 'high']),
      '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '8', '-rc-lookahead', '32', '-bf', '3', '-b_ref_mode', 'middle',
      '-g', String(a.gop), '-pix_fmt', 'yuv420p',
    ];
  }
  if (a.codec === 'x264') {
    return ['-c:v', 'libx264', '-preset', a.preset || 'slow', '-crf', String(a.crf), '-tune', 'film', '-profile:v', 'high',
      '-g', String(a.gop), '-keyint_min', String(a.gop), '-sc_threshold', '0', '-pix_fmt', 'yuv420p'];
  }
  throw new Error('codec ' + a.codec);
}
// input description by capture mode
function inputArgs(a, fmt) {
  if (fmt.kind === 'raw') return ['-f', 'rawvideo', '-pix_fmt', fmt.pix, '-s', `${fmt.w}x${fmt.h}`, '-framerate', String(a.fps), '-i', 'pipe:0'];
  const dec = { png: 'png', jpeg: 'mjpeg', webp: 'webp' }[fmt.img];
  return ['-f', 'image2pipe', '-framerate', String(a.fps), '-c:v', dec, '-i', 'pipe:0'];
}
function vfArgs(a, fmt) {
  const f = [];
  if (fmt.flipY) f.push('vflip');
  // explicit BT.709 limited-range conversion (swscale defaults to BT.601 for RGB->YUV!)
  const sz = (fmt.w && (fmt.w !== a.width || fmt.h !== a.height)) ? `w=${a.width}:h=${a.height}:` : '';
  f.push(`scale=${sz}out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int`);
  f.push('format=yuv420p');
  return ['-vf', f.join(',')];
}
function spawnFfmpeg(args, label) {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.done = new Promise((res, rej) => p.on('close', (code) => code === 0 ? res() : rej(new Error(`ffmpeg ${label} exited ${code}: ${err.slice(-2000)}`))));
  p.stdin.on('error', () => {});
  return p;
}
function runFfmpeg(args, label) { const p = spawnFfmpeg(args, label); p.stdin.end(); return p.done; }

// ------------------------------------------------------------------ in-page code
// Injected before any page script: config + per-frame reseedable Math.random.
function initScript(cfg) {
  window.__ZANKO_RENDER__ = cfg;
  let s = 0x9E3779B9 | 0;
  Math.random = function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__zankoSeed = (f) => { s = (0x9E3779B9 ^ Math.imul(f + 1, 0x85EBCA6B)) | 0; };
}

// Runs a whole segment inside the page for the in-page capture modes. Returns timing stats.
async function inPageRun(o) {
  const cv = document.querySelector(o.selector);
  const W = cv.width, H = cv.height;
  const yieldNow = () => new Promise((r) => { const mc = new MessageChannel(); mc.port1.onmessage = () => r(); mc.port2.postMessage(0); });
  const st = { render: 0, read: 0, post: 0, frames: 0, t0: performance.now() };
  const inflight = new Set();
  const errBox = [];
  // POST one frame / chunk to the capture server. A failed POST must never be lost silently (the ordered sink would
  // stop at the missing index and the segment would end early): immutable bodies (Blob, fresh chunk arrays) are
  // retried, and anything still undelivered is reported and fails the segment at the end. `buf` (raw modes) is
  // reused for the next frame, so it cannot be re-sent.
  const send = (kind, i, body) => {
    const url = `${o.endpoint}/__cap/${kind}?w=${o.worker}&i=${i}`;
    const tries = body === buf ? 1 : 5;
    const p = (async () => {
      for (let k = 1; ; k++) {
        try { const r = await fetch(url, { method: 'POST', body }); if (r.ok) return; throw new Error('HTTP ' + r.status); }
        catch (e) {
          if (k >= tries) { errBox.push(`${kind} ${i}: ${e && e.message ? e.message : e}`); return; }
          await new Promise((res) => setTimeout(res, 100 * k));
        }
      }
    })();
    inflight.add(p); p.finally(() => inflight.delete(p));
    return p;
  };
  const throttle = async () => { while (inflight.size >= o.inflight) await Promise.race(inflight); };

  let gl = null, buf = null, pbos = null;
  if (o.mode === 'raw' || o.mode === 'rawpbo') {
    gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (!gl) throw new Error('raw modes need a WebGL canvas (use rawvf for 2D canvases)');
    buf = new Uint8Array(W * H * 4);
  }
  if (o.mode === 'rawpbo') {
    pbos = [0, 1, 2].map(() => { const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ); return { b, sync: null, f: -1 }; });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }
  const drainPbo = async (slot) => {
    while (gl.clientWaitSync(slot.sync, 0, 0) === gl.TIMEOUT_EXPIRED) await yieldNow();
    gl.deleteSync(slot.sync); slot.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.b); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    await throttle(); send('frame', slot.f, buf);
  };

  let enc = null, encErr = null, chunkIdx = 0, postChain = Promise.resolve();
  if (o.mode === 'webcodecs') {
    enc = new VideoEncoder({
      output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); const i = chunkIdx++; postChain = postChain.then(() => send('chunk', i, b)); },
      error: (e) => { encErr = e; },
    });
    enc.configure(o.wc);
  }

  for (let f = o.f0; f < o.f1; f++) {
    if (encErr) throw encErr;
    const t = f / o.fps;
    const a = performance.now();
    window.__zankoSeed && window.__zankoSeed(f);
    await window.renderFrame(t);
    const b = performance.now(); st.render += b - a;
    if (o.mode === 'raw') {
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const c = performance.now(); st.read += c - b;
      await throttle(); send('frame', f, buf);      // fetch copies the bytes synchronously -> buf reusable
      st.post += performance.now() - c;
    } else if (o.mode === 'rawpbo') {
      const slot = pbos[f % pbos.length];
      if (slot.sync) await drainPbo(slot);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.b); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); slot.f = f; gl.flush();
      st.read += performance.now() - b;
    } else if (o.mode === 'rawvf') {
      const vf = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / o.fps) });
      if (!buf) buf = new Uint8Array(vf.allocationSize({ format: 'RGBA' }));
      await vf.copyTo(buf, { format: 'RGBA' }); vf.close();
      const c = performance.now(); st.read += c - b;
      await throttle(); send('frame', f, buf); st.post += performance.now() - c;
    } else if (o.mode === 'blob') {
      const blob = await new Promise((r) => cv.toBlob(r, o.mime, o.quality));
      const c = performance.now(); st.read += c - b;
      await throttle(); send('frame', f, blob); st.post += performance.now() - c;
    } else if (o.mode === 'webcodecs') {
      const vf = new VideoFrame(cv, { timestamp: Math.round((f - o.f0) * 1e6 / o.fps), duration: Math.round(1e6 / o.fps) });
      const opts = { keyFrame: (f - o.f0) % o.gop === 0 };
      if (o.wc.bitrateMode === 'quantizer') opts.avc = { quantizer: o.qp };
      enc.encode(vf, opts); vf.close();
      while (enc.encodeQueueSize > 3) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }));
      st.read += performance.now() - b;
    }
    st.frames++;
  }
  if (o.mode === 'rawpbo') for (let k = 0; k < pbos.length; k++) { const s = pbos[(o.f1 + k) % pbos.length]; if (s.sync) await drainPbo(s); }
  if (enc) { await enc.flush(); enc.close(); await postChain; }
  await Promise.all(inflight);
  if (errBox.length) throw new Error(`${errBox.length} frame(s) not delivered to the capture server: ${errBox.slice(0, 4).join('; ')}`);
  st.total = performance.now() - st.t0;
  return st;
}

// ------------------------------------------------------------------ main
async function main() {
  const a = parseArgs(process.argv.slice(2));
  const T0 = performance.now();
  const sinks = new Map();
  const server = await startServer(a.root, sinks);
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}`;
  let url = a.url;
  if (!/^https?:\/\//.test(url)) {
    let rel = path.isAbsolute(url) ? path.relative(a.root, url) : url;
    url = `${endpoint}/${rel.split(path.sep).join('/')}`;
  }
  const outIsDir = !/\.(mp4|mkv|mov)$/i.test(a.out);
  const outAbs = path.resolve(PROJECT, a.out);
  const partsDir = outIsDir ? outAbs : outAbs + '.parts';
  await fsp.mkdir(partsDir, { recursive: true });

  const launchArgs = [
    ...gpuArgs(), '--enable-gpu-rasterization', '--enable-zero-copy',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--force-color-profile=srgb', '--disable-lcd-text',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--disable-features=CalculateNativeWinOcclusion',
  ];
  const browsers = [];
  for (let i = 0; i < a.browsers; i++) {
    browsers.push(await launchBrowser({ channel: a.channel, headless: true, args: launchArgs }));
  }
  const cfg = { width: a.width, height: a.height, fps: a.fps, preview: a.preview, mode: 'render' };

  // probe once for duration if --end missing
  let f0 = parseTime(a.start, a.fps).frame;
  let f1 = a.end != null ? parseTime(a.end, a.fps).frame : null;

  const stats = { args: a, workers: [], gpu: null };
  const openPage = async (w) => {
    const ctx = await browsers[w % browsers.length].newContext({ viewport: { width: a.width, height: a.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(initScript, cfg);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`[w${w} pageerror]`, e.message));
    page.on('console', (m) => { if (a.verbose || m.type() === 'error') console.log(`[w${w} ${m.type()}]`, m.text()); });
    const tl = performance.now();
    await page.goto(url, { waitUntil: 'load', timeout: a.timeoutReady });
    const info = await page.evaluate(async () => { const r = await window.ready; return (r && typeof r === 'object') ? r : null; }, null, { timeout: a.timeoutReady });
    const gpu = await page.evaluate(() => {
      const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      return { renderer: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null, vendor: e ? g.getParameter(e.UNMASKED_VENDOR_WEBGL) : null, meta: window.__zankoMeta || null, webcodecs: typeof VideoEncoder };
    });
    const canvasSize = await page.evaluate((sel) => { const c = document.querySelector(sel); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, x: r.x, y: r.y, cw: r.width, ch: r.height }; }, a.selector);
    return { ctx, page, info, gpu, canvasSize, loadMs: performance.now() - tl };
  };

  // --- open worker pages
  const pages = await Promise.all(Array.from({ length: a.workers }, (_, w) => openPage(w)));
  const g0 = pages[0].gpu;
  stats.gpu = g0; stats.pageInfo = pages[0].info; stats.loadMs = pages.map((p) => Math.round(p.loadMs));
  console.log(`[gpu] ${g0.vendor} | ${g0.renderer} | webcodecs=${g0.webcodecs} | load ${stats.loadMs.join('/')} ms`);
  if (pages[0].info) console.log('[page]', JSON.stringify(pages[0].info));
  if (!a.allowSoftware && /swiftshader|basic render|llvmpipe|warp|software/i.test(g0.renderer || '')) {
    throw new Error('Page is software-rendered (' + g0.renderer + '). Use --allow-software to force.');
  }
  if (f1 == null) {
    if (!g0.meta || !g0.meta.duration) throw new Error('--end missing and page has no window.__zankoMeta.duration');
    f1 = Math.round(g0.meta.duration * a.fps);
  }
  const N = f1 - f0;
  if (N <= 0) throw new Error('empty range');
  const cs = pages[0].canvasSize;
  if (cs.w !== a.width || cs.h !== a.height) console.warn(`[warn] canvas is ${cs.w}x${cs.h}, output ${a.width}x${a.height}: ffmpeg will rescale`);

  // --- split
  const segs = [];
  for (let w = 0; w < a.workers; w++) {
    const s = f0 + Math.floor(N * w / a.workers), e = f0 + Math.floor(N * (w + 1) / a.workers);
    segs.push({ w, s, e, file: outIsDir ? null : path.join(partsDir, `seg_${String(w).padStart(2, '0')}.mp4`) });
  }
  console.log(`[range] frames ${f0}..${f1 - 1} (${N}) = t ${(f0 / a.fps).toFixed(3)}..${((f1 - 1) / a.fps).toFixed(3)} s, ${a.workers} worker(s), mode=${a.mode}, codec=${a.codec}`);

  // --- progress
  let done = 0; const tStart = performance.now();
  const prog = setInterval(() => {
    const el = (performance.now() - tStart) / 1000;
    let d = 0; for (const s of sinks.values()) d += s.count; d = Math.max(d, done);
    process.stdout.write(`\r[render] ${d}/${N} frames  ${(d / el).toFixed(1)} fps  ${el.toFixed(0)}s  eta ${d ? ((N - d) * el / d).toFixed(0) : '?'}s   `);
  }, 2000);

  // --- worker
  const runWorker = async (seg) => {
    const { page, canvasSize } = pages[seg.w];
    const W = canvasSize.w, H = canvasSize.h;
    const client = (a.mode === 'cdpshot') ? await page.context().newCDPSession(page) : null;
    let fmt;
    if (['raw', 'rawpbo'].includes(a.mode)) fmt = { kind: 'raw', pix: 'rgba', w: W, h: H, flipY: true };
    else if (a.mode === 'rawvf') fmt = { kind: 'raw', pix: 'rgba', w: W, h: H, flipY: false };
    else if (a.mode === 'webcodecs') fmt = { kind: 'h264' };
    else fmt = { kind: 'img', img: a.img, w: W, h: H, flipY: false };

    let ff = null, sinkWrite, h264Path = null, h264Stream = null;
    if (a.codec === 'none') sinkWrite = async () => {};
    else if (fmt.kind === 'h264') {
      h264Path = seg.file.replace(/\.mp4$/, '.h264');
      h264Stream = fs.createWriteStream(h264Path);
      sinkWrite = (b) => writeStream(h264Stream, b);
    } else {
      const outArgs = outIsDir
        ? ['-c:v', 'png', '-start_number', String(seg.s), path.join(partsDir, '%06d.png')]
        : [...encoderArgs(a), ...colorArgs(), '-an', seg.file];
      ff = spawnFfmpeg([...inputArgs(a, fmt), ...vfArgs(a, fmt), ...outArgs], `w${seg.w}`);
      sinkWrite = (b) => writeStream(ff.stdin, b);
    }
    const sink = new OrderedSink(fmt.kind === 'h264' ? 0 : seg.s, sinkWrite);
    sinks.set(String(seg.w), sink);
    const st = { w: seg.w, frames: seg.e - seg.s, render: 0, read: 0, post: 0 };
    const t0 = performance.now();

    if (['raw', 'rawpbo', 'rawvf', 'blob', 'webcodecs'].includes(a.mode)) {
      const wcCfg = { codec: 'avc1.640033', width: W, height: H, framerate: a.fps, bitrate: a.wcBitrate, bitrateMode: 'variable',
        hardwareAcceleration: 'prefer-hardware', latencyMode: 'quality', avc: { format: 'annexb' } };
      const r = await page.evaluate(inPageRun, {
        selector: a.selector, mode: a.mode, f0: seg.s, f1: seg.e, fps: a.fps, worker: String(seg.w), endpoint,
        inflight: a.inflight, mime: `image/${a.img}`, quality: a.quality / 100, gop: a.gop, wc: wcCfg, qp: 20,
      });
      Object.assign(st, { render: r.render, read: r.read, post: r.post });
    } else {
      const clip = { x: canvasSize.x, y: canvasSize.y, width: canvasSize.cw, height: canvasSize.ch };
      for (let f = seg.s; f < seg.e; f++) {
        const ta = performance.now();
        await page.evaluate(async (ff) => { window.__zankoSeed && window.__zankoSeed(ff.f); await window.renderFrame(ff.f / ff.fps); }, { f, fps: a.fps });
        const tb = performance.now(); st.render += tb - ta;
        let buf;
        if (a.mode === 'screenshot') {
          buf = await page.screenshot({ clip, type: a.img === 'jpeg' ? 'jpeg' : 'png', quality: a.img === 'jpeg' ? a.quality : undefined, animations: 'allow', caret: 'initial', scale: 'css' });
        } else if (a.mode === 'cdpshot') {
          const r = await client.send('Page.captureScreenshot', { format: a.img, quality: a.img === 'png' ? undefined : a.quality, clip: { ...clip, scale: 1 }, optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
          buf = Buffer.from(r.data, 'base64');
        } else if (a.mode === 'dataurl') {
          const s = await page.evaluate((o) => document.querySelector(o.sel).toDataURL(o.mime, o.q), { sel: a.selector, mime: `image/${a.img}`, q: a.quality / 100 });
          buf = Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
        } else throw new Error('unknown mode ' + a.mode);
        const tc = performance.now(); st.read += tc - tb;
        await sink.push(f, buf);
        st.post += performance.now() - tc;
      }
    }
    await sink.chain;
    // every frame of the segment must have reached the encoder, in order (a gap would silently truncate the segment)
    if (fmt.kind !== 'h264' && (sink.next !== seg.e || sink.pending.size)) {
      if (ff) ff.stdin.destroy();
      throw new Error(`worker w${seg.w}: only ${sink.next - seg.s}/${seg.e - seg.s} frames reached ffmpeg (frame ${sink.next} missing, ${sink.pending.size} queued)`);
    }
    if (ff) { ff.stdin.end(); await ff.done; }
    if (h264Stream) {
      h264Stream.end(); await once(h264Stream, 'finish');
      if (a.codec !== 'none') await runFfmpeg(['-framerate', String(a.fps), '-i', h264Path, '-c', 'copy', ...colorArgs(), seg.file], `remux w${seg.w}`);
    }
    st.wall = performance.now() - t0; st.fps = st.frames / (st.wall / 1000); st.sinkWriteMs = sink.writeMs;
    done += st.frames;
    return st;
  };

  const results = await Promise.all(segs.map(runWorker));
  clearInterval(prog); process.stdout.write('\n');
  const renderWall = (performance.now() - tStart) / 1000;
  stats.workers = results.map((r) => ({ ...r, render: +(r.render / r.frames).toFixed(2), read: +(r.read / r.frames).toFixed(2), post: +(r.post / r.frames).toFixed(2), wall: +(r.wall / 1000).toFixed(2), fps: +r.fps.toFixed(2), sinkWriteMs: +(r.sinkWriteMs / r.frames).toFixed(2) }));
  for (const r of stats.workers) console.log(`[w${r.w}] ${r.frames} fr  ${r.fps} fps  per-frame ms: render ${r.render} read ${r.read} post ${r.post} ffmpeg-write ${r.sinkWriteMs}`);
  for (const p of pages) await p.ctx.close();
  for (const b of browsers) await b.close();

  // --- concat + audio mux
  const tMux = performance.now();
  if (!outIsDir && a.codec !== 'none') {
    const list = path.join(partsDir, 'concat.txt');
    await fsp.writeFile(list, segs.map((s) => `file '${s.file.replace(/\\/g, '/')}'`).join('\n') + '\n');
    const dur = N / a.fps;
    const args = ['-f', 'concat', '-safe', '0', '-i', list];
    if (a.audio) {
      const aStart = f0 / a.fps + a.audioOffset;
      if (aStart >= 0) args.push('-ss', aStart.toFixed(6), '-i', path.resolve(PROJECT, a.audio));
      else args.push('-i', path.resolve(PROJECT, a.audio));
      args.push('-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
      const af = [];
      if (aStart < 0) af.push(`adelay=delays=${Math.round(-aStart * 1000)}:all=1`);
      af.push(`apad=whole_dur=${dur.toFixed(6)}`);
      args.push('-af', af.join(','), '-t', dur.toFixed(6));
    } else args.push('-c', 'copy');
    args.push(...colorArgs(), '-movflags', '+faststart', outAbs);
    await runFfmpeg(args, 'concat');
    if (!a.keepParts) await fsp.rm(partsDir, { recursive: true, force: true });
  }
  stats.muxSec = +((performance.now() - tMux) / 1000).toFixed(2);
  stats.frames = N; stats.renderWallSec = +renderWall.toFixed(2); stats.fps = +(N / renderWall).toFixed(2);
  stats.totalSec = +((performance.now() - T0) / 1000).toFixed(2);
  console.log(`[done] ${N} frames in ${renderWall.toFixed(1)} s render (${stats.fps} fps), mux ${stats.muxSec} s, total ${stats.totalSec} s -> ${outIsDir ? partsDir : outAbs}`);
  if (a.stats) await fsp.writeFile(path.resolve(PROJECT, a.stats), JSON.stringify(stats, null, 1));
  server.close();
  server.closeAllConnections?.();
}

main().catch((e) => { console.error('\n[fatal]', e.stack || e); process.exit(1); });
