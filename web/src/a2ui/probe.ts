/* The mount probe: how many times each catalog component has mounted, by component ID.

   An edit that inserts a section must mount only that section; everything else keeps its mount
   (and so its motion state). `?probe` in the URL shows the counts on screen. A mount is counted
   once per fiber: StrictMode's dev-only effect replay reuses the fiber's ref and is not counted,
   while a real remount gets a fresh ref and counts again. */
import { useEffect, useRef, useSyncExternalStore } from "react";

const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: Readonly<Record<string, number>> = {};

function publish(): void {
  snapshot = Object.fromEntries(counts);
  for (const listener of listeners) listener();
}

/** Counts one mount of the component with this ID. */
export function useMountProbe(id: string): void {
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    publish();
  }, [id]);
}

/** Mounts per component ID since the last reset. */
export function mountCounts(): Readonly<Record<string, number>> {
  return snapshot;
}

export function resetMountProbe(): void {
  counts.clear();
  publish();
}

/** Whether `?probe` is in the page URL. */
export function probeEnabled(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).has("probe");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The counts, re-rendering whenever one changes. */
export function useMountCounts(): Readonly<Record<string, number>> {
  return useSyncExternalStore(subscribe, mountCounts);
}
