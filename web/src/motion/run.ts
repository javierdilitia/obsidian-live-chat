/* Carries a run's plan out on the page (mockup/js/agent.js `build` and `patch`, mapped to A2UI by
   spec §9). The app calls `startThinking` at RUN_STARTED and `playMessages` with the run's A2UI
   messages once the stream ends (the server sends them together, just before RUN_FINISHED).

   A build: the globe forms where the page will appear; the page is laid out unseen; the dots land
   on the outlines of its blocks; it fades in under them and its parts cascade in.
   An edit: the parts it names step back; the change is applied with those parts held out of view;
   a new section opens its room; the dots land on what changed; those parts rise in and the ones
   that were there before glow once. Nothing is remounted for any of it: the parts are moved by
   Web Animations on their own elements, and newly mounted parts wait (`data-motion`) to rise. */
import type { ReactCatalogComponent } from "@a2ui/react";
import type { MessageProcessor, SurfaceModel } from "@a2ui/web_core/v1_0";
import {
  glow,
  holdHidden,
  partElement,
  prefersReducedMotion,
  release,
  riseIn,
  stepBack,
} from "../a2ui/motion";
import { planRun, ROOT, stepBackIds, type PageTree, type Plan } from "./choreography";
import { FORM_MS, orbCenter, outlinePoints, type Center, type DotGlobe } from "./globe";

type Surface = SurfaceModel<ReactCatalogComponent>;
type Processor = MessageProcessor<ReactCatalogComponent>;
type Message = Record<string, unknown>;

/** What a run moves: the workspace that holds the page, the sticky chrome above it, the thinking
 *  globe and the shell's seam. */
export interface Stage {
  workspace: HTMLElement;
  chrome: HTMLElement | null;
  globe: DotGlobe | null;
  seam: (level: number) => void;
}

export interface Played {
  /** What the renderer refused; the page on screen is then out of date. */
  rejected: unknown[];
  plan: Plan | null;
}

/** The blocks of a built page whose outlines the dots land on (mockup/js/orb.js `OUTLINE`). */
const OUTLINE = ".art-header h2, .art-meta, .verdict, .prod, .spec-row, .chart-cell, .art-foot";
/** Points on the page's outlines: one per dot of the globe. */
const DOTS = 300;
/** The globe over an edit is smaller, so it sits over the page instead of hiding it. */
const EDIT_SCALE = 0.72;
const STEP_BACK_MS = 380;
/** A smooth scroll waits for `scrollend`, at least the mockup's 450 ms and at most 900 ms. */
const SCROLL_MS = 450;
const SCROLL_MAX_MS = 900;
const ROOM_MS = 620;
const FADE_IN_MS = 420;

/** Waits `ms`; under reduced motion at most 40 ms, as the mockup's `sleep` does. */
function sleep(ms: number, reducedMotion: boolean): Promise<void> {
  const wait = reducedMotion ? Math.min(ms, 40) : ms;
  return new Promise((resolve) => setTimeout(resolve, wait));
}

/** Waits for a smooth scroll to settle, so the dots land where the parts end up. */
async function scrollSettled(reducedMotion: boolean): Promise<void> {
  if (reducedMotion) return sleep(SCROLL_MS, true);
  const settled = new Promise<void>((resolve) => {
    const timer = setTimeout(done, SCROLL_MAX_MS);
    function done() {
      clearTimeout(timer);
      window.removeEventListener("scrollend", done);
      resolve();
    }
    window.addEventListener("scrollend", done);
  });
  await Promise.all([settled, sleep(SCROLL_MS, false)]);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => {
        resolve();
      });
    else setTimeout(resolve, 16);
  });
}

function chromeBottom(stage: Stage): number {
  return stage.chrome?.getBoundingClientRect().bottom ?? 0;
}

function place(stage: Stage, scale: number): Center {
  const center = orbCenter(
    stage.workspace.getBoundingClientRect(),
    chromeBottom(stage),
    window.innerHeight,
  );
  return { ...center, r: center.r * scale };
}

/** RUN_STARTED: the globe forms out of a point in the visible workspace; over the page for an
 *  edit, at 72 % of its radius. The seam fills to 18 %. */
export function startThinking(stage: Stage, editing: boolean): void {
  stage.seam(0.18);
  stage.globe?.think(() => place(stage, editing ? EDIT_SCALE : 1), prefersReducedMotion());
}

/** The run ended without a page to show: the globe fades where it is. */
export function stopThinking(stage: Stage): void {
  stage.globe?.fade();
}

/** The page as the renderer holds it: every component with the IDs it refers to. */
export function readTree(surface: Surface): PageTree {
  const model = surface.componentsModel;
  const children: Record<string, string[]> = {};
  for (const id of model.keys) children[id] = model.getChildIds(id);
  const listed: unknown = model.get(ROOT)?.properties.children;
  const sections = Array.isArray(listed)
    ? listed.filter((id): id is string => typeof id === "string")
    : [];
  return { sections, children };
}

/** The component IDs a run's messages name. */
function namedIds(messages: readonly Message[]): string[] {
  return messages.flatMap((message) => {
    const body = (message.updateComponents ?? message.createSurface) as
      { components?: { id?: unknown }[] } | undefined;
    return (body?.components ?? []).flatMap(({ id }) => (typeof id === "string" ? [id] : []));
  });
}

function surfaceIdOf(messages: readonly Message[]): string | undefined {
  for (const message of messages) {
    for (const body of Object.values(message)) {
      const id = (body as { surfaceId?: unknown } | null)?.surfaceId;
      if (typeof id === "string") return id;
    }
  }
  return undefined;
}

function parts(scope: ParentNode, ids: readonly string[]): HTMLElement[] {
  return ids.flatMap((id) => partElement(scope, id) ?? []);
}

function roomOf(scope: ParentNode, id: string): HTMLElement | null {
  return partElement(scope, id)?.closest<HTMLElement>(".room") ?? null;
}

/** Waits for React to put the page on screen: the build's first page, or an edit's change. */
async function rendered(workspace: HTMLElement, build: boolean): Promise<void> {
  await nextFrame();
  for (let frame = 0; build && frame < 60 && !partElement(workspace, ROOT); frame++) {
    await nextFrame();
  }
  await nextFrame();
}

/** Brings `room` into view below the sticky chrome, unless it is in view already. Returns whether
 *  the page scrolled. */
function scrollToRoom(stage: Stage, room: HTMLElement, reducedMotion: boolean): boolean {
  if (typeof room.scrollIntoView !== "function") return false;
  const below = chromeBottom(stage);
  const top = room.getBoundingClientRect().top;
  const height = room.querySelector(".room-inner")?.scrollHeight ?? 0;
  if (top >= below && top + height <= window.innerHeight) return false;
  room.style.scrollMarginTop = `${String(Math.round(below + 16))}px`;
  room.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
  return true;
}

/** Lets go of everything a run holds, with no motion: the page as it is. */
function letGo(stage: Stage, held: readonly HTMLElement[]): void {
  delete stage.workspace.dataset.motion;
  for (const element of held) release(element);
  for (const room of stage.workspace.querySelectorAll<HTMLElement>(".room[data-shut]")) {
    delete room.dataset.shut;
  }
  stage.globe?.fade();
}

/**
 * Applies a run's messages to the page with the run's choreography, and resolves once the page is
 * built or updated. `surface` is the page on screen before the run (null before the first build).
 */
export async function playMessages(
  stage: Stage,
  processor: Processor,
  messages: readonly Message[],
  surface: Surface | null,
): Promise<Played> {
  const reducedMotion = prefersReducedMotion();
  const { workspace, globe } = stage;
  const build = !surface || messages.some((message) => "createSurface" in message);
  const before = build ? null : readTree(surface);
  const changed = namedIds(messages);

  stage.seam(0.55);
  // the globe forms before its dots can fly
  if (globe && !reducedMotion) await sleep(Math.max(0, FORM_MS - globe.age()), false);

  // what mounts from here waits to rise, and a build's page is laid out unseen
  workspace.dataset.motion = build ? "build" : "edit";
  workspace.style.setProperty("--rise-step", `${String(build ? 45 : 40)}ms`);

  // the parts about to change step back; everything else stays exactly where it is
  const backs = before ? parts(workspace, stepBackIds(before, changed, reducedMotion)) : [];
  for (const element of backs) stepBack(element);
  if (backs.length > 0) await sleep(STEP_BACK_MS, reducedMotion);

  let rejected: unknown[];
  try {
    rejected = processor.processMessagesWithErrors(messages);
  } catch (error) {
    rejected = [error];
  }
  const id = surfaceIdOf(messages);
  const after = id === undefined ? undefined : processor.model.getSurface(id);
  if (rejected.length > 0 || !after) {
    letGo(stage, backs);
    return { rejected, plan: null };
  }
  await rendered(workspace, build);
  for (const element of backs) holdHidden(element);

  const plan = planRun({ before, after: readTree(after), changed, reducedMotion });

  // an edit brings what changed into view, then opens room for a new section
  const target = plan.scrollTo === null ? null : roomOf(workspace, plan.scrollTo);
  if (target && scrollToRoom(stage, target, reducedMotion)) await scrollSettled(reducedMotion);
  const rooms = plan.rooms.flatMap((section) => roomOf(workspace, section) ?? []);
  for (const room of rooms) delete room.dataset.shut;
  if (rooms.length > 0) await sleep(ROOM_MS, reducedMotion);

  // the dots land on the outline of the page (a build) or of what changed (an edit)
  const page = partElement(workspace, ROOT);
  const nodes =
    plan.kind === "build"
      ? page
        ? [page, ...page.querySelectorAll<HTMLElement>(OUTLINE)]
        : []
      : parts(workspace, plan.land);
  if (globe && plan.fly) {
    const bounds = { top: chromeBottom(stage) + 4, bottom: window.innerHeight - 4 };
    const boxes = nodes.map((node) => node.getBoundingClientRect());
    await globe.land(outlinePoints(boxes, DOTS, bounds));
  }
  stage.seam(0.85);
  globe?.fade();

  // the page fades in under the dots; the parts rise in, and those that were there glow once
  delete workspace.dataset.motion;
  if (plan.kind === "build" && page && typeof page.animate === "function") {
    page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: "ease-out" });
  }
  const risen = new Set<HTMLElement>();
  plan.rise.forEach((part, i) => {
    const element = partElement(workspace, part);
    if (!element || !plan.stepBack.includes(part)) return; // a new part rises as it mounted
    riseIn(element, i * plan.stagger);
    risen.add(element);
  });
  // a part held back that the change moved elsewhere comes back as it is
  for (const element of backs) if (!risen.has(element)) release(element);
  for (const part of plan.glow) {
    const element =
      part === ROOT
        ? (page?.querySelector<HTMLElement>(".art-head") ?? null)
        : partElement(workspace, part);
    if (element) glow(element, Math.max(0, plan.rise.indexOf(part)) * plan.stagger);
  }
  await sleep(FADE_IN_MS, reducedMotion);
  return { rejected, plan };
}
