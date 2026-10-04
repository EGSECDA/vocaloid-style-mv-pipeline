#!/usr/bin/env node
/* Dump JIZURA's part registry (group, key, label, moods, set flags) to jizura/parts.json for curation.
 *   node tools/jizura_parts.mjs [--out jizura/parts.json]
 * Needs jizura/app/jizura_engine.js (node tools/build_jizura_bundle.mjs).
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cliArg, handleHelp, launchBrowser } from './kit_env.mjs';
import { startServer } from './jizura_serve.mjs';

handleHelp(`
jizura_parts.mjs -- list every JIZURA part (layouts, enters, exits, decor, bg, cam, fx, ...) as JSON
  node tools/jizura_parts.mjs [--out FILE]       output (relative to the project root)  [jizura/parts.json]`);
const outFile = path.resolve(ROOT, cliArg('out', 'jizura/parts.json'));

const { origin, close } = await startServer(0);
const browser = await launchBrowser({ headless: true });
const page = await browser.newPage();
await page.goto(`${origin}/project/jizura/app/engine.html`);
await page.waitForFunction(() => window.JZ_READY === true);
const parts = await page.evaluate(() => {
  const out = {};
  const reg = { layout: J.LAYOUTS, enter: J.ENTER, exit: J.EXIT, hold: J.HOLD, decor: J.DECOR, treat: J.TREAT, bg: J.BG, cam: J.CAM, fx: J.FXE, trans: J.TRANS };
  for (const g of J.GROUP_KEYS) {
    const R = reg[g] || {};
    out[g] = J.order(g).map(k => { const d = R[k] || {}; return { k, name: d.name || d.label || '', moods: d.moods || d.mood || d.tags || null, set: d.set || (d.extra ? 'extra' : '') || '', wa: !!d.wa, horror: !!d.horror }; });
  }
  return { groups: J.GROUP_KEYS, out, moods: J.MOODS ? Object.keys(J.MOODS) : null };
});
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(parts, null, 1), 'utf8');
for (const g of parts.groups) console.log(g, parts.out[g].length);
console.log('wrote', outFile);
await browser.close(); await close();
