"""The action registry and the source check (spec §8.1).

`catalog/actions.json` gives every action one kind: `local` runs in the browser, `direct` is
`POST /api/actions`, `agent` is a run. A direct action lists the sources that may send it: a
catalog component type (a button on a page) or `shell:<id>` (the cart drawer, the user menu).
The web imports the same file, so both sides read one registry.
"""

import json
from dataclasses import dataclass
from importlib.resources import files
from typing import Any, Literal, cast, get_args

from obsidian_store import TabRecord

ActionKind = Literal["local", "direct", "agent"]
# Shell buttons (cart drawer, user menu) are not on an A2UI surface; they send this surface ID.
SHELL_SURFACE = "shell"
_SHELL_PREFIX = "shell:"


@dataclass(frozen=True)
class ActionSpec:
    kind: ActionKind
    # Who may send a direct action: component types, or `shell:<sourceComponentId>`.
    sources: tuple[str, ...] = ()


def load_actions(text: str) -> dict[str, ActionSpec]:
    """The registry from its JSON; a malformed entry raises `ValueError`, naming it."""
    raw = cast(dict[str, dict[str, Any]], json.loads(text))
    actions: dict[str, ActionSpec] = {}
    for name, entry in raw.items():
        kind = entry.get("kind")
        sources: object = entry.get("sources", [])
        if kind not in get_args(ActionKind):
            raise ValueError(f"action {name}: kind must be local, direct or agent, not {kind!r}")
        if not isinstance(sources, list):
            raise ValueError(f"action {name}: sources must be a list of strings")
        names = [source for source in cast(list[object], sources) if isinstance(source, str)]
        if len(names) != len(cast(list[object], sources)):
            raise ValueError(f"action {name}: sources must be a list of strings")
        if kind == "direct" and not names:
            raise ValueError(f"action {name}: a direct action needs its sources")
        actions[name] = ActionSpec(kind=cast(ActionKind, kind), sources=tuple(names))
    return actions


ACTIONS: dict[str, ActionSpec] = load_actions(
    files("obsidian_agent").joinpath("catalog", "actions.json").read_text(encoding="utf-8")
)


def check_source(
    spec: ActionSpec,
    *,
    surface_id: str,
    source_id: str,
    context: dict[str, Any],
    open_tabs: list[TabRecord],
) -> str | None:
    """Why this source may not send this action, or None when it may.

    A `shell` surface passes only for a `shell:<source_id>` the action lists. Otherwise the
    surface is one of the shopper's open tabs, the source a component on that tab's page whose
    type the action lists, and when the component or the action names products, the one in
    `context` is among those the component acts on (its `productId`, or a shelf item's).
    """
    if surface_id == SHELL_SURFACE:
        if f"{_SHELL_PREFIX}{source_id}" in spec.sources:
            return None
        return f"This action can't be sent from the {source_id}."
    tab = next((tab for tab in open_tabs if tab.surface_id == surface_id), None)
    if tab is None or tab.snapshot is None:
        return "That page isn't open."
    components: list[dict[str, Any]] = tab.snapshot["createSurface"]["components"]
    component = next((c for c in components if c.get("id") == source_id), None)
    if component is None:
        return f"{source_id} is not on that page."
    if component.get("component") not in spec.sources:
        return f"{source_id} can't send this action."
    named = _product_ids(component)
    if (named or "productId" in context) and context.get("productId") not in named:
        return f"{source_id} is not for that product."
    return None


def _product_ids(component: dict[str, Any]) -> set[str]:
    """The products a component's own controls act on: its `productId`, or each item's (a
    `ProductShelf` item has its own Add to cart, spec §7.4)."""
    named: set[str] = set()
    product_id = component.get("productId")
    if isinstance(product_id, str):
        named.add(product_id)
    items = component.get("items")
    if isinstance(items, list):
        for item in cast(list[object], items):
            if isinstance(item, dict):
                item_id = cast(dict[str, Any], item).get("productId")
                if isinstance(item_id, str):
                    named.add(item_id)
    return named
