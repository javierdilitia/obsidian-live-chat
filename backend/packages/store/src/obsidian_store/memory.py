"""`MemoryStore`: the store in dictionaries, for tests and a run without a database.

No method awaits between reading and writing its dictionaries, so on one event loop every call
is atomic, as one statement or transaction is on Postgres. A restart forgets everything.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

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
from obsidian_store.store import TAB_REVISIONS_KEPT


class MemoryStore:
    def __init__(self) -> None:
        self._users: dict[str, User] = {}
        self._tabs: dict[str, TabRecord] = {}
        self._active: dict[str, str] = {}
        self._revisions: dict[str, list[TabRevision]] = {}
        self._carts: dict[str, dict[str, CartLine]] = {}
        self._runs: list[RunRecord] = []
        self._actions: dict[str, ActionRecord] = {}
        self._clock = datetime.min.replace(tzinfo=UTC)

    def _now(self) -> datetime:
        """The time, strictly later than the last one given, so ties never reorder a cart
        (the system clock can return the same value twice)."""
        self._clock = max(datetime.now(UTC), self._clock + timedelta(microseconds=1))
        return self._clock

    # Users

    async def upsert_users(self, users: Sequence[User]) -> None:
        for user in users:
            self._users[user.id] = user

    async def list_users(self) -> list[User]:
        return [self._users[user_id] for user_id in sorted(self._users)]

    async def get_user(self, user_id: str) -> User | None:
        return self._users.get(user_id)

    # Workspace and tabs

    async def open_tabs(self, user_id: str) -> list[TabRecord]:
        tabs = [t for t in self._tabs.values() if t.user_id == user_id and t.status == "open"]
        return sorted(tabs, key=lambda tab: tab.position)

    async def create_tab(
        self, user_id: str, *, surface_id: str, kind: str, card: dict[str, Any], language: str
    ) -> TabRecord:
        if any(tab.surface_id == surface_id for tab in self._tabs.values()):
            raise ValueError(f"surface {surface_id} already has a tab")
        positions = [
            t.position for t in self._tabs.values() if t.user_id == user_id and t.status == "open"
        ]
        now = self._now()
        tab = TabRecord(
            id=uuid.uuid4().hex,
            user_id=user_id,
            surface_id=surface_id,
            kind=kind,
            status="open",
            position=max(positions, default=-1) + 1,
            card=card,
            snapshot=None,
            product_facts={},
            language=language,
            created_at=now,
            updated_at=now,
            closed_at=None,
        )
        self._tabs[tab.id] = tab
        self._active[user_id] = tab.id
        return tab

    async def active_tab_id(self, user_id: str) -> str | None:
        return self._active.get(user_id)

    async def save_tab(
        self,
        tab_id: str,
        *,
        card: dict[str, Any],
        snapshot: Snapshot,
        product_facts: ProductFacts,
        run_id: str,
    ) -> TabRecord:
        tab = self._tabs[tab_id]
        now = self._now()
        tab = tab.model_copy(
            update={
                "card": card,
                "snapshot": snapshot,
                "product_facts": product_facts,
                "updated_at": now,
            }
        )
        self._tabs[tab_id] = tab
        revisions = self._revisions.setdefault(tab_id, [])
        rev = revisions[-1].rev + 1 if revisions else 1
        revisions.append(
            TabRevision(
                tab_id=tab_id,
                rev=rev,
                card=card,
                snapshot=snapshot,
                product_facts=product_facts,
                run_id=run_id,
                created_at=now,
            )
        )
        del revisions[:-TAB_REVISIONS_KEPT]
        return tab

    async def tab_revisions(self, tab_id: str) -> list[TabRevision]:
        return list(self._revisions.get(tab_id, []))

    # Cart

    async def cart(self, user_id: str) -> list[CartLine]:
        lines = self._carts.get(user_id, {}).values()
        return sorted(lines, key=lambda line: (line.added_at, line.product_id))

    async def add_to_cart(self, user_id: str, product_id: str, *, stock: int) -> CartChange:
        current = self._qty(user_id, product_id)
        if current + 1 > stock:
            return CartChange(ok=False, qty=current)
        return self._put(user_id, product_id, current + 1)

    async def set_cart_qty(
        self, user_id: str, product_id: str, qty: int, *, stock: int
    ) -> CartChange:
        current = self._qty(user_id, product_id)
        if qty > stock and qty > current:
            return CartChange(ok=False, qty=current)
        if qty == 0:
            self._carts.get(user_id, {}).pop(product_id, None)
            return CartChange(ok=True, qty=0)
        return self._put(user_id, product_id, qty)

    async def remove_from_cart(self, user_id: str, product_id: str) -> None:
        self._carts.get(user_id, {}).pop(product_id, None)

    def _qty(self, user_id: str, product_id: str) -> int:
        line = self._carts.get(user_id, {}).get(product_id)
        return line.qty if line else 0

    def _put(self, user_id: str, product_id: str, qty: int) -> CartChange:
        lines = self._carts.setdefault(user_id, {})
        line = lines.get(product_id)
        added_at = line.added_at if line else self._now()
        lines[product_id] = CartLine(product_id=product_id, qty=qty, added_at=added_at)
        return CartChange(ok=True, qty=qty)

    # Runs

    async def record_run(self, run: RunRecord) -> None:
        self._runs.append(run)

    async def runs(self, user_id: str) -> list[RunRecord]:
        mine = [run for run in self._runs if run.user_id == user_id]
        return sorted(mine, key=lambda run: run.started_at)

    # Idempotency

    async def action_result(self, request_id: str, *, since: datetime) -> ActionRecord | None:
        record = self._actions.get(request_id)
        return record if record is not None and record.at >= since else None

    async def save_action_result(self, record: ActionRecord) -> None:
        self._actions[record.request_id] = record

    async def purge_action_results(self, before: datetime) -> int:
        old = [key for key, record in self._actions.items() if record.at < before]
        for key in old:
            del self._actions[key]
        return len(old)
