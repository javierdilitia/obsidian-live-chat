# Repo Foundation Implementation Plan

**Status:** done (milestone 0). Kept as history; the current state lives in `ROADMAP.md` and `docs/ARCHITECTURE.md`. Package names are from before the `halden_*` → `obsidian_*` rename.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mockup repo into the product repo: new layout, a Python data contract with a fake implementation, web and agent skeletons, quality tooling, git hooks, CI and the repo documents.

**Architecture:** Mockup moves to `mockup/` unchanged. `backend/` is a uv workspace with three packages (`halden_data_contract`, `halden_data_fake`, `halden_agent`). `web/` is a Vite + React 19.2 + TS placeholder. One stdlib-only script, `scripts/check.py`, is the single definition of every check; git hooks and CI both call it, so local and CI can't drift.

**Tech Stack:** Python 3.12, uv, Pydantic v2, FastAPI, pytest (+pytest-asyncio, pytest-cov), ruff, pyright · Node 22, pnpm, Vite, React 19.2, TypeScript, ESLint (flat) + typescript-eslint, Prettier, Vitest + Testing Library · pre-commit, gitleaks, conventional-pre-commit · GitHub Actions, Dependabot.

**Spec:** `docs/superpowers/specs/2026-11-11-repo-foundation-design.md`

## Global Constraints

- Work on branch `chore/repo-foundation`. Every commit message follows Conventional Commits with types `feat fix docs chore refactor test ci build perf` and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Python 3.12; Node 22 in `.nvmrc` and CI (local Node 24 is fine); pnpm 10.
- Lockfiles committed: `backend/uv.lock`, `web/pnpm-lock.yaml`. CI installs with `--locked` / `--frozen-lockfile`.
- Money is `int` cents + `currency: "EUR"`, never floats. IDs are stable slugs. Contract is read-only.
- Pydantic models: `ConfigDict(frozen=True, extra="forbid")`.
- Pyright is strict for package code; test files may start with `# pyright: basic`.
- No Playwright, Chromium, headless browser or screenshot tooling anywhere (user rule).
- No A2UI packages, no model calls, no Azure deployment in this plan.
- GitHub Actions pinned to full commit SHA with a `# vX.Y.Z` comment (look the SHA up with `gh api repos/<owner>/<action>/git/ref/tags/<tag>`).
- Windows dev machine: anything a hook runs must work in Git Bash and PowerShell; `.cmd` shims (pnpm) are resolved with `shutil.which`, never assumed.

**Spec deviations (decided while planning, reflected in Task 8's spec update):**
1. Ruff config lives in a root `ruff.toml` (not `backend/pyproject.toml`) so `scripts/check.py` is linted by the same rules.
2. A root `scripts/` folder holds `check.py`; spec §3 and §10.7 get `scripts/` added.
3. `llms-full.txt` comes from `https://a2ui.org/llms-full.txt` (the site, not the repo); its fetch date and URL are recorded instead of a commit.

## Review Focus

1. **Hooks on Windows:** a hook that shells out to `pnpm` must find `pnpm.cmd`. Pinned by Task 6 `test_resolves_executables_via_which` and the manual hook run in Task 6.
2. **Search inputs at the edges:** unknown category, mixed-case/whitespace text, `limit` 0 or 51. Expected: empty list, case-insensitive trimmed match, validation error. Pinned in Task 2 (`ProductQuery`) and Task 3 (contract suite).
3. **`get_products` with duplicates, empty list, or some unknown ids:** expected: duplicates kept in input order, `[]` for `[]`, `NotFoundError` listing exactly the missing ids. Pinned in Task 3.
4. **Money invariants:** float price, negative price, `was_price_cents <= price_cents` must be rejected. Pinned in Task 2.
5. **Seed integrity:** every order line points to a real product, totals equal line sums, category counts match products. Pinned in Task 3 `test_seed_integrity`.

---

### Task 1: Layout, line endings, moves

**Files:**
- Create: `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`
- Modify: `.gitignore`
- Move (`git mv`): `index.html css js fonts` → `mockup/`; `FRAMEWORKS-STUDY.md OPENUI-STUDY.md A2UI-DECISION.md` → `docs/research/`; `research/copilotkit-research.md` → `docs/research/` (then the empty `research/` disappears)

- [ ] **Step 1: Write the config files**
  - `.gitattributes`: `* text=auto eol=lf`; `*.woff2 *.png *.jpg *.zip *.ico binary`.
  - `.editorconfig`: root=true; `[*]` utf-8, lf, final newline, trim trailing whitespace, indent 2 spaces; `[*.py]` indent 4; `[*.md]` trim_trailing_whitespace=false.
  - `.nvmrc`: `22`.
  - `.env.example`: `AZURE_FOUNDRY_ENDPOINT=`, `AZURE_FOUNDRY_API_KEY=`, `MODEL_ROUTER_DEPLOYMENT=`, `MODEL_UI_DEPLOYMENT=` (one per line, empty values, a comment line saying "copy to .env; never commit .env").
  - `.gitignore`: add `.env`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.coverage`, `htmlcov/`, `node_modules/`, `web/dist/`, `dist/`. Keep existing entries.

- [ ] **Step 2: Move files**

```bash
mkdir -p mockup docs/research
git mv index.html css js fonts mockup/
git mv FRAMEWORKS-STUDY.md OPENUI-STUDY.md A2UI-DECISION.md docs/research/
git mv research/copilotkit-research.md docs/research/
```

- [ ] **Step 3: Renormalize line endings**

Run: `git add .gitattributes && git add --renormalize . && git status --short`
Expected: only the new files and renames; no file content changes other than line endings.

- [ ] **Step 4: Verify**

Run: `git diff --cached -M --stat | tail -3` → every moved file shows as a rename with no `+/-` content lines (100% similarity).
Run: `git ls-files --eol mockup docs | grep -v "i/lf" | grep -v "i/-text"` → empty output.
Run: `grep -rn "\.\./" mockup/index.html | head` → no references escape `mockup/` (paths are `css/…`, `js/…`).
Tell the user: open `mockup/index.html` by double-click and check it looks and behaves as before (no screenshots).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: move mockup and research docs, add repo config files"
```

---

### Task 2: Backend workspace and data contract models

**Files:**
- Create: `ruff.toml` (repo root)
- Create: `backend/pyproject.toml` (virtual workspace root)
- Create: `backend/packages/data_contract/pyproject.toml`
- Create: `backend/packages/data_contract/src/halden_data_contract/__init__.py`, `models.py`, `source.py`, `errors.py`, `py.typed`
- Test: `backend/packages/data_contract/tests/test_models.py`

**Interfaces:**
- Produces (all exported from `halden_data_contract`):
  - Literals: `Glyph = Literal["laptop","monitor","buds","keys","ssd","dock"]`, `Finish = Literal["silver","graphite","midnight","starlight","sage","white"]`, `Screen = Literal["dusk","sea","night","dawn"]`, `OrderStatus = Literal["confirmed","packed","shipped","out_for_delivery","delivered","cancelled"]`, `StepState = Literal["done","current","pending"]`.
  - `RenderLook(glyph: Glyph, finish: Finish, screen: Screen | None = None)`
  - `SpecValue(value: str | int | float, unit: str | None = None, display: str)`
  - `Category(id: str, name: str, product_count: int ≥ 0)`
  - `ProductSummary(id, name, category_id: str, price_cents: StrictInt > 0, was_price_cents: StrictInt | None = None, currency: Literal["EUR"] = "EUR", rating: float | None (0–5) = None, review_count: int ≥ 0 = 0, stock: int ≥ 0, look: RenderLook)`; validator: `was_price_cents`, if set, must be `> price_cents`.
  - `Product(ProductSummary)` + `specs: dict[str, SpecValue]`; method `summary() -> ProductSummary`.
  - `ProductQuery(text: str | None = None, category: str | None = None, max_price_cents: StrictInt ≥ 0 | None = None, attributes: dict[str, str] = {}, limit: int = 20, 1 ≤ limit ≤ 50)`; `text` is stripped, and `""` after strip becomes `None`.
  - `OrderLine(product_id, name, qty: int ≥ 1, unit_price_cents: StrictInt > 0)`
  - `OrderSummary(id, user_id, placed_on: date, status: OrderStatus, total_cents: StrictInt ≥ 0, item_count: int ≥ 1, eta: date | None = None)`
  - `Order(OrderSummary)` + `lines: list[OrderLine]` (min 1); validator: `total_cents == sum(qty*unit_price_cents)` and `item_count == sum(qty)`.
  - `TrackingStep(name: str, at: date | None, state: StepState)`
  - `OrderTracking(order_id, steps: list[TrackingStep] (min 1), carrier: str | None, tracking_number: str | None, eta: date | None)`
  - `NotFoundError(Exception)`: `__init__(self, kind: Literal["product","order","category"], ids: list[str])`, attributes `.kind`, `.ids`; message `"<kind> not found: <id>, <id>"`.
  - `CatalogSource(Protocol)` (`@runtime_checkable`), all `async`:
    `list_categories() -> list[Category]`, `search_products(query: ProductQuery) -> list[ProductSummary]`, `get_product(product_id: str) -> Product`, `get_products(product_ids: list[str]) -> list[Product]`, `get_orders(user_id: str) -> list[OrderSummary]`, `get_order(order_id: str) -> Order`, `get_order_status(order_id: str) -> OrderTracking`. Docstrings state the behaviour rules from Task 3 Step 1.

- [ ] **Step 1: Workspace config**
  - `ruff.toml`: `target-version = "py312"`, `line-length = 100`, `[lint] select = ["E","F","I","B","UP","S","SIM","RUF"]`, `[lint.per-file-ignores] "**/tests/**" = ["S101"]`, `"scripts/check.py" = ["S603"]`.
  - `backend/pyproject.toml`: no `[project]`; `[tool.uv.workspace] members = ["packages/*"]`; `[dependency-groups] dev = ["pytest", "pytest-asyncio", "pytest-cov", "pyright", "ruff", "pre-commit", "httpx"]` (latest versions; lock pins them); `[tool.pytest.ini_options] testpaths = ["packages"]`, `asyncio_mode = "auto"`, `addopts = "--import-mode=importlib --cov=halden_data_contract --cov=halden_data_fake --cov-fail-under=80"`; `[tool.pyright] typeCheckingMode = "strict"`, `pythonVersion = "3.12"`, `include = ["packages"]`, `venvPath = "."`, `venv = ".venv"`.
  - Package `pyproject.toml`: name `halden-data-contract`, version `0.1.0`, `requires-python = ">=3.12"`, dependency `pydantic>=2`, optional extra `testing = ["pytest", "pytest-asyncio"]`, build backend hatchling, `[tool.hatch.build.targets.wheel] packages = ["src/halden_data_contract"]`.

- [ ] **Step 2: Write the failing tests** (`test_models.py`)

```python
import pytest
from pydantic import ValidationError
from halden_data_contract import (NotFoundError, Order, OrderLine, ProductQuery,
                                   ProductSummary, RenderLook)

LOOK = RenderLook(glyph="laptop", finish="silver", screen="dusk")

def summary(**kw):
    base = dict(id="aeris-studio-16", name="Aeris Studio 16", category_id="laptops",
                price_cents=189900, stock=12, look=LOOK)
    return ProductSummary(**(base | kw))

def test_price_must_be_int_cents():
    with pytest.raises(ValidationError):
        summary(price_cents=1899.0)

def test_negative_price_rejected():
    with pytest.raises(ValidationError):
        summary(price_cents=-1)

def test_was_price_must_exceed_price():
    with pytest.raises(ValidationError):
        summary(was_price_cents=189900)
    assert summary(was_price_cents=219900).was_price_cents == 219900

def test_models_are_frozen_and_strict():
    s = summary()
    with pytest.raises(ValidationError):
        s.price_cents = 1  # type: ignore[misc]
    with pytest.raises(ValidationError):
        summary(colour="red")

def test_query_limit_bounds_and_text_normalised():
    with pytest.raises(ValidationError):
        ProductQuery(limit=0)
    with pytest.raises(ValidationError):
        ProductQuery(limit=51)
    assert ProductQuery().limit == 20
    assert ProductQuery(text="  OLED ").text == "OLED"
    assert ProductQuery(text="   ").text is None

def test_order_totals_must_match_lines():
    line = OrderLine(product_id="kore-dock-8-in-1", name="Kore Dock 8-in-1", qty=2, unit_price_cents=18900)
    ok = dict(id="OB-89027", user_id="demo-user", placed_on="2026-11-07", status="shipped",
              total_cents=37800, item_count=2, lines=[line])
    assert Order(**ok).total_cents == 37800
    with pytest.raises(ValidationError):
        Order(**(ok | {"total_cents": 18900}))

def test_not_found_error_names_ids():
    e = NotFoundError("product", ["a", "b"])
    assert e.kind == "product" and e.ids == ["a", "b"]
    assert str(e) == "product not found: a, b"
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && uv sync --all-packages && uv run pytest packages/data_contract -q --no-cov`
Expected: FAIL — `ImportError` on `halden_data_contract`.

- [ ] **Step 4: Implement `models.py`, `errors.py`, `source.py`, `__init__.py`** per the Interfaces block. `__init__.py` re-exports every name listed and sets `__all__`.

- [ ] **Step 5: Run tests, lint, types**

Run: `cd backend && uv run pytest packages/data_contract -q --no-cov && uv run ruff check .. && uv run ruff format --check .. && uv run pyright`
Expected: 7 passed; ruff and pyright report 0 errors.

- [ ] **Step 6: Commit**

```bash
git add ruff.toml backend/
git commit -m "feat(backend): add uv workspace and data contract models"
```

---

### Task 3: Contract test suite and fake catalog source

**Files:**
- Create: `backend/packages/data_contract/src/halden_data_contract/contract_tests.py`
- Create: `backend/packages/data_fake/pyproject.toml` (name `halden-data-fake`, deps `halden-data-contract`, workspace source `[tool.uv.sources] halden-data-contract = { workspace = true }`, hatchling, includes `seed/*.json` in the wheel)
- Create: `backend/packages/data_fake/src/halden_data_fake/__init__.py`, `source.py`, `py.typed`, `seed/categories.json`, `seed/products.json`, `seed/orders.json`
- Test: `backend/packages/data_fake/tests/test_contract.py`, `backend/packages/data_fake/tests/test_seed.py`

**Interfaces:**
- Consumes: everything exported by Task 2.
- Produces:
  - `halden_data_contract.contract_tests.CatalogSourceContract`: a plain base class of async test methods. A subclass named `Test…` supplies a pytest fixture `source` (returning a `CatalogSource`) plus fixtures `known_product_id: str`, `known_order_id: str`, `known_user_id: str`.
  - `halden_data_fake.FakeCatalogSource(seed_dir: Path | None = None)`: loads and validates the seed once at construction; `seed_dir` defaults to the packaged `seed/`.

- [ ] **Step 1: Write the contract suite** (`contract_tests.py`). Methods, each with these exact assertions:
  - `test_is_a_catalog_source`: `isinstance(source, CatalogSource)`.
  - `test_get_product_round_trips`: `(await source.get_product(known_product_id)).id == known_product_id`.
  - `test_unknown_product_raises`: `NotFoundError` with `kind == "product"` and `ids == ["no-such-product"]`.
  - `test_get_products_keeps_order_and_duplicates`: for ids `[a, b, a]` (the first two search results) the returned ids are `[a, b, a]`; `await source.get_products([]) == []`.
  - `test_get_products_reports_only_missing`: `[known, "x1", "x2"]` raises `NotFoundError` with `ids == ["x1", "x2"]`.
  - `test_search_honours_limit`: `len(await source.search_products(ProductQuery(limit=1))) == 1`.
  - `test_search_text_is_case_insensitive`: take the first word of a known product's name; searching it upper-cased returns that product.
  - `test_search_unknown_category_is_empty`: `ProductQuery(category="no-such-category")` returns `[]`.
  - `test_search_order_is_deterministic`: two identical searches return identical id lists, sorted by rating descending (None last) then id ascending.
  - `test_max_price_filters`: every result of `ProductQuery(max_price_cents=20000)` has `price_cents <= 20000`.
  - `test_orders_newest_first`: `placed_on` of `get_orders(known_user_id)` is non-increasing; an unknown user returns `[]`.
  - `test_unknown_order_raises`: `get_order("OB-0")` and `get_order_status("OB-0")` raise `NotFoundError(kind="order")`.
  - `test_order_status_matches_order`: `tracking.order_id == known_order_id` and exactly one step is `"current"` unless the order status is `"delivered"` (then all steps are `"done"`).
  - `test_categories_counts_match`: for each category, `product_count == len(await search_products(ProductQuery(category=c.id, limit=50)))`.

  Search rules, implemented by the fake and documented on `CatalogSource.search_products`: `text` matches a case-insensitive substring of name or category id; `category` matches `category_id` exactly; `attributes` keys are spec keys and values match a case-insensitive substring of that spec's `display`; `max_price_cents` is inclusive.

- [ ] **Step 2: Write the seed files.** Convert `mockup/js/data/catalog.js` and the order items in it. Ids and categories:
  - laptops: `aeris-studio-16`, `kore-zephyr-14`, `vela-prism-15`, `aeris-studio-14-oled`, `lumen-slate-16`
  - monitors: `vela-monitor-32-pro`, `vela-monitor-27`
  - audio: `kore-buds-pro-2`, `kore-buds-pro`
  - keyboards: `kore-keys-low`
  - storage: `kore-ssd-2tb`
  - docks: `kore-hub-6-in-1`, `kore-dock-8-in-1`

  Prices: euros × 100. `was` → `was_price_cents`. `stock` = the mockup's `stock` if set, else 12. Laptop specs keys: `display hz cpu gpu ram ssd batt weight ports p3 de` (`batt` value is hours, unit `"h"`, display `"18 h"`; `p3` unit `"%"`; `de` display `"ΔE 0.8"`). Other products: their `specs` pairs become keys in snake_case (`"Refresh rate"` → `refresh_rate`), with display = the mockup string. `look` = `{glyph: laptop|monitor|buds|keys|ssd|dock, finish, screen?}` from the mockup. Drop `hex` and `radar` (UI-side, decided in sub-project 1). Products that only appear in orders (`kore-buds-pro`, `vela-monitor-27`, `kore-dock-8-in-1`) get `rating: null`, minimal specs, and order prices from the mockup.
  Orders for `user_id: "demo-user"`: `OB-89027` (2026-11-07, `shipped`, eta 2026-11-12, tracking steps Ordered 11-07 done, Packed 11-08 done, Shipped 11-09 done, Out for delivery 11-12 current, Delivered pending; carrier `ParcelLine`, tracking `PL 4471 2290 18`), `OB-88412` (2026-03-02, delivered), `OB-87190` (2026-02-11, delivered); both get the same five step names, all `done`, carrier `ParcelLine`, no tracking number. Category names: Laptops, Monitors, Audio, Keyboards, Storage, Docks. `product_count` = the real count in the seed.

- [ ] **Step 3: Write the failing tests**
  - `test_contract.py`: `class TestFakeCatalogSource(CatalogSourceContract)` with fixtures `source → FakeCatalogSource()`, `known_product_id → "aeris-studio-16"`, `known_order_id → "OB-89027"`, `known_user_id → "demo-user"`.
  - `test_seed.py::test_seed_integrity`: every order line's `product_id` resolves via `get_product`; every product's `category_id` is a listed category; 13 products, 6 categories, 3 orders.
  - `test_seed.py::test_bad_seed_fails_loudly`: a `tmp_path` seed where a product has `price_cents: 18.99` makes `FakeCatalogSource(tmp_path)` raise `pydantic.ValidationError`.

- [ ] **Step 4: Run to verify failure**

Run: `cd backend && uv sync --all-packages && uv run pytest packages/data_fake -q --no-cov`
Expected: FAIL — `ImportError` on `halden_data_fake`.

- [ ] **Step 5: Implement `FakeCatalogSource`** in `source.py`: load the three JSON files with `importlib.resources` (or `seed_dir`), validate into the contract models, index by id. Tracking steps live in `orders.json` under each order's `tracking` key, validated as `OrderTracking`.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && uv run pytest -q && uv run pyright && uv run ruff check ..`
Expected: all pass, coverage ≥ 80%, 0 type and lint errors.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): add contract test suite and fake catalog source"
```

---

### Task 4: Agent service skeleton

**Files:**
- Create: `backend/packages/agent/pyproject.toml` (name `halden-agent`, deps `fastapi`, `uvicorn`, `halden-data-contract` (workspace source), hatchling)
- Create: `backend/packages/agent/src/halden_agent/__init__.py`, `app.py`, `py.typed`
- Test: `backend/packages/agent/tests/test_health.py`

**Interfaces:**
- Produces: `halden_agent.app.create_app() -> fastapi.FastAPI`, route `GET /health → {"status": "ok"}`. Dev run: `uv run --directory backend uvicorn halden_agent.app:create_app --factory --reload`.

- [ ] **Step 1: Write the failing test**

```python
from fastapi.testclient import TestClient
from halden_agent.app import create_app

def test_health():
    r = TestClient(create_app()).get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run to verify failure** — `cd backend && uv sync --all-packages && uv run pytest packages/agent -q --no-cov` → FAIL (`ImportError`).
- [ ] **Step 3: Implement `create_app()`.**
- [ ] **Step 4: Run** — `cd backend && uv run pytest -q && uv run pyright` → all pass.
- [ ] **Step 5: Commit** — `git add backend/ && git commit -m "feat(agent): add FastAPI skeleton with health endpoint"`

---

### Task 5: Web skeleton

**Files (written by hand; do not run `pnpm create`):**
- Create: `web/package.json` (`"type": "module"`, `"engines": {"node": ">=22"}`, `"packageManager": "pnpm@10.x"` matching the local version; scripts `dev`, `build` = `tsc -b && vite build`, `typecheck` = `tsc -b --noEmit`, `lint` = `eslint .`, `format` = `prettier --write .`, `format:check` = `prettier --check .`, `test` = `vitest run`)
- Create: `web/index.html`, `web/vite.config.ts` (Vitest `environment: "jsdom"`, `setupFiles: ["./src/test-setup.ts"]`), `web/tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`), `web/eslint.config.js` (typescript-eslint `strictTypeChecked`, react-hooks recommended, ignores `dist`), `web/.prettierrc.json` (`{"singleQuote": false, "printWidth": 100}`), `web/.prettierignore` (`dist`, `pnpm-lock.yaml`)
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/test-setup.ts` (imports `@testing-library/jest-dom/vitest`)
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Produces: `App` (default export of `App.tsx`) renders an `<h1>` "Halden" and the line "assistant by Obsidian — product app arrives in sub-project 3. The concept mockup is in mockup/index.html."

- [ ] **Step 1: Install dependencies**

Run: `pnpm --dir web add react@^19.2 react-dom@^19.2 && pnpm --dir web add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals prettier`
Expected: `web/pnpm-lock.yaml` created.

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("shows the store name and points to the mockup", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Halden");
  expect(screen.getByText(/mockup\/index\.html/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm --dir web test` → FAIL (cannot resolve `./App`).
- [ ] **Step 4: Implement `App.tsx`, `main.tsx`, `index.html`.**
- [ ] **Step 5: Run every web check** — `pnpm --dir web format:check && pnpm --dir web lint && pnpm --dir web typecheck && pnpm --dir web test && pnpm --dir web build` → all exit 0.
- [ ] **Step 6: Commit** — `git add web/ && git commit -m "feat(web): add Vite React TypeScript skeleton"`

---

### Task 6: `scripts/check.py` and git hooks

**Files:**
- Create: `scripts/check.py` (stdlib only)
- Create: `.pre-commit-config.yaml`
- Test: `backend/packages/agent/tests/test_check_script.py` (lives in the backend suite so CI runs it; loads `scripts/check.py` with `importlib.util.spec_from_file_location`)

**Interfaces:**
- Produces:
  - `CHECKS: dict[str, list[list[str]]]`, argv lists run from the repo root:
    - `backend`: `uv run --directory backend ruff format --check ..`, `… ruff check ..`, `… pyright`, `… pytest -q`, `uv build --directory backend --all-packages` (spec §5 "uv build per package"; confirm the flag exists on the pinned uv)
    - `web`: `pnpm --dir web format:check`, `… lint`, `… typecheck`, `… test`, `… build`
    - `backend-types` (pyright), `backend-tests` (pytest), `web-types` (typecheck), `web-tests` (test)
    - `web-fix`: `pnpm --dir web exec prettier --write .`, `pnpm --dir web exec eslint --fix .`
    - `all`: `backend` + `web`
  - `resolve(argv: list[str]) -> list[str]`: replaces `argv[0]` with `shutil.which(argv[0])`; raises `SystemExit(127)` with message `"<cmd> not found on PATH"` if missing.
  - `main(argv: list[str]) -> int`: `python scripts/check.py <name>...`; runs each command in order, stops at the first failure and returns its exit code; unknown name → prints the valid names, returns 2.

- [ ] **Step 1: Write the failing tests**

```python
def test_unknown_check_returns_2(check, capsys):
    assert check.main(["nope"]) == 2
    assert "backend" in capsys.readouterr().out

def test_resolves_executables_via_which(check, monkeypatch):
    monkeypatch.setattr(check.shutil, "which", lambda c: f"C:/bin/{c}.cmd")
    assert check.resolve(["pnpm", "--dir", "web", "test"])[0] == "C:/bin/pnpm.cmd"

def test_missing_executable_exits_127(check, monkeypatch):
    monkeypatch.setattr(check.shutil, "which", lambda c: None)
    with pytest.raises(SystemExit) as e:
        check.resolve(["pnpm"])
    assert e.value.code == 127

def test_all_is_backend_then_web(check):
    assert check.CHECKS["all"] == check.CHECKS["backend"] + check.CHECKS["web"]

def test_stops_at_first_failure(check, monkeypatch):
    calls = []
    monkeypatch.setattr(check, "resolve", lambda a: a)
    monkeypatch.setattr(check.subprocess, "call", lambda a: calls.append(a) or (1 if len(calls) == 1 else 0))
    assert check.main(["backend"]) == 1 and len(calls) == 1
```
(`check` is a fixture in the same file that imports the script by path.)

- [ ] **Step 2: Run to verify failure** — `cd backend && uv run pytest packages/agent/tests/test_check_script.py -q --no-cov` → FAIL (file not found).
- [ ] **Step 3: Implement `scripts/check.py`.** Use `subprocess.call(resolve(argv))`; print `==> <command>` before each.
- [ ] **Step 4: Run** — same command → 5 passed. Then `python scripts/check.py all` → exit 0.
- [ ] **Step 5: Write `.pre-commit-config.yaml`**
  - `default_install_hook_types: [pre-commit, commit-msg, pre-push]`, `default_stages: [pre-commit]`.
  - `pre-commit/pre-commit-hooks` (latest tag): trailing-whitespace, end-of-file-fixer, check-yaml, check-json, check-toml, check-added-large-files `args: [--maxkb=500]`, `exclude: ^\.claude/skills/a2ui/references/`.
  - `astral-sh/ruff-pre-commit` (latest tag): `ruff-check --fix`, `ruff-format`.
  - `gitleaks/gitleaks` (latest v8 tag): `gitleaks`.
  - `compilerla/conventional-pre-commit` (latest tag): stage `commit-msg`, args `[feat, fix, docs, chore, refactor, test, ci, build, perf]`.
  - `repo: local`, `language: system`, `pass_filenames: false`:
    - `web-fix`: entry `python scripts/check.py web-fix`, `files: ^web/`.
    - `backend-types`, `backend-tests`, `web-types`, `web-tests`: entry `python scripts/check.py <name>`, `stages: [pre-push]`, `always_run: true`.
- [ ] **Step 6: Install and prove the hooks on this Windows machine**

Run: `uv run --project backend pre-commit install --install-hooks && uv run --project backend pre-commit run --all-files` → all hooks pass (fix any whitespace/EOF findings, re-run).
Prove rejection, then undo each:
  - `git commit --allow-empty -m "bad message"` → rejected by conventional-pre-commit.
  - a file `tmp_secret.txt` containing `AZURE_FOUNDRY_API_KEY=` + a 32-char random-looking hex string, staged → rejected by gitleaks. Remove the file and unstage.
  - an unformatted `.py` edit staged → ruff-format rewrites it and the commit stops.
  - `uv run --project backend pre-commit run --hook-stage pre-push --all-files` → the four pre-push hooks pass (confirms `pnpm` is found through `check.py`).
- [ ] **Step 7: Commit** — `git add scripts/ .pre-commit-config.yaml backend/ && git commit -m "build: add check script and pre-commit hooks"`

---

### Task 7: CI, Dependabot, PR template

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.github/pull_request_template.md`

- [ ] **Step 1: Write `ci.yml`**
  - `on: pull_request` and `push: branches: [main]`; `permissions: contents: read`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
  - Job `backend` (ubuntu-latest): checkout → `astral-sh/setup-uv` (`version:` = the local `uv --version`, `enable-cache: true`) → `uv python install 3.12` → `uv sync --locked --all-packages --directory backend` → `python3 scripts/check.py backend`.
  - Job `web`: checkout → `pnpm/action-setup` (version from `web/package.json` `packageManager`) → `actions/setup-node` (`node-version-file: .nvmrc`, `cache: pnpm`, `cache-dependency-path: web/pnpm-lock.yaml`) → `pnpm --dir web install --frozen-lockfile` → `python3 scripts/check.py web`.
  - Job `secrets`: checkout `fetch-depth: 0` → download a pinned gitleaks v8 release tarball for linux x64 and verify its SHA-256 (from the release's checksums file) → `gitleaks git --redact --log-opts="${{ github.event.pull_request.base.sha || github.event.before }}..${{ github.sha }}"`. Do not use `gitleaks-action` (needs a licence for org accounts).
  - Job `commits` (only `if: github.event_name == 'pull_request'`): checkout `fetch-depth: 0` → setup-uv → for each `git rev-list --no-merges base..head` write the full message to a file and run `uvx conventional-pre-commit==<same version as the hook> feat fix docs chore refactor test ci build perf <file>`; fail on the first bad one, printing its SHA.
  - All actions pinned by SHA (Global Constraints).
- [ ] **Step 2: Write `dependabot.yml`**: version 2; `uv` at `/backend`, `npm` at `/web`, `github-actions` at `/`; each `schedule: weekly`, one group per ecosystem (`patterns: ["*"]`), commit-message prefix `build(deps)`.
- [ ] **Step 3: Write `pull_request_template.md`**: sections Summary, Roadmap milestone, Checks run (`python scripts/check.py all`), CHANGELOG updated under Unreleased (yes/no), Notes for reviewers.
- [ ] **Step 4: Validate locally** — `uv run --project backend pre-commit run check-yaml --all-files` → pass. If `actionlint` is unavailable, re-read the workflow for typos in `${{ }}` expressions and job names: `backend`, `web`, `secrets`, `commits` (these become the required checks).
- [ ] **Step 5: Commit** — `git add .github/ && git commit -m "ci: add CI workflow, Dependabot and PR template"`

---

### Task 8: Documents, A2UI skill snapshot, spec update

**Files:**
- Create: `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`
- Create: `.claude/skills/a2ui/references/llms-full.txt`, `.claude/skills/a2ui/references/SOURCE.md`
- Modify: `PRODUCT.md` (rewrite), `.claude/skills/a2ui/SKILL.md` (append one section), `docs/superpowers/specs/2026-11-11-repo-foundation-design.md` (§3 layout and §10.7 add `scripts/`; §5 says ruff config is in root `ruff.toml`; §9 records the llms-full source deviation)
- Already present, now committed: `.claude/skills/a2ui/SKILL.md`, `.claude/skills/a2ui/UPSTREAM_COMMIT`

- [ ] **Step 1: A2UI docs snapshot**

Run: `curl -fsSL https://a2ui.org/llms-full.txt -o .claude/skills/a2ui/references/llms-full.txt && wc -c .claude/skills/a2ui/references/llms-full.txt`
Expected: a non-empty text file. `SOURCE.md` records the URL, today's date, the byte size, and "refresh only on deliberate A2UI upgrades". Append to `SKILL.md`: a `## Local snapshot` section saying "Read `references/llms-full.txt` first; it matches the A2UI version this repo pins. Fall back to https://a2ui.org/llms.txt only if the snapshot lacks the topic."

- [ ] **Step 2: `docs/ARCHITECTURE.md`**, distilled from `docs/research/A2UI-DECISION.md`, with these headings in order: Paradigm (no transcript; command bar + agent-filed tabs) · Stack (A2UI v1.0 + own catalog, Express format; Python backend; React 19.2 + `@a2ui/react`; Azure Foundry: small router model + top-tier UI model) · Tabs are surfaces (create/update/delete; tab cards; saved tab = card + snapshot) · Three kinds of buttons (local / direct / agent table) · IDs, never values · Data contract boundary (`CatalogSource`, the fake, contract tests) · Transport (AG-UI-shaped SSE) · Risks to watch (version churn → exact pins; silent truncation → check stop reason; blank-screen failures → validate-and-retry; no per-component delete) · Where the reasoning lives (links to `docs/research/`). Max ~250 lines.
- [ ] **Step 3: `PRODUCT.md`**: keep the `<!-- impeccable:product-schema 1 -->` marker and every existing heading. Rewrite Stack (the product stack, with the mockup in `mockup/` as visual reference), Product Purpose and Capabilities and Constraints (real model, real backend, persistence planned; remove "mockup only / no backend / no persistence"). Keep Brand Commitments, Positioning and Product Principles unchanged.
- [ ] **Step 4: `README.md`**: one-paragraph pitch; status ("sub-project 0 of 5: foundation"); folder map (mockup, web, backend, scripts, docs, .claude); quickstart: open `mockup/index.html`; `uv sync --all-packages --directory backend`; `pnpm --dir web install`; hooks install command; `python scripts/check.py all`; run agent (`uvicorn` factory command from Task 4) and web (`pnpm --dir web dev`); links to ROADMAP, ARCHITECTURE, CONTRIBUTING, DESIGN, PRODUCT.
- [ ] **Step 5: `ROADMAP.md`**: milestones 0–5 from spec §1. Each has Goal, Exit criteria and Status (0 = in progress, rest = planned). Milestone 2 lists the ten PoC questions from A2UI-DECISION §10 and "extend the fake dataset to ~50 products". Milestone 1 lists "review the data contract with the data-agent teammate".
- [ ] **Step 6: `CHANGELOG.md`**: Keep a Changelog header, SemVer 0.x note. `[Unreleased]` → Added (layout, data contract + fake, skeletons, hooks, CI, docs, A2UI skill) and Changed (mockup moved to `mockup/`, research docs to `docs/research/`). `[0.1.0] – <date of commit 8883266>`, from `git log --format='%ad %s' --date=short`: the mockup, then the framework research and A2UI decision.
- [ ] **Step 7: `CONTRIBUTING.md`**: prerequisites (uv, Python 3.12, Node 22, pnpm 10); setup (the README quickstart commands); branch names `feat/ fix/ chore/ docs/`; Conventional Commits with the exact type list; hooks and what runs at each stage; `python scripts/check.py all` before opening a PR; update CHANGELOG under Unreleased; A2UI packages pinned exactly, upgrades as their own PR that also refreshes the skill snapshot; no screenshot or headless-browser tooling.
- [ ] **Step 8: Update the spec** with the three deviations listed under Global Constraints.
- [ ] **Step 9: Verify** — `uv run --project backend pre-commit run --all-files` → pass. Run `grep -n "A2UI-DECISION.md\|FRAMEWORKS-STUDY.md\|OPENUI-STUDY.md" README.md docs/ARCHITECTURE.md PRODUCT.md`: every hit points to `docs/research/…`.
- [ ] **Step 10: Commit** — `git add -A && git commit -m "docs: add README, roadmap, changelog, contributing, architecture and A2UI skill"`

---

### Task 9: Done-checklist and PR

- [ ] **Step 1: Fresh-clone check.** `git clone . "$SCRATCHPAD/fresh"` (absolute scratchpad path) → in it run the README quickstart verbatim, then `python scripts/check.py all` → exit 0 (spec §10.2, §10.6).
- [ ] **Step 2: Root contents.** `ls -A` at the repo root shows only spec §10.7's list (+ `scripts/`, `ruff.toml`, `downloads/` and `.impeccable/` which are ignored).
- [ ] **Step 3: Ask the user before pushing.** Then `git push -u origin chore/repo-foundation` and `gh pr create` with a body that lists the spec §10 checklist with results, plus the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4: Watch CI.** `gh pr checks --watch` → `backend`, `web`, `secrets`, `commits` all green (spec §10.4). Fix and push on any failure.
- [ ] **Step 5: Tell the user** to add those four checks as required status checks on `main`, and to open `mockup/index.html` to confirm it still works (spec §10.1).
