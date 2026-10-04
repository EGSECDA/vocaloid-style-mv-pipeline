#!/usr/bin/env python3
"""Batch image generation through the local Codex CLI (native image_gen tool).

Why not a generic "codex exec" batch wrapper: the workers cannot see the path of the
image they generate (and PowerShell writes result.json with a BOM), so most jobs "fail"
even though the image exists. Codex always saves generated images under
$CODEX_HOME/generated_images/<thread_id>/ig_*.png (CODEX_HOME defaults to ~/.codex), and
`codex exec --json` prints the thread_id, so we collect the image from there instead.

Codex executable: env CODEX_BIN, else `codex` on PATH, else %LOCALAPPDATA%\\OpenAI\\Codex\\bin\\codex.exe
(see tools/kit_env.py). Each job runs `codex exec` with the project root as working directory.

Jobs file: JSON list or JSONL of
  {"id": "...", "prompt": "...", "out": "relative/or/abs.png",
   "transparent": false,            # key the result to RGBA (the prompt gets a flat chroma-key background)
   "key": "#00FF00",                # chroma colour for transparent jobs: "#FF00FF" (magenta) when the design has
                                    # teal / aqua / mint / green, "#0000FF" only if nothing is blue
   "images": ["ref1.png", ...],     # optional reference images attached with -i
   "trim": true}                    # trim transparent result to content bbox + margin

Usage:
  python tools/imagegen.py assets/char/jobs.jsonl --out-dir assets/char --concurrency 8
  python tools/imagegen.py assets/char/jobs.jsonl --out-dir assets/char --only id1,id2 --force
Relative paths are taken from the current directory if they exist there, else from the project root.

Author: NikusonP -- vocaloid-style-mv-pipeline, MIT licence.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import kit_env  # noqa: E402

ROOT = kit_env.ROOT
CODEX: str | None = None    # resolved in main() (kit_env.find_codex), so --help works without Codex installed
GEN_DIR = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser() / "generated_images"

KEY_NAMES = {"#00FF00": "green", "#FF00FF": "magenta", "#0000FF": "blue"}


def job_key(job: dict) -> str:
    """The job's chroma colour as '#RRGGBB' ("key": "#FF00FF" or "magenta"; default green)."""
    key = str(job.get("key") or "#00FF00").strip()
    key = {v: k for k, v in KEY_NAMES.items()}.get(key.lower(), key).upper()
    if len(key) != 7 or key[0] != "#" or any(c not in "0123456789ABCDEF" for c in key[1:]):
        raise ValueError(f"job {job.get('id')}: key {job.get('key')!r} is not #RRGGBB / green / magenta / blue")
    return key


def key_suffix(key: str) -> str:
    # the matte (tools/alpha_matte.py) reads the key from the image border, so only the prompt depends on it
    name = KEY_NAMES.get(key)
    label, avoid = (f"{name} ({key})", name) if name else (key, f"{key}-like colour")
    return (f" Background: a perfectly flat, uniform pure chroma-key {label} filling the whole background, "
            f"no gradient, no floor, no cast shadow, no {avoid} anywhere on the subject. "
            "Leave generous margin around the subject; nothing touches the image edges.")

lock = threading.Lock()


def log(msg: str) -> None:
    with lock:
        print(msg, flush=True)


def load_jobs(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig").strip()
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def worker_prompt(job: dict) -> str:
    prompt = job["prompt"].strip()
    if job.get("transparent"):
        key = job_key(job)
        if key not in prompt.upper():
            prompt += key_suffix(key)
    ref = ""
    if job.get("images"):
        ref = (
            "The attached image(s) are visual references: keep the same character design, "
            "face, hair, outfit, colors and drawing style exactly, unless the prompt says otherwise. "
        )
    return (
        "Use the native image generation tool exactly once to create this image. "
        "Do not run shell commands, do not write files, do not ask questions. "
        "After the image is generated, reply with the single word DONE.\n\n"
        f"{ref}Image prompt:\n{prompt}"
    )


def find_thread_id(stdout_text: str) -> str | None:
    for line in stdout_text.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        for key in ("thread_id", "session_id", "conversation_id"):
            if isinstance(ev.get(key), str):
                return ev[key]
        msg = ev.get("msg") if isinstance(ev.get("msg"), dict) else {}
        for key in ("thread_id", "session_id"):
            if isinstance(msg.get(key), str):
                return msg[key]
    return None


def newest_image(folder: Path, since: float) -> Path | None:
    if not folder.is_dir():
        return None
    pngs = [p for p in folder.glob("*.png") if p.stat().st_mtime >= since - 5]
    return max(pngs, key=lambda p: p.stat().st_mtime) if pngs else None


def run_job(job: dict, out_dir: Path, logs_dir: Path, timeout: float, effort: str) -> dict:
    jid = job["id"]
    out = Path(job["out"])
    if not out.is_absolute():
        out = out_dir / out
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        CODEX, "exec", "--json", "--skip-git-repo-check", "--ephemeral",
        "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
        "--color", "never", "-C", str(ROOT),
        "-c", 'approval_policy="never"',
        "-c", f'model_reasoning_effort="{effort}"',
    ]
    for img in job.get("images") or []:
        p = Path(img)
        if not p.is_absolute():
            p = ROOT / p
        cmd += ["-i", str(p)]
    cmd.append("-")  # prompt via stdin: `-i <FILE>...` is greedy and would swallow a positional prompt
    started = time.time()
    before = {p.name for p in GEN_DIR.iterdir()} if GEN_DIR.is_dir() else set()
    try:
        proc = subprocess.run(cmd, input=worker_prompt(job), capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout)
        stdout, stderr, code = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired as e:
        stdout = e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        stderr, code = "TIMEOUT", -1
    (logs_dir / f"{jid}.stdout.jsonl").write_text(stdout or "", encoding="utf-8")
    (logs_dir / f"{jid}.stderr.log").write_text((stderr or "")[-20000:], encoding="utf-8")
    tid = find_thread_id(stdout or "")
    src = newest_image(GEN_DIR / tid, started) if tid else None
    if src is None:
        # fallback: any new generated_images subfolder created during this run with a fresh png
        for d in (GEN_DIR.iterdir() if GEN_DIR.is_dir() else []):
            if d.name not in before and d.is_dir():
                cand = newest_image(d, started)
                if cand is not None:
                    src = cand
                    break
    elapsed = round(time.time() - started, 1)
    if src is None:
        return {"id": jid, "status": "failed", "elapsed": elapsed, "code": code, "thread": tid,
                "error": (stderr or "")[-400:]}
    raw = out.with_name(out.stem + ".raw.png") if job.get("transparent") else out
    shutil.copyfile(src, raw)
    result = {"id": jid, "status": "complete", "elapsed": elapsed, "thread": tid,
              "source": str(src), "out": str(out)}
    if job.get("transparent"):
        result.update(postprocess_alpha(raw, out, trim=job.get("trim", True)))
    return result


def postprocess_alpha(raw: Path, out: Path, trim: bool) -> dict:
    from PIL import Image
    import alpha_matte as am

    src = Image.open(raw)
    rep = am.alpha_report(src)
    if rep.get("transparent_pct", 0) < 5:
        img, _ = am.key_out(src.convert("RGB"))
        method = "chroma-key"
    else:
        img, _ = am.normalize_alpha(src.convert("RGBA"))
        method = "native-alpha"
    if trim:
        img, _ = am.trim_to_content(img, margin=16)
    img.save(out)
    rep2 = am.alpha_report(img)
    return {"alpha_method": method, "size": list(img.size),
            "transparent_pct": rep2.get("transparent_pct"), "opaque_pct": rep2.get("opaque_pct")}


def main() -> int:
    global CODEX
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("jobs", type=Path, help="jobs file (.json list or .jsonl)")
    ap.add_argument("--out-dir", type=Path, default=ROOT / "assets",
                    help="base dir for relative job 'out' paths + manifest.json + _logs/ (default: <ROOT>/assets)")
    ap.add_argument("--concurrency", type=int, default=8, help="parallel codex workers (default 8)")
    ap.add_argument("--timeout", type=float, default=600, help="seconds per job (default 600)")
    ap.add_argument("--effort", default="low", help="codex model_reasoning_effort (default low)")
    ap.add_argument("--attempts", type=int, default=2, help="rounds over failed jobs (default 2)")
    ap.add_argument("--only", default="", help="comma-separated job ids")
    ap.add_argument("--force", action="store_true", help="regenerate even if output exists")
    args = ap.parse_args()

    try:
        CODEX = kit_env.find_codex()
    except FileNotFoundError as e:
        log(f"error: {e}")
        return 2
    jobs = load_jobs(kit_env.resolve(args.jobs))
    if args.only:
        keep = set(args.only.split(","))
        jobs = [j for j in jobs if j["id"] in keep]
    try:
        for j in jobs:
            if j.get("transparent"):
                job_key(j)
    except ValueError as e:
        log(f"error: {e}")
        return 2
    out_dir = kit_env.resolve(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    logs_dir = out_dir / "_logs"
    logs_dir.mkdir(exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}

    def target(j: dict) -> Path:
        p = Path(j["out"])
        return p if p.is_absolute() else out_dir / p

    todo = [j for j in jobs if args.force or not target(j).exists()]
    log(f"{len(todo)} of {len(jobs)} jobs to run (concurrency {args.concurrency})")
    pending = {j["id"]: j for j in todo}
    for attempt in range(1, args.attempts + 1):
        if not pending:
            break
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futs = {pool.submit(run_job, j, out_dir, logs_dir, args.timeout, args.effort): jid
                    for jid, j in pending.items()}
            for fut in as_completed(futs):
                jid = futs[fut]
                try:
                    res = fut.result()
                except Exception as e:  # noqa: BLE001
                    res = {"id": jid, "status": "failed", "error": repr(e)}
                res["attempt"] = attempt
                res["prompt"] = pending[jid]["prompt"]
                manifest[jid] = res
                manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
                log(f"[{res['status']:>8}] {jid} ({res.get('elapsed')}s) {res.get('alpha_method', '')} {res.get('error', '')[:160] if res['status'] != 'complete' else ''}")
        pending = {jid: j for jid, j in pending.items() if manifest.get(jid, {}).get("status") != "complete"}
    failed = [jid for jid in (j["id"] for j in jobs) if manifest.get(jid, {}).get("status") != "complete"]
    log(f"done: {len(jobs) - len(failed)} complete, {len(failed)} failed {failed if failed else ''}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
