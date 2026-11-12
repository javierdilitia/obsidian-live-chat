# Sub-project 1 — Product spec: design

**Date:** 2026-11-11 · **Status:** approved in conversation, awaiting written-spec review
**Branch:** `docs/product-spec`
**Builds on:** [`ROADMAP.md`](../../../ROADMAP.md) milestone 1, [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/research/A2UI-DECISION.md`](../../research/A2UI-DECISION.md), [`2026-11-11-repo-foundation-design.md`](2026-11-11-repo-foundation-design.md), `PRODUCT.md`, `DESIGN.md`, the mockup in `mockup/`, and the data contract in `backend/packages/data_contract/`.

Where this spec and `docs/ARCHITECTURE.md` disagree, this spec wins (ARCHITECTURE.md says so itself).

## 1. Why

The mockup proves the concept: no transcript, a command bar, and an agent that files every answer into a tab and edits it in place. The architecture picks the tools (A2UI v1.0, a Python backend, Azure Foundry models). This spec turns both into a product the first working demo (milestone 2) starts from and the build (milestone 3) completes: what the agent can do with tabs, what it can draw, what every button does, what persists, and what we need from the data-agent teammate. The product is Obsidian, a client- and domain-agnostic framework; each store plugs in as a cartridge (its data, data model and presentation config): Halden, the fictional electronics store in this spec's examples, is the first, and Haier, with real data, is the next.

The mockup's visuals and motion are kept and extended, not redesigned. `DESIGN.md` stays the visual source of truth; UI work uses the `impeccable` skill and UX work the `intent` skills.

### Decisions made in this brainstorm (2026-11-11)

| Topic | Decision |
|---|---|
| Saved tabs | No Save button. Every tab persists automatically when it is created. Closing a tab moves it to the shopper's **history**, where it can be reopened. |
| Tab tools | `create` builds a new tab; `open` restores one from history (no model call); plus `edit`, `switch`, `close`, and a no-page `suggest`. |
| Identity | Seeded demo shoppers, no login. A signed session cookie names one. Real login comes with milestone 5. |
| Language | EN + ES. Fixed UI strings switch at once; the agent builds new pages and edits in the chosen language; existing tabs keep their language until edited. |
| Data flow | The router writes a structured brief; the backend pre-fetches the data; the UI model gets the rows and writes Express, with read-only data tools for **at most one** extra round. |
| Store | Postgres with JSONB, behind a `Store` protocol with an in-memory fake, like `CatalogSource`. |
| Home page | A code-built surface (instant) plus an agent-built **For you** surface (cached, streams in). |
| History ideas in v1 | Cheaper since you looked; back in stock; still deciding; router memory; goes with what you own; cart left behind. Later: learned defaults, negative signals. |
| Demo safety | `MODEL_MODE=live|replay`: replay serves recorded model output for live demos and deterministic tests. |

## 2. Where surfaces fit

Every surface has an ID of the form `<owner>:<uuid>` and one catalog. The backend checks the owner on every write; only the owner may send `updateComponents`, `updateDataModel` or `deleteSurface` to it.

| Place | Surface? | Owner prefix | Built by | Catalog |
|---|---|---|---|---|
| Tab page | Yes, one per tab | `shop:` | The UI model, or a template (below) | `obsidian.shop` |
| Home page | Yes | `home:` | Plain code, no model; rebuilt on every load | `obsidian.shop` + home components |
| For you section on the home page | Yes | `foryou:` | The For-you agent (UI model), cached | `obsidian.shop` |
| Support and refund pages (milestone 5) | Yes, in their own tab | `support:` | The refund subagent | `obsidian.support` |
| Product modal, spec explainer popover | No. A local action opens our React overlay with a product ID or spec key | — | — | — |
| Cart drawer, orders drawer, history drawer, user and language menus, toasts | No. App chrome | — | — | — |

### 2.1 Generated and template pages

Each page kind is either **generated** (the UI model writes Express) or a **template** (backend code emits the A2UI messages directly, through the same components).

| Kind | Builder | Typical sections | Tab icon |
|---|---|---|---|
| `compare` | generated | verdict, shelf, spec table, charts | compare |
| `guide` | generated | lede prose, callout, diagram | book |
| `product` | generated | product hero, related tiles | product |
| `explore` | generated | product grid with reasons ("OLED laptops under €2,000") | grid |
| `orders` | template | order list | box |
| `order` | template | order tracker | box |
| `confirmation` | template | order confirmation | check |

Templates cover pages that carry money or dates and never need creativity; they appear without a model call. The model may still **edit** a template tab ("also show my other orders"), because edits work by component ID, whoever built the tab.

### 2.2 IDs resolve in the browser

Catalog components receive only IDs and keys (`productIds`, `orderId`, `specKeys`). Our React components fetch the rows from `GET /api/catalog/…` and `GET /api/orders/…` through one client cache (60 s for display). So:

- a surface snapshot never contains a price, a spec value or a stock count;
- a tab restored from history shows today's price with no model call;
- checkout never trusts the client cache; it re-reads on the server.

The cart is an app store that every buy button reads ("In cart · View"). The A2UI data model holds only page-local UI state, such as a selected product or a chosen quantity.

## 3. The router and the tab tools

### 3.1 Router input

The router is the small, fast model. Its prompt is, in order (fixed parts first, so Azure caches them):

1. System prompt: the rules below, the tool schemas, the page kinds.
2. The cards of every open tab, the active one marked.
3. The cards of the last 10 history entries.
4. The shopper's language and the command text.

**Placement rules** (from `DESIGN.md`, stated in the prompt; the router makes the final call):
- An empty + tab takes the answer.
- A follow-up on the same kind of page edits the current tab.
- A question whose page already exists switches to it.
- A different kind of page opens its own tab, so the current one stays as it is.
- A page in history that answers the question is reopened rather than rebuilt, unless the shopper asks for fresh results.

### 3.2 Tools

The router returns **exactly one** tool call. Every call carries `reason` (≤ 60 chars, in the shopper's language), which the command bar's state field shows ("This page · updating the comparison", "New tab · keeping the comparison as it is").

| Tool | Arguments | Effect | Model calls after |
|---|---|---|---|
| `create_tab` | `kind, title, brief` | New tab, `createSurface` | UI model, or the template |
| `edit_tab` | `tab_id, change, brief` | `updateComponents` / `updateDataModel` on that tab's surface | UI model |
| `switch_tab` | `tab_id` | Activates the tab; state field "Already built · switched tabs" | None |
| `open_tab` | `history_id` | Restores a tab from history: card + snapshot → `createSurface` | None |
| `close_tab` | `tab_ids[]` | `deleteSurface` for each; the tabs move to history | None |
| `suggest` | `reason, chips[], open?` | No page. The state field shows the reason, the chip row shows what *can* be built; `open` (`cart` \| `orders` \| `history`) opens that drawer | None |

`suggest` covers out-of-scope or unclear commands and anything that would spend money: "check out my cart" or "buy the Aeris" returns `suggest` with `open: "cart"`. **Typed commands never place orders.**

### 3.3 The brief

A Pydantic model, validated before anything runs. Invalid briefs count as a router failure (one retry with the validation errors).

```python
class Brief(BaseModel):
    kind: PageKind                      # compare | guide | product | explore | orders | order | confirmation
    intent: str                         # one sentence: what the page must answer
    product_ids: list[str] = []         # products already known (from cards, history, the command)
    query: ProductQuery | None = None   # products to find
    order_id: str | None = None
    spec_keys: list[str] = []           # specs the page should weigh or explain
    constraints: dict[str, str | int] = {}   # e.g. {"use": "video-editing", "budget_cents": 200000, "panel": "oled"}
```

The backend runs the brief's queries (`get_products`, `search_products`, `get_order`, `get_order_status`, `list_spec_definitions`) and hands the UI model:

1. the catalog-derived system prompt (fixed, cached);
2. the page kind's guidance (fixed per kind, cached);
3. the brief;
4. the fetched rows, compact (IDs, names, the needed specs; prices only so the model can reason about budget, never to write them);
5. for `edit_tab`, the current surface decompiled to Express.

The UI model also has the read-only data tools (`search_products`, `get_products`, `get_order`) for **one** extra round when the brief missed something. Telemetry records whether that round fired.

### 3.4 Follow-up chips

Chips are chrome, not catalog. After the build, the router makes a second small call that returns three chips: `{label, command, predicted_tool}`. `predicted_tool` picks the chip icon (circular arrow = edit this page, folder-plus = new tab, right arrow = switch). Template tabs use a fixed chip list per kind, with no model call.

### 3.5 A run over SSE

`POST /api/runs` takes `{command | action, active_tab_id, language}` and streams AG-UI-shaped events:

| Event | When | Drives |
|---|---|---|
| `RUN_STARTED {run_id}` | at once | seam fill 0 → 18 %, the globe starts thinking |
| `CUSTOM tab_decision {tool, reason, tab_id?}` | router done | state field; a `switch`/`open`/`close` finishes here |
| `CUSTOM tab_opened {tab_id, surface_id, kind, title}` | `create_tab` only | the tab enters with its loading ring |
| `CUSTOM build_phase {phase}` | `building`, `landing` | state field ("Building comparison"), seam 55 % and 85 % |
| A2UI messages | as they compile | the page builds |
| `CUSTOM followups {chips}` | after the build | chip row |
| `RUN_FINISHED {card}` | done | seam 100 %, "Built · just now", tab icon settles |
| `RUN_ERROR {code, message}` | failure or cancellation | see §13 |

**One run per shopper at a time.** A new command cancels the run in flight (`RUN_ERROR {code: "cancelled"}`); the tab keeps its last good state.

## 4. Tab cards

The card is what the router reads instead of the surface. Each field has exactly one writer, so cards stay accurate.

```yaml
tab_id: t_7f3c                      # code; the surface is shop:7f3c…
kind: compare                       # router (create_tab.kind)
title: Video-editing laptops under €2,000   # router (create_tab.title); edit_tab may update it
built_from: "Compare 3 laptops for video editing under €2,000"   # code: the first command
recent_questions: ["Add colour accuracy for grading"]            # code: the last 3 commands
filters: {use: video-editing, budget_cents: 200000}              # router (brief.constraints)
products: [aeris-studio-16, kore-zephyr-14, vela-prism-15]       # code: product IDs found in the surface
orders: []                                                       # code: order IDs found in the surface
sections: [verdict, shelf, colour, specs, charts]                # code: the Page's child IDs
last_change: added colour accuracy section                       # router (edit_tab.change)
language: en                                                     # code
updated_at: 2026-11-11T10:42:00Z                                 # code
flags: []                                                        # code: e.g. [unavailable:vela-prism-15]
```

History entries use the same card plus `closed_at`. The router sees history cards in a shorter form: `tab_id, kind, title, products, closed_at`.

## 5. Tab lifecycle

```
            create_tab / template
                    │
                    ▼
   ┌──────────►  open  ──── × / close_tab / cap reached ────►  history
   │                                                            │
   └──────────── open_tab / History drawer / home row ◄─────────┘
```

- **Persisted after every successful run:** the card and a snapshot (one compacted v1.0 `createSurface` with `components` + `dataModel`). Each run also appends a revision row (§10). Tab order and the active tab persist through direct actions. Scroll position and page-local UI state do not.
- **Reload:** `GET /api/workspace` returns the open tabs (cards + snapshots, in order) and the active tab. They render at once, with no build animation and no model call.
- **Restore from history:** the tab springs in and the page fades in. No globe, because no model is thinking. It keeps its original language and surface ID.
- **Stale data:** prices are live. A product that no longer exists renders a "no longer available" state in its slot, and the card gets a flag so the router can offer a rebuild.
- **Tab cap:** 12 open tabs. When `create_tab` would make a 13th, the least recently used tab moves to history, with a toast ("Moved 'OLED burn-in' to history").
- **History retention:** the last 100 entries per shopper; the oldest is dropped when a tab closes.
- **Where history shows:** "Pick up where you left off" on the home page, the History drawer (user menu), and the router's input (§3.1).
- **Closing the last tab** returns to the landing, as in the mockup.

## 6. Shopper history and For you

### 6.1 Signals

An append-only `events` log, per shopper, first-party only, cleared with "Clear history" in the user menu (which also empties tab history and the For-you cache; open tabs, cart and orders stay).

| Event | Data |
|---|---|
| `command` | text, language |
| `tab_built`, `tab_edited` | tab_id, kind, products with the `price_cents` and `stock` seen at build time |
| `tab_closed`, `tab_restored` | tab_id |
| `product_viewed` | product_id, `price_cents`, `stock` (modal or product tab) |
| `cart_added`, `cart_removed` | product_id |
| `product_dropped` | product_id, tab_id (removed from a comparison by an edit) |
| `order_placed` | order_id |

### 6.2 The home page

Two surfaces, side by side in the mockup's home layout.

**`home:<user>`, code-built, instant:**
- the week's offer (from a merchandising config: product ID, headline, body, the command its button asks);
- **Pick up where you left off**: recent commands ("ask again", agent) and recent history tabs (restore, direct), newest first;
- **Cheaper since you looked** (idea 1): products from `product_viewed` / `tab_built` in the last 30 days whose current price is below the lowest price seen; the reason line says by how much and when ("€150 less than on Tue");
- **Back in stock** (idea 2): products seen with stock 0 that now have stock; elsewhere, every stock line reads "Only N left" when stock ≤ 3;
- **Still in your cart** (idea 8): shown when the cart is not empty and has not changed for 24 h; opens the cart;
- Shop the store (categories) and On sale this week, as in the mockup.

**`foryou:<user>`, agent-built, cached:**
- Input: a compact profile built by code (top categories, budget band, owned products from orders, open and recent comparisons) and candidate lists built by code:
  - **Still deciding?** (idea 3): a `compare` tab updated ≥ 2 days ago whose products were not added to the cart since; code supplies what changed (price, stock);
  - **Goes with what you own** (idea 6): accessories matched by a fixed category rule (laptop → docks, storage; monitor → docks; …) to ordered products and to laptops in open comparisons.
- Output: one section of shop components (`Section`, `Prose`, `ProductGrid`/`ProductTile` with reasons, `TabLink`, `AskButton`). Every reason must cite a signal from the input; the validator rejects product IDs that were not in the candidates.
- Cache: rebuilt only when older than 24 h, or after a significant event (`order_placed`, `tab_built` of kind `compare`), or when the language changes. The rebuild runs in the background after a run finishes; `GET /api/home` returns the cached section with `foryou_stale: true` and the client streams the new one in with the build motion. It never blocks the home page.
- A first-time shopper (no signals) gets a code-built "Popular right now" section instead, with no model call.

**[Halden cartridge]** The category-pairing rule (laptop → docks, storage; …) and the merchandising config behind the week's offer are Halden's; the mechanisms (code-built candidates, the offer card) are Obsidian core.

**Router memory** (idea 4) is §3.1: history cards are in the router's input, so "compare it with the one I saw yesterday" resolves to product IDs and `open_tab` can reopen old pages.

### 6.3 Later ideas (not in milestone 3)

- **Learned defaults**: budget, use and panel preferences learned from earlier briefs pre-fill new briefs, always shown ("Because you looked at OLED laptops") and clearable.
- **Negative signals**: products dropped from a comparison are not suggested again for 30 days.

## 7. Component catalog — `obsidian.shop` v1

### 7.1 Rules

- **IDs, never values.** Components take product IDs, order IDs and spec keys. The model writes only prose: titles, verdicts, tags, reasons, headings. Prices, specs, stock and images come from the catalog at render time.
- **Semantic section IDs.** Every section-level component gets an ID chosen by the model (`verdict`, `shelf`, `specs`, `colour`, `charts`). Edits target those IDs; the card's `sections` lists them. Adding a section means rewriting `Page.children` (A2UI has no per-component delete or insert).
- **Post-compile validation** (backend, before anything reaches the browser): every product and order ID exists; every button's ID is one the page shows; text fields respect their limits; `Page` is the root of a tab and section-level components sit only under `Page`. A failure triggers the one retry (§13).
- **Fixed strings** (button labels, "The pick", "In stock", the footer disclaimer, empty states) come from our EN/ES bundle, not from the model.
- **Spec labels and explainer copy** come from our spec glossary (`web/src/i18n/specs.{en,es}.json`, keyed by spec key), not from the model or the data agent. **[Halden cartridge]** The glossary's contents are Halden's; the lookup mechanism is core.
- Series colours are assigned by position (frost, steel, deep), never by the model.

### 7.2 Page and layout

| Component | Fields | Notes |
|---|---|---|
| `Page` | `title` (≤ 80), `kicker` (≤ 40), `meta: string[]` (≤ 4, each ≤ 32), `actions: id[]` (≤ 2), `children: id[]` | Root of every tab. Code appends "built from …" / "then …" to the meta line from the card. The footer disclaimer is fixed. |
| `Section` | `heading?` (≤ 60), `children: id[]` | Generic hairline-divided section. |
| `Split` | `main: id[]`, `side: id[]` | The guide's two columns. |
| `ChartGrid` | `children: id[]` (1–2) | Charts side by side; stacks under 1080 px. |

### 7.3 Content

| Component | Fields | Notes |
|---|---|---|
| `Verdict` | `lead?` (≤ 40, bold), `text` (≤ 200), `button?: id` | One primary button per page, usually an `AddToCartButton`. |
| `Prose` | `text` (≤ 900; inline `**bold**` only), `variant: lede \| body \| note` | |
| `Callout` | `heading` (≤ 60), `text` (≤ 400) | "What it means for you". |
| `Diagram` | `name` | From our authored set: `oled-burn-in`, `panel-types`, `refresh-rate`, `colour-gamut`, `ports`, `battery-life`. The model cannot draw; the set grows by code. **[Halden cartridge]** The set is Halden's; the `Diagram` component is core. |

### 7.4 Products

| Component | Fields | Notes |
|---|---|---|
| `ProductShelf` | `items: [{productId, tag (≤ 40)}]` (2–4), `pickId?` | Render on its plate, name (opens the modal), trust line, price block, series dash + tag, stock line, ghost Add to cart. |
| `SpecTable` | `productIds` (2–4), `specKeys` (≤ 12), `highlightBest = true` | Labels are explainer triggers. "Best" uses `SpecDefinition.better` (§11 D); missing values show "—". |
| `RadarChart` | `title` (≤ 60), `productIds` (2–4), `axes: specKey[]` (3–8) | Numeric specs only; code normalises each axis across the shown products. |
| `BarChart` | `title` (≤ 60), `productIds` (2–4), `specKey`, `note?` (≤ 160) | Scale and dimming from the spec definition. |
| `ProductHero` | `productId` | Large render, buy box (trust, price, three promises, primary buy button), spec sheet. The product modal renders the same component. |
| `ProductGrid` | `children: id[]` (2–8, `ProductTile` only) | |
| `ProductTile` | `productId`, `reason?` (≤ 90) | Render, name, trust line, price, reason. |
| `ProductList` | `children: id[]` (1–8, `ProductRow` only) | |
| `ProductRow` | `productId`, `reason?` (≤ 90) | The sale-row layout: render tile, name, reason, price over was-price, ember percentage pill. |

### 7.5 Orders

| Component | Fields | Notes |
|---|---|---|
| `OrderTracker` | `orderId` | Steps on the hairline track, parcel contents, delivery facts. |
| `OrderList` | `limit = 5` | The session shopper's orders (merged, §10.3). The user never comes from the model. |
| `OrderConfirmation` | `orderId` | Thank-you verdict, four-step track, items, delivery facts, total paid. |

### 7.6 Buttons

Each button builds its own action from its type and ID prop (§8). The model never writes an action.

| Component | Fields | Action |
|---|---|---|
| `AddToCartButton` | `productId`, `variant: primary \| ghost`, `withName = false`, `withPrice = false` | `cart.add`; the label is composed by code ("Add Aeris Studio 16 · €1,899"); flips to "In cart · View" (`openCart`) |
| `SaveButton` | `productId` | `saved.toggle` |
| `ProductLink` | `productId`, `label?` | `openProduct` |
| `OrdersButton` | — | `openOrders` |
| `TrackButton` | `orderId` | `order.track` |
| `CartButton` | — | `openCart` |
| `TabLink` | `tabId`, `label?` | `tab.activate` or `tab.restore` (home and For you only) |
| `AskButton` | `label` (≤ 40), `command` (≤ 160) | `agent.ask` |

### 7.7 Home-only components (used by code, not offered to the model)

| Component | Fields |
|---|---|
| `Home` | `children: id[]` (root of `home:` surfaces) |
| `OfferCard` | `productId`, `headline`, `body`, `command` |
| `RecentList` | `items: [{type: command \| tab, label, when, command? , tabId?}]` |
| `CategoryGrid` | — (reads `list_categories`) |

### 7.8 `obsidian.support` (milestone 5, listed only)

`RefundForm(orderId, lineIds)`, `TicketStatus(ticketId)`. Owned by the refund subagent, rendered in `support:` tabs.

### 7.9 Example (illustrative; the first demo confirms the exact Express syntax)

A build:

```text
<a2ui>
root = Page(title="Three laptops for video editing under €2,000", kicker="video-editing comparison",
            meta=["9 specs weighed", "today's prices"], children=[verdict, shelf, specs, charts])
verdict = Verdict(lead="Aeris Studio 16", text="the most screen and power for grading, inside the budget.",
                  button=AddToCartButton("aeris-studio-16", variant="primary", withName=true, withPrice=true))
shelf = ProductShelf(items=[{productId: "aeris-studio-16", tag: "most power"},
                            {productId: "kore-zephyr-14", tag: "lightest"},
                            {productId: "vela-prism-15", tag: "best value"}], pickId="aeris-studio-16")
specs = SpecTable(productIds=["aeris-studio-16", "kore-zephyr-14", "vela-prism-15"],
                  specKeys=["display", "hz", "cpu", "gpu", "ram", "ssd", "batt", "weight", "ports"])
charts = ChartGrid([RadarChart(...), BarChart(title="Battery — hours of video playback", ..., specKey="batt")])
</a2ui>
```

The edit "Add colour accuracy for grading": the model rewrites `root` (new child list) and defines `colour`; nothing else is sent, so `verdict`, `shelf`, `specs` and `charts` keep their mounts.

```text
<a2ui>
root = Page(..., children=[verdict, shelf, colour, specs, charts])
colour = ChartGrid([BarChart(title="Colour range — share of DCI-P3", ..., specKey="p3"),
                    BarChart(title="Colour error — ΔE, shorter is truer", ..., specKey="de",
                             note="Under ΔE 2 the eye can't see the error.")])
</a2ui>
```

## 8. Action catalog

### 8.1 How each kind runs

| Kind | A2UI mechanism | Path | Model? |
|---|---|---|---|
| **Local** | `functionCall` to a renderer function in our catalog (`allowedCallers: rendererOnly`, `requiresUserActivation: true`) | in the browser | No |
| **Direct** | `event` | `POST /api/actions` → plain-code handler | No |
| **Agent** | `event` | `POST /api/runs {action}` → a normal run (SSE) | Yes |

- The client reads each action's kind from a registry generated from the catalog; the server checks the kind again and rejects a mismatch.
- Every event's `context` carries only IDs plus a `requestId` (UUID per click). Repeating a `requestId` returns the stored result (idempotency, §10).
- Direct handlers always check the session user, that the IDs exist, stock and current prices. They return `{ok, cart?, saved?, toast?, tab?, error?: {code, message}}`.

### 8.2 Every trigger

| Trigger | Action | Kind | What happens |
|---|---|---|---|
| `ProductLink`, a product render, a tile or row click | `openProduct{productId}` | local | Product modal (`ProductHero`); logs `product_viewed` through a beacon |
| Spec label in `SpecTable` | `explainSpec{specKey}` | local | Explainer popover from the spec glossary |
| `OrdersButton`, Orders ledger cell | `openOrders` | local | Orders drawer |
| "In cart · View", `CartButton`, Cart ledger cell | `openCart` | local | Cart drawer |
| History item in the user menu | `openHistory` | local | History drawer |
| Modal Back, menus, Esc | — | local | Chrome |
| `AddToCartButton` | `cart.add{productId}` | direct | Stock check, qty + 1; returns the cart; toast and fly-to-cart |
| Cart stepper, cart remove × | `cart.set_qty{productId, qty}`, `cart.remove{productId}` | direct | Stock check on increase; returns the cart |
| `SaveButton` | `saved.toggle{productId}` | direct | Returns saved items |
| Cart drawer "Check out · €X" | `checkout.place{expectedTotalCents}` | direct | Re-reads prices and stock. A different total returns `price_changed` with the new total; the drawer shows it and the shopper clicks again. Otherwise creates the order, empties the cart, opens a `confirmation` template tab, logs `order_placed`. One transaction. |
| `TrackButton`, an order card in the drawer | `order.track{orderId}` | direct | Switches to the order's tracking tab, or opens the `order` template |
| Tab click, tab ×, middle-click, Delete key | `tab.activate{tabId}`, `tab.close{tabId}` | direct | Persists the workspace; close moves the tab to history |
| History drawer entry, home history row, `TabLink` | `tab.restore{tabId}` / `tab.activate{tabId}` | direct | Restores from card + snapshot |
| Language menu | `prefs.set_language{language}` | direct | Fixed strings switch; new runs use the language |
| User menu: switch shopper | `session.switch_user{userId}` | direct | New signed cookie; workspace reloads |
| User menu: Clear history | `history.clear` | direct | §6.1 |
| `AskButton`, follow-up chips, home "ask again" rows, offer button, Laptops category tile | `agent.ask{command}` | agent | A normal run; the router decides where the answer goes |
| "Ask for a refund" (milestone 5) | `support.refund{orderId}` | agent | The refund subagent opens a `support:` tab |

"Buy" in `PRODUCT.md` means checkout. There is no one-click buy in v1, and nothing typed can spend money (§3.2).

## 9. Motion: reuse the mockup, mapped to A2UI

The mockup's motion grammar (`DESIGN.md`, "The build") stays. What changes is where the renderer learns what moved:

| Mockup behaviour | Driven by |
|---|---|
| Globe thinks, seam fills to 18 % | `RUN_STARTED` |
| State field names the decision | `CUSTOM tab_decision` |
| Tab enters with a loading ring | `CUSTOM tab_opened` |
| Dots land on the page outline, content cascades at a 45 ms stagger | the first `createSurface` and the components that follow |
| Follow-up: only changed parts step back, then rise in; unchanged parts glow once | the component IDs named in each `updateComponents` message. The renderer animates exactly those IDs; all others keep their mounts (A2UI keys children by ID) |
| A new section opens its own room first | an ID that appears in `Page.children` for the first time |
| Only swapped radar series redraw, only changed bars refill | chart components compare old and new `productIds` |
| Switching tabs is instant, never replays | tab surfaces stay mounted (hidden) while open |
| Reload and restore | no globe, page fades in (no model is thinking) |
| Reduced motion | every animation clamps, content rests visible, as today |

## 10. Persistence

### 10.1 Package

A new `halden_store` package (`backend/packages/store/`):

- a `Store` protocol (async), grouped by area: workspace and tabs, history, cart and saved items, orders, events, For-you cache, runs, idempotency;
- `PostgresStore`: SQLAlchemy 2 async + asyncpg, Alembic migrations;
- `MemoryStore`: in-memory, for unit tests;
- `StoreContract`: a reusable pytest suite both must pass (the `CatalogSourceContract` pattern).

Postgres 17 runs locally through `docker compose`, in CI as a service container, and on Azure Database for PostgreSQL from milestone 5.

### 10.2 Tables

| Table | Columns | Notes |
|---|---|---|
| `users` | `id, name, language, created_at` | Seeded: `demo-user` (Javier, EN, the 3 seed orders), `ana` (ES, two orders), `sam` (new shopper, nothing yet: shows the first-run path) |
| `workspaces` | `user_id pk, active_tab_id` | |
| `tabs` | `id, user_id, surface_id unique, kind, status (open \| history), position, card jsonb, snapshot jsonb, language, created_at, updated_at, closed_at` | Index `(user_id, status, position)`. Snapshot ≤ 256 KB, or the run fails validation |
| `tab_revisions` | `tab_id, rev, card jsonb, snapshot jsonb, run_id, created_at` | PK `(tab_id, rev)`; the last 20 per tab are kept |
| `cart_lines` | `user_id, product_id, qty, added_at, updated_at` | PK `(user_id, product_id)`. **No price stored**: it is read live |
| `saved_items` | `user_id, product_id, saved_at` | PK `(user_id, product_id)` |
| `orders` | `id, user_id, placed_at, status, total_cents, currency` | Orders placed in our app; prices frozen at checkout |
| `order_lines` | `order_id, product_id, name, qty, unit_price_cents` | |
| `events` | `id, user_id, type, at, tab_id?, product_id?, order_id?, data jsonb` | Index `(user_id, at desc)`; kept 180 days |
| `foryou_cache` | `user_id, language, snapshot jsonb, inputs_hash, built_at` | PK `(user_id, language)` |
| `runs` | `id, user_id, tab_id?, trigger (command \| action \| foryou), tool, outcome, router_model, ui_model, tokens_in, tokens_out, tokens_cached, latency_ms, first_message_ms, retries, tool_round_used, error, started_at, finished_at` | Telemetry for milestones 2 and 4 |
| `processed_actions` | `request_id pk, user_id, result jsonb, at` | Idempotency; kept 24 h |

### 10.3 Rules

- **Orders come from two places.** An `OrderService` merges the data agent's orders (`CatalogSource.get_orders`) with ours, newest first, and serves `GET /api/orders`, `/api/orders/{id}` and `/api/orders/{id}/tracking`. Our order IDs are `OB-` plus a sequence starting at 90000 until the review settles ownership (§11 H). Tracking for our orders is generated by code from `placed_at`.
- **Checkout is one transaction:** order, lines, empty cart, confirmation tab, `order_placed` event.
- **Session:** a signed cookie `halden_session` holding the user ID (signing key from the environment). The user menu lists the seeded shoppers.

### 10.4 Endpoints (summary)

| Endpoint | Use |
|---|---|
| `POST /api/runs` | A run (command, agent action, or For-you rebuild); SSE |
| `POST /api/actions` | Direct actions; JSON |
| `GET /api/workspace` | Open tabs (cards + snapshots) and the active tab |
| `GET /api/history` | History entries (cards) |
| `GET /api/home` | The home surface, the cached For-you section, `foryou_stale` |
| `GET /api/catalog/products?ids=`, `/api/catalog/products/{id}`, `/api/catalog/categories`, `/api/catalog/specs/{category_id}` | Catalog reads for components |
| `GET /api/orders…` | §10.3 |
| `GET /api/cart`, `GET /api/saved` | Commerce reads |
| `GET /api/session`, `GET /api/users` | Current shopper, seeded shoppers |
| `POST /api/events/beacon` | Local actions that log signals (`product_viewed`) |

## 11. Data contract: our decisions and the Haier intake

Obsidian owns the data contract; each cartridge implements it. Some points are ours to decide (§11.1). The rest depend on what Haier's real dataset holds, so they are questions for the intake meeting with the data-agent teammate (§11.2). The meeting is an intake of their data, not an approval of our fake catalog. Answers are recorded here, in the same PR as the meeting notes or a follow-up.

### 11.1 Decisions we own

Decided. Each one lands in the contract with its contract tests in a separate PR before milestone 3 starts.

| # | Point | Today | Decision | Status |
|---|---|---|---|---|
| A | Empty or space-padded `category` and `attributes` | `text` is stripped and blank becomes `None`, but `category=" laptops "` returns `[]`, `attributes={"display": ""}` matches every product that has the key, and `{" display": "OLED"}` matches nothing | Normalise in `ProductQuery` validators so every implementation agrees: `category` stripped and lowercased, blank → `None`; attribute keys and values stripped; a blank value drops that entry; a blank key is a `ValidationError`. Contract tests for each case. | decided — to be encoded in the contract with tests before milestone 3 |
| B | Search text: one phrase or all words | `text` is one case-insensitive substring of the name or category ID, so "OLED laptop" finds nothing | Split on whitespace; **every word** must match (case-insensitive substring) at least one of: name, category ID, category name, any spec `display`. Ranking unchanged (rating descending, then ID). | decided — to be encoded in the contract with tests before milestone 3 |
| C | Tracking steps for cancelled orders | "Exactly one step is `current`, unless delivered", so a cancelled order needs a fake current step | Cancelled: the steps reached are `done`, followed by a terminal `Cancelled` step, also `done`; no `current`, no `pending`. Rule becomes: delivered or cancelled → all steps `done` and the last one is terminal; otherwise exactly one `current`. | decided — to be encoded in the contract with tests before milestone 3 |
| F | Sorting | Rating only | `ProductQuery.sort: rating \| price_asc \| price_desc`, default `rating` ("cheapest OLED laptop"). | decided — to be encoded in the contract with tests before milestone 3 |

### 11.2 Haier intake

Questions to answer from their dataset. "Our default" is what we build if the answer leaves the point open.

| # | Topic | Today (Halden fake) | Question for their dataset | Answer |
|---|---|---|---|---|
| D | Spec metadata | No labels, units or direction; `weight` is the string `"1.74 kg"`, `ram` is `"32 GB LPDDR5"` | Do comparable specs come with a numeric value and a unit? Is there per-category spec metadata (unit, number or text, whether higher or lower is better)? Our default: `list_spec_definitions(category_id) → list[SpecDefinition]`, `SpecDefinition{key, unit, kind: number \| text, better: higher \| lower \| None}`; labels and explanations stay in the cartridge's glossary. | to ask |
| E | Spec vocabulary | Laptops use `hz` and `batt`, monitors `refresh_rate`, audio `battery`; some laptops lack `p3` | Is there one fixed spec key vocabulary per category, and who owns it? How often are values missing? Our default: a missing key means unknown and renders "—". | to ask |
| G | Look and images | `look` (glyph, finish) is required; a real catalog will not have it | What product images does their dataset have (URLs, sizes, the right to show them)? Our default: `look` optional, plus optional `image_url`; with neither, the UI uses a glyph per category. | to ask |
| H | Orders | Read-only contract; orders keyed by `user_id` | Does their dataset hold orders? Who allocates order IDs? Do in-app orders flow back to their system (a write API) or stay ours? How do their user IDs map to ours? Do they have `returned` and `refunded` statuses (milestone 5)? | to ask |
| I | Serving and speed | In-process Python package | In-process, HTTP or MCP? What p95 latency per call can they hold (the pre-fetch is on the critical path; we'd like ≤ 150 ms)? How long may we cache (we'd like 60 s for display; checkout always re-reads)? | to ask |
| J | Language | English data | Are names and spec displays available in Spanish? Our default: EN data, EN/ES UI. | to ask |

## 12. Language

- Fixed strings: `web/src/i18n/{en,es}.json`, plus the spec glossary (§7.1). The language menu switches them at once.
- The router and UI model get the shopper's language; the router's `reason` and chips, and the UI model's prose, are written in it.
- Templates use the bundle. Money and dates format with `Intl` for the language (`€1.899` in ES, `€1,899` in EN).
- A tab keeps its `language` until it is edited; an edit rewrites the page in the current language. For you is cached per language.

## 13. Errors

| Failure | Behaviour |
|---|---|
| Express compile or validation error | One retry with the errors fed back. Then: an edit keeps the last good surface (state field "Couldn't change this page"); a create shows a "couldn't build this" state in the tab with a retry chip |
| A `length` stop (truncated output) | Treated as a failure, same path as above |
| Router failure (invalid tool call or brief) | One retry with the validation errors; then `suggest` with the starter chips |
| Unknown ID while rendering | That slot shows "no longer available"; the card is flagged |
| Catalog source down | Runs fail with "The store is unavailable, try again"; direct actions return an error toast; open tabs keep rendering from the client cache |
| SSE drops mid-run | The client reconnects, then reads the finished tab from `GET /api/workspace` |
| Run cancelled by a new command | `RUN_ERROR {code: "cancelled"}`; nothing shown to the shopper |
| Direct action errors | `out_of_stock`, `not_found`, `price_changed`, `invalid`, each with a toast or inline copy from the bundle |

## 14. Testing

No browser screenshots or headless-browser tests (the user's rule); UI is verified by reading code and the user checks by eye.

- **Contract suites:** `CatalogSourceContract`, extended with the agreed points from §11; the new `StoreContract`, run against `MemoryStore` and `PostgresStore`.
- **Unit tests:** router tool-schema and brief validation; brief → pre-fetch; card derivation from a surface; the post-compile validator (unknown IDs, button safety, text limits, parent rules); every direct action handler, including `price_changed` and idempotency; template builders against golden A2UI messages; the history signal queries (cheaper since you looked, back in stock, still deciding, cart left behind).
- **Web:** Vitest per catalog component with fixture data; the action registry (every action has exactly one kind).
- **Replay mode:** `MODEL_MODE=live|replay`. In `replay`, the router and UI model are replaced by recorded outputs keyed by the command plus a hash of the relevant cards. Live demos in meetings cannot stall or vary, and backend tests run full runs deterministically. Recording happens in `live` mode with `MODEL_RECORD=1`.
- **Model quality** (edit accuracy, blank rate, consistency, button safety): the first demo checks button safety by test and edits by test and by eye; milestone 4 tracks all four.

## 15. What the first demo (milestone 2) must confirm

1. Express variable names become component IDs, so the model can name sections (`colour = …`).
2. Rewriting `root` with a new child list re-renders `Page` but does not remount unchanged children.
3. Express syntax for list-of-object props (`ProductShelf.items`).
4. A custom React component can dispatch an A2UI action it builds itself (the button rule in §7.6).
5. The decompiler round-trips our catalog, so edits can show the model its current page.

Two questions wait for the milestone 3 slices that need them: typical snapshot size for a comparison (the 256 KB limit is a guess), with saved tabs; and how often the one extra data-tool round fires (§3.3), with the router.

## 16. Out of scope

Real authentication; payments (checkout takes no payment, as in the mockup); refunds and support (milestone 5); dashboards (milestone 4); learned defaults and negative signals (§6.3); one-click buy; an undo or revision-history UI (revisions are stored, not shown); agent-built modals; a mobile app.

## 17. How we know milestone 1 is done

1. This spec is reviewed and approved by the user.
2. (a) The contract semantics we own (§11.1) are decided and recorded; (b) the Haier intake meeting with the data-agent teammate is held and its answers recorded (§11.2).
3. `PRODUCT.md` Users and Operating Context reflect this spec.
4. Milestone 3's plans can be written from this spec and milestone 2's results without reopening any decision in §1.

## 18. Risks

| Risk | Mitigation |
|---|---|
| The router misplaces answers (edits the wrong tab, rebuilds instead of switching) | Placement rules in the prompt; tab cards with `sections` and `last_change`; placement tests when the router slice is built; telemetry per decision in `runs` |
| The For-you section invents reasons | Reasons must cite input signals; product IDs outside the candidates are rejected; first-run shoppers get a code-built section |
| Express details differ from the docs (IDs, list props) | The first demo checks them (§15) before the rest of the build; the catalog design does not depend on Express beyond named assignments |
| Snapshots grow with edits | 256 KB limit; snapshots are compacted single `createSurface` messages, not message logs |
| The data agent's real catalog lacks what components need (numeric specs, images) | §11.2 D, E and G, answered at the Haier intake before the build |
| History feels creepy | First-party signals only, visible reasons, one-click Clear history |
| Live demos stall on model latency | Replay mode; template pages; instant home page |
