"""Reusable pytest suite that any `CatalogSource` implementation must pass.

Usage, in the implementing package's tests:

    class TestMySource(CatalogSourceContract):
        @pytest.fixture
        def source(self) -> CatalogSource: ...
        @pytest.fixture
        def known_product_id(self) -> str: ...
        @pytest.fixture
        def known_order_id(self) -> str: ...
        @pytest.fixture
        def known_user_id(self) -> str: ...

Needs the `testing` extra (pytest, pytest-asyncio). For readable assertion diffs, call
`pytest.register_assert_rewrite("obsidian_data_contract.contract_tests")` in a conftest.py.
"""

import pytest

from obsidian_data_contract.errors import NotFoundError
from obsidian_data_contract.models import (
    OrderStatus,
    OrderTracking,
    ProductQuery,
    ProductSummary,
    RenderLook,
)
from obsidian_data_contract.source import CatalogSource


def _sort_key(p: ProductSummary) -> tuple[bool, float, str]:
    return (p.rating is None, -(p.rating or 0.0), p.id)


def tracking_problem(status: OrderStatus, tracking: OrderTracking) -> str | None:
    """Why `tracking` breaks the step rule for an order in `status`, or None if it holds.

    Delivered or cancelled: every step is `done`, and a cancelled order ends with a terminal
    `Cancelled` step. Otherwise exactly one step is `current`.
    """
    states = [step.state for step in tracking.steps]
    if status in ("delivered", "cancelled"):
        if any(state != "done" for state in states):
            return f"a {status} order has steps that are not done: {states}"
        if status == "cancelled" and tracking.steps[-1].name != "Cancelled":
            return f"a cancelled order ends with {tracking.steps[-1].name!r}, not 'Cancelled'"
        return None
    if states.count("current") != 1:
        return f"a {status} order needs exactly one current step: {states}"
    return None


class CatalogSourceContract:
    """Behaviour every `CatalogSource` shares. Subclass it as `Test…` and add the fixtures."""

    pytestmark = pytest.mark.asyncio

    async def test_is_a_catalog_source(self, source: CatalogSource) -> None:
        assert isinstance(source, CatalogSource)

    async def test_get_product_round_trips(
        self, source: CatalogSource, known_product_id: str
    ) -> None:
        assert (await source.get_product(known_product_id)).id == known_product_id

    async def test_unknown_product_raises(self, source: CatalogSource) -> None:
        with pytest.raises(NotFoundError) as e:
            await source.get_product("no-such-product")
        assert e.value.kind == "product"
        assert e.value.ids == ["no-such-product"]

    async def test_get_products_keeps_order_and_duplicates(self, source: CatalogSource) -> None:
        first_two = await source.search_products(ProductQuery(limit=2))
        a, b = first_two[0].id, first_two[1].id
        got = await source.get_products([a, b, a])
        assert [p.id for p in got] == [a, b, a]
        assert await source.get_products([]) == []

    async def test_get_products_reports_only_missing(
        self, source: CatalogSource, known_product_id: str
    ) -> None:
        with pytest.raises(NotFoundError) as e:
            await source.get_products([known_product_id, "x1", "x2"])
        assert e.value.kind == "product"
        assert e.value.ids == ["x1", "x2"]

    async def test_search_honours_limit(self, source: CatalogSource) -> None:
        assert len(await source.search_products(ProductQuery(limit=1))) == 1

    async def test_search_text_is_case_insensitive(
        self, source: CatalogSource, known_product_id: str
    ) -> None:
        product = await source.get_product(known_product_id)
        word = product.name.split()[0].upper()
        found = await source.search_products(ProductQuery(text=word, limit=50))
        assert known_product_id in [p.id for p in found]

    async def test_search_text_matches_every_word(
        self, source: CatalogSource, known_product_id: str
    ) -> None:
        product = await source.get_product(known_product_id)
        categories = {c.id: c.name for c in await source.list_categories()}
        display_word = next(iter(product.specs.values())).display.split()[0]
        words = [product.name.split()[0].lower(), categories[product.category_id].upper()]
        found = await source.search_products(
            ProductQuery(text=" ".join([*words, display_word]), limit=50)
        )
        assert known_product_id in [p.id for p in found]
        missing = await source.search_products(
            ProductQuery(text=f"{words[0]} zzq-no-such-word", limit=50)
        )
        assert missing == []

    async def test_search_category_and_attributes_are_normalised(
        self, source: CatalogSource, known_product_id: str
    ) -> None:
        product = await source.get_product(known_product_id)
        plain = await source.search_products(ProductQuery(category=product.category_id, limit=50))
        padded = await source.search_products(
            ProductQuery(category=f"  {product.category_id.upper()} ", limit=50)
        )
        assert [p.id for p in padded] == [p.id for p in plain]
        key = next(iter(product.specs))
        blank = await source.search_products(
            ProductQuery(category=product.category_id, attributes={f" {key} ": " "}, limit=50)
        )
        assert [p.id for p in blank] == [p.id for p in plain]

    async def test_search_sorts_by_price_before_limit(self, source: CatalogSource) -> None:
        cheap = await source.search_products(ProductQuery(sort="price_asc", limit=50))
        assert [p.id for p in cheap] == [
            p.id for p in sorted(cheap, key=lambda p: (p.price_cents, p.id))
        ]
        dear = await source.search_products(ProductQuery(sort="price_desc", limit=50))
        assert [p.id for p in dear] == [
            p.id for p in sorted(dear, key=lambda p: (-p.price_cents, p.id))
        ]
        cheapest = await source.search_products(ProductQuery(sort="price_asc", limit=1))
        assert [p.id for p in cheapest] == [cheap[0].id]

    async def test_search_unknown_category_is_empty(self, source: CatalogSource) -> None:
        assert await source.search_products(ProductQuery(category="no-such-category")) == []

    async def test_search_order_is_deterministic(self, source: CatalogSource) -> None:
        first = await source.search_products(ProductQuery(limit=50))
        second = await source.search_products(ProductQuery(limit=50))
        assert [p.id for p in first] == [p.id for p in second]
        assert [p.id for p in first] == [p.id for p in sorted(first, key=_sort_key)]

    async def test_max_price_filters(self, source: CatalogSource) -> None:
        found = await source.search_products(ProductQuery(max_price_cents=20000, limit=50))
        assert all(p.price_cents <= 20000 for p in found)

    async def test_money_is_int_cents_and_look_is_valid(self, source: CatalogSource) -> None:
        for p in await source.search_products(ProductQuery(limit=50)):
            assert type(p.price_cents) is int
            assert p.was_price_cents is None or type(p.was_price_cents) is int
            assert p.currency == "EUR"
            assert isinstance(p.look, RenderLook)

    async def test_orders_newest_first(self, source: CatalogSource, known_user_id: str) -> None:
        dates = [o.placed_on for o in await source.get_orders(known_user_id)]
        assert dates
        assert dates == sorted(dates, reverse=True)
        assert await source.get_orders("no-such-user") == []

    async def test_unknown_order_raises(self, source: CatalogSource) -> None:
        with pytest.raises(NotFoundError) as e:
            await source.get_order("OB-0")
        assert e.value.kind == "order"
        with pytest.raises(NotFoundError) as e:
            await source.get_order_status("OB-0")
        assert e.value.kind == "order"

    async def test_order_status_matches_order(
        self, source: CatalogSource, known_order_id: str
    ) -> None:
        order = await source.get_order(known_order_id)
        tracking = await source.get_order_status(known_order_id)
        assert tracking.order_id == known_order_id
        assert tracking_problem(order.status, tracking) is None

    async def test_every_order_follows_the_step_rule(
        self, source: CatalogSource, known_user_id: str
    ) -> None:
        for summary in await source.get_orders(known_user_id):
            tracking = await source.get_order_status(summary.id)
            assert tracking_problem(summary.status, tracking) is None, summary.id

    async def test_categories_counts_match(self, source: CatalogSource) -> None:
        for c in await source.list_categories():
            found = await source.search_products(ProductQuery(category=c.id, limit=50))
            # Search caps at 50, so a bigger category returns exactly 50.
            assert len(found) == min(c.product_count, 50)
