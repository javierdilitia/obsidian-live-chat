"""State outlives a restart and belongs to a shopper: the tab, its page and the cart are in the
store. Each test shares one `MemoryStore` between two apps; the second is "after the restart"."""

import asyncio
from pathlib import Path
from typing import Any

import httpx2
from fastapi import FastAPI
from fastapi.testclient import TestClient

from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_agent.model import ModelResult, ScriptedModel, Usage
from obsidian_agent.session import SESSION_COOKIE, sign
from obsidian_agent.validate import page_product_ids
from obsidian_data_contract import Cartridge, CatalogSource, Product
from obsidian_store import MemoryStore, ProductFact

FIXTURES = Path(__file__).parent / "fixtures"
BUILD = (FIXTURES / "build.a2ui").read_text(encoding="utf-8")
EDIT = (FIXTURES / "edit_add_colour.a2ui").read_text(encoding="utf-8")
KEY = b"test-session-key"


def _reply(text: str) -> ModelResult:
    return ModelResult(
        text=text,
        tool_calls=[],
        usage=Usage(input_tokens=10, cached_tokens=0, output_tokens=5),
        stop="stop",
        latency_ms=1,
    )


def _app(store: MemoryStore, *texts: str, source: CatalogSource | None = None) -> FastAPI:
    catalog = source or FakeCatalogSource()
    return create_app(
        model=ScriptedModel([_reply(text) for text in texts]),
        cartridge=Cartridge("halden", "Halden", lambda: catalog),
        store=store,
        session_key=KEY,
    )


def _as(client: TestClient, user_id: str) -> TestClient:
    client.cookies.set(SESSION_COOKIE, sign(user_id, KEY))
    return client


def _run(client: TestClient, command: str) -> None:
    response = client.post("/api/runs", json={"command": command})
    assert response.status_code == 200
    assert '"RUN_FINISHED"' in response.text, response.text


def _add(client: TestClient, product_id: str) -> dict[str, Any]:
    response = client.post(
        "/api/actions",
        json={
            "name": "cart.add",
            "surfaceId": "shell",
            "sourceComponentId": "cart-drawer",
            "context": {"productId": product_id},
        },
    )
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def test_restart_keeps_the_tab_page_and_cart() -> None:
    store = MemoryStore()
    before = TestClient(_app(store, BUILD))
    _run(before, "Compare laptops")
    assert _add(before, "aeris-studio-16")["ok"]
    saved = before.get("/api/workspace").json()
    assert saved["tab"]["snapshot"] is not None

    after = TestClient(_app(store))
    restored = after.get("/api/workspace").json()

    assert restored == saved
    assert restored["tab"]["title"] == "Compare laptops"
    assert [(line["productId"], line["qty"]) for line in restored["cart"]] == [
        ("aeris-studio-16", 1)
    ]


def test_each_shopper_has_their_own_workspace() -> None:
    store = MemoryStore()
    client = TestClient(_app(store, BUILD))
    _run(client, "Compare laptops")
    _add(client, "aeris-studio-16")

    ana = _as(TestClient(_app(store)), "ana")
    assert ana.get("/api/workspace").json() == {"tab": None, "cart": []}
    assert ana.get("/api/cart").json() == {"cart": []}
    demo = TestClient(_app(store)).get("/api/workspace").json()
    assert demo["tab"] is not None and demo["cart"]


def test_a_run_saves_a_revision_with_product_facts() -> None:
    store = MemoryStore()
    source = FakeCatalogSource()
    client = TestClient(_app(store, BUILD, EDIT, source=source))
    _run(client, "Compare laptops")
    _run(client, "Add a colour section")

    (tab,) = asyncio.run(store.open_tabs("demo-user"))
    revisions = asyncio.run(store.tab_revisions(tab.id))
    assert [revision.rev for revision in revisions] == [1, 2]
    edited = revisions[1]
    assert edited.snapshot == tab.snapshot
    ids = page_product_ids(edited.snapshot)
    assert ids and set(edited.product_facts) == ids
    for product_id, fact in edited.product_facts.items():
        product = asyncio.run(source.get_product(product_id))
        assert fact == ProductFact(price_cents=product.price_cents, stock=product.stock)
    assert edited.card == {
        "title": "Compare laptops",
        "commands": ["Compare laptops", "Add a colour section"],
    }
    assert tab.language == "en"
    assert tab.kind == "compare"


class _OneLeft(FakeCatalogSource):
    """One left of every product, and each `get_product` waits until two requests are reading,
    so both requests sit between the stock read and the cart write at the same time."""

    def __init__(self) -> None:
        super().__init__()
        self.readers = 0
        self.both_reading = asyncio.Event()

    async def get_product(self, product_id: str) -> Product:
        product = await super().get_product(product_id)
        self.readers += 1
        if self.readers >= 2:
            self.both_reading.set()
        await asyncio.wait_for(self.both_reading.wait(), timeout=5)
        return product.model_copy(update={"stock": 1})


async def test_interleaved_adds_take_the_last_item_once() -> None:
    store = MemoryStore()
    app = _app(store, source=_OneLeft())
    body = {
        "name": "cart.add",
        "surfaceId": "shell",
        "sourceComponentId": "cart-drawer",
        "context": {"productId": "aeris-studio-16"},
    }
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
        responses = await asyncio.gather(
            client.post("/api/actions", json=body), client.post("/api/actions", json=body)
        )
    results = [response.json() for response in responses]
    assert sorted(result["ok"] for result in results) == [False, True]
    (refused,) = [result for result in results if not result["ok"]]
    assert refused["error"]["code"] == "out_of_stock"
    lines = await store.cart("demo-user")
    assert [(line.product_id, line.qty) for line in lines] == [("aeris-studio-16", 1)]


def test_vanished_product_leaves_the_stored_cart() -> None:
    store = MemoryStore()
    asyncio.run(store.add_to_cart("demo-user", "ghost-laptop-99", stock=5))
    asyncio.run(store.add_to_cart("demo-user", "aeris-studio-16", stock=5))
    client = TestClient(_app(store))

    cart = client.get("/api/cart").json()["cart"]

    assert [line["productId"] for line in cart] == ["aeris-studio-16"]
    remaining = asyncio.run(store.cart("demo-user"))
    assert [line.product_id for line in remaining] == ["aeris-studio-16"]
    after = TestClient(_app(store)).get("/api/cart").json()["cart"]
    assert [line["productId"] for line in after] == ["aeris-studio-16"]
