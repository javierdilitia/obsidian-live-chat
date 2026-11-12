"""`MemoryStore`: the store in dictionaries, for tests and a run without a database.

No method awaits between reading and writing its dictionaries, so on one event loop every call
is atomic, as one statement or transaction is on Postgres. A restart forgets everything.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from obsidian_store.models import ProductFacts, Snapshot, TabRecord, TabRevision, User
from obsidian_store.store import TAB_REVISIONS_KEPT


def _now() -> datetime:
    return datetime.now(UTC)


class MemoryStore:
    def __init__(self) -> None:
        self._users: dict[str, User] = {}
        self._tabs: dict[str, TabRecord] = {}
        self._active: dict[str, str] = {}
        self._revisions: dict[str, list[TabRevision]] = {}

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
        now = _now()
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
        now = _now()
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
