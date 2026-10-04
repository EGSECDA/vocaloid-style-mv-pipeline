#!/usr/bin/env node
// render_final.mjs -- final render: engine frames -> NVENC video (tools/render_frames.mjs), then mux the song,
// padded with silence to the video length (the afterimage tail may run past the music's dead stop).
// -----------------------------------------------------------------------------------------
//   node tools/render_final.mjs [--workers 3] [--start 0] [--end 226.54] [--name mv] [--preview]
//                               [--url engine/index.html] [--selector canvas#out] [--width 1920] [--height 1080]
//                               [--audio audio/song.wav] [--codec nvenc|x264|hevc] [--cq 16] [--fps 30]
//
// Writes render/<name>_video.mp4 (picture only), render/<name>.mp4 (picture + AAC 320k / 48 kHz) and
// render/<name>_stats.json, then prints an ffprobe summary. Without --end, render_frames.mjs uses the page's
// window.__zankoMeta.duration. Use --codec x264 on machines without an NVIDIA GPU.
// Cross-platform replacement of the old render_final.ps1 (which is now a thin wrapper around this file).
// Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
// -----------------------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TOOLS_DIR, FFMPEG, FFPROBE } from './kit_env.mjs';

const HELP = `
render_final.mjs -- full render (render_frames.mjs) + audio mux
  node tools/render_final.mjs [options]
  --workers N        parallel render workers                                       [3]
  --start T          start time in seconds                                         [0]
  --end T            end time in seconds (exclusive)          [page's window.__zankoMeta.duration]
  --name NAME        output base name -> render/NAME.mp4                           [mv]
  --preview          half-res fast preview (render_frames --preview)
  --url PAGE         engine page relative to the project root                       [engine/index.html]
  --selector CSS     canvas to capture                                              [canvas#out]
  --width W --height H   output size                                                [1920x1080]
  --fps N            frames per second                                              [30]
  --codec C          nvenc | x264 | hevc                                            [nvenc]
  --cq N             nvenc constant quality                                         [16]
  --audio FILE       song to mux (relative to the project root)                     [audio/song.wav]
  --no-audio         skip the mux (render/NAME.mp4 = the picture-only file)
Env: BROWSER_CHANNEL, BROWSER_ANGLE, FFMPEG, FFPROBE (see tools/kit_env.mjs)`;

function parseArgs(argv) {
  const a = { workers: 3, start: 0, end: null, name: 'mv', preview: false, url: 'engine/index.html', selector: 'canvas#out',
    width: 1920, height: 1080, fps: 30, codec: 'nvenc', cq: 16, audio: 'audio/song.wav', noAudio: false };
  const nums = new Set(['workers', 'start', 'end', 'width', 'height', 'fps', 'cq']);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--help' || k === '-h') { console.log(HELP.replace(/^\n/, '')); process.exit(0); }
    if (k === '--preview') { a.preview = true; continue; }
    if (k === '--no-audio') { a.noAudio = true; continue; }
    // also accept the old PowerShell spelling (-Workers 3, -End 226.54, -Preview ...)
    const key = k.replace(/^--?/, '').toLowerCase();
    if (key === 'preview') { a.preview = true; continue; }
    if (!(key in a) || !k.startsWith('-')) throw new Error(`unknown option ${k} (see --help)`);
    const v = argv[++i];
    if (v === undefined) throw new Error(`missing value for ${k}`);
    a[key] = nums.has(key) ? Number(v) : v;
    if (nums.has(key) && !Number.isFinite(a[key])) throw new Error(`bad number for ${k}: ${v}`);
  }
  return a;
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.error) throw new Error(`${label}: cannot start ${cmd} (${r.error.message})`);
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const audio = path.resolve(ROOT, a.audio);
  if (!a.noAudio && !fs.existsSync(audio)) throw new Error(`audio not found: ${audio} (pass --audio FILE or --no-audio)`);
  const renderDir = path.join(ROOT, 'render');
  fs.mkdirSync(renderDir, { recursive: true });
  const video = path.join(renderDir, `${a.name}_video.mp4`);
  const final = path.join(renderDir, `${a.name}.mp4`);
  const statsFile = path.join(renderDir, `${a.name}_stats.json`);

  const nodeArgs = [path.join(TOOLS_DIR, 'render_frames.mjs'), '--url', a.url, '--selector', a.selector,
    '--width', String(a.width), '--height', String(a.height), '--start', String(a.start)];
  if (a.end != null) nodeArgs.push('--end', String(a.end));
  nodeArgs.push('--fps', String(a.fps), '--workers', String(a.workers), '--mode', 'blob', '--out', video,
    '--codec', a.codec, '--cq', String(a.cq), '--stats', statsFile);
  if (a.preview) nodeArgs.push('--preview');

  const t0 = performance.now();
  run(process.execPath, nodeArgs, 'render_frames');

  // video length: from the stats render_frames just wrote (exact), else ffprobe
  let dur = a.end != null ? a.end - a.start : null;
  if (dur == null) {
    try { const st = JSON.parse(fs.readFileSync(statsFile, 'utf8')); dur = st.frames / st.args.fps; } catch { /* fall through */ }
  }
  if (dur == null) {
    const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
    dur = parseFloat(String(r.stdout).trim());
    if (!Number.isFinite(dur)) throw new Error('cannot determine the video duration (ffprobe failed)');
  }

  if (a.noAudio) fs.copyFileSync(video, final);
  else {
    // audio: song from --start, padded with silence to the video length (the afterimage tail runs past the dead stop)
    run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-ss', String(a.start), '-i', audio,
      '-filter_complex', `[1:a]apad=whole_dur=${dur.toFixed(6)}[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', dur.toFixed(6), '-movflags', '+faststart', final], 'mux');
  }
  // the master must contain every rendered frame (guards against a truncated segment or a failed concat)
  let expect = null;
  try { expect = JSON.parse(fs.readFileSync(statsFile, 'utf8')).frames; } catch { /* no stats */ }
  if (expect == null && a.end != null) expect = Math.round((a.end - a.start) * a.fps);
  if (expect != null) {
    const r = spawnSync(FFPROBE, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets',
      '-of', 'csv=p=0', final], { encoding: 'utf8' });
    const got = parseInt(String(r.stdout).trim(), 10);
    if (got !== expect) throw new Error(`${final} has ${Number.isFinite(got) ? got : '?'} video frames, expected ${expect}: re-run the render`);
  }
  console.log(`done in ${((performance.now() - t0) / 60000).toFixed(1)} min -> ${final}`);
  spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate:format=duration,size',
    '-of', 'compact', final], { stdio: 'inherit' });
}

try { main(); } catch (e) { console.error('[render_final] ' + e.message); process.exit(1); }
