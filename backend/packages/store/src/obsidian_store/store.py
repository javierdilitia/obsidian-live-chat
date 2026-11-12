"""The `Store` protocol: everything Obsidian keeps between requests, grouped by area."""

from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable

from obsidian_store.models import ProductFacts, Snapshot, TabRecord, TabRevision, User

# Revisions kept per tab; saving the 21st drops the oldest.
TAB_REVISIONS_KEPT = 20


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
