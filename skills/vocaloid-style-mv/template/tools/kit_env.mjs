#!/usr/bin/env node
// kit_env.mjs -- portable environment shared by every Node tool of a vocaloid-style-mv project.
// -----------------------------------------------------------------------------------------
// Nothing in tools/ hard-codes a machine path; everything is derived from here:
//
//   ROOT              project root = the parent of tools/ (from this file's location)
//   JIZURA_DIR        env JIZURA_DIR, default <ROOT>/vendor/JIZURA  (upstream clone, read-only; setup fetches the
//                     tested commit there -- env JIZURA_REF picks another branch / tag / sha, it is not a folder)
//   browserChannel()  env BROWSER_CHANNEL, default 'msedge' on Windows, else 'chrome';
//                     'chromium' = Playwright's bundled build
//   gpuArgs()         Chromium GPU flags; ANGLE backend from env BROWSER_ANGLE
//                     (default d3d11 on Windows, metal on macOS, Chromium's own default elsewhere; 'none' = no flag)
//   launchBrowser(o)  chromium.launch(o) on that channel; falls back to the bundled Chromium if the channel fails
//   pythonCmd()       env PYTHON, else the first working 'python' / 'python3' (/ 'py -3' on Windows) -> [cmd, ...args]
//   FFMPEG / FFPROBE  env FFMPEG / FFPROBE, default 'ffmpeg' / 'ffprobe' on PATH
//
//   node tools/kit_env.mjs            print the resolved environment (handy on a new machine)
//
// Playwright is imported lazily, so every tool's --help works before `npm install`.
// Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
// -----------------------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(TOOLS_DIR, '..');
export const JIZURA_DIR = path.resolve(ROOT, process.env.JIZURA_DIR || path.join('vendor', 'JIZURA'));
export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const IS_WIN = process.platform === 'win32';

/** true when the module with this import.meta.url is the script node was started with */
export function isMain(metaUrl) {
  return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

/** tiny CLI helpers for the `--key value` style used by the tools */
export function cliArg(key, def, argv = process.argv) {
  const i = argv.indexOf('--' + key);
  return i > 0 && i + 1 < argv.length ? argv[i + 1] : def;
}
export function cliFlag(key, argv = process.argv) { return argv.includes('--' + key); }
/** print `usage` and exit 0 when -h / --help is on the command line */
export function handleHelp(usage, argv = process.argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(usage.replace(/^\n/, '')); process.exit(0); }
}

/** relative paths are taken relative to the project root */
export const fromRoot = (p) => path.resolve(ROOT, p);

export function browserChannel() {
  return process.env.BROWSER_CHANNEL || (IS_WIN ? 'msedge' : 'chrome');
}

export function gpuArgs() {
  const def = IS_WIN ? 'd3d11' : process.platform === 'darwin' ? 'metal' : 'none';
  const angle = (process.env.BROWSER_ANGLE || def).trim();
  const out = angle && angle !== 'none' ? [`--use-angle=${angle}`] : [];
  return [...out, '--enable-gpu', '--ignore-gpu-blocklist'];
}

export async function importPlaywright() {
  try { return await import('playwright'); }
  catch (e) {
    throw new Error(`cannot load 'playwright' (${String(e.message).split('\n')[0]}).\n` +
      `Run "npm install" in the project root (${ROOT}); if neither Edge nor Chrome is installed, also run "npx playwright install chromium".`);
  }
}

/** chromium.launch() on the configured channel ('chromium' / '' = bundled); retries with the bundled build if the channel fails */
export async function launchBrowser({ channel = browserChannel(), ...opts } = {}) {
  const { chromium } = await importPlaywright();
  const ch = !channel || channel === 'chromium' ? undefined : channel;
  try { return await chromium.launch({ ...opts, channel: ch }); }
  catch (e) {
    if (!ch) throw e;
    console.warn(`[browser] channel '${ch}' failed to launch (${String(e.message).split('\n')[0]}) -> falling back to Playwright's bundled Chromium`);
    return chromium.launch({ ...opts, channel: undefined });
  }
}

let _python = null;
/** Python 3 interpreter as [command, ...prefixArgs]: env PYTHON, else python / python3 (/ py -3 on Windows) */
export function pythonCmd() {
  if (_python) return _python;
  if (process.env.PYTHON) return (_python = [process.env.PYTHON]);
  const cands = [['python'], ['python3']];
  if (IS_WIN) cands.push(['py', '-3']);
  for (const [cmd, ...pre] of cands) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0 && String(r.stdout).trim() === '3') return (_python = [cmd, ...pre]);
  }
  throw new Error('no Python 3 found: set the PYTHON environment variable to your python executable');
}

if (isMain(import.meta.url)) {
  handleHelp(`
kit_env.mjs -- print the environment the Node tools resolve (no side effects).
  node tools/kit_env.mjs
Environment variables: JIZURA_DIR, BROWSER_CHANNEL, BROWSER_ANGLE, PYTHON, FFMPEG, FFPROBE`);
  let py; try { py = pythonCmd().join(' '); } catch (e) { py = 'NOT FOUND (' + e.message + ')'; }
  let pw; try { pw = fileURLToPath(import.meta.resolve('playwright')); } catch { pw = 'missing (run npm install in the project root)'; }
  const rows = {
    ROOT, JIZURA_DIR: JIZURA_DIR + (fs.existsSync(JIZURA_DIR) ? '' : '   (missing: run setup, or npm run jizura:clone)'),
    BROWSER_CHANNEL: browserChannel(), GPU_ARGS: gpuArgs().join(' '), PYTHON: py, FFMPEG, FFPROBE, playwright: pw,
  };
  for (const [k, v] of Object.entries(rows)) console.log(`${k.padEnd(16)} ${v}`);
}
