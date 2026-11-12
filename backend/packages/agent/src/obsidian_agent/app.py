"""FastAPI application factory: a run over SSE, the workspace for a reload, catalog reads, cart.

Dev run: `uv run --directory backend uvicorn obsidian_agent.app:create_app --factory --reload`

Each shopper's tab, its page and their cart live in the store (Postgres, or memory without a
database). The Azure model and the store are opened on first use, from the repo's `.env`, so
building the app never reads settings or touches the network.
"""

import asyncio
import json
import logging
import secrets
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Query, Request
from fastapi.responses import StreamingResponse
from openai import AsyncAzureOpenAI
from pydantic import BaseModel, Field, StringConstraints

from obsidian_agent.cartridges import cartridge_setting, load_cartridge
from obsidian_agent.model import AzureModel, ModelClient, ModelFailed, UsageMeter
from obsidian_agent.page_agent import build_page, lookup_products, page_tools
from obsidian_agent.session import (
    DEFAULT_USER_ID,
    DEMO_SHOPPERS,
    SESSION_COOKIE,
    SESSION_KEY_SETTING,
    unsign,
)
from obsidian_agent.settings import MissingSettings, Settings, env_setting
from obsidian_agent.validate import page_size_bytes
from obsidian_data_contract import Cartridge, CatalogSource, NotFoundError
from obsidian_store import (
    ACTION_RESULT_TTL,
    MemoryStore,
    ProductFact,
    RunRecord,
    Store,
    TabRecord,
    User,
)
from obsidian_store.postgres import PostgresStore

log = logging.getLogger(__name__)

# The repo root's `.env` (this file is backend/packages/agent/src/obsidian_agent/app.py).
ENV_FILE = Path(__file__).resolve().parents[5] / ".env"
# A page build is one or a few reasoning calls; past two minutes the shopper has given up.
MODEL_TIMEOUT_S = 120.0
MODEL_MAX_RETRIES = 1
# The whole run (tool rounds, a retry): past this the run ends and the page stays as it was.
RUN_TIMEOUT_S = 150.0
# Room for the reasoning and a full page; a reply cut off here is a `length` stop.
MAX_OUTPUT_TOKENS = 16_000
TITLE_LIMIT = 60
DATABASE_SETTING = "OBSIDIAN_DATABASE_URL"


def azure_model(settings: Settings) -> AzureModel:
    """The demo's model: the Azure client with a bounded timeout and one SDK retry."""
    client = AsyncAzureOpenAI(
        azure_endpoint=settings.endpoint,
        api_key=settings.api_key,
        api_version=settings.api_version,
        timeout=MODEL_TIMEOUT_S,
        max_retries=MODEL_MAX_RETRIES,
    )
    return AzureModel(settings, client=client, max_output_tokens=MAX_OUTPUT_TOKENS)


class RunRequest(BaseModel):
    command: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ActionRequest(BaseModel):
    name: str
    surface_id: str = Field(alias="surfaceId")
    source_component_id: str = Field(alias="sourceComponentId")
    context: dict[str, Any] = Field(default_factory=lambda: {})


@dataclass
class _RunState:
    """What a run learned on its way, for its `runs` row. A run that ends without saying how
    (the client went away) is `cancelled`."""

    outcome: str = "cancelled"
    error: str | None = None
    tab_id: str | None = None
    ui_model: str | None = None
    meter: UsageMeter | None = None
    # Model attempts of a build that returned; 0 when the build raised or never started.
    attempts: int = 0

    def fail(self, code: str, reason: str) -> None:
        self.outcome, self.error = code, reason


def _user_json(user: User) -> dict[str, str]:
    return {"id": user.id, "name": user.name, "language": user.language}


def create_app(
    model: ModelClient | None = None,
    cartridge: Cartridge | None = None,
    store: Store | None = None,
    session_key: bytes | None = None,
) -> FastAPI:
    """The app. Tests pass a `ScriptedModel`; without one, the Azure model is made on first use.

    Without a cartridge, the one `OBSIDIAN_CARTRIDGE` names (or the only one installed) is loaded
    at once, so a bad choice fails at start, naming the installed cartridges.

    Without a store, `OBSIDIAN_DATABASE_URL` names the Postgres database, opened on the first
    request; unset, everything is kept in memory and lost on restart. Without a session key,
    `OBSIDIAN_SESSION_KEY` is used; unset, a random key per process.
    """
    app = FastAPI(title="Obsidian agent", version="0.1.0")
    database_url: str | None = None
    if store is None:
        database_url = env_setting(DATABASE_SETTING, ENV_FILE)
        if database_url is None:
            log.warning(
                "%s is not set: the store is in memory, and nothing survives a restart.",
                DATABASE_SETTING,
            )
            store = MemoryStore()
    if session_key is None:
        configured = env_setting(SESSION_KEY_SETTING, ENV_FILE)
        if configured is None:
            log.warning(
                "%s is not set: a random key signs sessions, so a restart signs every browser "
                "back in as %s.",
                SESSION_KEY_SETTING,
                DEFAULT_USER_ID,
            )
            session_key = secrets.token_bytes(32)
        else:
            session_key = configured.encode("utf-8")
    key = session_key
    app.state.store = store
    ready_lock = asyncio.Lock()
    opened: list[Store] = []

    async def ready() -> Store:
        """The store, opened on the first request: Postgres is connected and migrated (when
        configured), the shoppers are seeded and day-old action results are purged. A failure
        is retried on the next request."""
        if opened:
            return opened[0]
        async with ready_lock:
            if opened:
                return opened[0]
            the_store = store
            if the_store is None:
                the_store = await PostgresStore.connect(database_url or "")
                app.state.store = the_store
            await the_store.upsert_users(DEMO_SHOPPERS)
            await the_store.purge_action_results(datetime.now(UTC) - ACTION_RESULT_TTL)
            opened.append(the_store)
            return the_store

    async def current_user(request: Request) -> User:
        """The shopper the session cookie names, if it verifies and they exist; else demo-user."""
        the_store = await ready()
        user_id = unsign(request.cookies.get(SESSION_COOKIE, ""), key)
        user = await the_store.get_user(user_id) if user_id else None
        if user is None:
            # Seeded in ready(), and an upsert never removes a user.
            user = await the_store.get_user(DEFAULT_USER_ID) or DEMO_SHOPPERS[0]
        return user

    if cartridge is None:
        cartridge = load_cartridge(cartridge_setting(ENV_FILE))
    app.state.cartridge = cartridge
    cartridge_id = cartridge.id
    catalog: CatalogSource = cartridge.make_source()
    # One run at a time per shopper: a second command waits for the first to finish.
    run_locks: dict[str, asyncio.Lock] = {}
    models: list[ModelClient] = [model] if model is not None else []
    # The model's name for the `runs` row: the deployment, or a test model's class name.
    model_names: list[str] = [type(model).__name__] if model is not None else []

    def get_model() -> ModelClient:
        if not models:
            settings = Settings.from_env(ENV_FILE)
            models.append(azure_model(settings))
            model_names.append(settings.ui_deployment)
        return models[0]

    tool_sets: list[list[dict[str, Any]]] = []

    async def get_tools() -> list[dict[str, Any]]:
        """The page tools, made on the first run from the cartridge's categories, then reused:
        the tools go out with every call and must not change (prompt caching)."""
        if not tool_sets:
            tool_sets.append(page_tools(await catalog.list_categories()))
        return tool_sets[0]

    @app.get("/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok", "cartridge": cartridge_id}

    @app.get("/api/session")
    async def session(user: Annotated[User, Depends(current_user)]) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        """The current shopper."""
        return {"user": _user_json(user)}

    @app.get("/api/users")
    async def users() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        """The seeded shoppers, by ID, for the user menu."""
        return {"users": [_user_json(user) for user in await (await ready()).list_users()]}

    @app.post("/api/runs")
    async def runs(  # pyright: ignore[reportUnusedFunction]
        request: RunRequest, user: Annotated[User, Depends(current_user)]
    ) -> StreamingResponse:
        return StreamingResponse(
            run_events(request.command, user),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def first_open_tab(user_id: str) -> TabRecord | None:
        """The shopper's one tab until slice 5 brings several."""
        tabs = await (await ready()).open_tabs(user_id)
        return tabs[0] if tabs else None

    async def run_events(command: str, user: User) -> AsyncIterator[str]:
        """One run's frames; whatever its end, it leaves one `runs` row."""
        the_store = await ready()
        async with run_locks.setdefault(user.id, asyncio.Lock()):
            run_id = uuid.uuid4().hex
            state = _RunState()
            started_at = datetime.now(UTC)
            clock = time.perf_counter()
            first_message_ms: int | None = None
            try:
                async for event in run_steps(command, user, run_id, state):
                    if first_message_ms is None and event.get("name") == "a2ui":
                        first_message_ms = round((time.perf_counter() - clock) * 1000)
                    yield _frame(event)
            finally:
                meter = state.meter
                usage = meter.usage if meter is not None else None
                run = RunRecord(
                    id=run_id,
                    user_id=user.id,
                    tab_id=state.tab_id,
                    trigger="command",
                    tool=None,
                    outcome=state.outcome,
                    router_model=None,
                    ui_model=state.ui_model,
                    tokens_in=usage.input_tokens if usage else 0,
                    tokens_out=usage.output_tokens if usage else 0,
                    tokens_cached=usage.cached_tokens if usage else 0,
                    latency_ms=round((time.perf_counter() - clock) * 1000),
                    first_message_ms=first_message_ms,
                    retries=max(state.attempts - 1, 0),
                    tool_round_used=meter is not None and meter.tool_rounds > 0,
                    error=state.error,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                )
                try:
                    await the_store.record_run(run)
                except Exception:
                    log.exception("run %s: could not record the run", run_id)

    async def run_steps(
        command: str, user: User, run_id: str, state: _RunState
    ) -> AsyncIterator[dict[str, Any]]:
        """The run itself, as AG-UI events. Every way out sets `state.outcome`."""
        the_store = await ready()
        yield {"type": "RUN_STARTED", "runId": run_id}
        try:
            page_model = get_model()
        except MissingSettings as error:
            message = f"Missing settings: {', '.join(error.names)}."
            state.fail("not_configured", message)
            yield _error_event("not_configured", message)
            return
        state.ui_model = model_names[0]
        meter = state.meter = UsageMeter(page_model)
        tab = await first_open_tab(user.id)
        if tab is None:
            tab = await the_store.create_tab(
                user.id,
                surface_id=f"shop:{uuid.uuid4().hex}",
                kind="compare",
                card={"title": _title(command), "commands": []},
                language=user.language,
            )
            value = {"surface_id": tab.surface_id, "title": tab.card["title"]}
            yield {"type": "CUSTOM", "name": "tab_opened", "value": value}
        state.tab_id = tab.id
        current = tab.snapshot
        failed = ("build_failed", "Couldn't build this page.")
        if current is not None:
            failed = ("edit_failed", "Couldn't change this page.")
        try:
            async with asyncio.timeout(RUN_TIMEOUT_S):
                result = await build_page(
                    meter,
                    catalog,
                    tools=await get_tools(),
                    surface_id=tab.surface_id,
                    command=command,
                    current=current,
                )
        except ModelFailed as error:
            log.warning("run %s: unusable model response: %s", run_id, error)
            state.fail(failed[0], f"unusable model response: {error}")
            yield _error_event(*failed)
            return
        except TimeoutError:
            log.warning("run %s: timed out after %.0f s", run_id, RUN_TIMEOUT_S)
            state.fail("timeout", f"timed out after {RUN_TIMEOUT_S:.0f} s")
            yield _error_event("timeout", "This took too long. Try again.")
            return
        except Exception as error:
            log.exception("run %s: the model call failed", run_id)
            state.fail("model_unavailable", f"the model call failed: {error!r}")
            yield _error_event("model_unavailable", "The model is unavailable. Try again.")
            return
        state.attempts = result.attempts
        if not result.ok or result.snapshot is None:
            log.warning(
                "run %s failed after %d attempts: %s", run_id, result.attempts, result.error
            )
            state.fail(failed[0], result.error or "the build failed")
            yield _error_event(*failed)
            return
        card = {"title": tab.card["title"], "commands": [*tab.card["commands"], command]}
        facts = {
            product_id: ProductFact(price_cents=product.price_cents, stock=product.stock)
            for product_id, product in result.products.items()
        }
        await the_store.save_tab(
            tab.id, card=card, snapshot=result.snapshot, product_facts=facts, run_id=run_id
        )
        log.info("run %s: saved a page of %d bytes", run_id, page_size_bytes(result.snapshot))
        state.outcome = "ok"
        for message in result.messages:
            yield {"type": "CUSTOM", "name": "a2ui", "value": message}
        yield {"type": "RUN_FINISHED", "runId": run_id}

    @app.get("/api/workspace")
    async def get_workspace(  # pyright: ignore[reportUnusedFunction]
        user: Annotated[User, Depends(current_user)],
    ) -> dict[str, Any]:
        """What a reloaded page shows: the shopper's tab, with its page if it has one, and their
        cart. `{tab, cart}` until slice 5 brings several tabs."""
        tab = await first_open_tab(user.id)
        shown = None
        if tab is not None:
            shown = {
                "surface_id": tab.surface_id,
                "title": tab.card["title"],
                "snapshot": tab.snapshot,
            }
        return {"tab": shown, "cart": await cart_lines(user.id)}

    @app.get("/api/catalog/products")
    async def products(  # pyright: ignore[reportUnusedFunction]
        ids: Annotated[list[str] | None, Query()] = None,
    ) -> dict[str, Any]:
        """`?ids=a,b&ids=c`: the products that exist, in order, and the IDs that do not."""
        wanted = [part.strip() for value in ids or [] for part in value.split(",") if part.strip()]
        found, missing = await lookup_products(catalog, wanted)
        return {
            "products": [product.model_dump(mode="json") for product in found],
            "missing": missing,
        }

    @app.get("/api/cart")
    async def get_cart(  # pyright: ignore[reportUnusedFunction]
        user: Annotated[User, Depends(current_user)],
    ) -> dict[str, Any]:
        """The shopper's cart at today's prices."""
        return {"cart": await cart_lines(user.id)}

    @app.post("/api/actions")
    async def actions(  # pyright: ignore[reportUnusedFunction]
        request: ActionRequest, user: Annotated[User, Depends(current_user)]
    ) -> dict[str, Any]:
        """Direct actions: `cart.add`, `cart.set_qty` and `cart.remove`. The product is re-read."""
        the_store = await ready()
        name = request.name
        if name not in ("cart.add", "cart.set_qty", "cart.remove"):
            return await action_error(user.id, "invalid", f"Unknown action: {name}.")
        product_id = request.context.get("productId")
        if not isinstance(product_id, str) or not product_id:
            return await action_error(user.id, "invalid", f"{name} needs a productId.")
        if name == "cart.remove":
            await the_store.remove_from_cart(user.id, product_id)
            return {"ok": True, "cart": await cart_lines(user.id)}
        if name == "cart.add":
            return await change_cart(user.id, product_id, None)
        qty = request.context.get("qty")
        if isinstance(qty, bool) or not isinstance(qty, int) or qty < 0:
            return await action_error(user.id, "invalid", "cart.set_qty needs a qty of 0 or more.")
        if qty == 0:
            await the_store.remove_from_cart(user.id, product_id)
            return {"ok": True, "cart": await cart_lines(user.id)}
        return await change_cart(user.id, product_id, qty)

    async def change_cart(user_id: str, product_id: str, qty: int | None) -> dict[str, Any]:
        """Adds one (`qty` None) or sets `qty`, if the shelf has that many; else the cart is kept.
        The stock check and the write are one atomic store call."""
        the_store = await ready()
        try:
            product = await catalog.get_product(product_id)
        except NotFoundError:
            return await action_error(user_id, "not_found", "This product is no longer available.")
        if qty is None:
            change = await the_store.add_to_cart(user_id, product_id, stock=product.stock)
        else:
            change = await the_store.set_cart_qty(user_id, product_id, qty, stock=product.stock)
        if not change.ok:
            message = f"{product.name} is out of stock."
            if change.qty:
                message = f"No more {product.name} in stock: all {change.qty} are in your cart."
            if qty is not None and product.stock:
                message = f"Only {product.stock} {product.name} in stock."
            return await action_error(user_id, "out_of_stock", message)
        return {"ok": True, "cart": await cart_lines(user_id)}

    async def action_error(user_id: str, code: str, message: str) -> dict[str, Any]:
        return {
            "ok": False,
            "cart": await cart_lines(user_id),
            "error": {"code": code, "message": message},
        }

    async def cart_lines(user_id: str) -> list[dict[str, Any]]:
        """The cart at today's prices. A product that no longer exists leaves the stored cart."""
        the_store = await ready()
        lines = await the_store.cart(user_id)
        found, missing = await lookup_products(catalog, [line.product_id for line in lines])
        for product_id in missing:
            await the_store.remove_from_cart(user_id, product_id)
        qtys = {line.product_id: line.qty for line in lines}
        return [
            {
                "productId": product.id,
                "name": product.name,
                "qty": qtys[product.id],
                "price_cents": product.price_cents,
            }
            for product in found
        ]

    return app


def _frame(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"


def _error_event(code: str, message: str) -> dict[str, Any]:
    return {"type": "RUN_ERROR", "code": code, "message": message}


def _title(command: str) -> str:
    """The tab's title until the router names tabs: the command, on one line, cut to fit."""
    title = " ".join(command.split())
    return title if len(title) <= TITLE_LIMIT else title[: TITLE_LIMIT - 1].rstrip() + "…"
