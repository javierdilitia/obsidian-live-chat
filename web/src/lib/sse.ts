/* A run over SSE: `POST /api/runs {command}` answers with AG-UI shaped events, one
   `data: <json>\n\n` frame each (RUN_STARTED, CUSTOM tab_opened, CUSTOM a2ui per A2UI message,
   then RUN_FINISHED or RUN_ERROR). */
import { z } from "zod";

const EventSchema = z.union([
  z.object({ type: z.literal("RUN_STARTED"), runId: z.string() }),
  z.object({ type: z.literal("RUN_FINISHED"), runId: z.string() }),
  z.object({ type: z.literal("RUN_ERROR"), code: z.string(), message: z.string() }),
  z.object({
    type: z.literal("CUSTOM"),
    name: z.literal("tab_opened"),
    value: z.object({ surface_id: z.string(), title: z.string() }),
  }),
  z.object({
    type: z.literal("CUSTOM"),
    name: z.literal("a2ui"),
    value: z.record(z.string(), z.unknown()),
  }),
]);

export type AgUiEvent = z.infer<typeof EventSchema>;
/** How a run ends: finished, or an error the server explains. */
export type RunEnd = Extract<AgUiEvent, { type: "RUN_FINISHED" | "RUN_ERROR" }>;

function parseFrame(frame: string): AgUiEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
    .join("\n");
  if (!data) return null; // a comment or a keep-alive
  try {
    const parsed = EventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null; // an event this app doesn't use
  } catch {
    return null;
  }
}

/** Turns text, in whatever pieces it arrives, into events; a frame split across pieces waits. */
export function createSseParser(): { feed(text: string): AgUiEvent[] } {
  let buffer = "";
  return {
    feed(text) {
      buffer = (buffer + text).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      return frames.map(parseFrame).filter((event) => event !== null);
    },
  };
}

/**
 * Sends one command and passes every event to `onEvent` as it arrives. Returns the event that
 * ended the run; throws when the server can't be reached or the stream stops before the run ends.
 */
export async function streamRun(
  command: string,
  onEvent: (event: AgUiEvent) => void,
): Promise<RunEnd> {
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ command }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`POST /api/runs: HTTP ${String(response.status)}`);
  }
  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let end: RunEnd | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (const event of parser.feed(text)) {
        if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") end = event;
        onEvent(event);
      }
      if (done) break;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (!end) throw new Error("POST /api/runs: the stream ended before the run did");
  return end;
}
