#!/usr/bin/env node
/* Build the JIZURA *engine-only* bundle for the MV compositor.
 *
 *   node tools/build_jizura_bundle.mjs [--ref DIR] [--out DIR]
 *
 * Reads the read-only upstream clone (--ref, else env JIZURA_DIR, default <ROOT>/vendor/JIZURA; never writes there),
 * which setup.ps1 / setup.sh (or `npm run jizura:clone`) fetch at the tested commit (env JIZURA_REF overrides),
 * and writes (--out, default <ROOT>/jizura/app):
 *   jizura_engine.js    = src/*.js concatenated in build.py order, WITHOUT 12_ui.js
 *   JIZURA_LICENSE.txt  = upstream MIT licence (must ship with the code)
 *
 * This is byte-for-byte the same engine code as the Japanese edition of index.html (build.py: script = '\n'.join(src/*.js)),
 * minus the editor UI (12_ui.js returns early on pages without #app anyway) and minus mp4-muxer (we never export MP4 from it).
 * The only substitution is @VERSION@ -> the VERSION file, exactly like build.py.
 * Our additions (deterministic renderer, JZ API) live in jizura_adapter.js, loaded AFTER this bundle — no upstream file is patched.
 *
 * Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence (JIZURA itself: MIT, (c) 2026 hakoniwa (github.com/852wa)).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, JIZURA_DIR, isMain, handleHelp, cliArg } from './kit_env.mjs';

export const REF = JIZURA_DIR;
export const OUT_DIR = path.join(ROOT, 'jizura', 'app');

// a path for the bundle header that does not leak the local machine layout
function displayPath(p) {
  const rel = path.relative(ROOT, p);
  return (!rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.basename(p)).replace(/\\/g, '/');
}

export function buildBundle({ ref = REF, outDir = OUT_DIR, quiet = false } = {}) {
  const srcDir = path.join(ref, 'src');
  if (!fs.existsSync(srcDir) || !fs.existsSync(path.join(ref, 'VERSION'))) {
    throw new Error(`JIZURA clone not found at ${ref}\n  run setup.ps1 / setup.sh or \`npm run jizura:clone\` (fetch the tested commit into vendor/JIZURA)\n  (or set JIZURA_DIR / pass --ref)`);
  }
  const version = fs.readFileSync(path.join(ref, 'VERSION'), 'utf8').trim();
  // build.py uses sorted(glob('src/*.js')) — plain code-point order of the file names
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
  const engineFiles = files.filter(f => f !== '12_ui.js');
  const parts = engineFiles.map(f => fs.readFileSync(path.join(srcDir, f), 'utf8'));
  let js = parts.join('\n').split('@VERSION@').join(version);
  let gitHead = '';
  try { gitHead = fs.readFileSync(path.join(ref, '.git', 'HEAD'), 'utf8').trim(); if (gitHead.startsWith('ref:')) gitHead = fs.readFileSync(path.join(ref, '.git', gitHead.slice(5).trim()), 'utf8').trim(); } catch (e) {}
  const header = `/*! JIZURA 字面 v${version} engine (MIT License, (c) 2026 hakoniwa (github.com/852wa) — see JIZURA_LICENSE.txt)\n` +
    ` *  built by tools/build_jizura_bundle.mjs from ${displayPath(ref)}${gitHead ? ' @' + gitHead.slice(0, 12) : ''}\n` +
    ` *  files: ${engineFiles.join(' ')}\n */\n`;
  js = header + js;
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'jizura_engine.js');
  fs.writeFileSync(outFile, js, 'utf8');
  fs.copyFileSync(path.join(ref, 'LICENSE'), path.join(outDir, 'JIZURA_LICENSE.txt'));
  const sha = crypto.createHash('sha256').update(js).digest('hex').slice(0, 16);
  const info = { outFile, bytes: Buffer.byteLength(js), files: engineFiles.length, version, gitHead: gitHead.slice(0, 12), sha256_16: sha };
  if (!quiet) console.log('[jizura bundle]', JSON.stringify(info));
  return info;
}

if (isMain(import.meta.url)) {
  handleHelp(`
build_jizura_bundle.mjs -- concatenate the upstream JIZURA engine into jizura/app/jizura_engine.js
  node tools/build_jizura_bundle.mjs [--ref DIR] [--out DIR]
  --ref DIR   upstream clone       [${REF}]   (env JIZURA_DIR)
  --out DIR   output directory     [${OUT_DIR}]`);
  try {
    buildBundle({ ref: path.resolve(ROOT, cliArg('ref', REF)), outDir: path.resolve(ROOT, cliArg('out', OUT_DIR)) });
  } catch (e) { console.error('[jizura bundle] ' + e.message); process.exit(1); }
}
