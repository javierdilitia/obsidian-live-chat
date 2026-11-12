"""Halden as an Obsidian cartridge, registered under the `obsidian.cartridges` entry point."""

from halden_data_fake.source import FakeCatalogSource
from obsidian_data_contract import Cartridge

CARTRIDGE = Cartridge(id="halden", name="Halden", make_source=FakeCatalogSource)
