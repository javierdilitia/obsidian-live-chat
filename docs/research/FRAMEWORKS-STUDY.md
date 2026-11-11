# Chatbot 2.0: generative-UI framework & protocol alternatives

**Companion to [OPENUI-STUDY.md](OPENUI-STUDY.md).** Two research rounds (Nov 2026):

- **Round 1 — frameworks:** json-render (Vercel), CopilotKit, mdocUI, tambo, llm-ui, assistant-ui.
- **Round 2 — protocols & taxonomy:** A2UI (Google/a2ui-project), AG-UI (transport protocol), Open-JSON-UI, plus the three-pattern taxonomy from CopilotKit's "Developer's Guide to Generative UI in 2026".

Each candidate was evaluated by a dedicated research agent against our exact requirements, reading official docs, specs and source. Full agent citations are summarized below.

## 0. What the framework must do (our job description)

1. **Our typed component tree, IDs not values.** Claude emits only registered components (`Header`, `Verdict(productId, text)`, `ProductRow([ids])`, `SpecTable([ids], keys)`, `Radar`, `Section(children)`, `OrderTracker(id)`), schema-validated. Prices/specs/images resolve from our catalog at render time. No free HTML/markdown ever.
2. **Patch in place.** Follow-ups update the open page by name/section; we need the *change set* as a signal (for step-back + glow). Whole-page regeneration per turn is the thing we're trying to avoid.
3. **No chat transcript.** Pure renderer or headless pieces we drive from our own command-bar + tabs agent loop.
4. **Direct Claude from our backend**, prompt-cache friendly (static system prompt / stable tool schemas).
5. **Serialize/restore** a built page with $0 model cost (saved tabs).
6. **Local actions** (add to cart, modals, popovers) — no model round trip.
7. React acceptable (React 19 fine). Vite preferred over Next-only.

## 1. The three patterns of generative UI

CopilotKit's 2026 guide frames the space along one axis — **how much control stays in the frontend vs how much freedom the agent gets**:

| Pattern | Control | What the agent does | Examples |
|---|---|---|---|
| **1. Static** | High control, low freedom | Picks a *predefined* component and fills it with data. Layout and interactions fully owned by the app. | CopilotKit `useFrontendTool`; assistant-ui tool-UI; tambo's flat tool calls |
| **2. Declarative** | Shared control | Returns a *structured UI spec* (components, state, actions); the frontend renders it with its own constraints and styling. | **A2UI**, Open-JSON-UI, json-render, OpenUI, mdocUI |
| **3. Open-ended** | Low control, high freedom | Returns a full UI surface (HTML/iframe); the frontend mainly hosts it. | MCP Apps |

Three observations that matter for us:

- **Our mockup today *is* the static pattern.** `decide()` + `nextState()` pick a predefined page kind and fill parameters (`{page:"compare", set, color}`). Chatbot 2.0 is the move up the axis: the model composes sections freely — but only within our registry.
- **Pattern 2 splits in two, and the article glosses over it.** Its declarative examples use *fixed generic vocabularies* (A2UI's Basic Catalog: `Text`, `TextField`, `Button`…) — renderable anywhere, but incapable of expressing a `SpecTable`, `Radar` or authored product renders. What we need is a **custom-catalog declarative** approach, where the vocabulary *is* our component library. A2UI's spec explicitly supports this (see §5) — that's the make-or-break question for any declarative candidate.
- **Pattern 3 was ruled out in OPENUI-STUDY**: model-written HTML "gives up brand control. Not suitable for 'black, very slick'."

The guide also positions **AG-UI as the substrate under all three patterns** — "not a UI specification" but the event/state transport. That's a layer claim, and it's correct, which leads to:

## 2. The layer model — don't compare across layers

The round-2 research clarified that our candidates occupy **different layers**:

```
4. Integrated shells        CopilotKit, assistant-ui (own the whole loop, UI included)
3. Renderer + registry      @a2ui/react + our catalog · @json-render/react + registry · @openuidev/react-lang
2. UI spec / protocol       A2UI messages · json-render spec (JSON Patch) · OpenUI lang · mdocUI AST · Open-JSON-UI (draft)
1. Transport / events       AG-UI (SSE events) — or plain SSE with our own event names
```

- **CopilotKit** spans all four layers (that's why it's heavy); its experimental surfaces system is built *on A2UI ops*.
- **json-render / OpenUI / A2UI** are layer 2+3 — they define what the model writes and render it; transport-agnostic underneath.
- **AG-UI** is layer 1 only. It doesn't render anything, doesn't constrain the spec — it's the envelope.
- **Open-JSON-UI** (the article's other declarative spec): research found **no public spec exists** — the repo 404s, the directory entry is an empty draft, and CopilotKit's own docs page now redirects to their A2UI page. Not actionable; ignore it.

So the real decisions are two: **layer 2+3** (json-render vs OpenUI vs A2UI) and **layer 1** (AG-UI envelope vs plain SSE).

## 3. Decision matrix (layer 2+3 candidates)

| Requirement | json-render | OpenUI | **A2UI** | assistant-ui | CopilotKit | mdocUI | llm-ui | tambo |
|---|---|---|---|---|---|---|---|---|
| Our typed components, nested trees | ✅ catalog + registry (Zod) | ✅ defineComponent | ✅ **custom catalogs are the documented production pattern** | ✅ GenerativeUILibrary | ⚠️ surfaces system (**Experimental**) | ✅ Zod registry | ❌ flat text blocks only | ❌ flat, one per call |
| **Patch/edit in place** | ✅ wire format IS JSON Patch; `newPatches` | ✅ edit mode, named lines | ✅ `updateComponents` **by id** + `updateDataModel` (paths); the message stream *is* the diff | ⚠️ interactables but **`unstable_`** | ✅ documented, but Experimental | ❌ DIY (no stable node IDs) | ❌ append-only | ⚠️ pre-placed only |
| No chat paradigm | ✅ standalone mode | ✅ renderer only | ✅ surfaces, not threads | ⚠️ thread-shaped runtime | ⚠️ thread-shaped; headless OK | ✅ pure renderer | ✅ pure renderer | ❌ thread model is load-bearing |
| Direct Claude + caching | ✅ static prompt string | ✅ own backend | ✅ model-agnostic SDK; static catalog-derived prompt (Claude proven only via community pkg) | ✅ ChatModelAdapter | ✅ factory mode | ✅ prompt string | ✅ string | ❌ LLM loop locked in their backend |
| Serialize / restore, no model | ✅ plain JSON spec | ✅ build/parseMessage | ✅ message-log replay + single-message `createSurface` snapshot (glue is ours) | ✅ export/import | ⚠️ DIY | ✅ string/AST | ✅ string | ⚠️ their Postgres |
| Local actions | ✅ named actions | ✅ onAction | ✅ both local (`functionCall`) and agent actions; inputs never hit the network | ✅ action registry | ✅ local functions | ✅ onAction | ✅ plain React | ✅ + client tools |
| Streaming progressive render | ✅ SpecStream per line | ✅ root-first | ✅ JSONL; children may arrive before parents; placeholders | ✅ per-prop | ✅ streamed args | ✅ char-level parser | ✅ its best feature | ⚠️ OpenAI-centric streaming |
| Token efficiency of output | ⚠️ JSONL boilerplate; YAML format mitigates | ✅ compact DSL (benchmarked) | ✅ **A2UI Express DSL: ~3× fewer tokens than Direct JSON** (Google's numbers) | ⚠️ flat merged schema | ⚠️ catalog + auto-guide | ✅ markdown+tags | n/a (text) | ⚠️ props size |
| Maturity (Nov 2026) | 19.5k★, Vercel Labs, very active | young ecosystem | **~17k★, Google-led, v1.0 spec, very active; 3 breaking versions in ~12 mo** | generative-ui pkg 0.0.x | key system Experimental | alpha, 1 maintainer | **unmaintained since 2024** | **cloud shut down Oct 2026** |
| Verdict | **Strong fit** | **Strong fit** | **Strong fit** | Partial | Partial | Partial (too young) | Poor | Poor |

## 4. Round-1 findings (frameworks)

### json-render (Vercel Labs) — strong fit
Catalog (`defineCatalog`, Zod 4) + renderer registry; LLM output is **plain text: JSONL of RFC 6902 JSON-Patch ops** against a flat keyed spec. Standalone mode = "generated UI is the whole response". Patch-native: `newPatches` per streamed chunk is exactly our glow signal; `@json-render/yaml` documents `previousSpec` multi-turn editing. Serialization trivial (`examples/no-ai`). Static prompt string → ideal cache prefix. Risks: pre-1.0 churn; prompt-based constraint (not grammar-enforced); **React ≥19.2**; unchanged-element re-render semantics not documented — verify in PoC.

### CopilotKit — partial fit
New "components & surfaces": nested typed components via slots, **`bind` hides bound props from the agent** (exact IDs-not-values), documented in-place surface updates, local functions, headless, factory-mode agents. But that system is **Experimental** (A2UI 1.0 candidate), runtime is thread-shaped, `react-core` heavy. Its fallback mode embeds json-render — i.e., the stable path is CopilotKit-as-transport around someone else's renderer. Full report: `research/copilotkit-research.md`.

### mdocUI — partial fit, too young
Markdown + `{% spec-table ids=["a","b"] /%}` tags; char-level streaming parser; Zod registry; unknown tags dropped; web-components adapter (React optional). No patch/edit mode, no stable node IDs; alpha, single maintainer, 46★. A protocol to learn from, not a foundation.

### tambo — poor fit
**Cloud shut down Oct 31, 2026**; team pivoted. Flat one-component-per-tool-call; in-place updates only for pre-placed interactables; LLM loop must live in their backend; no prompt caching in source. Mine for patterns only.

### llm-ui — poor fit (wrong category)
Streaming chat/markdown *text-block* renderer, not a component-tree composer. Flat blocks, no nesting, no patching. Unmaintained since June 2024, React 18 only. Possible cameo rendering prose inside artifacts; not a core.

### assistant-ui — partial fit, strong engine with unstable seams
`GenerativeUILibrary` = typed registry, nested trees, standalone artifact surfaces, local `$action` registry, `renderGenerativeUI` standalone restore, ExternalStoreRuntime, Vite. But generative-ui pkg is 0.0.x (~1 month), interactables `unstable_`, flat merged tool schema, thread-shaped runtime. API churn exactly where we'd depend on it.

## 5. A2UI — strong fit (round 2)

**What.** Open protocol from Google (Dec 2025), now at `github.com/a2ui-project/a2ui`, Apache-2.0, ~17k★, **v1.0 spec** (very active — releases this month). Three layers: (1) the LLM emits an *inference format* — default **A2UI Express**, a compact Python-like DSL (~3× fewer output tokens than Direct JSON per Google's benchmarks) — (2) the Agent SDK validates and compiles it into **JSONL wire messages**, transport-agnostic (AG-UI, A2A, MCP, SSE, WS), (3) native renderers map a **component catalog** to real widgets (React stable; Lit, Angular; Flutter/Compose alpha; SwiftUI).

**The make-or-break answer: custom catalogs are the designed production path.** The spec says it outright: *"most production applications will define their own catalog to reflect their specific design system"*, and recommends catalogs *"directly reflect your client's component library rather than trying to map a generic catalog (like the Basic Catalog) to it through an adapter."* So `SpecTable`/`Radar`/`ProductRow` become catalog entries: JSON-Schema-typed props, prompt auto-generated from the catalog, every outgoing message validated against it (invalid output fed back for self-correction), composition rules (`Verdict` only under `Header`) enforceable. **This overturns OPENUI-STUDY's "heavier protocol / generic widgets" concern** — v1.0 even *removed* theming from the wire entirely ("defer visual styling to the target framework's native theme"), so brand control is total.

**Patch semantics map one-to-one onto our signature feature.** v1.0 messages: `createSurface`, `updateComponents` (**by id** — unmentioned ids untouched), `updateDataModel` (JSON-Pointer path upserts, separate from structure), `deleteSurface`. No implicit diffing — *the message stream is the diff*: the glow animations key off the component ids in each `updateComponents` + paths in `updateDataModel`, zero tree-diffing in our app. Follow-ups patch the known `surfaceId` directly. Wart: **no per-component delete** in v1.0 — removing a section = editing the parent's child list (orphan isn't rendered). Fine, but felt on "drop this product" edits.

**IDs-not-values:** cleanly supported — simplest is our `SpecTable` React component taking `productIds`/`keys` as validated props and resolving from the catalog itself; optionally renderer-side catalog *functions* (`{"@call":"resolvePrice", "args":{...}}`, `allowedCallers:"rendererOnly"`) resolve values locally with no network. **Actions:** both kinds in spec — agent round-trips (`action.event`) and local (`action.functionCall`); two-way-bound inputs never touch the network. **Serialization:** no built-in snapshot message, but state is a pure function of the ordered message log → replay = restore; and v1.0 added **single-message UI instantiation** (complete `components` + `dataModel` in one `createSurface`), so a saved tab can be one JSON object.

**Risks (blunt):** shipped three breaking spec versions in ~12 months, packages still 0.x with breaking changes as recently as last week; ecosystem gravity is Gemini/Google-ADK-first — **Claude is proven only by a tiny community bridge** (`anthropic-a2ui` 0.1.x, Python); for production we'd replicate its approach on the official `@a2ui/agent` SDK in Node. Multi-platform (Flutter/Compose/SwiftUI) is A2UI's marquee strength — not needed today, a free option later.

## 6. AG-UI — transport verdict: "AG-UI-compatible", not AG-UI-dependent

**What.** MIT event protocol (v1.0, Sep 2026; 17.1k★; `@ag-ui/core` ~15.8M downloads/month). One layer below everything above: frontend POSTs a `RunAgentInput`, backend streams **31 typed SSE events** in 8 families (lifecycle brackets, text/tool-call/reasoning streaming, **`STATE_SNAPSHOT` + `STATE_DELTA` = RFC 6902 JSON Patch**, activities, subagents, `CUSTOM` passthrough). Only `RUN_STARTED/FINISHED/ERROR` are mandatory — everything else is optional.

**Governance is the honest caveat:** born from CopilotKit, working group on CopilotKit's calendar, commercial support sold by CopilotKit — no foundation (unlike A2A → Linux Foundation). But adoption is genuinely multi-vendor: Microsoft Agent Framework, Google ADK, AWS Bedrock AgentCore (Amazon documents its own AG-UI contract), Mastra, Pydantic AI, LlamaIndex.

**Our loop maps cleanly, with tax.** Routing call → a fast run whose `RUN_FINISHED.result` (or a `CUSTOM` event) carries `{edit|new|switch}`; main build → `STATE_SNAPSHOT` (new page) or `STATE_DELTA` (patch ops — *literally our patch model, already specified*); local actions → nothing (AG-UI only moves on runs); saved tabs → our storage (no artifact concept in the protocol). Tax: everything is a bounded "run" on a "thread", `messages` is a required field — mildly chat-shaped bookkeeping on a no-transcript design; no stream resumption; Node server-side story is the thinnest of the SDKs (though a documented custom-encoder path exists: `@ag-ui/encoder`, no CopilotRuntime needed).

**Verdict from the agent, which we adopt:** don't take the dependency — **keep our own SSE endpoint but make it AG-UI-shaped**: `data: {"type":...}` framing, `RUN_*` brackets, and *verbatim* its two proven semantics — RFC 6902 deltas for page edits and text-chunk streaming for spec JSON. Exit cost stays near zero; if we later want ecosystem devtools or third-party consumers (Bedrock AgentCore surfaces, OpenBot, CopilotKit), full migration is mechanical on our side only.

## 7. Recommendation (updated)

**The layer-2/3 PoC becomes a three-way: json-render vs OpenUI vs A2UI** — the only three with custom-vocabulary + patching as first-class, stable-ish concerns. Everyone else either experiments (CopilotKit, assistant-ui), is too young (mdocUI), wrong category (llm-ui), or dead (tambo). Independently of the winner: adopt the **AG-UI-compatible SSE envelope** (§6).

How they differ for us:

| | json-render | OpenUI | A2UI |
|---|---|---|---|
| Patch mechanism | RFC 6902 ops (model-written) | Named-line edits in compact DSL | `updateComponents` by id + data-model upserts |
| Diff signal for glow | `newPatches` from stream compiler | parse the patch yourself (open question #1) | message stream *is* the diff |
| Token story | JSONL boilerplate; YAML mitigates | compact DSL, benchmarked | A2UI Express DSL (~3× vs JSON, Google's numbers) |
| Stewardship | Vercel Labs, 19.5k★ | Thesys, young | Google-led, ~17k★, v1.0 spec |
| Claude evidence | provider-neutral, untested with Claude specifically | benchmarked with Sonnet/Opus | community Python bridge only |
| Extra weight | none (pure renderer) | none (renderer) | surfaces/data-model/negotiation machinery (we'd use a fraction); multi-platform renderers free later |
| Known warts | React ≥19.2; re-render identity undocumented | CDN custom components undocumented; OUI-1 model drift risk | no per-component delete; snapshot glue ours; protocol churn |

### PoC plan (1–2 days, three candidates)
1. Port 2–3 components (`Header`, `Verdict`, `ProductRow`) + a 6-laptop catalog slice; static catalog-derived system prompt; direct Claude Sonnet from a tiny Node server over an AG-UI-shaped SSE stream.
2. **Patching test:** "compare 3 laptops" → "add colour accuracy" → "only OLED" → "show every panel type". Measure: does the model emit only changed lines/ops/ids? Do unchanged sections skip re-render? Is the change set enough to drive step-back + glow? (For A2UI, also test the no-delete wart on a removal edit.)
3. **Reliability:** 20 runs per candidate; count invalid outputs, validation/repair behavior (A2UI's self-correction feedback vs json-render's `validateSpec` vs OpenUI's parser).
4. **Cost:** tokens in/out per build and per follow-up, with and without prompt caching (Express vs JSONL vs OpenUI lang).
5. **Serialization round-trip:** save spec/page/messages → restore tab → verify $0 model calls and correct prices after a catalog mutation.

The quick "make the mockup live" path from the prior study (Claude tool calls + our own JSON page format, no framework — i.e., the *static pattern*) remains unchanged as the no-rewrite demo option.

## Sources

**Round 2 (protocols & taxonomy):**
- Article: [The Developer's Guide to Generative UI in 2026 (CopilotKit/dev.to)](https://dev.to/copilotkit/the-developers-guide-to-generative-ui-in-2026-1bh3) · playground: [generative-ui-playground](https://github.com/CopilotKit/generative-ui-playground)
- A2UI: [repo](https://github.com/a2ui-project/a2ui) · [v1.0 spec](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md) · [evolution guide](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/evolution_guide.md) · [defining your own catalog](https://a2ui.org/guides/defining-your-own-catalog/) · [client setup](https://a2ui.org/guides/client-setup/) · [Google launch](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) · [Fast, reliable A2UI (Express benchmarks)](https://developers.googleblog.com/en/fast-reliable-a2ui/) · [anthropic-a2ui bridge](https://pypi.org/project/anthropic-a2ui/)
- AG-UI: [repo](https://github.com/ag-ui-protocol/ag-ui) · [1.0 spec](https://docs.ag-ui.com/spec/1.0/basic/index.md) (events · [transports](https://docs.ag-ui.com/spec/1.0/basic/transports/http-sse.md) · [state](https://docs.ag-ui.com/spec/1.0/events/state.md) · [tool calls](https://docs.ag-ui.com/spec/1.0/events/tool-calls.md)) · [server quickstart (custom encoder, no CopilotKit)](https://docs.ag-ui.com/quickstart/server.md) · [generative-UI specs positioning](https://docs.ag-ui.com/concepts/generative-ui-specs.md)
- Open-JSON-UI: no public spec found — [directory entry (draft, empty)](https://agentprotocols.app/protocol/open-json-ui); CopilotKit's Open-JSON-UI docs page now redirects to their A2UI page.

**Round 1 (frameworks):**
- json-render: [GitHub](https://github.com/vercel-labs/json-render) · [docs](https://json-render.dev/docs/streaming) · [yaml pkg](https://github.com/vercel-labs/json-render/blob/main/packages/yaml/README.md) · [no-ai example](https://github.com/vercel-labs/json-render/tree/main/examples/no-ai)
- CopilotKit: [GitHub](https://github.com/CopilotKit/CopilotKit) · [generative-ui overview](https://docs.copilotkit.ai/concepts/generative-ui-overview) (full report in `research/copilotkit-research.md`)
- mdocUI: [GitHub](https://github.com/mdocui/mdocui) — not related to vhfmag's mdoc; syntax derived from Stripe's Markdoc, own parser
- tambo: [shutdown announcement](https://tambo.co/blog/posts/tambo-is-shutting-down) · [SELF-HOSTING.md](https://github.com/tambo-ai/tambo/blob/main/SELF-HOSTING.md)
- llm-ui: [GitHub (richardgill/llm-ui)](https://github.com/richardgill/llm-ui) — mdb/llm-ui is 404; unmaintained
- assistant-ui: [GitHub](https://github.com/assistant-ui/assistant-ui) · [generative-ui guide](https://www.assistant-ui.com/docs/tools/generative-ui) · [interactables](https://www.assistant-ui.com/docs/tools/interactables)
