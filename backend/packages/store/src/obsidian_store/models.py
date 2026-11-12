"""The records the store keeps. Frozen; times are timezone-aware UTC; money is integer cents."""

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict

# One compacted A2UI `createSurface` message: `components` plus `dataModel`.
Snapshot = dict[str, Any]


class _Record(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class User(_Record):
    id: str
    name: str
    language: str


class ProductFact(_Record):
    """A product's price and stock as they were when a page was written (spec §5, stale text)."""

    price_cents: int
    stock: int


ProductFacts = dict[str, ProductFact]

TabStatus = Literal["open", "history"]


class TabRecord(_Record):
    id: str
    user_id: str
    surface_id: str
    kind: str
    status: TabStatus
    position: int
    card: dict[str, Any]
    # None until the first build succeeds; a failed first build leaves the tab open and empty.
    snapshot: Snapshot | None
    product_facts: ProductFacts
    language: str
    created_at: AwareDatetime
    updated_at: AwareDatetime
    closed_at: AwareDatetime | None


class TabRevision(_Record):
    tab_id: str
    rev: int
    card: dict[str, Any]
    snapshot: Snapshot
    product_facts: ProductFacts
    run_id: str
    created_at: AwareDatetime


class CartLine(_Record):
    """A product in a cart. No price: prices are read live from the catalog."""

    product_id: str
    qty: int
    added_at: AwareDatetime


class CartChange(_Record):
    """A cart change's outcome: the quantity after it, or the one kept when it was refused."""

    ok: bool
    qty: int


RunTrigger = Literal["command", "action", "foryou"]


class RunRecord(_Record):
    """One run's telemetry (spec §10.2, `runs`)."""

    id: str
    user_id: str
    tab_id: str | None
    trigger: RunTrigger
    tool: str | None
    outcome: str
    router_model: str | None
    ui_model: str | None
    tokens_in: int
    tokens_out: int
    tokens_cached: int
    latency_ms: int
    first_message_ms: int | None
    retries: int
    tool_round_used: bool
    error: str | None
    started_at: AwareDatetime
    finished_at: AwareDatetime


class ActionRecord(_Record):
    """A direct action's answer, kept so a repeated `requestId` gets the same answer."""

    request_id: str
    user_id: str
    result: dict[str, Any]
    at: AwareDatetime
