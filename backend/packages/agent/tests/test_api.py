"""The API: a run streams AG-UI frames over SSE, the workspace, and the catalog reads. The
action path is in test_actions.py."""

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
from obsidian_data_contract import Cartridge, CatalogSource
from obsidian_store import MemoryStore, TabRecord

FIXTURES = Path(__file__).parent / "fixtures"
BUILD = (FIXTURES / "build.a2ui").read_text(encoding="utf-8")
EDIT = (FIXTURES / "edit_add_colour.a2ui").read_text(encoding="utf-8")
SURFACE_ID = re.compile(r"^shop:[0-9a-f]{32}$")


def _create_app(**kwargs: Any) -> FastAPI:
    """The app with a fresh in-memory store, so no test touches a database."""
    return create_app(store=MemoryStore(), **kwargs)


def _tab(app: FastAPI) -> TabRecord | None:
    """The demo shopper's tab, as stored."""
    tabs = asyncio.run(app.state.store.open_tabs("demo-user"))
    return tabs[0] if tabs else None


def _stored(app: FastAPI) -> TabRecord:
    tab = _tab(app)
    assert tab is not None
    return tab


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
    app = _create_app(model=ScriptedModel([]), cartridge=_cartridge(FakeCatalogSource()))
    return TestClient(app)


def _app(*texts: str, source: FakeCatalogSource | None = None) -> tuple[FastAPI, ScriptedModel]:
    model = ScriptedModel([_reply(text) for text in texts])
    return _create_app(model=model, cartridge=_cartridge(source or FakeCatalogSource())), model


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
    tab = _stored(app)
    assert tab.snapshot == page["value"]
    assert tab.card["commands"] == ["Compare 3 laptops for video editing under €2,000"]
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
    tab = _stored(app)
    assert tab.snapshot == apply_messages(built, [edit])
    assert len(tab.card["commands"]) == 2


def test_failed_edit_keeps_the_page() -> None:
    app, _ = _app(BUILD, "Sorry, no page.", "Still no page.", EDIT)
    client = TestClient(app)
    _run(client, "Compare 3 laptops for video editing under €2,000")
    before = copy.deepcopy(_stored(app).snapshot)

    frames = _run(client, "Add colour accuracy for grading")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    error = frames[-1]
    assert error["code"] == "edit_failed" and error["message"] == "Couldn't change this page."
    tab = _stored(app)
    assert tab.snapshot == before
    assert len(tab.card["commands"]) == 1
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
    assert _stored(app).snapshot is None


class _Unusable:
    """A model whose every response is unusable (failed or filtered)."""

    async def call(self, **_kwargs: Any) -> ModelResult:
        raise ModelFailed("response failed: content filtered")


def test_unusable_reply_is_a_failed_build() -> None:
    app = _create_app(model=_Unusable(), cartridge=_cartridge(FakeCatalogSource()))

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
    app = _create_app(model=_SlowEdit(), cartridge=_cartridge(FakeCatalogSource()))
    client = TestClient(app)
    _run(client, "Compare 3 laptops for video editing under €2,000")
    before = copy.deepcopy(_stored(app).snapshot)

    frames = _run(client, "Add colour accuracy for grading")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    assert frames[-1] == {
        "type": "RUN_ERROR",
        "code": "timeout",
        "message": "This took too long. Try again.",
    }
    tab = _stored(app)
    assert tab.snapshot == before and len(tab.card["commands"]) == 1


def test_missing_settings_is_a_run_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(app_module, "ENV_FILE", tmp_path / ".env")
    for name in (ENDPOINT, API_KEY, UI_DEPLOYMENT):
        monkeypatch.delenv(name, raising=False)
    app = _create_app(cartridge=_cartridge(FakeCatalogSource()))

    frames = _run(TestClient(app), "Compare laptops")

    assert _kinds(frames) == ["RUN_STARTED", "RUN_ERROR"]
    assert frames[-1]["code"] == "not_configured"
    assert UI_DEPLOYMENT in frames[-1]["message"]
    assert _tab(app) is None


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
    # The cart as the action handlers leave it (test_actions.py covers how it gets there).
    store = app.state.store
    for product_id in ("aeris-studio-16", "aeris-studio-16", "kore-zephyr-14"):
        asyncio.run(store.add_to_cart("demo-user", product_id, stock=5))

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
    assert page == _stored(app).snapshot


def test_products_reports_missing() -> None:
    client = _cart_client()

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
