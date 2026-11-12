"""Checks a compiled page before it reaches the browser (spec §7.1, post-compile validation).

The SDK already rejects what the catalog schema forbids while compiling. These checks cover what
the schema cannot say: products that do not exist, a button for a product the page does not show,
a section written inline (it would get a position-based ID and remount on the next insert), a
template child list (this catalog has no data model to fill it), a root that is not a `Page`,
a component inside a parent it does not belong in, a chart on a spec that is not a number, a table
row no product has, and a product named twice in one component. Text limits are checked again,
from the same catalog, on the whole page.
"""

import json
import math
import re
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Any, Literal, cast

from obsidian_agent.a2ui_adapter import ROOT_ID, Snapshot, child_ids, shop_catalog_json
from obsidian_data_contract import Product

IssueCode = Literal[
    "unknown_product",
    "button_target",
    "text_limit",
    "root_not_page",
    "unnamed_section",
    "template_children",
    "misplaced",
    "spec_not_numeric",
    "spec_unknown",
    "duplicate_product",
    "page_too_large",
]

_SECTION = frozenset({"Page"})
# The component types each type may sit in. A type not listed here has no placement rule.
# Slice 4 extends the map with the new page kinds' components.
PLACEMENT: dict[str, frozenset[str]] = {
    "Verdict": _SECTION,
    "ProductShelf": _SECTION,
    "SpecTable": _SECTION,
    "ChartGrid": _SECTION,
    "BarChart": frozenset({"ChartGrid"}),
    "AddToCartButton": frozenset({"Verdict", "Page"}),
}

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


# A saved page's limit (spec §10.2, §15): the compact JSON of its snapshot, in bytes.
SNAPSHOT_LIMIT_BYTES = 256 * 1024


def page_size_bytes(snapshot: Snapshot) -> int:
    """The page's size as stored: compact JSON, UTF-8."""
    text = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    return len(text.encode("utf-8"))


def _size_issues(snapshot: Snapshot) -> list[Issue]:
    size = page_size_bytes(snapshot)
    if size <= SNAPSHOT_LIMIT_BYTES:
        return []
    message = (
        f"The page is {math.ceil(size / 1024)} KB; the limit is 256 KB. "
        "Use fewer sections or shorter text."
    )
    return [Issue("page_too_large", ROOT_ID, message)]


def validate_page(snapshot: Snapshot, *, products: Mapping[str, Product]) -> list[Issue]:
    """Every problem on the page; empty when it may be sent.

    Pure: `products` holds the page's products that exist, by ID; the caller looks them up.
    """
    components: list[dict[str, Any]] = snapshot["createSurface"]["components"]
    issues = _root_issues({component["id"]: component for component in components})
    shown = {
        product_id
        for component in components
        if component["component"] != "AddToCartButton"
        for product_id in _product_ids(component)
    }
    parent_types: dict[str, str] = {}
    for component in components:
        for child in child_ids(component):
            parent_types.setdefault(child, component["component"])
    for component in components:
        issues.extend(_component_issues(component, products, shown))
        issues.extend(_placement_issues(component, parent_types.get(component["id"])))
        issues.extend(_spec_issues(component, products))
        issues.extend(_duplicate_issues(component))
    issues.extend(_size_issues(snapshot))
    return issues


def numeric_spec_keys(products: Iterable[Product]) -> set[str]:
    """Spec keys a chart can use: at least one product has a number there, and none has text."""
    numeric: set[str] = set()
    other: set[str] = set()
    for product in products:
        for key, spec in product.specs.items():
            (numeric if _is_number(spec.value) else other).add(key)
    return numeric - other


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


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


def _placement_issues(component: dict[str, Any], parent_type: str | None) -> list[Issue]:
    kind: str = component["component"]
    allowed = PLACEMENT.get(kind)
    if allowed is None or parent_type is None or parent_type in allowed:
        return []
    where = " or ".join(sorted(allowed))
    message = f"{component['id']} is a {kind} inside {parent_type}; a {kind} goes only in {where}."
    return [Issue("misplaced", component["id"], message)]


def _strings(value: Any) -> list[str]:
    """The strings in `value` when it is a list; else nothing."""
    if not isinstance(value, list):
        return []
    return [item for item in cast(list[Any], value) if isinstance(item, str)]


def _spec_issues(component: dict[str, Any], products: Mapping[str, Product]) -> list[Issue]:
    """A chart on a key that is not a number, or a table row none of the products has."""
    component_id: str = component["id"]
    found = [products[i] for i in _strings(component.get("productIds")) if i in products]
    if not found:
        return []  # no known products: `unknown_product` reports the IDs
    kind = component["component"]
    key = component.get("specKey")
    if kind == "BarChart" and isinstance(key, str):
        numeric = numeric_spec_keys(found)
        if key not in numeric:
            message = (
                f"{component_id}.specKey {key} is not a number for these products, so it cannot "
                f"be charted. Numeric keys for these products: {_listed(numeric)}."
            )
            return [Issue("spec_not_numeric", component_id, message)]
    if kind == "SpecTable":
        has = {spec_key for product in found for spec_key in product.specs}
        unknown = [k for k in _strings(component.get("specKeys")) if k not in has]
        if unknown:
            message = (
                f"No product in {component_id} has {', '.join(unknown)}. "
                f"Keys these products have: {_listed(has)}."
            )
            return [Issue("spec_unknown", component_id, message)]
    return []


def _listed(keys: set[str]) -> str:
    return ", ".join(sorted(keys)) or "none"


def _duplicate_issues(component: dict[str, Any]) -> list[Issue]:
    """A product named twice in one `productIds`, or by two shelf items. `pickId` is not counted."""
    named = _strings(component.get("productIds"))
    items = component.get("items")
    if component["component"] == "ProductShelf" and isinstance(items, list):
        named = _strings(
            [
                cast(dict[str, Any], item).get("productId")
                for item in cast(list[Any], items)
                if isinstance(item, dict)
            ]
        )
    repeated = [product_id for product_id, count in Counter(named).items() if count > 1]
    if not repeated:
        return []
    component_id: str = component["id"]
    message = f"{component_id} names {', '.join(repeated)} more than once. Name each product once."
    return [Issue("duplicate_product", component_id, message)]


def _component_issues(
    component: dict[str, Any], products: Mapping[str, Product], shown: set[str]
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
    unknown = [product_id for product_id in _product_ids(component) if product_id not in products]
    if unknown:
        issues.append(
            Issue("unknown_product", component_id, f"Unknown product IDs: {', '.join(unknown)}.")
        )
    if component["component"] == "AddToCartButton":
        product_id = component.get("productId")
        if isinstance(product_id, str) and product_id in products and product_id not in shown:
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
