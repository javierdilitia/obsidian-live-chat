"""`CatalogSource` backed by JSON seed files, loaded and validated once at construction."""

from datetime import date
from importlib import resources
from importlib.resources.abc import Traversable
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from halden_data_contract import (
    Category,
    NotFoundError,
    Order,
    OrderSummary,
    OrderTracking,
    Product,
    ProductQuery,
    ProductSummary,
    TrackingStep,
)


class _SeedTracking(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    steps: list[TrackingStep] = Field(min_length=1)
    carrier: str | None
    tracking_number: str | None
    eta: date | None


class _SeedOrder(Order):
    """An order as stored in orders.json: the order plus its tracking under `tracking`."""

    tracking: _SeedTracking


def _matches(product: Product, query: ProductQuery) -> bool:
    if query.category is not None and product.category_id != query.category:
        return False
    if query.max_price_cents is not None and product.price_cents > query.max_price_cents:
        return False
    if query.text is not None:
        text = query.text.casefold()
        if text not in product.name.casefold() and text not in product.category_id.casefold():
            return False
    for key, wanted in query.attributes.items():
        spec = product.specs.get(key)
        if spec is None or wanted.casefold() not in spec.display.casefold():
            return False
    return True


def _rank(product: ProductSummary) -> tuple[bool, float, str]:
    """Rating descending, products without a rating last, then id ascending."""
    return (product.rating is None, -(product.rating or 0.0), product.id)


class FakeCatalogSource:
    """In-memory catalog for development and tests. Deterministic: no randomness."""

    def __init__(self, seed_dir: Path | None = None) -> None:
        root: Traversable = (
            seed_dir if seed_dir is not None else resources.files("halden_data_fake") / "seed"
        )

        def read(name: str) -> str:
            return root.joinpath(name).read_text(encoding="utf-8")

        categories = TypeAdapter(list[Category]).validate_json(read("categories.json"))
        products = TypeAdapter(list[Product]).validate_json(read("products.json"))
        seed_orders = TypeAdapter(list[_SeedOrder]).validate_json(read("orders.json"))

        self._categories = categories
        self._products = {p.id: p for p in products}
        self._ranked = sorted(products, key=_rank)
        self._orders: dict[str, Order] = {}
        self._tracking: dict[str, OrderTracking] = {}
        for seed in seed_orders:
            self._orders[seed.id] = Order.model_validate(seed.model_dump(exclude={"tracking"}))
            self._tracking[seed.id] = OrderTracking.model_validate(
                {"order_id": seed.id, **seed.tracking.model_dump()}
            )

    async def list_categories(self) -> list[Category]:
        return list(self._categories)

    async def search_products(self, query: ProductQuery) -> list[ProductSummary]:
        found = [p.summary() for p in self._ranked if _matches(p, query)]
        return found[: query.limit]

    async def get_product(self, product_id: str) -> Product:
        product = self._products.get(product_id)
        if product is None:
            raise NotFoundError("product", [product_id])
        return product

    async def get_products(self, product_ids: list[str]) -> list[Product]:
        missing = [i for i in product_ids if i not in self._products]
        if missing:
            raise NotFoundError("product", missing)
        return [self._products[i] for i in product_ids]

    async def get_orders(self, user_id: str) -> list[OrderSummary]:
        mine = [o for o in self._orders.values() if o.user_id == user_id]
        mine.sort(key=lambda o: (o.placed_on, o.id), reverse=True)
        return [o.summary() for o in mine]

    async def get_order(self, order_id: str) -> Order:
        order = self._orders.get(order_id)
        if order is None:
            raise NotFoundError("order", [order_id])
        return order

    async def get_order_status(self, order_id: str) -> OrderTracking:
        tracking = self._tracking.get(order_id)
        if tracking is None:
            raise NotFoundError("order", [order_id])
        return tracking
