/* The mockup's motion grammar (DESIGN.md "The build", "Follow-up updates", "Charts"), tied to mounts.

   - A part that mounts rises in: 14px, a 6px blur burning off, at a 45 ms stagger in page order
     (`.rise` in page.css; this file only hands out the stagger slots).
   - A part whose props change without remounting glows once: a 9 % steel wash over 1.8 s.
   - Bars fill at a 120 ms stagger per row (`--row` in page.css).
   - Reduced motion clamps all of it: content rests visible, nothing glows.
   Since motion follows mounts, an edit that keeps a section's mount never replays its build. */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export const STAGGER_MS = 45;
export const BAR_STAGGER_MS = 120;
export const GLOW_MS = 1800;
const EASE = "cubic-bezier(.16,1,.3,1)"; /* --ease */
const GLOW = "rgba(156,190,224,.09)"; /* 9 % steel */
const GLOW_OFF = "rgba(156,190,224,0)";

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

/** Glows the element once whenever `key` changes after mount; the mount itself does not glow. */
export function useGlow(ref: RefObject<HTMLElement | null>, key: string): void {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const element = ref.current;
    if (!element || typeof element.animate !== "function" || prefersReducedMotion()) return;
    element.animate(
      [
        { backgroundColor: GLOW, offset: 0 },
        { backgroundColor: GLOW, offset: 0.25 },
        { backgroundColor: GLOW_OFF, offset: 1 },
      ],
      { duration: GLOW_MS, easing: EASE },
    );
  }, [ref, key]);
}
