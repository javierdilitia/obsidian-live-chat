/* The action registry (`actions.json`, shared with the server) and the request ID every click
   sends (spec §8.1). */
import registry from "../../../backend/packages/agent/src/obsidian_agent/catalog/actions.json";
import { DISPATCHED_ACTIONS, dispatchAction } from "./actions";

const KINDS = ["local", "direct", "agent"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const entries = Object.entries(registry as Record<string, { kind?: unknown; sources?: unknown }>);

test("every action in the registry has exactly one known kind", () => {
  expect(entries.length).toBeGreaterThan(0);
  for (const [name, entry] of entries) {
    expect(KINDS, name).toContain(entry.kind);
  }
});

test("every action the web sends is a direct action with its sources", () => {
  const byName = new Map(entries);
  for (const name of DISPATCHED_ACTIONS) {
    const entry = byName.get(name);
    expect(entry?.kind, name).toBe("direct");
    expect(Array.isArray(entry?.sources) && entry.sources.length > 0, name).toBe(true);
  }
});

test("each dispatch sends its own request ID", async () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(Response.json({ ok: true, cart: [] })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const action = {
    name: "cart.add",
    surfaceId: "shop:1",
    sourceComponentId: "buy",
    context: { productId: "p1" },
  };

  await dispatchAction(action);
  await dispatchAction(action);

  const sent = fetchMock.mock.calls.map(([, init]) => {
    const body = typeof init?.body === "string" ? init.body : "{}";
    return JSON.parse(body) as { context: { productId: string; requestId: string } };
  });
  expect(sent).toHaveLength(2);
  const [first, second] = sent;
  expect(first?.context.productId).toBe("p1");
  expect(first?.context.requestId).toMatch(UUID);
  expect(second?.context.requestId).toMatch(UUID);
  expect(first?.context.requestId).not.toBe(second?.context.requestId);
  // the caller's context is not changed
  expect(action.context).toEqual({ productId: "p1" });
  vi.unstubAllGlobals();
});

test("the language menu sends prefs.set_language, a direct action from the shell", () => {
  const entry = new Map(entries).get("prefs.set_language");
  expect(entry).toEqual({ kind: "direct", sources: ["shell:language-menu"] });
  expect(DISPATCHED_ACTIONS).toContain("prefs.set_language");
});
