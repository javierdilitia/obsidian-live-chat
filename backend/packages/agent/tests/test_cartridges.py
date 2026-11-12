import ast
import tomllib
from importlib.metadata import EntryPoint
from pathlib import Path

import pytest

import obsidian_agent
import obsidian_data_contract
from obsidian_agent.cartridges import (
    CARTRIDGE_SETTING,
    ENTRY_POINT_GROUP,
    CartridgeError,
    cartridge_setting,
    installed_cartridges,
    load_cartridge,
)

OK = EntryPoint("halden", "halden_data_fake.cartridge:CARTRIDGE", group=ENTRY_POINT_GROUP)
BAD = EntryPoint("broken", "no_such_module_xyz:CARTRIDGE", group=ENTRY_POINT_GROUP)
AGENT_PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def test_the_only_installed_cartridge_loads_without_a_setting() -> None:
    assert load_cartridge(None, {"halden": OK}).id == "halden"


def test_several_installed_need_a_setting() -> None:
    with pytest.raises(CartridgeError) as error:
        load_cartridge(None, {"halden": OK, "other": OK})
    assert "halden, other" in str(error.value)
    assert "OBSIDIAN_CARTRIDGE" in str(error.value)


def test_unknown_cartridge_lists_the_installed_ones() -> None:
    with pytest.raises(CartridgeError) as error:
        load_cartridge("haier", {"halden": OK})
    assert "haier" in str(error.value) and "halden" in str(error.value)


def test_a_broken_cartridge_does_not_block_the_chosen_one() -> None:
    installed = {"halden": OK, "broken": BAD}
    assert load_cartridge("halden", installed).id == "halden"
    with pytest.raises(CartridgeError) as error:
        load_cartridge("broken", installed)
    assert "broken" in str(error.value)


def test_no_cartridge_installed() -> None:
    with pytest.raises(CartridgeError):
        load_cartridge(None, {})


def test_setting_reads_env_over_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(f"{CARTRIDGE_SETTING}=a\n")
    monkeypatch.setenv(CARTRIDGE_SETTING, "b")
    assert cartridge_setting(env_file) == "b"
    monkeypatch.setenv(CARTRIDGE_SETTING, "")
    assert cartridge_setting(tmp_path / "missing.env") is None


def _imported_top_names(package_dir: Path) -> set[str]:
    names: set[str] = set()
    for path in package_dir.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names.add(node.module.split(".")[0])
    return names


def test_core_imports_no_cartridge() -> None:
    cartridge_modules = {point.module.split(".")[0] for point in installed_cartridges().values()}
    assert cartridge_modules, "no cartridge is installed, so this guard checks nothing"
    for package in (obsidian_agent, obsidian_data_contract):
        package_dir = Path(package.__file__ or "").parent
        assert not _imported_top_names(package_dir) & cartridge_modules, package.__name__


def test_agent_does_not_depend_on_a_cartridge() -> None:
    project = tomllib.loads(AGENT_PYPROJECT.read_text(encoding="utf-8"))["project"]
    dependencies = {
        dependency.split("=")[0].split("<")[0].split(">")[0].strip().lower()
        for dependency in project["dependencies"]
    }
    distributions = {
        point.dist.name.lower() for point in installed_cartridges().values() if point.dist
    }
    assert distributions, "no cartridge is installed, so this guard checks nothing"
    assert not dependencies & distributions
