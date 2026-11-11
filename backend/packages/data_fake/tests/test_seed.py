# pyright: basic
import json
from importlib import resources
from pathlib import Path

import pytest
from pydantic import ValidationError

from halden_data_contract import ProductQuery
from halden_data_contract.contract_tests import CatalogSourceContract
from halden_data_fake import FakeCatalogSource


async def test_seed_integrity():
    source = FakeCatalogSource()
    categories = await source.list_categories()
    products = await source.search_products(ProductQuery(limit=50))
    orders = await source.get_orders("demo-user")

    assert len(products) == 13
    assert len(categories) == 6
    assert len(orders) == 3

    category_ids = {c.id for c in categories}
    assert all(p.category_id in category_ids for p in products)

    for summary in orders:
        order = await source.get_order(summary.id)
        for line in order.lines:
            assert (await source.get_product(line.product_id)).id == line.product_id


def test_bad_seed_fails_loudly(tmp_path: Path):
    seed = resources.files("halden_data_fake") / "seed"
    for name in ("categories.json", "products.json", "orders.json"):
        (tmp_path / name).write_text(seed.joinpath(name).read_text("utf-8"), "utf-8")
    products_file = tmp_path / "products.json"
    products = json.loads(products_file.read_text("utf-8"))
    products[0]["price_cents"] = 18.99
    products_file.write_text(json.dumps(products), "utf-8")

    with pytest.raises(ValidationError):
        FakeCatalogSource(tmp_path)


async def test_category_counts_hold_beyond_search_limit(tmp_path: Path):
    # A real store has categories with more than 50 products (the search cap).
    seed = resources.files("halden_data_fake") / "seed"
    products = json.loads(seed.joinpath("products.json").read_text("utf-8"))
    template = next(p for p in products if p["id"] == "kore-zephyr-14")
    for i in range(55):
        products.append(template | {"id": f"bulk-laptop-{i:02d}", "name": f"Bulk Laptop {i}"})
    categories = json.loads(seed.joinpath("categories.json").read_text("utf-8"))
    for c in categories:
        if c["id"] == "laptops":
            c["product_count"] += 55
    (tmp_path / "products.json").write_text(json.dumps(products), "utf-8")
    (tmp_path / "categories.json").write_text(json.dumps(categories), "utf-8")
    (tmp_path / "orders.json").write_text(seed.joinpath("orders.json").read_text("utf-8"), "utf-8")

    await CatalogSourceContract().test_categories_counts_match(FakeCatalogSource(tmp_path))
