"""The API: a run streams AG-UI frames over SSE, the catalog reads, and the cart action."""

import asyncio
import copy
import json
import re
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import obsidian_agent.app as app_module
from halden_data_fake import FakeCatalogSource
from obsidian_agent.a2ui_adapter import apply_messages, compile_block, decompile
from obsidian_agent.app import create_app
from obsidian_agent.model import ModelFailed, ModelResult, ScriptedModel, Usage
from obsidian_agent.settings import API_KEY, ENDPOINT, UI_DEPLOYMENT
from obsidian_data_contract import Cartridge, CatalogSource, Product

FIXTURES = Path(__file__).parent / "fixtures"
BUILD = (FIXTURES / "build.a2ui").read_text(encoding="utf-8")
EDIT = (FIXTURES / "edit_add_colour.a2ui").read_text(encoding="utf-8")
SURFACE_ID = re.compile(r"^shop:[0-9a-f]{32}$")


def _reply(text: str) -> ModelResult:
    return ModelResult(
        text=text,
        tool_calls=[],
        usage=Usage(input_tokens=10, cached_tokens=0, output_tokens=5),
        stop="stop",
        latency_ms=1,
    )


def _cartridge(source: CatalogSource) -> Cartridge:
    return Cartridge("halden", "Halden", lambda: source)


def _cart_client() -> TestClient:
    """A client with no model replies, for the cart and catalog endpoints."""
    app = create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    return TestClient(app)


def _app(*texts: str, source: FakeCatalogSource | None = None) -> tuple[FastAPI, ScriptedModel]:
    model = ScriptedModel([_reply(text) for text in texts])
    return create_app(model=model, cartridge=_cartridge(source or FakeCatalogSource())), model


def _run(client: TestClient, command: str) -> list[dict[str, Any]]:
    response = client.post("/api/runs", json={"command": command})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    return _frames(response.text)


def _frames(text: str) -> list[dict[str, Any]]:
    """Each `data: <json>` frame, in order. Every frame ends with a blank line."""
    assert text.endswith("\n\n")
    frames: list[dict[str, Any]] = []
    for chunk in text.split("\n\n")[:-1]:
        assert chunk.startswith("data: ") and "\n" not in chunk
        frames.append(json.loads(chunk.removeprefix("data: ")))
    return frames


def _kinds(frames: list[dict[str, Any]]) -> list[str]:
    return [frame.get("name", frame["type"]) for frame in frames]


def _a2ui(frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [frame["value"] for frame in frames if frame.get("name") == "a2ui"]


def _component_ids(message: dict[str, Any]) -> set[str]:
    body = message.get("createSurface") or message["updateComponents"]
    return {component["id"] for component in body["components"]}


def test_first_run_opens_tab_and_streams_messages() -> None:
    app, model = _app(BUILD)
    client = TestClient(app)

    frames = _run(client, "Compare 3 laptops for video editing under €2,000")

    assert _kinds(frames) == ["RUN_STARTED", "tab_opened", "a2ui", "RUN_FINISHED"]
    started, opened, page, finished = frames
    assert started["runId"] == finished["runId"] and started["runId"]
    tab = opened["value"]
    assert opened["type"] == "CUSTOM" and SURFACE_ID.match(tab["surface_id"])
    assert tab["title"] == "Compare 3 laptops for video editing under €2,000"
    assert page["type"] == "CUSTOM"
    assert page["value"] == compile_block(BUILD, surface_id=tab["surface_id"], current=None)[0]
    workspace = app.state.workspace
    assert workspace.tab.snapshot == page["value"]
    assert workspace.tab.commands == ["Compare 3 laptops for video editing under €2,000"]
    assert len(model.calls) == 1


def test_second_run_edits_only_changed_ids() -> None:
    app, model = _app(BUILD, EDIT)
    client = TestClient(app)
    first = _run(client, "Compare 3 laptops for video editing under €2,000")
    built = _a2ui(first)[0]
    surface_id = built["createSurface"]["surfaceId"]

    frames = _run(client, "Add colour accuracy for grading")

    assert _kinds(frames) == ["RUN_STARTED", "a2ui", "RUN_FINISHED"]
    [edit] = _a2ui(frames)
    assert edit["updateComponents"]["surfaceId"] == surface_id
    sent = _component_ids(edit)
    assert {"root", "colour"} <= sent
    assert not sent & (_component_ids(built) - {"root"})
    assert json.dumps(decompile(built))[1:-1] in json.dumps(model.calls[1]["input"])
    workspace = app.state.workspace
    assert workspace.tab.snapshot == apply_messages(built, [edit])
    assert len(workspace.tab.commands) == 2


def test_failed_edit_keeps_the_page() -> None:
    app, _ = _app(BUILD, "Sorry, no page.", "Still no page.", EDIT)
    client = TestClient(app)
    _run(client, "Compare 3 laptops for video editing under €2,000")
    tab = app.state.workspace.tab
    stored = tab.snapshot
    before = copy.deepcopy(stored)

    frames = _run(client, "Add colour accuracy for grading")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    error = frames[-1]
    assert error["code"] == "edit_failed" and error["message"] == "Couldn't change this page."
    assert tab.snapshot is stored and tab.snapshot == before
    assert len(tab.commands) == 1
    # The page is still there to edit.
    assert _kinds(_run(client, "Add colour accuracy for grading")) == [
        "RUN_STARTED",
        "a2ui",
        "RUN_FINISHED",
    ]


def test_failed_first_build_keeps_the_tab_and_builds_again() -> None:
    app, model = _app("no page", "no page", BUILD)
    client = TestClient(app)

    first = _run(client, "Compare laptops")
    second = _run(client, "Compare laptops")

    assert _kinds(first) == ["RUN_STARTED", "tab_opened", "RUN_ERROR"]
    assert first[-1]["code"] == "build_failed"
    assert _kinds(second) == ["RUN_STARTED", "a2ui", "RUN_FINISHED"]
    surface_id = first[1]["value"]["surface_id"]
    assert _a2ui(second)[0]["createSurface"]["surfaceId"] == surface_id
    assert "current page" not in json.dumps(model.calls[2]["input"])


def test_model_error_is_a_run_error() -> None:
    app, _ = _app()  # the scripted model has nothing to say: it raises

    frames = _run(TestClient(app), "Compare laptops")

    assert _kinds(frames) == ["RUN_STARTED", "tab_opened", "RUN_ERROR"]
    assert frames[-1]["code"] == "model_unavailable"
    assert app.state.workspace.tab.snapshot is None


class _Unusable:
    """A model whose every response is unusable (failed or filtered)."""

    async def call(self, **_kwargs: Any) -> ModelResult:
        raise ModelFailed("response failed: content filtered")


def test_unusable_reply_is_a_failed_build() -> None:
    app = create_app(model=_Unusable(), cartridge=_cartridge(FakeCatalogSource()))

    frames = _run(TestClient(app), "Compare laptops")

    assert _kinds(frames) == ["RUN_STARTED", "tab_opened", "RUN_ERROR"]
    assert frames[-1] == {
        "type": "RUN_ERROR",
        "code": "build_failed",
        "message": "Couldn't build this page.",
    }


class _SlowEdit:
    """Builds the page at once, then takes forever over the edit."""

    def __init__(self) -> None:
        self.calls = 0

    async def call(self, **_kwargs: Any) -> ModelResult:
        self.calls += 1
        if self.calls == 1:
            return _reply(BUILD)
        await asyncio.sleep(30)
        raise AssertionError("the run should have timed out")


def test_run_timeout_keeps_the_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_module, "RUN_TIMEOUT_S", 0.05)
    app = create_app(model=_SlowEdit(), cartridge=_cartridge(FakeCatalogSource()))
    client = TestClient(app)
    _run(client, "Compare 3 laptops for video editing under €2,000")
    tab = app.state.workspace.tab
    before = copy.deepcopy(tab.snapshot)

    frames = _run(client, "Add colour accuracy for grading")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    assert frames[-1] == {
        "type": "RUN_ERROR",
        "code": "timeout",
        "message": "This took too long. Try again.",
    }
    assert tab.snapshot == before and len(tab.commands) == 1


def test_missing_settings_is_a_run_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(app_module, "ENV_FILE", tmp_path / ".env")
    for name in (ENDPOINT, API_KEY, UI_DEPLOYMENT):
        monkeypatch.delenv(name, raising=False)
    app = create_app(cartridge=_cartridge(FakeCatalogSource()))

    frames = _run(TestClient(app), "Compare laptops")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    assert frames[-1]["code"] == "not_configured"
    assert UI_DEPLOYMENT in frames[-1]["message"]
    assert app.state.workspace.tab is None


def test_empty_command_is_rejected() -> None:
    app, _ = _app()
    assert TestClient(app).post("/api/runs", json={"command": "  "}).status_code == 422


def test_workspace_returns_tab_and_cart() -> None:
    app, _ = _app("no page", "no page", BUILD)
    client = TestClient(app)
    assert client.get("/api/workspace").json() == {"tab": None, "cart": []}

    # A failed first build leaves the tab open with no page yet.
    opened = _run(client, "Compare laptops")[1]["value"]
    empty = {"surface_id": opened["surface_id"], "title": opened["title"], "snapshot": None}
    assert client.get("/api/workspace").json() == {"tab": empty, "cart": []}

    page = _a2ui(_run(client, "Compare laptops"))[0]
    _add(client, "aeris-studio-16")
    _add(client, "aeris-studio-16")
    _add(client, "kore-zephyr-14")

    response = client.get("/api/workspace")
    assert response.status_code == 200
    assert response.json() == {
        "tab": {"surface_id": opened["surface_id"], "title": "Compare laptops", "snapshot": page},
        "cart": [
            {
                "productId": "aeris-studio-16",
                "name": "Aeris Studio 16",
                "qty": 2,
                "price_cents": 189900,
            },
            {
                "productId": "kore-zephyr-14",
                "name": "Kore Zephyr 14",
                "qty": 1,
                "price_cents": 174900,
            },
        ],
    }
    assert page == app.state.workspace.tab.snapshot


class _Repriced(FakeCatalogSource):
    """The fake catalog, with prices that can change while the page is open."""

    def __init__(self) -> None:
        super().__init__()
        self.prices: dict[str, int] = {}

    def _priced(self, product: Product) -> Product:
        price = self.prices.get(product.id)
        return product if price is None else product.model_copy(update={"price_cents": price})

    async def get_product(self, product_id: str) -> Product:
        return self._priced(await super().get_product(product_id))

    async def get_products(self, product_ids: list[str]) -> list[Product]:
        return [self._priced(product) for product in await super().get_products(product_ids)]


def _add(client: TestClient, product_id: Any, **extra: Any) -> dict[str, Any]:
    response = client.post(
        "/api/actions",
        json={
            "name": "cart.add",
            "surfaceId": "shop:" + "0" * 32,
            "sourceComponentId": "verdict_button",
            "context": {"productId": product_id, **extra},
        },
    )
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def test_add_uses_current_price() -> None:
    source = _Repriced()
    client = TestClient(create_app(model=ScriptedModel([]), cartridge=_cartridge(source)))

    first = _add(client, "aeris-studio-16", price_cents=1)
    source.prices["aeris-studio-16"] = 179900
    second = _add(client, "aeris-studio-16")

    assert first == {
        "ok": True,
        "cart": [
            {
                "productId": "aeris-studio-16",
                "name": "Aeris Studio 16",
                "qty": 1,
                "price_cents": 189900,
            }
        ],
    }
    assert second["ok"] and second["cart"] == [
        {"productId": "aeris-studio-16", "name": "Aeris Studio 16", "qty": 2, "price_cents": 179900}
    ]


def test_add_out_of_stock() -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )

    sold_out = _add(client, "kore-forge-17")

    assert sold_out["ok"] is False and sold_out["cart"] == []
    assert sold_out["error"]["code"] == "out_of_stock" and sold_out["error"]["message"]
    # Lumen Slate 16 has 3 in stock: the fourth one is refused, the cart keeps three.
    results = [_add(client, "lumen-slate-16") for _ in range(4)]
    assert [result["ok"] for result in results] == [True, True, True, False]
    assert results[-1]["error"]["code"] == "out_of_stock"
    assert results[-1]["cart"] == [
        {"productId": "lumen-slate-16", "name": "Lumen Slate 16", "qty": 3, "price_cents": 179900}
    ]


def _act(client: TestClient, name: str, **context: Any) -> dict[str, Any]:
    response = client.post(
        "/api/actions",
        json={
            "name": name,
            "surfaceId": "shell",
            "sourceComponentId": "cart-drawer",
            "context": context,
        },
    )
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def _qtys(result: dict[str, Any]) -> dict[str, int]:
    return {line["productId"]: line["qty"] for line in result["cart"]}


def test_set_qty_checks_stock() -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )

    # Lumen Slate 16 has 3 in stock.
    up = _act(client, "cart.set_qty", productId="lumen-slate-16", qty=3)
    too_many = _act(client, "cart.set_qty", productId="lumen-slate-16", qty=4)
    down = _act(client, "cart.set_qty", productId="lumen-slate-16", qty=1)
    sold_out = _act(client, "cart.set_qty", productId="kore-forge-17", qty=1)

    assert up["ok"] and _qtys(up) == {"lumen-slate-16": 3}
    assert too_many["ok"] is False and too_many["error"]["code"] == "out_of_stock"
    assert _qtys(too_many) == {"lumen-slate-16": 3}
    assert (
        down["ok"]
        and down["cart"][0]["price_cents"] == 179900
        and _qtys(down) == {"lumen-slate-16": 1}
    )
    assert sold_out["error"]["code"] == "out_of_stock" and _qtys(sold_out) == {"lumen-slate-16": 1}


def test_remove_and_zero_qty() -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )
    _act(client, "cart.add", productId="aeris-studio-16")
    _act(client, "cart.add", productId="kore-zephyr-14")

    zeroed = _act(client, "cart.set_qty", productId="aeris-studio-16", qty=0)
    removed = _act(client, "cart.remove", productId="kore-zephyr-14")
    again = _act(client, "cart.remove", productId="kore-zephyr-14")

    assert zeroed["ok"] and _qtys(zeroed) == {"kore-zephyr-14": 1}
    assert removed["ok"] and removed["cart"] == []
    assert again["ok"] and again["cart"] == []


@pytest.mark.parametrize(
    ("name", "context", "code"),
    [
        ("cart.set_qty", {"productId": "aeris-studio-16"}, "invalid"),
        ("cart.set_qty", {"productId": "aeris-studio-16", "qty": -1}, "invalid"),
        ("cart.set_qty", {"productId": "aeris-studio-16", "qty": "2"}, "invalid"),
        ("cart.set_qty", {"productId": "aeris-studio-16", "qty": True}, "invalid"),
        ("cart.set_qty", {"productId": "ghost-laptop-99", "qty": 1}, "not_found"),
        ("cart.remove", {}, "invalid"),
    ],
)
def test_bad_cart_edits_change_nothing(name: str, context: dict[str, Any], code: str) -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )
    _act(client, "cart.add", productId="aeris-studio-16")

    result = _act(client, name, **context)

    assert result["ok"] is False and result["error"]["code"] == code
    assert _qtys(result) == {"aeris-studio-16": 1}


def test_cart_endpoint() -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )
    assert client.get("/api/cart").json() == {"cart": []}

    _act(client, "cart.add", productId="aeris-studio-16")
    _act(client, "cart.set_qty", productId="aeris-studio-16", qty=2)

    assert client.get("/api/cart").json() == {
        "cart": [
            {
                "productId": "aeris-studio-16",
                "name": "Aeris Studio 16",
                "qty": 2,
                "price_cents": 189900,
            }
        ]
    }


@pytest.mark.parametrize(
    ("name", "product_id", "code"),
    [
        ("cart.add", "ghost-laptop-99", "not_found"),
        ("cart.add", None, "invalid"),
        ("cart.add", 7, "invalid"),
        ("cart.empty", "aeris-studio-16", "invalid"),
    ],
)
def test_bad_actions_change_nothing(name: str, product_id: Any, code: str) -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )

    response = client.post(
        "/api/actions",
        json={
            "name": name,
            "surfaceId": "shop:x",
            "sourceComponentId": "b",
            "context": {} if product_id is None else {"productId": product_id},
        },
    )

    body = response.json()
    assert response.status_code == 200 and body["ok"] is False
    assert body["error"]["code"] == code and body["cart"] == []


def test_products_reports_missing() -> None:
    client = TestClient(
        create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    )

    response = client.get(
        "/api/catalog/products",
        params=[("ids", "aeris-studio-16,ghost-1"), ("ids", "kore-zephyr-14,aeris-studio-16")],
    )

    assert response.status_code == 200
    body = response.json()
    assert [product["id"] for product in body["products"]] == ["aeris-studio-16", "kore-zephyr-14"]
    assert body["missing"] == ["ghost-1"]
    aeris = body["products"][0]
    assert aeris["price_cents"] == 189900 and aeris["specs"]["batt"]["display"] == "18 h"
    assert client.get("/api/catalog/products").json() == {"products": [], "missing": []}
