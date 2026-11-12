# Slice 2 — Store, session and the action mechanism: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this repo the user prefers executing-plans in one session (lean token use).

**Goal:** State outlives a restart and belongs to a shopper: the tab, its page and the cart live in a store (Postgres, or memory in tests), three seeded shoppers each have their own, and every button reaches the backend through one checked, idempotent action path.

**Architecture:** A new core package `obsidian_store` holds an async `Store` protocol, frozen Pydantic records, `MemoryStore`, `PostgresStore` (SQLAlchemy 2 async + asyncpg, Alembic) and a reusable `StoreContract` pytest suite, the `CatalogSourceContract` pattern. The agent replaces its in-memory `Workspace` with the store, reads the shopper from a signed `obsidian_session` cookie, writes the tab, a revision and a `runs` row after every run, and checks every direct action against an action registry that both the backend and the web read.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2 (asyncio) + asyncpg, Alembic, Postgres 17 (`docker compose`; a CI service container), pytest; React 19.2, TypeScript, zod, Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-11-product-spec-design.md`](../specs/2026-11-11-product-spec-design.md): §5 (persisted after every run, reload, stale text), §8.1 (how each kind runs, shell buttons), §8.2 (`cart.*`, `session.switch_user`), §10.1–10.4 (the package, the slice's tables, the session cookie, the endpoints), §13 (direct action errors), §14 (`StoreContract`, the action-kind test), §15 (snapshot size). Slice definition: [`2026-11-12-milestone-3-slices.md`](2026-11-12-milestone-3-slices.md), Slice 2; GitHub issue #15; decision D on issue #7.

## Global Constraints

- Branch `feat/store-session-actions` from `main`; one PR to `main` whose body says `Closes #15` and `Closes #7`, in milestone "3 — Build, slice by slice"; Conventional Commits; ask the user before pushing.
- **Core** (`obsidian_data_contract`, `obsidian_agent`, `obsidian_store`, `web/src/` outside `web/src/cartridges/`) never imports a cartridge or names Halden data. `obsidian_store` joins the guard test in `test_cartridges.py`.
- Money stays integer cents. `cart_lines` stores no price: prices are read live from the catalog.
- Slice 2 creates only these tables: `users`, `workspaces`, `tabs`, `tab_revisions`, `cart_lines`, `runs`, `processed_actions` (columns as spec §10.2, plus `product_facts jsonb` on `tabs` and `tab_revisions`). Later slices add theirs in new migrations.
- Seeded shoppers: `demo-user` "Javier" `en`, `ana` "Ana" `es`, `sam` "Sam" `en`. The default shopper, without a valid cookie, is `demo-user`.
- Settings: `OBSIDIAN_DATABASE_URL` (unset: the agent uses `MemoryStore` and logs a warning that nothing survives a restart), `OBSIDIAN_SESSION_KEY` (unset: a random key per process, logged as a warning), `OBSIDIAN_TEST_DATABASE_URL` (tests: the Postgres contract run skips without it).
- Cookie `obsidian_session`: value `<user_id>.<signature>`, the signature HMAC-SHA256 of the user ID with the session key, base64url without padding; `HttpOnly`, `SameSite=Lax`, `Path=/`. Standard library only (`hmac`, `hashlib`, `base64`).
- Snapshot limit: 256 KB (`256 * 1024` bytes of compact JSON); a bigger page fails validation like any other issue.
- Revisions: the last 20 per tab. `processed_actions`: 24 hours.
- The action response keeps the spec's shape `{ok, cart?, saved?, toast?, tab?, error?: {code, message}}`; slice 2 fills `ok`, `cart`, `error`, and `user` for `session.switch_user`.
- No live model calls: tests use `ScriptedModel`. No screenshots or headless-browser tests.
- New Python dependencies are pinned with `==` to the version `uv` resolves on the day (`sqlalchemy[asyncio]`, `asyncpg`, `alembic`); they go in `obsidian-store` only.
- pyright strict, ruff, Prettier and ESLint clean. Per task, run only the named tests; run `python scripts/check.py backend web` once, in Task 9, with Postgres up and `OBSIDIAN_TEST_DATABASE_URL` set.

## Decisions this plan makes (the spec is silent; each is in the PR description for the user)

1. **Shell buttons** send `surfaceId: "shell"` with `sourceComponentId` `cart-drawer` or `user-menu` (written into spec §8.1 with this plan; the web already sends `shell`/`cart-drawer`).
2. **The action registry** is a JSON file beside the catalog, `obsidian_agent/catalog/actions.json`, read by the server and imported by the web, instead of being generated from `shop.json` (the A2UI catalog format has no place for kinds).
3. **No database, no persistence:** without `OBSIDIAN_DATABASE_URL` the agent runs on `MemoryStore`, so tests and a quick look need no Docker.
4. **The store opens on the first request** (migrations, seed, purge of old action results), like the model, so building the app touches nothing.
5. **`GET /api/workspace` keeps its shape** `{tab, cart}` (the user's one open tab) until slice 5 brings several tabs.
6. **Switching shopper reloads the page** once the new cookie is set.
7. **Coverage:** `postgres.py` and the migrations are left out of the 80 % gate (`[tool.coverage.run] omit`); they are proven by `StoreContract` against a real Postgres in CI, and the pre-push hook has no database.

## Review Focus

1. Two fast "Add to cart" clicks on the last item in stock: exactly one succeeds, also on Postgres, where two requests run in two transactions. (Task 2 contract test; Task 5 API test.)
2. A repeated `requestId` after the cart has changed returns the first answer unchanged and does not run the handler again; the same `requestId` from another shopper is rejected. (Task 7.)
3. A tampered cookie, a cookie signed with another key, or a valid cookie for a user who no longer exists: the shopper is `demo-user`, never a 500. (Task 4.)
4. An action naming a surface that belongs to another shopper, or a button that is on the page but adds a different product than the one in `context`: rejected as `invalid`. (Task 7.)
5. A product removed from the catalog while it sits in a cart: the line leaves the stored cart on the next read, and a restart does not bring it back. (Task 5.)

---

### Task 1: The `obsidian_store` package: records, protocol, `MemoryStore`, and the contract for users and tabs

**Files:**
- Create: `backend/packages/store/pyproject.toml` (name `obsidian-store`, depends on `pydantic`; the SQL dependencies arrive in Task 3), `backend/packages/store/src/obsidian_store/{__init__,models,store,memory,contract_tests}.py`, `py.typed`
- Create: `backend/packages/store/tests/{conftest,test_memory}.py`
- Modify: `backend/pyproject.toml` (`--cov=obsidian_store` in `addopts`), `backend/uv.lock`
- Modify: `backend/packages/agent/tests/test_cartridges.py` (the core-imports guard covers `obsidian_store`)

**Interfaces:**
- Produces in `obsidian_store.models` (frozen Pydantic models, `extra="forbid"`; datetimes timezone-aware UTC; `Snapshot = dict[str, Any]`):
  - `User(id: str, name: str, language: str)`
  - `ProductFact(price_cents: int, stock: int)`; `ProductFacts = dict[str, ProductFact]`
  - `TabRecord(id: str, user_id: str, surface_id: str, kind: str, status: Literal["open", "history"], position: int, card: dict[str, Any], snapshot: Snapshot | None, product_facts: ProductFacts, language: str, created_at, updated_at, closed_at: datetime | None)`
  - `TabRevision(tab_id: str, rev: int, card, snapshot: Snapshot, product_facts: ProductFacts, run_id: str, created_at)`
- Produces in `obsidian_store.store`: `class Store(Protocol)` (async, `runtime_checkable`), this task's part:
  ```python
  async def upsert_users(self, users: Sequence[User]) -> None: ...
  async def list_users(self) -> list[User]: ...                      # by id
  async def get_user(self, user_id: str) -> User | None: ...
  async def open_tabs(self, user_id: str) -> list[TabRecord]: ...     # status open, by position
  async def create_tab(self, user_id: str, *, surface_id: str, kind: str,
                       card: dict[str, Any], language: str) -> TabRecord: ...  # last position; becomes the active tab
  async def active_tab_id(self, user_id: str) -> str | None: ...
  async def save_tab(self, tab_id: str, *, card: dict[str, Any], snapshot: Snapshot,
                     product_facts: ProductFacts, run_id: str) -> TabRecord: ...  # + revision; keeps the last 20
  async def tab_revisions(self, tab_id: str) -> list[TabRevision]: ...  # rev ascending
  ```
  `TAB_REVISIONS_KEPT = 20`. Tab IDs are `uuid4().hex`. `create_tab` with a `surface_id` already used raises `ValueError`; `save_tab` on an unknown tab raises `KeyError`.
- Produces: `obsidian_store.contract_tests.StoreContract`, a pytest class whose subclasses provide a `store` fixture.

- [ ] **Step 1: Write the failing contract tests** in `contract_tests.py` and `tests/test_memory.py` (`class TestMemoryStore(StoreContract)` with `store = MemoryStore()`):
  - `test_users_round_trip`: upsert the three seed users twice; `list_users()` returns them once each, by ID; `get_user("nobody") is None`.
  - `test_users_upsert_updates_name`: upsert `User("ana", "Ana", "es")` then `User("ana", "Ana M.", "es")` → the name is the new one.
  - `test_tabs_belong_to_their_user`: a tab created for `ana` is not in `open_tabs("sam")`; `active_tab_id("ana")` is its ID.
  - `test_tab_positions_follow_creation`: two tabs → positions 0 and 1, `open_tabs` in that order.
  - `test_save_tab_writes_a_revision`: after two saves, `tab_revisions` has revs 1 and 2 with their snapshots and `product_facts`; `open_tabs` returns the second snapshot and facts.
  - `test_only_twenty_revisions_are_kept`: 23 saves → revs 4..23.
  - `test_surface_ids_are_unique`: a second `create_tab` with the same `surface_id` raises `ValueError`.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/store -q --no-cov` → FAIL (no package; first `uv sync --all-packages --directory backend` after adding it to the workspace).
- [ ] **Step 3: Implement** the models, the protocol, `MemoryStore` (dicts guarded so every method runs without awaiting in between) and the exports; add `obsidian_store` to the guard test's package list.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/store packages/agent/tests/test_cartridges.py -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(store): add the store package with users, tabs and revisions`.

### Task 2: The contract for the cart, runs and action results

**Files:**
- Modify: `obsidian_store/{models,store,memory,contract_tests}.py`

**Interfaces:**
- Produces in `models`: `CartLine(product_id: str, qty: int, added_at)`; `CartChange(ok: bool, qty: int)` (the quantity after the change, or the one kept when refused); `RunRecord` with spec §10.2's `runs` columns (`id, user_id, tab_id: str | None, trigger: Literal["command", "action", "foryou"], tool: str | None, outcome: str, router_model: str | None, ui_model: str | None, tokens_in, tokens_out, tokens_cached, latency_ms, first_message_ms: int | None, retries: int, tool_round_used: bool, error: str | None, started_at, finished_at`); `ActionRecord(request_id: str, user_id: str, result: dict[str, Any], at: datetime)`.
- Produces in `Store`:
  ```python
  async def cart(self, user_id: str) -> list[CartLine]: ...          # by added_at, then product_id
  async def add_to_cart(self, user_id: str, product_id: str, *, stock: int) -> CartChange: ...
  async def set_cart_qty(self, user_id: str, product_id: str, qty: int, *, stock: int) -> CartChange: ...
  async def remove_from_cart(self, user_id: str, product_id: str) -> None: ...
  async def record_run(self, run: RunRecord) -> None: ...
  async def runs(self, user_id: str) -> list[RunRecord]: ...          # by started_at
  async def action_result(self, request_id: str, *, since: datetime) -> ActionRecord | None: ...
  async def save_action_result(self, record: ActionRecord) -> None: ...
  async def purge_action_results(self, before: datetime) -> int: ...  # rows removed
  ```
  Rules, each one atomic (one statement on Postgres): `add_to_cart` adds 1 only if the new quantity is at most `stock`; `set_cart_qty` sets `qty` if `qty <= stock` or `qty <= ` the current quantity (a decrease is always allowed), and `qty == 0` removes the line; a refused change returns `CartChange(False, current)`. `ACTION_RESULT_TTL = timedelta(hours=24)`.

- [ ] **Step 1: Write the failing contract tests:**
  - `test_add_respects_stock`: stock 2 → adds give `(True, 1)`, `(True, 2)`, `(False, 2)`.
  - `test_concurrent_adds_take_the_last_item_once`: stock 1, `asyncio.gather` of two `add_to_cart` → one `ok`, the cart holds 1.
  - `test_set_qty_rules`: at qty 3 with stock 1, `set_cart_qty(…, 2, stock=1)` is allowed (a decrease); `set_cart_qty(…, 5, stock=4)` is refused and keeps 2; `0` removes the line.
  - `test_cart_is_per_user_and_keeps_order`: lines come back in the order first added; another user's cart is empty.
  - `test_runs_round_trip`: two runs come back in `started_at` order with every field.
  - `test_action_results_expire`: a result saved 25 h ago is `None` for `since = now - 24 h`; `purge_action_results(now - 24 h)` returns 1 and leaves the fresh one.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/store -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** the records and the `MemoryStore` methods.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(store): add the cart, run records and action results to the store`.

### Task 3: `PostgresStore`, its migration, and Postgres in dev and CI

**Files:**
- Create: `obsidian_store/postgres.py`, `obsidian_store/migrations/{env.py,script.py.mako}`, `obsidian_store/migrations/versions/0001_slice_2_tables.py`, `obsidian_store/migrate.py`
- Create: `backend/packages/store/tests/test_postgres.py`; `compose.yaml` (repo root)
- Modify: `backend/packages/store/pyproject.toml` (SQL dependencies; the wheel ships `migrations/`), `backend/pyproject.toml` (`[tool.coverage.run] omit` for `*/obsidian_store/postgres.py` and `*/obsidian_store/migrations/*`), `.github/workflows/ci.yml` (backend job: service `postgres:17`, user/password/db `obsidian`, health check `pg_isready`, env `OBSIDIAN_TEST_DATABASE_URL`), `.env.example`, `scripts/dev.py`

**Interfaces:**
- Produces: `class PostgresStore` implementing `Store`; `@classmethod async def connect(cls, url: str) -> PostgresStore` runs the migrations to head, then returns the store; `async def close(self) -> None`.
- Produces: `obsidian_store.migrate.upgrade(connection: Connection) -> None`, Alembic `upgrade head` on a sync connection (called through `AsyncConnection.run_sync`), with the script location set in code (no `alembic.ini`).
- The migration creates the seven tables of the Global Constraints with spec §10.2's keys and the index `tabs (user_id, status, position)`; `card`, `snapshot`, `product_facts`, `result` are `jsonb`; times are `timestamptz`.
- `compose.yaml`: service `postgres`, image `postgres:17`, port `5432:5432`, `POSTGRES_USER/PASSWORD/DB=obsidian`, a named volume, a `pg_isready` health check.
- `.env.example` gains: `OBSIDIAN_DATABASE_URL=postgresql+asyncpg://obsidian:obsidian@localhost:5432/obsidian` with the comment "Local Postgres from compose.yaml; leave empty to keep everything in memory (lost on restart).", and `OBSIDIAN_SESSION_KEY=` with "Any long random string; without it, a restart signs every browser back in as demo-user."
- `scripts/dev.py`: when `OBSIDIAN_DATABASE_URL` is set (environment or `.env`), run `docker compose up -d --wait postgres` before starting the agent, and stop with a clear message if Docker is not on PATH.

- [ ] **Step 1: Write the failing test** `tests/test_postgres.py`: `class TestPostgresStore(StoreContract)`, skipped unless `OBSIDIAN_TEST_DATABASE_URL` is set; its `store` fixture connects, empties the seven tables (`TRUNCATE … RESTART IDENTITY CASCADE`, in the test file), yields, closes. Plus `test_migrations_are_idempotent`: `connect` twice on the same database succeeds.
- [ ] **Step 2: Run** with Postgres up (`docker compose up -d --wait postgres`) and `OBSIDIAN_TEST_DATABASE_URL` set: `uv run --directory backend pytest packages/store -q --no-cov` → FAIL (no `PostgresStore`).
- [ ] **Step 3: Implement** the migration, `migrate.upgrade`, `PostgresStore` (each cart rule as one `INSERT … ON CONFLICT … DO UPDATE … WHERE … RETURNING` or `UPDATE … RETURNING`; `save_tab`'s update, revision insert and trim in one transaction), `compose.yaml`, the CI service, `.env.example`, `dev.py`.
- [ ] **Step 4: Run** the same command → PASS for both `TestMemoryStore` and `TestPostgresStore`; without the variable, `TestPostgresStore` is skipped.
- [ ] **Step 5: Commit** `feat(store): add the Postgres store, its migration, and Postgres in dev and CI`.

### Task 4: The session: signed cookie, seeded shoppers, `GET /api/session` and `GET /api/users`

**Files:**
- Create: `backend/packages/agent/src/obsidian_agent/session.py`, `backend/packages/agent/tests/test_session.py`
- Modify: `backend/packages/agent/pyproject.toml` (depends on `obsidian-store`), `obsidian_agent/app.py`

**Interfaces:**
- Produces in `session.py`: `SESSION_COOKIE = "obsidian_session"`, `SESSION_KEY_SETTING = "OBSIDIAN_SESSION_KEY"`, `DEFAULT_USER_ID = "demo-user"`, `DEMO_SHOPPERS: list[User]` (the three of the Global Constraints), `sign(user_id: str, key: bytes) -> str`, `unsign(value: str, key: bytes) -> str | None` (constant-time compare; `None` for anything malformed).
- Produces: `create_app(model=None, cartridge=None, store: Store | None = None, session_key: bytes | None = None)`. Without a store: when `OBSIDIAN_DATABASE_URL` is set (env over `.env`, as `cartridge_setting`) the app keeps the URL, else it makes a `MemoryStore()` and logs the warning. A `ready()` coroutine, run once under a lock at the start of every endpoint, makes the Postgres store if needed (`await PostgresStore.connect(url)`: `create_app` is synchronous), sets `app.state.store`, upserts `DEMO_SHOPPERS` and purges action results older than 24 h.
- Produces: `async def current_user(request) -> User` (an app-local dependency): the cookie's user if the signature holds and the user exists, else `demo-user`.
- `GET /api/session` → `{"user": {"id", "name", "language"}}`; `GET /api/users` → `{"users": [...]}` by ID.

- [ ] **Step 1: Write the failing tests** in `test_session.py`: `sign`/`unsign` round-trip; `unsign` of a changed user ID, a changed signature, another key's value, `""` and `"no-dot"` is `None`; `/api/session` without a cookie is `demo-user`; with a valid cookie for `ana` it is `ana`; with a tampered cookie, or a valid cookie for `ghost`, it is `demo-user` (status 200); `/api/users` lists `ana, demo-user, sam` with their names and languages.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_session.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** `session.py`, the store selection, `ready()`, `current_user` and the two endpoints.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): sign the shopper into a session cookie; seed three shoppers`.

### Task 5: The workspace and the cart come from the store

**Files:**
- Delete: `obsidian_agent/workspace.py`
- Modify: `obsidian_agent/app.py`, `obsidian_agent/page_agent.py` (`BuildResult.products`)
- Test: `backend/packages/agent/tests/test_api.py`, new `tests/test_persistence.py`

**Interfaces:**
- Consumes: `Store` (Tasks 1–2), `current_user` (Task 4).
- Produces: `BuildResult.products: dict[str, Product]`, the page's products as the validator saw them (empty on failure).
- After a successful run: a new tab is `create_tab(user, surface_id=…, kind="compare", card={"title": …, "commands": []}, language=user.language)` when the user has none; then `save_tab(tab.id, card={"title", "commands": [..., command]}, snapshot=…, product_facts={id: ProductFact(price_cents, stock)}, run_id=run_id)`. The tab is created when the run starts (the `tab_opened` frame), as today, so a failed first build leaves an empty tab.
- One run at a time per shopper: a lock per user ID in the app.
- `GET /api/workspace` → `{"tab": {"surface_id", "title", "snapshot"} | None, "cart": [...]}` for the session's user (the first open tab); `GET /api/cart` and every action read the session user's cart from the store. A cart line whose product no longer exists is removed from the store when the cart is read.
- `cart.add`: read the product from the catalog, then `store.add_to_cart(user, id, stock=product.stock)`; a refusal is `out_of_stock` with today's copy. `cart.set_qty` uses `set_cart_qty` the same way.

- [ ] **Step 1: Write the failing tests** in `test_persistence.py`, each with one `MemoryStore` shared by two `create_app` calls (the second app is "after the restart"):
  - `test_restart_keeps_the_tab_page_and_cart`: build with app 1, add to cart; app 2 `GET /api/workspace` returns the same surface, title, snapshot and cart.
  - `test_each_shopper_has_their_own_workspace`: `demo-user` builds and adds; with `ana`'s cookie the workspace is `{tab: None, cart: []}`.
  - `test_a_run_saves_a_revision_with_product_facts`: after a build and an edit, `tab_revisions` has 2 revisions; the second's `product_facts` holds the edited page's products with their catalog price and stock; the card's `commands` are both commands.
  - `test_interleaved_adds_take_the_last_item_once`: a catalog stub whose `get_product` waits on an `asyncio.Event` and reports stock 1; two `cart.add` requests run concurrently (`httpx.AsyncClient` with `ASGITransport`); one `ok`, one `out_of_stock`, the cart holds 1.
  - `test_vanished_product_leaves_the_stored_cart`: put a line in the store for `ghost-laptop-99`; `GET /api/cart` omits it and `store.cart(...)` no longer has it.
  - Update `test_api.py`'s helpers to pass a `MemoryStore`; its expectations stay as they are.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_persistence.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement**: remove `Workspace`, read and write through the store, the per-user lock, `BuildResult.products` (from `_page_products`), the cart through the store's atomic calls.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): keep each shopper's tab and cart in the store`.

### Task 6: A `runs` row for every run, and the 256 KB page limit

**Files:**
- Modify: `obsidian_agent/model.py` (`UsageMeter`), `obsidian_agent/app.py`, `obsidian_agent/validate.py`
- Test: `backend/packages/agent/tests/test_runs.py` (new), `tests/test_validate.py`

**Interfaces:**
- Produces in `model.py`: `class UsageMeter` wrapping a `ModelClient` (same `call` signature); it keeps every `ModelResult`; properties `usage: Usage` (summed), `calls: int`, `tool_rounds: int` (results with `stop == "tool_calls"`).
- Every run, whatever its end, records one `RunRecord`: `trigger="command"`, `tool=None` (the router comes in slice 5), `outcome` = `"ok"` or the `RUN_ERROR` code, `ui_model` = the deployment name (`Settings.ui_deployment`) or the model class name for a test model, tokens from the meter, `latency_ms` from start to the last frame, `first_message_ms` to the first `a2ui` frame (`None` if none), `retries = attempts - 1` (0 when the build raised), `tool_round_used = meter.tool_rounds > 0`, `error` = the logged reason or `None`.
- Produces in `validate.py`: `SNAPSHOT_LIMIT_BYTES = 256 * 1024`; issue code `"page_too_large"` (component `root`) when the compact JSON of the snapshot is larger; message `"The page is {size} KB; the limit is 256 KB. Use fewer sections or shorter text."`. The app logs each saved snapshot's size in bytes.

- [ ] **Step 1: Write the failing tests:**
  - `test_runs.py`: a successful build writes one run with `outcome "ok"`, the scripted usage summed, `retries 0`; a build that fails twice writes `outcome "build_failed"`, `retries 1`; a missing-settings run writes `outcome "not_configured"`; a tool round sets `tool_round_used`.
  - `test_validate.py::test_page_over_the_limit`: give `root` a `meta` list long enough that the page's compact JSON passes 256 KB → `("page_too_large", "root")` among the codes; the untouched build fixture has no such issue.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_runs.py packages/agent/tests/test_validate.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** `UsageMeter`, the run record in `run_events` (one `finally`), the size rule and the size log line.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): record every run and cap a page at 256 KB`.

### Task 7: The checked action path: registry, kinds, idempotency, surface and button checks, switching shopper

**Files:**
- Create: `backend/packages/agent/src/obsidian_agent/catalog/actions.json`, `obsidian_agent/actions.py`
- Modify: `obsidian_agent/app.py`
- Test: `backend/packages/agent/tests/test_actions.py` (new; move the action tests out of `test_api.py` into it)

**Interfaces:**
- `actions.json`, one entry per action, `kind` one of `local | direct | agent`; direct actions list their allowed sources, a catalog component type or `shell:<id>`:
  ```json
  {
    "openCart": { "kind": "local" },
    "cart.add": { "kind": "direct", "sources": ["AddToCartButton"] },
    "cart.set_qty": { "kind": "direct", "sources": ["shell:cart-drawer"] },
    "cart.remove": { "kind": "direct", "sources": ["shell:cart-drawer"] },
    "session.switch_user": { "kind": "direct", "sources": ["shell:user-menu"] }
  }
  ```
- Produces in `actions.py`: `ACTIONS: dict[str, ActionSpec]` loaded from the file (`ActionSpec(kind, sources)`), `SHELL_SURFACE = "shell"`, and `check_source(spec, *, surface_id, source_id, context, open_tabs: list[TabRecord]) -> str | None` (the error message, or `None` when allowed). Rules: a `shell` surface passes only if `f"shell:{source_id}"` is in `sources`; otherwise the surface must be the `surface_id` of one of the user's open tabs, the source a component on that tab's snapshot whose type is in `sources`, and when that component has a `productId` it must equal `context["productId"]`.
- `POST /api/actions` order: unknown name → `invalid`; kind not `direct` → `invalid` ("{name} is a {kind} action; it does not go to the server."); no string `requestId` in `context` → `invalid`; a stored result for this `requestId` and this user within 24 h → returned as it was (another user's → `invalid`); `check_source` fails → `invalid`; else run the handler and `save_action_result`. Rejections before the handler are not stored.
- `session.switch_user{userId}`: an unknown user → `not_found` ("That shopper doesn't exist."); else `{ok: true, user: {...}, cart: [the new user's cart]}` and the response sets the new signed cookie (also when the result is replayed).
- Error copy: `out_of_stock` and `not_found` as today; `invalid` messages as above.

- [ ] **Step 1: Write the failing tests** in `test_actions.py`:
  - `test_local_action_is_rejected`: `openCart` → `invalid`, cart unchanged.
  - `test_missing_request_id_is_rejected`.
  - `test_repeated_request_id_returns_the_first_result`: add with `requestId r1` → qty 1; a second add, `r2` → qty 2; `r1` again → the first body (qty 1) and the stored cart still holds 2.
  - `test_request_id_of_another_shopper_is_rejected`.
  - `test_surface_must_be_an_open_tab_of_this_shopper`: `ana` sends `cart.add` with `demo-user`'s surface → `invalid`.
  - `test_source_must_be_an_add_button_on_that_page`: `sourceComponentId "shelf"` → `invalid`; `verdict_button` with another `productId` in `context` → `invalid`; `verdict_button` with its own product → `ok`.
  - `test_shell_source_only_for_shell_actions`: `cart.add` from `shell`/`cart-drawer` → `invalid`; `cart.set_qty` from `shell`/`cart-drawer` → allowed.
  - `test_switch_user_sets_the_cookie`: switch to `ana` → `ok`, `user.id == "ana"`, a `Set-Cookie: obsidian_session=ana.…`; `/api/session` then answers `ana`; switching to `ghost` → `not_found`.
  - Existing cart action tests move here and send a `requestId` and a real button or shell source.
- [ ] **Step 2: Run** `uv run --directory backend pytest packages/agent/tests/test_actions.py -q --no-cov` → FAIL.
- [ ] **Step 3: Implement** `actions.json` (shipped in the wheel with `shop.json`), `actions.py` and the endpoint's checks and handlers.
- [ ] **Step 4: Run** `uv run --directory backend pytest packages/agent -q --no-cov` → PASS.
- [ ] **Step 5: Commit** `feat(agent): one checked, idempotent path for every direct action`.

### Task 8: The web: request IDs, the registry test, and the shopper menu

**Files:**
- Modify: `web/src/lib/actions.ts` (`requestId`; the result's optional `user`), `web/src/lib/cart.ts` (unchanged shell source), `web/src/App.tsx` (the user cell and menu in the ledger)
- Create: `web/src/lib/session.ts`, `web/src/shell/UserMenu.tsx`, `web/src/lib/actions.test.ts`
- Modify: `web/src/styles/shell.css` (the user cell and menu, ported from `mockup/css/chrome.css` `.cell-user` and `mockup/css/overlays.css` `.menu`)

**Interfaces:**
- Consumes: `actions.json` (imported like `shop.json` in `catalog.test.tsx`), `GET /api/session`, `GET /api/users`, `session.switch_user` (Task 7).
- Produces in `lib/actions.ts`: `DISPATCHED_ACTIONS = ["cart.add", "cart.set_qty", "cart.remove", "session.switch_user"] as const`; `dispatchAction` adds `requestId: crypto.randomUUID()` to `context` (one per call, so one per click).
- Produces in `lib/session.ts`: `readSession(): Promise<User>`, `readUsers(): Promise<User[]>` (zod-parsed), `switchUser(userId: string): Promise<ActionResult>` (`surfaceId "shell"`, `sourceComponentId "user-menu"`).
- `UserMenu`: the ledger's last cell, as in the mockup (`cell cell-user`, the shopper's initial and name, a chevron, `aria-haspopup="menu"`, `aria-expanded`); the menu (`role="menu"`) has a head with the shopper's name, then one `menuitemradio` per seeded shopper (`aria-checked` on the current one); arrow keys, Home, End and Esc as in `mockup/js/core.js`; picking another shopper calls `switchUser` and then `window.location.reload()`; a failed switch shows the error toast and keeps the menu.

- [ ] **Step 1: Write the failing tests:**
  - `actions.test.ts`: every entry in `actions.json` has exactly one `kind` from `local | direct | agent`; every name in `DISPATCHED_ACTIONS` is a `direct` entry; `dispatchAction` sends a `requestId` UUID and two calls send two different ones (mocked `fetch`).
  - In `App.test.tsx`: with `/api/session` (`demo-user`) and `/api/users` mocked, the user cell reads "Javier"; opening it lists Ana, Javier and Sam with Javier checked; choosing Ana posts `session.switch_user` with `userId "ana"` from `shell`/`user-menu` and then reloads (`window.location.reload` stubbed).
- [ ] **Step 2: Run** `pnpm --dir web exec vitest run src/lib/actions.test.ts src/App.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the request ID, `session.ts`, `UserMenu` and its styles (reuse the mockup's visuals and motion; use the impeccable skill's guidance for the menu's states).
- [ ] **Step 4: Run** `pnpm --dir web test` and `pnpm --dir web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): send a request ID with every action; switch shoppers from the user menu`.

### Task 9: Docs, the snapshot size answer, every check once

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-product-spec-design.md` §15 (the measured size of the build fixture's page and of the page after the edit fixture, in KB, from `json.dumps(snapshot, separators=(",", ":"))`; the 256 KB limit confirmed or changed), §10.4 (`GET /api/workspace` keeps `{tab, cart}` until slice 5)
- Modify: `docs/ARCHITECTURE.md` (the store package and its contract; the session; the action path and its registry; the package table), `README.md` "Run the demo" (Docker, `OBSIDIAN_DATABASE_URL`, `OBSIDIAN_SESSION_KEY`; what survives a restart), `CHANGELOG.md`, `ROADMAP.md` and the slices plan (slice 2 status), and issue #15's checkboxes.

- [ ] **Step 1: Measure** the two fixture pages' sizes (a short script or a test print), and edit the documents.
- [ ] **Step 2: Run every check once**, with `docker compose up -d --wait postgres` and `OBSIDIAN_TEST_DATABASE_URL` set: `python scripts/check.py backend web` → exits 0, and the output shows `TestPostgresStore` ran (not skipped).
- [ ] **Step 3: Commit** `docs: record the store, the session and the action path`.
- [ ] **Step 4: Hand the user the by-eye checklist** (no live model call without asking): set `OBSIDIAN_DATABASE_URL` and `OBSIDIAN_SESSION_KEY` in `.env`; `python scripts/dev.py` starts Postgres and both servers; the user cell reads "Javier"; with a live run (ask first) build the comparison and add to cart; stop and restart `dev.py`, reload: the tab, its page and the cart are back; switch to Ana: an empty workspace and cart; back to Javier: his page and cart. Without a live run, the cart and the shopper switch can be checked on their own.
