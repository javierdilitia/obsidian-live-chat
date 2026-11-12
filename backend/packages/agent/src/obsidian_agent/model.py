"""The model client: one `call` per model turn, Responses API shapes in and out.

Continuing a conversation after tool calls (what Task 4's `build_page` does):

1. Call `model.call(system=..., input=history, tools=[{"type": "function", "name", "description",
   "parameters"}, ...])`.
2. If `result.stop == "tool_calls"`, append `result.output_items` to `history`. That is every item
   the model produced (reasoning, messages, `function_call`), already shaped as input. A reasoning
   model's `function_call` is rejected unless the reasoning item before it is echoed too, so do not
   rebuild these items by hand.
3. Run each `ToolCall` in `result.tool_calls` and append one
   `{"type": "function_call_output", "call_id": call.call_id, "output": "<string>"}` per call.
4. Call again with the longer `history`.

`ScriptedModel` results may leave `output_items` empty: it never reads the history.
"""

import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from openai import AsyncAzureOpenAI

from obsidian_agent.settings import Settings

Stop = Literal["stop", "length", "tool_calls"]


class ModelFailed(Exception):
    """The API answered, but the response is unusable (failed, filtered, or malformed)."""


class ScriptExhausted(Exception):
    """A ScriptedModel was called more times than it has scripted results."""


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    cached_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ModelResult:
    text: str
    tool_calls: list[ToolCall]
    usage: Usage
    stop: Stop
    latency_ms: int
    # Everything the model produced, as input items to append before the tool results.
    output_items: list[dict[str, Any]] = field(default_factory=lambda: [])


class ModelClient(Protocol):
    async def call(
        self,
        *,
        system: str,
        input: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelResult: ...


class ScriptedModel:
    """Test double: returns the given results in order and records every call."""

    def __init__(self, results: list[ModelResult]) -> None:
        self._results = list(results)
        self.calls: list[dict[str, Any]] = []

    async def call(
        self,
        *,
        system: str,
        input: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelResult:
        self.calls.append({"system": system, "input": input, "tools": tools})
        if len(self.calls) > len(self._results):
            raise ScriptExhausted(f"call {len(self.calls)} but only {len(self._results)} scripted")
        return self._results[len(self.calls) - 1]


def stop_from_response(response: Any, *, has_tool_calls: bool) -> Stop:
    """Map the response status to a stop reason. Only a max-token cut-off counts as `length`."""
    if response.status == "incomplete":
        details = response.incomplete_details
        reason = details.reason if details else None
        if reason == "max_output_tokens":
            return "length"
        raise ModelFailed(f"response incomplete: {reason}")
    return "tool_calls" if has_tool_calls else "stop"


def _parse_tool_call(item: Any) -> ToolCall:
    try:
        arguments = json.loads(item.arguments)
    except json.JSONDecodeError as exc:
        raise ModelFailed(f"tool {item.name} sent unparseable arguments") from exc
    if not isinstance(arguments, dict):
        raise ModelFailed(f"tool {item.name} arguments are not a JSON object")
    return ToolCall(item.call_id, item.name, arguments)  # pyright: ignore[reportUnknownArgumentType]


def result_from_response(response: Any, *, latency_ms: int) -> ModelResult:
    if response.status == "failed":
        message = response.error.message if response.error else "no detail"
        raise ModelFailed(f"response failed: {message}")
    text: list[str] = []
    calls: list[ToolCall] = []
    items: list[dict[str, Any]] = []
    for item in response.output:
        items.append(item.model_dump(mode="json", by_alias=True, exclude_none=True))
        if item.type == "message":
            text.extend(p.text for p in item.content if p.type == "output_text")
        elif item.type == "function_call":
            try:
                calls.append(_parse_tool_call(item))
            except ModelFailed:
                # A call cut off by the output cap is expected; the `length` stop reports it.
                if stop_from_response(response, has_tool_calls=False) != "length":
                    raise
    usage = response.usage
    return ModelResult(
        text="".join(text),
        tool_calls=calls,
        usage=Usage(
            input_tokens=usage.input_tokens if usage else 0,
            cached_tokens=usage.input_tokens_details.cached_tokens if usage else 0,
            output_tokens=usage.output_tokens if usage else 0,
        ),
        stop=stop_from_response(response, has_tool_calls=bool(calls)),
        latency_ms=latency_ms,
        output_items=items,
    )


class AzureModel:
    """Azure OpenAI Responses API. Reasoning models reject `temperature`, so it is never sent."""

    def __init__(
        self,
        settings: Settings,
        *,
        client: AsyncAzureOpenAI | None = None,
        max_output_tokens: int | None = None,
    ) -> None:
        self._settings = settings
        self._max_output_tokens = max_output_tokens
        self._client = client or AsyncAzureOpenAI(
            azure_endpoint=settings.endpoint,
            api_key=settings.api_key,
            api_version=settings.api_version,
        )

    async def call(
        self,
        *,
        system: str,
        input: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ModelResult:
        kwargs: dict[str, Any] = {
            "model": self._settings.ui_deployment,
            "instructions": system,
            "input": input,
        }
        if tools:
            kwargs["tools"] = tools
        if self._settings.ui_reasoning_effort:
            kwargs["reasoning"] = {"effort": self._settings.ui_reasoning_effort}
        if self._max_output_tokens is not None:
            kwargs["max_output_tokens"] = self._max_output_tokens
        started = time.perf_counter()
        # The SDK's overloads infer an Unknown type from the untyped kwargs dict.
        response: Any = await self._client.responses.create(**kwargs)  # pyright: ignore[reportUnknownVariableType]
        return result_from_response(
            response, latency_ms=round((time.perf_counter() - started) * 1000)
        )
