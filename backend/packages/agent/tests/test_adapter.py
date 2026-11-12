"""The A2UI adapter: Express blocks compile to v1.0 messages for the shop catalog, and back."""

import json
from pathlib import Path
from typing import Any

import pytest

from obsidian_agent.a2ui_adapter import (
    CompileError,
    Message,
    Snapshot,
    apply_messages,
    compile_block,
    decompile,
    prompt_snippet,
)
from obsidian_agent.fixtures import FIXTURE_SURFACE_ID, compile_fixtures

FIXTURES = Path(__file__).parent / "fixtures"
WEB_FIXTURES = Path(__file__).parents[4] / "web" / "src" / "a2ui" / "fixtures"
SURFACE = FIXTURE_SURFACE_ID


def _block(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def _components(messages: list[Message]) -> dict[str, dict[str, Any]]:
    """Every component the messages send, by ID."""
    found: dict[str, dict[str, Any]] = {}
    for message in messages:
        kind = "createSurface" if "createSurface" in message else "updateComponents"
        components: list[dict[str, Any]] = message[kind]["components"]
        for component in components:
            found[component["id"]] = component
    return found


def _build() -> Snapshot:
    messages = compile_block(_block("build.a2ui"), surface_id=SURFACE, current=None)
    return apply_messages(None, messages)


def test_named_variables_become_ids() -> None:
    messages = compile_block(_block("build.a2ui"), surface_id=SURFACE, current=None)

    components = _components(messages)
    assert components["root"]["component"] == "Page"
    assert components["root"]["children"] == ["verdict", "shelf", "specs", "charts"]
    assert components["verdict"]["component"] == "Verdict"
    assert components["shelf"]["component"] == "ProductShelf"
    assert components["specs"]["component"] == "SpecTable"
    assert components["charts"]["component"] == "ChartGrid"
    assert messages[0]["createSurface"]["surfaceId"] == SURFACE
    assert (
        messages[0]["createSurface"]["catalogId"]
        == "https://obsidian.example/catalogs/shop/v1/catalog.json"
    )


def test_shelf_items_compile_as_objects() -> None:
    messages = compile_block(_block("build.a2ui"), surface_id=SURFACE, current=None)

    shelf = _components(messages)["shelf"]
    assert shelf["items"] == [
        {"productId": "aeris-studio-16", "tag": "most power"},
        {"productId": "kore-zephyr-14", "tag": "lightest"},
        {"productId": "vela-prism-15", "tag": "best value"},
    ]
    assert shelf["pickId"] == "aeris-studio-16"


def test_edit_names_only_root_and_colour() -> None:
    current = _build()

    messages = compile_block(_block("edit_add_colour.a2ui"), surface_id=SURFACE, current=current)

    assert all("createSurface" not in message for message in messages)
    sent = _components(messages)
    colour_parts = set(sent["colour"]["children"])
    assert set(sent) == {"root", "colour"} | colour_parts
    assert all(sent[part]["component"] == "BarChart" for part in colour_parts)
    assert sent["root"]["children"] == ["verdict", "shelf", "colour", "specs", "charts"]
    # Nothing that belongs to the unchanged sections is sent again.
    unchanged = set(_components([current])) - {"root"}
    assert unchanged >= {"verdict", "shelf", "specs", "charts"}
    assert not unchanged & set(sent)

    page = apply_messages(current, messages)
    on_page = _components([page])
    assert unchanged | {"root", "colour"} | colour_parts == set(on_page)


def test_decompile_round_trips() -> None:
    snapshot = _build()

    text = decompile(snapshot)

    assert compile_block(text, surface_id=SURFACE, current=None) == [snapshot]
    edited = apply_messages(
        snapshot,
        compile_block(_block("edit_add_colour.a2ui"), surface_id=SURFACE, current=snapshot),
    )
    assert compile_block(decompile(edited), surface_id=SURFACE, current=None) == [edited]


def test_block_for_another_surface_is_rejected() -> None:
    other = _block("build.a2ui").replace("<a2ui>\n", '<a2ui>\nsurface("shop:other")\n', 1)
    with pytest.raises(CompileError) as caught:
        compile_block(other, surface_id=SURFACE, current=None)
    assert caught.value.errors

    edit = _block("edit_add_colour.a2ui").replace(
        "surface(update=true)", 'surface("shop:other", update=true)'
    )
    with pytest.raises(CompileError):
        compile_block(edit, surface_id=SURFACE, current=_build())


def test_web_fixtures_match_the_express_fixtures() -> None:
    for name, messages in compile_fixtures().items():
        written = json.loads((WEB_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
        assert written == messages, f"run `python -m obsidian_agent.fixtures` to refresh {name}"


def test_prompt_snippet_teaches_the_catalog_and_the_edit_syntax() -> None:
    snippet = prompt_snippet()

    assert snippet == prompt_snippet()
    assert "<a2ui>" in snippet
    assert "surface(update=true)" in snippet
    for name in ("Page", "Verdict", "ProductShelf", "SpecTable", "ChartGrid", "BarChart"):
        assert f"• {name}(" in snippet


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Here is your page.", "No <a2ui> block"),
        ('<a2ui>\nroot = Page(title="x", kicker="y", children=[])', "cut off"),
        ('<a2ui>\nroot = Page(title="x", kicker=\n</a2ui>', "Syntax error"),
        ('<a2ui>\nroot = Page(title="x", kicker="y", children=[], price=3)\n</a2ui>', "price"),
        ('<a2ui>\nroot = Page(title="x", kicker="y", children=[nope])\n</a2ui>', "nope"),
        ('<a2ui>\nroot = Page(title="x", kicker="y", children=[])\n$/x = 1\n</a2ui>', "Only"),
    ],
)
def test_bad_blocks_raise_compile_error(text: str, expected: str) -> None:
    with pytest.raises(CompileError) as caught:
        compile_block(text, surface_id=SURFACE, current=None)
    assert expected in " ".join(caught.value.errors)


def test_edit_without_update_gets_a_hint() -> None:
    edit = _block("edit_add_colour.a2ui").replace("surface(update=true)\n", "")
    with pytest.raises(CompileError) as caught:
        compile_block(edit, surface_id=SURFACE, current=_build())
    assert "surface(update=true)" in caught.value.errors[-1]


def test_data_lines_are_rejected_in_builds_and_edits() -> None:
    edit = _block("edit_add_colour.a2ui").replace("</a2ui>", "$/x = 1\n</a2ui>")
    with pytest.raises(CompileError) as caught:
        compile_block(edit, surface_id=SURFACE, current=_build())
    assert "Only components" in caught.value.errors[0]
