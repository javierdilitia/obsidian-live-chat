# First Working Demo Implementation Plan (milestone 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first slice of the real product. You type "Compare 3 laptops for video editing under €2,000", a tab opens, and your Azure model builds the comparison page with A2UI. Then "Add colour accuracy" edits the same page in place, and the untouched parts stay still. "Add to cart" works, with the price read on the server.

**Architecture:** The code goes in the real packages and stays. The backend (`halden_agent`) gets an Azure model client, our shop catalog, one small A2UI adapter (the only module that imports the A2UI SDK), a page validator, a page builder and three endpoints. The web app (`web/`) gets our catalog components in the mockup's look and motion, a command bar, one tab and an SSE client. One tab and one shopper for now: the first command builds the page, later commands edit it. No router yet.

**Tech Stack:** Python 3.12, FastAPI, `a2ui-agent-sdk` 0.11.0, `openai` (Responses API on Azure Foundry) · React 19.2, `@a2ui/react` 0.15.0, `@a2ui/web_core` 0.15.0, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-product-spec-design.md`. The demo builds a small part of it: the component catalog (Page, Verdict, ProductShelf, SpecTable, BarChart, ChartGrid, AddToCartButton), its rules (IDs never values, named sections, buttons the model can't aim elsewhere), the run events over SSE, and the motion mapping. Everything else in the spec comes in later slices.

## Global Constraints

- Branch `feat/first-demo` from `docs/product-spec`. Conventional Commits; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Never write A2UI code from memory.** Read the installed package's README and source, then `.claude/skills/a2ui/references/llms-full.txt`. When the docs and the real behaviour differ, add one line to the "Notes from building" list at the end of this plan.
- Exact pins: `a2ui-agent-sdk==0.11.0`, `@a2ui/react` `0.15.0`, `@a2ui/web_core` `0.15.0`. Pin `openai` and `zod` exactly too.
- Only `halden_agent/a2ui_adapter.py` imports the A2UI SDK (the architecture doc's "one small adapter" rule). Pyright stays strict; wrap untyped SDK calls there.
- Secrets come from the root `.env`: `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_API_KEY`, `MODEL_UI_DEPLOYMENT` (and `MODEL_UI_REASONING_EFFORT`, optional, added to `.env.example`). Never log the key. Tests that call Azure are marked `live` and skipped unless `HALDEN_LIVE=1`.
- The model never writes a price, a spec value or an action. Components get product IDs and fetch the rest.
- `python scripts/check.py all` passes at the end of every task.
- No screenshots or headless browser. The final task lists what the user checks by eye.

## Review Focus

1. **The model writes a section inline instead of naming it.** It then gets a position-based ID, and the next insert would remount it. Expected: rejected, one retry. Test: Task 3 `test_rejects_unnamed_section`.
2. **The reply is cut off by the token limit but still compiles.** Expected: treated as a failure. Test: Task 4 `test_length_stop_is_a_failure`.
3. **A failed edit.** Expected: the page keeps its last good state. Test: Task 4 `test_failed_edit_keeps_the_page`.
4. **Add to cart for a product that is out of stock or no longer exists.** Expected: a clear error, nothing added. Test: Task 4 `test_add_out_of_stock`.
5. **An edit inserts a section mid-page.** Expected: nothing else remounts or replays its animation. Test: Task 5 `inserting a section remounts nothing else`.

---

### Task 1: Grow the fake catalog to 50 products

**Files:** `backend/packages/data_fake/src/halden_data_fake/seed/products.json`, `categories.json`; `backend/packages/data_fake/tests/test_seed.py`

- Keep the 13 existing products unchanged. Add 37 for a total of 50: laptops 15, monitors 9, audio 8, docks 6, keyboards 6, storage 6. Every laptop has exactly the keys `display hz cpu gpu ram ssd batt weight ports p3 de`. At least 6 laptops have "OLED" in their display, and at least 3 of those cost ≤ €2,000. One laptop has stock 0 and one has stock 1–3. Names stay fictional (Aeris, Kore, Vela, Lumen).

- [ ] **Step 1:** In `test_seed_integrity`, change the count to `assert len(products) == 50`. Add `test_laptops_cover_the_demo`, which asserts the laptop rules above.
- [ ] **Step 2:** Run `uv run --directory backend pytest packages/data_fake -q`. Expected: FAIL.
- [ ] **Step 3:** Add the products and update the category counts.
- [ ] **Step 4:** Run `python scripts/check.py backend`. Expected: PASS, including the contract suite.
- [ ] **Step 5:** Commit `feat(data-fake): grow the seed catalog to 50 products`.

---

### Task 2: Azure model client

**Files:** Create `backend/packages/agent/src/halden_agent/settings.py`, `.../model.py`, `backend/packages/agent/tests/test_model.py`. Modify `backend/packages/agent/pyproject.toml` (add `openai`, `python-dotenv`), `.env.example`, `backend/pyproject.toml` (pytest marker `live`; add `halden_agent` to `--cov`).

**Interfaces (produced):**
- `Settings(endpoint, api_key, api_version, ui_deployment, ui_reasoning_effort: str | None)` and `Settings.from_env(env_file: Path) -> Settings`, which raises `MissingSettings(names: list[str])`. `api_version` comes from `AZURE_OPENAI_API_VERSION` (add it to `.env.example`, default `2025-04-01-preview`).
- `Usage(input_tokens, cached_tokens, output_tokens)` and `ModelResult(text: str, tool_calls: list[ToolCall], usage: Usage, stop: Literal["stop", "length", "tool_calls"], latency_ms: int)`, with `ToolCall(call_id, name, arguments: dict[str, Any])`.
- `class ModelClient(Protocol)`: `async def call(self, *, system: str, input: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> ModelResult`.
- `AzureModel(settings)`: `openai.AsyncAzureOpenAI(azure_endpoint=endpoint, api_key=..., api_version=api_version)`, Responses API (`client.responses.create(model=ui_deployment, ...)`). The user's endpoint is an Azure OpenAI resource whose Foundry target URI is `https://ridopocs.openai.azure.com/openai/responses?api-version=2025-04-01-preview`. An `incomplete` status for `max_output_tokens` maps to `stop="length"`.
- `ScriptedModel(results: list[ModelResult])`: returns the results in order, records `.calls`, and raises `ScriptExhausted` past the end. Every other test uses it.

- [ ] **Step 1: Write the tests.** `test_scripted_model_returns_in_order_then_raises`; `test_length_stop_from_incomplete_response` (pure helper `stop_from_response` on a `SimpleNamespace`); `test_missing_settings_lists_every_empty_name`; `test_live_ping` (`live`): the call returns `stop == "stop"` and `output_tokens > 0`.
- [ ] **Step 2:** Run `uv run --directory backend pytest packages/agent -q`. Expected: FAIL.
- [ ] **Step 3:** Implement `settings.py` and `model.py`.
- [ ] **Step 4:** Run the tests. Expected: PASS, with the live test skipped. Then run `HALDEN_LIVE=1 uv run --directory backend pytest -m live -q`. Expected: PASS against the user's deployment.
- [ ] **Step 5:** Commit `feat(agent): add the Azure model client`.

---

### Task 3: Shop catalog, A2UI adapter and page validator

**Files:** Create `backend/packages/agent/src/halden_agent/catalog/shop.json` (shipped as package data), `.../a2ui_adapter.py`, `.../validate.py`, `backend/packages/agent/tests/fixtures/{build,edit_add_colour}.a2ui`, `backend/packages/agent/tests/test_adapter.py`, `.../test_validate.py`. Also a small script, `uv run --directory backend python -m halden_agent.fixtures`, that writes the compiled fixtures to `web/src/a2ui/fixtures/*.json` for Task 5.

**Interfaces (produced):**
- `shop.json`: an A2UI v1.0 catalog, `catalogId = "https://halden.example/catalogs/shop/v1/catalog.json"`, with `Page`, `ChartGrid`, `Verdict`, `ProductShelf`, `SpecTable`, `BarChart` and `AddToCartButton`. Fields and text limits are copied from the spec's component catalog tables, as JSON Schema `maxLength` / `minItems` / `maxItems`. No component has an action property. The descriptions tell the model the rules (for example "Section-level: assign it to a named variable").
- In `a2ui_adapter.py`: `Message = dict[str, Any]`; `Snapshot = Message` (one `createSurface` with its components and data model); `prompt_snippet() -> str`; `compile_block(text: str, *, surface_id: str, current: Snapshot | None) -> list[Message]`, which raises `CompileError(errors: list[str])`, including when the block targets another surface; `apply_messages(current: Snapshot | None, messages: list[Message]) -> Snapshot` (pure; replaces components by ID, drops unreachable ones); `decompile(snapshot: Snapshot) -> str`.
- In `validate.py`: `Issue(code, component_id, message)`; `validate_page(snapshot: Snapshot, *, known_products: set[str]) -> list[Issue]` with the codes `unknown_product`, `button_target` (the button's product is not shown on the page), `text_limit`, `root_not_page`, `unnamed_section` (a section ID matching `(_child|_children_\d+)$`); `issues_for_model(issues) -> str`.

- [ ] **Step 1: Read the SDK** for two things: how an edit is written (a block without `root`, or `surface("id", update=true)`), and how inline children get IDs. Note both under "Notes from building".
- [ ] **Step 2: Write the fixtures.** `build.a2ui`: `root = Page(...)` with named `verdict`, `shelf`, `specs` and `charts` (the spec's build example, with real product IDs). `edit_add_colour.a2ui`: rewrites `root` with `colour` inserted after `shelf`, and defines `colour`.
- [ ] **Step 3: Write the tests.**
  - `test_adapter.py`:
    - `test_named_variables_become_ids`;
    - `test_shelf_items_compile_as_objects`;
    - `test_edit_names_only_root_and_colour`;
    - `test_decompile_round_trips`;
    - `test_block_for_another_surface_is_rejected`.
  - `test_validate.py`:
    - `test_build_fixture_is_valid`;
    - `test_unknown_product`;
    - `test_button_must_target_a_shown_product`;
    - `test_text_limit` (Verdict text 201 characters fails, 200 passes);
    - `test_rejects_unnamed_section`.
- [ ] **Step 4:** Run the tests. Expected: FAIL.
- [ ] **Step 5:** Implement the three files.
- [ ] **Step 6:** Run the tests and `python scripts/check.py backend`. Expected: PASS. Then run the fixtures script.
- [ ] **Step 7:** Commit `feat(agent): add the shop catalog, A2UI adapter and page validator`.

---

### Task 4: Page builder and the API

**Files:** Create `backend/packages/agent/src/halden_agent/page_agent.py`, `.../workspace.py`, `.../prompts/page.md`; modify `.../app.py`; tests `test_page_agent.py`, `test_api.py`.

**Interfaces (produced):**
- In `workspace.py`: `Workspace` holds one tab in memory (`surface_id`, `title`, `snapshot`, `commands`) and a cart (`dict[product_id, qty]`). It has one instance per app.
- In `page_agent.py`: `async def build_page(model: ModelClient, source: CatalogSource, *, surface_id: str, command: str, current: Snapshot | None) -> BuildResult`, where `BuildResult(ok, messages, snapshot, attempts: int, error: str | None)`.
  - The system prompt is the fixed `prompt_snippet()` plus `page.md`, kept identical across calls so Azure caches it.
  - The input is the command, plus `decompile(current)` when editing.
  - The model has two read-only tools, `search_products(text?, category?, max_price_cents?, attributes?)` and `get_products(ids)`, with at most 2 tool rounds.
  - The reply is compiled, applied and validated. On a compile error, validation issues, `stop == "length"` or a missing `<a2ui>` block, there is **one** retry with the errors fed back.
- In `app.py`:
  - `POST /api/runs {command}` streams SSE `data: <json>` frames: `RUN_STARTED`; `CUSTOM tab_opened {surface_id, title}` (first build only); `CUSTOM a2ui <message>` for each message; `RUN_FINISHED`, or `RUN_ERROR {code, message}`. A failed edit sends no messages.
  - `GET /api/catalog/products?ids=` returns `{products, missing}`.
  - `POST /api/actions {name, surfaceId, sourceComponentId, context}` handles `cart.add{productId}`: it re-reads the product, checks stock, and returns `{ok, cart: [{productId, name, qty, price_cents}], error?}`.
  - `create_app(model: ModelClient | None = None, source: CatalogSource | None = None)`.

- [ ] **Step 1: Write the tests** (with `ScriptedModel`).
  - `test_page_agent.py`:
    - `test_build_ok`;
    - `test_unknown_product_retries_with_feedback` (the second call's input contains `unknown_product`);
    - `test_length_stop_is_a_failure`;
    - `test_tool_round_then_page`;
    - `test_system_prompt_is_fixed`.
  - `test_api.py`:
    - `test_first_run_opens_tab_and_streams_messages`;
    - `test_second_run_edits_only_changed_ids`;
    - `test_failed_edit_keeps_the_page`;
    - `test_add_uses_current_price`;
    - `test_add_out_of_stock` (`error.code == "out_of_stock"`);
    - `test_products_reports_missing`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `page.md`, `workspace.py`, `page_agent.py` and the endpoints.
- [ ] **Step 4:** Run the tests. Expected: PASS. Then add `test_live_build_then_edit` (`live`), run it with `HALDEN_LIVE=1`, and note its token counts and seconds under "Notes from building".
- [ ] **Step 5:** Commit `feat(agent): build and edit a page over SSE, add to cart`.

---

### Task 5: Catalog components in the mockup's look and motion

**Files:** Create `web/src/a2ui/catalog.tsx`, `web/src/a2ui/motion.ts`, `web/src/a2ui/probe.ts`, `web/src/lib/products.ts`, `web/src/lib/actions.ts`, `web/src/styles/{tokens,fonts,page}.css`, `web/public/fonts/` (Supreme from `mockup/fonts/`, with its licence); tests `web/src/a2ui/catalog.test.tsx`, `web/src/a2ui/mount.test.tsx`. Modify `web/package.json` (the pinned A2UI packages and zod).

**Interfaces (produced):**
- `shopCatalog`: a `Catalog` with the same `catalogId` as `shop.json`, built with `createComponentImplementation` and zod schemas matching the JSON. A test checks that the field names match `shop.json`, which is imported from the backend package.
- `fetchProducts(ids)` / `useProducts(ids)`: one cache, concurrent requests deduplicated, 60 s lifetime. A missing product renders "No longer available"; a missing spec renders "—".
- `dispatchAction({name, surfaceId, sourceComponentId, context})` posts to `/api/actions`. `AddToCartButton` builds its own `cart.add` action. First check `@a2ui/react`'s source for a way for a component to send an A2UI action itself; if there is none, call `dispatchAction` directly. Note which one under "Notes from building".
- `useMountProbe(id)` / `mountCounts()` / `resetMountProbe()` count mounts per component ID; `?probe` in the URL shows the counts on screen.
- Motion from `DESIGN.md` ("The build", "Follow-up updates", "Charts"): on mount, a 14px rise with a 6px blur burning off, at a 45 ms stagger; changed props glow once (9 % steel, 1.8 s) without remounting; bars fill at a 120 ms stagger; series colours by position (frost, steel, deep); reduced motion clamps everything. The tokens are copied from `mockup/css/base.css` under the same names.

- [ ] **Step 1: Write the tests.**
  - `catalog.test.tsx`:
    - `field names match shop.json`;
    - `shelf shows names and prices from the cache`;
    - `missing product shows "No longer available"`;
    - `add to cart sends cart.add with its own product id`;
    - `spec table shows a dash for a missing spec`.
  - `mount.test.tsx`, with the real `@a2ui/react` renderer and the fixtures from Task 3:
    - `inserting a section remounts nothing else` (after the edit, the probe has `colour` and no entry for `verdict`, `shelf`, `specs` or `charts`).
- [ ] **Step 2:** Run `pnpm --dir web test`. Expected: FAIL.
- [ ] **Step 3:** Implement the components, styles and helpers. If the mount test fails because the renderer remounts, **stop and report to the user.** That would be a reason to reconsider A2UI, not something to work around.
- [ ] **Step 4:** Run `python scripts/check.py web`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): add the shop catalog components with the mockup's look and motion`.

---

### Task 6: App shell and the demo run

**Files:** Modify `web/src/App.tsx`, `web/src/App.test.tsx`, `web/vite.config.ts` (proxy `/api` to `http://127.0.0.1:8000`). Create `web/src/lib/sse.ts`, `web/src/styles/shell.css`. Modify `README.md` (how to run the demo), `CHANGELOG.md`, `ROADMAP.md` (milestone 2 status).

**Interfaces (produced):**
- `createSseParser(): { feed(text: string): AgUiEvent[] }` handles frames split across chunks. `streamRun(command, onEvent)` posts to `/api/runs`.
- `App` contains:
  - the command bar (Enter submits; disabled while a run is open);
  - one tab that appears on `tab_opened`, with its title and a loading ring while a run is open;
  - a state line: "Building comparison…", "Updating this page…", "Built · just now", or the error message;
  - the surface, rendered with `@a2ui/react` from one `MessageProcessor([shopCatalog])`;
  - a toast and a cart count after `cart.add`;
  - the fixed footer disclaimer.

- [ ] **Step 1: Write the tests.** `sse parser handles split frames`; `App shows the tab and page after a run` (mocked `fetch` streaming the Task 3 fixtures as SSE); `App keeps the page when the edit fails` (a `RUN_ERROR` after a build leaves the page).
- [ ] **Step 2:** Run `pnpm --dir web test`. Expected: FAIL.
- [ ] **Step 3:** Implement the app shell.
- [ ] **Step 4:** Run `python scripts/check.py all`. Expected: PASS.
- [ ] **Step 5: Hand the user this by-eye checklist and wait for the answers.** Start the backend (`uv run --directory backend uvicorn halden_agent.app:create_app --factory --reload`) and the web app (`pnpm --dir web dev`), then open `http://localhost:5173/?probe`:
  1. "Compare 3 laptops for video editing under €2,000": a tab opens, and the page builds with the cascade and the bars filling.
  2. "Add colour accuracy for grading": only the new section rises in, the rest stays still, and the probe shows 1 for each old section.
  3. "Only OLED": the changed parts glow once; nothing remounts.
  4. "Add to cart" on the pick: a toast appears and the count goes up, at the catalog's price.
- [ ] **Step 6:** Record the answers under "Notes from building", set milestone 2 to "done" in `ROADMAP.md`, add a `CHANGELOG.md` entry, and commit `feat(web): add the demo shell and command bar`.

---

## Notes from building

(Add one dated line per surprise: SDK behaviour, edit syntax, action dispatch route, token counts, seconds per build and edit, by-eye results.)

- 2026-11-12 — Edit syntax: an edit starts with `surface(update=true)` (the ID can be left out: it defaults to the surface the parser was made for), rewrites `root` and defines only the new section; it compiles to one `updateComponents` holding `root`, `colour` and colour's inline charts, nothing else. Without `update=true` a block that defines `root` compiles to a second `createSurface`, which the SDK rejects ("Surface … already exists"). SDK `inference_formats/express/compiler.py:1612` (the `update` keyword), `:1676-1718` (create vs update); docs `llms-full.txt:5754`. The SDK's own Express prompt rules never mention `update=true`, so the rule lives in `shop.json`'s `instructions`.
- 2026-11-12 — Auto-IDs: a variable's name is its component ID (`compiler.py:156-178`, `:1972`). An inline component gets `<parent>_<prop>` in a single slot (`verdict_button`), `<parent>_<prop>_<n>` in a list (`charts_children_0`), and `_inline_<n>` when it has no parent, e.g. a list held by a variable (`compiler.py:2534-2541`). A section written inline in `Page` is therefore `root_children_<n>`; the `unnamed_section` check also matches `^_inline_\d+$` (ruling R8).
- 2026-11-12 — List-of-object props need no special syntax: `items=[{productId: "aeris-studio-16", tag: "most power"}, ...]` compiles to plain JSON objects (`compiler.py:2428-2486`).
- 2026-11-12 — Decompile round-trips the shop catalog exactly. `ExpressDecompiler.decompile(..., use_keyword_args=True)` writes every component as its own variable, inline children included (`charts_children_0 = BarChart(...)`); `ExpressParser.decompile` has no keyword option, so the adapter calls `ExpressDecompiler` directly (`decompiler.py:492`, `:670`).
- 2026-11-12 — The SDK checks the catalog schema while compiling (`RendererState`): `maxLength`, `minItems`/`maxItems`, unknown props and dangling references fail at compile time, before `validate_page` runs.
- 2026-11-12 — Pyright strict: `a2ui` is a namespace package, and its top-level `py.typed` does not cover `a2ui.parser`, `a2ui.utils` or `a2ui.inference_formats`, so those three imports carry `# pyright: ignore[reportMissingTypeStubs]` (the source is annotated; `a2ui.core` has its own `py.typed`).
- 2026-11-12 — First live build and edit (`test_live_build_then_edit`, one run, `1 passed in 13.02s`). Build: 1 attempt, 2 calls (one tool round), 6.6 s, input 7,949 tokens (3,051 cached), output 409. Edit: 1 attempt, 2 calls, 5.2 s, input 7,443 (6,457 cached: the fixed system prompt hits the Azure cache), output 342. Run it with `HALDEN_LIVE=1 uv run --directory backend pytest packages/agent/tests/test_page_agent.py::test_live_build_then_edit -s -q --no-cov`; `--no-cov` is needed because one test alone falls under the 80 % coverage gate.
- 2026-11-12 — Live model behaviour: it named every section, and the edit was an update (`surface(update=true)`) with only `root` and a new `colour` ChartGrid. It appended `colour` last rather than after `shelf`, and the build's own charts already used `de`, so "add colour accuracy" partly repeats a chart. Section order and chart overlap are prompt-quality questions for later, not compile failures.
- 2026-11-12 — Action dispatch route: `@a2ui/react` has one. A component calls `context.dispatchAction({event: {name, context}})` (`@a2ui/web_core` `resolution/component-context.js:40-52` → `state/surface-model.js:236-274`), which fills in `surfaceId`, `sourceComponentId` and a timestamp and reaches the `MessageProcessor`'s action handler (`processing/message-processor.js:74`). `AddToCartButton` (and the shelf's per-product buttons) send `cart.add{productId}` that way; the app passes `dispatchAction` from `web/src/lib/actions.ts` as the processor's handler, which posts `{name, surfaceId, sourceComponentId, context}` to `/api/actions`.
- 2026-11-12 — Remounts: none. `A2uiSurface` keys every child by its node ID (`@a2ui/react` `chunk-H4D2JAR7.js:580`, `<ChildElement key={child.id}>`), the node ID is the component ID at the root data path (`web_core` `resolution/node-resolver.js:550-556`), a child's edge key holds the slot and component ID but not its position (`node-resolver.js:398-405`), and an `updateComponents` that re-sends `root` with the same type updates its model in place (`processing/message-processor.js:984-997`). Inserting `colour` mid-page mounts only `colour` and its two charts (`mount.test.tsx`).
- 2026-11-12 — Docs vs package: the `@a2ui/react` README is written for v0.9 (`@a2ui/react/v0_9`, `@a2ui/web_core/v0_9`); for our v1.0 messages the working imports are the package root `@a2ui/react` plus `@a2ui/web_core/v1_0` (`Catalog(id, "1.0", …)`, `ComponentIdSchema`, `ChildListSchema`, `MessageProcessor`), as `llms-full.txt` "How to Define a Catalog" shows. `pnpm` warns that `@a2ui/markdown-it@0.2.2` (a dependency of `@a2ui/react@0.15.0`) wants `@a2ui/web_core@^0.14.0`; we don't use Markdown, so it is left as is. Component schemas must leave out `component`/`id`, and a `.default()` in zod is not applied by the binder, so defaults (`variant`, `highlightBest`, …) are applied in code.
- 2026-11-12 — Under the TypeScript 6 config, the CSS side-effect imports need `vite/client` in `tsconfig.json` `types`; the web tests silence Lit's "dev mode" banner (from `@a2ui/web_core`) with its documented opt-out, `globalThis.litIssuedWarnings = new Set(["dev-mode"])`, in `test-setup.ts`.
