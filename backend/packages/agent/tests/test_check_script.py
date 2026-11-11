# pyright: basic
"""Tests for scripts/check.py, the single definition of every check (hooks and CI call it)."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "check.py"


@pytest.fixture
def check():
    spec = importlib.util.spec_from_file_location("check_script", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_unknown_check_returns_2(check, capsys):
    assert check.main(["nope"]) == 2
    assert "backend" in capsys.readouterr().out


def test_resolves_executables_via_which(check, monkeypatch):
    monkeypatch.setattr(check.shutil, "which", lambda c: f"C:/bin/{c}.cmd")
    assert check.resolve(["pnpm", "--dir", "web", "test"])[0] == "C:/bin/pnpm.cmd"


def test_missing_executable_exits_127(check, monkeypatch):
    monkeypatch.setattr(check.shutil, "which", lambda c: None)
    with pytest.raises(SystemExit) as e:
        check.resolve(["pnpm"])
    assert e.value.code == 127


def test_all_is_backend_then_web(check):
    assert check.CHECKS["all"] == check.CHECKS["backend"] + check.CHECKS["web"]


def test_stops_at_first_failure(check, monkeypatch):
    calls = []
    monkeypatch.setattr(check, "resolve", lambda a: a)
    monkeypatch.setattr(
        check.subprocess, "call", lambda a: calls.append(a) or (1 if len(calls) == 1 else 0)
    )
    assert check.main(["backend"]) == 1 and len(calls) == 1
