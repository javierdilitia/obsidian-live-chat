import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nProvider } from "../i18n/I18nProvider";
import { browser } from "../lib/session";
import { LanguageMenu } from "./LanguageMenu";

type Answer = () => Promise<Response>;

/** Stubs `fetch`: each `POST /api/actions` takes the next answer. */
function stubActions(...answers: Answer[]) {
  const queue = [...answers];
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    () => {
      const next = queue.shift();
      return next ? next() : Promise.resolve(new Response(null, { status: 404 }));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const switched =
  (language: string): Answer =>
  () =>
    Promise.resolve(
      Response.json({ ok: true, user: { id: "demo-user", name: "Javier", language }, cart: [] }),
    );

function renderMenu(notices: string[] = []) {
  render(
    <I18nProvider language="en">
      <LanguageMenu
        onNotice={(text) => {
          notices.push(text);
        }}
      />
    </I18nProvider>,
  );
  return screen.getByRole("button", { name: "Language: English" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("switches the shell without a reload", async () => {
  const fetchMock = stubActions(switched("es"));
  const reload = vi.spyOn(browser, "reload").mockImplementation(() => undefined);
  const cell = renderMenu();
  expect(cell).toHaveTextContent("EN");

  fireEvent.click(cell);
  const menu = screen.getByRole("menu", { name: "Language" });
  await act(async () => {
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Español" }));
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Idioma: Español" })).toHaveTextContent("ES");
  });
  const [, init] = fetchMock.mock.calls[0] ?? [];
  expect(JSON.parse(typeof init?.body === "string" ? init.body : "{}")).toEqual({
    name: "prefs.set_language",
    surfaceId: "shell",
    sourceComponentId: "language-menu",
    context: { language: "es", requestId: expect.any(String) as unknown },
  });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Idioma: Español" }));
  expect(reload).not.toHaveBeenCalled();
});

test("a failed switch keeps the language", async () => {
  stubActions(
    () =>
      Promise.resolve(
        Response.json({ ok: false, cart: [], error: { code: "invalid", message: "Nope." } }),
      ),
    () => Promise.reject(new TypeError("Failed to fetch")),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const notices: string[] = [];
  const cell = renderMenu(notices);
  fireEvent.click(cell);
  const menu = screen.getByRole("menu", { name: "Language" });

  for (const tries of [1, 2]) {
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Español" }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(notices).toHaveLength(tries);
    });
    expect(notices[tries - 1]).toBe("Couldn't change the language. Try again.");
    expect(screen.getByRole("menu", { name: "Language" })).toBeInTheDocument();
    expect(cell).toHaveTextContent("EN");
    expect(within(menu).getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
});

test("keys move between the two languages", () => {
  stubActions();
  const cell = renderMenu();
  fireEvent.click(cell);
  const menu = screen.getByRole("menu", { name: "Language" });
  const english = within(menu).getByRole("menuitemradio", { name: "English" });
  const spanish = within(menu).getByRole("menuitemradio", { name: "Español" });
  expect(document.activeElement).toBe(english);

  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(spanish);
  fireEvent.keyDown(menu, { key: "Home" });
  expect(document.activeElement).toBe(english);
  fireEvent.keyDown(menu, { key: "End" });
  expect(document.activeElement).toBe(spanish);
  fireEvent.keyDown(menu, { key: "Escape" });

  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(cell);
});
