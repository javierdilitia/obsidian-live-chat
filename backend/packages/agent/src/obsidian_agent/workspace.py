"""The demo's in-memory state: one tab and one cart, a single instance per app.

There is no session or persistence yet (milestone 3 adds both), so every browser shares this state
and a restart forgets it.
"""

import asyncio
from dataclasses import dataclass, field

from obsidian_agent.a2ui_adapter import Snapshot


@dataclass
class Tab:
    surface_id: str
    title: str
    # None until the first build succeeds; a failed build leaves the tab open and empty.
    snapshot: Snapshot | None = None
    # The commands that built and then edited the page, in order.
    commands: list[str] = field(default_factory=lambda: [])


@dataclass
class Workspace:
    tab: Tab | None = None
    # Product ID to quantity, in the order the products were first added.
    cart: dict[str, int] = field(default_factory=lambda: {})
    # One run at a time: a second command waits for the first to finish.
    run_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
