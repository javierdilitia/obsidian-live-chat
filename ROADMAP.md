# Roadmap

Six milestones. Each one ends with its spec or plan committed under `docs/superpowers/`, and the next one starts from those files.

| # | Milestone | Depends on | Status |
|---|---|---|---|
| 0 | Repo foundation | — | done |
| 1 | Product spec | 0 | in progress |
| 2 | First working demo | 0 (runs alongside 1) | planned |
| 3 | Build, slice by slice | 1, 2 | planned |
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

## 2 — First working demo

**Status:** planned — plan in `docs/superpowers/plans/2026-11-11-first-demo.md`

**Goal:** the first slice of the real build, in the real packages (it stays). Instead of a separate measured PoC, we learn whether A2UI holds up by building on it. You type "Compare 3 laptops for video editing under €2,000", a tab opens and the Azure model builds the comparison with A2UI; "Add colour accuracy" edits it in place; "Add to cart" works with the price read on the server.

**Exit criteria:**
- The demo flow works end to end on our Azure deployment.
- An edit changes only what was asked, and the untouched parts don't remount or replay their animation (a test, plus a check by eye).
- The model never writes a price or an action; a page with an unknown product, an unnamed section or a misaimed button is rejected and retried once.
- The fake dataset has 50 products.

The detailed measurements once planned here (OpenUI comparison, 20-run accuracy, routing, consistency, grammar) are dropped. Each comes back only if building shows we need it.

## 3 — Build, slice by slice

**Status:** planned

**Goal:** the rest of the product spec, one slice at a time on top of the demo: several tabs and the router, saved tabs and history, the home page and For you, cart, checkout and orders, the language switch, the rest of the catalog.

**Exit criteria:** set per slice, each with its own plan.

## 4 — Analytics and observability

**Status:** planned

**Goal:** dashboards for cost, latency, validity, blank-screen rate and prompt-cache hits.

**Exit criteria:** to be set when milestone 3 is planned.

## 5 — CD to Azure, then subagents

**Status:** planned

**Goal:** continuous deployment to Azure with environments; then subagents for refunds and support, each with its own surfaces and catalog.

**Exit criteria:** to be set when milestone 3 is planned.
