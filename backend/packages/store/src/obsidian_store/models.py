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
