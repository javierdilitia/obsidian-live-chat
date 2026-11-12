/* The agent's line under the shell (DESIGN.md "Agent seam"; mockup/js/core.js `Seam`). A hairline
   at rest; on the landing a centred steel gradient brightens and dims with the globe's breath
   (`--breath`, set each frame by `IdleGlobe` through `ref`); while a page builds or an edit patches
   it, a deep→steel→frost fill grows from the left: 18 % at RUN_STARTED, 55 % when the change
   arrives, 85 % when the dots land, 100 % when it is done, then it fades back to the hairline. */
import type { Ref } from "react";

/** `level` is how far the fill has grown, 0–1; null lets it fade out and empty unseen. */
export function Seam({ level, ref }: { level: number | null; ref?: Ref<HTMLSpanElement> }) {
  const style: Record<string, number> = { "--p": level ?? 0, "--on": level === null ? 0 : 1 };
  return (
    <span
      ref={ref}
      className={level === null ? "seam rest" : "seam"}
      style={style}
      aria-hidden="true"
    />
  );
}
