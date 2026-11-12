# pyright: basic
from typing import Any

import pytest
from pydantic import ValidationError

from obsidian_data_contract import (
    NotFoundError,
    Order,
    OrderLine,
    OrderTracking,
    ProductQuery,
    ProductSummary,
    RenderLook,
    TrackingStep,
)
from obsidian_data_contract.contract_tests import tracking_problem

LOOK = RenderLook(glyph="laptop", finish="silver", screen="dusk")


def summary(**kw: Any):
    base: dict[str, Any] = dict(
        id="aeris-studio-16",
        name="Aeris Studio 16",
        category_id="laptops",
        price_cents=189900,
        stock=12,
        look=LOOK,
    )
    return ProductSummary(**(base | kw))


def test_price_must_be_int_cents():
    with pytest.raises(ValidationError):
        summary(price_cents=1899.0)


def test_negative_price_rejected():
    with pytest.raises(ValidationError):
        summary(price_cents=-1)


def test_was_price_must_exceed_price():
    with pytest.raises(ValidationError):
        summary(was_price_cents=189900)
    assert summary(was_price_cents=219900).was_price_cents == 219900


def test_models_are_frozen_and_strict():
    s = summary()
    with pytest.raises(ValidationError):
        s.price_cents = 1  # type: ignore[misc]
    with pytest.raises(ValidationError):
        summary(colour="red")


def test_query_limit_bounds_and_text_normalised():
    with pytest.raises(ValidationError):
        ProductQuery(limit=0)
    with pytest.raises(ValidationError):
        ProductQuery(limit=51)
    assert ProductQuery().limit == 20
    assert ProductQuery(text="  OLED ").text == "OLED"
    assert ProductQuery(text="   ").text is None


def test_query_category_and_attributes_normalised():
    assert ProductQuery(category=" Laptops ").category == "laptops"
    assert ProductQuery(category="  ").category is None
    query = ProductQuery(attributes={" display ": " OLED ", "hz": "  "})
    assert query.attributes == {"display": "OLED"}
    with pytest.raises(ValidationError):
        ProductQuery(attributes={" ": "OLED"})


def test_query_sort_defaults_to_rating():
    assert ProductQuery().sort == "rating"
    assert ProductQuery(sort="price_desc").sort == "price_desc"
    with pytest.raises(ValidationError):
        ProductQuery(sort="newest")  # type: ignore[arg-type]


def tracking(*steps: tuple[str, str]) -> OrderTracking:
    return OrderTracking(
        order_id="OB-1",
        steps=[TrackingStep(name=n, at=None, state=st) for n, st in steps],  # type: ignore[arg-type]
        carrier=None,
        tracking_number=None,
        eta=None,
    )


def test_tracking_rule_for_cancelled_orders():
    good = tracking(("Ordered", "done"), ("Packed", "done"), ("Cancelled", "done"))
    assert tracking_problem("cancelled", good) is None
    with_current = tracking(("Ordered", "done"), ("Cancelled", "current"))
    assert tracking_problem("cancelled", with_current) is not None
    no_terminal = tracking(("Ordered", "done"), ("Packed", "done"))
    assert tracking_problem("cancelled", no_terminal) is not None


def test_tracking_rule_for_open_and_delivered_orders():
    shipped = tracking(("Ordered", "done"), ("Shipped", "current"), ("Delivered", "pending"))
    assert tracking_problem("shipped", shipped) is None
    assert tracking_problem("shipped", tracking(("Ordered", "done"))) is not None
    assert tracking_problem("delivered", tracking(("Delivered", "done"))) is None
    assert tracking_problem("delivered", shipped) is not None


def test_order_totals_must_match_lines():
    line = OrderLine(
        product_id="kore-dock-8-in-1", name="Kore Dock 8-in-1", qty=2, unit_price_cents=18900
    )
    ok: dict[str, Any] = dict(
        id="OB-89027",
        user_id="demo-user",
        placed_on="2026-11-07",
        status="shipped",
        total_cents=37800,
        item_count=2,
        lines=[line],
    )
    assert Order(**ok).total_cents == 37800
    with pytest.raises(ValidationError):
        Order(**{**ok, "total_cents": 18900})


def test_not_found_error_names_ids():
    e = NotFoundError("product", ["a", "b"])
    assert e.kind == "product" and e.ids == ["a", "b"]
    assert str(e) == "product not found: a, b"
