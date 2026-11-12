# pyright: basic
from typing import Any

import pytest
from pydantic import ValidationError

from obsidian_data_contract import (
    NotFoundError,
    Order,
    OrderLine,
    ProductQuery,
    ProductSummary,
    RenderLook,
)

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
