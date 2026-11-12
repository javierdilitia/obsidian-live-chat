/* What a run does to which parts of the page: the mockup's build and follow-up grammar
   (mockup/js/agent.js `build` and `patch`; DESIGN.md "Dot globe", "Follow-up updates", "The build";
   spec §9), as pure data. The renderer tells us what changed by component ID: an edit's changed
   parts are exactly the IDs its `updateComponents` messages name, and every other part keeps its
   mount. The DOM, canvas and timing work that carries a plan out lives in `run.ts`. */

export const ROOT = "root";

/** The page as the renderer holds it: every component ID with the IDs it refers to, in order, and
 *  the Page's own `children` (its sections), in page order. */
export interface PageTree {
  sections: readonly string[];
  children: Readonly<Record<string, readonly string[]>>;
}

export interface RunInput {
  /** The page before the run; null when there was none (a build). */
  before: PageTree | null;
  after: PageTree;
  /** The component IDs the run's messages name. */
  changed: Iterable<string>;
  reducedMotion: boolean;
}

export interface Plan {
  kind: "build" | "edit";
  /** Parts on the page before the run that step back while the change arrives. */
  stepBack: string[];
  /** Sections new to `Page.children`: each opens its own room before the dots land. */
  rooms: string[];
  /** Where the dots land, in page order. `root` stands for the whole page. */
  land: string[];
  /** What rises in, in page order, at `stagger` ms apart. */
  rise: string[];
  /** Parts that existed before and glow once as they rise; `root` is the page's header. */
  glow: string[];
  /** The section to bring into view, if any. */
  scrollTo: string | null;
  /** Whether the globe's dots fly to the outlines. */
  fly: boolean;
  stagger: number;
  /** What the state field says when the run is done, as bundle keys (worded at render). */
  state: RunState;
}

export interface RunState {
  lead: "run.built" | "run.updated";
  detail: {
    key: "run.justNow" | "run.sectionsAdded" | "run.partsChanged" | "run.pageUpdated";
    count?: number;
  };
}

const BUILD_STAGGER_MS = 45;
const EDIT_STAGGER_MS = 40;

/** Every component ID in page order: the header's own parts, then the sections, depth first. */
function pageOrder(tree: PageTree): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    const kids = tree.children[id] ?? [];
    const own = id === ROOT ? kids.filter((kid) => !tree.sections.includes(kid)) : kids;
    for (const kid of own) visit(kid);
    if (id === ROOT) for (const section of tree.sections) visit(section);
  };
  visit(ROOT);
  return order;
}

/** Each component's parent. */
function parents(tree: PageTree): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const [id, kids] of Object.entries(tree.children)) {
    for (const kid of kids) if (!parentOf.has(kid)) parentOf.set(kid, id);
  }
  return parentOf;
}

/** The named parts (never the page itself) that no other named part holds, in page order. */
function topmost(tree: PageTree, named: ReadonlySet<string>): string[] {
  const parentOf = parents(tree);
  const covered = (id: string) => {
    for (let up = parentOf.get(id); up !== undefined && up !== ROOT; up = parentOf.get(up)) {
      if (named.has(up)) return true;
    }
    return false;
  };
  return pageOrder(tree).filter((id) => id !== ROOT && named.has(id) && !covered(id));
}

/** The section (a child of the Page) that holds `id`, or `id` itself when it is one. */
function sectionOf(tree: PageTree, id: string): string | undefined {
  const parentOf = parents(tree);
  let at: string | undefined = id;
  while (at !== undefined && !tree.sections.includes(at)) at = parentOf.get(at);
  return at;
}

/** The parts already on the page that the edit names: they step back while it arrives. Known
 *  before the edit is applied, from the page as it was. */
export function stepBackIds(
  before: PageTree,
  changed: Iterable<string>,
  reducedMotion: boolean,
): string[] {
  if (reducedMotion) return [];
  const existing = new Set([...changed].filter((id) => id in before.children));
  return topmost(before, existing);
}

export function planRun({ before, after, changed, reducedMotion }: RunInput): Plan {
  const fly = !reducedMotion;
  if (before === null) {
    return {
      kind: "build",
      stepBack: [],
      rooms: [],
      land: [ROOT, ...after.sections],
      rise: [...after.sections],
      glow: [],
      scrollTo: null,
      fly,
      stagger: reducedMotion ? 0 : BUILD_STAGGER_MS,
      state: { lead: "run.built", detail: { key: "run.justNow" } },
    };
  }

  const named = new Set(changed);
  const existed = (id: string) => id in before.children;
  const rooms = after.sections.filter((id) => !before.sections.includes(id));
  const parts = topmost(after, named);
  const roomSet = new Set(rooms);
  const land = pageOrder(after).filter(
    (id) => roomSet.has(id) || (parts.includes(id) && !roomSet.has(sectionOf(after, id) ?? "")),
  );
  const changedExisting = parts.filter(existed);
  const glow = reducedMotion
    ? []
    : [...(named.has(ROOT) && existed(ROOT) ? [ROOT] : []), ...changedExisting];

  const firstChanged = changedExisting.map((id) => sectionOf(after, id)).find(Boolean);
  const detail: RunState["detail"] =
    rooms.length > 0
      ? { key: "run.sectionsAdded", count: rooms.length }
      : parts.length > 0
        ? { key: "run.partsChanged", count: parts.length }
        : { key: "run.pageUpdated" };

  return {
    kind: "edit",
    stepBack: reducedMotion ? [] : changedExisting,
    rooms,
    land,
    rise: land,
    glow,
    scrollTo: rooms[0] ?? firstChanged ?? null,
    fly,
    stagger: reducedMotion ? 0 : EDIT_STAGGER_MS,
    state: { lead: "run.updated", detail },
  };
}
