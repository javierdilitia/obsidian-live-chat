"""The shopper's language: stored per user, set from the shell's language menu through the
checked action path, kept across a restart, and carried into every run."""

import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_agent.model import ModelResult, ScriptedModel, Usage
from obsidian_agent.session import SESSION_COOKIE, sign
from obsidian_data_contract import Cartridge
from obsidian_store import MemoryStore

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


def _app(store: MemoryStore, *texts: str) -> FastAPI:
    catalog = FakeCatalogSource()
    return create_app(
        model=ScriptedModel([_reply(text) for text in texts]),
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
