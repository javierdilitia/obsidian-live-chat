"""FastAPI application factory: a run over SSE, the workspace for a reload, catalog reads, cart.

Dev run: `uv run --directory backend uvicorn obsidian_agent.app:create_app --factory --reload`

The demo keeps one tab and one cart in memory (`Workspace`). The Azure model is made on the first
run, from the repo's `.env`, so building the app never reads settings or touches the network.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse
from openai import AsyncAzureOpenAI
from pydantic import BaseModel, Field, StringConstraints

from obsidian_agent.cartridges import cartridge_setting, load_cartridge
from obsidian_agent.model import AzureModel, ModelClient, ModelFailed
from obsidian_agent.page_agent import build_page, lookup_products, page_tools
from obsidian_agent.settings import MissingSettings, Settings
from obsidian_agent.workspace import Tab, Workspace
from obsidian_data_contract import Cartridge, CatalogSource, NotFoundError

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


def create_app(model: ModelClient | None = None, cartridge: Cartridge | None = None) -> FastAPI:
    """The app. Tests pass a `ScriptedModel`; without one, the Azure model is made on first use.

    Without a cartridge, the one `OBSIDIAN_CARTRIDGE` names (or the only one installed) is loaded
    at once, so a bad choice fails at start, naming the installed cartridges.
    """
    app = FastAPI(title="Obsidian agent", version="0.1.0")
    if cartridge is None:
        cartridge = load_cartridge(cartridge_setting(ENV_FILE))
    app.state.cartridge = cartridge
    cartridge_id = cartridge.id
    catalog: CatalogSource = cartridge.make_source()
    workspace = Workspace()
    app.state.workspace = workspace
    models: list[ModelClient] = [model] if model is not None else []

    def get_model() -> ModelClient:
        if not models:
            models.append(azure_model(Settings.from_env(ENV_FILE)))
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

    @app.post("/api/runs")
    async def runs(request: RunRequest) -> StreamingResponse:  # pyright: ignore[reportUnusedFunction]
        return StreamingResponse(
            run_events(request.command),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def run_events(command: str) -> AsyncIterator[str]:
        async with workspace.run_lock:
            run_id = uuid.uuid4().hex
            yield _frame({"type": "RUN_STARTED", "runId": run_id})
            try:
                page_model = get_model()
            except MissingSettings as error:
                yield _run_error("not_configured", f"Missing settings: {', '.join(error.names)}.")
                return
            tab = workspace.tab
            if tab is None:
                tab = Tab(surface_id=f"shop:{uuid.uuid4().hex}", title=_title(command))
                workspace.tab = tab
                value = {"surface_id": tab.surface_id, "title": tab.title}
                yield _frame({"type": "CUSTOM", "name": "tab_opened", "value": value})
            current = tab.snapshot
            failed = ("build_failed", "Couldn't build this page.")
            if current is not None:
                failed = ("edit_failed", "Couldn't change this page.")
            try:
                async with asyncio.timeout(RUN_TIMEOUT_S):
                    result = await build_page(
                        page_model,
                        catalog,
                        tools=await get_tools(),
                        surface_id=tab.surface_id,
                        command=command,
                        current=current,
                    )
            except ModelFailed as error:
                log.warning("run %s: unusable model response: %s", run_id, error)
                yield _run_error(*failed)
                return
            except TimeoutError:
                log.warning("run %s: timed out after %.0f s", run_id, RUN_TIMEOUT_S)
                yield _run_error("timeout", "This took too long. Try again.")
                return
            except Exception:
                log.exception("run %s: the model call failed", run_id)
                yield _run_error("model_unavailable", "The model is unavailable. Try again.")
                return
            if not result.ok:
                log.warning(
                    "run %s failed after %d attempts: %s", run_id, result.attempts, result.error
                )
                yield _run_error(*failed)
                return
            tab.snapshot = result.snapshot
            tab.commands.append(command)
            for message in result.messages:
                yield _frame({"type": "CUSTOM", "name": "a2ui", "value": message})
            yield _frame({"type": "RUN_FINISHED", "runId": run_id})

    @app.get("/api/workspace")
    async def get_workspace() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        """What a reloaded page shows: the tab, with its page if it has one, and the cart."""
        tab = workspace.tab
        shown = None
        if tab is not None:
            shown = {"surface_id": tab.surface_id, "title": tab.title, "snapshot": tab.snapshot}
        return {"tab": shown, "cart": await cart_lines()}

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
    async def get_cart() -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        """The cart at today's prices."""
        return {"cart": await cart_lines()}

    @app.post("/api/actions")
    async def actions(request: ActionRequest) -> dict[str, Any]:  # pyright: ignore[reportUnusedFunction]
        """Direct actions: `cart.add`, `cart.set_qty` and `cart.remove`. The product is re-read."""
        name = request.name
        if name not in ("cart.add", "cart.set_qty", "cart.remove"):
            return await action_error("invalid", f"Unknown action: {name}.")
        product_id = request.context.get("productId")
        if not isinstance(product_id, str) or not product_id:
            return await action_error("invalid", f"{name} needs a productId.")
        in_cart = workspace.cart.get(product_id, 0)
        if name == "cart.remove":
            workspace.cart.pop(product_id, None)
            return {"ok": True, "cart": await cart_lines()}
        if name == "cart.add":
            return await set_quantity(product_id, in_cart + 1, adding=True)
        qty = request.context.get("qty")
        if isinstance(qty, bool) or not isinstance(qty, int) or qty < 0:
            return await action_error("invalid", "cart.set_qty needs a qty of 0 or more.")
        if qty == 0:
            workspace.cart.pop(product_id, None)
            return {"ok": True, "cart": await cart_lines()}
        return await set_quantity(product_id, qty, adding=False)

    async def set_quantity(product_id: str, qty: int, *, adding: bool) -> dict[str, Any]:
        """Puts `qty` of a product in the cart if the shelf has that many; else the cart is kept."""
        try:
            product = await catalog.get_product(product_id)
        except NotFoundError:
            return await action_error("not_found", "This product is no longer available.")
        in_cart = workspace.cart.get(product_id, 0)
        if qty > product.stock and qty > in_cart:
            message = f"{product.name} is out of stock."
            if in_cart:
                message = f"No more {product.name} in stock: all {in_cart} are in your cart."
            if not adding and product.stock:
                message = f"Only {product.stock} {product.name} in stock."
            return await action_error("out_of_stock", message)
        workspace.cart[product_id] = qty
        return {"ok": True, "cart": await cart_lines()}

    async def action_error(code: str, message: str) -> dict[str, Any]:
        return {
            "ok": False,
            "cart": await cart_lines(),
            "error": {"code": code, "message": message},
        }

    async def cart_lines() -> list[dict[str, Any]]:
        """The cart at today's prices. A product that no longer exists leaves the cart."""
        found, missing = await lookup_products(catalog, list(workspace.cart))
        for product_id in missing:
            workspace.cart.pop(product_id, None)
        return [
            {
                "productId": product.id,
                "name": product.name,
                "qty": workspace.cart[product.id],
                "price_cents": product.price_cents,
            }
            for product in found
        ]

    return app


def _frame(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"


def _run_error(code: str, message: str) -> str:
    return _frame({"type": "RUN_ERROR", "code": code, "message": message})


def _title(command: str) -> str:
    """The tab's title until the router names tabs: the command, on one line, cut to fit."""
    title = " ".join(command.split())
    return title if len(title) <= TITLE_LIMIT else title[: TITLE_LIMIT - 1].rstrip() + "…"
