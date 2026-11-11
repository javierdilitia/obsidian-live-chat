# Sub-project 0 — Repo foundation: design

**Date:** 2026-11-11 · **Status:** approved in conversation, awaiting written-spec review
**Branch:** `chore/repo-foundation`

## 1. Why

The repo today is a static mockup plus research notes. Before any product code, it needs the structure, checks and documents that every later sub-project builds on. This sub-project ships no product features. It ends with an empty but real skeleton where every check runs on every PR.

### The whole programme (for context)

| # | Sub-project | Depends on |
|---|---|---|
| **0** | **Repo foundation (this spec)** | — |
| 1 | Product spec: tabs as surfaces + agent tab tools, component catalog, action catalog, data contract, persistence, surface uses beyond tabs | 0 |
| 2 | A2UI PoC (A2UI-DECISION §10) with token/latency telemetry built in; full fake dataset | 0, runs alongside 1 |
| 3 | Build: React port (shell, catalog components, motion), Python backend (SSE, router, UI agent, Foundry client, action handler, validate-and-retry), commerce services | 1, 2 |
| 4 | Analytics and observability: dashboards for cost, latency, validity, blank-screen rate, cache hits | 2, 3 |
| 5 | CD to Azure, environments; then subagents (refunds, support) | 3 |

### Decisions already made (2026-11-11)
- Generative-UI layer: **A2UI v1.0** with our own catalog (see `docs/research/A2UI-DECISION.md`).
- **Backend in Python.** Reasons: `a2ui-agent-sdk` is more mature than `@a2ui/agent` 0.1.0; macros (server-side expansion, e.g. `ProductCard(id)`) exist only in Python; A2UI's eval framework is Python (Inspect AI); Microsoft Agent Framework supports Python; the teammate's data agent is most likely Python too.
- **Models:** Azure AI Foundry. The user is creating two deployments: a small fast model (routing) and a top-tier model (UI generation). Needed before sub-project 2, not here.
- **Fake data module** stands in for the teammate's SQL agent, behind an interface that the real code will implement later.

## 2. Scope

**In:** folder layout and the mockup move; docs cleanup; repo documents; Python and web skeletons; the data contract package; a minimal fake data package proving the contract; lint/format/type/test tooling; git hooks; CI; dependency updates; the A2UI skill and a pinned docs snapshot.

**Out (later sub-projects):** any A2UI code, any model call, the full ~50-product dataset (sub-project 2), React port of the mockup, deployment, analytics, auth, persistence.

## 3. Folder layout

```
mockup/                     the current static mockup, moved unchanged (index.html, css/, js/, fonts/)
web/                        React 19.2 + Vite + TypeScript; one placeholder page and one test
backend/                    uv workspace, Python 3.12
  pyproject.toml            workspace root: shared pyright / pytest config (ruff config is the root ruff.toml)
  packages/
    data_contract/          halden_data_contract — interface + Pydantic models, no I/O
    data_fake/              halden_data_fake — implements the contract from JSON seed files
    agent/                  halden_agent — FastAPI app with GET /health only
scripts/                    check.py — the single definition of every check; git hooks and CI both call it
docs/
  ARCHITECTURE.md           the A2UI decision distilled + the app's ideas (what we will really use)
  research/                 FRAMEWORKS-STUDY.md, OPENUI-STUDY.md, copilotkit-research.md, A2UI-DECISION.md
  superpowers/specs/        design specs (this file)
.claude/skills/a2ui/        SKILL.md (official, upstream commit recorded) + references/llms-full.txt
.github/                    workflows/ci.yml, dependabot.yml, pull_request_template.md
README.md  ROADMAP.md  CHANGELOG.md  CONTRIBUTING.md  PRODUCT.md  DESIGN.md
.editorconfig  .gitattributes  .gitignore  .pre-commit-config.yaml  .gitleaks.toml  .env.example  .nvmrc  ruff.toml
```

- The mockup moves with `git mv` so its history follows. It is plain relative-path static files, so it keeps opening by double-click from `mockup/index.html`.
- `PRODUCT.md` and `DESIGN.md` stay at the root (the design tooling expects them there). `DESIGN.md` is unchanged. `PRODUCT.md` is rewritten: it currently says "mockup only, no backend", which is no longer true.
- `research/` (root) is removed once its file moves to `docs/research/`.
- `downloads/` and `.impeccable/` stay gitignored and untouched.

## 4. Data contract and fake data

The rest of the backend imports only `halden_data_contract`. Swapping the fake for the teammate's code means writing one new package that implements the same interface; nothing else changes.

### 4.1 Interface (`halden_data_contract`)

An async `typing.Protocol` named `CatalogSource` (async because the real implementation does I/O):

| Method | Returns | Notes |
|---|---|---|
| `list_categories()` | `list[Category]` | |
| `search_products(query: ProductQuery)` | `list[ProductSummary]` | `ProductQuery`: optional `text`, `category`, `max_price_cents`, `attributes: dict[str, str]`, `limit` (default 20, max 50) |
| `get_product(product_id: str)` | `Product` | raises `NotFoundError` |
| `get_products(product_ids: list[str])` | `list[Product]` | same order as input; raises `NotFoundError` naming the missing ids |
| `get_orders(user_id: str)` | `list[OrderSummary]` | newest first |
| `get_order(order_id: str)` | `Order` | raises `NotFoundError` |
| `get_order_status(order_id: str)` | `OrderTracking` | steps with dates, current step, carrier, tracking number |

The interface is **read-only**. Cart, saved-for-later, checkout and refunds are our own commerce services (sub-project 3), not the data agent's job.

### 4.2 Data shapes (Pydantic v2, frozen)
- **IDs are stable slugs** (`aeris-studio-16`, `OB-89027`). Components and saved tabs store IDs, never values.
- **Money is integer cents plus a currency code** (`price_cents: int`, `was_price_cents: int | None`, `currency: Literal["EUR"]`). Never floats.
- `Product`: id, name, category id, price fields, rating, review count, stock count, `specs: dict[str, SpecValue]` (value + unit + display string), `look: RenderLook`.
- `RenderLook`: the fields the existing SVG renders use: `glyph` (laptop / monitor / buds / keys / ssd / dock), `finish` (silver, graphite, midnight, starlight, sage, white), optional `screen` (dusk, sea, night, dawn). Chart series colours are **not** product data; the UI assigns them by position.
- `ProductSummary`: the subset needed for lists (id, name, category, price fields, rating, stock, look).
- `Order`, `OrderSummary`, `OrderTracking`: ids, dates (ISO), line items (product id, name, qty, unit price cents), status enum, tracking steps.
- `NotFoundError(kind, ids)` is the only error type in the contract.

### 4.3 Fake (`halden_data_fake`)
- `FakeCatalogSource` implements `CatalogSource` from JSON seed files in the package (`seed/products.json`, `seed/categories.json`, `seed/orders.json`).
- **In this sub-project the seed holds exactly what the mockup has today** (the 6 laptops, the picks, sale items, 6 categories, 3 orders), converted to the new shapes. Extending to ~50 products is the first task of sub-project 2.
- Search is deterministic: filter, then sort by rating then id. No randomness, so tests and PoC runs repeat exactly.

### 4.4 Contract tests
A reusable pytest suite in `halden_data_contract` (`contract_tests.py`) checks any `CatalogSource`: ids round-trip, `get_products` keeps order, `NotFoundError` on unknown ids, `limit` honoured, money fields are ints, every product has a valid `look`. The fake runs it in CI. The teammate's adapter will run the same suite later, which is how we know it's a drop-in replacement.

## 5. Tooling

| Area | Python (`backend/`) | Web (`web/`) |
|---|---|---|
| Runtime | Python 3.12, uv workspace | Node 22 (`.nvmrc`), pnpm |
| Format | `ruff format` | Prettier |
| Lint | `ruff check` (rules: E, F, I, B, UP, S, SIM, RUF) | ESLint flat config, typescript-eslint strict, react-hooks |
| Types | pyright, strict mode | `tsc --noEmit`, `strict: true` |
| Tests | pytest + pytest-asyncio + coverage (fail under 80% for `data_contract`/`data_fake`) | Vitest |
| Build | `uv build` per package | `vite build` |

- **Ruff config** lives in a root `ruff.toml` (not `backend/pyproject.toml`), so `scripts/check.py` is linted by the same rules.
- **Dependency pinning:** `uv.lock` and `pnpm-lock.yaml` committed. When A2UI packages arrive (sub-project 2) they are pinned to exact versions, never ranges, because A2UI still ships breaking changes (one landed 2026-11-11).
- No browser-driven (Playwright/Chromium) tests for now, per the user's no-screenshot rule. Revisit when the React port exists.
- `.gitattributes`: `* text=auto eol=lf`, so Windows and CI agree on line endings; binaries (`*.woff2`, `*.png`, `*.zip`) marked binary.
- `.editorconfig`: UTF-8, LF, 2 spaces (web/markdown), 4 spaces (Python).
- `.env.example` lists the variables later sub-projects need, with empty values: `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_API_KEY`, `MODEL_ROUTER_DEPLOYMENT`, `MODEL_UI_DEPLOYMENT`. `.env` is gitignored.

## 6. Git hooks (`pre-commit` framework)

| Stage | Hooks |
|---|---|
| `pre-commit` | trailing whitespace, end-of-file, check-yaml/json/toml, large-file guard (500 KB), ruff format + check, Prettier + ESLint on staged web files, **gitleaks** secret scan |
| `commit-msg` | Conventional Commits check (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`; `!` for breaking) |
| `pre-push` | pyright, pytest, `tsc --noEmit`, Vitest |

gitleaks (hook and CI) reads `.gitleaks.toml`: the default rules plus one that flags any real-looking value assigned to a `*_API_KEY` variable. Added during the build, because the default generic rule's entropy threshold let some 32-character hex keys (the classic Azure key shape) through.

`pre-commit` is a dev dependency of the backend workspace. One setup command after cloning, run from the repo root (`uv run --project backend pre-commit install --install-hooks -t pre-commit -t commit-msg -t pre-push`), documented in CONTRIBUTING.md. CI runs the same checks, so skipping hooks locally (`--no-verify`) can't get past PR review.

## 7. CI (GitHub Actions)

`ci.yml`, on every pull request and on pushes to `main`. Four jobs, each a required status check:

| Job | Steps |
|---|---|
| `backend` | setup uv + Python 3.12 (cached) → `uv sync --locked` → ruff format --check → ruff check → pyright → pytest with coverage |
| `web` | setup pnpm + Node 22 (cached) → `pnpm install --frozen-lockfile` → prettier --check → eslint → tsc → vitest → vite build |
| `secrets` | gitleaks over the PR's commits |
| `commits` | Conventional Commits check on PR commit messages |

- Concurrency group per branch cancels superseded runs.
- Permissions: `contents: read` only.
- **Dependabot** (`dependabot.yml`): weekly, grouped per ecosystem (`uv`, `npm`, `github-actions`).
- **Branch protection (user, GitHub settings):** require PRs into `main`; after the first CI run, add the four jobs above as required status checks.

## 8. Repo documents

| File | Content |
|---|---|
| `README.md` | What Halden/Obsidian is (one paragraph), current status, folder map, quickstart (open the mockup; `uv sync`; `pnpm install`; hooks setup), links to ROADMAP / ARCHITECTURE / CONTRIBUTING |
| `ROADMAP.md` | Sub-projects 0–5 as milestones, each with goal, exit criteria, status; PoC questions from A2UI-DECISION §10 listed under milestone 2 |
| `CHANGELOG.md` | Keep a Changelog + SemVer 0.x. `[Unreleased]` for this work; `[0.1.0] – 2026-11-10` backfilled from git history: the mockup, then the framework research and A2UI decision |
| `CONTRIBUTING.md` | Branch naming (`feat/`, `fix/`, `chore/`, `docs/`), Conventional Commits, hooks setup, running checks locally, PR checklist, "update CHANGELOG under Unreleased" rule |
| `.github/pull_request_template.md` | Summary, linked roadmap milestone, checks run, CHANGELOG updated (y/n) |
| `docs/ARCHITECTURE.md` | The one doc of "what we will really use": the no-transcript paradigm, tabs as A2UI surfaces, the three action kinds (local / direct / agent), IDs-not-values, tab cards, transport (AG-UI-shaped SSE), data contract boundary, Python backend, risks to watch. Points to `docs/research/` for the why |
| `PRODUCT.md` | Rewritten for the product: users, purpose, principles. Mockup-only constraints removed |

## 9. A2UI skill and docs snapshot

- `.claude/skills/a2ui/SKILL.md`: the official skill from `a2ui-project/a2ui` (`skills/a2ui/SKILL.md`), already downloaded, upstream commit `24d1bf9` recorded in `UPSTREAM_COMMIT`.
- Add `.claude/skills/a2ui/references/llms-full.txt`: the full A2UI docs, so the agent reads docs that match our version instead of the live site. Add a line to SKILL.md pointing to it. Refreshed only on deliberate A2UI upgrades.
- *Deviation (decided while planning):* the repo has no single-file docs export, so the snapshot comes from the docs site, `https://a2ui.org/llms-full.txt`, fetched the same day as the skill's commit. `references/SOURCE.md` records the URL, fetch date, size and SHA-256 instead of a commit.

## 10. How we know it's done

1. `mockup/index.html` opens and works exactly as before.
2. A fresh clone runs `uv sync`, `pnpm install`, the hooks install and all checks locally with no errors.
3. A commit with a bad message, an unformatted file, or a fake API key is rejected by the hooks.
4. The PR for this branch has all four CI jobs green.
5. `FakeCatalogSource` passes the contract test suite.
6. README quickstart works as written.
7. The root holds only: the docs listed in §8, `PRODUCT.md`, `DESIGN.md`, config files (including `ruff.toml` and `.gitleaks.toml`), and the `mockup/`, `web/`, `backend/`, `scripts/`, `docs/`, `.claude/`, `.github/` folders.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Windows vs CI differences (paths, line endings) | `.gitattributes` LF, CI runs on ubuntu; hooks tested on this Windows machine |
| Hooks too slow, so people skip them | Heavy checks (types, tests) on pre-push only; commit stage stays fast |
| The contract guesses wrong about the teammate's data | Contract is v0, read-only and small; reviewed with the teammate during sub-project 1 before anything depends on it beyond the fake |
