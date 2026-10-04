#!/usr/bin/env python3
"""Run a project Blender script headless with the Blender found on this machine.

  python tools/blender_run.py blender/shots/shotA_street.py -- --mode preview --res 50 --step 6
  python tools/blender_run.py blender/probe_scene.py -- --help        (the script's own options)
  python tools/blender_run.py --which                                  (print the Blender that would be used)

= <blender> -b --factory-startup -P <script> -- <args...>
Blender: env BLENDER, else `blender` on PATH, else the newest standard install
(Windows: %ProgramFiles%\\Blender Foundation\\Blender*\\blender.exe, macOS: /Applications/Blender.app, Linux: /opt,
/snap) - see tools/kit_env.py. Tested with Blender 5.1. The exit code is Blender's.
Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_env  # noqa: E402


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    extra = []
    if "--" in argv:                       # everything after '--' belongs to the Blender script
        i = argv.index("--")
        argv, extra = argv[:i], argv[i + 1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", help="Blender python script (relative to the project root or cwd)")
    ap.add_argument("--which", action="store_true", help="print the Blender executable and exit")
    ap.add_argument("--gui", action="store_true", help="open the Blender UI instead of running in background")
    ap.add_argument("--no-factory-startup", action="store_true", help="load the user's Blender preferences/add-ons")
    args = ap.parse_args(argv)
    try:
        blender = kit_env.find_blender()
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if args.which:
        print(blender)
        return 0
    if not args.script:
        ap.error("script is required (or --which)")
    script = kit_env.resolve(args.script)
    if not script.is_file():
        ap.error(f"script not found: {script}")
    cmd = [blender] + ([] if args.gui else ["-b"]) + ([] if args.no_factory_startup else ["--factory-startup"])
    cmd += ["-P", str(script), "--"] + extra
    print("+", " ".join(f'"{c}"' if " " in c else c for c in cmd), flush=True)
    return subprocess.call(cmd, cwd=str(kit_env.ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
