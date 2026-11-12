"""The `Store` protocol: everything Obsidian keeps between requests, grouped by area."""

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any, Protocol, runtime_checkable

from obsidian_store.models import (
    ActionRecord,
    CartChange,
    CartLine,
    ProductFacts,
    RunRecord,
    Snapshot,
    TabRecord,
    TabRevision,
    User,
)

# Revisions kept per tab; saving the 21st drops the oldest.
TAB_REVISIONS_KEPT = 20
# A repeated `requestId` gets the stored answer for this long.
ACTION_RESULT_TTL = timedelta(hours=24)


@runtime_checkable
class Store(Protocol):
    # Users

    async def upsert_users(self, users: Sequence[User]) -> None:
        """Adds the users, or updates the name and language of those that exist."""
        ...

    async def list_users(self) -> list[User]:
        """Every user, by ID."""
        ...

    async def get_user(self, user_id: str) -> User | None: ...

    # Workspace and tabs

    async def open_tabs(self, user_id: str) -> list[TabRecord]:
        """The user's open tabs, by position."""
        ...

    async def create_tab(
        self, user_id: str, *, surface_id: str, kind: str, card: dict[str, Any], language: str
    ) -> TabRecord:
        """A new open tab in the last position; it becomes the active tab.

        Raises `ValueError` when `surface_id` is already used.
        """
        ...

    async def active_tab_id(self, user_id: str) -> str | None: ...

    async def save_tab(
        self,
        tab_id: str,
        *,
        card: dict[str, Any],
        snapshot: Snapshot,
        product_facts: ProductFacts,
        run_id: str,
    ) -> TabRecord:
        """Stores a run's page and appends a revision, keeping the last `TAB_REVISIONS_KEPT`.

        Raises `KeyError` for an unknown tab.
        """
        ...

    async def tab_revisions(self, tab_id: str) -> list[TabRevision]:
        """The kept revisions, oldest first."""
        ...

    # Cart. Each change is atomic: two at once never sell the same last item twice.

    async def cart(self, user_id: str) -> list[CartLine]:
        """The user's cart, in the order the products were first added."""
        ...

    async def add_to_cart(self, user_id: str, product_id: str, *, stock: int) -> CartChange:
        """Adds one, only if the new quantity is at most `stock`."""
        ...

    async def set_cart_qty(
        self, user_id: str, product_id: str, qty: int, *, stock: int
    ) -> CartChange:
        """Sets `qty` if it is at most `stock` or at most the current quantity (a decrease is
        always allowed); `0` removes the line."""
        ...

    async def remove_from_cart(self, user_id: str, product_id: str) -> None: ...

    # Runs

    async def record_run(self, run: RunRecord) -> None: ...

    async def runs(self, user_id: str) -> list[RunRecord]:
        """The user's runs, by `started_at`."""
        ...

    # Idempotency

    async def action_result(self, request_id: str, *, since: datetime) -> ActionRecord | None:
        """The stored answer for `request_id`, if it was saved at or after `since`."""
        ...

    async def save_action_result(self, record: ActionRecord) -> None: ...

    async def purge_action_results(self, before: datetime) -> int:
        """Removes the answers saved before `before`; returns how many."""
        ...
