import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { z } from "zod";
import shopJson from "../../../backend/packages/agent/src/obsidian_agent/catalog/shop.json";
import { dispatchAction } from "../lib/actions";
import { cart } from "../lib/cart";
import { RETRY_BASE_MS, resetProductCache } from "../lib/products";
import { shopCatalog } from "./catalog";
import build from "./fixtures/build.json";
import { LAPTOPS, SURFACE_ID, mockApi, showSurface } from "./test-helpers";

beforeEach(() => {
  resetProductCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("field names match shop.json", () => {
  expect(shopCatalog.id).toBe(shopJson.catalogId);
  expect([...shopCatalog.components.keys()].sort()).toEqual(
    Object.keys(shopJson.components).sort(),
  );
  for (const [name, definition] of Object.entries(shopJson.components)) {
    const schema = shopCatalog.components.get(name)?.schema as z.AnyZodObject | undefined;
    if (!schema) throw new Error(`${name} is missing from shopCatalog`);
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.keys(definition.properties).filter((key) => key !== "component");
    const required = definition.required.filter((key) => key !== "component");
    expect({ name, fields: Object.keys(shape).sort() }).toEqual({ name, fields: fields.sort() });
    const ownRequired = Object.entries(shape)
      .filter(([, field]) => !field.isOptional())
      .map(([key]) => key);
    expect({ name, required: ownRequired.sort() }).toEqual({ name, required: required.sort() });
  }
});

test("shelf shows names and prices from the cache", async () => {
  const fetchMock = mockApi();
  await showSurface(build);

  const shelf = await screen.findByRole("list", { name: "Products" });
  await within(shelf).findByText("€1,899");
  for (const name of ["Aeris Studio 16", "Kore Zephyr 14", "Vela Prism 15"]) {
    expect(within(shelf).getByRole("heading", { name })).toBeInTheDocument();
  }
  expect(within(shelf).getByText("€1,749")).toBeInTheDocument();
  expect(within(shelf).getByText("€1,649")).toBeInTheDocument();
  expect(within(shelf).getByText("The pick")).toBeInTheDocument();
  // Every component asked for products in the same tick: one request, deduplicated.
  const productCalls = fetchMock.mock.calls.filter(
    ([url]) => typeof url === "string" && url.startsWith("/api/catalog/products"),
  );
  expect(productCalls).toHaveLength(1);
});

test('missing product shows "No longer available"', async () => {
  mockApi(LAPTOPS.filter((product) => product.id !== "vela-prism-15"));
  await showSurface(build);

  const shelf = await screen.findByRole("list", { name: "Products" });
  await within(shelf).findByText("€1,899");
  const items = within(shelf).getAllByRole("listitem");
  expect(items[2]).toHaveTextContent("No longer available");
  expect(within(items[2] as HTMLElement).queryByRole("button")).toBeNull();
});

test("add to cart sends cart.add with its own product id", async () => {
  const fetchMock = mockApi();
  await showSurface(build, async (action) => {
    await dispatchAction(action);
  });

  const button = await screen.findByRole("button", { name: "Add Aeris Studio 16 · €1,899" });
  fireEvent.click(button);

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/actions", expect.anything());
  });
  const call = fetchMock.mock.calls.find(([url]) => url === "/api/actions");
  const init = call?.[1];
  expect(init?.method).toBe("POST");
  expect(typeof init?.body === "string" ? JSON.parse(init.body) : init?.body).toEqual({
    name: "cart.add",
    surfaceId: SURFACE_ID,
    sourceComponentId: "verdict_button",
    context: { productId: "aeris-studio-16" },
  });
});

test("spec table shows a dash for a missing spec", async () => {
  const [aeris, kore, vela] = LAPTOPS;
  if (!aeris || !kore || !vela) throw new Error("fixture laptops");
  const koreSpecs = Object.fromEntries(Object.entries(kore.specs).filter(([key]) => key !== "hz"));
  mockApi([aeris, { ...kore, specs: koreSpecs }, vela]);
  await showSurface(build);

  const table = await screen.findByRole("table", { name: "Specs" });
  const row = await within(table).findByRole("row", { name: /Refresh rate/ });
  await within(row).findByText("165 Hz");
  const cells = within(row).getAllByRole("cell");
  expect(cells.map((cell) => cell.textContent)).toEqual(["165 Hz", "—", "144 Hz"]);
});

test("a failed product fetch shows a failed state, then retries", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const fetchMock = mockApi(LAPTOPS, { failProducts: 1 });
    await showSurface(build);

    const shelf = await screen.findByRole("list", { name: "Products" });
    expect(await within(shelf).findAllByText("Couldn't load")).toHaveLength(3);
    expect(within(shelf).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Couldn't load" })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_BASE_MS);
    });
    await within(shelf).findByText("€1,899");
    expect(within(shelf).queryByText("Couldn't load")).toBeNull();
    expect(screen.getByRole("button", { name: "Add Aeris Studio 16 · €1,899" })).toBeEnabled();
    // The retry asks for each product once more, whichever sections retried it.
    const retried = fetchMock.mock.calls
      .slice(1)
      .flatMap(([url]) =>
        typeof url === "string" && url.startsWith("/api/catalog/products?ids=")
          ? url.slice("/api/catalog/products?ids=".length).split(",")
          : [],
      );
    expect(retried.sort()).toEqual(LAPTOPS.map((product) => product.id).sort());
  } finally {
    vi.useRealTimers();
  }
});

test("button flips to In cart · View and opens the drawer", async () => {
  const fetchMock = mockApi();
  const sent: string[] = [];
  await showSurface(build, (action) => {
    sent.push(action.name);
  });
  await screen.findByRole("button", { name: "Add Aeris Studio 16 · €1,899" });

  // the cart takes the product, as the server's answer would put it
  await act(async () => {
    cart.setLines([
      { productId: "aeris-studio-16", name: "Aeris Studio 16", qty: 1, price_cents: 189900 },
    ]);
    await Promise.resolve();
  });

  // the verdict's button and the shelf's both flip
  const views = await screen.findAllByRole("button", { name: "In cart · View Aeris Studio 16" });
  expect(views).toHaveLength(2);
  const view = views[0] as HTMLElement;
  expect(view).toHaveTextContent("In cart · View");
  expect(view).toHaveClass("is-in");
  // the shelf's button for the same product flips too; the others still add
  const shelf = screen.getByRole("list", { name: "Products" });
  expect(
    within(shelf)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["In cart · View", "Add to cart", "Add to cart"]);

  fireEvent.click(view);

  expect(cart.get().open).toBe(true);
  expect(sent).toEqual([]);
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/actions")).toHaveLength(0);
});
