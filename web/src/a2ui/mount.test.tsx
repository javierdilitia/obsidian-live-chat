/* The edit inserts `colour` mid-page by rewriting `root`. With the real renderer and the Task 3
   fixtures, only the new section and its inline charts may mount; every other section must keep
   its mount (A2UI keys children by component ID). */
import { screen, waitFor } from "@testing-library/react";
import { resetProductCache } from "../lib/products";
import build from "./fixtures/build.json";
import edit from "./fixtures/edit_add_colour.json";
import { glow, holdHidden, partElement, riseIn, stepBack } from "./motion";
import { mountCounts, resetMountProbe } from "./probe";
import { applyMessages, mockApi, showSurface, SURFACE_ID } from "./test-helpers";

beforeEach(() => {
  resetProductCache();
  resetMountProbe();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

/** jsdom has no Web Animations: records what each element was asked to animate. */
function recordAnimations() {
  const calls: { element: Element; keyframes: Keyframe[] }[] = [];
  HTMLElement.prototype.animate = function (this: HTMLElement, keyframes) {
    calls.push({ element: this, keyframes: keyframes as Keyframe[] });
    return { cancel: () => undefined } as Animation;
  };
  return calls;
}

test("inserting a section remounts nothing else", async () => {
  mockApi();
  const processor = await showSurface(build);
  await screen.findAllByText("€1,899");

  const built = mountCounts();
  for (const id of ["root", "verdict", "verdict_button", "shelf", "specs", "charts"]) {
    expect(built[id]).toBe(1);
  }

  resetMountProbe();
  await applyMessages(processor, edit);
  await screen.findByText("Colour range — share of DCI-P3");

  const after = mountCounts();
  expect(after).toEqual({ colour: 1, colour_children_0: 1, colour_children_1: 1 });
  for (const id of ["verdict", "shelf", "specs", "charts"]) {
    expect(after).not.toHaveProperty(id);
  }
  // The new section sits where root's child list puts it: after the shelf, before the specs.
  const sections = [...document.querySelectorAll("[data-section]")].map((el) =>
    el.getAttribute("data-section"),
  );
  expect(sections).toEqual(["verdict", "shelf", "colour", "specs", "charts"]);
});

test("an edit's step-back and rise do not remount", async () => {
  const animations = recordAnimations();
  mockApi();
  const processor = await showSurface(build);
  await screen.findAllByText("€1,899");
  resetMountProbe();

  // The verdict is named by the edit: it steps back, its new text arrives, it rises and glows.
  const verdict = partElement(document, "verdict");
  if (!verdict) throw new Error("no verdict part");
  stepBack(verdict);
  await applyMessages(processor, [
    ...edit,
    {
      version: "1.0",
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: "verdict",
            component: "Verdict",
            lead: "Aeris Studio 16",
            text: "the truest colour as well as the most power.",
            button: "verdict_button",
          },
        ],
      },
    },
  ]);
  holdHidden(verdict);
  riseIn(verdict, 0);
  glow(verdict, 0);
  await screen.findByText("the truest colour as well as the most power.");

  expect(partElement(document, "verdict")).toBe(verdict);
  expect(animations.filter((call) => call.element === verdict)).toHaveLength(4);
  expect(mountCounts()).toEqual({ colour: 1, colour_children_0: 1, colour_children_1: 1 });
  // the new section has its own room in the page
  expect(partElement(document, "colour")?.closest(".room")).toBeInTheDocument();
});

/** The built page with the shelf holding only its first two products. */
function twoOnTheShelf() {
  const [created] = build;
  if (!created) throw new Error("the fixtures are empty");
  const components = created.createSurface.components.map((component) =>
    component.id === "shelf" && "items" in component
      ? { ...component, items: component.items?.slice(0, 2) }
      : component,
  );
  return [{ ...created, createSurface: { ...created.createSurface, components } }];
}

const shelfOf = (items: unknown[]) => [
  {
    version: "1.0",
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [{ id: "shelf", component: "ProductShelf", items, pickId: "aeris-studio-16" }],
    },
  },
];

test("a part that rises as a whole settles the parts that mounted inside it", async () => {
  const animations = recordAnimations();
  mockApi();
  const processor = await showSurface(twoOnTheShelf());
  await screen.findAllByText("€1,899");

  // a third product joins the shelf; the shelf itself steps back, then rises (the mockup's rule:
  // parts that rise never nest)
  const shelf = partElement(document, "shelf");
  if (!shelf) throw new Error("no shelf part");
  stepBack(shelf);
  await applyMessages(
    processor,
    shelfOf([
      { productId: "aeris-studio-16", tag: "most power" },
      { productId: "kore-zephyr-14", tag: "lightest" },
      { productId: "vela-prism-15", tag: "best value" },
    ]),
  );
  await waitFor(() => {
    expect(shelf.querySelectorAll(".prod")).toHaveLength(3);
  });
  const arrived = shelf.querySelectorAll(".prod.rise");
  expect(arrived).toHaveLength(3);
  expect(shelf.querySelectorAll("[data-settled]")).toHaveLength(0);

  holdHidden(shelf);
  riseIn(shelf, 0);

  // every product of the shelf now rests where the shelf's own rise puts it
  for (const product of arrived) expect(product).toHaveAttribute("data-settled");
  expect(animations.filter((call) => call.element === shelf)).toHaveLength(3);
  // what is not in the shelf keeps its own rise, and so do bars, which refill by themselves
  expect(partElement(document, "verdict")).not.toHaveAttribute("data-settled");
  for (const fill of document.querySelectorAll(".bar-fill")) {
    expect(fill).not.toHaveAttribute("data-settled");
  }
});

test("a chart that rises as a whole settles its rows and lets its bars refill", async () => {
  recordAnimations();
  mockApi();
  const processor = await showSurface(build);
  await screen.findAllByText("€1,899");

  const chart = partElement(document, "charts_children_0");
  if (!chart) throw new Error("no chart part");
  stepBack(chart);
  await applyMessages(processor, [
    {
      version: "1.0",
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          {
            id: "charts_children_0",
            component: "BarChart",
            title: "Battery — hours of video playback",
            productIds: ["kore-zephyr-14", "aeris-studio-16", "vela-prism-15"],
            specKey: "batt",
          },
        ],
      },
    },
  ]);
  holdHidden(chart);
  riseIn(chart, 0);

  for (const row of chart.querySelectorAll(".bar-row")) expect(row).toHaveAttribute("data-settled");
  for (const fill of chart.querySelectorAll(".bar-fill")) {
    expect(fill).not.toHaveAttribute("data-settled");
  }
  // the other chart is not part of this rise
  const other = partElement(document, "charts_children_1");
  expect(other?.querySelector(".bar-row")).not.toHaveAttribute("data-settled");
});
