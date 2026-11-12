/* The demo shell end to end, with a fake server: runs stream the Task 3 fixtures over SSE. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App, { PageBoundary } from "./App";
import build from "./a2ui/fixtures/build.json";
import edit from "./a2ui/fixtures/edit_add_colour.json";
import { mountCounts, resetMountProbe } from "./a2ui/probe";
import { SURFACE_ID, mockApi } from "./a2ui/test-helpers";
import { resetProductCache } from "./lib/products";

const BUILD_COMMAND = "Compare 3 laptops for video editing under €2,000";
const EDIT_COMMAND = "Add colour accuracy for grading";
const PAGE_TITLE = "Three laptops for video editing under €2,000";

const started = { type: "RUN_STARTED", runId: "run-1" };
const finished = { type: "RUN_FINISHED", runId: "run-1" };
const tabOpened = {
  type: "CUSTOM",
  name: "tab_opened",
  value: { surface_id: SURFACE_ID, title: BUILD_COMMAND },
};
const a2ui = (messages: unknown[]) =>
  messages.map((value) => ({ type: "CUSTOM", name: "a2ui", value }));
const runError = (code: string, message: string) => ({ type: "RUN_ERROR", code, message });

const BUILD_RUN = [started, tabOpened, ...a2ui(build), finished];
const EDIT_RUN = [started, ...a2ui(edit), finished];

/** The server's snapshot after the edit: the built page with the edit's components applied. */
function editedSnapshot() {
  const [created] = build;
  const [update] = edit;
  if (!created || !update) throw new Error("the fixtures are empty");
  const components = new Map<string, unknown>(
    created.createSurface.components.map((component) => [component.id, component]),
  );
  for (const component of update.updateComponents.components) {
    components.set(component.id, component);
  }
  return {
    ...created,
    createSurface: { ...created.createSurface, components: [...components.values()] },
  };
}

const aerisLine = {
  productId: "aeris-studio-16",
  name: "Aeris Studio 16",
  qty: 1,
  price_cents: 189900,
};

/** What `GET /api/workspace` answers once the server holds the page. */
const savedWorkspace = (snapshot: unknown, cart: unknown[] = []) => ({
  tab: { surface_id: SURFACE_ID, title: BUILD_COMMAND, snapshot },
  cart,
});

beforeEach(() => {
  resetProductCache();
  resetMountProbe();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function commandBar() {
  return screen.getByRole("textbox", { name: "What are you shopping for?" });
}

/** The command bar's state field: what the assistant is doing, or why it couldn't. */
function assistant() {
  return screen.getByRole("status", { name: "Assistant" });
}

async function waitForState(text: string) {
  await waitFor(() => {
    expect(assistant()).toHaveTextContent(text);
  });
}

/** Types a command and presses Enter (the bar is a form, so Enter submits it). */
function send(command: string) {
  const input = commandBar();
  fireEvent.change(input, { target: { value: command } });
  const form = input.closest("form");
  if (!form) throw new Error("the command bar is not a form");
  fireEvent.submit(form);
}

async function buildPage() {
  send(BUILD_COMMAND);
  await waitForState("Built · just now");
  return screen.findByRole("list", { name: "Products" });
}

test("App shows the tab and page after a run", async () => {
  mockApi(undefined, { runs: [BUILD_RUN] });
  render(<App />);
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.getByText(/every product, price, rating and order is fictional/)).toBeVisible();

  send(BUILD_COMMAND);
  expect(commandBar()).toBeDisabled();
  expect(assistant()).toHaveTextContent("Building comparison…");

  const tab = await screen.findByRole("tab", { name: BUILD_COMMAND });
  expect(tab).toHaveAttribute("aria-selected", "true");
  await waitForState("Built · just now");
  expect(tab).not.toHaveAttribute("aria-busy", "true");
  expect(commandBar()).toBeEnabled();
  expect(commandBar()).toHaveValue(BUILD_COMMAND);

  const panel = screen.getByRole("tabpanel", { name: BUILD_COMMAND });
  expect(within(panel).getByRole("heading", { name: PAGE_TITLE })).toBeInTheDocument();
  const shelf = await within(panel).findByRole("list", { name: "Products" });
  await within(shelf).findByText("€1,899");
});

test("App edits the page in place", async () => {
  mockApi(undefined, { runs: [BUILD_RUN, [started, ...a2ui(edit), finished]] });
  render(<App />);
  await buildPage();
  resetMountProbe();

  send(EDIT_COMMAND);
  expect(assistant()).toHaveTextContent("Updating this page…");
  await waitForState("Built · just now");

  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getByText("Colour range — share of DCI-P3")).toBeInTheDocument();
  expect(mountCounts()).toEqual({ colour: 1, colour_children_0: 1, colour_children_1: 1 });
});

test("App keeps the page when the edit fails", async () => {
  const failed = runError("edit_failed", "Couldn't change this page.");
  mockApi(undefined, { runs: [BUILD_RUN, [started, failed]] });
  render(<App />);
  const shelf = await buildPage();
  await within(shelf).findByText("€1,899");
  resetMountProbe();

  send(EDIT_COMMAND);
  await waitForState("Couldn't change this page.");

  expect(screen.getByRole("heading", { name: PAGE_TITLE })).toBeInTheDocument();
  expect(within(shelf).getByText("€1,899")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: BUILD_COMMAND })).toBeInTheDocument();
  expect(mountCounts()).toEqual({});
  // The command stays in the bar, so the shopper can send it again.
  expect(commandBar()).toBeEnabled();
  expect(commandBar()).toHaveValue(EDIT_COMMAND);
});

test("a failed first build keeps the tab, and the next command builds again", async () => {
  mockApi(undefined, {
    runs: [
      [started, tabOpened, runError("build_failed", "Couldn't build this page.")],
      [started, ...a2ui(build), finished],
    ],
  });
  render(<App />);

  send(BUILD_COMMAND);
  await waitForState("Couldn't build this page.");
  expect(screen.getByRole("tab", { name: BUILD_COMMAND })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: PAGE_TITLE })).toBeNull();

  send(BUILD_COMMAND);
  expect(assistant()).toHaveTextContent("Building comparison…");
  await waitForState("Built · just now");
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: PAGE_TITLE })).toBeInTheDocument();
});

test("a run the server can't start shows an error", async () => {
  mockApi(undefined, { runs: [] });
  render(<App />);

  send(BUILD_COMMAND);

  await waitForState("Couldn't reach the assistant. Try again.");
  expect(screen.queryByRole("tab")).toBeNull();
  expect(commandBar()).toBeEnabled();
});

test("add to cart shows a toast and the cart count", async () => {
  mockApi(undefined, { runs: [BUILD_RUN] });
  render(<App />);
  const shelf = await buildPage();
  await within(shelf).findByText("€1,899");
  const cart = screen.getByRole("status", { name: /^Cart/ });
  expect(cart).toHaveTextContent("empty");

  const button = screen.getByRole("button", { name: "Add Aeris Studio 16 · €1,899" });
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });

  expect(await screen.findByText("Aeris Studio 16 added to your cart")).toBeInTheDocument();
  expect(cart).toHaveTextContent("1 · €1,899");
  expect(cart).toHaveAccessibleName("Cart, 1 item, €1,899");
});

test("App restores the page after a reload", async () => {
  const fetchMock = mockApi(undefined, {
    workspace: [savedWorkspace(build[0], [aerisLine])],
    runs: [EDIT_RUN],
  });
  render(<App />);

  // The tab, the page and the cart come back with no run and no build.
  await screen.findByRole("tab", { name: BUILD_COMMAND });
  const panel = screen.getByRole("tabpanel", { name: BUILD_COMMAND });
  expect(within(panel).getByRole("heading", { name: PAGE_TITLE })).toBeInTheDocument();
  const shelf = await within(panel).findByRole("list", { name: "Products" });
  await within(shelf).findByText("€1,899");
  expect(screen.getByRole("status", { name: /^Cart/ })).toHaveAccessibleName(
    "Cart, 1 item, €1,899",
  );
  const runs = () => fetchMock.mock.calls.filter(([url]) => url === "/api/runs");
  expect(runs()).toHaveLength(0);
  expect(assistant()).toBeEmptyDOMElement();
  // The page fades in as a whole: its parts don't rise in as they do for a build.
  expect(panel).toHaveClass("restored");

  // The next command edits the restored page, and its new parts rise in as usual.
  send(EDIT_COMMAND);
  expect(assistant()).toHaveTextContent("Updating this page…");
  expect(panel).not.toHaveClass("restored");
  await waitForState("Built · just now");
  expect(runs()).toHaveLength(1);
  expect(screen.getByText("Colour range — share of DCI-P3")).toBeInTheDocument();
});

test("App re-syncs when a message is rejected", async () => {
  // The server applied the edit, but its message doesn't fit the page the browser holds.
  const broken = {
    version: "1.0",
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [{ id: "root", component: "Page", title: 5 }],
    },
  };
  const fetchMock = mockApi(undefined, {
    workspace: [{ tab: null, cart: [] }, savedWorkspace(editedSnapshot(), [aerisLine])],
    runs: [BUILD_RUN, [started, ...a2ui([broken]), finished]],
  });
  render(<App />);
  await buildPage();

  send(EDIT_COMMAND);
  await waitForState("Couldn't show all of this page.");

  // The page is the server's: the edit shows, and the cart matches the server's.
  expect(await screen.findByText("Colour range — share of DCI-P3")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: PAGE_TITLE })).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  expect(screen.getByRole("status", { name: /^Cart/ })).toHaveAccessibleName(
    "Cart, 1 item, €1,899",
  );
  const reads = fetchMock.mock.calls.filter(([url]) => url === "/api/workspace");
  expect(reads).toHaveLength(2);
  expect(assistant()).toHaveTextContent("Couldn't show all of this page.");
});

test("command input is capped at 500", () => {
  mockApi();
  render(<App />);
  expect(commandBar()).toHaveAttribute("maxLength", "500");
});

test("a page that fails to render shows a message, not a blank app", () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
  function Broken(): never {
    throw new Error("a component failed");
  }
  render(
    <PageBoundary>
      <Broken />
    </PageBoundary>,
  );
  expect(screen.getByText("Couldn't show this page.")).toBeInTheDocument();
  quiet.mockRestore();
});
