"""The checked action path: every direct action names a known direct action, carries a
`requestId`, and comes from a source allowed to send it; a repeated `requestId` gets the first
answer. Then the handlers: the cart and switching shopper."""

import asyncio
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from halden_data_fake import FakeCatalogSource
from obsidian_agent.actions import ACTIONS, SHELL_SURFACE, ActionSpec, check_source, load_actions
from obsidian_agent.app import create_app
from obsidian_agent.model import ScriptedModel
from obsidian_agent.session import SESSION_COOKIE, sign
from obsidian_data_contract import Cartridge, CatalogSource, Product
from obsidian_store import MemoryStore, Snapshot

KEY = b"test-session-key"
# Every product these tests add has an add button on the shopper's page.
ON_THE_PAGE = (
    "aeris-studio-16",
    "kore-zephyr-14",
    "kore-forge-17",
    "lumen-slate-16",
    "ghost-laptop-99",
)


def _button_id(product_id: str) -> str:
    return f"add-{product_id}"


def _page(surface_id: str, product_ids: tuple[str, ...] = ON_THE_PAGE) -> Snapshot:
    """A page with one `AddToCartButton` per product, and a shelf (not a button)."""
    buttons = [
        {"id": _button_id(product_id), "component": "AddToCartButton", "productId": product_id}
        for product_id in product_ids
    ]
    children = ["shelf", *(button["id"] for button in buttons)]
    return {
        "version": "v1.0",
        "createSurface": {
            "surfaceId": surface_id,
            "components": [
                {"id": "root", "component": "Page", "title": "Laptops", "children": children},
                {"id": "shelf", "component": "ProductShelf", "items": []},
                *buttons,
            ],
        },
    }


class _Shop:
    """A client, the store behind it, and the demo shopper's open page."""

    def __init__(self, source: CatalogSource | None = None) -> None:
        catalog = source or FakeCatalogSource()
        self.store = MemoryStore()
        self.surface_id = self.open_page("demo-user")
        self.client = TestClient(
            create_app(
                model=ScriptedModel([]),
                cartridge=Cartridge("halden", "Halden", lambda: catalog),
                store=self.store,
                session_key=KEY,
            )
        )

    def open_page(self, user_id: str) -> str:
        surface_id = f"shop:{uuid.uuid4().hex}"
        tab = asyncio.run(
            self.store.create_tab(
                user_id, surface_id=surface_id, kind="compare", card={}, language="en"
            )
        )
        asyncio.run(
            self.store.save_tab(
                tab.id, card={}, snapshot=_page(surface_id), product_facts={}, run_id="r"
            )
        )
        return surface_id

    def as_user(self, user_id: str) -> "_Shop":
        # One session cookie: drop the one the server set, if any.
        self.client.cookies.clear()
        self.client.cookies.set(SESSION_COOKIE, sign(user_id, KEY))
        return self

    def post(
        self, name: str, surface_id: str, source_id: str, context: dict[str, Any]
    ) -> dict[str, Any]:
        response = self.client.post(
            "/api/actions",
            json={
                "name": name,
                "surfaceId": surface_id,
                "sourceComponentId": source_id,
                "context": context,
            },
        )
        assert response.status_code == 200
        body: dict[str, Any] = response.json()
        return body

    def add(
        self,
        product_id: Any,
        request_id: str | None = None,
        *,
        surface_id: str | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        """`cart.add` from the product's add button on the page (the demo shopper's, unless
        `surface_id` names another)."""
        context = {"productId": product_id, "requestId": request_id or _rid(), **extra}
        source = _button_id(product_id) if isinstance(product_id, str) else _button_id("x")
        return self.post("cart.add", surface_id or self.surface_id, source, context)

    def act(self, name: str, **context: Any) -> dict[str, Any]:
        """A cart drawer action."""
        context.setdefault("requestId", _rid())
        return self.post(name, SHELL_SURFACE, "cart-drawer", context)

    def stored_qtys(self, user_id: str = "demo-user") -> dict[str, int]:
        return {line.product_id: line.qty for line in asyncio.run(self.store.cart(user_id))}


def _rid() -> str:
    return str(uuid.uuid4())


def _qtys(result: dict[str, Any]) -> dict[str, int]:
    return {line["productId"]: line["qty"] for line in result["cart"]}


def _invalid(result: dict[str, Any]) -> bool:
    return result["ok"] is False and result["error"]["code"] == "invalid"


# The registry


def test_the_registry_has_one_kind_per_action() -> None:
    assert set(ACTIONS) >= {"openCart", "cart.add", "cart.set_qty", "cart.remove"}
    assert ACTIONS["openCart"] == ActionSpec(kind="local", sources=())
    assert ACTIONS["cart.add"] == ActionSpec(kind="direct", sources=("AddToCartButton",))
    assert ACTIONS["session.switch_user"].sources == ("shell:user-menu",)
    assert all(spec.kind in ("local", "direct", "agent") for spec in ACTIONS.values())


@pytest.mark.parametrize(
    "text",
    [
        '{"x": {"kind": "remote"}}',
        '{"x": {}}',
        '{"x": {"kind": "direct"}}',
        '{"x": {"kind": "direct", "sources": "AddToCartButton"}}',
        '{"x": {"kind": "direct", "sources": [7]}}',
    ],
)
def test_a_malformed_registry_entry_is_refused(text: str) -> None:
    with pytest.raises(ValueError, match="action x"):
        load_actions(text)


def test_check_source_rules() -> None:
    shop = _Shop()
    tabs = asyncio.run(shop.store.open_tabs("demo-user"))
    add = ACTIONS["cart.add"]
    context = {"productId": "aeris-studio-16"}
    ok = check_source(
        add,
        surface_id=shop.surface_id,
        source_id="add-aeris-studio-16",
        context=context,
        open_tabs=tabs,
    )
    assert ok is None
    for surface_id, source_id, ctx in [
        ("shop:other", "add-aeris-studio-16", context),
        (shop.surface_id, "shelf", context),
        (shop.surface_id, "missing", context),
        (shop.surface_id, "add-kore-zephyr-14", context),
        (SHELL_SURFACE, "cart-drawer", context),
    ]:
        problem = check_source(
            add, surface_id=surface_id, source_id=source_id, context=ctx, open_tabs=tabs
        )
        assert problem, (surface_id, source_id)


# The checks, in order


def test_unknown_action_is_rejected() -> None:
    shop = _Shop()
    assert _invalid(shop.act("cart.empty", productId="aeris-studio-16"))


def test_local_action_is_rejected() -> None:
    shop = _Shop()
    shop.add("aeris-studio-16")
    result = shop.post("openCart", SHELL_SURFACE, "cart-drawer", {"requestId": _rid()})
    assert _invalid(result)
    assert result["error"]["message"] == "openCart is a local action; it does not go to the server."
    assert shop.stored_qtys() == {"aeris-studio-16": 1}


@pytest.mark.parametrize("request_id", [None, 7, ""])
def test_missing_request_id_is_rejected(request_id: Any) -> None:
    shop = _Shop()
    context: dict[str, Any] = {"productId": "aeris-studio-16"}
    if request_id is not None:
        context["requestId"] = request_id
    result = shop.post("cart.add", shop.surface_id, "add-aeris-studio-16", context)
    assert _invalid(result)
    assert shop.stored_qtys() == {}


def test_repeated_request_id_returns_the_first_result() -> None:
    shop = _Shop()
    first = shop.add("aeris-studio-16", request_id="r1")
    second = shop.add("aeris-studio-16", request_id="r2")
    again = shop.add("aeris-studio-16", request_id="r1")

    assert _qtys(first) == {"aeris-studio-16": 1}
    assert _qtys(second) == {"aeris-studio-16": 2}
    assert again == first
    assert shop.stored_qtys() == {"aeris-studio-16": 2}


def test_rejections_are_not_stored() -> None:
    shop = _Shop()
    refused = shop.post(
        "cart.add", shop.surface_id, "shelf", {"productId": "aeris-studio-16", "requestId": "r1"}
    )
    accepted = shop.add("aeris-studio-16", request_id="r1")
    assert _invalid(refused)
    assert accepted["ok"] and _qtys(accepted) == {"aeris-studio-16": 1}


def test_request_id_of_another_shopper_is_rejected() -> None:
    shop = _Shop()
    shop.add("aeris-studio-16", request_id="r1")
    ana_surface = shop.open_page("ana")
    result = shop.as_user("ana").add("aeris-studio-16", request_id="r1", surface_id=ana_surface)
    assert _invalid(result)
    assert result["cart"] == []
    assert shop.stored_qtys("ana") == {}


def test_surface_must_be_an_open_tab_of_this_shopper() -> None:
    shop = _Shop()
    demo_surface = shop.surface_id
    shop.open_page("ana")
    result = shop.as_user("ana").post(
        "cart.add",
        demo_surface,
        "add-aeris-studio-16",
        {"productId": "aeris-studio-16", "requestId": _rid()},
    )
    assert _invalid(result)
    assert shop.stored_qtys("ana") == {} and shop.stored_qtys() == {}


def test_source_must_be_an_add_button_on_that_page() -> None:
    shop = _Shop()

    def add_from(source_id: str, product_id: str) -> dict[str, Any]:
        context = {"productId": product_id, "requestId": _rid()}
        return shop.post("cart.add", shop.surface_id, source_id, context)

    assert _invalid(add_from("shelf", "aeris-studio-16"))
    assert _invalid(add_from("no-such-component", "aeris-studio-16"))
    assert _invalid(add_from("add-aeris-studio-16", "kore-zephyr-14"))
    assert shop.stored_qtys() == {}
    assert add_from("add-aeris-studio-16", "aeris-studio-16")["ok"]


def test_shell_source_only_for_shell_actions() -> None:
    shop = _Shop()
    assert _invalid(shop.act("cart.add", productId="aeris-studio-16"))
    assert _invalid(
        shop.post(
            "cart.set_qty",
            SHELL_SURFACE,
            "user-menu",
            {"productId": "aeris-studio-16", "qty": 1, "requestId": _rid()},
        )
    )
    assert shop.stored_qtys() == {}
    assert shop.act("cart.set_qty", productId="aeris-studio-16", qty=1)["ok"]


# Switching shopper


def test_switch_user_sets_the_cookie() -> None:
    shop = _Shop()
    ana_surface = shop.open_page("ana")
    assert shop.as_user("ana").add("kore-zephyr-14", surface_id=ana_surface)["ok"]
    shop.as_user("demo-user")

    context = {"userId": "ana", "requestId": "switch-1"}
    response = shop.client.post(
        "/api/actions",
        json={
            "name": "session.switch_user",
            "surfaceId": SHELL_SURFACE,
            "sourceComponentId": "user-menu",
            "context": context,
        },
    )
    body = response.json()
    assert body["ok"] is True
    assert body["user"] == {"id": "ana", "name": "Ana", "language": "es"}
    assert _qtys(body) == {"kore-zephyr-14": 1}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{SESSION_COOKIE}=ana.")
    assert "httponly" in cookie.lower() and "samesite=lax" in cookie.lower()
    assert "path=/" in cookie.lower()
    assert shop.client.get("/api/session").json()["user"]["id"] == "ana"


def test_a_replayed_switch_sets_the_cookie_again() -> None:
    shop = _Shop()
    request = {
        "name": "session.switch_user",
        "surfaceId": SHELL_SURFACE,
        "sourceComponentId": "user-menu",
        "context": {"userId": "sam", "requestId": "switch-1"},
    }
    first = shop.client.post("/api/actions", json=request)
    # The answer was lost: the browser still has the old cookie and sends the request again.
    shop.as_user("demo-user")
    again = shop.client.post("/api/actions", json=request)
    assert again.json() == first.json()
    assert again.headers["set-cookie"].startswith(f"{SESSION_COOKIE}=sam.")


def test_switch_to_an_unknown_shopper() -> None:
    shop = _Shop()
    result = shop.post(
        "session.switch_user",
        SHELL_SURFACE,
        "user-menu",
        {"userId": "ghost", "requestId": _rid()},
    )
    assert result["ok"] is False
    assert result["error"] == {"code": "not_found", "message": "That shopper doesn't exist."}
    assert shop.client.get("/api/session").json()["user"]["id"] == "demo-user"


def test_switch_user_only_from_the_user_menu() -> None:
    shop = _Shop()
    result = shop.post(
        "session.switch_user",
        shop.surface_id,
        "add-aeris-studio-16",
        {"userId": "ana", "requestId": _rid()},
    )
    assert _invalid(result)


# The cart handlers (moved from test_api.py)


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


def test_add_uses_current_price() -> None:
    source = _Repriced()
    shop = _Shop(source)

    first = shop.add("aeris-studio-16", price_cents=1)
    source.prices["aeris-studio-16"] = 179900
    second = shop.add("aeris-studio-16")

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
    shop = _Shop()

    sold_out = shop.add("kore-forge-17")

    assert sold_out["ok"] is False and sold_out["cart"] == []
    assert sold_out["error"]["code"] == "out_of_stock" and sold_out["error"]["message"]
    # Lumen Slate 16 has 3 in stock: the fourth one is refused, the cart keeps three.
    results = [shop.add("lumen-slate-16") for _ in range(4)]
    assert [result["ok"] for result in results] == [True, True, True, False]
    assert results[-1]["error"]["code"] == "out_of_stock"
    assert results[-1]["cart"] == [
        {"productId": "lumen-slate-16", "name": "Lumen Slate 16", "qty": 3, "price_cents": 179900}
    ]


def test_set_qty_checks_stock() -> None:
    shop = _Shop()
    shop.add("lumen-slate-16")

    up = shop.act("cart.set_qty", productId="lumen-slate-16", qty=3)
    too_many = shop.act("cart.set_qty", productId="lumen-slate-16", qty=4)
    down = shop.act("cart.set_qty", productId="lumen-slate-16", qty=1)
    sold_out = shop.act("cart.set_qty", productId="kore-forge-17", qty=1)

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
    shop = _Shop()
    shop.add("aeris-studio-16")
    shop.add("kore-zephyr-14")

    zeroed = shop.act("cart.set_qty", productId="aeris-studio-16", qty=0)
    removed = shop.act("cart.remove", productId="kore-zephyr-14")
    again = shop.act("cart.remove", productId="kore-zephyr-14")

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
    shop = _Shop()
    shop.add("aeris-studio-16")

    result = shop.act(name, **context)

    assert result["ok"] is False and result["error"]["code"] == code
    assert _qtys(result) == {"aeris-studio-16": 1}


def test_cart_endpoint() -> None:
    shop = _Shop()
    assert shop.client.get("/api/cart").json() == {"cart": []}

    shop.add("aeris-studio-16")
    shop.act("cart.set_qty", productId="aeris-studio-16", qty=2)

    assert shop.client.get("/api/cart").json() == {
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
    ("product_id", "code"),
    [("ghost-laptop-99", "not_found"), (None, "invalid"), (7, "invalid")],
)
def test_bad_adds_change_nothing(product_id: Any, code: str) -> None:
    shop = _Shop()
    source = _button_id(product_id) if isinstance(product_id, str) else "add-aeris-studio-16"
    context: dict[str, Any] = {"requestId": _rid()}
    if product_id is not None:
        context["productId"] = product_id

    body = shop.post("cart.add", shop.surface_id, source, context)

    assert body["ok"] is False
    assert body["error"]["code"] == code and body["cart"] == []
