"""Data shapes of the catalog and order contract.

Rules: ids are stable slugs; money is integer cents plus a currency code, never floats;
every model is frozen and rejects unknown fields.
"""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

Glyph = Literal["laptop", "monitor", "buds", "keys", "ssd", "dock"]
Finish = Literal["silver", "graphite", "midnight", "starlight", "sage", "white"]
Screen = Literal["dusk", "sea", "night", "dawn"]
OrderStatus = Literal[
    "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"
]
StepState = Literal["done", "current", "pending"]

PositiveCents = Annotated[StrictInt, Field(gt=0)]
NonNegativeCents = Annotated[StrictInt, Field(ge=0)]


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class RenderLook(_Model):
    """Fields the product renders need. Chart colours are not product data."""

    glyph: Glyph
    finish: Finish
    screen: Screen | None = None


class SpecValue(_Model):
    value: str | int | float
    unit: str | None = None
    display: str


class Category(_Model):
    id: str
    name: str
    product_count: int = Field(ge=0)


class ProductSummary(_Model):
    id: str
    name: str
    category_id: str
    price_cents: PositiveCents
    was_price_cents: StrictInt | None = None
    currency: Literal["EUR"] = "EUR"
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int = Field(default=0, ge=0)
    stock: int = Field(ge=0)
    look: RenderLook

    @model_validator(mode="after")
    def _was_price_above_price(self) -> Self:
        if self.was_price_cents is not None and self.was_price_cents <= self.price_cents:
            raise ValueError("was_price_cents must be greater than price_cents")
        return self


class Product(ProductSummary):
    specs: dict[str, SpecValue]

    def summary(self) -> ProductSummary:
        return ProductSummary.model_validate(self.model_dump(exclude={"specs"}))


class ProductQuery(_Model):
    text: str | None = None
    category: str | None = None
    max_price_cents: NonNegativeCents | None = None
    attributes: dict[str, str] = Field(default_factory=dict[str, str])
    limit: int = Field(default=20, ge=1, le=50)

    @field_validator("text")
    @classmethod
    def _normalise_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class OrderLine(_Model):
    product_id: str
    name: str
    qty: int = Field(ge=1)
    unit_price_cents: PositiveCents


class OrderSummary(_Model):
    id: str
    user_id: str
    placed_on: date
    status: OrderStatus
    total_cents: NonNegativeCents
    item_count: int = Field(ge=1)
    eta: date | None = None


class Order(OrderSummary):
    lines: list[OrderLine] = Field(min_length=1)

    @model_validator(mode="after")
    def _totals_match_lines(self) -> Self:
        total = sum(line.qty * line.unit_price_cents for line in self.lines)
        count = sum(line.qty for line in self.lines)
        if self.total_cents != total:
            raise ValueError(f"total_cents {self.total_cents} != sum of lines {total}")
        if self.item_count != count:
            raise ValueError(f"item_count {self.item_count} != sum of quantities {count}")
        return self

    def summary(self) -> OrderSummary:
        return OrderSummary.model_validate(self.model_dump(exclude={"lines"}))


class TrackingStep(_Model):
    name: str
    at: date | None
    state: StepState


class OrderTracking(_Model):
    order_id: str
    steps: list[TrackingStep] = Field(min_length=1)
    carrier: str | None
    tracking_number: str | None
    eta: date | None
