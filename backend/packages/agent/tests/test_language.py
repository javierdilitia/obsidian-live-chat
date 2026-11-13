"""The shopper's language: stored per user, set from the shell's language menu through the
checked action path, kept across a restart, and carried into every run."""

import asyncio
import copy
import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import obsidian_agent.app as app_module
from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_agent.model import ModelResult, ScriptedModel, Usage
from obsidian_agent.session import SESSION_COOKIE, sign
from obsidian_data_contract import Cartridge
from obsidian_store import MemoryStore, TabRecord

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


def _app(store: MemoryStore, *texts: str, model: Any = None) -> FastAPI:
    catalog = FakeCatalogSource()
    return create_app(
        model=model or ScriptedModel([_reply(text) for text in texts]),
        cartridge=Cartridge("halden", "Halden", lambda: catalog),
        store=store,
        session_key=KEY,
    )


def _as(client: TestClient, user_id: str) -> TestClient:
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, sign(user_id, KEY))
    return client


def _post_language(
    client: TestClient,
    language: Any,
    *,
    source: str = "language-menu",
    request_id: str | None = None,
    omit: bool = False,
) -> Any:
    context: dict[str, Any] = {"requestId": request_id or str(uuid.uuid4())}
    if not omit:
        context["language"] = language
    return client.post(
        "/api/actions",
        json={
            "name": "prefs.set_language",
            "surfaceId": "shell",
            "sourceComponentId": source,
            "context": context,
        },
    )


def _set_language(client: TestClient, language: Any, **kwargs: Any) -> dict[str, Any]:
    response = _post_language(client, language, **kwargs)
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def _language(client: TestClient) -> str:
    language: str = client.get("/api/session").json()["user"]["language"]
    return language


def test_ana_starts_in_spanish() -> None:
    client = TestClient(_app(MemoryStore()))
    assert _language(_as(client, "ana")) == "es"
    assert _language(_as(client, "demo-user")) == "en"


def test_set_language_stores_it_and_answers_the_user() -> None:
    client = _as(TestClient(_app(MemoryStore())), "ana")

    result = _set_language(client, "en")

    assert result["ok"] is True
    assert result["user"] == {"id": "ana", "name": "Ana", "language": "en"}
    assert isinstance(result["cart"], list)
    assert _language(client) == "en"


def test_set_language_rejects_an_unknown_language() -> None:
    client = _as(TestClient(_app(MemoryStore())), "ana")

    for value in ("fr", "", None):
        result = _set_language(client, value)
        assert result["ok"] is False and result["error"]["code"] == "invalid", value
    missing = _set_language(client, None, omit=True)
    assert missing["ok"] is False and missing["error"]["code"] == "invalid"
    assert _language(client) == "es"


def test_set_language_only_from_the_language_menu() -> None:
    client = _as(TestClient(_app(MemoryStore())), "ana")

    for source in ("user-menu", "cart-drawer"):
        result = _set_language(client, "en", source=source)
        assert result["ok"] is False and result["error"]["code"] == "invalid", source
    assert _language(client) == "es"


def test_set_language_leaves_the_cookie_alone() -> None:
    client = _as(TestClient(_app(MemoryStore())), "ana")

    response = _post_language(client, "en")

    assert response.json()["ok"] is True
    assert "set-cookie" not in response.headers


def test_chosen_language_survives_a_restart() -> None:
    store = MemoryStore()
    before = _as(TestClient(_app(store)), "ana")
    assert _set_language(before, "en")["ok"]

    after = _as(TestClient(_app(store)), "ana")

    assert _language(after) == "en"


# Runs


def _run(client: TestClient, command: str) -> str:
    response = client.post("/api/runs", json={"command": command})
    assert response.status_code == 200
    return response.text


def _tab(store: MemoryStore, user_id: str) -> TabRecord:
    (tab,) = asyncio.run(store.open_tabs(user_id))
    return tab


def _inputs(model: ScriptedModel) -> list[str]:
    return [json.dumps(call["input"], ensure_ascii=False) for call in model.calls]


def test_a_run_writes_in_the_shoppers_language() -> None:
    store = MemoryStore()
    model = ScriptedModel([_reply(BUILD)])
    client = _as(TestClient(_app(store, model=model)), "ana")

    assert '"RUN_FINISHED"' in _run(client, "Compara portátiles")

    assert "Write every text on the page in Spanish." in _inputs(model)[0]
    assert _tab(store, "ana").language == "es"


def test_switching_language_leaves_the_tab_alone() -> None:
    store = MemoryStore()
    client = _as(TestClient(_app(store, BUILD)), "demo-user")
    assert '"RUN_FINISHED"' in _run(client, "Compare laptops")
    before = copy.deepcopy(_tab(store, "demo-user"))

    assert _set_language(client, "es")["ok"]

    after = _tab(store, "demo-user")
    assert after.language == "en"
    assert after.snapshot == before.snapshot


def test_a_failed_edit_keeps_the_tab_language() -> None:
    store = MemoryStore()
    client = _as(TestClient(_app(store, BUILD, "no block", "still no block")), "demo-user")
    assert '"RUN_FINISHED"' in _run(client, "Compare laptops")
    built = copy.deepcopy(_tab(store, "demo-user").snapshot)
    assert _set_language(client, "es")["ok"]

    assert '"edit_failed"' in _run(client, "Añade la precisión de color")

    tab = _tab(store, "demo-user")
    assert tab.language == "en" and tab.snapshot == built


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


def test_a_timed_out_edit_keeps_the_tab_language(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_module, "RUN_TIMEOUT_S", 0.05)
    store = MemoryStore()
    client = _as(TestClient(_app(store, model=_SlowEdit())), "demo-user")
    assert '"RUN_FINISHED"' in _run(client, "Compare laptops")
    built = copy.deepcopy(_tab(store, "demo-user").snapshot)
    assert _set_language(client, "es")["ok"]

    assert '"timeout"' in _run(client, "Añade la precisión de color")

    tab = _tab(store, "demo-user")
    assert tab.language == "en" and tab.snapshot == built


def test_an_edit_keeps_the_tab_language() -> None:
    store = MemoryStore()
    model = ScriptedModel([_reply(BUILD), _reply(EDIT)])
    client = _as(TestClient(_app(store, model=model)), "demo-user")
    assert '"RUN_FINISHED"' in _run(client, "Compare laptops")
    assert _set_language(client, "es")["ok"]

    assert '"RUN_FINISHED"' in _run(client, "Añade la precisión de color")

    assert _tab(store, "demo-user").language == "en"
    edit_input = _inputs(model)[1]
    assert "Write every text on the page in English." in edit_input
    assert "Define every section" not in edit_input


def test_a_page_not_yet_built_takes_the_current_language() -> None:
    store = MemoryStore()
    model = ScriptedModel([_reply("no block"), _reply("still no block"), _reply(BUILD)])
    client = _as(TestClient(_app(store, model=model)), "demo-user")
    assert '"build_failed"' in _run(client, "Compare laptops")
    assert _set_language(client, "es")["ok"]

    assert '"RUN_FINISHED"' in _run(client, "Compara portátiles")

    assert _tab(store, "demo-user").language == "es"
    assert "Write every text on the page in Spanish." in _inputs(model)[2]
