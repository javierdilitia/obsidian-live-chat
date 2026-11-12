# Slice 1 — Cartridge boundary and page fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this repo the user prefers executing-plans in one session (lean token use).

**Goal:** Obsidian core holds no Halden specifics: the agent loads its cartridge through an entry point, the web app takes its brand, glossary and renders from a cartridge folder; and the page agent gets the demo's fixes (stricter page checks, a search tool with words and sorting, placement rules for edits).

**Architecture:** A `Cartridge` descriptor (ID, name, a factory for its `CatalogSource`) lives in `obsidian_data_contract`, the one core package every cartridge already depends on. `halden_data_fake` registers Halden's descriptor under the `obsidian.cartridges` entry point; `obsidian_agent` loads the one chosen by `OBSIDIAN_CARTRIDGE` and no longer depends on Halden. On the web, `web/src/cartridge.ts` picks a folder under `web/src/cartridges/` with `import.meta.glob`, chosen by `VITE_OBSIDIAN_CARTRIDGE`. Guard tests on both sides keep core free of cartridge names.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, `importlib.metadata` entry points, uv workspace, pytest; React 19.2, TypeScript, Vite (`import.meta.glob`), zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-11-product-spec-design.md`](../specs/2026-11-11-product-spec-design.md) (§1, §3.3, §7.1) and the slice definition in [`2026-11-12-milestone-3-slices.md`](2026-11-12-milestone-3-slices.md) (Slice 1, Open questions 2, 3, 5, 6, 8).

## Global Constraints

- Branch `feat/cartridge-boundary` from `main`; one PR to `main`; Conventional Commits; ask the user before pushing.
- **Core** = `backend/packages/data_contract`, `backend/packages/agent`, and `web/src/` outside `web/src/cartridges/`. Core code (not tests) never imports a cartridge module, never names a Halden product, category, spec key, store name or disclaimer.
- Tests may use Halden: it is the dev cartridge, installed by `uv sync --all-packages --directory backend`.
- Entry point group: `obsidian.cartridges`. Backend setting: `OBSIDIAN_CARTRIDGE`. Web build variable: `VITE_OBSIDIAN_CARTRIDGE`. A cartridge's ID equals its web folder name.
- No live model calls: `OBSIDIAN_LIVE` tests stay skipped; tests use `ScriptedModel`. A live run only with the user's go-ahead.
- No screenshots or headless-browser tests; UI is verified by reading code and by the user's eye.
- A2UI packages stay at their pinned versions; `a2ui_adapter.py` stays the only module that imports the SDK.
- pyright strict and ruff clean; Prettier and ESLint clean. Run `python scripts/check.py backend web` once, in the last task; per task, run only the named tests.
- Money stays integer cents; the model never writes a price (unchanged rules).

## Review Focus

1. Two cartridges installed and `OBSIDIAN_CARTRIDGE` unset: start-up must fail naming both, never pick one silently. (Task 2 test.)
2. One installed cartridge that fails to import must not stop another, explicitly chosen cartridge from loading; choosing the broken one fails with its name. (Task 2 test.)
3. A spec key that some products in a chart or table have and others lack must pass (it renders "—"); only a key none of them has, or a text value in a chart, is rejected. (Task 5 tests.)
4. A spec whose value is a number-looking string (`"1.74 kg"`) is not chartable, and the feedback lists the keys that are. (Task 5 test.)
5. A spec key missing from the cartridge glossary shows a readable label; a cartridge without product renders shows an empty plate, not a crash. (Tasks 6 and 7 tests.)

---

### Task 1: The `Cartridge` descriptor and Halden's entry point

**Files:**
- Create: `backend/packages/data_contract/src/obsidian_data_contract/cartridge.py`
- Modify: `backend/packages/data_contract/src/obsidian_data_contract/__init__.py` (export `Cartridge`)
- Create: `backend/packages/data_fake/src/halden_data_fake/cartridge.py`
- Modify: `backend/packages/data_fake/pyproject.toml` (entry point)
- Test: `backend/packages/data_fake/tests/test_cartridge.py`

**Interfaces:**
- Produces: `obsidian_data_contract.Cartridge`, a frozen dataclass:
  ```python
  @dataclass(frozen=True)
  class Cartridge:
      id: str                                   # slug, equals the web folder name: "halden"
      name: str                                 # display name: "Halden"
      make_source: Callable[[], CatalogSource]  # called once per app
  ```
  Docstring: a cartridge is one client's data and presentation config; this descriptor is what core needs from the backend side; later slices add fields (diagram set in slice 4, pairing rule and offer in slice 8).
- Produces: `halden_data_fake.cartridge.CARTRIDGE = Cartridge(id="halden", name="Halden", make_source=FakeCatalogSource)`.
- Produces: in `data_fake/pyproject.toml`:
  ```toml
  [project.entry-points."obsidian.cartridges"]
  halden = "halden_data_fake.cartridge:CARTRIDGE"
  ```

- [ ] **Step 1: Write the failing test** `test_halden_is_registered_as_a_cartridge`:
  ```python
  from importlib.metadata import entry_points
  (point,) = [p for p in entry_points(group="obsidian.cartridges") if p.name == "halden"]
  cartridge = point.load()
  assert cartridge is CARTRIDGE
  assert (cartridge.id, cartridge.name) == ("halden", "Halden")
  assert isinstance(cartridge.make_source(), CatalogSource)
  ```
- [ ] **Step 2: Run it to see it fail.** `uv run --directory backend pytest packages/data_fake/tests/test_cartridge.py -q` → FAIL (import error: no `cartridge` module).
- [ ] **Step 3: Implement** `Cartridge`, its export, `CARTRIDGE` and the entry point. Then `uv sync --all-packages --directory backend` (entry points are package metadata; without the sync the test still fails).
- [ ] **Step 4: Run the test** → PASS.
- [ ] **Step 5: Commit** `feat(contract): add the Cartridge descriptor and register Halden as one`.

### Task 2: The agent loads its cartridge and drops its Halden dependency

**Files:**
- Create: `backend/packages/agent/src/obsidian_agent/cartridges.py`
- Modify: `backend/packages/agent/src/obsidian_agent/app.py` (`create_app` signature, `/health`)
- Modify: `backend/packages/agent/pyproject.toml` (remove `halden-data-fake` from `dependencies` and `[tool.uv.sources]`), `backend/uv.lock` (`uv lock --directory backend`)
- Modify: `backend/packages/agent/tests/test_api.py`, `tests/test_health.py` (pass a cartridge)
- Modify: `.env.example` (add `OBSIDIAN_CARTRIDGE=` with the comment "Which cartridge to serve; optional while only one is installed."), `README.md` "Run the demo" (one sentence on `OBSIDIAN_CARTRIDGE`)
- Test: `backend/packages/agent/tests/test_cartridges.py`

**Interfaces:**
- Consumes: `Cartridge` (Task 1).
- Produces, in `obsidian_agent/cartridges.py`:
  ```python
  ENTRY_POINT_GROUP = "obsidian.cartridges"
  CARTRIDGE_SETTING = "OBSIDIAN_CARTRIDGE"
  class CartridgeError(Exception): ...          # message names the wanted and installed IDs
  def installed_cartridges() -> dict[str, EntryPoint]: ...   # by entry-point name; nothing loaded
  def load_cartridge(wanted: str | None, installed: Mapping[str, EntryPoint] | None = None) -> Cartridge: ...
  def cartridge_setting(env_file: Path) -> str | None: ...   # like Settings: real env wins over .env; blank → None
  ```
  `load_cartridge` rules: `wanted` given → load only that entry point; unknown → `CartridgeError("Unknown cartridge 'x'. Installed: a, b.")`; import fails → `CartridgeError("Cartridge 'x' failed to load: <error>")`; loaded object not a `Cartridge` → `CartridgeError`. `wanted` None → exactly one installed loads; none → `CartridgeError("No cartridge is installed.")`; several → `CartridgeError("Several cartridges are installed (a, b). Set OBSIDIAN_CARTRIDGE to one of them.")`. Installed IDs are listed sorted.
- Produces: `create_app(model: ModelClient | None = None, cartridge: Cartridge | None = None) -> FastAPI`. Without a cartridge it calls `load_cartridge(cartridge_setting(ENV_FILE))` at once, so a bad choice fails at start. The source is `cartridge.make_source()`; the cartridge is kept on `app.state.cartridge`. `GET /health` returns `{"status": "ok", "cartridge": cartridge.id}`. The `source` parameter is gone.

- [ ] **Step 1: Write the failing tests** in `test_cartridges.py`. Build fake entry points with `EntryPoint(name, value, group=ENTRY_POINT_GROUP)`, where a working one has value `"halden_data_fake.cartridge:CARTRIDGE"` and a broken one `"no_such_module_xyz:CARTRIDGE"`:
  - `test_the_only_installed_cartridge_loads_without_a_setting`: `load_cartridge(None, {"halden": ok}).id == "halden"`.
  - `test_several_installed_need_a_setting`: `load_cartridge(None, {"halden": ok, "other": ok})` raises `CartridgeError` whose message contains `"halden, other"` and `"OBSIDIAN_CARTRIDGE"`.
  - `test_unknown_cartridge_lists_the_installed_ones`: `load_cartridge("haier", {"halden": ok})` raises, message contains `"haier"` and `"halden"`.
  - `test_a_broken_cartridge_does_not_block_the_chosen_one`: `load_cartridge("halden", {"halden": ok, "broken": bad}).id == "halden"`; `load_cartridge("broken", …)` raises with `"broken"` in the message.
  - `test_no_cartridge_installed`: `load_cartridge(None, {})` raises.
  - `test_setting_reads_env_over_file` (with `tmp_path` `.env` holding `OBSIDIAN_CARTRIDGE=a` and `monkeypatch.setenv(CARTRIDGE_SETTING, "b")` → `"b"`; blank env and no file → `None`).
  - `test_core_imports_no_cartridge`: parse every `.py` under the `obsidian_agent` and `obsidian_data_contract` source folders with `ast`; collect top-level names of `import`/`from` statements; assert none is in `{point.module.split(".")[0] for point in installed_cartridges().values()}`, and that this set is not empty (the guard is not vacuous).
  - `test_agent_does_not_depend_on_a_cartridge`: read `backend/packages/agent/pyproject.toml` with `tomllib`; assert no dependency name equals the distribution name of any installed cartridge entry point (`point.dist.name`).
  - In `test_health.py`: `create_app(cartridge=Cartridge("test", "Test", FakeCatalogSource))` → `/health` returns `{"status": "ok", "cartridge": "test"}`.
- [ ] **Step 2: Run them** `uv run --directory backend pytest packages/agent/tests/test_cartridges.py packages/agent/tests/test_health.py -q` → FAIL (no module `obsidian_agent.cartridges`).
- [ ] **Step 3: Implement** `cartridges.py`, the `create_app` change and `/health`. In `test_api.py`, change the `_app` helper and every `create_app(..., source=...)` call to `cartridge=Cartridge("halden", "Halden", lambda: source)` (one helper, `_cartridge(source)`). Remove the dependency from the agent's `pyproject.toml`, run `uv lock --directory backend` and `uv sync --all-packages --directory backend`. Add the `.env.example` line and the README sentence.
- [ ] **Step 4: Run the agent's tests** `uv run --directory backend pytest packages/agent -q` → PASS.
- [ ] **Step 5: Commit** `feat(agent): load the cartridge through an entry point, not an import`.

### Task 3: The search tool takes words and a sort, and lists the cartridge's categories

**Files:**
- Modify: `backend/packages/agent/src/obsidian_agent/page_agent.py` (`TOOLS` becomes `page_tools(...)`; `build_page` gains `tools`)
- Modify: `backend/packages/agent/src/obsidian_agent/app.py` (tools made once per app)
- Test: `backend/packages/agent/tests/test_page_agent.py`

**Interfaces:**
- Consumes: `Category` from the contract; `app.state.cartridge` (Task 2).
- Produces: `page_tools(categories: list[Category]) -> list[dict[str, Any]]` (same two tools, same shapes) and `build_page(model, source, *, tools: list[dict[str, Any]], surface_id: str, command: str, current: Snapshot | None) -> BuildResult`.
- The app builds the tools on its first run from `await catalog.list_categories()` and reuses them for every later run, so the system prompt and tools stay fixed for prompt caching.
- Exact text in `search_products` (no product or category names in any static text):
  - tool description: `f"Search the catalog. Every filter is optional. Returns up to {SEARCH_LIMIT} products in the order sort asks for, each with its price, stock and specs."`
  - `text`: `"Words to look for. Every word must appear in the product's name, its category, or one of its spec values. More words narrow the search."`
  - `category`: `"A category ID: " + ", ".join(c.id for c in categories) + "."`
  - new `sort`: `{"type": "string", "enum": ["rating", "price_asc", "price_desc"], "description": "rating: best rated first (the default). price_asc: cheapest first. price_desc: most expensive first."}`
  - `attributes`: `"Spec key to a word its value must contain."` (the example with a Halden key goes).

- [ ] **Step 1: Write the failing tests:**
  - `test_search_tool_offers_sort_and_the_cartridge_categories`: `tools = page_tools(await FakeCatalogSource().list_categories())`; the `search_products` parameters have `sort.enum == ["rating", "price_asc", "price_desc"]`; the `category` description contains every category ID.
  - `test_search_with_words_and_price_sort`: a `ScriptedModel` whose first reply calls `search_products` with `{"text": "oled laptop", "sort": "price_asc"}`, then the build fixture; the tool output sent back (the `function_call_output` item) holds at least two products and their `price_cents` never decrease.
  - `test_search_rejects_an_unknown_sort`: the call `{"sort": "newest"}` gets an output whose `error` starts with `"Invalid arguments: sort"`.
  - Update every existing `build_page(...)` call in the tests to pass `tools=page_tools(CATEGORIES)` (a module-level list built once from the fake).
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_page_agent.py -q` → FAIL (`page_tools` not defined).
- [ ] **Step 3: Implement** `page_tools`, the `tools` parameter and the app's once-per-app tools.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q` → PASS.
- [ ] **Step 5: Commit** `feat(agent): search with several words and a sort; categories from the cartridge`.

### Task 4: The page prompt names no cartridge data and says where new sections go

**Files:**
- Modify: `backend/packages/agent/src/obsidian_agent/prompts/page.md`
- Modify: `backend/packages/agent/src/obsidian_agent/catalog/shop.json` (two descriptions)
- Test: `backend/packages/agent/tests/test_prompt.py` (new)

**Interfaces:**
- Consumes: `PAGE_PROMPT`, `SYSTEM_PROMPT` and `page_tools` from `page_agent.py`; `shop_catalog_json` from `a2ui_adapter.py`.
- Text changes:
  - `shop.json`: the `ProductShelf.items` description ends `"…for example [{productId: \"<a product ID>\", tag: \"most power\"}, ...]."`; `BarChart.specKey` becomes `"A numeric spec key: one of the products' chartable keys."`
  - `page.md`, "Reply format": the example becomes `BarChart(title="Battery life — hours", productIds=[...], specKey="<a chartable key>")`.
  - `page.md`, "Build a page": section-name examples are only `verdict`, `shelf`, `specs`, `charts` plus "or a short name for the section's topic".
  - `page.md`, "Change a page": add these bullets, verbatim:
    - `Put a new section where it fits in reading order, right after the section it extends (a chart about one spec goes after the table that lists that spec). Never put it last by default.`
    - `Before adding a section, check whether the page already shows it: a chart in an existing ChartGrid may already cover the spec. If it does, change that section instead of adding a second one.`

- [ ] **Step 1: Write the failing tests** in `test_prompt.py`:
  - `test_prompt_names_no_cartridge_data`: from `FakeCatalogSource`, every product's `id` and `name`, and every category `id`. The texts checked are the ones we own: `PAGE_PROMPT`, `json.dumps(shop_catalog_json())` and `json.dumps(page_tools([]))` (not the SDK's generated Express rules). Assert that no product ID or name occurs in them, and that no category ID and none of the keys `["batt", "hz", "p3", "de", "refresh_rate", "noise_cancelling", "power_pass_through"]` occurs as a whole word (`re.search(rf"\b{re.escape(word)}\b", text)`).
  - `test_prompt_states_where_new_sections_go`: `SYSTEM_PROMPT` contains `"where it fits in reading order"`, `"Never put it last by default"` and `"change that section instead of adding a second one"`.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_prompt.py -q` → FAIL on `batt`, `aeris-studio-16` and the missing placement text.
- [ ] **Step 3: Edit** `page.md` and `shop.json` as above.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q` → PASS (the compiled web fixtures do not depend on descriptions, so they need no regeneration; if `test_repo_config` compares them, it still passes).
- [ ] **Step 5: Commit** `feat(agent): keep cartridge data out of the page prompt; place new sections where they fit`.

### Task 5: The validator checks placement, spec keys and repeated products

**Files:**
- Modify: `backend/packages/agent/src/obsidian_agent/a2ui_adapter.py` (add `child_ids`)
- Modify: `backend/packages/agent/src/obsidian_agent/validate.py`
- Modify: `backend/packages/agent/src/obsidian_agent/page_agent.py` (`_known_products` → `_page_products`)
- Test: `backend/packages/agent/tests/test_validate.py`, `tests/test_adapter.py`

**Interfaces:**
- Produces in `a2ui_adapter.py`: `child_ids(component: dict[str, Any]) -> list[str]`, the IDs a component references as children, from the catalog's `component_ref_map` (the same call `_reachable` uses; `_reachable` switches to it).
- Produces in `validate.py`:
  - `validate_page(snapshot: Snapshot, *, products: Mapping[str, Product]) -> list[Issue]`: `products` holds the page's products that exist, by ID (it replaces `known_products: set[str]`).
  - `IssueCode` gains `"misplaced"`, `"spec_not_numeric"`, `"spec_unknown"`, `"duplicate_product"`.
  - `PLACEMENT: dict[str, frozenset[str]]`, the allowed parent component types: `Verdict`, `ProductShelf`, `SpecTable`, `ChartGrid` → `{"Page"}`; `BarChart` → `{"ChartGrid"}`; `AddToCartButton` → `{"Verdict", "Page"}`. A type not in the map has no placement rule. Slice 4 extends the map.
  - `numeric_spec_keys(products: Iterable[Product]) -> set[str]`: keys that at least one product has with an `int` or `float` value (not `bool`) and no product has with any other value.
- Rules (unknown product IDs are skipped here; `unknown_product` already reports them):
  - `misplaced`: a component whose parent's type is not in its `PLACEMENT` entry. Message: `"{id} is a {type} inside {parent_type}; a {type} goes only in {allowed}."`
  - `spec_not_numeric`: a `BarChart.specKey` not in `numeric_spec_keys(its products)`. Message names the key and ends `"Numeric keys for these products: {sorted keys joined by ', '}."`
  - `spec_unknown`: a `SpecTable.specKeys` entry that none of the table's products has. Message ends `"Keys these products have: {sorted keys}."`
  - `duplicate_product`: a product ID that appears twice in one component's `productIds`, or twice among `ProductShelf.items[].productId`. `pickId` repeating an item is not a duplicate.
- `page_agent._page_products(source, snapshot) -> dict[str, Product]` replaces `_known_products`, using `lookup_products`.

- [ ] **Step 1: Write the failing tests.** In `test_validate.py`, replace `KNOWN` with a module-level `PRODUCTS: dict[str, Product]` loaded once from `FakeCatalogSource` for the fixture's products plus `nova-air-13`, and update existing calls to `products=PRODUCTS`. New tests, each editing the built fixture page:
  - `test_section_inside_a_chart_grid_is_misplaced`: add `"specs"` to `charts.children` and drop it from `root.children` → `("misplaced", "specs")` in the codes.
  - `test_bar_chart_directly_under_page_is_misplaced`: move one chart ID from `charts.children` to `root.children` → `("misplaced", <that id>)`.
  - `test_chart_key_must_be_numeric`: set a chart's `specKey` to `"cpu"` → `("spec_not_numeric", <id>)`, and the message contains `"batt"`.
  - `test_number_looking_text_is_not_chartable`: `specKey = "weight"` (its value is the text `"1.74 kg"`) → `spec_not_numeric`.
  - `test_chart_key_missing_on_some_products_passes`: a chart on `p3` over three products where one has no `p3` and the others have it as a number gives no issue. Build the product without `p3` with `product.model_copy(update={"specs": {k: v for k, v in product.specs.items() if k != "p3"}})` and put it in `products` under its own ID.
  - `test_table_key_no_product_has_is_unknown`: append `"warp_drive"` to `specs.specKeys` → `("spec_unknown", "specs")`.
  - `test_repeated_product_in_one_component`: append a repeat to `specs.productIds` → `("duplicate_product", "specs")`; a shelf with two items naming the same product → `("duplicate_product", "shelf")`; the untouched fixture (whose `pickId` repeats an item) passes.
  - In `test_adapter.py`: `test_child_ids` — on the build fixture, `child_ids(root)` equals `["verdict", "shelf", "specs", "charts"]` and `child_ids(verdict)` holds the button's ID.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_validate.py packages/agent/tests/test_adapter.py -q` → FAIL.
- [ ] **Step 3: Implement** `child_ids`, the new rules, `numeric_spec_keys` and `_page_products`. Parent types come from one pass: for each component, for each ID in `child_ids`, record the component's type as that child's parent type. Make `_compact`'s `chartable` use the same numeric test (one helper, `_is_number(value)`).
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q` → PASS (the page-agent retry tests still pass: feedback goes through `issues_for_model`).
- [ ] **Step 5: Commit** `feat(agent): reject misplaced sections, unusable spec keys and repeated products`.

### Task 6: The web cartridge: store name, disclaimer and spec glossary

**Files:**
- Create: `web/src/cartridge.ts`, `web/src/cartridge.test.ts`
- Create: `web/src/cartridges/halden/index.ts`, `web/src/cartridges/halden/specs.en.json`
- Create or modify: `web/src/vite-env.d.ts` (declare `VITE_OBSIDIAN_CARTRIDGE?: string` on `ImportMetaEnv`, with the `vite/client` reference)
- Modify: `web/src/a2ui/catalog.tsx` (remove `SPECS`, `SpecInfo`, `specInfo`, `FOOTER`; read them from the cartridge)
- Modify: `web/src/App.tsx` (wordmark and shell disclaimer from the cartridge)
- Modify: `web/index.html` (`<title>Obsidian</title>`), `web/src/main.tsx` (`document.title = cartridge.storeName`)

**Interfaces:**
- Produces in `web/src/cartridge.ts`:
  ```ts
  export interface SpecInfo { label: string; better?: "higher" | "lower" }
  export interface ProductRenderer { install(): void; markup(look: Look): string }
  export interface CartridgeUI {
    id: string;                                  // equals its folder name
    storeName: string;                           // wordmark and document title
    disclaimer: { shell: string; footer: readonly string[] };
    specs: Readonly<Record<string, SpecInfo>>;   // the spec glossary
    renderer?: ProductRenderer;                  // Task 7
  }
  export function pickCartridge(
    modules: Record<string, { cartridge: CartridgeUI }>,  // keys like "./cartridges/halden/index.ts"
    wanted: string | undefined,
  ): CartridgeUI;
  export const cartridge: CartridgeUI;  // pickCartridge(import.meta.glob("./cartridges/*/index.ts", { eager: true }), import.meta.env.VITE_OBSIDIAN_CARTRIDGE)
  export function specInfo(key: string): SpecInfo;  // glossary entry, else { label: "Warp drive" } for "warp_drive"
  ```
  `pickCartridge` throws the same cases as the backend, with messages naming the installed IDs: none installed; several and none wanted; unknown wanted; a folder whose name differs from its `cartridge.id`.
- `Look` moves to `web/src/lib/products.ts` as `export type Look = Product["look"]` (it mirrors the contract's `RenderLook`, which is core).
- `specs.en.json` holds today's `SPECS` table from `catalog.tsx`, verbatim, as `{ "<key>": { "label": "...", "better": "higher" } }`. `halden/index.ts` parses it with a zod schema (`z.record(z.object({ label: z.string(), better: z.enum(["higher", "lower"]).optional() }))`) and exports `cartridge` with `id: "halden"`, `storeName: "Halden"`, `disclaimer.shell: "Concept demo · every product, price, rating and order is fictional"`, `disclaimer.footer: ["concept demo", "fictional products, prices & ratings"]`.

- [ ] **Step 1: Write the failing tests** in `cartridge.test.ts` (fake modules built in the test):
  - `pickCartridge` with one module and `wanted` undefined returns it.
  - Two modules, `wanted` undefined: throws, message contains both IDs and `VITE_OBSIDIAN_CARTRIDGE`.
  - `wanted: "haier"` with only `halden`: throws, message contains `"haier"` and `"halden"`.
  - Folder `./cartridges/halden/index.ts` exporting `id: "other"`: throws.
  - `specInfo("hz")` is `{ label: "Refresh rate", better: "higher" }`; `specInfo("warp_drive")` is `{ label: "Warp drive" }`.
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/cartridge.test.ts` → FAIL (no module).
- [ ] **Step 3: Implement** the module, the Halden folder, and switch `catalog.tsx`, `App.tsx`, `main.tsx` and `index.html` over. `App.test.tsx`'s disclaimer assertion keeps passing because the text is unchanged.
- [ ] **Step 4: Run** `pnpm --dir web test` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): take the store name, disclaimer and spec glossary from the cartridge`.

### Task 7: Product renders move into the Halden cartridge; the web boundary guard

**Files:**
- Move: `web/src/a2ui/renders.ts` → `web/src/cartridges/halden/renders.ts` (`git mv`; it imports `Look` from `../../lib/products`)
- Modify: `web/src/cartridges/halden/index.ts` (`renderer: { install: installMaterials, markup: renderMarkup }`)
- Modify: `web/src/a2ui/catalog.tsx` (`ProductRender` uses `cartridge.renderer`)
- Modify: `web/src/App.test.tsx` (the `vi.mock` path becomes `"./cartridges/halden/renders"`)
- Create: `web/src/boundary.test.ts`

**Interfaces:**
- Consumes: `cartridge`, `ProductRenderer` (Task 6).
- `ProductRender({ look })`: with a renderer, `useLayoutEffect(renderer.install, [])` and the markup as today; without one, the same `render` element, empty. The "could not be drawn" handling stays as it is.

- [ ] **Step 1: Write the failing tests:**
  - In `catalog.test.tsx`, `ProductRender without a renderer shows an empty plate`: mock `../cartridge` so `cartridge.renderer` is undefined; render `ProductRender` with any look; the `.render` element exists and has no children.
  - `boundary.test.ts`: load every core source as text with `import.meta.glob(["./**/*.{ts,tsx}", "!./cartridges/**", "!./**/*.test.{ts,tsx}", "!./a2ui/test-helpers.tsx"], { query: "?raw", import: "default", eager: true })`, plus `../index.html?raw`. Assert: no source has an import from a path containing `cartridges/` (regex `/from\s+["'][^"']*cartridges\//`), and no source or `index.html` contains the cartridge's `storeName` or any of its disclaimer strings. Also assert at least ten core files were read (the glob is not empty).
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/boundary.test.ts src/a2ui/catalog.test.tsx` → FAIL (`a2ui/catalog.tsx` imports `./renders`).
- [ ] **Step 3: Move the file and switch** `ProductRender`, the cartridge's `renderer` and the test mock.
- [ ] **Step 4: Run** `pnpm --dir web test` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `refactor(web): move the product renders into the Halden cartridge`.

### Task 8: Docs, then every check once

**Files:**
- Modify: `docs/ARCHITECTURE.md`: replace "Known cartridge seams (extract in milestone 3)" with "How a cartridge plugs in" (the backend entry point and `Cartridge`, the web folder and `CartridgeUI`, the two settings, the guard tests), and "Known seams left" listing `RenderLook` and `currency: Literal["EUR"]` in the contract (milestone H, intake question G) and the English-only fixed strings (slice 3). Update the package table (`halden_data_fake` registers the `halden` cartridge).
- Modify: `CHANGELOG.md` (Unreleased: Added the cartridge loading on both sides and the guard tests; Changed the search tool, the validator rules, the page prompt's placement rules; the agent no longer depends on `halden-data-fake`).
- Modify: `ROADMAP.md` (milestone 3: slice 1 done) and the slices doc (slice 1 status).

- [ ] **Step 1: Edit the three documents.**
- [ ] **Step 2: Run every check once:** `python scripts/check.py backend web` → exits 0.
- [ ] **Step 3: Commit** `docs: record how a cartridge plugs in`.
- [ ] **Step 4: Hand the user the by-eye checklist** (no live model call without asking): start `python scripts/dev.py`; the browser tab reads "Halden", the wordmark and the disclaimer are as before, product renders draw in the shelf and the cart drawer, spec labels and the "best" marks in the table are unchanged. With their go-ahead for a live run: build the comparison, then "Add colour accuracy for grading", and check the new section lands after the spec table, not last.
