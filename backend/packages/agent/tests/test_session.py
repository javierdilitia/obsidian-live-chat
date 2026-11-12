"""The session: a signed `obsidian_session` cookie names the shopper; three shoppers are seeded."""

import asyncio

from fastapi.testclient import TestClient

from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_agent.model import ScriptedModel
from obsidian_agent.session import (
    DEFAULT_USER_ID,
    DEMO_SHOPPERS,
    SESSION_COOKIE,
    sign,
    unsign,
)
from obsidian_data_contract import Cartridge
from obsidian_store import MemoryStore

KEY = b"test-session-key"


def _client(store: MemoryStore | None = None) -> TestClient:
    source = FakeCatalogSource()
    app = create_app(
        model=ScriptedModel([]),
        cartridge=Cartridge("halden", "Halden", lambda: source),
        store=store or MemoryStore(),
        session_key=KEY,
    )
    return TestClient(app)


def _session(client: TestClient, cookie: str | None = None) -> dict[str, str]:
    if cookie is not None:
        client.cookies.set(SESSION_COOKIE, cookie)
    response = client.get("/api/session")
    assert response.status_code == 200
    return response.json()["user"]


def test_sign_round_trips() -> None:
    value = sign("ana", KEY)
    assert value.startswith("ana.")
    assert "=" not in value
    assert unsign(value, KEY) == "ana"


def test_unsign_rejects_anything_changed_or_malformed() -> None:
    value = sign("ana", KEY)
    signature = value.split(".", 1)[1]
    assert unsign(f"sam.{signature}", KEY) is None
    assert unsign(value[:-1] + ("A" if value[-1] != "A" else "B"), KEY) is None
    assert unsign(sign("ana", b"another-key"), KEY) is None
    assert unsign("", KEY) is None
    assert unsign("no-dot", KEY) is None
    assert unsign(".", KEY) is None
    assert unsign("ana.", KEY) is None


def test_seeded_shoppers() -> None:
    assert [(u.id, u.name, u.language) for u in DEMO_SHOPPERS] == [
        ("demo-user", "Javier", "en"),
        ("ana", "Ana", "es"),
        ("sam", "Sam", "en"),
    ]
    assert DEFAULT_USER_ID == "demo-user"


def test_session_without_a_cookie_is_the_demo_user() -> None:
    assert _session(_client()) == {"id": "demo-user", "name": "Javier", "language": "en"}


def test_session_with_a_valid_cookie() -> None:
    assert _session(_client(), sign("ana", KEY)) == {"id": "ana", "name": "Ana", "language": "es"}


def test_session_with_a_tampered_cookie_is_the_demo_user() -> None:
    signature = sign("ana", KEY).split(".", 1)[1]
    assert _session(_client(), f"sam.{signature}")["id"] == "demo-user"
    assert _session(_client(), sign("ana", b"another-key"))["id"] == "demo-user"
    assert _session(_client(), "garbage")["id"] == "demo-user"


def test_session_for_a_user_who_does_not_exist_is_the_demo_user() -> None:
    assert _session(_client(), sign("ghost", KEY))["id"] == "demo-user"


def test_users_lists_the_seeded_shoppers_by_id() -> None:
    response = _client().get("/api/users")
    assert response.status_code == 200
    assert response.json() == {
        "users": [
            {"id": "ana", "name": "Ana", "language": "es"},
            {"id": "demo-user", "name": "Javier", "language": "en"},
            {"id": "sam", "name": "Sam", "language": "en"},
        ]
    }


def test_the_store_is_seeded_on_first_use() -> None:
    store = MemoryStore()
    client = _client(store)
    assert asyncio.run(store.list_users()) == []
    client.get("/api/session")
    assert [user.id for user in asyncio.run(store.list_users())] == ["ana", "demo-user", "sam"]
