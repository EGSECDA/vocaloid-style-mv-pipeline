<#
.SYNOPSIS
  One-time (and repeatable) setup of a vocaloid-style-mv project on Windows: Node + Python deps, fonts, JIZURA, checks.

.DESCRIPTION
  Run from anywhere; it works on the folder this script is in (the project root). Every step is idempotent:
  re-running only does what is missing.

    1. npm install                       Playwright (drives headless Edge / Chrome; no browser download needed)
    2. browser                           uses Edge / Chrome; downloads Playwright's Chromium only if the channel is missing
    3. pip install -r requirements.txt   (+ the optional lyric-transcription set with -Lyrics)
    4. python tools/fetch_fonts.py       Google Fonts TTFs (OFL) -> engine/fonts  (~260 MB, skipped when present)
    5. JIZURA -> vendor/JIZURA: shallow fetch of the tested commit fc16bfe (skipped when present / JIZURA_DIR set)
    6. node tools/build_jizura_bundle.mjs   -> jizura/app/jizura_engine.js
    7. python tools/check_env.py --webgl    REQUIRED vs OPTIONAL report (ffmpeg, NVENC, GPU/WebGL, Blender, Codex ...)

  Usage:
    powershell -ExecutionPolicy Bypass -File setup.ps1 [-Lyrics] [-FontsFrom DIR] [-SkipPip] [-SkipFonts] [-SkipCheck] [-NoWebGL]

  Environment: PYTHON (interpreter), BROWSER_CHANNEL (msedge | chrome | chromium), JIZURA_DIR (existing clone; wins),
               JIZURA_REF (JIZURA branch / tag / full commit sha to fetch instead of the tested one, e.g. main).

  Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
#>
[CmdletBinding()]
param(
  [switch]$Lyrics,       # also install the optional lyric-transcription packages ("# [lyrics]" lines of requirements.txt)
  [string]$FontsFrom,    # copy the font files from another project's engine/fonts instead of downloading them
  [switch]$SkipPip,
  [switch]$SkipFonts,
  [switch]$SkipCheck,
  [switch]$NoWebGL       # skip the headless-browser WebGL probe in the final check
)
$ErrorActionPreference = 'Continue'   # native tools may write progress to stderr; failures are caught via exit codes
$Root = $PSScriptRoot
$script:Warnings = @()

function Write-Step([string]$msg) { Write-Host ''; Write-Host "== $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg) { Write-Host "   ok  $msg" -ForegroundColor Green }
function Write-Note([string]$msg) { Write-Host "   --  $msg" -ForegroundColor Yellow; $script:Warnings += $msg }
function Invoke-Native([string]$Label, [string]$Exe, [string[]]$ArgList) {
  Write-Host "   > $Exe $($ArgList -join ' ')" -ForegroundColor DarkGray
  & $Exe @ArgList
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit code $LASTEXITCODE)" }
}

# ------------------------------------------------------------------------------------------ prerequisites
function Find-Python {
  # returns @(exe, prefix args...) for a Python >= 3.10, skipping the Microsoft Store stub
  if ($env:PYTHON) { return , @($env:PYTHON) }
  foreach ($cand in @(@('python'), @('py', '-3'), @('python3'))) {
    $cmd = Get-Command $cand[0] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $cmd -or $cmd.Source -like '*\WindowsApps\*') { continue }
    $pre = @(); if ($cand.Count -gt 1) { $pre = $cand[1..($cand.Count - 1)] }
    $v = & $cmd.Source @pre -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and "$v" -match '^3\.(\d+)$' -and [int]$Matches[1] -ge 10) { return , (@($cmd.Source) + $pre) }
  }
  return $null
}

Push-Location -LiteralPath $Root
try {
  Write-Step "vocaloid-style-mv setup in $Root"
  foreach ($tool in 'node', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool not found: install Node.js 20+ (https://nodejs.org) and re-run" }
  }
  $nodeVer = (& node --version).Trim()
  if ($nodeVer -match '^v(\d+)' -and [int]$Matches[1] -lt 20) { throw "Node.js $nodeVer is too old: install Node.js 20+" }
  Write-Ok "node $nodeVer"
  $Py = Find-Python
  if (-not $Py) { throw 'Python 3.10+ not found: install it from https://www.python.org (tick "Add to PATH") or set $env:PYTHON' }
  $PyExe = $Py[0]; $PyPre = @(); if ($Py.Count -gt 1) { $PyPre = $Py[1..($Py.Count - 1)] }
  function Invoke-Py([string]$Label, [string[]]$ArgList) { Invoke-Native $Label $PyExe ($PyPre + $ArgList) }
  Write-Ok ("python " + (& $PyExe @PyPre -c "import sys; print(sys.version.split()[0])") + "  ($PyExe)")

  # ------------------------------------------------------------------------------------------ 1. npm install
  Write-Step 'Node packages (Playwright)'
  if ((Test-Path 'node_modules\playwright\package.json') -and (Test-Path 'node_modules\playwright-core\package.json')) {
    Write-Ok 'node_modules/playwright already installed'
  } else {
    Invoke-Native 'npm install' 'npm' @('install', '--no-fund', '--no-audit')
  }

  # ------------------------------------------------------------------------------------------ 2. browser
  Write-Step 'Browser for headless rendering'
  $channel = if ($env:BROWSER_CHANNEL) { $env:BROWSER_CHANNEL } else { 'msedge' }
  $pf86 = ${env:ProgramFiles(x86)}
  $edge = @("$pf86\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe") | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$pf86\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  $have = @{ msedge = $edge; chrome = $chrome }
  if ($channel -ne 'chromium' -and $have[$channel]) {
    Write-Ok "channel '$channel' -> $($have[$channel])"
  } else {
    if ($channel -ne 'chromium') {
      $other = if ($channel -eq 'msedge') { 'chrome' } else { 'msedge' }
      if ($have[$other]) { Write-Note "channel '$channel' not installed but '$other' is: `$env:BROWSER_CHANNEL='$other' avoids the Chromium download" }
    }
    Write-Host "   channel '$channel' unavailable -> installing Playwright's bundled Chromium (the tools fall back to it)"
    Invoke-Native 'playwright install chromium' 'npx' @('--yes', 'playwright', 'install', 'chromium')
  }

  # ------------------------------------------------------------------------------------------ 3. pip
  Write-Step 'Python packages'
  if ($SkipPip) { Write-Note 'skipped (-SkipPip)' }
  else {
    Invoke-Py 'pip install' @('-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt')
    if ($Lyrics) {
      $opt = @(Get-Content -LiteralPath 'requirements.txt' | ForEach-Object { if ($_ -match '^#\s*\[lyrics\]\s+(\S+)') { $Matches[1] } })
      if ($opt.Count) { Invoke-Py 'pip install (lyrics)' (@('-m', 'pip', 'install', '--disable-pip-version-check') + $opt) }
      Write-Host '   forced alignment also needs CPU torch/torchaudio (see requirements.txt; installs into vendor/pydeps_torch)'
    }
  }

  # ------------------------------------------------------------------------------------------ 4. fonts
  Write-Step 'Fonts (engine/fonts)'
  function Test-Fonts {
    $man = 'engine\fonts\manifest.json'
    if (-not (Test-Path -LiteralPath $man)) { return $false }
    $list = Get-Content -LiteralPath $man -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($m in @($list)) {
      $f = Join-Path 'engine\fonts' $m.file
      if (-not (Test-Path -LiteralPath $f) -or (Get-Item -LiteralPath $f).Length -ne [long]$m.size) { return $false }
    }
    return $true
  }
  if ($SkipFonts) { Write-Note 'skipped (-SkipFonts)' }
  else {
    if ($FontsFrom -and -not (Test-Fonts)) {
      if (-not (Test-Path -LiteralPath $FontsFrom)) { throw "-FontsFrom: $FontsFrom does not exist" }
      Write-Host "   copying *.ttf / *.otf / OFL_*.txt from $FontsFrom"
      Get-ChildItem -LiteralPath $FontsFrom -File | Where-Object { $_.Name -match '\.(ttf|otf)$|^OFL_.*\.txt$' } |
        Copy-Item -Destination 'engine\fonts' -Force
    }
    if (Test-Fonts) { Write-Ok 'all font files of engine/fonts/manifest.json present' }
    else { Invoke-Py 'fetch fonts' @('tools/fetch_fonts.py') }
  }

  # ------------------------------------------------------------------------------------------ 5-6. JIZURA
  Write-Step 'JIZURA (lyric-motion engine, MIT, (c) 2026 hakoniwa (github.com/852wa))'
  # the kit is tested against this commit (deny-lists, part tags, scheme indices); keep in sync with setup.sh,
  # package.json (jizura:clone) and scripts/check_env.py. $env:JIZURA_REF = branch / tag / full sha overrides it.
  $JzPin = 'fc16bfe43ea4a6c25a21f1caf04d17326de14f00'
  $jzRef = if ($env:JIZURA_REF) { $env:JIZURA_REF } else { $JzPin }
  $jz = if ($env:JIZURA_DIR) { $env:JIZURA_DIR } else { Join-Path $Root 'vendor\JIZURA' }
  if (Test-Path -LiteralPath (Join-Path $jz 'src')) {
    Write-Ok "clone present: $jz"
    if (-not $env:JIZURA_DIR -and $jzRef -match '^[0-9a-f]{40}$' -and (Get-Command git -ErrorAction SilentlyContinue)) {
      $head = "$(& git -C $jz rev-parse HEAD 2>$null)".Trim()
      if ($head -match '^[0-9a-f]{40}$' -and $head -ne $jzRef) {
        Write-Note "vendor/JIZURA is at $($head.Substring(0, 7)), not $($jzRef.Substring(0, 7)): delete vendor\JIZURA and re-run setup to fetch it"
      }
    }
  } else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git not found: install Git (https://git-scm.com) or clone JIZURA yourself and set $env:JIZURA_DIR' }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $jz) | Out-Null
    Write-Host "   fetching https://github.com/852wa/JIZURA @ $jzRef$(if ($jzRef -eq $JzPin) { ' (tested commit)' })"
    # shallow fetch of exactly one commit (works for a branch, a tag or a full sha); re-runnable after a failure
    Invoke-Native 'git init' 'git' @('init', '-q', $jz)
    Invoke-Native 'git config' 'git' @('-C', $jz, 'config', 'remote.origin.url', 'https://github.com/852wa/JIZURA')
    Invoke-Native 'git config' 'git' @('-C', $jz, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
    try { Invoke-Native 'git fetch JIZURA' 'git' @('-C', $jz, 'fetch', '--depth', '1', 'origin', $jzRef) }
    catch { throw "$($_.Exception.Message) -- JIZURA_REF must be a branch, a tag or a full 40-character commit sha" }
    Invoke-Native 'git checkout JIZURA' 'git' @('-C', $jz, 'checkout', '-q', '--detach', 'FETCH_HEAD')
  }
  Invoke-Native 'build JIZURA bundle' 'node' @('tools/build_jizura_bundle.mjs', '--ref', $jz)

  # ------------------------------------------------------------------------------------------ 7. check
  Write-Step 'Environment check'
  if ($SkipCheck) { Write-Note 'skipped (-SkipCheck)' }
  else {
    $check = @('tools\check_env.py', (Join-Path $Root '..\scripts\check_env.py')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($check) {
      $cargs = @($check, '--project', $Root); if (-not $NoWebGL) { $cargs += '--webgl' }
      & $PyExe @PyPre @cargs
      if ($LASTEXITCODE -ne 0) { Write-Note 'check_env reported a missing REQUIRED item (see above)' }
    } else {
      foreach ($tool in 'ffmpeg', 'ffprobe') {
        if (Get-Command $tool -ErrorAction SilentlyContinue) { Write-Ok "$tool found" } else { Write-Note "$tool not on PATH (REQUIRED for rendering): https://ffmpeg.org" }
      }
    }
  }

  Write-Step 'Done'
  if ($script:Warnings.Count) { $script:Warnings | ForEach-Object { Write-Host "   note: $_" -ForegroundColor Yellow } }
  # how to call this Python below ('python' may be the Microsoft Store stub when setup found py -3)
  $onPath = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $PyCmd = if ($PyExe -eq 'python' -or ($onPath -and $onPath.Source -eq $PyExe)) { 'python' } elseif ($PyPre.Count) { (@('py') + $PyPre) -join ' ' } else { "& '$PyExe'" }
  if (Test-Path -LiteralPath 'audio\song.wav') {
    Write-Host @"
   Next (from the project root; audio/song.wav is already there):
     $PyCmd tools/analyze_audio.py                 (beats, bars, sections -> analysis/audio.json + overview.png)
   then README.md section 3 (section 2 if it is the demo song). The demo smoke test needs a project without a song.
"@
  } else {
    Write-Host @"
   Next (from the project root):
     $PyCmd demo/make_demo_song.py                 (optional smoke test: synthesizes audio/song.wav)
     copy demo\lyrics_demo.lrc analysis\lyrics_mv.lrc
     copy demo\sections_demo.json analysis\sections.json      (optional: curated demo sections)
     $PyCmd tools/analyze_audio.py
     node tools/stills.mjs --times 1,3.5,8.4,10,12.5,13.6,18.4,19.5,21.2,23.3 --sheet smoke
     node tools/render_final.mjs --name demo        (add --codec x264 without an NVIDIA GPU)
   See README.md (PROJECT_README.md in the template) for the full workflow; section 2 adds the 9:16 version + review sheets.
"@
  }
} finally {
  Pop-Location
}
