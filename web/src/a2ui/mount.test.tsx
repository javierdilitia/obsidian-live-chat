/* The edit inserts `colour` mid-page by rewriting `root`. With the real renderer and the Task 3
   fixtures, only the new section and its inline charts may mount; every other section must keep
   its mount (A2UI keys children by component ID). */
import { screen } from "@testing-library/react";
import { resetProductCache } from "../lib/products";
import build from "./fixtures/build.json";
import edit from "./fixtures/edit_add_colour.json";
import { mountCounts, resetMountProbe } from "./probe";
import { applyMessages, mockApi, showSurface } from "./test-helpers";

beforeEach(() => {
  resetProductCache();
  resetMountProbe();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
