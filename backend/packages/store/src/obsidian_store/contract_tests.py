"""Reusable pytest suite that every `Store` implementation must pass.

Usage, in the implementing package's tests:

    class TestMyStore(StoreContract):
        @pytest.fixture
        def store(self) -> Store: ...   # an empty store

Needs the `testing` extra (pytest, pytest-asyncio). For readable assertion diffs, call
`pytest.register_assert_rewrite("obsidian_store.contract_tests")` in a conftest.py.
"""

from typing import Any

import pytest

from obsidian_store.models import ProductFact, User
from obsidian_store.store import TAB_REVISIONS_KEPT, Store

SHOPPERS = [
    User(id="demo-user", name="Javier", language="en"),
    User(id="ana", name="Ana", language="es"),
    User(id="sam", name="Sam", language="en"),
]


def _card(title: str) -> dict[str, Any]:
    return {"title": title, "commands": []}


def _snapshot(n: int) -> dict[str, Any]:
    return {"surfaceId": "s", "components": [{"id": "root", "n": n}], "dataModel": {}}


class StoreContract:
    """Behaviour every `Store` shares. Subclass it as `Test…` and add the `store` fixture."""

    pytestmark = pytest.mark.asyncio

    async def test_is_a_store(self, store: Store) -> None:
        assert isinstance(store, Store)

    # Users

    async def test_users_round_trip(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        await store.upsert_users(SHOPPERS)
        assert await store.list_users() == sorted(SHOPPERS, key=lambda user: user.id)
        assert await store.get_user("ana") == SHOPPERS[1]
        assert await store.get_user("nobody") is None

    async def test_users_upsert_updates_name(self, store: Store) -> None:
        await store.upsert_users([User(id="ana", name="Ana", language="es")])
        await store.upsert_users([User(id="ana", name="Ana M.", language="es")])
        assert await store.get_user("ana") == User(id="ana", name="Ana M.", language="es")

    # Tabs

    async def test_tabs_belong_to_their_user(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        tab = await store.create_tab(
            "ana", surface_id="shop:a", kind="compare", card=_card("A"), language="es"
        )
        assert [t.id for t in await store.open_tabs("ana")] == [tab.id]
        assert await store.open_tabs("sam") == []
        assert await store.active_tab_id("ana") == tab.id
        assert await store.active_tab_id("sam") is None
        assert tab.user_id == "ana"
        assert tab.status == "open"
        assert tab.snapshot is None
        assert tab.product_facts == {}
        assert tab.card == _card("A")
        assert tab.language == "es"
        assert tab.closed_at is None
        assert tab.created_at.tzinfo is not None

    async def test_tab_positions_follow_creation(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        first = await store.create_tab(
            "sam", surface_id="shop:1", kind="compare", card=_card("1"), language="en"
        )
        second = await store.create_tab(
            "sam", surface_id="shop:2", kind="compare", card=_card("2"), language="en"
        )
        tabs = await store.open_tabs("sam")
        assert [(t.id, t.position) for t in tabs] == [(first.id, 0), (second.id, 1)]
        assert await store.active_tab_id("sam") == second.id

    async def test_save_tab_writes_a_revision(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        tab = await store.create_tab(
            "sam", surface_id="shop:1", kind="compare", card=_card("1"), language="en"
        )
        facts_1 = {"p1": ProductFact(price_cents=1000, stock=3)}
        facts_2 = {
            "p1": ProductFact(price_cents=900, stock=2),
            "p2": ProductFact(price_cents=5, stock=0),
        }
        await store.save_tab(
            tab.id, card=_card("one"), snapshot=_snapshot(1), product_facts=facts_1, run_id="r1"
        )
        saved = await store.save_tab(
            tab.id, card=_card("two"), snapshot=_snapshot(2), product_facts=facts_2, run_id="r2"
        )
        assert saved.snapshot == _snapshot(2)
        revisions = await store.tab_revisions(tab.id)
        assert [(r.rev, r.run_id) for r in revisions] == [(1, "r1"), (2, "r2")]
        assert revisions[0].snapshot == _snapshot(1)
        assert revisions[0].product_facts == facts_1
        assert revisions[1].card == _card("two")
        (reread,) = await store.open_tabs("sam")
        assert reread.snapshot == _snapshot(2)
        assert reread.product_facts == facts_2
        assert reread.card == _card("two")
        assert reread.updated_at >= reread.created_at

    async def test_only_twenty_revisions_are_kept(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        tab = await store.create_tab(
            "sam", surface_id="shop:1", kind="compare", card=_card("1"), language="en"
        )
        for n in range(1, 24):
            await store.save_tab(
                tab.id, card=_card(str(n)), snapshot=_snapshot(n), product_facts={}, run_id=f"r{n}"
            )
        revisions = await store.tab_revisions(tab.id)
        assert TAB_REVISIONS_KEPT == 20
        assert [r.rev for r in revisions] == list(range(4, 24))
        assert revisions[-1].snapshot == _snapshot(23)

    async def test_surface_ids_are_unique(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        await store.create_tab(
            "sam", surface_id="shop:1", kind="compare", card=_card("1"), language="en"
        )
        with pytest.raises(ValueError):
            await store.create_tab(
                "ana", surface_id="shop:1", kind="compare", card=_card("1"), language="es"
            )

    async def test_save_unknown_tab_raises(self, store: Store) -> None:
        with pytest.raises(KeyError):
            await store.save_tab(
                "no-such-tab", card=_card("x"), snapshot=_snapshot(1), product_facts={}, run_id="r"
            )
