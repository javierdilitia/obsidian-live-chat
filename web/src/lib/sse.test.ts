import { createSseParser, streamRun, type AgUiEvent } from "./sse";

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

const started = { type: "RUN_STARTED", runId: "r1" };
const tab = {
  type: "CUSTOM",
  name: "tab_opened",
  value: { surface_id: "shop:1", title: "Laptops" },
};
const message = { version: "1.0", createSurface: { surfaceId: "shop:1", catalogId: "c" } };
const a2ui = { type: "CUSTOM", name: "a2ui", value: message };
const finished = { type: "RUN_FINISHED", runId: "r1" };

afterEach(() => {
  vi.unstubAllGlobals();
});

test("sse parser handles split frames", () => {
  const parser = createSseParser();
  const text = frame(started) + frame(tab) + frame(a2ui) + frame(finished);
  // Cut inside a key, inside the "\n\n" between frames, and at every other awkward place.
  const cuts = [3, 20, text.indexOf("\n\n") + 1, text.indexOf("tab_opened") + 4, text.length - 1];
  const events: AgUiEvent[] = [];
  let from = 0;
  for (const cut of [...cuts, text.length]) {
    events.push(...parser.feed(text.slice(from, cut)));
    from = cut;
  }
  expect(events).toEqual([started, tab, a2ui, finished]);
});

test("sse parser reads CRLF frames and skips comments and unknown events", () => {
  const parser = createSseParser();
  const text =
    ": keep-alive\r\n\r\n" +
    `data: ${JSON.stringify({ type: "STEP_STARTED", stepName: "x" })}\r\n\r\n` +
    `data: ${JSON.stringify(started)}\r\n\r\n` +
    "data: not json\n\n";
  expect(parser.feed(text)).toEqual([started]);
});

test("streamRun posts the command and returns the run's last event", async () => {
  const error = { type: "RUN_ERROR", code: "edit_failed", message: "Couldn't change this page." };
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(frame(started) + frame(error), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const seen: AgUiEvent[] = [];

  const end = await streamRun("Only OLED", (event) => seen.push(event));

  expect(end).toEqual(error);
  expect(seen).toEqual([started, error]);
  expect(fetchMock).toHaveBeenCalledWith("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ command: "Only OLED" }),
  });
});

test("streamRun throws when the stream ends before the run does", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(frame(started))));
  await expect(streamRun("Only OLED", () => undefined)).rejects.toThrow(/ended/);
});
