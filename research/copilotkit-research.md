# CopilotKit — Deep Research for "Chatbot 2.0" (browser-shell retail assistant)

Researched Nov 10, 2026 from official docs (docs.copilotkit.ai), the GitHub repo, npm registry, and funding press. All load-bearing claims cite a source. Items the docs don't cover are marked **not documented**.

---

## 1. What it is, maturity, architecture

CopilotKit is an MIT-licensed open-source "Frontend Stack for Agents & Generative UI" for React (plus Angular, Vue, React Native, Slack/Teams). It's built by CopilotKit Inc. (Seattle startup), who also created and maintain the **AG-UI protocol** (adopted by Google, Microsoft, AWS, LangChain, Mastra, PydanticAI, etc.).
[README](https://github.com/CopilotKit/CopilotKit)

- **Stars/forks/activity:** 38,604 stars, 4,816 forks, 19,662 commits; last push **Nov 10, 2026** (the day of this research) — extremely active. Current npm `@copilotkit/react-core@1.85.0`. ([GitHub API](https://api.github.com/repos/CopilotKit/CopilotKit), [npm](https://registry.npmjs.org/@copilotkit/react-core/latest))
- **Funding:** $27M Series A (May 2026), led by Glilot Capital, NfX, SignalFire. ([CopilotKit blog](https://www.copilotkit.ai/blog/series-a), [TechCrunch](https://techcrunch.com/2026/05/05/copilotkit-raises-27m-to-help-devs-deploy-app-native-ai-agents/))
- **Architecture:** three layers — (1) frontend SDK (`@copilotkit/react-core/v2`) with prebuilt chat + headless hooks; (2) **CopilotRuntime**, a request handler you mount in *your own* server (Next.js, Express, Hono, Bun, Deno, Workers); (3) any AG-UI-compatible agent (their Built-in Agent, LangGraph, Mastra, … or your own). They talk over **AG-UI**: 16 standardized event types (text deltas, tool calls, state snapshots/deltas, lifecycle) streamed over SSE. A commercial layer, **CopilotKit Intelligence** (durable threads, replay, learning), is optional and self-hostable. ([Architecture](https://docs.copilotkit.ai/concepts/architecture))

## 2. Component model (the core question)

CopilotKit ships **three generations** of generative UI ([overview](https://docs.copilotkit.ai/concepts/generative-ui-overview)):

**(a) Controlled / Components-as-Tools — flat, one component per tool call.**
`useComponent({ name, description, parameters: zodSchema, render: YourComponent })` registers a React component as a tool; the LLM calls it and CopilotKit renders it with the tool args as typed props. Zod-schema validated. But one call = **one component instance with flat props** — no nested trees. This is the current v2 form of the older `useCopilotAction` render-prop API. ([Components as Tools](https://docs.copilotkit.ai/generative-ui/tool-based))

**(b) Components & surfaces — nested trees of YOUR typed components. THIS is the one that matters for us.** You author a **catalog** with `createGenerativeUI`: each component has a Zod (or any Standard Schema: ArkType, Valibot) props schema, a description, and — crucially — **`slots: { children: "multiple" }`** and `child()` / `childList()` references *anywhere inside a prop schema*, so the LLM composes arbitrary nested trees (`Section > [Verdict, ProductRow([ids]), SpecTable([ids],[keys]), Radar([ids])]`). Props are schema-validated synchronously at render, operations are checked by the runtime while streaming and re-checked in the browser. Marked **Experimental** (implements A2UI 1.0, spec revision Oct 2026; "the API of this feature can change"). ([Catalogs](https://docs.copilotkit.ai/generative-ui/components/catalogs), [Components & surfaces](https://docs.copilotkit.ai/generative-ui/components))

```tsx
// catalog.tsx — sketch with OUR components
import { z } from "zod";
import { createGenerativeUI, child, childList,
         type GenerativeUIComponentProps } from "@copilotkit/react-core/v2/generative-ui";

export const shopUI = createGenerativeUI({
  id: "wow/shop@1",
  state: { catalog: catalogSchema },            // app state, agent never sees it
  functions: { addToCart: { description: "Add to cart",
                            parameters: z.object({ productId: z.string() }) } },
  components: {
    Header:    { component: Header, props: z.object({ title: z.string(), sub: z.string().optional() }) },
    Verdict:   { component: Verdict, props: z.object({ productId: z.string(), text: z.string() }) },
    ProductRow:{ component: ProductRow, props: z.object({ ids: z.array(z.string()), tags: z.array(z.string()).optional() }) },
    SpecTable: { component: SpecTable, props: z.object({ ids: z.array(z.string()), specKeys: z.array(z.string()) }) },
    Radar:     { component: Radar, props: z.object({ ids: z.array(z.string()) }) },
    OrderTracker:{ component: OrderTracker, props: z.object({ orderId: z.string() }) },
    Section:   { component: Section,
                 props: z.object({ title: z.string() }),
                 slots: { children: "multiple" } },   // nested children
  },
});

// IDs-not-values: resolve price/specs from OUR catalog at render time via `bind`
SpecTable: {
  component: SpecTable,
  props: z.object({ ids: z.array(z.string()), specs: z.array(z.array(z.string())) }),
  bind: { specs: (state, { ids }) => ids.map(id => state.catalog[id].specs) }, // agent never sets specs
}
```

The `bind` mechanism is a documented exact match for "components take product IDs, never values": bound props are filled from app state (registered via `useGenerativeUIState`), and **"the agent never sets a bound prop and does not see it."** ([State and actions](https://docs.copilotkit.ai/generative-ui/components/state-and-actions))

**(c) BYO renderer recipes** — JSON Render (`@json-render/react`) and Hashbrown (`@hashbrownai/react`) demos show wiring *your own* component registry to a `{root, elements}` / `{ui:[...]}` JSON spec the agent emits, with progressive streaming (Hashbrown). These are recipes, not productized APIs. ([JSON Render](https://docs.copilotkit.ai/generative-ui/json-render), [Hashbrown](https://docs.copilotkit.ai/generative-ui/hashbrown))

## 3. Output format & token efficiency

- **Tool transport (default):** when a run carries a catalog, the runtime injects a `render_ui` tool; the LLM emits a **tool call with JSON args** (A2UI 1.0 operations: `createSurface`, `updateComponents`, `updateDataModel`…). The runtime validates operations **as they stream**; the browser renders valid ones immediately. A **markdown transport** alternative exists (`a2ui` code blocks in the reply) for agents that can't call tools. ([Transports](https://docs.copilotkit.ai/generative-ui/components/transports), [A2UI fixed-schema](https://docs.copilotkit.ai/generative-ui/a2ui/fixed-schema))
- **Streaming:** args arrive as AG-UI `TOOL_CALL_ARGS` delta events → progressive render ("The table fills in while the agent writes it"). ([Connect AG-UI agents](https://docs.copilotkit.ai/backend/ag-ui), [custom-agent event examples](https://docs.copilotkit.ai/backend/custom-agent))
- **Token cost:** each run carries the catalog + an auto-generated guide ("a small catalog gets a short guide"); the full 69-component standard catalog is the largest contributor and you can `omit` from it. Bound props and locally-handled events are **not** sent to the model. A2UI was designed LLM-friendly/JSONL-streaming-first. ([Transports — Cost in tokens](https://docs.copilotkit.ai/generative-ui/components/transports), [A2UI](https://docs.copilotkit.ai/generative-ui/a2ui))

## 4. In-place patching

**Documented, first-class — in the components-and-surfaces feature.** On every run the agent is told "the surfaces that already exist, **so it can update one in place instead of building a new one**", and A2UI operations include `updateComponents`/`updateDataModel` against existing component IDs. The docs' own example: a rendered table, then a follow-up "add a column for support" → "changes it in place." User-typed values (`writable` props) are protected from agent overwrite. ([Surfaces — What the agent knows](https://docs.copilotkit.ai/generative-ui/components/surfaces), [A2UI fixed-schema operations](https://docs.copilotkit.ai/generative-ui/a2ui/fixed-schema), [Components & surfaces](https://docs.copilotkit.ai/generative-ui/components))

Caveats:
- "Only changed sections glow/animate" is **not documented** as a built-in — but you get stable component IDs + React reconciliation, so layering our own changed-section animation looks feasible (we know which IDs an `updateComponents` targets). The exact public hook to observe per-operation updates from app code: **not documented** (Inspector shows it; likely reachable via AG-UI event subscription — verify in a PoC).
- The older Controlled path (`useComponent`) and the Hashbrown/JSON-Render recipes render **fresh per turn** — patching there means diffing ourselves (as we do today).

## 5. Serialization / restore without a model call

Three tiers:
- **Paid/self-hosted Intelligence:** "AG-UI Streams" replay restores messages, tool calls, **generative UI**, and app state across reloads/devices. ([Threads](https://docs.copilotkit.ai/threads))
- **OSS runtime:** the `AgentRunner` abstraction is explicitly for owning persistence — `InMemoryAgentRunner` (default), first-party `SqliteAgentRunner` (durable file), or **subclass to re-hydrate threads from your own store** on `connect()`; `GET /threads/:threadId/messages` returns history. Restoring replays stored AG-UI events — **no model call**. ([AgentRunner & persistence](https://docs.copilotkit.ai/backend/agent-runner))
- **DIY:** a surface is just JSON ops + your catalog; since rendering is deterministic, saving/restoring the JSON yourself (e.g. per tab) is straightforward. A first-class "export this page" API: **not documented** — but for our tabbed-pages product this is the natural fit anyway (our backend already stores pages).

## 6. Local interactivity without a model round trip

**Yes, explicitly.** Catalog `functions` + component `events` + a mounted handler via `useGenerativeUIFunction`. Docs: *"'Add to cart' must add to the cart, **with no message to the agent**."* Handlers run locally, return typed results (progress/error surfaceable), and in the current version **the agent cannot call renderer functions at all** (`allowedCallers: "rendererOnly"` default; `callRendererFunction` operations are rejected). Also: `bind` props live-update from app state; `@call` function values (`calc`, `formatCurrency`, …) compute in the browser; `writable` props preserve user input. Events that match *no* local function optionally become a user message to the agent (opt-in per event, with structured action metadata in `forwardedProps`). ([State and actions](https://docs.copilotkit.ai/generative-ui/components/state-and-actions))

## 7. Chat-transcript assumptions (we have NO transcript)

The runtime's mental model is still **a message thread** (`agent.messages`, `threadId`, one user message per run) — but the chat **UI is fully optional**:
- Headless is documented: `useAgent` (messages, state, `isRunning`, event subscription) + `copilotkit.runAgent()` — "Trigger your agent from any component — **no chat UI required**. This is the same method `<CopilotChat/>` uses internally." ([Programmatic control](https://docs.copilotkit.ai/programmatic-control), [Headless UI](https://docs.copilotkit.ai/custom-look-and-feel/headless-ui))
- **Surfaces render anywhere on the page, outside any chat:** `<GenerativeUISurface id="comparison-1" description="…" components={[...]} fallback={…}/>` — "Asking the chat changes the page." You'd drive it from your command bar (`runAgent` per submit) and render one surface per artifact page/tab. ([Surfaces](https://docs.copilotkit.ai/generative-ui/components/surfaces), [Components & surfaces](https://docs.copilotkit.ai/generative-ui/components))
- `messageFilter` on the provider trims what each run sends (e.g. last message only) — useful since our "context" is the current page, not a transcript. ([Message history](https://docs.copilotkit.ai/backend/message-history))
- What you'd ignore/rip out: `CopilotChat`, suggestions, prebuilt components, threads UI — all opt-in. What remains is the hidden message list (tool calls live there); you never have to show it. Exact mapping of "one artifact page = one surface vs one thread" is our design choice; not prescribed.

## 8. Provider/model (our own Node backend + Anthropic, server-side key)

No cloud lock-in for the model path:
- **Simple mode:** `new BuiltInAgent({ model: "anthropic:claude-sonnet-4-6" })` with `ANTHROPIC_API_KEY` (AI SDK under the hood). ([Model selection](https://docs.copilotkit.ai/model-selection))
- **Factory mode (recommended for us):** `BuiltInAgent({ type: "custom", factory })` — you own the LLM call entirely (your own `fetch` to Anthropic) and **yield AG-UI events directly**; CopilotKit does lifecycle/stream conversion. Or write your own AG-UI `AbstractAgent` / point an `HttpAgent` at any remote AG-UI endpoint. Docs: "There is no CopilotKit-specific provider to install." ([Use any model router](https://docs.copilotkit.ai/backend/custom-agent))
- **Intelligence is optional**; the OSS runtime runs standalone. (One gate: the `selfManagedAgents` provider prop is Enterprise-plan.) ([Architecture](https://docs.copilotkit.ai/concepts/architecture), [Message history — self-managed agents](https://docs.copilotkit.ai/backend/message-history))
- **Prompt caching:** tool schemas derive from your static, versioned catalog (`"acme/shop@1"`), and the injected `render_ui` tool + guide are generated from it — stable inputs across runs, which is caching-friendly; in factory mode you own the request so you can set `cache_control` yourself. Explicit Anthropic prompt-caching documentation: **not documented**.

## 9. React / framework requirements

- **React 18 or 19** (`peerDependencies: react ^18 || ^19`; zod ≥3.25; optional maplibre-gl). ([npm](https://registry.npmjs.org/@copilotkit/react-core/latest))
- **Not Next-only:** the runtime mounts in "Next.js App Router, Express, Hono, Bun, Deno, Cloudflare Workers" ([Architecture](https://docs.copilotkit.ai/concepts/architecture)); there's a dedicated "Deploy to any runtime" path, and Angular/Vue/RN SDKs exist. A Vite+React-specific guide: **not documented** in current docs — but the frontend is plain client-side React (the `"use client"` directives in examples are inert outside Next); the provider must be client-side because catalogs hold React components. No SSR/RSC requirement documented.
- **Bundle weight:** exact shipped KB **not documented**. `@copilotkit/react-core` unpacks ~10.7 MB and depends on recharts, katex, lit, radix, streamdown, react-markdown, etc.; the repo runs size-limit checks including an "assert-headless-purity" script (headless import path avoids pulling in the chat UI), and chart/map/icon libs for the components feature are separate optional installs. Measure in a PoC.

## 10. Verdict for our use case

### **Partial-to-strong fit — strong fit on capabilities, with one big asterisk.**

The three most important reasons:

1. **(a) Custom-component structured output: yes, precisely.** `createGenerativeUI` catalogs give us our own typed, Zod-validated components; `slots`/`child()` give LLM-composed **nested trees**; `bind` gives "IDs not values" resolution from our catalog with the agent blind to the values — a documented, exact match for our two hardest requirements.
2. **(b) In-place patching: yes, documented behavior** — the agent is told about existing surfaces and emits `updateComponents`/`updateDataModel` ops; "add a column → changes it in place." Our signature glow-on-changed-sections would be layered on top via stable component IDs (framework doesn't do the animation itself).
3. **(c)+(d) No forced chat UI, no cloud lock-in:** headless `useAgent`/`runAgent` + page-mounted `GenerativeUISurface`s match our browser-shell model; factory mode lets our Node backend call Anthropic directly with server-side keys; MIT OSS core; Intelligence (paid) only needed for cross-device durable replay, which we don't need — we'd persist page JSON ourselves.

### Top risk / gap

**The components-and-surfaces system — the only part that gives us nested trees + in-place patching — is labeled Experimental** ("implements A2UI 1.0 … upstream still calls 1.0 a candidate, and the API of this feature can change"). Secondary gaps: the runtime remains thread/message-shaped under the hood (fine but invasive to ignore); per-operation update hooks for our glow animation and page-JSON export are **not documented**; and per-run catalog+guide tokens are a real cost (mitigate with a small custom catalog and `omit`ting the 69-component standard catalog).

**Fallback within the same framework** if surfaces prove too unstable: stable Controlled primitives (`useComponent`) or the JSON-Render/Hashbrown BYO-registry recipes + our existing keyed DOM diffing — i.e., the framework degrades gracefully to "transport + validation layer" around the approach we already prototype in vanilla JS.

---

### Source index
- README / repo: https://github.com/CopilotKit/CopilotKit · activity via https://api.github.com/repos/CopilotKit/CopilotKit
- Funding: https://www.copilotkit.ai/blog/series-a · https://techcrunch.com/2026/05/05/copilotkit-raises-27m-to-help-devs-deploy-app-native-ai-agents/
- Generative UI overview: https://docs.copilotkit.ai/concepts/generative-ui-overview
- Components & surfaces: https://docs.copilotkit.ai/generative-ui/components · /surfaces · /catalogs · /state-and-actions · /transports
- A2UI: https://docs.copilotkit.ai/generative-ui/a2ui · /a2ui/fixed-schema
- Controlled/BYO: https://docs.copilotkit.ai/generative-ui/tool-based · /json-render · /hashbrown · /state-rendering
- Headless: https://docs.copilotkit.ai/programmatic-control · /custom-look-and-feel/headless-ui
- Backend: https://docs.copilotkit.ai/concepts/architecture · /backend/custom-agent · /model-selection · /backend/agent-runner · /backend/message-history · /backend/ag-ui · https://docs.copilotkit.ai/threads · /frontend-tools
- npm: https://registry.npmjs.org/@copilotkit/react-core/latest
