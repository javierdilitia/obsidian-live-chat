"""Compiles the Express test fixtures into the JSON messages the web tests render.

Run from a source checkout: `uv run --directory backend python -m halden_agent.fixtures`.
It reads `backend/packages/agent/tests/fixtures/*.a2ui` and writes `web/src/a2ui/fixtures/`:
`build.json` (the `createSurface`) and `edit_add_colour.json` (the edit's `updateComponents`,
compiled against the built page).
"""

import json
from pathlib import Path

from halden_agent.a2ui_adapter import Message, apply_messages, compile_block

# A fixed surface ID in the `shop:<uuid4 hex>` shape the agent uses.
FIXTURE_SURFACE_ID = "shop:" + "0" * 32

_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
EXPRESS_FIXTURES = _PACKAGE_ROOT / "tests" / "fixtures"
WEB_FIXTURES = _PACKAGE_ROOT.parents[2] / "web" / "src" / "a2ui" / "fixtures"


def compile_fixtures() -> dict[str, list[Message]]:
    """The compiled messages of each fixture, by name: the build, then the edit on top of it."""
    build_text = (EXPRESS_FIXTURES / "build.a2ui").read_text(encoding="utf-8")
    build = compile_block(build_text, surface_id=FIXTURE_SURFACE_ID, current=None)
    edit_text = (EXPRESS_FIXTURES / "edit_add_colour.a2ui").read_text(encoding="utf-8")
    edit = compile_block(
        edit_text, surface_id=FIXTURE_SURFACE_ID, current=apply_messages(None, build)
    )
    return {"build": build, "edit_add_colour": edit}


def main() -> None:
    WEB_FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, messages in compile_fixtures().items():
        path = WEB_FIXTURES / f"{name}.json"
        text = json.dumps(messages, indent=2, ensure_ascii=False) + "\n"
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
