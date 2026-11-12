# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x, minor versions may contain breaking changes.

## [Unreleased]

### Added

- Repo layout for the product: `web/`, `backend/`, `scripts/`, `docs/`, `.github/`, plus `.editorconfig`, `.gitattributes` (LF everywhere), `.nvmrc` and `.env.example`.
- `halden_data_contract`: the read-only `CatalogSource` interface, frozen Pydantic models (money as integer cents) and a reusable contract test suite.
- `halden_data_fake`: `FakeCatalogSource` built from JSON seed files converted from the mockup (13 products, 6 categories, 3 orders); passes the contract suite.
- `halden_agent`: FastAPI skeleton with `GET /health`.
- `web/`: Vite + React 19.2 + TypeScript placeholder page with ESLint, Prettier and Vitest.
- `scripts/check.py`: one definition of every check, shared by git hooks and CI.
- Git hooks via pre-commit: whitespace, YAML/JSON/TOML, large files, ruff, Prettier + ESLint, gitleaks (with a rule for model API keys), Conventional Commits; pyright, pytest, tsc and Vitest on pre-push.
- CI on GitHub Actions (`backend`, `web`, `secrets`, `commits` jobs), Dependabot and a PR template.
- Documents: README, ROADMAP, CHANGELOG, CONTRIBUTING and `docs/ARCHITECTURE.md`.
- A2UI skill for Claude Code with a pinned snapshot of the A2UI docs.
- Product spec (`docs/superpowers/specs/2026-11-11-product-spec-design.md`): tab tools and tab cards, persisted tabs and shopper history, the home and For-you surfaces, the `halden.shop` component catalog, the action catalog, persistence, and the data contract review for the data-agent teammate.
- First working demo (milestone 2, plan `docs/superpowers/plans/2026-11-11-first-demo.md`): you type a command, a tab opens and the Azure model builds a laptop comparison as an A2UI page; the next command edits that page in place, mounting only what changed; "Add to cart" posts to the server, which reads the price itself. The pieces:
  - `halden_data_fake`: the seed catalog grows to 50 products.
  - `halden_agent`: the Azure model client, the `halden.shop` A2UI catalog and adapter, the page validator (unknown products, unnamed sections, misaimed buttons, text limits; one retry), and `POST /api/runs` (a build or edit streamed over SSE), `GET /api/catalog/products` and `POST /api/actions` (`cart.add`).
  - `web/`: the shop catalog components in the mockup's look and motion, and the demo shell from the mockup's chrome: the command bar with its state field ("Building comparison…", "Updating this page…", "Built · just now", or the error), one tab with a loading ring, the agent's seam, the cart count in the shell bar, toasts and the one disclaimer. Vite proxies `/api` to the agent; `?probe` shows mount counts.
  - Reload restore: `GET /api/workspace` brings back the tab, its page and the cart after a browser reload, with no build animation; each run is bounded at 150 s.
  - The mockup's motion grammar: the breathing landing globe, the thinking globe, dots that land on the page outline, the seam fill, and on follow-ups the step-back, the new section's room, a scroll to the change and a glow you can see.
  - The cart drawer (`cart.set_qty`, `cart.remove`, `GET /api/cart`): lines with steppers and remove, the total, "In cart · View" on every buy button, fly-to-cart and the cart value roll.

- `scripts/dev.py`: starts the agent and the web dev server together from one command; Ctrl+C stops both, and if one exits the other is stopped too.

- Data contract rules we own (spec §11.1), each with contract tests: `ProductQuery` trims and lowercases `category`, trims attributes, drops blank values and rejects blank keys; search text matches every word against the name, category ID, category name and spec displays; a cancelled order's steps are all done and end with a terminal `Cancelled` step; `ProductQuery.sort` (`rating`, `price_asc`, `price_desc`), applied before the limit. `FakeCatalogSource` implements them.
- ROADMAP milestone H, the Haier cartridge: after milestone 3, an adapter connects the teammate's SQL agent for retrieval only; the Haier intake opens it. Milestone 3 is built cartridge-ready.
- Product spec approved (milestone 1 done), with the first demo's results and feedback added: 5 or more products open an explore page (it pages or scrolls sideways when full); new sections go where they fit on an edit; stricter page checks (numeric chart specs, known table specs, no repeated products); actions check their surface and button; the search tool offers multi-word text and sorting. The finished specs and plans in `docs/superpowers/` are marked done and kept as history.
- Milestone 3 plan (`docs/superpowers/plans/2026-11-12-milestone-3-slices.md`): eight slices in build order, each with its goal, spec sections, dependencies and exit criteria; a coverage table that puts every spec feature and every "Inputs for milestone 3" item in one slice; and the open questions for the user. Slice 1 (cartridge boundary and page fixes) has its task plan (`2026-11-12-slice-1-cartridge-boundary.md`). ROADMAP milestone 3 points to both. Issue #8 (layout adapts to the request) goes to slice 4: five or more products open an explore page whose grid pages, and product components that scroll sideways are not tied to 2–4 products (recorded in spec §2.1).

- Slice 2's task plan (`docs/superpowers/plans/2026-11-12-slice-2-store-session-actions.md`): the store package, the session, the checked action path. The spec records decision D on issue #7 (each saved page keeps its products' price and stock, `product_facts`, so a reopened page can say when they changed) and the rule for shell buttons (`surfaceId "shell"`).
- The roadmap on GitHub: one GitHub milestone per ROADMAP milestone, and milestone 3's slices as issues labelled `slice` (#14–#21); ROADMAP.md and the slices plan link to them.
- Cartridge loading (milestone 3, slice 1, plan `docs/superpowers/plans/2026-11-12-slice-1-cartridge-boundary.md`): the `Cartridge` descriptor in the contract; Halden registers itself under the `obsidian.cartridges` entry point and the agent loads the one `OBSIDIAN_CARTRIDGE` names, or the only one installed, failing at start with the installed IDs otherwise; `GET /health` reports it. On the web, `web/src/cartridges/halden/` holds the store name, the disclaimer, the spec glossary (`specs.en.json`) and the product renders, picked by `VITE_OBSIDIAN_CARTRIDGE`.
- Store, session and the checked action path (milestone 3, slice 2, plan `docs/superpowers/plans/2026-11-12-slice-2-store-session-actions.md`):
  - `obsidian_store`: the async `Store` protocol, `MemoryStore`, `PostgresStore` (SQLAlchemy 2 async + asyncpg, Alembic migration for users, workspaces, tabs, tab revisions, cart lines, runs and processed actions) and the reusable `StoreContract` suite, run against both. Postgres 17 through `compose.yaml` locally and as a CI service container; `scripts/dev.py` starts it when `OBSIDIAN_DATABASE_URL` is set. Without the setting the agent keeps everything in memory.
  - Each shopper's tab, its page and their cart live in the store and survive a restart. A run saves the page's `product_facts` (price and stock per product) and a revision (the last 20 kept); every run writes a `runs` row; a page over 256 KB fails validation.
  - The session: a signed `obsidian_session` cookie names the shopper; three seeded shoppers (`demo-user` Javier, `ana` Ana, `sam` Sam); `GET /api/session`, `GET /api/users`; the user menu in the shell bar switches shopper (`session.switch_user`) and reloads.
  - One checked, idempotent path for direct actions: the registry `catalog/actions.json` (shared with the web), the kind check, a `requestId` per click (a repeat returns the first answer), and the surface and source checks; shell buttons send `surfaceId "shell"`. Two quick adds can no longer take the last item twice.
  - Spec §15: a comparison's stored page is about 1.5–2 KB; the 256 KB limit stays.
- Language: English and Spanish (milestone 3, slice 3, plan `docs/superpowers/plans/2026-11-12-slice-3-language.md`):
  - A language menu, the first cell of the shell bar (`EN · €`), sends `prefs.set_language` through the checked action path and switches the shell and the open page at once, without a reload. It shares one `LedgerMenu` component with the user menu.
  - `web/src/i18n/`: the EN and ES bundles (Spain's Spanish, *tú*, "cesta"), plurals, `Intl` money, counts, ratings and dates per language (`1.899 €` in Spanish), and the `I18nProvider`. Every fixed string of the shell and the catalog components comes from them; a test fails when the two bundles disagree.
  - Halden's glossary and disclaimer in Spanish (`specs.es.json`); which way is better moved to the cartridge's `index.ts`.
  - The store keeps each shopper's language (`users.language`; seeding no longer resets it) and stamps each saved tab with the language its run wrote in. `ana` starts in Spanish; the language is read before the first render.
  - A run writes in the shopper's language; an edit to a page written in another language rewrites every section in the new one (one retry if the model leaves a section out). A switch makes no model call.
  - The server sends codes and the web words them: run errors and action refusals show the bundle's line, in the shopper's language; `out_of_stock` says why (`error.params`: sold out, all in your cart, only N).
- Guard tests for the cartridge boundary: core Python imports no cartridge and `obsidian-agent` depends on none; the page prompt, catalog and tool descriptions name no Halden data; no core web file imports a cartridge folder or names its store or disclaimer.

### Changed

- The page agent's `search_products` tool takes several words and a `sort` (`rating`, `price_asc`, `price_desc`), and lists the cartridge's categories.
- The page validator also rejects a section outside `Page.children`, a `BarChart` outside a `ChartGrid`, a chart on a spec that is not a number, a table row none of its products has, and a product named twice in one component; the feedback lists the keys that would work.
- The page prompt says where a new section goes (after the section it extends, never last by default) and to change an existing section rather than add a second one; its examples no longer name Halden data.
- `obsidian-agent` no longer depends on `halden-data-fake`; the browser tab's title comes from the cartridge (`index.html` says "Obsidian").
- The concept mockup moved to `mockup/`, unchanged.
- Research documents moved to `docs/research/`.
- `PRODUCT.md` rewritten for the product (real models and backend) instead of the mockup.
- Docs reframed around Obsidian as the product: a client- and domain-agnostic framework, with Halden as its first cartridge (fictional store, dev dataset) and Haier as the next (real data, final demo). Covers README, `PRODUCT.md`, `docs/ARCHITECTURE.md` (core vs cartridge, known cartridge seams), ROADMAP and the product spec.
- Product spec §11 split into the contract decisions we own (A, B, C, F: decided, to be encoded with tests before milestone 3) and the Haier intake questions (D, E, G, H, I, J); milestone 1's exit criterion follows. The catalog names become `obsidian.shop` and `obsidian.support`.
- Core identifiers renamed from Halden to Obsidian: `obsidian_data_contract` (`obsidian-data-contract`), `obsidian_agent` (`obsidian-agent`), `obsidian-web`, the live-test switch `OBSIDIAN_LIVE`, the A2UI catalog ID `https://obsidian.example/catalogs/shop/v1/catalog.json` (backend and web fixtures regenerated), the gitleaks rule `obsidian-model-api-key`, and the spec's planned `obsidian_store` and `obsidian_session` cookie. The page prompt no longer names the store. `halden_data_fake` keeps its name: it is the Halden cartridge's data.

## [0.1.0] – 2026-11-10

### Added

- Halden concept mockup: a static shop with the Obsidian shopping assistant, no chat transcript, scripted demo (2026-11-10).
- Generative-UI framework research and the A2UI decision: `FRAMEWORKS-STUDY.md`, `OPENUI-STUDY.md`, `copilotkit-research.md`, `A2UI-DECISION.md` (2026-11-11).
