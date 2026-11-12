import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LAPTOPS, mockApi } from "../a2ui/test-helpers";
import { I18nProvider } from "../i18n/I18nProvider";
import { englishLeft } from "../i18n/test-helpers";
import type { CartLine } from "../lib/actions";
import { cart } from "../lib/cart";
import { resetProductCache } from "../lib/products";
import { CartDrawer } from "./CartDrawer";

/** Every action carries its own request ID (a UUID per click). */
const A_REQUEST_ID: unknown = expect.any(String);

const aeris: CartLine = {
  productId: "aeris-studio-16",
  name: "Aeris Studio 16",
  qty: 1,
  price_cents: 189900,
};
const kore: CartLine = {
  productId: "kore-zephyr-14",
  name: "Kore Zephyr 14",
  qty: 2,
  price_cents: 174900,
};

beforeEach(() => {
  resetProductCache();
});

async function openDrawer(lines: CartLine[], notices: string[] = []) {
  const fetchMock = mockApi(LAPTOPS, {
    cart: Object.fromEntries(lines.map((line) => [line.productId, line.qty])),
  });
  render(
    <CartDrawer
      onNotice={(text) => {
        notices.push(text);
      }}
    />,
  );
  await act(async () => {
    cart.setLines(lines);
    cart.open();
    await Promise.resolve();
  });
  return { fetchMock, drawer: screen.getByRole("dialog", { name: "Shopping cart" }) };
}

/** The body of each `POST /api/actions` the app has made. */
function actionBodies(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/actions")
    .map(
      ([, init]) =>
        JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>,
    );
}

test("drawer lists lines and total", async () => {
  const { drawer } = await openDrawer([aeris, kore]);

  const names = within(drawer).getAllByText(/^(Aeris Studio 16|Kore Zephyr 14)$/);
  expect(names.map((name) => name.textContent)).toEqual(["Aeris Studio 16", "Kore Zephyr 14"]);
  expect(drawer).toHaveTextContent("€1,899");
  // a line with more than one shows its sum
  expect(drawer).toHaveTextContent("€1,749 · €3,498 for 2");
  expect(within(drawer).getByText("Total").parentElement).toHaveTextContent("€5,397");
  expect(
    within(drawer).getByRole("button", { name: "Remove Aeris Studio 16" }),
  ).toBeInTheDocument();
  expect(within(drawer).queryByRole("button", { name: /check out/i })).toBeNull();
  await waitFor(() => {
    expect(drawer.querySelectorAll(".cart-line .render")).toHaveLength(2);
  });
});

test("an empty cart says so and has no total", async () => {
  const { drawer } = await openDrawer([]);

  expect(drawer).toHaveTextContent("Your cart is empty.");
  expect(drawer).toHaveTextContent("Ask for a comparison, then add the one you want.");
  expect(within(drawer).queryByText("Total")).toBeNull();
});

test("stepper sends cart.set_qty", async () => {
  const { fetchMock, drawer } = await openDrawer([kore]);

  fireEvent.click(within(drawer).getByRole("button", { name: "One more Kore Zephyr 14" }));

  await waitFor(() => {
    expect(within(drawer).getByText("Quantity").parentElement).toHaveTextContent("Quantity 3");
  });
  expect(actionBodies(fetchMock)).toEqual([
    {
      name: "cart.set_qty",
      surfaceId: "shell",
      sourceComponentId: "cart-drawer",
      context: { productId: "kore-zephyr-14", qty: 3, requestId: A_REQUEST_ID },
    },
  ]);
});

test("stepping the last one down empties the line", async () => {
  const { fetchMock, drawer } = await openDrawer([aeris]);

  fireEvent.click(within(drawer).getByRole("button", { name: "One fewer Aeris Studio 16" }));

  await waitFor(() => {
    expect(drawer).toHaveTextContent("Your cart is empty.");
  });
  expect(actionBodies(fetchMock)[0]).toMatchObject({
    name: "cart.set_qty",
    context: { productId: "aeris-studio-16", qty: 0 },
  });
  // the keyboard stays inside the drawer
  await waitFor(() => {
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
  });
});

test("remove sends cart.remove", async () => {
  const { fetchMock, drawer } = await openDrawer([aeris, kore]);

  fireEvent.click(within(drawer).getByRole("button", { name: "Remove Aeris Studio 16" }));

  await waitFor(() => {
    expect(within(drawer).queryByText("Aeris Studio 16")).toBeNull();
  });
  expect(within(drawer).getByText("Kore Zephyr 14")).toBeInTheDocument();
  expect(actionBodies(fetchMock)).toEqual([
    {
      name: "cart.remove",
      surfaceId: "shell",
      sourceComponentId: "cart-drawer",
      context: { productId: "aeris-studio-16", requestId: A_REQUEST_ID },
    },
  ]);
});

test("a refused step says why", async () => {
  const notices: string[] = [];
  const { fetchMock, drawer } = await openDrawer([aeris], notices);
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(
      Response.json({
        ok: false,
        cart: [aeris],
        error: {
          code: "out_of_stock",
          message: "Only 1 Aeris Studio 16 in stock.",
          params: { reason: "only", name: "Aeris Studio 16", count: 1 },
        },
      }),
    ),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  fireEvent.click(within(drawer).getByRole("button", { name: "One more Aeris Studio 16" }));

  await waitFor(() => {
    expect(notices).toEqual(["Only 1 Aeris Studio 16 in stock."]);
  });
  expect(within(drawer).getByText("Quantity").parentElement).toHaveTextContent("Quantity 1");
});

test("Esc closes and returns focus", async () => {
  mockApi(LAPTOPS);
  render(
    <>
      <button
        type="button"
        onClick={() => {
          cart.open();
        }}
      >
        Open cart
      </button>
      <CartDrawer onNotice={() => undefined} />
    </>,
  );
  const opener = screen.getByRole("button", { name: "Open cart" });
  opener.focus();
  fireEvent.click(opener);

  const drawer = await screen.findByRole("dialog", { name: "Shopping cart" });
  await waitFor(() => {
    expect(within(drawer).getByRole("button", { name: "Close" })).toHaveFocus();
  });
  expect(drawer).toHaveClass("on");

  fireEvent.keyDown(document, { key: "Escape" });

  await waitFor(() => {
    expect(cart.get().open).toBe(false);
  });
  expect(opener).toHaveFocus();
  expect(screen.queryByRole("dialog", { name: "Shopping cart" })).toBeNull();
});

test("the close button and the scrim close it; Tab stays inside", async () => {
  const { drawer } = await openDrawer([aeris]);
  const close = within(drawer).getByRole("button", { name: "Close" });
  const remove = within(drawer).getByRole("button", { name: "Remove Aeris Studio 16" });

  remove.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(remove).toHaveFocus();

  fireEvent.click(close);
  expect(cart.get().open).toBe(false);
  await act(async () => {
    cart.open();
    await Promise.resolve();
  });
  fireEvent.click(document.querySelector(".scrim") as HTMLElement);
  expect(cart.get().open).toBe(false);
});

test("the drawer in Spanish", async () => {
  mockApi(LAPTOPS, { cart: { [kore.productId]: 2 } });
  render(
    <I18nProvider language="es">
      <CartDrawer onNotice={() => undefined} />
    </I18nProvider>,
  );
  await act(async () => {
    cart.open();
    await Promise.resolve();
  });
  const drawer = screen.getByRole("dialog", { name: "Cesta de la compra" });
  expect(within(drawer).getByText(/Tu cesta está vacía\./)).toBeInTheDocument();
  expect(englishLeft(document.body)).toEqual([]);

  await act(async () => {
    cart.setLines([kore]);
    await Promise.resolve();
  });

  expect(within(drawer).getByText(/por 2$/)).toBeInTheDocument();
  expect(within(drawer).getByText(/^3\.498\s€$/)).toBeInTheDocument();
  expect(englishLeft(document.body)).toEqual([]);
});
