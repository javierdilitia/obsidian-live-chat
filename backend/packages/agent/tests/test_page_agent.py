"""The page builder: one model reply becomes a checked page, with one retry when it is not."""

import json
import time
from pathlib import Path
from typing import Any

import pytest

from halden_agent.a2ui_adapter import (
    Message,
    Snapshot,
    apply_messages,
    compile_block,
    decompile,
    prompt_snippet,
)
from halden_agent.fixtures import FIXTURE_SURFACE_ID
from halden_agent.model import ModelResult, ScriptedModel, Stop, ToolCall, Usage
from halden_agent.page_agent import PAGE_PROMPT, SYSTEM_PROMPT, build_page
from halden_data_fake import FakeCatalogSource

FIXTURES = Path(__file__).parent / "fixtures"
ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"
SURFACE = FIXTURE_SURFACE_ID
COMMAND = "Compare 3 laptops for video editing under €2,000"
EDIT_COMMAND = "Add colour accuracy for grading"


def _block(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _reply(text: str, *, stop: Stop = "stop", calls: list[ToolCall] | None = None) -> ModelResult:
    return ModelResult(
        text=text,
        tool_calls=calls or [],
        usage=Usage(input_tokens=100, cached_tokens=0, output_tokens=50),
        stop=stop,
        latency_ms=5,
    )


def _tool_round(*calls: ToolCall) -> ModelResult:
    return _reply("", stop="tool_calls", calls=list(calls))


def _built() -> Snapshot:
    messages = compile_block(_block("build.a2ui"), surface_id=SURFACE, current=None)
    return apply_messages(None, messages)


def _ids(messages: list[Message]) -> set[str]:
    kind = "createSurface" if "createSurface" in messages[0] else "updateComponents"
    return {component["id"] for message in messages for component in message[kind]["components"]}


async def test_build_ok() -> None:
    model = ScriptedModel([_reply(_block("build.a2ui"))])

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert result.ok and result.error is None and result.attempts == 1
    assert result.messages == compile_block(_block("build.a2ui"), surface_id=SURFACE, current=None)
    assert result.snapshot == _built()
    assert COMMAND in json.dumps(model.calls[0]["input"], ensure_ascii=False)


async def test_edit_shows_the_current_page_and_sends_only_the_change() -> None:
    model = ScriptedModel([_reply(_block("edit_add_colour.a2ui"))])
    current = _built()

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=EDIT_COMMAND, current=current
    )

    assert result.ok
    assert all("updateComponents" in message for message in result.messages)
    assert not _ids(result.messages) & {"verdict", "shelf", "specs", "charts"}
    sent = json.dumps(model.calls[0]["input"], ensure_ascii=False)
    assert EDIT_COMMAND in sent and json.dumps(decompile(current), ensure_ascii=False)[1:-1] in sent


async def test_unknown_product_retries_with_feedback() -> None:
    ghost = _block("build.a2ui").replace("vela-prism-15", "ghost-laptop-99")
    model = ScriptedModel([_reply(ghost), _reply(_block("build.a2ui"))])

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert result.ok and result.attempts == 2
    feedback = json.dumps(model.calls[1]["input"])
    assert "unknown_product" in feedback and "ghost-laptop-99" in feedback
    assert "unknown_product" not in json.dumps(model.calls[0]["input"])


async def test_length_stop_is_a_failure() -> None:
    # The text compiles, but a reply cut off by the output cap is never trusted.
    model = ScriptedModel([_reply(_block("build.a2ui"), stop="length")] * 2)

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert not result.ok and result.attempts == 2
    assert result.messages == [] and result.snapshot is None
    assert result.error is not None and "cut off" in result.error
    assert "cut off" in json.dumps(model.calls[1]["input"])


async def test_length_stop_does_not_echo_cut_off_items() -> None:
    # A cut-off reply can end in a half-written reasoning item or an unanswered function call;
    # sent back as input, either makes the Responses API answer 400.
    cut_off_items: list[dict[str, Any]] = [
        {"type": "reasoning", "id": "rs_cut", "summary": []},
        {"type": "function_call", "call_id": "call-cut", "name": "get_products", "arguments": "{"},
    ]
    cut_off = ModelResult(
        text="<a2ui>\nroot = Page(",
        tool_calls=[],
        usage=Usage(input_tokens=100, cached_tokens=0, output_tokens=16_000),
        stop="length",
        latency_ms=5,
        output_items=cut_off_items,
    )
    model = ScriptedModel([cut_off, _reply(_block("build.a2ui"))])

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert result.ok and result.attempts == 2
    retry = json.dumps(model.calls[1]["input"])
    assert "rs_cut" not in retry and "call-cut" not in retry
    assert "cut off" in retry


async def test_failed_edit_returns_the_current_page() -> None:
    model = ScriptedModel([_reply("I can't do that."), _reply("Still no block.")])
    current = _built()

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=EDIT_COMMAND, current=current
    )

    assert not result.ok and result.attempts == 2 and result.messages == []
    assert result.snapshot == current
    assert result.error is not None and "No <a2ui> block" in result.error


async def test_template_children_are_rejected() -> None:
    template = """<a2ui>
root = Page(title="x", kicker="y", children=_template($/items, item))
item = Verdict(text="hi")
</a2ui>"""
    model = ScriptedModel([_reply(template), _reply(_block("build.a2ui"))])

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert result.ok and result.attempts == 2
    assert "template_children" in json.dumps(model.calls[1]["input"])


async def test_tool_round_then_page() -> None:
    search = ToolCall("call-1", "search_products", {"text": "Aeris", "category": "laptops"})
    fetch = ToolCall("call-2", "get_products", {"ids": ["kore-zephyr-14", "ghost-laptop-99"]})
    model = ScriptedModel([_tool_round(search, fetch), _reply(_block("build.a2ui"))])

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    assert result.ok and result.attempts == 1
    first, second = model.calls
    assert [tool["name"] for tool in first["tools"]] == ["search_products", "get_products"]
    assert not any(item.get("type") == "function_call_output" for item in first["input"])
    outputs = {
        item["call_id"]: json.loads(item["output"])
        for item in second["input"]
        if item.get("type") == "function_call_output"
    }
    found = outputs["call-1"]["products"]
    assert "aeris-studio-16" in [product["id"] for product in found]
    aeris = next(product for product in found if product["id"] == "aeris-studio-16")
    assert aeris["price_cents"] == 189900 and aeris["stock"] == 12
    assert aeris["specs"]["batt"] == "18 h" and "batt" in aeris["chartable"]
    assert "cpu" not in aeris["chartable"]
    assert [product["id"] for product in outputs["call-2"]["products"]] == ["kore-zephyr-14"]
    assert outputs["call-2"]["missing"] == ["ghost-laptop-99"]


async def test_tool_rounds_are_capped_at_two() -> None:
    search = ToolCall("call-1", "search_products", {"text": "Kore"})
    bad = ToolCall("call-2", "search_products", {"max_price_cents": -5})
    unknown = ToolCall("call-3", "delete_products", {})
    late = ToolCall("call-4", "get_products", {"ids": ["aeris-studio-16"]})
    model = ScriptedModel(
        [
            _tool_round(search),
            _tool_round(bad, unknown),
            _tool_round(late),
            _reply(_block("build.a2ui")),
        ]
    )

    result = await build_page(
        model, FakeCatalogSource(), surface_id=SURFACE, command=COMMAND, current=None
    )

    # Tools stay on offer (the history holds tool calls), but a third round is refused unrun.
    assert all(call["tools"] is not None for call in model.calls)
    outputs = {
        item["call_id"]: json.loads(item["output"])
        for item in model.calls[3]["input"]
        if item.get("type") == "function_call_output"
    }
    assert "error" in outputs["call-2"] and "error" in outputs["call-3"]
    assert "products" in outputs["call-1"]
    assert outputs["call-4"] == {"error": outputs["call-4"]["error"]}
    assert "No more tool rounds" in outputs["call-4"]["error"]
    # The refused round's reply has no page, so it counts as the first attempt.
    assert result.ok and result.attempts == 2


async def test_system_prompt_is_fixed() -> None:
    model = ScriptedModel(
        [
            _reply("no block"),
            _reply(_block("build.a2ui")),
            _reply(_block("edit_add_colour.a2ui")),
        ]
    )
    source = FakeCatalogSource()

    built = await build_page(model, source, surface_id=SURFACE, command=COMMAND, current=None)
    await build_page(
        model, source, surface_id=SURFACE, command=EDIT_COMMAND, current=built.snapshot
    )

    assert {call["system"] for call in model.calls} == {SYSTEM_PROMPT}
    assert SYSTEM_PROMPT.startswith(prompt_snippet()) and SYSTEM_PROMPT.endswith(PAGE_PROMPT)
    for rule in ("surface(update=true)", "<a2ui>", "no actions", "data bindings", "price"):
        assert rule in PAGE_PROMPT
    assert SURFACE not in SYSTEM_PROMPT and COMMAND not in SYSTEM_PROMPT


class _Recording:
    """Wraps a model and keeps every result, so the live test can print tokens and seconds."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self.results: list[ModelResult] = []

    async def call(
        self,
        *,
        system: str,
        input: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelResult:
        result = await self.inner.call(system=system, input=input, tools=tools)
        self.results.append(result)
        return result

    def report(self, label: str, seconds: float) -> str:
        used = [r.usage for r in self.results]
        self.results = []
        return (
            f"{label}: {seconds:.1f} s, {len(used)} calls, "
            f"input {sum(u.input_tokens for u in used)} "
            f"(cached {sum(u.cached_tokens for u in used)}), "
            f"output {sum(u.output_tokens for u in used)}"
        )


@pytest.mark.live
async def test_live_build_then_edit() -> None:
    from halden_agent.app import azure_model
    from halden_agent.settings import Settings

    model = _Recording(azure_model(Settings.from_env(ROOT_ENV)))
    source = FakeCatalogSource()

    started = time.perf_counter()
    built = await build_page(model, source, surface_id=SURFACE, command=COMMAND, current=None)
    print(model.report(f"build (attempts {built.attempts})", time.perf_counter() - started))
    assert built.ok, built.error
    assert built.snapshot is not None

    started = time.perf_counter()
    edited = await build_page(
        model, source, surface_id=SURFACE, command=EDIT_COMMAND, current=built.snapshot
    )
    print(model.report(f"edit (attempts {edited.attempts})", time.perf_counter() - started))
    assert edited.ok, edited.error
    assert edited.messages and all("updateComponents" in m for m in edited.messages)
    assert edited.snapshot is not None
    assert set(_sections(built.snapshot)) < set(_sections(edited.snapshot))
    print(decompile(edited.snapshot))


def _sections(snapshot: Snapshot) -> list[str]:
    root = next(c for c in snapshot["createSurface"]["components"] if c["id"] == "root")
    return root["children"]
