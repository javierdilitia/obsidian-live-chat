from importlib.metadata import entry_points

from halden_data_fake.cartridge import CARTRIDGE
from obsidian_data_contract import CatalogSource


def test_halden_is_registered_as_a_cartridge() -> None:
    (point,) = [p for p in entry_points(group="obsidian.cartridges") if p.name == "halden"]
    cartridge = point.load()
    assert cartridge is CARTRIDGE
    assert (cartridge.id, cartridge.name) == ("halden", "Halden")
    assert isinstance(cartridge.make_source(), CatalogSource)
