/* The mockup's motion grammar for the page's parts (DESIGN.md "The build", "Follow-up updates",
   "Charts"; mockup/css/artifacts.css `.rise`, `.out`, `.morph`).

   - A part that mounts rises in: 14px, a 6px blur burning off, at a stagger in page order
     (`.rise` in page.css, `--rise-step` 45 ms for a build and 40 ms for an edit; this file only
     hands out the stagger slots). While a run holds the page (`data-motion` on the workspace) the
     rise waits, so it starts when the dots have landed.
   - An edit's changed parts are moved here, by the run (`motion/run.ts`), with Web Animations on the
     parts' own elements, so React never re-renders or remounts anything for them: they step back,
     wait hidden while the change arrives, rise in and glow once with a 9 % steel wash.
   - Bars fill at a 120 ms stagger per row (`--row` in page.css).
   - Reduced motion clamps all of it: content rests visible, nothing glows. */
import { useLayoutEffect, type RefObject } from "react";

export const STAGGER_MS = 45;
export const BAR_STAGGER_MS = 120;
export const GLOW_MS = 1800;
const STEP_BACK_MS = 300;
const RISE_MS = 600;
const EASE = "cubic-bezier(.16,1,.3,1)"; /* --ease */
const GLOW = "rgba(156,190,224,.09)"; /* 9 % steel */
const GLOW_OFF = "rgba(156,190,224,0)";

/* the part at rest, stepped back (`.rise.in.out`), and waiting to rise (`.rise`) */
const REST: Keyframe = { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" };
const BACK: Keyframe = { opacity: 0.1, transform: "translateY(-3px)", filter: "blur(3px)" };
const HIDDEN: Keyframe = { opacity: 0, transform: "translateY(14px)", filter: "blur(6px)" };

/** Series colours by position, never by the model: frost, steel, deep, then a neutral fourth. */
const SERIES = ["var(--frost)", "var(--steel)", "var(--deep)", "var(--tx-2)"] as const;

export function seriesColour(index: number): string {
  return SERIES[index % SERIES.length] ?? SERIES[0];
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Every `.rise` element mounted in one commit joins one batch; the batch is numbered in page
   order before the browser paints, so the cascade runs top to bottom whatever order React
   mounted the parts in. */
let batch = new Set<HTMLElement>();

function queueRise(elements: Iterable<HTMLElement>): void {
  if (batch.size === 0) queueMicrotask(flushRise);
  for (const element of elements) batch.add(element);
}

function flushRise(): void {
  const elements = [...batch].filter((element) => element.isConnected);
  batch = new Set();
  elements.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  elements.forEach((element, index) => {
    element.style.setProperty("--rise-i", String(index));
  });
}

/** On mount, staggers the element's `.rise` parts (and its own, if it is one) into the cascade. */
export function useRise(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const parts = [...root.querySelectorAll<HTMLElement>(".rise")];
    if (root.classList.contains("rise")) parts.unshift(root);
    queueRise(parts);
  }, [ref]);
}

/* ——— the parts an edit names: found by component ID, moved without React ——— */

/** The element of the catalog component with this ID (each marks its root `data-part`). */
export function partElement(scope: ParentNode, id: string): HTMLElement | null {
  for (const element of scope.querySelectorAll<HTMLElement>("[data-part]")) {
    if (element.dataset.part === id) return element;
  }
  return null;
}

/** The animation that holds a part out of view (stepped back, or waiting to rise). */
const held = new WeakMap<Element, Animation>();

function play(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  return typeof element.animate === "function" ? element.animate(keyframes, options) : null;
}

function hold(element: HTMLElement, animation: Animation | null): void {
  held.get(element)?.cancel();
  if (animation) held.set(element, animation);
  else held.delete(element);
}

/** The part steps back while its change arrives: opacity .1, 3px blur, 3px lift, .3s. */
export function stepBack(element: HTMLElement): void {
  hold(
    element,
    play(element, [REST, BACK], { duration: STEP_BACK_MS, easing: EASE, fill: "forwards" }),
  );
}

/** The part, its change applied, waits out of view for the dots to land. */
export function holdHidden(element: HTMLElement): void {
  hold(element, play(element, [HIDDEN, HIDDEN], { duration: 1, fill: "forwards" }));
}

/**
 * Parts that rise never nest (mockup/js/artifacts.js: "data-k elements never nest"; `patch` marks
 * everything inside a changed part as risen up front). What mounted inside this part during the run
 * would otherwise play its own CSS rise (`.rise`) once the run lets go of the page, on top of the
 * part's: so it is marked settled and rests where the part's rise puts it. Bars are left alone:
 * they refill by themselves (`.bar-fill`), as a changed chart's bars do in the mockup.
 */
function settle(element: HTMLElement): void {
  for (const inner of element.querySelectorAll<HTMLElement>(".rise")) inner.dataset.settled = "";
}

/** The part rises in (.6s) after `delay` ms, from wherever it was held. */
export function riseIn(element: HTMLElement, delay: number): void {
  settle(element);
  play(element, [HIDDEN, REST], { duration: RISE_MS, delay, easing: EASE, fill: "backwards" });
  hold(element, null);
}

/** Lets go of a part held by `stepBack` or `holdHidden`, with no motion. */
export function release(element: HTMLElement): void {
  hold(element, null);
}

/**
 * The part glows once: a 9 % steel wash held for the first quarter, then easing off over 1.8 s
 * (the mockup's `@keyframes morph`). The easing sits on the keyframe, as a CSS animation's timing
 * function does: given as the animation's own easing it would bend the whole timeline instead,
 * and the wash would be half gone in a quarter of a second.
 */
export function glow(element: HTMLElement, delay: number): void {
  play(
    element,
    [
      { backgroundColor: GLOW, offset: 0 },
      { backgroundColor: GLOW, offset: 0.25, easing: EASE },
      { backgroundColor: GLOW_OFF, offset: 1 },
    ],
    { duration: GLOW_MS, delay },
  );
}
