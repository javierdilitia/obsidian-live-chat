/* What each run does to which component IDs (DESIGN.md "Dot globe", "Follow-up updates", "The
   build"; spec §9), on the Task 3 fixture page: verdict, shelf, specs and charts, and the edit
   that adds `colour` between the shelf and the specs. */
import { planRun, stepBackIds, type PageTree } from "./choreography";

/** The built page, as the renderer's component model holds it. */
const BUILT: PageTree = {
  sections: ["verdict", "shelf", "specs", "charts"],
  children: {
    root: ["verdict", "shelf", "specs", "charts"],
    verdict: ["verdict_button"],
    verdict_button: [],
    shelf: [],
    specs: [],
    charts: ["charts_children_0", "charts_children_1"],
    charts_children_0: [],
    charts_children_1: [],
  },
};

/** The page after "Add colour accuracy for grading". */
const WITH_COLOUR: PageTree = {
  sections: ["verdict", "shelf", "colour", "specs", "charts"],
  children: {
    ...BUILT.children,
    root: ["verdict", "shelf", "colour", "specs", "charts"],
    colour: ["colour_children_0", "colour_children_1"],
    colour_children_0: [],
    colour_children_1: [],
  },
};

const ALL_BUILT = Object.keys(BUILT.children);
const COLOUR_EDIT = ["root", "colour", "colour_children_0", "colour_children_1"];

test("a build lands on every section", () => {
  const plan = planRun({ before: null, after: BUILT, changed: ALL_BUILT, reducedMotion: false });

  expect(plan.kind).toBe("build");
  expect(plan.land).toEqual(["root", "verdict", "shelf", "specs", "charts"]);
  expect(plan.rise).toEqual(["verdict", "shelf", "specs", "charts"]);
  expect(plan.fly).toBe(true);
  expect(plan.stagger).toBe(45);
  // nothing was on the page before, so nothing steps back, opens a room, glows or scrolls
  expect(plan.stepBack).toEqual([]);
  expect(plan.rooms).toEqual([]);
  expect(plan.glow).toEqual([]);
  expect(plan.scrollTo).toBeNull();
  expect(plan.state).toEqual({ lead: "run.built", detail: { key: "run.justNow" } });
});

test("an edit steps back only the named existing parts", () => {
  // "Only OLED screens": the verdict, the shelf and one chart change; root is re-sent too
  const changed = ["root", "verdict", "shelf", "charts_children_1"];
  const plan = planRun({ before: BUILT, after: BUILT, changed, reducedMotion: false });

  expect(plan.kind).toBe("edit");
  expect(plan.stepBack).toEqual(["verdict", "shelf", "charts_children_1"]);
  expect(stepBackIds(BUILT, changed, false)).toEqual(plan.stepBack);
  // the page itself never steps back; the parts land and rise in page order at 40 ms
  expect(plan.land).toEqual(["verdict", "shelf", "charts_children_1"]);
  expect(plan.rise).toEqual(plan.land);
  expect(plan.stagger).toBe(40);
  // the parts that were there before glow once, and so does the header of a re-sent page
  expect(plan.glow).toEqual(["root", "verdict", "shelf", "charts_children_1"]);
  expect(plan.rooms).toEqual([]);
  expect(plan.state).toEqual({
    lead: "run.updated",
    detail: { key: "run.partsChanged", count: 3 },
  });
});

test("a part inside a named part moves with it, not on its own", () => {
  const changed = ["charts", "charts_children_0", "charts_children_1", "verdict_button"];
  const plan = planRun({ before: BUILT, after: BUILT, changed, reducedMotion: false });

  expect(plan.stepBack).toEqual(["verdict_button", "charts"]);
  expect(plan.state).toEqual({
    lead: "run.updated",
    detail: { key: "run.partsChanged", count: 2 },
  });
});

test("a new section opens its room", () => {
  const plan = planRun({
    before: BUILT,
    after: WITH_COLOUR,
    changed: COLOUR_EDIT,
    reducedMotion: false,
  });

  expect(plan.rooms).toEqual(["colour"]);
  // the new section did not exist, so it neither steps back nor glows; the dots land on it
  expect(plan.stepBack).toEqual([]);
  expect(plan.land).toEqual(["colour"]);
  expect(plan.rise).toEqual(["colour"]);
  expect(plan.glow).toEqual(["root"]);
  expect(plan.state).toEqual({
    lead: "run.updated",
    detail: { key: "run.sectionsAdded", count: 1 },
  });
});

test("the scroll target is the first new or changed section", () => {
  const scrollFor = (after: PageTree, changed: string[]) =>
    planRun({ before: BUILT, after, changed, reducedMotion: false }).scrollTo;

  expect(scrollFor(WITH_COLOUR, COLOUR_EDIT)).toBe("colour");
  // a new section wins over a changed one higher up the page
  expect(scrollFor(WITH_COLOUR, [...COLOUR_EDIT, "verdict"])).toBe("colour");
  // otherwise the first changed section, in page order
  expect(scrollFor(BUILT, ["root", "charts_children_1", "shelf"])).toBe("shelf");
  // a changed part scrolls to the section that holds it
  expect(scrollFor(BUILT, ["root", "charts_children_1"])).toBe("charts");
  // a page whose header alone changed stays where it is
  expect(scrollFor(BUILT, ["root"])).toBeNull();
});

test("reduced motion skips flight and stagger", () => {
  const build = planRun({ before: null, after: BUILT, changed: ALL_BUILT, reducedMotion: true });
  expect(build.fly).toBe(false);
  expect(build.stagger).toBe(0);

  const changed = ["root", "verdict", "colour", "colour_children_0", "colour_children_1"];
  const edit = planRun({ before: BUILT, after: WITH_COLOUR, changed, reducedMotion: true });
  expect(edit.fly).toBe(false);
  expect(edit.stagger).toBe(0);
  // content rests visible: nothing steps back or glows; the room still opens, the page still scrolls
  expect(edit.stepBack).toEqual([]);
  expect(stepBackIds(BUILT, changed, true)).toEqual([]);
  expect(edit.glow).toEqual([]);
  expect(edit.rooms).toEqual(["colour"]);
  expect(edit.scrollTo).toBe("colour");
  expect(edit.state).toEqual({
    lead: "run.updated",
    detail: { key: "run.sectionsAdded", count: 1 },
  });
});

test("an edit that changes nothing on screen says the page was updated", () => {
  const plan = planRun({ before: BUILT, after: BUILT, changed: ["root"], reducedMotion: false });
  expect(plan.land).toEqual([]);
  expect(plan.state).toEqual({ lead: "run.updated", detail: { key: "run.pageUpdated" } });
});
