"""Checks a compiled page before it reaches the browser (spec §7.1, post-compile validation).

The SDK already rejects what the catalog schema forbids while compiling. These checks cover what
the schema cannot say: products that do not exist, a button for a product the page does not show,
a section written inline (it would get a position-based ID and remount on the next insert), a
template child list (this catalog has no data model to fill it), and a root that is not a `Page`.
Text limits are checked again, from the same catalog, on the whole page.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Literal, cast

from halden_agent.a2ui_adapter import ROOT_ID, Snapshot, shop_catalog_json

IssueCode = Literal[
    "unknown_product",
    "button_target",
    "text_limit",
    "root_not_page",
    "unnamed_section",
    "template_children",
]

# The SDK names an inline component after where it sits: `<parent>_<prop>` for a single child,
# `<parent>_<prop>_<n>` in a list, and `_inline_<n>` when it has no parent (a list held by a
# variable). A section written inline in `Page(children=[...])` becomes `root_children_<n>`.
UNNAMED_SECTION = re.compile(r"(_child|_children_\d+)$|^_inline_\d+$")

_PRODUCT_KEYS = ("productId", "productIds", "pickId")


@dataclass(frozen=True)
class Issue:
    code: IssueCode
    component_id: str
    message: str


def validate_page(snapshot: Snapshot, *, known_products: set[str]) -> list[Issue]:
    """Every problem on the page; empty when it may be sent. Pure: the caller passes known IDs."""
    components: list[dict[str, Any]] = snapshot["createSurface"]["components"]
    issues = _root_issues({component["id"]: component for component in components})
    shown = {
        product_id
        for component in components
        if component["component"] != "AddToCartButton"
        for product_id in _product_ids(component)
    }
    for component in components:
        issues.extend(_component_issues(component, known_products, shown))
    return issues


def page_product_ids(snapshot: Snapshot) -> set[str]:
    """Every product ID the page names, buttons included: the IDs to look up before validating."""
    components: list[dict[str, Any]] = snapshot["createSurface"]["components"]
    return {product_id for component in components for product_id in _product_ids(component)}


def _root_issues(by_id: dict[str, dict[str, Any]]) -> list[Issue]:
    root = by_id.get(ROOT_ID)
    if root is None or root["component"] != "Page":
        found = "nothing" if root is None else root["component"]
        return [Issue("root_not_page", ROOT_ID, f"root must be a Page, not {found}.")]
    sections = cast(list[Any], root.get("children", []))
    return [
        Issue(
            "unnamed_section",
            section,
            f"Section {section} is written inline inside Page. Assign it to a named variable "
            "(for example `verdict = Verdict(...)`) and list that name in Page.children.",
        )
        for section in sections
        if isinstance(section, str) and UNNAMED_SECTION.search(section)
    ]


def _component_issues(
    component: dict[str, Any], known_products: set[str], shown: set[str]
) -> list[Issue]:
    component_id: str = component["id"]
    issues: list[Issue] = []
    if isinstance(component.get("children"), dict):
        issues.append(
            Issue(
                "template_children",
                component_id,
                f"{component_id}.children is a template (_template). This catalog has no data "
                "model: list each child by name, for example children=[verdict, shelf].",
            )
        )
    unknown = [
        product_id for product_id in _product_ids(component) if product_id not in known_products
    ]
    if unknown:
        issues.append(
            Issue("unknown_product", component_id, f"Unknown product IDs: {', '.join(unknown)}.")
        )
    if component["component"] == "AddToCartButton":
        product_id = component.get("productId")
        if isinstance(product_id, str) and product_id in known_products and product_id not in shown:
            issues.append(
                Issue(
                    "button_target",
                    component_id,
                    f"The button adds {product_id}, which the page does not show. "
                    "A button may only name a product shown in a shelf, table or chart.",
                )
            )
    schema = _component_schema(component["component"])
    for name, value in component.items():
        prop = schema.get(name)
        if isinstance(prop, dict):
            for path, limit, length in _text_overflows(value, cast(dict[str, Any], prop), name):
                issues.append(
                    Issue(
                        "text_limit",
                        component_id,
                        f"{path} is {length} characters; the limit is {limit}.",
                    )
                )
    return issues


def _component_schema(name: str) -> dict[str, Any]:
    components: dict[str, Any] = shop_catalog_json()["components"]
    definition = components.get(name)
    if not isinstance(definition, dict):
        return {}
    properties = cast(dict[str, Any], definition).get("properties", {})
    return cast(dict[str, Any], properties)


def _product_ids(value: Any) -> Iterator[str]:
    """Every product ID a component names, wherever it sits in its props."""
    if isinstance(value, dict):
        for key, item in cast(dict[str, Any], value).items():
            if key in _PRODUCT_KEYS and isinstance(item, str):
                yield item
            elif key in _PRODUCT_KEYS and isinstance(item, list):
                yield from (p for p in cast(list[Any], item) if isinstance(p, str))
            else:
                yield from _product_ids(item)
    elif isinstance(value, list):
        for item in cast(list[Any], value):
            yield from _product_ids(item)


def _text_overflows(
    value: Any, schema: dict[str, Any], path: str
) -> Iterator[tuple[str, int, int]]:
    """(path, limit, length) for every string in `value` longer than its schema's maxLength."""
    if isinstance(value, str):
        limit = schema.get("maxLength")
        if isinstance(limit, int) and len(value) > limit:
            yield path, limit, len(value)
    elif isinstance(value, list):
        items = schema.get("items")
        if isinstance(items, dict):
            for index, item in enumerate(cast(list[Any], value)):
                yield from _text_overflows(item, cast(dict[str, Any], items), f"{path}[{index}]")
    elif isinstance(value, dict):
        properties = schema.get("properties")
        if isinstance(properties, dict):
            sub_schemas = cast(dict[str, Any], properties)
            for key, item in cast(dict[str, Any], value).items():
                sub = sub_schemas.get(key)
                if isinstance(sub, dict):
                    yield from _text_overflows(item, cast(dict[str, Any], sub), f"{path}.{key}")


def issues_for_model(issues: list[Issue]) -> str:
    """The issues as feedback for the one retry; empty when there are none."""
    if not issues:
        return ""
    lines = [f"- {issue.component_id} ({issue.code}): {issue.message}" for issue in issues]
    return "The page was not accepted. Fix these problems and send the block again:\n" + "\n".join(
        lines
    )
