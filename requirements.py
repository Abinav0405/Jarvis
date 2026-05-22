#!/usr/bin/env python3
"""
Install everything needed to run JARVIS from a GitHub clone (Windows).

Usage:
  python requirements.py

Requires: Python 3.8+ and Node.js 20 LTS (https://nodejs.org/)
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def resolve_cmd(name: str) -> str:
    """Resolve npm/node on Windows (.cmd shims need a full path for subprocess)."""
    found = shutil.which(name)
    if found:
        return found
    if sys.platform == "win32":
        for ext in (".cmd", ".exe", ".bat"):
            candidate = shutil.which(name + ext)
            if candidate:
                return candidate
    print(f"Could not find '{name}' on PATH.")
    print("Install Node.js 20 LTS from https://nodejs.org/ then reopen your terminal.")
    sys.exit(1)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    printable = " ".join(cmd)
    print(f"\n> {printable}")
    subprocess.check_call(cmd, cwd=str(cwd or ROOT), shell=False)


def require_node() -> tuple[str, str]:
    node = resolve_cmd("node")
    npm = resolve_cmd("npm")
    try:
        ver = subprocess.check_output([node, "-v"], text=True, cwd=str(ROOT)).strip()
        print(f"Found Node {ver}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Could not run node -v")
        sys.exit(1)
    return node, npm


def install_npm_deps(npm: str) -> None:
    lock = ROOT / "package-lock.json"
    if lock.exists():
        run([npm, "ci"])
    else:
        run([npm, "install"])


def main() -> int:
    print("JARVIS — dependency setup")
    print(f"Project folder: {ROOT}")
    _node, npm = require_node()
    install_npm_deps(npm)
    print("\nDone.")
    print("  Dev run:     npm run dev")
    print("  Build .exe:  npm run build")
    print("  Full guide:  important notes/SETUP-NEW-PC.txt")
    print("  Voice core:  important notes/VOICE-CORE.md")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as e:
        print(f"\nCommand failed (exit {e.returncode}). Fix the error above and retry.")
        raise SystemExit(e.returncode or 1)
