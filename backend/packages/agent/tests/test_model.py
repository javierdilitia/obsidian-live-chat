from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from halden_agent.model import (
    AzureModel,
    ModelFailed,
    ModelResult,
    ScriptedModel,
    ScriptExhausted,
    ToolCall,
    Usage,
    result_from_response,
    stop_from_response,
)
from halden_agent.settings import MissingSettings, Settings

ENV_NAMES = [
    "AZURE_FOUNDRY_ENDPOINT",
    "AZURE_FOUNDRY_API_KEY",
    "MODEL_UI_DEPLOYMENT",
    "AZURE_OPENAI_API_VERSION",
    "MODEL_UI_REASONING_EFFORT",
]
ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


def _result(text: str = "ok") -> ModelResult:
    return ModelResult(
        text=text,
        tool_calls=[],
        usage=Usage(input_tokens=1, cached_tokens=0, output_tokens=2),
        stop="stop",
        latency_ms=3,
    )


def _settings(effort: str | None = None) -> Settings:
    return Settings(
        endpoint="https://example.invalid/",
        api_key="not-a-real-key",
        api_version="2025-04-01-preview",
        ui_deployment="deploy-x",
        ui_reasoning_effort=effort,
    )


def _response(
    *, status: str = "completed", reason: str | None = None, output: list[Any] | None = None
) -> SimpleNamespace:
    return SimpleNamespace(
        status=status,
        incomplete_details=SimpleNamespace(reason=reason) if reason else None,
        error=SimpleNamespace(message="boom") if status == "failed" else None,
        output=output or [],
        usage=SimpleNamespace(
            input_tokens=10,
            output_tokens=4,
            input_tokens_details=SimpleNamespace(cached_tokens=6),
        ),
    )


def _dumper(item: dict[str, Any]) -> Callable[..., dict[str, Any]]:
    def dump(**_kwargs: Any) -> dict[str, Any]:
        return item

    return dump


def _message(text: str) -> SimpleNamespace:
    part = SimpleNamespace(type="output_text", text=text)
    return SimpleNamespace(
        type="message",
        model_dump=_dumper({"type": "message", "content": [{"text": text}]}),
        content=[part],
    )


def _function_call(call_id: str, name: str, arguments: str) -> SimpleNamespace:
    dump = {"type": "function_call", "id": "fc_1", "call_id": call_id, "name": name}
    dump["arguments"] = arguments
    return SimpleNamespace(
        type="function_call",
        id="fc_1",
        call_id=call_id,
        name=name,
        arguments=arguments,
        model_dump=_dumper(dump),
    )


class _FakeResponses:
    def __init__(self, response: SimpleNamespace) -> None:
        self.response = response
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.kwargs = kwargs
        return self.response


class _FakeClient:
    def __init__(self, response: SimpleNamespace) -> None:
        self.responses = _FakeResponses(response)


async def test_scripted_model_returns_in_order_then_raises():
    model = ScriptedModel([_result("a"), _result("b")])
    first = await model.call(system="s", input=[{"role": "user", "content": "hi"}])
    second = await model.call(system="s2", input=[], tools=[{"type": "function"}])
    assert (first.text, second.text) == ("a", "b")
    assert [c["system"] for c in model.calls] == ["s", "s2"]
    assert model.calls[1]["tools"] == [{"type": "function"}]
    with pytest.raises(ScriptExhausted):
        await model.call(system="s", input=[])


def test_length_stop_from_incomplete_response():
    response = SimpleNamespace(
        status="incomplete", incomplete_details=SimpleNamespace(reason="max_output_tokens")
    )
    assert stop_from_response(response, has_tool_calls=False) == "length"
    done = SimpleNamespace(status="completed", incomplete_details=None)
    assert stop_from_response(done, has_tool_calls=False) == "stop"
    assert stop_from_response(done, has_tool_calls=True) == "tool_calls"


def test_other_incomplete_reason_is_an_error():
    response = SimpleNamespace(
        status="incomplete", incomplete_details=SimpleNamespace(reason="content_filter")
    )
    with pytest.raises(ModelFailed, match="content_filter"):
        stop_from_response(response, has_tool_calls=False)


def test_result_from_response_reads_text_calls_usage_and_echo_items():
    call = _function_call("call_9", "get_product", '{"id": "p1"}')
    result = result_from_response(
        _response(output=[_message("hello "), call, _message("world")]), latency_ms=12
    )
    assert result.text == "hello world"
    assert result.tool_calls == [
        ToolCall(call_id="call_9", name="get_product", arguments={"id": "p1"})
    ]
    assert result.usage == Usage(input_tokens=10, cached_tokens=6, output_tokens=4)
    assert result.stop == "tool_calls"
    assert result.latency_ms == 12
    assert [i["type"] for i in result.output_items] == ["message", "function_call", "message"]


def test_failed_response_raises_with_the_api_message():
    with pytest.raises(ModelFailed, match="boom"):
        result_from_response(_response(status="failed"), latency_ms=1)


def test_unparseable_tool_arguments_raise():
    bad = _function_call("c", "t", "{not json")
    with pytest.raises(ModelFailed, match="arguments"):
        result_from_response(_response(output=[bad]), latency_ms=1)
    not_an_object = _function_call("c", "t", "[1, 2]")
    with pytest.raises(ModelFailed, match="not a JSON object"):
        result_from_response(_response(output=[not_an_object]), latency_ms=1)


async def test_azure_model_sends_responses_api_request_without_temperature():
    client = _FakeClient(_response(output=[_message("hi")]))
    model = AzureModel(_settings(), client=client)  # pyright: ignore[reportArgumentType]
    tools: list[dict[str, Any]] = [
        {"type": "function", "name": "t", "description": "d", "parameters": {}}
    ]
    result = await model.call(system="sys", input=[{"role": "user", "content": "q"}], tools=tools)
    kwargs = client.responses.kwargs
    assert kwargs["model"] == "deploy-x"
    assert kwargs["instructions"] == "sys"
    assert kwargs["input"] == [{"role": "user", "content": "q"}]
    assert kwargs["tools"] == tools
    assert "temperature" not in kwargs and "reasoning" not in kwargs
    assert "max_output_tokens" not in kwargs
    assert result.text == "hi" and result.latency_ms >= 0


async def test_azure_model_passes_reasoning_effort_and_output_cap_only_when_set():
    client = _FakeClient(_response(output=[_message("hi")]))
    model = AzureModel(_settings("low"), client=client, max_output_tokens=500)  # pyright: ignore[reportArgumentType]
    await model.call(system="s", input=[])
    kwargs = client.responses.kwargs
    assert kwargs["reasoning"] == {"effort": "low"}
    assert kwargs["max_output_tokens"] == 500
    assert "tools" not in kwargs


def test_azure_model_builds_its_own_client_from_settings():
    assert AzureModel(_settings()) is not None


def test_settings_from_env_reads_the_file_and_real_env_wins(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "AZURE_FOUNDRY_ENDPOINT=https://a.invalid/\nAZURE_FOUNDRY_API_KEY=secret-k\n"
        "MODEL_UI_DEPLOYMENT=d\nAZURE_OPENAI_API_VERSION=v1\nMODEL_UI_REASONING_EFFORT=\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("MODEL_UI_DEPLOYMENT", "from-real-env")
    settings = Settings.from_env(env)
    assert settings.endpoint == "https://a.invalid/"
    assert settings.api_version == "v1"
    assert settings.ui_deployment == "from-real-env"
    assert settings.ui_reasoning_effort is None
    assert "secret-k" not in repr(settings)


def test_missing_settings_lists_every_empty_name(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    env = tmp_path / ".env"
    env.write_text(
        "AZURE_FOUNDRY_ENDPOINT=https://a.invalid/\nAZURE_FOUNDRY_API_KEY=\n", encoding="utf-8"
    )
    with pytest.raises(MissingSettings) as caught:
        Settings.from_env(env)
    assert caught.value.names == [
        "AZURE_FOUNDRY_API_KEY",
        "MODEL_UI_DEPLOYMENT",
        "AZURE_OPENAI_API_VERSION",
    ]
    assert "MODEL_UI_DEPLOYMENT" in str(caught.value)


@pytest.mark.live
async def test_live_ping():
    model = AzureModel(Settings.from_env(ROOT_ENV))
    result = await model.call(
        system="You are a terse assistant.",
        input=[{"role": "user", "content": "Reply with the word: pong"}],
    )
    print(f"live ping: usage={result.usage} latency_ms={result.latency_ms} text={result.text!r}")
    assert result.stop == "stop"
    assert result.usage.output_tokens > 0


@pytest.mark.live
async def test_live_tool_round_trip_echoes_items_back():
    model = AzureModel(Settings.from_env(ROOT_ENV))
    tools: list[dict[str, Any]] = [
        {
            "type": "function",
            "name": "get_code",
            "description": "Returns the secret code word. Always call it before answering.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        }
    ]
    history: list[dict[str, Any]] = [
        {"role": "user", "content": "What is the secret code word? Use the tool."}
    ]
    first = await model.call(system="Use tools when asked.", input=history, tools=tools)
    assert first.stop == "tool_calls" and first.tool_calls
    history += first.output_items
    history += [
        {"type": "function_call_output", "call_id": c.call_id, "output": "PELICAN"}
        for c in first.tool_calls
    ]
    second = await model.call(system="Use tools when asked.", input=history, tools=tools)
    print(
        f"live round trip: usage={second.usage} latency_ms={second.latency_ms} text={second.text!r}"
    )
    assert second.stop == "stop" and "PELICAN" in second.text.upper()
