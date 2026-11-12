"""The one place that imports the A2UI SDK: Express blocks in, A2UI v1.0 messages out.

The model writes A2UI Express inside `<a2ui>...</a2ui>`. A build defines `root = Page(...)` and its
sections, each assigned to a named variable; the variable names become the component IDs. An edit
starts with `surface(update=true)`, rewrites `root` and defines only the sections that are new or
changed, so it compiles to one `updateComponents` that leaves every other section alone.

A page is kept as a `Snapshot`: one `createSurface` message holding every component on the page.
"""

import copy
import json
from functools import cache
from importlib.resources import files
from typing import Any

from a2ui.core import A2uiError, Catalog, CatalogApi

# `a2ui` is a namespace package: its top-level py.typed does not reach these modules, so pyright
# reads their (annotated) source and asks for stubs.
from a2ui.inference_formats.express import (  # pyright: ignore[reportMissingTypeStubs]
    ExpressDecompiler,
    ExpressFormat,
    ExpressParser,
)
from a2ui.parser import (  # pyright: ignore[reportMissingTypeStubs]
    A2uiPart,
    RawA2uiPart,
    to_message_dicts,
    to_message_models,
)
from a2ui.utils import RendererState  # pyright: ignore[reportMissingTypeStubs]

Message = dict[str, Any]
Snapshot = Message

ROOT_ID = "root"
_CREATE = "createSurface"
_UPDATE = "updateComponents"


class CompileError(Exception):
    """A block that does not compile, or that the page it targets would reject."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@cache
def shop_catalog_json() -> dict[str, Any]:
    """The shop catalog document, as shipped in the package."""
    text = files("halden_agent").joinpath("catalog", "shop.json").read_text(encoding="utf-8")
    document: dict[str, Any] = json.loads(text)
    return document


@cache
def _catalog() -> CatalogApi:
    return Catalog.from_json(shop_catalog_json())


@cache
def prompt_snippet() -> str:
    """The SDK's Express rules plus the shop catalog's signatures and instructions."""
    fmt = ExpressFormat([_catalog()], allowed_messages=[_CREATE, _UPDATE])
    return fmt.prompt_generator.generate()


def compile_block(text: str, *, surface_id: str, current: Snapshot | None) -> list[Message]:
    """Compiles the model's `<a2ui>` block for `surface_id`, checked against the current page.

    Without a current page the block must build one (`root = Page(...)`). With one, the block must
    be an edit (`surface(update=true)`); the SDK rejects a second `createSurface`, dangling
    references and catalog violations such as text over its limit.

    Raises:
        CompileError: The block is missing, cut off, does not compile, targets another surface, or
            sends something other than components.
    """
    parser = ExpressParser([_catalog()], surface_id=surface_id)
    blocks = [part for part in parser.unwrap(text) if isinstance(part.part, RawA2uiPart)]
    if not blocks:
        raise CompileError(["No <a2ui> block found. Write the page inside <a2ui> and </a2ui>."])
    if not all(block.is_final for block in blocks):
        raise CompileError(["The <a2ui> block is cut off: it has no closing </a2ui> tag."])

    state = RendererState([_catalog()])
    if current is not None:
        state.apply([current])
    try:
        parts = parser.parse_response(text, state=state)
    except A2uiError as error:
        errors = _error_lines(error)
        # The SDK says only "Surface <id> already exists." when an edit forgets update=true.
        if current is not None and "already exists" in str(error):
            errors.append(
                "This page already exists. An edit starts with surface(update=true), rewrites "
                "root and defines only the new or changed sections."
            )
        raise CompileError(errors) from error

    messages = [
        message
        for part in parts
        if isinstance(part, A2uiPart)
        for message in to_message_dicts(part.a2ui)
    ]
    errors = [
        error for message in messages if (error := _target_error(message, surface_id)) is not None
    ]
    if errors:
        raise CompileError(errors)
    return messages


def _error_lines(error: A2uiError) -> list[str]:
    if not error.details:
        return [str(error)]
    return [
        f"{detail.path}: {detail.message}" if detail.path else detail.message
        for detail in error.details
    ]


def _target_error(message: Message, surface_id: str) -> str | None:
    kind = next((key for key in (_CREATE, _UPDATE) if key in message), None)
    if kind is None or "dataModel" in message[kind]:
        return "Only components can be sent: no $/ data lines, no deleteSurface, no calls."
    target = message[kind].get("surfaceId")
    if target != surface_id:
        return f"The block targets surface {target!r}, but this page is {surface_id!r}."
    return None


def apply_messages(current: Snapshot | None, messages: list[Message]) -> Snapshot:
    """The page after the messages: components replaced by ID, unreachable ones dropped.

    Pure: neither `current` nor the messages are changed.
    """
    page = copy.deepcopy(current) if current is not None else None
    for message in messages:
        if _CREATE in message:
            page = copy.deepcopy(message)
        elif _UPDATE in message:
            if page is None:
                raise ValueError("updateComponents needs a page to update")
            body = message[_UPDATE]
            surface = page[_CREATE]
            if body["surfaceId"] != surface["surfaceId"]:
                raise ValueError(f"updateComponents targets another surface: {body['surfaceId']}")
            surface["components"] = _merge(surface["components"], body["components"])
        else:
            raise ValueError(f"Unsupported message: {sorted(message)}")
    if page is None:
        raise ValueError("No page: the messages create nothing")
    surface = page[_CREATE]
    surface["components"] = _reachable(surface["components"])
    return page


def _merge(components: list[dict[str, Any]], updates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {component["id"]: component for component in components}
    order = list(by_id)
    for update in updates:
        if update["id"] not in by_id:
            order.append(update["id"])
        by_id[update["id"]] = copy.deepcopy(update)
    return [by_id[component_id] for component_id in order]


def _reachable(components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {component["id"]: component for component in components}
    ref_map = _catalog().component_ref_map
    seen: set[str] = set()
    stack = [ROOT_ID]
    while stack:
        component_id = stack.pop()
        component = by_id.get(component_id)
        if component is None or component_id in seen:
            continue
        seen.add(component_id)
        spec = ref_map.get(component["component"])
        if spec is not None:
            stack.extend(child for child, _ in spec.extract_child_references(component))
    return [component for component in components if component["id"] in seen]


def decompile(snapshot: Snapshot) -> str:
    """The page as an Express block, with keyword arguments, that compiles back to `snapshot`."""
    decompiler = ExpressDecompiler([_catalog()])
    body = decompiler.decompile(to_message_models([snapshot]), use_keyword_args=True)
    return decompiler.wrap_decompiled_blocks([body])
