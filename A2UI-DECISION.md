# Chatbot 2.0: framework decision — A2UI

**Decision (Nov 11, 2026): we build the generative-UI layer on A2UI v1.0 with our own component catalog.** OpenUI was the runner-up; json-render stays in reserve. This doc records everything that led there, the architecture we agreed on, and what the PoC still has to prove.

Builds on [FRAMEWORKS-STUDY.md](FRAMEWORKS-STUDY.md) and [OPENUI-STUDY.md](OPENUI-STUDY.md). Where this doc disagrees with them, this doc wins: it was written after we switched from Claude to Azure Foundry GPT models and after checking A2UI and OpenUI source code directly.

---

## 1. Context

### What we're building
A retail assistant that is **not a chatbot**. No transcript. The agent works with **tabs**: it opens new ones, edits existing ones, switches between them, and generates UI inside them — comparisons, product descriptions, order history, tracking, support, pricing modals.

Everything runs through the UI and the JS/backend behind it. Generated UI contains buttons — *save this product*, *add to cart*, *buy*, *ask for refund*, *track order* — that act on real data.

### Who builds what
- **Teammate:** the SQL / data-gathering agent.
- **Us:** the generative-UI agent (routing, tab management, UI generation, actions).

### Constraints
- **Models: Azure AI Foundry, most likely GPT models.** Not Claude. (This changed the analysis — see §4.)
- **We define the components, the visuals and the animations.** Brand and motion control is non-negotiable.
- **Scalability is key.** Later: subagents or routines for refunds, support systems, etc.
- Edits are the core interaction. **Components that an edit doesn't touch must not remount** (animations must not replay).

---

## 2. Architecture

```
Browser: command bar + tabs (each tab = one A2UI surface, rendered by OUR React components)
   ▲ SSE stream, AG-UI-shaped (RUN_* brackets, subagent events, A2UI messages)
   │                                             ▼ button actions
Node backend
 ├─ Router (fast model): edit this tab / open new / switch — reads only small "tab cards"
 ├─ UI agent (ours, GPT on Azure): writes A2UI Express for one surface
 ├─ Action handler (plain code, NO model): save, add to cart, buy, track
 ├─ Later: refund / support subagents — own surfaces, own catalogs
 └─ Data agent (teammate) behind tools / MCP: returns IDs + rows, never UI
```

### Why A2UI maps onto this
| Our need | A2UI v1.0 feature |
|---|---|
| Tabs open / edit / close | Many **surfaces** per client, each with its own `surfaceId` and data model; `createSurface` / `updateComponents` / `deleteSurface` |
| Buttons that act on real data | Every action reaches the backend as `{name, surfaceId, sourceComponentId, context}` (data bindings resolved before sending). Local renderer functions (`functionCall`) for modals/popovers — no network |
| Subagents later | Built for multi-agent: subagents send UI as *messages*, never touch the host UI directly; orchestrators can read them; a surface's synced data goes **only to the agent that created it** ("Data cannot leak to other agents") |
| New domains later | Catalog per surface (`createSurface.catalogId`, component-level `@catalogId` override). Product tabs use a shopping catalog; support tabs a support catalog (`RefundForm`, `TicketStatus`) — each agent sees only its components, prompts stay small |
| Brand / animation control | v1.0 removed theming from the wire; renderers use our framework's native styling. We write every component |
| Mobile later (option) | Official renderers: React, Lit, Angular, Flutter, SwiftUI, Jetpack Compose |
| Security | No executable code on the wire. Agents can only call functions marked `agentOnly` / `rendererOrAgent`; `rendererOnly` calls rejected; user-gesture functions (e.g. `openUrl`) blocked in passive bindings; enforced by the renderer at runtime |

Known gap: **no formal surface ownership/delegation model.** The spec says orchestrators manage surface IDs (e.g. prefix with the subagent name, or use UUIDs). We'll adopt a naming convention.

### Rule 1 — split buttons into three kinds
| Kind | Examples | Path | Model involved? |
|---|---|---|---|
| **Local** | open modal, popover, spec tooltip | renderer function in the browser | No |
| **Direct** | save, add to cart, buy, track order | normal backend endpoint, deterministic code | **No** |
| **Agent** | ask for refund, "explain this" | starts an agent run | Yes |

The model only **places** a button with an ID on it. It never sets a price or amount. Buy and refund are always validated server-side (current price, stock, ownership, refund eligibility). Repeat clicks cost $0 and are instant.

### Rule 2 — agree the data contract with the teammate now
The single most important coordination point. Their agent exposes tools (MCP is the natural fit): `search_products`, `get_product`, `get_orders`, `get_order_status`, … returning **stable product / order IDs plus structured rows**. Our UI agent never writes SQL. Their internals can change freely as long as IDs and shapes hold.

Components take **IDs, never values** (`SpecTable(productIds, keys)`, `OrderTracker(orderId)`): prices, specs, images, stock resolve from the catalog at render time. The model can't invent a price, and a saved tab stays correct when prices change. (Optionally via A2UI renderer-side catalog functions, `allowedCallers: "rendererOnly"`.)

### Rule 3 — a small "tab card" per tab
```yaml
id: tab-3
kind: compare
products: [aeris-studio-16, kore-zephyr-14, vela-prism-15]
filters: {use: video-editing, budget_eur: 2000, panel: oled}
last_change: "added colour accuracy section"
```
- The **router reads only the cards**: cheap, and cache-friendly.
- The **UI agent loads the full surface only for the tab it's editing** (A2UI's Express *decompiler* can turn the surface's messages back into Express to show the model).
- **Saved tab = card + surface snapshot** (v1.0 single-message `createSurface` with `components` + `dataModel`, or replay of the message log). Restore costs $0 in model calls.

### Rule 4 — refunds/support are fixed workflows with the model at the edges
Refunds can take days and need approvals, so they need durable state, not a free-roaming agent. The workflow engine choice (Temporal, Inngest, LangGraph…) can wait. On the UI side, AG-UI already defines subagent start/finish events and a `suspended` (waiting) outcome — see §6.

### Transport — AG-UI-*shaped* SSE, not an AG-UI dependency
Keep our own SSE endpoint but shape it like AG-UI: `data: {"type":...}` framing, `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` brackets, A2UI messages as payloads, and AG-UI's subagent event shapes when we add subagents. Copy the shapes, don't depend on the packages (interrupts are an explicit draft; subagent events don't state a stability level). Migration to full AG-UI later stays mechanical. Microsoft Agent Framework supports AG-UI natively (Python; .NET via the AG-UI .NET SDK), which keeps the Azure path open.

---

## 3. Candidates considered

**Top 3 (all "custom-catalog declarative" — the model composes only our registered components):**
1. **A2UI** (Google-led) — chosen.
2. **OpenUI** (Thesys) — runner-up.
3. **json-render** (Vercel Labs) — reserve.

**Ruled out:**
- **CopilotKit** — only Microsoft tie-in, but the surfaces system we'd need is Experimental and heavy (and it's built on A2UI ops anyway).
- **assistant-ui** — generative-ui package 0.0.x, `unstable_` interactables.
- **mdocUI** — alpha, single maintainer.
- **llm-ui** — wrong category (text blocks), unmaintained since 2024.
- **tambo** — cloud shut down Oct 2026.
- **Open-JSON-UI** — no public spec exists.
- **Open-ended model-written HTML** (MCP Apps, Gemini-style generative UI) — gives up brand and animation control.

**Back-pocket option (not a framework):** our own minimal JSON page format validated with GPT strict structured outputs. Zero dependency, but we'd own parser, streaming and edits. Only if A2UI and OpenUI both fail the mount test.

### Why json-render dropped out of the final
- Edits require the model to write RFC 6902 JSON-Patch paths (`/elements/x/props/…`) — more tokens, easier to get wrong, multi-turn editing thinly documented.
- Largest output of the three → slowest with GPT.
- Its low benchmark validity (82.8%) may be partly unfair (no strict mode used), and it *does* export a JSON Schema with a `strict` flag (`@json-render/core` 0.13+) that fits GPT structured outputs — but the edit and size problems are inherent to the format.
- Strengths that keep it in reserve: Vercel Labs, ~19.6k★, Apache-2.0, very active.

---

## 4. How the ranking evolved (and why)

1. **With Claude assumed:** A2UI first, for tabs-as-surfaces, the action envelope and multi-agent design.
2. **Switch to Azure GPT → OpenUI first, json-render second, A2UI third.** Reasons at the time: A2UI's published evidence was Gemini-only; Google's blog said Express compiled from the *complete* reply (no streaming); and A2UI's multi-agent value seemed to matter mostly for untrusted *remote* agents, while our subagents run in our own backend.
3. **Benchmark + article review:** OpenUI's token advantage likely real but overstated; the benchmark doesn't test edits. Ranking unchanged; narrowed to **A2UI vs OpenUI**.
4. **Source-code verification → A2UI.** The user pointed out Express streams in the playground (even with a custom tracking component). Checking both repos confirmed it, and found the mount-identity difference (§5). A2UI wins on the things we said are key: edits, no remounts, tabs, buttons, subagents.

---

## 5. Verified in source code (repos checked Nov 11, 2026)

### A2UI — `github.com/a2ui-project/a2ui` (last commit Nov 10, 2026)
- **Express streams incrementally in Node.** `typescript/agents/a2ui_agent/src/inference-formats/express/response-stream.ts` — "Incremental streaming reader for A2UI Express DSL responses"; `text` properties stream progressively before the closing quote (`DEFAULT_EXPRESS_PROGRESSIVE_KEYS`). Conformance suite: `conformance/agent/express/response_streaming.yaml`. Dart and Python SDKs have it too. *(Google's "Fast, reliable A2UI" blog statement that SDKs compile only the complete reply is out of date.)*
- **Edits by ID.** Conformance `test_compile_express_components_without_root_is_update_components`: an Express block that assigns components without defining `root` compiles to `updateComponents` for an existing surface — only the IDs it mentions. `updateComponents` **replaces a component definition in full** (not a prop merge).
- **Data-only edits.** A block of only `$path = value` assignments emits one `updateDataModel` per path (useful for order status, price refresh). `updateDataModel` upserts; `null` removes a key.
- **No per-component delete.** Only `deleteSurface`. Removing a section = rewrite the parent's child list.
- **Decompiler** (`conformance/agent/express/decompiler.yaml`): messages → Express, round-trip tested. Lets us show the model the current tab in the notation it writes.
- **React renderer keeps components mounted.** `typescript/renderers/react/src/node-view.tsx`: children keyed by component ID (`<ChildElement key={child.id} …/>`), `memo`-ized, per-component `useSyncExternalStore` subscriptions. Untouched components don't re-render or remount.
- **Custom components:** `createComponentImplementation({name, schema: zod, allowedParents?, allowedChildren?}, ({props}) => <OurJSX/>)` → `new Catalog(catalogId, '1.0', [...])`; children rendered via `buildChild`. Catalog JSON schema on the agent side; `allowedParents`/`allowedChildren` enforce composition rules.
- **Versions:** spec v1.0 "Status: Current"; `@a2ui/react` 0.15.0; `@a2ui/agent` (TypeScript) **0.1.0** — the newest, least proven piece we depend on.

### OpenUI — `github.com/thesysdev/openui` (last commit Nov 11, 2026)
- **Edits by statement name**, `name = null` deletes (`mergeStatements` in `@openuidev/lang-core`).
- **Mount identity gap.** `packages/react-lang/src/Renderer.tsx`: `RenderNode` is memoized (`rendersSame` compares typeName, statementId, props), but array children are keyed by **position** (`<Fragment key={i}>`). Inserting a section mid-list shifts every later section's slot → possible remount or state swap → animations replay. Fixable by keying on `statementId` in our own container components.
- **Versions:** `@openuidev/react-lang` 1.1.0; OpenUI Lang 1.0 just shipped with breaking changes (lang-core, react-lang, react-ui, server must upgrade together).
- **`@openuidev/a2ui` 0.5.0 (experimental):** A2UI v1.0 envelopes (surfaces, data model, actions, functions) with OpenUI Lang statements as the component representation. Google's renderers can't read it, so it isn't interoperable — but it confirms the formats are converging (A2UI Express is itself "partly inspired by OpenUI Lang").

---

## 6. Other findings

### AG-UI subagents & interrupts
- Events: `SubagentStarted` (`subagentRunId`, `name`, optional `parentSubagentRunId`, `parentToolCallId`, …), `SubagentFinished` (`result`, `outcome`: `success` | `suspended` with `interruptIds`), `SubagentError`. Most events can carry `subagentRunId`; events without it belong to the parent.
- Frontend routing: group by `subagentRunId`, nest via `parentSubagentRunId`, show `suspended` as "waiting"; attributed state updates still apply to one run-scoped state document.
- **Interrupts are a draft**: a paused run ends with an interrupt outcome; the client starts a new run carrying per-interrupt responses. Implemented by Microsoft Agent Framework and LangChain deep agents.
- Lifecycle emission is opt-in on the producer side (older clients fail on the new types).

### Azure / GPT specifics
- **Prompt caching:** Azure caches long static prompt prefixes automatically → keep the catalog-derived system prompt fixed and first. This offsets most of A2UI's larger system prompt (output tokens are what caching can't help).
- **Lark grammar on custom tools:** GPT-5-series on Azure Foundry accepts `"format": {"type": "grammar", "syntax": "lark"}` on custom tools (Responses API; Chat Completions nests it under `custom`). We could generate a grammar from the catalog to force valid Express. Caveats: community reports conformance isn't always guaranteed, truncated outputs may not finish the grammar, and custom tools may not support parallel calls. **Optional upside to test, not a foundation.**
- **Strict structured outputs** (`json_schema`, `strict: true`) available from GPT-4o onward — relevant if we ever fall back to A2UI Direct JSON or json-render.
- **Microsoft stack:** Microsoft Agent Framework has no first-party A2UI support found; A2UI + MAF is documented only via CopilotKit (and a Telerik Blazor demo). Not a blocker — we generate A2UI ourselves.

---

## 7. The OpenUI benchmark — what it's worth

Source: openui.com/benchmarks (Thesys, vendor-run, Aug 2026). 46 screen briefs × 4 generations × 6 models = 1,104 runs per format. Temperature 0.7, minimal reasoning. Shared 70-component catalog **derived from OpenUI's own library**. Each format's prompt from its own SDK generator, same two worked examples. Harness + raw results: github.com/thesysdev/generative-ui-bench (19★, 2 commits, no license, no outside reproduction).

### Numbers (OpenUI vs A2UI; json-render for reference)
| Metric | OpenUI | A2UI | json-render |
|---|---|---|---|
| Structural validity (all models) | 96.9% | 95.6% | 82.8% |
| Validity, GPT-5.6 Sol | 99.5% | 96.2% | 82.6% |
| Validity by band 2–3 / 4–6 / 7–9 reqs | 100 / 99.6 / 98.8% | 99.6 / 98.8 / 94.2% | 89.6 / 81.7 / 85.4% |
| Validity 11–13 reqs | 91.1% | **91.7%** | 68.2% |
| Validity 16–18 reqs (most complex) | 90.6% | **93.2%** | 71.9% |
| Render success | 99.9% | 96.6% | 99.6% |
| Render success, GPT-5.6 Sol | 100% | 97.3% | 100% |
| Outcomes valid / partial / blank | 1,070 / 33 / 1 | 1,055 / 12 / **37** | 914 / 186 / 4 |
| Output tokens per screen | 1,362 | 2,823 | 3,258 |
| System prompt tokens | 5,031 | 12,610 | 7,651 |
| Cost per 46-screen pass, GPT-5.6 Sol | $3.08 | $6.84 | $6.30 |
| Est. streaming time per screen (@50 tok/s) | ~27 s | ~56 s | ~65 s |

Other GPT models on the board: GPT-5.6 Terra 98.4% validity, GPT-5.6 Luna 83.7% (not broken out by format). OpenUI Cloud production funnel (not benchmark data): ~7% fail validation, 0.9% reach users broken, 88% of failures repaired via incremental editing.

### What holds up
- OpenUI's compact format using fewer tokens than JSON is very likely true — Google built Express for the same reason.
- Method, harness and raw outputs are published and inspectable.

### What tilts it toward OpenUI
- **Old competitor versions:** A2UI **v0.9** (Python SDK pinned at commit `29b715fa…`), Express never mentioned → A2UI's token/cost rows likely reflect its verbose JSON format. json-render pinned at **0.19** (0.21+ shipped).
- **Home-field catalog** (derived from OpenUI's library).
- **No strict mode** for json-render.
- **Speed is estimated** from token counts, not measured.
- **"Valid" = structurally valid**, not correct or good-looking (the page says so).
- Chart axes start at 75% / 95%, visually exaggerating gaps.
- **Single-turn only — edits not tested at all.** Edits are our core use case.

### Read for us
- Validity: roughly even; A2UI better on complex screens.
- **A2UI's failure mode is all-or-nothing** (37 blanks vs OpenUI's 1) — must be measured and handled (retry/repair) in the PoC.
- Output tokens are the gap that matters (speed); Express vs OpenUI Lang on GPT is unmeasured.

### Kalaris Labs article ("Generative UI in AI", Oct 19–21, 2026)
A fair overview, **no new evidence**: its numbers come from the OpenUI benchmark and OpenUI's README (GPT-5 tokenizer, 7 scenarios: json-render 10,180 / Thesys C1 JSON 9,948 / OpenUI Lang 4,800 tokens). Also cites Google's generative-UI human-preference paper (Elo: expert sites 1800, generative UI 1736, Markdown 1438).
- **Agrees with us:** AG-UI is transport, not a UI format; "the model and pipeline (parsing, repair) matter more than the format"; catalog components for actions and approvals.
- **Useful point:** much of the token gap is the system prompt, which caching offsets — output tokens are what count.
- **Claim "OpenUI supports A2UI payloads":** partially true — `@openuidev/a2ui` exists but is an experimental OpenUI-Lang-inside-A2UI profile, not A2UI interop.
- **Ignore:** its "mixed systems" idea of open-ended HTML for explanations (breaks brand/animation control).
- **Adopt:** its benchmark wishlist → our PoC checks **button safety** (action matches what the button shows) and **consistency** (same request + same tab → same page across runs).

---

## 8. Final decision table: A2UI vs OpenUI

| Criterion | OpenUI | A2UI | Edge |
|---|---|---|---|
| Own visuals & animations | Our components (`defineComponent` + Zod) | Our components (`createComponentImplementation` + Zod) | Tie |
| **Components stay mounted** | Memoized, but list children keyed by position | Keyed by component ID, memoized, per-component subscriptions | **A2UI** |
| Streaming build | Root-first progressive | Incremental Express in the TS SDK | Tie |
| Edits by ID | Changed lines only | Changed IDs only + data-only `$path` updates | Tie (A2UI's data-only edits help) |
| Deleting a section | `section = null` | Rewrite parent's child list | **OpenUI** |
| Tabs | One renderer per tab, we track | Built-in surfaces | **A2UI** |
| Buttons / actions | `onAction`, custom actions | `{name, surfaceId, sourceComponentId, context}` + local functions | **A2UI** |
| Subagents later | Nothing specific | Per-surface catalogs, per-agent data isolation | **A2UI** |
| Validation / repair | Tolerant parser + Autofix | Compiler validates against catalog, errors fed back | Tie |
| GPT evidence | Docs show `gpt-5`/`gpt-5.5`; 99.5% on GPT-5.6 Sol | 96.2% on GPT-5.6 Sol (v0.9); Google data Gemini-only | **OpenUI** |
| Output tokens | 1,362/screen (benchmark) | 2,823 (v0.9 JSON); Express unmeasured | **OpenUI** (pending PoC) |
| Failure mode | Degrades to partial | More blanks (all-or-nothing) | **OpenUI** |
| Maturity | react-lang 1.1.0; Lang 1.0 just broke; startup | Spec v1.0 Current; react 0.15; TS agent 0.1.0; 3 breaking specs in ~12 mo | Both fast-moving |
| Exit / lock-in | MIT, own language | Open standard, many renderers | **A2UI** |
| Mobile later | Web only (+ 3rd-party Android) | Official Flutter / SwiftUI / Compose | **A2UI** |

**Why A2UI:** it wins on what we said is key — no remounts on edit, tabs, the button model, and subagent scalability — and on long-term exit. OpenUI's advantages (tokens vs Express unproven, simpler delete, more GPT evidence) are real but smaller.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Spec churn (3 breaking versions in ~12 months), packages 0.x | Pin versions; wrap A2UI behind one small adapter (parse + render only). Our components, tab cards, action handler, transport and data contract don't depend on it |
| `@a2ui/agent` TS SDK is 0.1.0 | PoC exercises it end to end; we can fall back to Direct JSON + our own validation, or contribute fixes upstream |
| GPT not proven by Google | PoC on our actual Azure deployment (§10) |
| All-or-nothing failures (blank screens) | Measure; validate-and-retry loop with compiler errors fed back; keep last good surface on screen |
| No per-component delete | Model rewrites parent's child list; measure accuracy of removal edits |
| Output tokens higher than OpenUI? | Measure Express on GPT; optional Lark grammar; keep prompts cached |
| No formal surface ownership for subagents | Surface-ID convention (`<agent>:<uuid>`), backend enforces which agent may write which surface |
| Exit | OpenUI (with `statementId`-keyed containers) or json-render — renderer swap, not a rewrite |

---

## 10. PoC plan (A2UI Express on Azure GPT)

Setup: port 2–3 components (`Header`, `Verdict`, `ProductRow`) + an `OrderTracker`, a 6-laptop catalog slice, static catalog-derived system prompt, tiny Node server, AG-UI-shaped SSE.

1. **Output tokens & wall-clock time** per build and per edit, prompt cached — compare against an OpenUI run of the same tasks. Decides whether OpenUI's cost/speed edge is real.
2. **Edit accuracy:** "compare 3 laptops" → "add colour accuracy" → "only OLED" → "drop this one", 20 runs each. Count wrong or extra changes; check the removal edit (parent child-list rewrite).
3. **Mount test:** insert a section mid-page; nothing else may remount or replay its animation. (Expected to pass given ID-keyed children — verify.)
4. **Blank-screen rate** and validation/repair behaviour (compiler errors fed back).
5. **Multi-tab routing:** two tabs open, "make the second one OLED only" → router edits the right surface via tab cards.
6. **Mock refund subagent:** opens its own surface with a support catalog; an action from it round-trips to the backend.
7. **Saved-tab restore:** card + snapshot → $0 model calls; "buy" from a tab saved yesterday re-reads the current price server-side.
8. **Button safety:** every generated button's action targets the product/order it displays.
9. **Consistency:** same request + same tab → same page across runs.
10. **Optional:** Lark grammar from the catalog on GPT-5-series custom tools — does it cut invalid outputs?

---

## Sources

**A2UI:** [repo](https://github.com/a2ui-project/a2ui) (`typescript/agents/a2ui_agent/src/inference-formats/express/response-stream.ts`, `conformance/agent/express/`, `typescript/renderers/react/src/node-view.tsx`) · [v1.0 spec](https://a2ui.org/specification/v1.0-a2ui/) · [protocol doc](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md) · [defining a catalog](https://a2ui.org/guides/defining-a-catalog/) · [SDKs & renderers](https://a2ui.org/concepts/sdks/) · [ecosystem renderers](https://a2ui.org/ecosystem/renderers/) · [Google launch](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) · [Fast, reliable A2UI (Express)](https://developers.googleblog.com/en/fast-reliable-a2ui/) · [a2ui_agent Dart changelog](https://pub.dev/packages/a2ui_agent/changelog) · [CrewAI A2UI docs](https://docs.crewai.com/v1.15.33/en/learn/a2ui.md) · [A2UI + A2A tutorial](https://dev.to/czmilo/the-complete-developer-tutorial-building-ai-agent-uis-with-a2ui-and-a2a-protocol-in-2026-3fl9)

**OpenUI:** [repo](https://github.com/thesysdev/openui) (`packages/react-lang/src/Renderer.tsx`, `packages/a2ui/README.md`, `packages/a2ui/CHANGELOG.md`) · [docs (llms-full)](https://www.openui.com/llms-full.txt) · [benchmarks](https://www.openui.com/benchmarks) · [methodology](https://www.openui.com/benchmarks/methodology) · [benchmark harness](https://github.com/thesysdev/generative-ui-bench) · [LangChain integration](https://docs.langchain.com/oss/javascript/langchain/frontend/integrations/openui)

**json-render:** [repo](https://github.com/vercel-labs/json-render) · [streaming docs](https://json-render.dev/docs/streaming) · [@json-render/core 0.13.0 diff](https://socket.dev/npm/package/@json-render/core/diff/0.13.0) · [InfoQ](https://www.infoq.com/news/2026/03/vercel-json-render) · [release notes](https://releasebot.io/updates/vercel-labs/json-render)

**AG-UI & Microsoft:** [subagents](https://docs.ag-ui.com/concepts/subagents) · [interrupts (draft)](https://docs.ag-ui.com/drafts/interrupts) · [MAF human-in-the-loop](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/human-in-the-loop) · [AG-UI .NET SDK](https://devblogs.microsoft.com/dotnet/ag-ui-dotnet-sdk/) · [CopilotKit: A2UI with MAF](https://docs.copilotkit.ai/ms-agent-python/generative-ui/a2ui)

**Azure / OpenAI:** [Foundry reasoning models (Lark custom tools)](https://learn.microsoft.com/en-my/Azure/foundry/openai/how-to/reasoning) · [Lark conformance thread](https://community.openai.com/t/gpt-5-custom-lark-tool-outputs-are-not-guaranteed-to-conform-to-the-cfg/1337673?page=2) · [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

**Articles:** [Kalaris Labs: Generative UI in AI](https://kalarislabs.com/blog/generative-ui-in-ai) · [Stream Android generative UI](https://getstream.io/chat/docs/sdk/android/guides/ai-integrations/generative-ui/)
