"""Builds or edits one page: the model writes an Express block, the backend checks it.

`build_page` asks the model for a block, compiles it, applies it to the current page and validates
the result. A reply that does not compile, fails validation, is cut off (`stop == "length"`) or
has no `<a2ui>` block gets one retry, with the problems fed back (spec §13). The model can look up
products with two read-only tools, for at most two tool rounds in the whole build.

The system prompt never changes between calls, so Azure can cache it. Everything that varies (the
command, the current page) goes in the input.
"""

import json
import logging
from dataclasses import dataclass, field
from importlib.resources import files
from typing import Any, cast

from pydantic import ValidationError

from obsidian_agent.a2ui_adapter import (
    CompileError,
    Message,
    Snapshot,
    apply_messages,
    compile_block,
    decompile,
    prompt_snippet,
)
from obsidian_agent.language import LANGUAGES
from obsidian_agent.model import ModelClient, ModelResult, ToolCall
from obsidian_agent.validate import (
    issues_for_model,
    numeric_spec_keys,
    page_product_ids,
    validate_page,
)
from obsidian_data_contract import (
    CatalogSource,
    Category,
    NotFoundError,
    Product,
    ProductQuery,
)

log = logging.getLogger(__name__)

PAGE_PROMPT = files("obsidian_agent").joinpath("prompts", "page.md").read_text(encoding="utf-8")
SYSTEM_PROMPT = prompt_snippet() + "\n\n" + PAGE_PROMPT

MAX_ATTEMPTS = 2
MAX_TOOL_ROUNDS = 2
SEARCH_LIMIT = 12
MAX_IDS = 12

SORTS = ["rating", "price_asc", "price_desc"]


def page_tools(categories: list[Category]) -> list[dict[str, Any]]:
    """The page agent's two read-only tools. The category list comes from the cartridge's data.

    Build them once per app: they go out with every call, so they must not change between calls
    (prompt caching). No static text here names a product, category or spec key.
    """
    return [
        {
            "type": "function",
            "name": "search_products",
            "description": (
                f"Search the catalog. Every filter is optional. Returns up to {SEARCH_LIMIT} "
                "products in the order sort asks for, each with its price, stock and specs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Words to look for. Every word must appear in the "
                        "product's name, its category, or one of its spec values. More words "
                        "narrow the search.",
                    },
                    "category": {
                        "type": "string",
                        "description": "A category ID: "
                        + ", ".join(category.id for category in categories)
                        + ".",
                    },
                    "max_price_cents": {
                        "type": "integer",
                        "description": "The highest price in euro cents, inclusive (€2,000 is "
                        "200000).",
                    },
                    "attributes": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                        "description": "Spec key to a word its value must contain.",
                    },
                    "sort": {
                        "type": "string",
                        "enum": SORTS,
                        "description": "rating: best rated first (the default). price_asc: "
                        "cheapest first. price_desc: most expensive first.",
                    },
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_products",
            "description": "Look up products by ID. Returns each one's price, stock and specs, "
            "and the IDs that do not exist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ids": {"type": "array", "items": {"type": "string"}, "maxItems": MAX_IDS},
                },
                "required": ["ids"],
                "additionalProperties": False,
            },
        },
    ]


_NO_MORE_TOOLS = "No more tool rounds. Write the page now with the products you already have."


@dataclass(frozen=True)
class BuildResult:
    ok: bool
    # The messages to send to the browser; empty when the build failed.
    messages: list[Message]
    # The page after the messages; on failure, the page as it was (`current`).
    snapshot: Snapshot | None
    attempts: int
    # What was wrong with the last reply, for the log; None when the build succeeded.
    error: str | None
    # The page's products as the validator saw them, by ID; empty when the build failed.
    products: dict[str, Product] = field(default_factory=lambda: {})


class _Rejected(Exception):
    """The reply cannot be used. `feedback` tells the model what to fix."""

    def __init__(self, feedback: str) -> None:
        super().__init__(feedback)
        self.feedback = feedback


async def build_page(
    model: ModelClient,
    source: CatalogSource,
    *,
    tools: list[dict[str, Any]],
    surface_id: str,
    command: str,
    current: Snapshot | None,
    language: str,
    page_language: str | None,
) -> BuildResult:
    """Builds the page for `command`, or edits `current` when there is one.

    `tools` is `page_tools(...)`, built once per app so every call offers the same tools.
    `language` is the shopper's; `page_language` is the language `current` is written in (`None`
    for a new page). An edit into another language must define every section again.

    Raises whatever the model client raises (`ModelFailed`, network errors): the caller reports
    those as a run error.
    """
    rewrite_all = current is not None and page_language != language
    request = _request(command, current, language=language, page_language=page_language)
    history: list[dict[str, Any]] = [{"role": "user", "content": request}]
    tool_rounds = MAX_TOOL_ROUNDS
    feedback = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if feedback:
            history.append({"role": "user", "content": feedback})
        reply, tool_rounds = await _reply(model, source, tools, history, tool_rounds)
        try:
            messages, snapshot, products = await _accept(
                reply,
                source,
                surface_id=surface_id,
                current=current,
                rewrite_all=rewrite_all,
                language=language,
            )
        except _Rejected as rejected:
            feedback = rejected.feedback
            log.info("page attempt %d rejected: %s", attempt, feedback)
            continue
        return BuildResult(True, messages, snapshot, attempt, None, products)
    return BuildResult(False, [], current, MAX_ATTEMPTS, feedback)


def _request(
    command: str, current: Snapshot | None, *, language: str, page_language: str | None
) -> str:
    name = LANGUAGES[language]
    write_in = f"Write every text on the page in {name}."
    if current is None:
        return f"Build a page for this command:\n{command}\n\n{write_in}"
    request = (
        f"This is the current page:\n{decompile(current)}\n\nChange it for this command:\n{command}"
    )
    if page_language != language:
        written_in = LANGUAGES.get(page_language or "", "another language")
        request += (
            f"\n\nThis page is written in {written_in}; the shopper now reads {name}. Define "
            f"every section in root's children again, with its text in {name}, as well as "
            "making the change."
        )
    return f"{request}\n\n{write_in}"


async def _reply(
    model: ModelClient,
    source: CatalogSource,
    tools: list[dict[str, Any]],
    history: list[dict[str, Any]],
    tool_rounds: int,
) -> tuple[ModelResult, int]:
    """The model's reply, after serving up to `tool_rounds` tool rounds; and the rounds left.

    Tools are offered on every call, so the history (which may hold earlier tool calls) is always
    valid. A tool call past the limit is answered with a refusal and the reply is returned as is.
    A reply cut off by the output limit (`length`) stays out of the history.
    """
    while True:
        result = await model.call(system=SYSTEM_PROMPT, input=list(history), tools=tools)
        usage = result.usage
        log.info(
            "page model call: stop=%s input=%d cached=%d output=%d latency_ms=%d",
            result.stop,
            usage.input_tokens,
            usage.cached_tokens,
            usage.output_tokens,
            result.latency_ms,
        )
        if result.stop == "length":
            # A cut-off reply can end in a half-written item (reasoning, or a function call with
            # no output); echoed back, the API rejects the whole input. The retry starts clean.
            return result, tool_rounds
        history.extend(result.output_items)
        if result.stop != "tool_calls":
            return result, tool_rounds
        serve = tool_rounds > 0
        for call in result.tool_calls:
            output = await _run_tool(source, call) if serve else {"error": _NO_MORE_TOOLS}
            history.append(
                {
                    "type": "function_call_output",
                    "call_id": call.call_id,
                    "output": json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                }
            )
        if not serve:
            return result, tool_rounds
        tool_rounds -= 1


async def _accept(
    reply: ModelResult,
    source: CatalogSource,
    *,
    surface_id: str,
    current: Snapshot | None,
    rewrite_all: bool,
    language: str,
) -> tuple[list[Message], Snapshot, dict[str, Product]]:
    """The reply's messages, the page after them and its products, or `_Rejected` with what to
    fix. With `rewrite_all` (an edit into another language), every section of the new page must
    be defined in the reply."""
    if reply.stop == "length":
        raise _Rejected(
            "Your reply was cut off by the output limit. Send the whole block again, shorter: "
            "fewer sections and shorter text."
        )
    try:
        messages = compile_block(reply.text, surface_id=surface_id, current=current)
        snapshot = apply_messages(current, messages)
    except CompileError as error:
        raise _Rejected(_compile_feedback(error.errors)) from error
    except ValueError as error:
        raise _Rejected(_compile_feedback([str(error)])) from error
    if rewrite_all:
        left_out = _sections_left_out(messages, snapshot)
        if left_out:
            raise _Rejected(
                f"Define every section again in {LANGUAGES[language]}; these were left out: "
                f"{', '.join(left_out)}."
            )
    products = await _page_products(source, snapshot)
    issues = validate_page(snapshot, products=products)
    if issues:
        raise _Rejected(issues_for_model(issues))
    return messages, snapshot, products


def _sections_left_out(messages: list[Message], snapshot: Snapshot) -> list[str]:
    """The IDs in the new page's `Page.children` that the reply did not define, in page
    order."""
    defined = {
        component.get("id")
        for message in messages
        for kind in ("createSurface", "updateComponents")
        for component in cast(list[dict[str, Any]], message.get(kind, {}).get("components", []))
    }
    surface = cast(dict[str, Any], snapshot.get("createSurface", {}))
    components = cast(list[dict[str, Any]], surface.get("components", []))
    root = next((c for c in components if c.get("component") == "Page"), None)
    children = cast(list[Any], root.get("children", [])) if root is not None else []
    return [child for child in children if isinstance(child, str) and child not in defined]


def _compile_feedback(errors: list[str]) -> str:
    lines = "\n".join(f"- {error}" for error in errors)
    return (
        f"The block was not accepted. Fix these problems and send the whole block again:\n{lines}"
    )


async def _page_products(source: CatalogSource, snapshot: Snapshot) -> dict[str, Product]:
    """The page's products that exist, by ID."""
    found, _ = await lookup_products(source, sorted(page_product_ids(snapshot)))
    return {product.id: product for product in found}


async def lookup_products(
    source: CatalogSource, product_ids: list[str]
) -> tuple[list[Product], list[str]]:
    """The products that exist, in order and without repeats, and the IDs that do not."""
    wanted = list(dict.fromkeys(product_ids))
    try:
        return await source.get_products(wanted), []
    except NotFoundError as error:
        missing = set(error.ids)
        found = await source.get_products([i for i in wanted if i not in missing])
        return found, [i for i in wanted if i in missing]


async def _run_tool(source: CatalogSource, call: ToolCall) -> dict[str, Any]:
    """The tool's result for the model, compact. Bad arguments come back as `{"error": ...}`."""
    arguments = {key: value for key, value in call.arguments.items() if value is not None}
    if call.name == "search_products":
        try:
            query = ProductQuery.model_validate({**arguments, "limit": SEARCH_LIMIT})
        except ValidationError as error:
            return {"error": _validation_message(error)}
        found = await source.search_products(query)
        products = await source.get_products([product.id for product in found])
        return {"products": [_compact(product) for product in products]}
    if call.name == "get_products":
        ids = arguments.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in cast(list[Any], ids)):
            return {"error": "ids must be a list of product ID strings."}
        found, missing = await lookup_products(source, cast(list[str], ids)[:MAX_IDS])
        return {"products": [_compact(product) for product in found], "missing": missing}
    return {"error": f"Unknown tool {call.name}. The tools are search_products and get_products."}


def _validation_message(error: ValidationError) -> str:
    problems = "; ".join(
        f"{'.'.join(str(part) for part in detail['loc'])}: {detail['msg']}"
        for detail in error.errors()
    )
    return f"Invalid arguments: {problems}"


def _compact(product: Product) -> dict[str, Any]:
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category_id,
        "price_cents": product.price_cents,
        "stock": product.stock,
        "rating": product.rating,
        "specs": {key: spec.display for key, spec in product.specs.items()},
        "chartable": [key for key in product.specs if key in numeric_spec_keys([product])],
    }
