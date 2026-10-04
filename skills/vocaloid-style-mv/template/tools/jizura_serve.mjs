#!/usr/bin/env node
/* Tiny static file server for the JIZURA pages (same origin for engine, hosts, audio and the read-only upstream clone).
 *
 *   node tools/jizura_serve.mjs [port]          (port 0 / omitted = free port)
 *
 * Mounts (read-only):
 *   /project/...      -> <ROOT>/...        (jizura/app/engine.html, host_*.html, audio/song.wav ...)
 *   /ref/JIZURA/...   -> <JIZURA_DIR>/...  (the upstream app: /ref/JIZURA/index.html; env JIZURA_DIR, default vendor/JIZURA)
 * Supports HTTP Range (so <audio> can seek a large WAV) and never serves outside the mounts.
 * Also imported by jizura_probe.mjs / jizura_parts.mjs (startServer()).
 *
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, JIZURA_DIR, isMain, handleHelp } from './kit_env.mjs';

export const MOUNTS = { '/project/': ROOT, '/ref/JIZURA/': JIZURA_DIR };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4' };

function resolve(urlPath) {
  let p; try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (e) { return null; }
  for (const [prefix, root] of Object.entries(MOUNTS)) {
    if (!p.startsWith(prefix)) continue;
    const full = path.resolve(root, '.' + path.sep + p.slice(prefix.length));
    if (full !== root && !full.startsWith(root + path.sep)) return null;      // no escaping the mount
    return full;
  }
  return null;
}

export function startServer(port = 0, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    let file = resolve(req.url);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file || !fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 ' + req.url); return; }
    const st = fs.statSync(file), type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(206, Object.assign(headers, { 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res); return;
    }
    res.writeHead(200, Object.assign(headers, { 'content-length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => { const a = server.address(); ok({ server, port: a.port, origin: `http://${host}:${a.port}`, close: () => new Promise(r => server.close(r)) }); });
  });
}

if (isMain(import.meta.url)) {
  handleHelp(`
jizura_serve.mjs -- static server for the JIZURA pages (Ctrl+C to stop)
  node tools/jizura_serve.mjs [port]        port 0 / omitted = any free port
Mounts: /project/ -> ${ROOT}
        /ref/JIZURA/ -> ${JIZURA_DIR}   (env JIZURA_DIR)`);
  const { origin } = await startServer(+(process.argv[2] || 0));
  console.log(`serving ${origin}/project/jizura/app/engine.html  |  ${origin}/ref/JIZURA/index.html`);
}
