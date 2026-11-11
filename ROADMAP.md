# Roadmap

Six milestones. Each one ends with its spec or plan committed under `docs/superpowers/`, and the next one starts from those files.

| # | Milestone | Depends on | Status |
|---|---|---|---|
| 0 | Repo foundation | — | done |
| 1 | Product spec | 0 | in progress |
| 2 | A2UI PoC | 0 (runs alongside 1) | planned |
| 3 | Build | 1, 2 | planned |
| 4 | Analytics and observability | 2, 3 | planned |
| 5 | CD to Azure, then subagents | 3 | planned |

---

## 0 — Repo foundation

**Status:** done

**Goal:** turn the mockup repo into the product repo: layout, a Python data contract with a fake implementation, web and agent skeletons, quality tooling, git hooks, CI and the repo documents. No product features.

**Exit criteria:**
- `mockup/index.html` opens and works exactly as before.
- A fresh clone installs, sets up the hooks and passes every check locally.
- The hooks reject a bad commit message, an unformatted file and a fake API key.
- The PR has all four CI jobs green (`backend`, `web`, `secrets`, `commits`).
- `FakeCatalogSource` passes the contract test suite.

## 1 — Product spec

**Status:** in progress — spec in `docs/superpowers/specs/2026-11-11-product-spec-design.md`; data contract review pending

**Goal:** detail every idea into a real product: tabs as A2UI surfaces and the agent's tab tools (open, edit, create, switch, close), the component catalog with every field, the action catalog with each action's kind (local / direct / agent), the data contract, persistence, and other places surfaces fit besides tabs.

**Exit criteria:**
- A written spec covering catalog, actions, tab tools, tab cards, saved tabs and persistence.
- Review the data contract with the data-agent teammate; changes agreed and recorded.

## 2 — A2UI PoC

**Status:** planned

**Goal:** prove A2UI Express on our Azure Foundry models before building on it, with token and latency telemetry built in.

**Exit criteria:** answers, with numbers, to the ten PoC questions from [A2UI-DECISION §10](docs/research/A2UI-DECISION.md):
1. Output tokens and wall-clock time per build and per edit, prompt cached, compared against an OpenUI run of the same tasks.
2. Edit accuracy: "compare 3 laptops" → "add colour accuracy" → "only OLED" → "drop this one", 20 runs each; count wrong or extra changes, including the removal edit.
3. Mount test: inserting a section mid-page remounts nothing else and replays no other animation.
4. Blank-screen rate, and validation/repair behaviour with compiler errors fed back.
5. Multi-tab routing: with two tabs open, "make the second one OLED only" edits the right surface via tab cards.
6. Mock refund subagent: opens its own surface with a support catalog; an action from it round-trips to the backend.
7. Saved-tab restore: card + snapshot costs no model calls; "buy" from a tab saved yesterday re-reads the current price server-side.
8. Button safety: every generated button's action targets the product or order it displays.
9. Consistency: same request + same tab gives the same page across runs.
10. Optional: a Lark grammar from the catalog on GPT-5-series custom tools; does it cut invalid outputs?

Also: extend the fake dataset to ~50 products.

## 3 — Build

**Status:** planned

**Goal:** the real product. React port of the mockup (shell, catalog components, motion); Python backend (SSE transport, router, UI agent, Foundry client, action handler, validate-and-retry); commerce services (cart, saved items, checkout).

**Exit criteria:** to be set by milestone 1's spec and milestone 2's results. Likely several plans (web, backend, commerce).

## 4 — Analytics and observability

**Status:** planned

**Goal:** dashboards for cost, latency, validity, blank-screen rate and prompt-cache hits.

**Exit criteria:** to be set when milestone 3 is planned.

## 5 — CD to Azure, then subagents

**Status:** planned

**Goal:** continuous deployment to Azure with environments; then subagents for refunds and support, each with its own surfaces and catalog.

**Exit criteria:** to be set when milestone 3 is planned.
