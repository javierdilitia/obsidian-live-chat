"""The page validator: the checks the backend runs on a page before it reaches the browser."""

import copy
from pathlib import Path
from typing import Any

from obsidian_agent.a2ui_adapter import Snapshot, apply_messages, compile_block
from obsidian_agent.fixtures import FIXTURE_SURFACE_ID
from obsidian_agent.validate import Issue, issues_for_model, page_product_ids, validate_page

FIXTURES = Path(__file__).parent / "fixtures"
SURFACE = FIXTURE_SURFACE_ID
KNOWN = {"aeris-studio-16", "kore-zephyr-14", "vela-prism-15", "nova-air-13"}


def _build() -> Snapshot:
    text = (FIXTURES / "build.a2ui").read_text(encoding="utf-8")
    return apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))


def _component(snapshot: Snapshot, component_id: str) -> dict[str, Any]:
    for component in snapshot["createSurface"]["components"]:
        if component["id"] == component_id:
            return component
    raise KeyError(component_id)


def _codes(issues: list[Issue]) -> list[tuple[str, str]]:
    return [(issue.code, issue.component_id) for issue in issues]


def test_build_fixture_is_valid() -> None:
    assert validate_page(_build(), known_products=KNOWN) == []


def test_unknown_product() -> None:
    page = _build()
    _component(page, "specs")["productIds"].append("ghost-laptop-99")

    issues = validate_page(page, known_products=KNOWN)

    assert _codes(issues) == [("unknown_product", "specs")]
    assert "ghost-laptop-99" in issues[0].message


def test_button_must_target_a_shown_product() -> None:
    page = _build()
    _component(page, "verdict_button")["productId"] = "nova-air-13"

    issues = validate_page(page, known_products=KNOWN)

    assert _codes(issues) == [("button_target", "verdict_button")]
    assert "nova-air-13" in issues[0].message


def test_text_limit() -> None:
    page = _build()
    at_limit = copy.deepcopy(page)
    _component(at_limit, "verdict")["text"] = "a" * 200
    over_limit = copy.deepcopy(page)
    _component(over_limit, "verdict")["text"] = "a" * 201

    assert validate_page(at_limit, known_products=KNOWN) == []
    issues = validate_page(over_limit, known_products=KNOWN)
    assert _codes(issues) == [("text_limit", "verdict")]
    assert "text" in issues[0].message and "200" in issues[0].message


def test_rejects_unnamed_section() -> None:
    text = """<a2ui>
root = Page(title="Two laptops", kicker="comparison", children=[shelf, Verdict(text="Aeris wins.")])
shelf = ProductShelf(items=[{productId: "aeris-studio-16", tag: "most power"},
                            {productId: "kore-zephyr-14", tag: "lightest"}])
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    issues = validate_page(page, known_products=KNOWN)

    assert _codes(issues) == [("unnamed_section", "root_children_1")]
    feedback = issues_for_model(issues)
    assert "root_children_1" in feedback and "named variable" in feedback


def test_root_must_be_a_page() -> None:
    text = """<a2ui>
root = Verdict(text="Aeris wins.")
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    assert _codes(validate_page(page, known_products=KNOWN)) == [("root_not_page", "root")]


def test_no_issues_means_no_feedback() -> None:
    assert issues_for_model([]) == ""


def test_template_children_are_rejected() -> None:
    # This catalog has no data model, so a template child list would render nothing.
    text = """<a2ui>
root = Page(title="Laptops", kicker="comparison", children=_template($/items, item))
item = Verdict(text="Aeris wins.")
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    issues = validate_page(page, known_products=KNOWN)

    assert _codes(issues) == [("template_children", "root")]
    assert "by name" in issues_for_model(issues)


def test_page_product_ids() -> None:
    assert page_product_ids(_build()) == {"aeris-studio-16", "kore-zephyr-14", "vela-prism-15"}
