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

### Changed

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
