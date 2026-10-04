#!/usr/bin/env node
/* Which JIZURA cut (layout / enter / exit / decor / fx) is active at given times, per plan, inside the real engine page.
 *   node tools/jz_cuts_at.mjs 196.8,203.5 [plan] [--url engine/index.html]      (plan omitted = all plans)
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT, cliArg, handleHelp, launchBrowser, gpuArgs } from './kit_env.mjs';

handleHelp(`
jz_cuts_at.mjs -- print the JIZURA cut active at each time, for every lyric plan of the engine page
  node tools/jz_cuts_at.mjs TIMES [PLAN] [--url PAGE]
  TIMES        comma-separated seconds, e.g. 196.8,203.5
  PLAN         only this plan name (e.g. main); default all plans in JZ.plans
  --url PAGE   engine page relative to the project root     [engine/index.html]`);

const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1] === '--url'));
const times = (pos[0] || '').split(',').filter(Boolean).map(Number);
const only = pos[1] || null;
const pageUrl = cliArg('url', 'engine/index.html');
if (!times.length) { console.error('usage: node tools/jz_cuts_at.mjs 196.8,203.5 [plan]   (see --help)'); process.exit(1); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.lrc': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await launchBrowser({ headless: true, args: gpuArgs() });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/${pageUrl.replace(/^\/+/, '')}`);
await page.evaluate(() => window.ready);
const rows = await page.evaluate(({ times, only }) => {
  const out = [];
  for (const name of Object.keys(JZ.plans)) {
    if (only && name !== only) continue;
    const pl = JZ.plans[name].plan;
    for (const t of times) {
      const c = pl.cuts.find(c => c.start <= t && t < c.end);
      const fx = pl.events.filter(e => e.t <= t && t < e.t + (e.dur || 0.2) + 0.05).map(e => e.type);
      out.push(c ? `${name}@${t}: [${c.index}] ${c.start.toFixed(2)}-${c.end.toFixed(2)} layout=${c.layout} enter=${c.enter} hold=${c.hold} exit=${c.exit} decor=${(c.decor || []).map(d => d.id || d.type).join('+')} treat=${c.treat || ''} bg=${c.bg} cam=${c.cam} trans=${c.trans || ''} fx=${fx.join('+')} «${c.text}»` : `${name}@${t}: (no cut)`);
    }
  }
  return out;
}, { times, only });
console.log(rows.join('\n'));
await browser.close(); server.close();
