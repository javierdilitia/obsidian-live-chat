"""Reusable pytest suite that every `Store` implementation must pass.

Usage, in the implementing package's tests:

    class TestMyStore(StoreContract):
        @pytest.fixture
        def store(self) -> Store: ...   # an empty store

Needs the `testing` extra (pytest, pytest-asyncio). For readable assertion diffs, call
`pytest.register_assert_rewrite("obsidian_store.contract_tests")` in a conftest.py.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from obsidian_store.models import ActionRecord, CartChange, ProductFact, RunRecord, User
from obsidian_store.store import ACTION_RESULT_TTL, TAB_REVISIONS_KEPT, Store

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

    # Cart

    async def test_add_respects_stock(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        assert await store.add_to_cart("sam", "p1", stock=2) == CartChange(ok=True, qty=1)
        assert await store.add_to_cart("sam", "p1", stock=2) == CartChange(ok=True, qty=2)
        assert await store.add_to_cart("sam", "p1", stock=2) == CartChange(ok=False, qty=2)
        assert [(line.product_id, line.qty) for line in await store.cart("sam")] == [("p1", 2)]

    async def test_add_out_of_stock_leaves_no_line(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        assert await store.add_to_cart("sam", "p1", stock=0) == CartChange(ok=False, qty=0)
        assert await store.cart("sam") == []

    async def test_concurrent_adds_take_the_last_item_once(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        changes = await asyncio.gather(
            store.add_to_cart("sam", "p1", stock=1), store.add_to_cart("sam", "p1", stock=1)
        )
        assert sorted(change.ok for change in changes) == [False, True]
        assert [(line.product_id, line.qty) for line in await store.cart("sam")] == [("p1", 1)]

    async def test_set_qty_rules(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        for _ in range(3):
            await store.add_to_cart("sam", "p1", stock=5)
        assert await store.set_cart_qty("sam", "p1", 2, stock=1) == CartChange(ok=True, qty=2)
        assert await store.set_cart_qty("sam", "p1", 5, stock=4) == CartChange(ok=False, qty=2)
        assert await store.set_cart_qty("sam", "p1", 4, stock=4) == CartChange(ok=True, qty=4)
        assert await store.set_cart_qty("sam", "p1", 0, stock=4) == CartChange(ok=True, qty=0)
        assert await store.cart("sam") == []

    async def test_set_qty_adds_a_missing_line_within_stock(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        assert await store.set_cart_qty("sam", "p1", 3, stock=2) == CartChange(ok=False, qty=0)
        assert await store.set_cart_qty("sam", "p1", 2, stock=2) == CartChange(ok=True, qty=2)
        assert [(line.product_id, line.qty) for line in await store.cart("sam")] == [("p1", 2)]

    async def test_cart_is_per_user_and_keeps_order(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        for product_id in ("b", "a", "c"):
            await store.add_to_cart("ana", product_id, stock=9)
        await store.add_to_cart("ana", "b", stock=9)
        await store.remove_from_cart("ana", "c")
        await store.remove_from_cart("ana", "never-added")
        lines = await store.cart("ana")
        assert [(line.product_id, line.qty) for line in lines] == [("b", 2), ("a", 1)]
        assert all(line.added_at.tzinfo is not None for line in lines)
        assert await store.cart("sam") == []

    # Runs

    async def test_runs_round_trip(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        start = datetime(2026, 11, 12, 10, 0, tzinfo=UTC)
        later = RunRecord(
            id="run-2",
            user_id="sam",
            tab_id=None,
            trigger="command",
            tool=None,
            outcome="build_failed",
            router_model=None,
            ui_model=None,
            tokens_in=0,
            tokens_out=0,
            tokens_cached=0,
            latency_ms=10,
            first_message_ms=None,
            retries=0,
            tool_round_used=False,
            error="boom",
            started_at=start + timedelta(minutes=1),
            finished_at=start + timedelta(minutes=2),
        )
        earlier = RunRecord(
            id="run-1",
            user_id="sam",
            tab_id="tab-1",
            trigger="command",
            tool="create_tab",
            outcome="ok",
            router_model="router",
            ui_model="ui",
            tokens_in=1200,
            tokens_out=800,
            tokens_cached=1024,
            latency_ms=9000,
            first_message_ms=4000,
            retries=1,
            tool_round_used=True,
            error=None,
            started_at=start,
            finished_at=start + timedelta(seconds=9),
        )
        await store.record_run(later)
        await store.record_run(earlier)
        assert await store.runs("sam") == [earlier, later]
        assert await store.runs("ana") == []

    # Action results (idempotency)

    async def test_action_results_expire(self, store: Store) -> None:
        await store.upsert_users(SHOPPERS)
        now = datetime.now(UTC)
        old = ActionRecord(
            request_id="old", user_id="sam", result={"ok": True}, at=now - timedelta(hours=25)
        )
        fresh = ActionRecord(
            request_id="fresh", user_id="sam", result={"ok": False, "cart": []}, at=now
        )
        await store.save_action_result(old)
        await store.save_action_result(fresh)
        since = now - ACTION_RESULT_TTL
        assert timedelta(hours=24) == ACTION_RESULT_TTL
        assert await store.action_result("old", since=since) is None
        assert await store.action_result("fresh", since=since) == fresh
        assert await store.action_result("unknown", since=since) is None
        assert await store.purge_action_results(since) == 1
        assert await store.action_result("old", since=now - timedelta(days=2)) is None
        assert await store.action_result("fresh", since=since) == fresh
