"""The page validator: the checks the backend runs on a page before it reaches the browser."""

import asyncio
import copy
from pathlib import Path
from typing import Any

from halden_data_fake import FakeCatalogSource
from obsidian_agent.a2ui_adapter import Snapshot, apply_messages, compile_block
from obsidian_agent.fixtures import FIXTURE_SURFACE_ID
from obsidian_agent.validate import Issue, issues_for_model, page_product_ids, validate_page
from obsidian_data_contract import Product

FIXTURES = Path(__file__).parent / "fixtures"
SURFACE = FIXTURE_SURFACE_ID
FIXTURE_PRODUCTS = ["aeris-studio-16", "kore-zephyr-14", "vela-prism-15"]


def _products() -> dict[str, Product]:
    """The fixture's products, plus `nova-air-13`: a product that exists but the page omits."""
    found = asyncio.run(FakeCatalogSource().get_products(FIXTURE_PRODUCTS))
    products = {product.id: product for product in found}
    products["nova-air-13"] = found[1].model_copy(update={"id": "nova-air-13"})
    return products


PRODUCTS = _products()


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
    assert validate_page(_build(), products=PRODUCTS) == []


def test_unknown_product() -> None:
    page = _build()
    _component(page, "specs")["productIds"].append("ghost-laptop-99")

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("unknown_product", "specs")]
    assert "ghost-laptop-99" in issues[0].message


def test_button_must_target_a_shown_product() -> None:
    page = _build()
    _component(page, "verdict_button")["productId"] = "nova-air-13"

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("button_target", "verdict_button")]
    assert "nova-air-13" in issues[0].message


def test_text_limit() -> None:
    page = _build()
    at_limit = copy.deepcopy(page)
    _component(at_limit, "verdict")["text"] = "a" * 200
    over_limit = copy.deepcopy(page)
    _component(over_limit, "verdict")["text"] = "a" * 201

    assert validate_page(at_limit, products=PRODUCTS) == []
    issues = validate_page(over_limit, products=PRODUCTS)
    assert _codes(issues) == [("text_limit", "verdict")]
    assert "text" in issues[0].message and "200" in issues[0].message


def test_rejects_unnamed_section() -> None:
    text = """<a2ui>
root = Page(title="Two laptops", kicker="comparison", children=[shelf, Verdict(text="Aeris wins.")])
shelf = ProductShelf(items=[{productId: "aeris-studio-16", tag: "most power"},
                            {productId: "kore-zephyr-14", tag: "lightest"}])
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("unnamed_section", "root_children_1")]
    feedback = issues_for_model(issues)
    assert "root_children_1" in feedback and "named variable" in feedback


def test_root_must_be_a_page() -> None:
    text = """<a2ui>
root = Verdict(text="Aeris wins.")
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    assert _codes(validate_page(page, products=PRODUCTS)) == [("root_not_page", "root")]


def test_no_issues_means_no_feedback() -> None:
    assert issues_for_model([]) == ""


def test_template_children_are_rejected() -> None:
    # This catalog has no data model, so a template child list would render nothing.
    text = """<a2ui>
root = Page(title="Laptops", kicker="comparison", children=_template($/items, item))
item = Verdict(text="Aeris wins.")
</a2ui>"""
    page = apply_messages(None, compile_block(text, surface_id=SURFACE, current=None))

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("template_children", "root")]
    assert "by name" in issues_for_model(issues)


def test_page_product_ids() -> None:
    assert page_product_ids(_build()) == {"aeris-studio-16", "kore-zephyr-14", "vela-prism-15"}


def test_section_inside_a_chart_grid_is_misplaced() -> None:
    page = _build()
    _component(page, "charts")["children"].append("specs")
    _component(page, "root")["children"].remove("specs")

    assert ("misplaced", "specs") in _codes(validate_page(page, products=PRODUCTS))


def test_bar_chart_directly_under_page_is_misplaced() -> None:
    page = _build()
    chart = _component(page, "charts")["children"].pop()
    _component(page, "root")["children"].append(chart)

    assert ("misplaced", chart) in _codes(validate_page(page, products=PRODUCTS))


def test_chart_key_must_be_numeric() -> None:
    page = _build()
    chart = _component(page, "charts")["children"][0]
    _component(page, chart)["specKey"] = "cpu"

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("spec_not_numeric", chart)]
    assert "batt" in issues[0].message


def test_number_looking_text_is_not_chartable() -> None:
    page = _build()
    chart = _component(page, "charts")["children"][0]
    _component(page, chart)["specKey"] = "weight"

    assert _codes(validate_page(page, products=PRODUCTS)) == [("spec_not_numeric", chart)]


def test_chart_key_missing_on_some_products_passes() -> None:
    page = _build()
    chart = _component(page, "charts")["children"][0]
    _component(page, chart)["specKey"] = "p3"
    vela = PRODUCTS["vela-prism-15"]
    without_p3 = vela.model_copy(
        update={"specs": {k: v for k, v in vela.specs.items() if k != "p3"}}
    )
    products = {**PRODUCTS, without_p3.id: without_p3}

    assert validate_page(page, products=products) == []


def test_table_key_no_product_has_is_unknown() -> None:
    page = _build()
    _component(page, "specs")["specKeys"].append("warp_drive")

    issues = validate_page(page, products=PRODUCTS)

    assert _codes(issues) == [("spec_unknown", "specs")]
    assert "warp_drive" in issues[0].message and "batt" in issues[0].message


def test_repeated_product_in_one_component() -> None:
    assert validate_page(_build(), products=PRODUCTS) == []  # pickId repeats an item: fine

    table = _build()
    _component(table, "specs")["productIds"].append("kore-zephyr-14")
    assert _codes(validate_page(table, products=PRODUCTS)) == [("duplicate_product", "specs")]

    shelf = _build()
    items = _component(shelf, "shelf")["items"]
    items.append({"productId": items[1]["productId"], "tag": "again"})
    assert _codes(validate_page(shelf, products=PRODUCTS)) == [("duplicate_product", "shelf")]
