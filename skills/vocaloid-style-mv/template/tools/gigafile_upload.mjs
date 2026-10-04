#!/usr/bin/env node
/* OPTIONAL EXTRA: upload files to GigaFile便 (gigafile.nu, a public file-sharing site) through its normal web page and
 * print the download links. Only run it when the owner of the video asked for a public share link.
 *   node tools/gigafile_upload.mjs [--days 30] [--out render/gigafile_links.json] file1 file2 ...
 * Files are bundled with まとめる into one link; the individual links are printed too and saved as JSON (--out).
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, handleHelp, launchBrowser } from './kit_env.mjs';

handleHelp(`
gigafile_upload.mjs -- upload files to gigafile.nu and print/save the download links (optional extra)
  node tools/gigafile_upload.mjs [--days N] [--out FILE] FILE...
  --days N     retention in days offered by the site (e.g. 7, 14, 30, 60, 100)    [30]
  --out FILE   where to save the links JSON (relative to the project root)       [render/gigafile_links.json]
  FILE...      files to upload (relative to the current directory)`);

const args = process.argv.slice(2);
let days = 30;
const di = args.indexOf('--days'); if (di >= 0) { days = +args[di + 1]; args.splice(di, 2); }
let outJson = path.join(ROOT, 'render', 'gigafile_links.json');
const oi = args.indexOf('--out'); if (oi >= 0) { outJson = path.resolve(ROOT, args[oi + 1]); args.splice(oi, 2); }
const files = args.map(f => path.resolve(f));
if (!files.length) { console.error('no files given (see --help)'); process.exit(1); }
for (const f of files) if (!fs.existsSync(f)) throw new Error('missing ' + f);
const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
console.log(`uploading ${files.length} files, ${(total / 1048576).toFixed(0)} MB, keep ${days} days`);

const browser = await launchBrowser({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto('https://gigafile.nu/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(3000);

// retention: the page keeps it in #file_lifetime (and shows a meter); set both the value and the UI choice if present
const lt = await page.evaluate((days) => {
  const inp = document.querySelector('#file_lifetime');
  const before = inp ? inp.value : null;
  const opts = [...document.querySelectorAll('[data-lifetime-val], .lifetime_meter_box li, #lifetime_meter_box li, .lifetime_meter li')];
  const hit = opts.find(o => (o.getAttribute('data-lifetime-val') || '').trim() === String(days) || (o.textContent || '').trim().startsWith(days + '日'));
  if (hit) hit.click();
  if (inp) inp.value = String(days);
  return { before, after: inp ? inp.value : null, options: opts.map(o => (o.getAttribute('data-lifetime-val') || o.textContent || '').trim()).slice(0, 12), clicked: !!hit };
}, days);
console.log('lifetime', JSON.stringify(lt));

await page.setInputFiles('input[type=file]', files);
const t0 = Date.now();
const names = files.map(f => path.basename(f));
let urls = {};
for (;;) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => {
    const box = document.querySelector('#file_list');
    const txt = box ? box.innerText : '';
    const links = [...(box ? box.querySelectorAll('a, input') : [])].map(e => e.href || e.value || '').filter(u => /^https?:\/\/\d+\.gigafile\.nu\/\d{4}-[0-9a-z]{10,}$/i.test(u));
    const pcts = (txt.match(/\d{1,3}(?:\.\d+)?\s*%/g) || []).slice(0, 8);
    return { txt: txt.slice(0, 1500), links: [...new Set(links)], pcts };
  });
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[${el}s] links ${st.links.length}/${files.length}  progress ${st.pcts.join(' ')}`);
  if (st.links.length >= files.length && !/アップロード中|uploading/i.test(st.txt)) { urls = st; break; }
  if (Date.now() - t0 > 3 * 3600e3) throw new Error('timeout');
}
// bundle into one link
await page.evaluate(() => { const b = document.querySelector('#matomete_btn'); if (b) b.click(); });
let bundle = null;
for (let i = 0; i < 60 && !bundle; i++) {
  await page.waitForTimeout(1000);
  bundle = await page.evaluate((known) => {
    const cands = [...document.querySelectorAll('a, input, span, div')].map(e => e.href || e.value || (e.children.length === 0 ? e.textContent : '') || '')
      .map(s => (s.match(/https?:\/\/\d+\.gigafile\.nu\/\d{4}-[0-9a-z]{10,}/i) || [null])[0]).filter(Boolean);
    return cands.find(u => !known.includes(u)) || null;
  }, urls.links);
}
const expiry = await page.evaluate(() => { const m = document.body.innerText.match(/(\d{4}[\/年]\d{1,2}[\/月]\d{1,2}日?)[^\n]{0,20}(まで|保持|期限)?/); return m ? m[0] : null; });
const matomeHtml = await page.evaluate(() => { const b = document.querySelector('#matomete_btn'); return b ? b.parentElement.parentElement.innerText.slice(0, 600) : null; });
  console.log('MATOME_AREA', JSON.stringify(matomeHtml));
const result = { bundle, files: urls.links, names, expiry, uploadedAt: new Date().toISOString(), listText: urls.txt };
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(result, null, 1));
console.log('BUNDLE', bundle);
console.log('FILES', urls.links.join('  '));
console.log('EXPIRY', expiry);
await browser.close();
