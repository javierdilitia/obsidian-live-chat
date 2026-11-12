"""The read-only interface every catalog backend implements."""

from typing import Protocol, runtime_checkable

from obsidian_data_contract.models import (
    Category,
    Order,
    OrderSummary,
    OrderTracking,
    Product,
    ProductQuery,
    ProductSummary,
)


@runtime_checkable
class CatalogSource(Protocol):
    """Read-only access to categories, products and a user's orders.

    Cart, checkout and refunds are not part of this contract.
    """

    async def list_categories(self) -> list[Category]:
        """All categories. `product_count` equals the number of products in that category."""
        ...

    async def search_products(self, query: ProductQuery) -> list[ProductSummary]:
        """Products matching every filter that is set, at most `query.limit` of them.

        - `text`: split on whitespace; every word is a case-insensitive substring of at least
          one of the product name, its category id, its category name or any spec `display`.
        - `category`: exact match on `category_id`; an unknown category gives `[]`.
        - `attributes`: keys are spec keys; each value is a case-insensitive substring of
          that spec's `display`.
        - `max_price_cents`: inclusive upper bound on `price_cents`.

        Order is deterministic and applied before `limit`. `sort="rating"` (the default):
        rating descending, no rating last, then id. `price_asc` / `price_desc`: price
        ascending / descending, then id ascending.
        """
        ...

    async def get_product(self, product_id: str) -> Product:
        """One product. Raises `NotFoundError(kind="product")` if the id is unknown."""
        ...

    async def get_products(self, product_ids: list[str]) -> list[Product]:
        """Products in input order, duplicates kept; `[]` for `[]`.

        Raises `NotFoundError(kind="product")` whose `ids` are exactly the unknown ids.
        """
        ...

    async def get_orders(self, user_id: str) -> list[OrderSummary]:
        """A user's orders, newest first. An unknown user gives `[]`."""
        ...

    async def get_order(self, order_id: str) -> Order:
        """One order with its lines. Raises `NotFoundError(kind="order")` if unknown."""
        ...

    async def get_order_status(self, order_id: str) -> OrderTracking:
        """Tracking steps for an order. Raises `NotFoundError(kind="order")` if unknown.

        Delivered or cancelled: every step is `done`, and a cancelled order ends with a
        terminal `Cancelled` step after the steps it reached. Otherwise exactly one step is
        `current`.
        """
        ...
