#!/usr/bin/env python3
r"""kit_env.py -- portable environment shared by the Python tools and the Blender scripts of a vocaloid-style-mv project.

Nothing in tools/ or blender/ hard-codes a machine path; everything is derived from here (stdlib only, so it also
imports inside Blender's bundled Python):

  ROOT                    project root = the parent of tools/ (from this file's location)
  SONG                    <ROOT>/audio/song.wav  (default input of the audio tools; each has --audio)
  ANALYSIS, ASR, STEMS    <ROOT>/analysis, analysis/asr, analysis/stems
  PYTHON                  sys.executable (the interpreter running the tool)
  FFMPEG, FFPROBE         env FFMPEG / FFPROBE, default 'ffmpeg' / 'ffprobe' on PATH
  find_codex()            env CODEX_BIN, else 'codex' on PATH, else %LOCALAPPDATA%\OpenAI\Codex\bin\codex.exe (Windows)
                          or ~/.local/bin/codex, /usr/local/bin/codex, /opt/homebrew/bin/codex
  find_blender()          env BLENDER, else 'blender' on PATH, else the newest standard install:
                          Windows  %ProgramFiles%\Blender Foundation\Blender*\blender.exe (highest version wins)
                          macOS    /Applications/Blender*.app/Contents/MacOS/Blender
                          Linux    /opt/blender*/blender, ~/blender*/blender, /snap/bin/blender
  jizura_dir()            env JIZURA_DIR, default <ROOT>/vendor/JIZURA
  font_dirs(), find_font  env FONT_DIRS (os.pathsep-separated) first, then the system font folders, then engine/fonts
  add_nvidia_dll_dirs()   make pip-installed CUDA wheels (nvidia-cublas-cu12, cudnn) visible to ctranslate2 on Windows
  resolve(p)              user path -> absolute (absolute stays; existing relative-to-cwd wins; else relative to ROOT)

  python tools/kit_env.py        print the resolved environment (no side effects)

Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
from __future__ import annotations

import glob
import os
import re
import shutil
import sys
import unicodedata
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
ANALYSIS = ROOT / "analysis"
ASR = ANALYSIS / "asr"
STEMS = ANALYSIS / "stems"
SONG = ROOT / "audio" / "song.wav"
PYTHON = sys.executable
FFMPEG = os.environ.get("FFMPEG") or "ffmpeg"
FFPROBE = os.environ.get("FFPROBE") or "ffprobe"
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"


def resolve(p, base: Path | str = ROOT) -> Path:
    """User-supplied path -> absolute Path: absolute paths stay, a relative path that exists from the current
    directory wins, anything else is taken relative to the project root (so tools work from any cwd)."""
    p = Path(os.path.expanduser(str(p)))
    if p.is_absolute():
        return p
    if p.exists():
        return p.resolve()
    return (Path(base) / p).resolve()


def rel(p) -> str:
    """Path for logs / JSON: relative to ROOT with forward slashes when inside the project, else as is."""
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def _exe(value: str | None) -> str | None:
    """An existing executable file, or a command found on PATH."""
    if not value:
        return None
    p = Path(os.path.expandvars(os.path.expanduser(value)))
    if p.is_file():
        return str(p)
    return shutil.which(value)


# ------------------------------------------------------------------------------------------------ Codex CLI
def find_codex(required: bool = True) -> str | None:
    env = os.environ.get("CODEX_BIN")
    if env:
        exe = _exe(env)
        if exe or not required:
            return exe
        raise FileNotFoundError(f"CODEX_BIN={env!r} is not an executable file or command")
    exe = shutil.which("codex")
    if exe:
        return exe
    cands = []
    if IS_WIN:
        la = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
        cands.append(Path(la) / "OpenAI" / "Codex" / "bin" / "codex.exe")
    else:
        cands += [Path.home() / ".local" / "bin" / "codex", Path("/usr/local/bin/codex"), Path("/opt/homebrew/bin/codex")]
    for c in cands:
        if c.is_file():
            return str(c)
    if required:
        raise FileNotFoundError("Codex CLI not found: install it (https://github.com/openai/codex) or set CODEX_BIN "
                                "to the codex executable")
    return None


# ------------------------------------------------------------------------------------------------ Blender
def _version_key(path: str) -> tuple:
    """'.../Blender Foundation/Blender 5.1/blender.exe' -> (5, 1); unknown -> ()."""
    for part in reversed(Path(path).parts[:-1]):
        nums = re.findall(r"\d+", part)
        if "blender" in part.lower() and nums:
            return tuple(int(n) for n in nums)
    return ()


def blender_candidates() -> list[str]:
    """Standard Blender install locations on this OS, newest version first."""
    c: list[str] = []
    if IS_WIN:
        roots = [os.environ.get(k) for k in ("ProgramFiles", "ProgramW6432", "ProgramFiles(x86)")] + [r"C:\Program Files"]
        for r in dict.fromkeys(x for x in roots if x):
            c += glob.glob(os.path.join(r, "Blender Foundation", "Blender*", "blender.exe"))
            c += glob.glob(os.path.join(r, "Steam", "steamapps", "common", "Blender", "blender.exe"))
        la = os.environ.get("LOCALAPPDATA")
        if la:
            c += glob.glob(os.path.join(la, "Programs", "Blender Foundation", "Blender*", "blender.exe"))
    elif IS_MAC:
        for base in ("/Applications", os.path.expanduser("~/Applications")):
            c += glob.glob(os.path.join(base, "Blender*.app", "Contents", "MacOS", "Blender"))
    else:
        c += glob.glob("/opt/blender*/blender") + glob.glob(os.path.expanduser("~/blender*/blender"))
        c += ["/snap/bin/blender"]
    c = [x for x in dict.fromkeys(c) if os.path.isfile(x)]
    return sorted(c, key=_version_key, reverse=True)


def find_blender(required: bool = True) -> str | None:
    env = os.environ.get("BLENDER")
    if env:
        exe = _exe(env)
        if exe or not required:
            return exe
        raise FileNotFoundError(f"BLENDER={env!r} is not an executable file or command")
    exe = shutil.which("blender")
    if exe:
        return exe
    cands = blender_candidates()
    if cands:
        return cands[0]
    if required:
        raise FileNotFoundError("Blender not found: install Blender 4.2+ (5.1 tested) or set BLENDER to the blender "
                                "executable")
    return None


# ------------------------------------------------------------------------------------------------ JIZURA
def jizura_dir() -> Path:
    env = os.environ.get("JIZURA_DIR")   # (JIZURA_REF is the git ref setup fetches, not a folder)
    return (ROOT / env).resolve() if env else ROOT / "vendor" / "JIZURA"


# ------------------------------------------------------------------------------------------------ fonts
def font_dirs() -> list[str]:
    dirs = [d for d in os.environ.get("FONT_DIRS", "").split(os.pathsep) if d]
    if IS_WIN:
        dirs.append(os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts"))
        la = os.environ.get("LOCALAPPDATA")
        if la:
            dirs.append(os.path.join(la, "Microsoft", "Windows", "Fonts"))
    elif IS_MAC:
        dirs += ["/System/Library/Fonts", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
    else:
        dirs += ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts"),
                 os.path.expanduser("~/.fonts")]
    dirs.append(str(ROOT / "engine" / "fonts"))
    return [d for d in dict.fromkeys(dirs) if os.path.isdir(d)]


_FONT_INDEX: dict[str, str] | None = None


def _fkey(name: str) -> str:
    return unicodedata.normalize("NFC", name).casefold()   # macOS stores file names decomposed (NFD)


def font_index() -> dict[str, str]:
    """{normalised file name: path} for every font file under font_dirs() (first directory wins)."""
    global _FONT_INDEX
    if _FONT_INDEX is None:
        idx: dict[str, str] = {}
        for d in font_dirs():
            for dp, _, files in os.walk(d):
                for f in files:
                    if f.lower().endswith((".ttf", ".otf", ".ttc", ".otc")):
                        idx.setdefault(_fkey(f), os.path.join(dp, f))
        _FONT_INDEX = idx
    return _FONT_INDEX


def find_font(names) -> str | None:
    """First existing font among `names` (bare file names searched in font_dirs(), or explicit paths)."""
    if isinstance(names, (str, os.PathLike)):
        names = [names]
    for n in names:
        n = str(n)
        if os.path.isabs(n) or "/" in n or "\\" in n:
            if os.path.isfile(n):
                return n
            continue
        hit = font_index().get(_fkey(n))
        if hit:
            return hit
    return None


# ------------------------------------------------------------------------------------------------ CUDA wheels
def add_nvidia_dll_dirs() -> list[str]:
    """pip CUDA wheels (nvidia-cublas-cu12, nvidia-cudnn-cu12) keep their DLLs in site-packages/nvidia/*/bin.
    Make them visible before faster_whisper / ctranslate2 is imported (Windows; harmless elsewhere)."""
    import site
    bases: list[str] = []
    try:
        bases += site.getsitepackages()
    except Exception:  # noqa: BLE001  (virtualenvs without getsitepackages)
        pass
    try:
        bases.append(site.getusersitepackages())
    except Exception:  # noqa: BLE001
        pass
    bases += [p for p in sys.path if p.rstrip("/\\").endswith("site-packages")]
    added = []
    for base in dict.fromkeys(bases):
        for b in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(b)
                except OSError:
                    pass
            os.environ["PATH"] = b + os.pathsep + os.environ.get("PATH", "")
            added.append(b)
    return added


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description="Print the environment the Python tools resolve (no side effects). "
                                             "Env vars: CODEX_BIN, BLENDER, JIZURA_DIR, FONT_DIRS, FFMPEG, FFPROBE.")
    ap.parse_args()

    def safe(fn):
        try:
            return fn() or "NOT FOUND"
        except Exception as e:  # noqa: BLE001
            return f"NOT FOUND ({e})"

    jz = jizura_dir()
    rows = {
        "ROOT": ROOT, "SONG": f"{SONG}{'' if SONG.exists() else '   (missing)'}", "PYTHON": PYTHON,
        "FFMPEG": shutil.which(FFMPEG) or f"{FFMPEG} (NOT FOUND)", "FFPROBE": shutil.which(FFPROBE) or f"{FFPROBE} (NOT FOUND)",
        "CODEX_BIN": safe(find_codex), "BLENDER": safe(find_blender),
        "JIZURA_DIR": f"{jz}{'' if jz.is_dir() else '   (missing: run setup, or npm run jizura:clone)'}",
        "FONT_DIRS": os.pathsep.join(font_dirs()),
    }
    for k, v in rows.items():
        print(f"{k:12s} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
