#!/usr/bin/env bash
# setup.sh -- one-time (and repeatable) setup of a vocaloid-style-mv project on macOS / Linux (also works in Git Bash).
#
# Works on the folder this script is in (the project root). Every step is idempotent: re-running only does
# what is missing.
#   1. npm install                       Playwright (drives headless Chrome / Edge; no browser download needed)
#   2. browser                           uses Chrome / Edge; downloads Playwright's Chromium only if the channel is missing
#   3. pip install -r requirements.txt   (+ the optional lyric-transcription set with --lyrics)
#   4. python tools/fetch_fonts.py       Google Fonts TTFs (OFL) -> engine/fonts  (~260 MB, skipped when present)
#   5. JIZURA -> vendor/JIZURA: shallow fetch of the tested commit fc16bfe (skipped when present / JIZURA_DIR set)
#   6. node tools/build_jizura_bundle.mjs   -> jizura/app/jizura_engine.js
#   7. python tools/check_env.py --webgl    REQUIRED vs OPTIONAL report (ffmpeg, NVENC, GPU/WebGL, Blender, Codex ...)
#
# Usage: ./setup.sh [--lyrics] [--fonts-from DIR] [--skip-pip] [--skip-fonts] [--skip-check] [--no-webgl]
# Env:   PYTHON (interpreter), BROWSER_CHANNEL (chrome | msedge | chromium), JIZURA_DIR (existing clone; wins),
#        JIZURA_REF (JIZURA branch / tag / full commit sha to fetch instead of the tested one, e.g. main)
# Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LYRICS=0 SKIP_PIP=0 SKIP_FONTS=0 SKIP_CHECK=0 WEBGL=1 FONTS_FROM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --lyrics) LYRICS=1 ;;
    --fonts-from) FONTS_FROM="${2:?--fonts-from needs a directory}"; shift ;;
    --skip-pip) SKIP_PIP=1 ;;
    --skip-fonts) SKIP_FONTS=1 ;;
    --skip-check) SKIP_CHECK=1 ;;
    --no-webgl) WEBGL=0 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then C_STEP=$'\033[36m' C_OK=$'\033[32m' C_NOTE=$'\033[33m' C_DIM=$'\033[90m' C_END=$'\033[0m'
else C_STEP='' C_OK='' C_NOTE='' C_DIM='' C_END=''; fi
NOTES=()
step() { printf '\n%s== %s%s\n' "$C_STEP" "$1" "$C_END"; }
ok()   { printf '%s   ok  %s%s\n' "$C_OK" "$1" "$C_END"; }
note() { printf '%s   --  %s%s\n' "$C_NOTE" "$1" "$C_END"; NOTES+=("$1"); }
die()  { printf 'setup failed: %s\n' "$1" >&2; exit 1; }
run()  { printf '%s   > %s%s\n' "$C_DIM" "$*" "$C_END"; "$@" || die "'$*' exited with $?"; }
have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in MINGW*|MSYS*|CYGWIN*) IS_WIN=1 ;; *) IS_WIN=0 ;; esac

# ------------------------------------------------------------------------------------------ prerequisites
find_python() {
  # sets the array PY to a Python >= 3.10 (skips the Windows Store stub); $PYTHON wins
  local c
  if [ -n "${PYTHON:-}" ]; then PY=("$PYTHON"); return 0; fi
  for c in python3 python; do
    have "$c" || continue
    case "$(command -v "$c")" in *WindowsApps*) continue ;; esac
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then PY=("$c"); return 0; fi
  done
  if [ "$IS_WIN" = 1 ] && have py && py -3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
    PY=(py -3); return 0
  fi
  return 1
}

step "vocaloid-style-mv setup in $ROOT"
have node || die "node not found: install Node.js 20+ (https://nodejs.org)"
have npm || die "npm not found: install Node.js 20+ (https://nodejs.org)"
NODE_VER="$(node --version)"
NODE_MAJOR="${NODE_VER#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $NODE_VER is too old: install Node.js 20+"
ok "node $NODE_VER"
PY=()
find_python || die "Python 3.10+ not found: install it (python.org / brew install python / apt install python3) or set PYTHON"
ok "python $("${PY[@]}" -c 'import sys; print(sys.version.split()[0])')  (${PY[*]})"

# ------------------------------------------------------------------------------------------ 1. npm install
step "Node packages (Playwright)"
if [ -f node_modules/playwright/package.json ] && [ -f node_modules/playwright-core/package.json ]; then
  ok "node_modules/playwright already installed"
else
  run npm install --no-fund --no-audit
fi

# ------------------------------------------------------------------------------------------ 2. browser
step "Browser for headless rendering"
if [ "$IS_WIN" = 1 ]; then DEF_CHANNEL=msedge; else DEF_CHANNEL=chrome; fi
CHANNEL="${BROWSER_CHANNEL:-$DEF_CHANNEL}"
find_browser() {   # $1 = chrome | msedge -> prints the executable if installed
  local p
  case "$OS:$1" in
    Darwin:chrome) set -- "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
    Darwin:msedge) set -- "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ;;
    Linux:chrome)  set -- /opt/google/chrome/chrome "$(command -v google-chrome-stable 2>/dev/null || true)" ;;
    Linux:msedge)  set -- /opt/microsoft/msedge/msedge "$(command -v microsoft-edge-stable 2>/dev/null || true)" ;;
    *:chrome) set -- "/c/Program Files/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ;;
    *:msedge) set -- "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "/c/Program Files/Microsoft/Edge/Application/msedge.exe" ;;
    *) return 1 ;;
  esac
  for p in "$@"; do
    if [ -n "$p" ] && [ -x "$p" ]; then echo "$p"; return 0; fi
  done
  return 1
}
if [ "$CHANNEL" != chromium ] && BROWSER_EXE="$(find_browser "$CHANNEL")"; then
  ok "channel '$CHANNEL' -> $BROWSER_EXE"
else
  if [ "$CHANNEL" != chromium ]; then
    OTHER=chrome; [ "$CHANNEL" = chrome ] && OTHER=msedge
    if find_browser "$OTHER" >/dev/null; then note "channel '$CHANNEL' not installed but '$OTHER' is: export BROWSER_CHANNEL=$OTHER avoids the Chromium download"; fi
  fi
  echo "   channel '$CHANNEL' unavailable -> installing Playwright's bundled Chromium (the tools fall back to it)"
  run npx --yes playwright install chromium
  if [ "$OS" = Linux ]; then echo "   (Linux: if Chromium fails to start, run 'npx playwright install-deps chromium' with sudo)"; fi
fi

# ------------------------------------------------------------------------------------------ 3. pip
step "Python packages"
if [ "$SKIP_PIP" = 1 ]; then note "skipped (--skip-pip)"
else
  run "${PY[@]}" -m pip install --disable-pip-version-check -r requirements.txt
  if [ "$LYRICS" = 1 ]; then
    OPT="$(sed -n 's/^#[[:space:]]*\[lyrics\][[:space:]]\{1,\}\([^[:space:]]\{1,\}\).*/\1/p' requirements.txt)"
    # shellcheck disable=SC2086
    if [ -n "$OPT" ]; then run "${PY[@]}" -m pip install --disable-pip-version-check $OPT; fi
    echo "   forced alignment also needs CPU torch/torchaudio (see requirements.txt; installs into vendor/pydeps_torch)"
  fi
fi

# ------------------------------------------------------------------------------------------ 4. fonts
step "Fonts (engine/fonts)"
fonts_ok() {
  "${PY[@]}" - <<'PYEOF'
import json, os, sys
d = os.path.join("engine", "fonts"); m = os.path.join(d, "manifest.json")
if not os.path.exists(m): sys.exit(1)
for e in json.load(open(m, encoding="utf-8")):
    f = os.path.join(d, e["file"])
    if not os.path.exists(f) or os.path.getsize(f) != e["size"]: sys.exit(1)
PYEOF
}
if [ "$SKIP_FONTS" = 1 ]; then note "skipped (--skip-fonts)"
else
  if [ -n "$FONTS_FROM" ] && ! fonts_ok; then
    [ -d "$FONTS_FROM" ] || die "--fonts-from: $FONTS_FROM does not exist"
    echo "   copying *.ttf / *.otf / OFL_*.txt from $FONTS_FROM"
    for f in "$FONTS_FROM"/*.ttf "$FONTS_FROM"/*.otf "$FONTS_FROM"/OFL_*.txt; do
      if [ -f "$f" ]; then cp -f "$f" engine/fonts/; fi
    done
  fi
  if fonts_ok; then ok "all font files of engine/fonts/manifest.json present"
  else run "${PY[@]}" tools/fetch_fonts.py; fi
fi

# ------------------------------------------------------------------------------------------ 5-6. JIZURA
step "JIZURA (lyric-motion engine, MIT, (c) 2026 hakoniwa (github.com/852wa))"
# the kit is tested against this commit (deny-lists, part tags, scheme indices); keep in sync with setup.ps1,
# package.json (jizura:clone) and scripts/check_env.py. JIZURA_REF = branch / tag / full sha overrides it.
JZ_PIN=fc16bfe43ea4a6c25a21f1caf04d17326de14f00
JZ_REF="${JIZURA_REF:-$JZ_PIN}"
JZ="${JIZURA_DIR:-$ROOT/vendor/JIZURA}"
if [ -d "$JZ/src" ]; then
  ok "clone present: $JZ"
  if [ -z "${JIZURA_DIR:-}" ] && [[ $JZ_REF =~ ^[0-9a-f]{40}$ ]] && have git; then
    JZ_HEAD="$(git -C "$JZ" rev-parse HEAD 2>/dev/null || true)"
    if [[ $JZ_HEAD =~ ^[0-9a-f]{40}$ ]] && [ "$JZ_HEAD" != "$JZ_REF" ]; then
      note "vendor/JIZURA is at ${JZ_HEAD:0:7}, not ${JZ_REF:0:7}: delete vendor/JIZURA and re-run setup to fetch it"
    fi
  fi
else
  have git || die "git not found: install Git, or clone https://github.com/852wa/JIZURA yourself and set JIZURA_DIR"
  mkdir -p "$(dirname "$JZ")"
  JZ_TESTED=""; [ "$JZ_REF" = "$JZ_PIN" ] && JZ_TESTED=" (tested commit)"
  echo "   fetching https://github.com/852wa/JIZURA @ $JZ_REF$JZ_TESTED"
  # shallow fetch of exactly one commit (works for a branch, a tag or a full sha); re-runnable after a failure
  run git init -q "$JZ"
  run git -C "$JZ" config remote.origin.url https://github.com/852wa/JIZURA
  run git -C "$JZ" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
  printf '%s   > git -C %s fetch --depth 1 origin %s%s\n' "$C_DIM" "$JZ" "$JZ_REF" "$C_END"
  git -C "$JZ" fetch --depth 1 origin "$JZ_REF" ||
    die "fetching JIZURA @ $JZ_REF failed (JIZURA_REF must be a branch, a tag or a full 40-character commit sha)"
  run git -C "$JZ" checkout -q --detach FETCH_HEAD
fi
run node tools/build_jizura_bundle.mjs --ref "$JZ"

# ------------------------------------------------------------------------------------------ 7. check
step "Environment check"
if [ "$SKIP_CHECK" = 1 ]; then note "skipped (--skip-check)"
else
  CHECK=""
  for c in tools/check_env.py "$ROOT/../scripts/check_env.py"; do
    if [ -f "$c" ]; then CHECK="$c"; break; fi
  done
  if [ -n "$CHECK" ]; then
    CARGS=("$CHECK" --project "$ROOT")
    if [ "$WEBGL" = 1 ]; then CARGS+=(--webgl); fi
    "${PY[@]}" "${CARGS[@]}" || note "check_env reported a missing REQUIRED item (see above)"
  else
    for t in ffmpeg ffprobe; do if have "$t"; then ok "$t found"; else note "$t not on PATH (REQUIRED for rendering): https://ffmpeg.org"; fi; done
  fi
fi

step "Done"
if [ ${#NOTES[@]} -gt 0 ]; then for n in "${NOTES[@]}"; do printf '%s   note: %s%s\n' "$C_NOTE" "$n" "$C_END"; done; fi
PYCMD="${PY[*]}"   # the interpreter setup used (in Git Bash 'python3' is often the Microsoft Store stub)
if [ -f audio/song.wav ]; then
  cat <<EOF
   Next (from the project root; audio/song.wav is already there):
     $PYCMD tools/analyze_audio.py                 (beats, bars, sections -> analysis/audio.json + overview.png)
   then README.md section 3 (section 2 if it is the demo song). The demo smoke test needs a project without a song.
EOF
else
  cat <<EOF
   Next (from the project root):
     $PYCMD demo/make_demo_song.py                (optional smoke test: synthesizes audio/song.wav)
     cp demo/lyrics_demo.lrc analysis/lyrics_mv.lrc
     cp demo/sections_demo.json analysis/sections.json      (optional: curated demo sections)
     $PYCMD tools/analyze_audio.py
     node tools/stills.mjs --times 1,3.5,8.4,10,12.5,13.6,18.4,19.5,21.2,23.3 --sheet smoke
     node tools/render_final.mjs --name demo        (add --codec x264 without an NVIDIA GPU)
   See README.md (PROJECT_README.md in the template) for the full workflow; section 2 adds the 9:16 version + review sheets.
EOF
fi
