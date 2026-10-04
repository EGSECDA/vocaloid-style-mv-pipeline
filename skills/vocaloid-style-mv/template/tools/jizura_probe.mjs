#!/usr/bin/env node
/* Headless probe of the JIZURA engine through jizura/app/jizura_adapter.js.
 *   node tools/jizura_probe.mjs [--style sunset] [--times 1,2.5,4] [--lrc analysis/lyrics_mv.lrc] [--out jizura/probe] [--modes normal,back,front]
 * Renders normal / back / front frames at the given times and reports ms/frame and the planned cuts.
 * Needs jizura/app/jizura_engine.js (node tools/build_jizura_bundle.mjs). Beats come from analysis/audio.json when present.
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cliArg as arg, handleHelp, launchBrowser, gpuArgs } from './kit_env.mjs';
import { startServer } from './jizura_serve.mjs';

handleHelp(`
jizura_probe.mjs -- render a few JIZURA frames headlessly and print timings + planned cuts
  node tools/jizura_probe.mjs [options]
  --style NAME      JIZURA style preset                              [sunset]
  --times LIST      comma-separated seconds                           [1.0,2.2,4.1,6.0,9.5,13.0]
  --lrc FILE        lyrics (LRC, relative to the project root)        [built-in 4-line sample]
  --modes LIST      normal,back,front                                 [normal,back,front]
  --out DIR         PNG / cuts output dir                             [jizura/probe]
Env: BROWSER_CHANNEL, BROWSER_ANGLE (see tools/kit_env.mjs)`);

const style = arg('style', 'sunset');
const outDir = path.resolve(ROOT, arg('out', 'jizura/probe'));
const times = arg('times', '1.0,2.2,4.1,6.0,9.5,13.0').split(',').map(Number);
const lrcPath = arg('lrc', null);
const modes = arg('modes', 'normal,back,front').split(',');
fs.mkdirSync(outDir, { recursive: true });

const lyrics = lrcPath ? fs.readFileSync(path.resolve(ROOT, lrcPath), 'utf8') : `[00:00.50]夕暮れの色を/覚えてる
[00:04.00]消えかけた*残光*
[00:07.50]ねえ、まだ間に合うかな
[00:11.00]さよならは言わないで!`;

const audioJson = path.join(ROOT, 'analysis', 'audio.json');
const audio = fs.existsSync(audioJson)
  ? JSON.parse(fs.readFileSync(audioJson, 'utf8').replace(/^﻿/, ''))
  : { duration: 224.32, beats: Array.from({ length: 460 }, (_, i) => +(0.25 + i * 60 / 123).toFixed(3)) };
const { origin, close } = await startServer(0);
const browser = await launchBrowser({ headless: true, args: gpuArgs() });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.type(), m.text().slice(0, 200)); });
await page.goto(`${origin}/project/jizura/app/engine.html`);
await page.waitForFunction(() => window.JZ_READY === true);

const summary = await page.evaluate(async ({ lyrics, style, beats, duration }) => {
  JZ.setAudio({ duration, beats, energy: null, energyRate: 0 });
  return JZ.setProject({ lyrics, style, fps: 30, res: 1080, aspect: '16:9', seed: 2609, unify: true, typeset: true });
}, { lyrics, style, beats: audio.beats, duration: audio.duration });
console.log('summary', JSON.stringify(summary));
const cuts = await page.evaluate(() => JZ.cuts());
fs.writeFileSync(path.join(outDir, `cuts_${style}.json`), JSON.stringify(cuts, null, 1));
console.log(`cuts: ${cuts.length}`, cuts.slice(0, 6).map(c => `${c.start}-${c.end} ${c.layout}/${c.enter}/${c.exit} bg=${c.bg} «${c.text}»`).join('\n  '));

for (const mode of modes) {
  let total = 0;
  for (const t of times) {
    const { b64, ms } = await page.evaluate(({ t, mode }) => {
      const r = JZ.renderAt(t, { mode });
      return { b64: r.canvas.toDataURL('image/png').split(',')[1], ms: r.ms };
    }, { t, mode });
    total += ms;
    fs.writeFileSync(path.join(outDir, `${style}_${mode}_${t.toFixed(2)}.png`), Buffer.from(b64, 'base64'));
  }
  console.log(`${mode}: ${(total / times.length).toFixed(1)} ms/frame render (excl. PNG encode)`);
}
await browser.close();
await close();
