# pyright: basic
"""Repo-level invariants: runtime version, secret scanning, dependency pins, hook portability."""

import json
import re
import sys
import tomllib
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[4]
FAKE_KEY = "1111222233334444aaaabbbbccccdddd"  # low entropy: the default gitleaks rules miss it


def test_runtime_is_python_312():
    # Spec §5 and CI use Python 3.12; local runs must match so 3.13+ features can't sneak in.
    assert sys.version_info[:2] == (3, 12)


def _gitleaks_rule():
    config = tomllib.loads((ROOT / ".gitleaks.toml").read_text(encoding="utf-8"))
    rule = next(r for r in config["rules"] if r["id"] == "obsidian-model-api-key")
    pattern = re.compile(rule["regex"])
    allow = [re.compile(a) for al in rule.get("allowlists", []) for a in al.get("regexes", [])]
    keywords = rule["keywords"]

    def flags(line: str) -> bool:
        if not any(k in line.lower() for k in keywords):
            return False
        match = pattern.search(line)
        if match is None:
            return False
        secret = match.group(rule.get("secretGroup", 0))
        return not any(a.search(secret) for a in allow)

    return flags


@pytest.mark.parametrize(
    "line",
    [
        f"AZURE_FOUNDRY_API_KEY={FAKE_KEY}",
        f"export AZURE_FOUNDRY_API_KEY='{FAKE_KEY}'",
        f'{{"AZURE_FOUNDRY_API_KEY": "{FAKE_KEY}"}}',
        f'os.environ["AZURE_FOUNDRY_API_KEY"] = "{FAKE_KEY}"',
        f'client = AzureOpenAI(api_key="{FAKE_KEY}")',
        f"API_KEY={FAKE_KEY}",
        f"AZURE_FOUNDRY_KEY={FAKE_KEY}",
    ],
)
def test_gitleaks_rule_flags_hardcoded_keys(line):
    assert _gitleaks_rule()(line)


@pytest.mark.parametrize(
    "line",
    [
        "AZURE_FOUNDRY_API_KEY=",
        "AZURE_FOUNDRY_API_KEY=\nMODEL_ROUTER_DEPLOYMENT=",
        "AZURE_FOUNDRY_API_KEY=your-azure-foundry-key-here",
        "AZURE_FOUNDRY_API_KEY = settings_azure_foundry_api_key_value",
        'key = os.environ["AZURE_FOUNDRY_API_KEY"]',
        'api_key=os.environ["AZURE_FOUNDRY_API_KEY"]',
        'cache_key = "product-search-results-v2"',
    ],
)
def test_gitleaks_rule_ignores_placeholders_and_lookups(line):
    assert not _gitleaks_rule()(line)


def test_tilde_pins_are_held_back_in_dependabot():
    # A `~X.Y.Z` pin in web/package.json is deliberate; Dependabot must not bump past X.Y.
    package = json.loads((ROOT / "web" / "package.json").read_text(encoding="utf-8"))
    pins = {
        name: spec[1:]
        for group in ("dependencies", "devDependencies")
        for name, spec in package.get(group, {}).items()
        if spec.startswith("~")
    }
    assert pins, "expected deliberate ~ pins in web/package.json"

    config = yaml.safe_load((ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8"))
    npm = next(u for u in config["updates"] if u["package-ecosystem"] == "npm")
    ignored = {i["dependency-name"]: i.get("versions", []) for i in npm.get("ignore", [])}
    for name, version in pins.items():
        major, minor = version.split(".")[:2]
        assert f">={major}.{int(minor) + 1}" in ignored.get(name, []), name


def test_local_hooks_do_not_rely_on_a_system_python():
    # `language: system` + `python …` fails on machines that only have `python3`.
    config = yaml.safe_load((ROOT / ".pre-commit-config.yaml").read_text(encoding="utf-8"))
    local = next(r for r in config["repos"] if r["repo"] == "local")
    for hook in local["hooks"]:
        if hook["entry"].startswith("python "):
            assert hook["language"] == "python", hook["id"]
