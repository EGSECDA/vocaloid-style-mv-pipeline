#!/usr/bin/env python3
"""check_env.py -- what is installed for the vocaloid-style-mv pipeline, marked REQUIRED vs OPTIONAL.

  python scripts/check_env.py                       machine check (run it before scaffolding a project)
  python tools/check_env.py                         inside a project (new_project.py copies this file to tools/)
  python check_env.py --project DIR --webgl         + project state and a headless-browser WebGL probe

Checks: Node.js + npm, Python + packages, ffmpeg / ffprobe (+ NVENC encoders, test-encoded), git, Edge / Chrome /
Playwright Chromium, NVIDIA GPU, Blender, Codex CLI, lyric-transcription packages; inside a project also
Playwright, fonts, the JIZURA clone + bundle, the song and the analysis files. --webgl launches the render browser
headless (as the tools do) and reports the WebGL2 renderer: a software renderer (SwiftShader / WARP / llvmpipe)
renders ~10x slower and should be fixed before a full render.

Exit code 0 when every REQUIRED item is present (missing OPTIONAL items only cost features), else 1.
Stdlib only. Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
from __future__ import annotations

import argparse
import glob
import importlib.metadata as md
import importlib.util
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
MIN_NODE, MIN_PY = 20, (3, 10)
JIZURA_PIN = "fc16bfe43ea4a6c25a21f1caf04d17326de14f00"   # the JIZURA commit setup fetches (tested); env JIZURA_REF overrides


# ---------------------------------------------------------------------------------------------- helpers
def run(cmd, timeout=30, cwd=None) -> tuple[int, str]:
    """(returncode, stdout+stderr) of a command; (-1, reason) when it cannot start."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, cwd=cwd)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except FileNotFoundError:
        return -1, "not found"
    except subprocess.TimeoutExpired:
        return -1, f"timed out after {timeout} s"
    except OSError as e:
        return -1, str(e)


def first_line(s: str) -> str:
    for ln in s.splitlines():
        if ln.strip():
            return ln.strip()
    return ""


def is_project(p: Path | None) -> bool:
    return bool(p) and (p / "engine" / "core" / "main.js").is_file() and (p / "tools").is_dir()


def load_kit_env(project: Path | None):
    """The project's (or the template's) tools/kit_env.py, for the Blender / Codex lookups -- None if absent."""
    for cand in ([project / "tools" / "kit_env.py"] if project else []) + [HERE / "kit_env.py",
                                                                           HERE.parent / "template" / "tools" / "kit_env.py"]:
        if cand.is_file():
            spec = importlib.util.spec_from_file_location("kit_env_check", cand)
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                return mod
            except Exception:  # noqa: BLE001 - a broken helper must not break the check
                return None
    return None


class Report:
    def __init__(self):
        self.rows: list[dict] = []

    def add(self, group, name, ok, detail="", hint="", level=None):
        self.rows.append(dict(group=group, name=name, ok=bool(ok), detail=detail, hint=hint,
                              level=level or group))

    def missing(self, group):
        return [r for r in self.rows if r["group"] == group and not r["ok"]]


# ---------------------------------------------------------------------------------------------- checks
def check_node(R: Report):
    node = shutil.which("node")
    rc, out = run([node, "--version"]) if node else (-1, "")
    ver = out.strip()
    m = re.match(r"v(\d+)", ver)
    good = rc == 0 and m and int(m.group(1)) >= MIN_NODE
    R.add("REQUIRED", "node", good, ver or "not found",
          "" if good else f"install Node.js {MIN_NODE}+ (https://nodejs.org)")
    npm = shutil.which("npm")
    rc, out = run([npm, "--version"]) if npm else (-1, "")
    R.add("REQUIRED", "npm", rc == 0, out.strip() or "not found", "" if rc == 0 else "comes with Node.js")


def check_python(R: Report):
    v = sys.version_info
    good = v[:2] >= MIN_PY
    R.add("REQUIRED", "python", good, f"{platform.python_version()}  ({sys.executable})",
          "" if good else "install Python 3.10+ (https://www.python.org)")
    core = [("librosa", "librosa"), ("numpy", "numpy"), ("scipy", "scipy"), ("soundfile", "soundfile"),
            ("pillow", "Pillow"), ("matplotlib", "matplotlib")]
    for label, dist in core:
        try:
            R.add("REQUIRED", f"py: {label}", True, md.version(dist))
        except md.PackageNotFoundError:
            R.add("REQUIRED", f"py: {label}", False, "missing", "python -m pip install -r requirements.txt")
    cv = next((d for d in ("opencv-python-headless", "opencv-python", "opencv-contrib-python") if _has_dist(d)), None)
    R.add("OPTIONAL", "py: opencv", bool(cv), f"{cv} {md.version(cv)}" if cv else "missing",
          "" if cv else "image utilities for asset work (in requirements.txt)")


def _has_dist(d):
    try:
        md.version(d)
        return True
    except md.PackageNotFoundError:
        return False


def check_lyrics_pkgs(R: Report, project: Path | None):
    for label, dist, why in [
        ("faster-whisper", "faster-whisper", "ASR + Silero VAD (only without official lyric timings)"),
        ("onnxruntime", "onnxruntime", "vocal stem separation (tools/transcribe_separate.py)"),
        ("huggingface_hub", "huggingface_hub", "separation model download"),
        ("pykakasi", "pykakasi", "kana readings for alignment"),
    ]:
        ok = _has_dist(dist)
        R.add("OPTIONAL", f"py: {label}", ok, md.version(dist) if ok else "missing",
              "" if ok else f"{why}: setup -Lyrics / --lyrics")
    deps = os.environ.get("TORCH_DEPS_DIR") or (str(project / "vendor" / "pydeps_torch") if project else "")
    torch_where = None
    if _has_dist("torch") and _has_dist("torchaudio"):
        torch_where = f"torch {md.version('torch')} (site-packages)"
    elif deps and glob.glob(os.path.join(deps, "torch-*.dist-info")) and glob.glob(os.path.join(deps, "torchaudio-*.dist-info")):
        torch_where = "torch + torchaudio in " + deps
    R.add("OPTIONAL", "py: torch/torchaudio", bool(torch_where), torch_where or "missing",
          "" if torch_where else "forced alignment only (tools/transcribe_align_mms.py; see requirements.txt)")


def check_ffmpeg(R: Report):
    ff = os.environ.get("FFMPEG") or "ffmpeg"
    fp = os.environ.get("FFPROBE") or "ffprobe"
    exe = shutil.which(ff)
    rc, out = run([exe, "-hide_banner", "-version"]) if exe else (-1, "")
    R.add("REQUIRED", "ffmpeg", rc == 0, first_line(out)[:70] if rc == 0 else "not found",
          "" if rc == 0 else "install ffmpeg and put it on PATH (or set FFMPEG): https://ffmpeg.org")
    pexe = shutil.which(fp)
    rc2, out2 = run([pexe, "-hide_banner", "-version"]) if pexe else (-1, "")
    R.add("REQUIRED", "ffprobe", rc2 == 0, first_line(out2)[:70] if rc2 == 0 else "not found",
          "" if rc2 == 0 else "ships with ffmpeg (or set FFPROBE)")
    if rc != 0:
        return
    _, enc = run([exe, "-hide_banner", "-encoders"])
    nv = sorted(set(re.findall(r"\b(\w+_nvenc)\b", enc)))
    x264 = "libx264" in enc
    R.add("OPTIONAL", "ffmpeg libx264", x264, "available" if x264 else "missing",
          "" if x264 else "needed for --codec x264 and the share encode")
    if not nv:
        R.add("OPTIONAL", "NVENC encode", False, "no *_nvenc encoders in this ffmpeg build",
              "render with: node tools/render_final.mjs --codec x264 (slower)")
        return
    rc3, out3 = run([exe, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2",
                     "-c:v", "h264_nvenc", "-f", "null", "-"], timeout=60)
    R.add("OPTIONAL", "NVENC encode", rc3 == 0, ("test encode ok: " if rc3 == 0 else "listed but failed: ") + " ".join(nv),
          "" if rc3 == 0 else f"{first_line(out3)[:80]} -> use --codec x264")


def check_git(R: Report, project: Path | None):
    git = shutil.which("git")
    rc, out = run([git, "--version"]) if git else (-1, "")
    jz_present = bool(project) and ((project / "vendor" / "JIZURA" / "src").is_dir() or bool(os.environ.get("JIZURA_DIR")))
    R.add("REQUIRED" if not jz_present else "OPTIONAL", "git", rc == 0, out.strip() or "not found",
          "" if rc == 0 else "setup clones JIZURA with git (https://git-scm.com)")


def _win_app_version(exe: str) -> str:
    """Edge / Chrome keep their version as a sibling folder name (Application/<1.2.3.4>/)."""
    vers = [d.name for d in Path(exe).parent.iterdir() if d.is_dir() and re.fullmatch(r"\d+(\.\d+){3}", d.name)]
    return max(vers, key=lambda s: tuple(int(x) for x in s.split("."))) if vers else ""


def find_browsers() -> dict:
    found = {}
    if IS_WIN:
        pf = [os.environ.get(k) for k in ("ProgramFiles(x86)", "ProgramFiles", "ProgramW6432", "LOCALAPPDATA")]
        cands = {"msedge": [os.path.join(p, "Microsoft", "Edge", "Application", "msedge.exe") for p in pf if p],
                 "chrome": [os.path.join(p, "Google", "Chrome", "Application", "chrome.exe") for p in pf if p]}
    elif IS_MAC:
        cands = {"msedge": ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
                 "chrome": ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]}
    else:
        cands = {"msedge": ["/opt/microsoft/msedge/msedge", shutil.which("microsoft-edge-stable") or ""],
                 "chrome": ["/opt/google/chrome/chrome", shutil.which("google-chrome-stable") or ""]}
    for ch, paths in cands.items():
        for p in paths:
            if p and os.path.isfile(p):
                if IS_WIN:
                    ver = _win_app_version(p)
                else:
                    ver = first_line(run([p, "--version"], timeout=20)[1])
                found[ch] = (p, ver)
                break
    # Playwright's own Chromium (npx playwright install chromium)
    base = os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or (
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright") if IS_WIN else
        os.path.expanduser("~/Library/Caches/ms-playwright") if IS_MAC else os.path.expanduser("~/.cache/ms-playwright"))
    pw = sorted(glob.glob(os.path.join(base, "chromium-*"))) if base else []
    if pw:
        found["chromium"] = (pw[-1], os.path.basename(pw[-1]))
    return found


def check_browser(R: Report):
    channel = os.environ.get("BROWSER_CHANNEL") or ("msedge" if IS_WIN else "chrome")
    found = find_browsers()
    names = {"msedge": "Microsoft Edge", "chrome": "Google Chrome", "chromium": "Playwright Chromium"}
    usable = channel in found or "chromium" in found
    detail = "; ".join(f"{names[k]} {v[1]}" for k, v in found.items()) or "none found"
    hint = ""
    if not usable:
        alt = [k for k in found if k != channel]
        hint = (f"channel '{channel}' missing: set BROWSER_CHANNEL={alt[0]}" if alt else
                "install Edge or Chrome, or run: npx playwright install chromium")
    R.add("REQUIRED", f"browser ({channel})", usable, detail, hint)


def check_gpu(R: Report):
    smi = shutil.which("nvidia-smi")
    if not smi and IS_WIN:
        p = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvidia-smi.exe")
        smi = p if os.path.isfile(p) else None
    rc, out = run([smi, "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"]) if smi else (-1, "")
    if rc == 0 and out.strip():
        R.add("OPTIONAL", "NVIDIA GPU", True, "; ".join(x.strip() for x in out.strip().splitlines()))
    else:
        R.add("OPTIONAL", "NVIDIA GPU", False, "not detected",
              "WebGL still uses any GPU; without NVENC render with --codec x264" if not IS_MAC else
              "Apple GPU: WebGL via Metal works; encode with --codec x264")


def check_blender(R: Report, kit, quick: bool):
    exe = None
    try:
        exe = kit.find_blender(required=False) if kit else (os.environ.get("BLENDER") or shutil.which("blender"))
    except Exception:  # noqa: BLE001
        exe = None
    if not exe:
        R.add("OPTIONAL", "Blender", False, "not found", "toon-3D shots only (else do them as 2.5D); set BLENDER")
        return
    ver = ""
    if not quick:
        rc, out = run([exe, "--version"], timeout=90)
        ver = first_line(out) if rc == 0 else ""
    if not ver:
        m = re.search(r"Blender[ _-]?(\d+\.\d+)", exe)
        ver = f"Blender {m.group(1)} (from path)" if m else "version not checked"
    R.add("OPTIONAL", "Blender", True, f"{ver}  ({exe})")


def check_codex(R: Report, kit, quick: bool):
    exe = None
    try:
        exe = kit.find_codex(required=False) if kit else (os.environ.get("CODEX_BIN") or shutil.which("codex"))
    except Exception:  # noqa: BLE001
        exe = None
    if not exe:
        R.add("OPTIONAL", "Codex CLI", False, "not found",
              "tools/imagegen.py drives it for image generation; any image model works by hand; set CODEX_BIN")
        return
    ver = "" if quick else first_line(run([exe, "--version"], timeout=30)[1])
    R.add("OPTIONAL", "Codex CLI", True, f"{ver or 'found'}  ({exe})")


# ---------------------------------------------------------------------------------------------- project state
def check_project(R: Report, project: Path):
    g = "PROJECT"
    pw = project / "node_modules" / "playwright" / "package.json"
    if pw.is_file():
        R.add(g, "playwright", True, json.loads(pw.read_text(encoding="utf-8")).get("version", "?"))
    else:
        R.add(g, "playwright", False, "node_modules missing", "npm install (setup does it)")
    fonts = project / "engine" / "fonts"
    man = fonts / "manifest.json"
    if man.is_file():
        lst = json.loads(man.read_text(encoding="utf-8"))
        have = [e for e in lst if (fonts / e["file"]).is_file() and (fonts / e["file"]).stat().st_size == e["size"]]
        R.add(g, "fonts", len(have) == len(lst), f"{len(have)}/{len(lst)} files of engine/fonts/manifest.json",
              "" if len(have) == len(lst) else "python tools/fetch_fonts.py (setup does it)")
    else:
        R.add(g, "fonts", False, "engine/fonts/manifest.json missing", "python tools/fetch_fonts.py")
    env_jz = os.environ.get("JIZURA_DIR")
    jz = (project / env_jz).resolve() if env_jz else project / "vendor" / "JIZURA"
    if (jz / "src").is_dir():
        head = ""
        try:
            head = (jz / ".git" / "HEAD").read_text().strip()
            if head.startswith("ref:"):
                head = (jz / ".git" / head[5:].strip()).read_text().strip()
        except OSError:
            pass
        R.add(g, "JIZURA clone", True, f"{jz}" + (f" @{head[:10]}" if head else ""),
              "" if head.startswith(JIZURA_PIN) else f"the kit is tested with JIZURA {JIZURA_PIN[:7]} (what setup fetches "
                                                      "unless JIZURA_REF is set): check the stills after a change")
    else:
        R.add(g, "JIZURA clone", False, f"{jz} missing",
              "run setup (fetches the tested JIZURA commit; env JIZURA_REF overrides), or: npm run jizura:clone")
    b = project / "jizura" / "app" / "jizura_engine.js"
    R.add(g, "JIZURA bundle", b.is_file(), f"jizura/app/jizura_engine.js ({b.stat().st_size / 1e6:.1f} MB)" if b.is_file()
          else "missing", "" if b.is_file() else "node tools/build_jizura_bundle.mjs")
    song = project / "audio" / "song.wav"
    if song.is_file():
        detail = "audio/song.wav"
        try:
            import soundfile as sf  # noqa: PLC0415 - optional here
            i = sf.info(str(song))
            detail += f" ({i.duration:.1f} s, {i.samplerate} Hz, {i.channels} ch)"
        except Exception:  # noqa: BLE001
            pass
        R.add(g, "song", True, detail)
    else:
        R.add(g, "song", False, "audio/song.wav missing", "copy your song there, or: python demo/make_demo_song.py")
    for rel, hint in [("analysis/audio.json", "python tools/analyze_audio.py"),
                      ("analysis/lyrics_mv.lrc", "official lyrics + timings (references/03); demo: copy demo/lyrics_demo.lrc")]:
        R.add(g, rel.split("/")[-1], (project / rel).is_file(), rel if (project / rel).is_file() else f"{rel} missing",
              "" if (project / rel).is_file() else hint)


WEBGL_JS = r"""
import { launchBrowser, gpuArgs, browserChannel } from './tools/kit_env.mjs';
const b = await launchBrowser({ headless: true, args: [...gpuArgs(), '--enable-gpu-rasterization'] });
try {
  const p = await b.newPage();
  const r = await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl2: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  console.log('@@' + JSON.stringify({ channel: browserChannel(), version: b.version(), ...r }));
} finally { await b.close(); }
"""


def check_webgl(R: Report, project: Path):
    if not (project / "node_modules" / "playwright").is_dir() or not (project / "tools" / "kit_env.mjs").is_file():
        R.add("OPTIONAL", "WebGL2 (GPU)", False, "not probed", "needs npm install in the project first")
        return
    rc, out = run([shutil.which("node") or "node", "--input-type=module", "-e", WEBGL_JS], timeout=120, cwd=str(project))
    m = re.search(r"@@(\{.*\})", out)
    if rc != 0 or not m:
        err = next((ln.strip() for ln in out.splitlines() if "rror" in ln), first_line(out))
        R.add("REQUIRED", "WebGL2 (render browser)", False, "browser launch failed", err[:160])
        return
    info = json.loads(m.group(1))
    if not info.get("webgl2"):
        R.add("REQUIRED", "WebGL2 (render browser)", False, f"{info.get('channel')} {info.get('version')}: no WebGL2",
              "update the browser / GPU driver; try BROWSER_ANGLE=gl or BROWSER_CHANNEL=chrome")
        return
    rend = info.get("renderer", "")
    soft = bool(re.search(r"swiftshader|llvmpipe|softpipe|basic render|warp", rend, re.I))
    R.add("REQUIRED", "WebGL2 (render browser)", True, f"{info.get('channel')} {info.get('version')}")
    R.add("OPTIONAL", "WebGL on the GPU", not soft, rend[:110],
          "software rendering (~10x slower): update GPU drivers, try BROWSER_ANGLE=d3d11|gl|vulkan" if soft else "")


# ---------------------------------------------------------------------------------------------- main
COSTS = {
    "NVIDIA GPU": "no NVENC: renders encode with x264 (slower)",
    "NVENC encode": "use node tools/render_final.mjs --codec x264",
    "Blender": "the 3D moments become 2.5D engine shots",
    "Codex CLI": "generate the illustrations with another image tool (same chroma-key method)",
    "py: faster-whisper": "needed only when no official lyric timings exist",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", help="project root (default: auto-detect from this file / the current directory)")
    ap.add_argument("--webgl", action="store_true", help="launch the render browser headless and report the WebGL2 renderer")
    ap.add_argument("--quick", action="store_true", help="do not start Blender / Codex to read their versions")
    ap.add_argument("--json", action="store_true", help="print the report as JSON")
    for _s in (sys.stdout, sys.stderr):  # paths / versions may hold non-ASCII; never crash on a cp1252 / cp932 console
        try:
            _s.reconfigure(errors="replace")
        except Exception:  # noqa: BLE001
            pass
    args = ap.parse_args()

    project = Path(args.project).resolve() if args.project else next(
        (p for p in (HERE.parent, Path.cwd()) if is_project(p)), None)
    if project and not is_project(project):
        print(f"warning: {project} does not look like a vocaloid-style-mv project (no engine/core/main.js)", file=sys.stderr)
    kit = load_kit_env(project if project and is_project(project) else None)

    R = Report()
    check_node(R)
    check_python(R)
    check_ffmpeg(R)
    check_git(R, project if project and is_project(project) else None)
    check_browser(R)
    check_gpu(R)
    check_blender(R, kit, args.quick)
    check_codex(R, kit, args.quick)
    check_lyrics_pkgs(R, project)
    if project and is_project(project):
        check_project(R, project)
        if args.webgl:
            check_webgl(R, project)
    elif args.webgl:
        R.add("OPTIONAL", "WebGL2 (GPU)", False, "not probed", "run with --project <project dir> after setup")

    req_missing = R.missing("REQUIRED")
    if args.json:
        print(json.dumps({"project": str(project) if project else None, "os": platform.platform(),
                          "required_ok": not req_missing, "rows": R.rows}, ensure_ascii=False, indent=1))
        return 1 if req_missing else 0

    osname = f"{platform.system()} {platform.release()}"
    if IS_WIN and sys.getwindowsversion().build >= 22000:   # platform.release() still says '10' on Windows 11
        osname = f"Windows 11 (build {sys.getwindowsversion().build})"
    print(f"vocaloid-style-mv-pipeline environment check  ({osname}, {platform.machine()})")
    for group in ("REQUIRED", "OPTIONAL", "PROJECT"):
        rows = [r for r in R.rows if r["group"] == group]
        if not rows:
            continue
        title = group if group != "PROJECT" else f"PROJECT  {project}"
        print(f"\n{title}")
        for r in rows:
            mark = "ok" if r["ok"] else ("!!" if group == "REQUIRED" else "--")
            print(f"  [{mark}] {r['name']:<24} {r['detail']}")
            if r["hint"] and not r["ok"]:
                print(f"  {'':4} {'':<24} -> {r['hint']}")
            elif r["hint"]:
                print(f"  {'':4} {'':<24} note: {r['hint']}")
    opt_missing = R.missing("OPTIONAL")
    todo = R.missing("PROJECT")
    print()
    if req_missing:
        print("RESULT: missing REQUIRED: " + ", ".join(r["name"] for r in req_missing))
    else:
        print("RESULT: all REQUIRED items present.")
    if opt_missing:
        print("optional missing: " + "; ".join(
            f"{r['name']} ({COSTS[r['name']]})" if r["name"] in COSTS else r["name"] for r in opt_missing))
    if todo:
        print("project to-do: " + "; ".join(f"{r['name']}: {r['hint']}" for r in todo))
    if not project:
        np_rel = "<skill>/scripts/new_project.py"   # a project's tools/check_env.py has no new_project.py next to it
        if (HERE / "new_project.py").is_file():
            try:
                np_rel = os.path.relpath(HERE / "new_project.py")
            except ValueError:  # other drive on Windows
                np_rel = str(HERE / "new_project.py")
        print(f"(no project here: scaffold one with  python {np_rel} <dir> --setup)")
    return 1 if req_missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
