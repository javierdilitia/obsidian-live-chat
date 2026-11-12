/* Test support: the catalog endpoint's products, a fake `fetch`, and a surface rendered the way the
   app renders it (one `MessageProcessor` holding `shopCatalog`, one `A2uiSurface`). */
import { A2uiSurface, type ReactCatalogComponent } from "@a2ui/react";
import { MessageProcessor, type ActionListener } from "@a2ui/web_core/v1_0";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import type { Product } from "../lib/products";
import { shopCatalog } from "./catalog";
import build from "./fixtures/build.json";

type Messages = Parameters<MessageProcessor["processMessages"]>[0];

export const SURFACE_ID = build[0]?.createSurface.surfaceId ?? "";

const spec = (value: string | number, display: string, unit?: string) => ({
  value,
  display,
  ...(unit ? { unit } : {}),
});

/** The three laptops of the fixtures, as `GET /api/catalog/products` returns them. */
export const LAPTOPS: Product[] = [
  {
    id: "aeris-studio-16",
    name: "Aeris Studio 16",
    category_id: "laptops",
    price_cents: 189900,
    was_price_cents: 219900,
    currency: "EUR",
    rating: 4.8,
    review_count: 1326,
    stock: 12,
    look: { glyph: "laptop", finish: "silver", screen: "dusk" },
    specs: {
      display: spec("16.2″ mini-LED", "16.2″ mini-LED"),
      hz: spec(165, "165 Hz", "Hz"),
      batt: spec(18, "18 h", "h"),
      p3: spec(100, "100% DCI-P3", "%"),
      de: spec(0.8, "ΔE 0.8"),
    },
  },
  {
    id: "kore-zephyr-14",
    name: "Kore Zephyr 14",
    category_id: "laptops",
    price_cents: 174900,
    currency: "EUR",
    rating: 4.6,
    review_count: 2184,
    stock: 12,
    look: { glyph: "laptop", finish: "graphite", screen: "sea" },
    specs: {
      display: spec("14.5″ OLED", "14.5″ OLED"),
      hz: spec(120, "120 Hz", "Hz"),
      batt: spec(12, "12 h", "h"),
      p3: spec(100, "100% DCI-P3", "%"),
      de: spec(1.1, "ΔE 1.1"),
    },
  },
  {
    id: "vela-prism-15",
    name: "Vela Prism 15",
    category_id: "laptops",
    price_cents: 164900,
    currency: "EUR",
    rating: 4.4,
    review_count: 897,
    stock: 12,
    look: { glyph: "laptop", finish: "midnight", screen: "night" },
    specs: {
      display: spec("15.3″ IPS", "15.3″ IPS"),
      hz: spec(144, "144 Hz", "Hz"),
      batt: spec(9, "9 h", "h"),
      p3: spec(78, "78% DCI-P3", "%"),
      de: spec(2.6, "ΔE 2.6"),
    },
  },
];

/** Stubs `fetch` with the two endpoints the components call; `products` is the catalog. */
export function mockApi(products: Product[] = LAPTOPS) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://halden.test");
    if (url.pathname === "/api/catalog/products") {
      const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
      const found = ids.flatMap((id) => products.filter((p) => p.id === id));
      const missing = ids.filter((id) => !products.some((p) => p.id === id));
      return Promise.resolve(Response.json({ products: found, missing }));
    }
    if (url.pathname === "/api/actions" && init?.method === "POST") {
      return Promise.resolve(Response.json({ ok: true, cart: [] }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Renders the fixture surface with the real renderer; returns the processor for later messages. */
export async function showSurface(messages: unknown, onAction?: ActionListener) {
  const processor = new MessageProcessor<ReactCatalogComponent>([shopCatalog], onAction);
  processor.processMessages(messages as Messages);
  const surface = processor.model.getSurface(SURFACE_ID);
  if (!surface) throw new Error(`no surface ${SURFACE_ID}`);
  await act(async () => {
    render(<A2uiSurface surface={surface} />);
    await Promise.resolve();
  });
  return processor;
}

/** Applies more messages to a rendered surface, inside `act`. */
export async function applyMessages(
  processor: MessageProcessor<ReactCatalogComponent>,
  messages: unknown,
) {
  await act(async () => {
    processor.processMessages(messages as Messages);
    await Promise.resolve();
  });
}
