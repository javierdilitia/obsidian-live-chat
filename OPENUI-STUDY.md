# Building the real assistant with OpenUI: feasibility study

**OpenUI is a good fit for this project.** One of its features does almost exactly what your scripted follow-ups fake today. It only covers the page-drawing layer, though. Choosing the tab, loading product data and the build animation are still yours to build. It also means moving off the no-build vanilla JS setup to React, Vue or Svelte.

Caching would cut per-question model cost by about 60–70%. Separately, the right design lets repeat questions cost nothing.

## 1. What OpenUI covers and what you still build

OpenUI (by Thesys, MIT license) has the model write a compact language, "OpenUI Lang". That output is assembled from components you define, then parsed and rendered while it streams in. How it lines up with the mockup:

| Mockup today | OpenUI equivalent | Fit |
|---|---|---|
| `patch()` compares old and new pages by `data-k` and rebuilds only what changed | **Edit mode**: the model writes only the changed lines, and `mergeStatements` merges them into the old page by name. A line set to `null` deletes that piece. | Very close match |
| `comparisonHTML`, `explainerHTML`… | `defineComponent` (props checked by a schema) + `createLibrary`. The system prompt is generated from the library. | Good |
| Add to cart, open product modal, spec popovers | Custom actions (`@AddToCart`…) reach your `onAction` handler and run locally, with no model call | Good |
| Saved tabs, "Pick up where you left off" | `buildMessage`/`parseMessage` store a page with its state and restore it without the model | Good |
| "The assistant is a builder" | Streaming render: `root` comes first, so the outline appears and then fills in | Good, and better than the fake |
| `decide()`: new tab, update this page, or switch tab | **Not covered.** This is your agent logic. | You build it |
| Products, prices, stock | **Not covered.** These must come from the store, never from the model. | You build it |
| Orb, staggered rise, radar draw, glow on changed parts | **Not covered.** These become component animations. | You build it |
| Vanilla JS, opens offline by double-click | Runtimes exist only for React, Vue, Svelte and Angular. There is a CDN bundle (~900 KB gzipped), but it doesn't document custom components. | Main cost |

Use only `@openuidev/react-lang`, which is the parser and renderer. Skip OpenUI's chat UI packages: they assume a chat transcript, and the whole concept is that there isn't one. Also skip their hosted Gateway. Its edit mode doesn't work there ("Gateway… drops `editMode`"), and its caching has no lifetime control. Call Claude directly from your own backend instead. A real product needs a backend anyway so the API key isn't in the browser.

## 2. How each element would be created and edited

The key design rule: **components take product IDs, never values.** The model chooses *which* laptops, sections and specs, and writes the verdict text. Prices, stock, images, spec values, the "best" highlighting and radar scores are filled in by the components from the catalog. The model can't invent a price, and a saved page stays correct when prices change.

**First question, "Compare 3 laptops for video editing under €2,000"** (illustrative syntax):

```text
root    = Page([head, verdict, trio, specs, charts])
picks   = ["aeris-studio-16", "kore-zephyr-14", "vela-prism-15"]
head    = Header("Video editing under €2,000", "3 laptops")
verdict = Verdict("aeris-studio-16", "The balanced pick for video editing — Kore Zephyr 14 if it travels with you daily.")
trio    = ProductRow(picks, ["fastest exports", "lightest", "best value"])
specs   = SpecTable(picks, ["display","hz","cpu","gpu","ram","ssd","batt","weight","ports"])
charts  = Charts([Radar(picks), Bars(picks, "battery"), Bars(picks, "weight")])
```

**"Add colour accuracy for grading"**: the model sends only a patch, and every other line stays as it was:

```text
root    = Page([head, verdict, trio, colour, specs, charts])
head    = Header("Video editing and grading under €2,000", "3 laptops")
verdict = Verdict("aeris-studio-16", "The pick for editing and grading — its mini-LED is the most accurate screen here.")
colour  = Section("Colour accuracy", [Bars(picks,"p3"), Bars(picks,"deltaE"), Note("Under ΔE 2 the eye can't see the error.")])
```

**"Only OLED screens"**: because every component reads the shared `picks` line, swapping products is a three-line patch:

```text
picks   = ["aeris-studio-14-oled", "kore-zephyr-14", "lumen-slate-16"]
verdict = Verdict("aeris-studio-14-oled", "…")
trio    = ProductRow(picks, ["most balanced", "lightest", "fastest exports"])
```

| Element | Who creates it | How it changes |
|---|---|---|
| Top bar, cart, orders, language, modal, drawers | App code (not generated) | Locally |
| Tabs and tab titles | App, using the routing decision | Routing (section 3) |
| Home page | App (personalised, not generated per request) | — |
| Header and verdict | Model writes the text; the product comes from an ID | Patched by name |
| Product cards | Model picks IDs; card draws the image, price, stars and stock from the catalog | Patch `picks` |
| Spec table | Model picks which specs; values and best-value dots are computed by code | Patch `specs` |
| Spec popovers | A fixed glossary keyed by spec | Local, no model call |
| Radar and bar charts | Model picks the metric; data comes from the catalog | Patched by name |
| Explainer | Model writes the text, plus a diagram chosen from a fixed set (pixel grid, gamut…) | Patched by name |
| Order tracking | One line, `OrderTracker("OB-89027")`. The model only finds the order. | Not generative |
| Checkout and confirmation | **Never the model.** It only routes to a fixed checkout flow. | — |
| Follow-up chips | Model suggests them; the app shows them under the command bar | Each answer |

## 3. Routing: new tab, update this page, or switch tab

I'd make this a separate small first call: Claude Haiku 5.5 with structured output. It gets short summaries of the open tabs and answers `{edit, tabId}`, `{new, kind}` or `{switch, tabId}`. That costs about $0.0002 and lets the command bar say "This page · updating the comparison" before the build starts, as the mockup does now. Then the main call runs with either that tab's history (edit mode) or a fresh start. Keep fixed rules in code, such as checkout always opening a new tab.

## 4. Does caching reduce costs?

**Yes.** Each request starts with the same long block: the tool list, the generated OpenUI prompt and the store rules, about 8K tokens. That block is identical for every shopper and every tab, so with prompt caching it's billed at 5% of the input price. On a follow-up, the tab's history (the question, the product data and the previous page) is also re-read from cache. Edit mode adds an output saving on top: the model writes a short patch instead of the whole page.

These are estimates, assuming a ~8K fixed prefix, one product-search round trip and ~1K output tokens per build. Measure them with the `usage` fields once something runs:

| Per shopping session (1 build + 2 follow-ups) | No caching | With caching |
|---|---|---|
| Claude Sonnet 5.5 ($2/$10 per M tokens) | ~$0.10 | ~$0.03 |
| Claude Opus 5.5 ($4/$20 per M tokens) | ~$0.20 | ~$0.06 |

Rules that keep the cache working:

- **Generate the OpenUI prompt once, at build time, with their command-line tool,** so it stays byte-identical between requests. Don't put the user's name, today's date, the cart or the language in it; send those with the message. The mockup's "Javier" and `TODAY` would break caching if placed there.
- **Keep the tool list identical on every request.** A changing tool set invalidates the whole cache.
- **The default 5-minute cache is enough.** Real traffic keeps the shared prefix warm. Before a live meeting demo, warm it with one throwaway request (`max_tokens: 0`).
- **The catalog can go into the cache too.** About 10K tokens of laptop specs lets the model pick products in one call, which skips a tool round trip and is faster. Prices changing daily means one cache rewrite per day.

**The bigger saving isn't prompt caching but reusing whole pages.** Because components take IDs, a stored page stays valid after prices change. "What is OLED burn-in?" can be generated once and served to everyone, and reopening a recent search loads the saved page. Both cost $0 in model calls.

After caching, output dominates the cost, and much of the output is thinking. So the next lever is a low or medium effort setting, since composing a page doesn't need deep reasoning.

## 5. Alternatives

| Option | Choose it when | Downside |
|---|---|---|
| **OpenUI** (renderer only, direct Claude) | Building the real product | React migration; a custom language with a young ecosystem |
| **Claude tool calls with your own JSON page format** (no framework) | Making *this mockup* live for the pitch without a rewrite. Your state objects (`{page:"compare", set, color}`) plus `makePage` and the `data-k` comparison already act as a small page renderer. A tool like `edit_page` with strict schemas can drive them, and the tool chosen *is* the routing decision. | You build streaming display and patch merging yourself. JSON is ~3x the tokens by OpenUI's own benchmark, but with ID-based components the output is small anyway. |
| **json-render** (Vercel) | You want the same idea in JSON with a big list of renderers | No edit mode documented in its README |
| **A2UI** (Google) | The store also wants the assistant in native iOS/Android/Flutter apps | Heavier protocol, built for multi-platform and multi-agent setups |
| **MCP Apps / model-written HTML** | — | Gives up brand control. Not suitable for "black, very slick". |

**Recommendation:** use OpenUI for the product and Claude tool calls for a quick live demo. The project's largest piece of work is the React port and the commerce plumbing, not OpenUI.

## 6. Open questions for a 1–2 day test

1. **The glow on changed parts.** Can a component tell that it changed in the last patch? Not documented. The fallback is parsing the patch to list the changed lines yourself.
2. **Custom components in the no-build CDN bundle.** Not documented.
3. **Does Claude reliably write `root` first,** so the outline appears before the content?
4. **Reliability on your own components.** OpenUI's benchmark shows Sonnet 5 at 98.4% and Opus 4.8 at 98.9% valid output, but doesn't list the 5.5 models.
5. **Install telemetry.** OpenUI's core package sends install telemetry by default; it can be turned off.

## Sources

- [OpenUI README](https://cdn.jsdelivr.net/gh/thesysdev/openui@main/README.md) · [OpenUI docs index](https://www.openui.com/llms.txt) · [full docs](https://www.openui.com/llms-full.txt) (Incremental Editing, Defining Components, Actions, Architecture, Tools, Message Protocol, System Prompts, Gateway Prompt Caching and Pricing, Telemetry, Comparison)
- [OpenUI browser bundle](https://cdn.jsdelivr.net/gh/thesysdev/openui@main/packages/browser-bundle/README.md) · [OpenUI language benchmark](https://www.openui.com/benchmarks/language/agent.md)
- [themenonlab: OpenUI 67% fewer tokens](https://themenonlab.blog/blog/openui-generative-ui-framework-token-efficient) · [runtimewire: OUI-1](https://runtimewire.com/article/thesys-ships-oui-1-local-generative-ui-model) · [context7 OpenUI](https://context7.com/thesysdev/openui) · [Lynx OpenUI docs](https://lynxjs.org/next/react/genui/openui)
- [json-render README](https://cdn.jsdelivr.net/gh/vercel-labs/json-render@main/README.md) · [A2UI v0.9](https://developers.googleblog.com/en/a2ui-v0-9-generative-ui/) · [Introducing A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) · [CopilotKit: Generative UI in 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) · [MCP Apps vs A2UI](https://sunpeak.ai/blogs/mcp-apps-vs-a2ui/) · [Agentic UI frameworks research](https://agentic-ui-frameworks.pages.dev/)
