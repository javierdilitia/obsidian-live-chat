"""The texts the model reads that we own name no cartridge data, and say where new sections go."""

import json
import re

from halden_data_fake import FakeCatalogSource
from obsidian_agent.a2ui_adapter import shop_catalog_json
from obsidian_agent.page_agent import PAGE_PROMPT, SYSTEM_PROMPT, page_tools
from obsidian_data_contract import ProductQuery

# Halden spec keys that read as words; a guard on every key would also catch "cpu" or "display".
SPEC_KEYS = ["batt", "hz", "p3", "de", "refresh_rate", "noise_cancelling", "power_pass_through"]


async def test_prompt_names_no_cartridge_data() -> None:
    source = FakeCatalogSource()
    categories = [category.id for category in await source.list_categories()]
    products = [
        product
        for category in categories
        for product in await source.search_products(ProductQuery(category=category, limit=50))
    ]
    assert products
    texts = {
        "page prompt": PAGE_PROMPT,
        "catalog": json.dumps(shop_catalog_json(), ensure_ascii=False),
        "tools": json.dumps(page_tools([]), ensure_ascii=False),
    }
    for label, text in texts.items():
        for product in products:
            assert product.id not in text, (label, product.id)
            assert product.name not in text, (label, product.name)
        for word in [*categories, *SPEC_KEYS]:
            assert not re.search(rf"\b{re.escape(word)}\b", text), (label, word)


def test_prompt_states_where_new_sections_go() -> None:
    assert "where it fits in reading order" in SYSTEM_PROMPT
    assert "Never put it last by default" in SYSTEM_PROMPT
    assert "change that section instead of adding a second one" in SYSTEM_PROMPT
