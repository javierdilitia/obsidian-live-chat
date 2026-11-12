"""The `Cartridge` descriptor: what Obsidian core needs from one client on the backend side."""

from collections.abc import Callable
from dataclasses import dataclass

from obsidian_data_contract.source import CatalogSource


@dataclass(frozen=True)
class Cartridge:
    """One client's data and presentation config, as the backend sees it.

    A cartridge package registers one of these under the `obsidian.cartridges`
    entry point; the agent loads the chosen one at start. Its `id` equals the
    cartridge's web folder name (`web/src/cartridges/<id>/`). Later slices add
    fields (the diagram set in slice 4, the pairing rule and offer in slice 8).
    """

    id: str
    """Slug, equal to the web folder name, for example "halden"."""
    name: str
    """Display name, for example "Halden"."""
    make_source: Callable[[], CatalogSource]
    """Builds the cartridge's catalog; called once per app."""
