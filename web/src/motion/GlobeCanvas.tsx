/* The dot globe's two canvases (DESIGN.md "Dot globe", "Landing hero").

   - `ThinkingGlobe`: the fixed, full-viewport canvas a run's globe thinks on and flies from
     (mockup/js/orb.js). The run drives it through the `DotGlobe` it hands back.
   - `IdleGlobe`: the agent waiting on the landing, beside the hero line (mockup/js/hero.js). It
     breathes on a 5.6 s cosine, leans in when the command bar takes focus and again when text is
     typed, and brightens the shell's seam with its breath. It draws only on the landing, while on
     screen and in a visible tab; reduced motion holds one still frame. */
import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "../a2ui/motion";
import { canAnimate, context2d, DotGlobe, drawIdle, fibonacciDots, fit } from "./globe";

export function ThinkingGlobe({ globeRef }: { globeRef: RefObject<DotGlobe | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const instance = new DotGlobe(canvas);
    globeRef.current = instance;
    const resize = () => {
      instance.resize();
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      instance.stop();
      if (globeRef.current === instance) globeRef.current = null;
    };
  }, [globeRef]);
  return <canvas ref={ref} className="orb" aria-hidden="true" />;
}

interface IdleGlobeProps {
  /** On the landing: the first tab folds the hero, and the globe with it, away. */
  active: boolean;
  /** The command bar the globe listens to. */
  input: RefObject<HTMLInputElement | null>;
  /** The shell's seam, which brightens and dims with the breath (`--breath`). */
  seam: RefObject<HTMLElement | null>;
}

export function IdleGlobe({ active, input, seam }: IdleGlobeProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas && active ? context2d(canvas) : null;
    if (!canvas || !ctx) return;
    const dots = fibonacciDots();
    const still = prefersReducedMotion() || !canAnimate();
    const state = { focus: 0, typing: 0, spin: 0 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let inView = true;

    const breathe = (breath: number) => {
      seam.current?.style.setProperty("--breath", breath.toFixed(3));
    };
    const draw = (now: number, dt: number) => {
      // ease toward listening: focus in the command bar, then text in it
      const k = Math.min(1, dt / 450);
      const field = input.current;
      state.focus += ((field && document.activeElement === field ? 1 : 0) - state.focus) * k;
      state.typing += ((field?.value.trim() ? 1 : 0) - state.typing) * k;
      state.spin += dt * (1 + 0.8 * state.focus + 0.5 * state.typing); // faster while it listens
      const breath = drawIdle(ctx, dots, w, h, now, state, still);
      if (!still) breathe(breath * (0.8 + 0.2 * state.focus));
    };
    const frame = (now: number) => {
      draw(now, last ? Math.min(64, now - last) : 16);
      last = now;
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const run = !still && inView && !document.hidden;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
      if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        breathe(0);
      }
    };
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      fit(canvas, ctx, w, h);
      if (still) draw(performance.now(), 0);
    };

    size();
    const resizes = typeof ResizeObserver === "function" ? new ResizeObserver(size) : null;
    resizes?.observe(canvas);
    const views =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? true;
            sync();
          })
        : null;
    views?.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      resizes?.disconnect();
      views?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (raf) cancelAnimationFrame(raf);
      breathe(0);
    };
  }, [active, input, seam]);
  return <canvas ref={ref} className="idle" aria-hidden="true" />;
}
