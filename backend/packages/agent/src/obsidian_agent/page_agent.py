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
from dataclasses import dataclass
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
from obsidian_agent.model import ModelClient, ModelResult, ToolCall
from obsidian_agent.validate import issues_for_model, page_product_ids, validate_page
from obsidian_data_contract import CatalogSource, NotFoundError, Product, ProductQuery

log = logging.getLogger(__name__)

PAGE_PROMPT = files("obsidian_agent").joinpath("prompts", "page.md").read_text(encoding="utf-8")
SYSTEM_PROMPT = prompt_snippet() + "\n\n" + PAGE_PROMPT

MAX_ATTEMPTS = 2
MAX_TOOL_ROUNDS = 2
SEARCH_LIMIT = 12
MAX_IDS = 12

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_products",
        "description": (
            f"Search the catalog. Every filter is optional. Returns up to {SEARCH_LIMIT} products, "
            "best rated first, each with its price, stock and specs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "One word or part of a name, matched in the product name or "
                    "category, for example 'Aeris' or 'Zephyr'.",
                },
                "category": {
                    "type": "string",
                    "description": "A category ID: laptops, monitors, audio, keyboards, storage "
                    "or docks.",
                },
                "max_price_cents": {
                    "type": "integer",
                    "description": "The highest price in euro cents, inclusive (€2,000 is 200000).",
                },
                "attributes": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                    "description": "Spec key to a word its value must contain, for example "
                    '{"display": "OLED"}.',
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "get_products",
        "description": "Look up products by ID. Returns each one's price, stock and specs, and "
        "the IDs that do not exist.",
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


class _Rejected(Exception):
    """The reply cannot be used. `feedback` tells the model what to fix."""

    def __init__(self, feedback: str) -> None:
        super().__init__(feedback)
        self.feedback = feedback


async def build_page(
    model: ModelClient,
    source: CatalogSource,
    *,
    surface_id: str,
    command: str,
    current: Snapshot | None,
) -> BuildResult:
    """Builds the page for `command`, or edits `current` when there is one.

    Raises whatever the model client raises (`ModelFailed`, network errors): the caller reports
    those as a run error.
    """
    history: list[dict[str, Any]] = [{"role": "user", "content": _request(command, current)}]
    tool_rounds = MAX_TOOL_ROUNDS
    feedback = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if feedback:
            history.append({"role": "user", "content": feedback})
        reply, tool_rounds = await _reply(model, source, history, tool_rounds)
        try:
            messages, snapshot = await _accept(
                reply, source, surface_id=surface_id, current=current
            )
        except _Rejected as rejected:
            feedback = rejected.feedback
            log.info("page attempt %d rejected: %s", attempt, feedback)
            continue
        return BuildResult(True, messages, snapshot, attempt, None)
    return BuildResult(False, [], current, MAX_ATTEMPTS, feedback)


def _request(command: str, current: Snapshot | None) -> str:
    if current is None:
        return f"Build a page for this command:\n{command}"
    return (
        f"This is the current page:\n{decompile(current)}\n\nChange it for this command:\n{command}"
    )


async def _reply(
    model: ModelClient,
    source: CatalogSource,
    history: list[dict[str, Any]],
    tool_rounds: int,
) -> tuple[ModelResult, int]:
    """The model's reply, after serving up to `tool_rounds` tool rounds; and the rounds left.

    Tools are offered on every call, so the history (which may hold earlier tool calls) is always
    valid. A tool call past the limit is answered with a refusal and the reply is returned as is.
    A reply cut off by the output limit (`length`) stays out of the history.
    """
    while True:
        result = await model.call(system=SYSTEM_PROMPT, input=list(history), tools=TOOLS)
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
    reply: ModelResult, source: CatalogSource, *, surface_id: str, current: Snapshot | None
) -> tuple[list[Message], Snapshot]:
    """The reply's messages and the page after them, or `_Rejected` with what to fix."""
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
    issues = validate_page(snapshot, known_products=await _known_products(source, snapshot))
    if issues:
        raise _Rejected(issues_for_model(issues))
    return messages, snapshot


def _compile_feedback(errors: list[str]) -> str:
    lines = "\n".join(f"- {error}" for error in errors)
    return (
        f"The block was not accepted. Fix these problems and send the whole block again:\n{lines}"
    )


async def _known_products(source: CatalogSource, snapshot: Snapshot) -> set[str]:
    found, _ = await lookup_products(source, sorted(page_product_ids(snapshot)))
    return {product.id for product in found}


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
        "chartable": [
            key
            for key, spec in product.specs.items()
            if isinstance(spec.value, int | float) and not isinstance(spec.value, bool)
        ],
    }
