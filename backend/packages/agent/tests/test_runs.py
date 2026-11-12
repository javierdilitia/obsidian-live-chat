"""Every run, whatever its end, writes one `runs` row: outcome, tokens, timing, retries."""

import asyncio
import contextlib
from pathlib import Path
from typing import Any

import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import obsidian_agent.app as app_module
from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_agent.model import ModelClient, ModelResult, ScriptedModel, ToolCall, Usage
from obsidian_agent.settings import API_KEY, ENDPOINT, UI_DEPLOYMENT
from obsidian_data_contract import Cartridge
from obsidian_store import MemoryStore, RunRecord

FIXTURES = Path(__file__).parent / "fixtures"
BUILD = (FIXTURES / "build.a2ui").read_text(encoding="utf-8")


def _reply(text: str, *, calls: list[ToolCall] | None = None) -> ModelResult:
    return ModelResult(
        text=text,
        tool_calls=calls or [],
        usage=Usage(input_tokens=100, cached_tokens=40, output_tokens=7),
        stop="tool_calls" if calls else "stop",
        latency_ms=1,
    )


def _app(store: MemoryStore, model: ModelClient | None) -> FastAPI:
    source = FakeCatalogSource()
    return create_app(
        model=model,
        cartridge=Cartridge("halden", "Halden", lambda: source),
        store=store,
        session_key=b"k",
    )


def _one_run(store: MemoryStore, model: ModelClient | None) -> RunRecord:
    response = TestClient(_app(store, model)).post("/api/runs", json={"command": "Compare laptops"})
    assert response.status_code == 200
    (run,) = asyncio.run(store.runs("demo-user"))
    return run


def test_a_successful_build_records_one_run() -> None:
    store = MemoryStore()
    run = _one_run(store, ScriptedModel([_reply(BUILD)]))
    (tab,) = asyncio.run(store.open_tabs("demo-user"))
    assert run.outcome == "ok"
    assert run.error is None
    assert run.trigger == "command"
    assert run.tool is None
    assert run.tab_id == tab.id
    assert run.ui_model == "ScriptedModel"
    assert run.router_model is None
    assert (run.tokens_in, run.tokens_out, run.tokens_cached) == (100, 7, 40)
    assert run.retries == 0
    assert run.tool_round_used is False
    assert run.first_message_ms is not None
    assert 0 <= run.first_message_ms <= run.latency_ms
    assert run.started_at <= run.finished_at
    assert tab.product_facts and run.id in {
        r.run_id for r in asyncio.run(store.tab_revisions(tab.id))
    }


def test_a_build_that_fails_twice_records_build_failed() -> None:
    run = _one_run(MemoryStore(), ScriptedModel([_reply("no page"), _reply("still no page")]))
    assert run.outcome == "build_failed"
    assert run.retries == 1
    assert run.error
    assert (run.tokens_in, run.tokens_out, run.tokens_cached) == (200, 14, 80)
    assert run.first_message_ms is None


def test_missing_settings_records_not_configured(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(app_module, "ENV_FILE", tmp_path / ".env")
    for name in (ENDPOINT, API_KEY, UI_DEPLOYMENT):
        monkeypatch.delenv(name, raising=False)
    run = _one_run(MemoryStore(), None)
    assert run.outcome == "not_configured"
    assert run.retries == 0
    assert run.tab_id is None
    assert run.ui_model is None
    assert (run.tokens_in, run.tokens_out) == (0, 0)
    assert run.error and UI_DEPLOYMENT in run.error


def test_a_model_error_records_model_unavailable() -> None:
    run = _one_run(MemoryStore(), ScriptedModel([]))
    assert run.outcome == "model_unavailable"
    assert run.retries == 0
    assert run.error


def test_a_tool_round_is_recorded() -> None:
    lookup = ToolCall(call_id="c1", name="get_products", arguments={"ids": ["aeris-studio-16"]})
    run = _one_run(MemoryStore(), ScriptedModel([_reply("", calls=[lookup]), _reply(BUILD)]))
    assert run.outcome == "ok"
    assert run.tool_round_used is True
    assert run.tokens_in == 200


class _SlowStore(MemoryStore):
    """A store whose writes take a moment, as a database's do."""

    async def record_run(self, run: RunRecord) -> None:
        await asyncio.sleep(0.01)
        await super().record_run(run)


class _Hangs:
    """A model that never answers."""

    async def call(self, **_kwargs: Any) -> ModelResult:
        await asyncio.sleep(30)
        raise AssertionError("the client should have gone")


async def test_a_dropped_stream_still_records_a_cancelled_run() -> None:
    store = _SlowStore()
    app = _app(store, _Hangs())
    transport = httpx2.ASGITransport(app=app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
        request = asyncio.create_task(client.post("/api/runs", json={"command": "Compare"}))
        await asyncio.sleep(0.2)
        request.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await request
    for _ in range(50):
        if await store.runs("demo-user"):
            break
        await asyncio.sleep(0.02)
    (run,) = await store.runs("demo-user")
    assert run.outcome == "cancelled"
    assert run.tab_id is not None
