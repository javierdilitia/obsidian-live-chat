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
| State | `obsidian_store`: Postgres 17 (SQLAlchemy 2 async + asyncpg, Alembic), or memory | See [The store and the session](#the-store-and-the-session) |

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

**The action path (slice 2).** `obsidian_agent/catalog/actions.json` is the one registry: every action has one kind (`local`, `direct`, `agent`), and each direct action lists who may send it, a catalog component type (`AddToCartButton`, or `ProductShelf`, whose items carry their own Add to cart) or a shell button (`shell:cart-drawer`, `shell:user-menu`). The server loads it (`obsidian_agent.actions`); the web imports the same file, and a web test checks every action it sends is `direct` there. `POST /api/actions` checks, in order: a known name; kind `direct`; a `requestId` in `context` (the web sends a new UUID per click); a stored answer for that ID from the last 24 h, returned as it was (another shopper's ID is rejected); the source. Shell buttons send `surfaceId: "shell"` and pass only for the `shell:<id>` the action lists; any other surface must be one of the shopper's open tabs, the source a component on that page whose type the action lists, and the product in `context` must be one the component acts on (its `productId`, or one of a shelf's items). Only then does the handler run, and its answer is stored. Rejections are `invalid` and are not stored. The cart changes are atomic in the store, so two quick adds never sell the last item twice.

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

**How a cartridge plugs in.** Core never imports a cartridge; it finds one by name, on each side.

- **Backend.** A cartridge package registers a `Cartridge` (from `obsidian_data_contract`: `id`, `name`, `make_source`) under the `obsidian.cartridges` entry point; Halden's is `halden = "halden_data_fake.cartridge:CARTRIDGE"`. At start, `obsidian_agent.cartridges.load_cartridge` imports only the chosen entry point: the one `OBSIDIAN_CARTRIDGE` names, or the only one installed. A missing or unknown choice, or a cartridge that fails to import, stops the start with a message naming the installed IDs; a broken cartridge never blocks another one. `GET /health` reports the cartridge's ID. The page agent's search tool lists the cartridge's categories, read from its data on the first run.
- **Web.** A cartridge is a folder `web/src/cartridges/<id>/` whose `index.ts` exports a `CartridgeUI`: the store name (wordmark and document title), the disclaimer in each language, the spec glossary in each language (`specs.en.json`, `specs.es.json`: a label per spec key), which way is better for numeric specs (`better`, in `index.ts`: not language) and, optionally, a product renderer. `web/src/cartridge.ts` finds the folders with `import.meta.glob` and picks one by `VITE_OBSIDIAN_CARTRIDGE` (optional while only one exists), with the same errors as the backend. A cartridge without renders shows empty plates.
- **One ID.** The cartridge's ID is its entry-point name, its web folder name and the value of both settings.
- **Guard tests.** `backend/packages/agent/tests/test_cartridges.py`: no module in `obsidian_agent` or `obsidian_data_contract` imports a cartridge package, and `obsidian-agent` does not depend on one. `test_prompt.py`: the page prompt, the catalog's descriptions and the tool descriptions name no Halden product, category or spec key. `web/src/boundary.test.ts`: no core web file imports from `cartridges/` or names the cartridge's store or disclaimer, in either language.

**Known seams left.**

- In the contract: `RenderLook` (glyph, finish, screen: Halden's drawing vocabulary) and `currency: Literal["EUR"]`. Both wait for the Haier intake (milestone H, intake question G).

```
backend/packages/
  data_contract/   obsidian_data_contract  CatalogSource protocol + Pydantic models + contract test suite
  data_fake/       halden_data_fake        FakeCatalogSource from JSON seed files; registers the `halden` cartridge
  store/           obsidian_store          Store protocol, MemoryStore, PostgresStore + migrations, StoreContract suite
  agent/           obsidian_agent          FastAPI app: runs over SSE, the session, the action path, catalog reads; loads the chosen cartridge
```

- `CatalogSource` is an async, **read-only** protocol: `list_categories`, `search_products`, `get_product`, `get_products`, `get_orders`, `get_order`, `get_order_status`. The only error is `NotFoundError(kind, ids)`.
- Cart, saved-for-later, checkout and refunds are **our** commerce services (sub-project 3), not the data agent's job.
- Models are frozen and reject unknown fields. Search matches every word of the text and is deterministic: rating descending by default, or price ascending/descending, ties by id.
- `obsidian_data_contract.contract_tests.CatalogSourceContract` is a reusable pytest suite. The fake runs it in CI. The teammate's adapter will run the same suite, which is how we know it's a drop-in replacement.
- The contract is v0. It gets reviewed with the data-agent teammate during sub-project 1, before anything beyond the fake depends on it.

## Language

The shopper reads English or Spanish (Spain's Spanish, *tú*; the cart is the *cesta*). Slice 3 built it.

- **Core copy in one place.** Every fixed string of the shell and of the catalog components lives in `web/src/i18n/en.json` and `es.json`: flat, one key per message, a plural message as a `.one`/`.other` pair (`Intl.PluralRules` picks the form; Spanish's `many` falls back to `other`), `{name}` placeholders. `i18n.test.ts` fails when a key, a placeholder or a plural form is in one bundle and not the other. A cartridge's own text (its glossary and disclaimer) lives in its folder, in both languages; a test checks every installed cartridge has both.
- **Formats.** `Intl` per language: English reads as `en-IE`, Spanish as `es-ES`. Money is whole euros without decimals, cents with two, grouping always on (`€1,899` / `1.899 €`, `€18.50` / `18,50 €`); counts and ratings likewise (`1.240`, `4,5`); dates `12 Nov` / `12 nov`.
- **One provider.** `I18nProvider` holds the language; every component reads `t`, `money`, `count`, `rating` and `date` through `useI18n()`. A switch re-renders in place: nothing mounts again. `main.tsx` reads the session's language before the first render, so a Spanish shopper never sees English first; `<html lang>` follows it.
- **The server sends codes, the web words them.** A run error is `RUN_ERROR {code, message}` and an action refusal `error {code, message, params?}`; `message` is English, for logs and the console. The web shows the bundle's line for the code (`out_of_stock` says why from `params.reason`: sold out, all in your cart, only N), and a generic line for a code it has no words for, never a key and never the server's English.
- **The language on users and tabs.** `users.language` is the shopper's, set by `prefs.set_language` (a direct action from `shell:language-menu`; the cookie stays), and seeding never resets it. A run writes in the shopper's language as it starts: the language goes in the run's input, never in the system prompt (prompt caching). Saving the run stamps the tab with it; a failed run changes nothing. A switch makes no model call and touches no tab: a tab keeps its language until it is edited, and an edit into another language must define every section again (the page agent rejects, with one retry, a reply that leaves one out). Until then an English page shows Spanish buttons, stock lines and prices around its English prose: fixed strings follow the shopper, prose follows the tab.

## The store and the session

Everything Obsidian keeps between requests lives behind one async `Store` protocol (`obsidian_store`, core: it never names a cartridge). Slice 2 holds users, workspaces, tabs and their revisions (the last 20), cart lines (no price: prices are read live), a `runs` row per run, and the answers of direct actions for 24 hours; later slices add their tables in new migrations.

- **Two stores, one contract.** `PostgresStore` (SQLAlchemy 2 async + asyncpg; Alembic migrations run in code on connect, no `alembic.ini`) and `MemoryStore` (dictionaries; tests and a run without a database). `obsidian_store.contract_tests.StoreContract` is the reusable suite both pass, the `CatalogSourceContract` pattern; the Postgres run needs `OBSIDIAN_TEST_DATABASE_URL` and is skipped without it. CI runs it against a `postgres:17` service container. Each cart rule is one conditional SQL statement, so it holds across two requests in two transactions.
- **Choosing.** `OBSIDIAN_DATABASE_URL` (environment over `.env`) names the database; the agent connects, migrates, seeds the shoppers and purges day-old action answers on the first request, so building the app touches nothing. Unset, the agent runs on `MemoryStore` and logs that nothing survives a restart. `docker compose up -d --wait postgres` starts a local Postgres (`compose.yaml`); `scripts/dev.py` does it when the setting is present. `postgres.py` and the migrations stay out of the 80 % coverage gate: the contract run against a real database proves them.
- **The session.** A signed `obsidian_session` cookie holds the shopper's ID (`<user_id>.<signature>`, HMAC-SHA256 with `OBSIDIAN_SESSION_KEY`, base64url; `HttpOnly`, `SameSite=Lax`). A missing, tampered or foreign cookie, or one naming a user who does not exist, is the default shopper `demo-user`, never an error. Without the setting a random key per process signs sessions, so a restart signs every browser back in as `demo-user`. `GET /api/session` and `GET /api/users` serve the user menu; `session.switch_user` (a direct action from `shell:user-menu`) sets the new cookie and the page reloads into that shopper's workspace.
- **What a run saves.** A successful run saves the tab's card (title and commands until slice 5), its snapshot and `product_facts` (each product's price and stock as the page was written, for slice 6's "prices changed" note), and appends a revision. One run at a time per shopper. Every run, whatever its end, writes one `runs` row: outcome, tokens, latency, time to the first message, retries, whether a tool round fired.

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
