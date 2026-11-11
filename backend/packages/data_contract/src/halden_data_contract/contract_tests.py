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
`pytest.register_assert_rewrite("halden_data_contract.contract_tests")` in a conftest.py.
"""

import pytest

from halden_data_contract.errors import NotFoundError
from halden_data_contract.models import ProductQuery, ProductSummary, RenderLook
from halden_data_contract.source import CatalogSource


def _sort_key(p: ProductSummary) -> tuple[bool, float, str]:
    return (p.rating is None, -(p.rating or 0.0), p.id)


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
        states = [s.state for s in tracking.steps]
        if order.status == "delivered":
            assert all(s == "done" for s in states)
        else:
            assert states.count("current") == 1

    async def test_categories_counts_match(self, source: CatalogSource) -> None:
        for c in await source.list_categories():
            found = await source.search_products(ProductQuery(category=c.id, limit=50))
            # Search caps at 50, so a bigger category returns exactly 50.
            assert len(found) == min(c.product_count, 50)
