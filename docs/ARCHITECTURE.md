# Architecture

What we will really build and use. The reasoning behind each choice lives in [`docs/research/`](research/); this page is the short version. Where they disagree, the latest spec under `docs/superpowers/specs/` wins.

Status: sub-project 0 (foundation). Nothing here is implemented yet except the data contract, the fake data source and empty web/agent skeletons.

## Paradigm

Obsidian, the agent-UI shopping framework, is **not a chatbot**. There is no transcript. It is demoed on the Halden cartridge, a fictional electronics store.

- A **command bar** at the top takes what the shopper asks.
- The answer is filed into **tabs** by the agent: it opens new tabs, edits the one you're on, switches between them and closes them. Each tab holds generated UI: comparisons, spec explainers, product pages, order history, tracking, support.
- Tabs are durable. A shopper can save one and come back to it later.
- Edits are the core interaction. A part of the page that an edit doesn't touch must not remount, so its animation doesn't replay.

```
Browser: command bar + tabs (each tab = one A2UI surface, rendered by OUR React components)
   ▲ SSE stream, AG-UI-shaped (RUN_* brackets, A2UI messages as payloads)
   │                                             ▼ button actions
Python backend (FastAPI)
 ├─ Router (small fast model): edit this tab / open new / switch / close; reads only tab cards
 ├─ UI agent (top-tier model): writes A2UI Express for one surface
 ├─ Action handler (plain code, no model): save, add to cart, buy, track
 ├─ Later: refund / support subagents with their own surfaces and catalogs
 └─ CatalogSource: the data contract (fake today, the teammate's data agent later)
```

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Generative-UI protocol | **A2UI v1.0** with **our own component catalog** | The model composes only components we registered |
| Model output format | **A2UI Express** | Compact, streams incrementally, edits by component ID |
| Backend | **Python 3.12**, FastAPI, uv workspace | `a2ui-agent-sdk` is the most mature agent SDK; macros (server-side expansion such as `ProductCard(id)`) and the eval framework are Python-only |
| Frontend | **React 19.2** + `@a2ui/react`, Vite, TypeScript | Our components, our styling, our motion |
| Models | **Azure AI Foundry**: a small fast model for routing, a top-tier model for UI generation | Deployments arrive before sub-project 2 |
| Data | `obsidian_data_contract` (interface) + `halden_data_fake` (JSON seed) | See [Data contract boundary](#data-contract-boundary) |

A2UI packages are pinned to **exact versions**, never ranges: the spec has broken three times in about a year.

## Tabs are surfaces

Each tab is one A2UI **surface** with its own `surfaceId` and data model.

| Tab action | A2UI message |
|---|---|
| Open a tab | `createSurface` |
| Edit a tab | `updateComponents` (only the IDs that change) or `updateDataModel` (data-only edits, e.g. order status) |
| Close a tab | `deleteSurface` |

- An Express block without a `root` compiles to `updateComponents` for an existing surface, touching only the IDs it names. A block of only `$path = value` lines becomes data-model updates.
- `updateComponents` replaces a component definition in full; it does not merge props.
- The React renderer keys children by component ID and memoizes them, so untouched components don't re-render or remount.

**Tab cards.** Every tab has a small card the router reads instead of the whole surface:

```yaml
id: tab-3
kind: compare
products: [aeris-studio-16, kore-zephyr-14, vela-prism-15]
filters: {use: video-editing, budget_eur: 2000, panel: oled}
last_change: "added colour accuracy section"
```

- The router reads only cards: cheap and cache-friendly.
- The UI agent loads the full surface only for the tab it's editing (A2UI's Express decompiler turns the surface back into Express for the model).
- **Saved tab = card + surface snapshot.** Restoring one costs no model calls.

Catalogs can differ per surface (`createSurface.catalogId`): shopping tabs use the shopping catalog, support tabs a support catalog. Each agent sees only its components, which keeps prompts small.

Surface IDs follow `<agent>:<uuid>`, and the backend enforces which agent may write which surface (A2UI has no formal ownership model).

## Three kinds of buttons

| Kind | Examples | Path | Model involved? |
|---|---|---|---|
| **Local** | open a modal, popover, spec tooltip | renderer function in the browser | No |
| **Direct** | save, add to cart, buy, track order | normal backend endpoint, deterministic code | **No** |
| **Agent** | ask for a refund, "explain this" | starts an agent run | Yes |

- An A2UI action reaches the backend as `{name, surfaceId, sourceComponentId, context}`, with data bindings resolved before sending.
- The model only **places** a button with an ID on it. It never sets a price or an amount.
- Buy and refund are always validated server-side: current price, stock, ownership, refund eligibility.
- Repeat clicks on direct buttons are instant and cost nothing.

## IDs, never values

Components take **IDs**, not values: `SpecTable(productIds, keys)`, `OrderTracker(orderId)`. Prices, specs, images and stock resolve from the catalog at render time.

- The model can't invent a price.
- A saved tab stays correct when prices change.
- IDs are stable slugs (`aeris-studio-16`, `OB-89027`).
- Money is integer cents plus a currency code (`price_cents`, `currency: "EUR"`), never floats.

## Data contract boundary

The rest of the backend imports only `obsidian_data_contract`. Nothing else knows where the data comes from.

**Obsidian core vs cartridge.**

- **Obsidian core** (reusable for any client): the shell, tabs, the A2UI renderer and catalog mechanisms, the motion grammar, the run pipeline, the store and the action mechanism. The data contract is core too: every cartridge implements it.
- **Cartridge** (one per client): the data itself, its data model and seed, and per-domain presentation config: brand, spec glossary, product renders, diagrams, category-pairing rules.
- **Halden** (`data_fake`, a JSON seed) is the first cartridge. **Haier** is the next: the data-agent teammate's real data behind an adapter that runs the same contract suite.

**Known cartridge seams (extract in milestone 3).** Halden presentation config still lives in core code; recorded here, not moved yet:

- the spec labels (the glossary) and which way is better per spec, in `web/src/a2ui/catalog.tsx`;
- the product renders, in `web/src/a2ui/renders.ts`;
- the "concept demo · fictional products" disclaimer (`web/src/a2ui/catalog.tsx` footer and `web/src/App.tsx`);
- the store wordmark in `web/src/App.tsx` and the page `<title>` in `web/index.html`.

```
backend/packages/
  data_contract/   obsidian_data_contract  CatalogSource protocol + Pydantic models + contract test suite
  data_fake/       halden_data_fake      FakeCatalogSource from JSON seed files
  agent/           obsidian_agent          FastAPI app (GET /health only, for now)
```

- `CatalogSource` is an async, **read-only** protocol: `list_categories`, `search_products`, `get_product`, `get_products`, `get_orders`, `get_order`, `get_order_status`. The only error is `NotFoundError(kind, ids)`.
- Cart, saved-for-later, checkout and refunds are **our** commerce services (sub-project 3), not the data agent's job.
- Models are frozen and reject unknown fields. Search matches every word of the text and is deterministic: rating descending by default, or price ascending/descending, ties by id.
- `obsidian_data_contract.contract_tests.CatalogSourceContract` is a reusable pytest suite. The fake runs it in CI. The teammate's adapter will run the same suite, which is how we know it's a drop-in replacement.
- The contract is v0. It gets reviewed with the data-agent teammate during sub-project 1, before anything beyond the fake depends on it.

## Transport

Our own SSE endpoint, **shaped like AG-UI** but without depending on its packages:

- `data: {"type": ...}` framing.
- `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` brackets around each run.
- A2UI messages as payloads.
- AG-UI's subagent event shapes (`SubagentStarted`, `SubagentFinished` with `success` | `suspended`) when subagents arrive.

Copying the shapes keeps a later move to full AG-UI mechanical. Microsoft Agent Framework speaks AG-UI natively, which keeps the Azure path open.

## Risks to watch

| Risk | What we do |
|---|---|
| **Version churn**: A2UI broke three times in ~12 months; packages are 0.x | Exact pins; A2UI sits behind one small adapter (parse + render). Upgrades are their own PR and refresh the skill's docs snapshot |
| **Silent truncation**: a reply cut off by the token limit looks like a short valid reply | Always check the model's stop reason; treat a length stop as a failure |
| **Blank-screen failures**: A2UI fails all-or-nothing more often than alternatives | Validate-and-retry with compiler errors fed back; keep the last good surface on screen; measure the blank rate |
| **No per-component delete** | Removing a section means rewriting the parent's child list; measure how accurate removal edits are |
| Output tokens and latency on GPT | Keep the catalog-derived system prompt fixed and first so Azure caches it; measure Express on our deployments |
| `@a2ui/agent` (TypeScript) is 0.1.0 | We use the Python SDK; fall back to direct JSON plus our own validation if needed |

## Where the reasoning lives

- [`research/A2UI-DECISION.md`](research/A2UI-DECISION.md): the decision, the verified source-code findings and the PoC plan.
- [`research/FRAMEWORKS-STUDY.md`](research/FRAMEWORKS-STUDY.md): the first survey of generative-UI frameworks.
- [`research/OPENUI-STUDY.md`](research/OPENUI-STUDY.md): the runner-up, studied in depth.
- [`research/copilotkit-research.md`](research/copilotkit-research.md): why CopilotKit was ruled out.
- [`superpowers/specs/`](superpowers/specs/): design specs per sub-project.
- [`../ROADMAP.md`](../ROADMAP.md): milestones and what each must prove.
