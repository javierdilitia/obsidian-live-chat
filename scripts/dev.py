"""Start the agent and the web app together, for local development.

Usage, from the repo root:  python scripts/dev.py
Runs the agent (uvicorn with reload, http://127.0.0.1:8000) and the web dev server
(Vite, http://localhost:5173) side by side in this terminal. Ctrl+C stops both; if one
of them exits, the other is stopped too. When OBSIDIAN_DATABASE_URL is set (environment or
.env), Postgres from compose.yaml is started first. Standard library only.
"""

import os
import shutil
import signal
import subprocess
import sys
import time

from check import ROOT, resolve

SERVICES: dict[str, list[str]] = {
    "agent": [
        *["uv", "run", "--directory", "backend"],
        *["uvicorn", "obsidian_agent.app:create_app", "--factory", "--reload"],
    ],
    "web": ["pnpm", "--dir", "web", "dev"],
}


DATABASE_SETTING = "OBSIDIAN_DATABASE_URL"
POSTGRES_UP = ["docker", "compose", "up", "-d", "--wait", "postgres"]


def database_url() -> str:
    """`OBSIDIAN_DATABASE_URL` from the environment, else from the repo's `.env`; blank if unset."""
    value = os.environ.get(DATABASE_SETTING, "")
    env_file = ROOT / ".env"
    if not value and env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, _, rest = line.partition("=")
            if name.strip() == DATABASE_SETTING:
                value = rest.split(" #")[0].strip().strip("'\"")
    return value.strip()


def start_postgres() -> int:
    """Starts Postgres and waits until it is healthy. Non-zero when that fails."""
    if shutil.which("docker") is None:
        print(
            f"dev: {DATABASE_SETTING} is set, but Docker is not on PATH. Install and start Docker, "
            f"or leave {DATABASE_SETTING} empty to keep everything in memory.",
            file=sys.stderr,
        )
        return 127
    print("dev: starting Postgres (docker compose up -d --wait postgres)", flush=True)
    return subprocess.run(resolve(POSTGRES_UP), cwd=ROOT).returncode


def start(argv: list[str]) -> subprocess.Popen[bytes]:
    """Start a service in its own process group, so Ctrl+C reaches only this script."""
    if sys.platform == "win32":
        return subprocess.Popen(
            resolve(argv), cwd=ROOT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )
    return subprocess.Popen(resolve(argv), cwd=ROOT, start_new_session=True)


def stop(proc: subprocess.Popen[bytes]) -> None:
    """Stop a service and everything it started (uvicorn's reloader, Vite under pnpm)."""
    if proc.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            resolve(["taskkill", "/T", "/F", "/PID", str(proc.pid)]), capture_output=True
        )
    else:
        os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def main() -> int:
    if database_url():
        code = start_postgres()
        if code:
            print(
                f"dev: Postgres did not start (exit code {code}); is Docker running?",
                file=sys.stderr,
            )
            return code
    procs = {name: start(argv) for name, argv in SERVICES.items()}
    print(
        "dev: agent on http://127.0.0.1:8000, web on http://localhost:5173 (Ctrl+C stops both)",
        flush=True,
    )
    try:
        while True:
            for name, proc in procs.items():
                code = proc.poll()
                if code is not None:
                    print(
                        f"dev: {name} exited with code {code}; stopping the rest", file=sys.stderr
                    )
                    return code or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("dev: stopping", file=sys.stderr)
        return 0
    finally:
        for proc in procs.values():
            stop(proc)


if __name__ == "__main__":
    raise SystemExit(main())
