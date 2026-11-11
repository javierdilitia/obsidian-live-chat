"""The single definition of every repo check. Git hooks and CI both call this file.

Usage, from the repo root:  python scripts/check.py <name> [<name> ...]
Runs each command in order and stops at the first failure, returning its exit code.
Standard library only, so it runs before any environment is set up.
"""

import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_UV = ["uv", "run", "--directory", "backend"]


def _web(script: str) -> list[str]:
    return ["pnpm", "--dir", "web", script]


BACKEND_TYPES = [[*_UV, "pyright"]]
BACKEND_TESTS = [[*_UV, "pytest", "-q"]]
WEB_TYPES = [_web("typecheck")]
WEB_TESTS = [_web("test")]

CHECKS: dict[str, list[list[str]]] = {
    "backend": [
        [*_UV, "ruff", "format", "--check", ".."],
        [*_UV, "ruff", "check", ".."],
        *BACKEND_TYPES,
        *BACKEND_TESTS,
        ["uv", "build", "--directory", "backend", "--all-packages"],
    ],
    "web": [
        _web("format:check"),
        _web("lint"),
        *WEB_TYPES,
        *WEB_TESTS,
        _web("build"),
    ],
    "backend-types": BACKEND_TYPES,
    "backend-tests": BACKEND_TESTS,
    "web-types": WEB_TYPES,
    "web-tests": WEB_TESTS,
    "web-fix": [
        ["pnpm", "--dir", "web", "exec", "prettier", "--write", "."],
        ["pnpm", "--dir", "web", "exec", "eslint", "--fix", "."],
    ],
}
CHECKS["all"] = CHECKS["backend"] + CHECKS["web"]


def resolve(argv: list[str]) -> list[str]:
    """Swap argv[0] for its full path, so Windows `.cmd` shims such as pnpm.cmd are found."""
    exe = shutil.which(argv[0])
    if exe is None:
        print(f"{argv[0]} not found on PATH", file=sys.stderr)
        raise SystemExit(127)
    return [exe, *argv[1:]]


def main(argv: list[str]) -> int:
    unknown = [name for name in argv if name not in CHECKS]
    if not argv or unknown:
        if unknown:
            print(f"unknown check: {', '.join(unknown)}")
        print(f"usage: python scripts/check.py <name>...  (names: {', '.join(CHECKS)})")
        return 2
    for name in argv:
        for command in CHECKS[name]:
            print(f"==> {shlex.join(command)}", flush=True)
            code = subprocess.call(resolve(command))
            if code != 0:
                return code
    return 0


if __name__ == "__main__":
    os.chdir(ROOT)
    sys.exit(main(sys.argv[1:]))
