/* The edit inserts `colour` mid-page by rewriting `root`. With the real renderer and the Task 3
   fixtures, only the new section and its inline charts may mount; every other section must keep
   its mount (A2UI keys children by component ID). */
import { screen } from "@testing-library/react";
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
