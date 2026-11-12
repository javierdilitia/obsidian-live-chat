"""Finds and loads the cartridge the agent serves, through the `obsidian.cartridges` entry point.

Core never imports a cartridge: a cartridge package registers a `Cartridge` under the entry point,
and the agent loads the one `OBSIDIAN_CARTRIDGE` names (or the only one installed). Only the chosen
entry point is imported, so a broken cartridge cannot stop another one from loading.
"""

import os
from collections.abc import Mapping
from importlib.metadata import EntryPoint, entry_points
from pathlib import Path

from dotenv import dotenv_values

from obsidian_data_contract import Cartridge

ENTRY_POINT_GROUP = "obsidian.cartridges"
CARTRIDGE_SETTING = "OBSIDIAN_CARTRIDGE"


class CartridgeError(Exception):
    """The cartridge could not be chosen or loaded. The message names the installed IDs."""


def installed_cartridges() -> dict[str, EntryPoint]:
    """Every registered cartridge entry point, by name. Nothing is imported."""
    return {point.name: point for point in entry_points(group=ENTRY_POINT_GROUP)}


def load_cartridge(
    wanted: str | None, installed: Mapping[str, EntryPoint] | None = None
) -> Cartridge:
    """The cartridge `wanted` names, or the only one installed when `wanted` is None."""
    points = installed_cartridges() if installed is None else installed
    names = ", ".join(sorted(points))
    if wanted is None:
        if not points:
            raise CartridgeError("No cartridge is installed.")
        if len(points) > 1:
            raise CartridgeError(
                f"Several cartridges are installed ({names}). "
                f"Set {CARTRIDGE_SETTING} to one of them."
            )
        (wanted,) = points
    point = points.get(wanted)
    if point is None:
        raise CartridgeError(f"Unknown cartridge '{wanted}'. Installed: {names or 'none'}.")
    try:
        loaded: object = point.load()
    except Exception as error:
        raise CartridgeError(f"Cartridge '{wanted}' failed to load: {error}") from error
    if not isinstance(loaded, Cartridge):
        raise CartridgeError(f"Cartridge '{wanted}' is a {type(loaded).__name__}, not a Cartridge.")
    return loaded


def cartridge_setting(env_file: Path) -> str | None:
    """`OBSIDIAN_CARTRIDGE` from the environment, else from the env file; blank means unset."""
    value = os.environ.get(CARTRIDGE_SETTING) or dotenv_values(env_file).get(CARTRIDGE_SETTING)
    return (value or "").strip() or None
