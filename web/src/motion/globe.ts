/* The dot globe, ported from mockup/js/orb.js and mockup/js/hero.js (DESIGN.md "Dot globe",
   "Landing hero"): 300 dots on a Fibonacci sphere, tilted −0.38 rad, turning slowly while a 5-lobe
   wave rolls across its latitudes. Front dots are larger and frost, back dots small and deep.

   - `DotGlobe` thinks where the page will appear, then its dots fly out on curves and land on the
     outlines of the page's blocks (`outlinePoints`).
   - `IdleGlobe` is the same globe at rest on the landing, breathing on a 5.6 s cosine.

   Canvas drawing is guarded: without a 2D context (jsdom) nothing draws and landing resolves at
   once; without `requestAnimationFrame` nothing loops. */

export interface Dot {
  ux: number;
  uy: number;
  uz: number;
  lat: number;
}

/** A rectangle in viewport pixels, as `getBoundingClientRect` gives it. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Center {
  x: number;
  y: number;
  r: number;
}

export type Point = readonly [number, number];

const N = 300;
const GOLD = Math.PI * (3 - Math.sqrt(5));
const TILT = -0.38;
const DEEP = [110, 155, 209] as const;
const FROST = [214, 230, 245] as const;
const STEEL = [156, 190, 224] as const;
const TAU = 6.2832;
/** One slow breath of the landing globe, in ms. */
const BREATH_MS = 5600;
/** The globe forms out of a point over this long. */
export const FORM_MS = 750;
/** `land` resolves after this long, as the mockup's does: nearly every dot is down by then (flights
 *  take 680–940 ms after a 0–260 ms delay), and the last few settle under the page's fade-in. */
const LAND_MS = 1080;
const FADE_MS = 520;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** A colour between two RGB triples, as the mockup mixes them (each channel floored). */
const tint = (from: readonly number[], to: readonly number[], t: number) =>
  from.map((v, i) => mix(v, to[i] ?? v, t) | 0);
const rgba = (c: readonly number[], a: number) =>
  `rgba(${String(c[0])},${String(c[1])},${String(c[2])},${String(a)})`;

/** 300 points spread evenly over a unit sphere. */
export function fibonacciDots(n = N): Dot[] {
  const dots: Dot[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * GOLD;
    dots.push({ ux: Math.cos(th) * r, uy: y, uz: Math.sin(th) * r, lat: Math.asin(y) });
  }
  return dots;
}

/** Where the globe sits: 44 % down the visible workspace, under the sticky chrome. */
export function orbCenter(workspace: Box, chromeBottom: number, viewportHeight: number): Center {
  const top = Math.max(chromeBottom, workspace.top);
  const span = viewportHeight - top;
  const inner = workspace.width - 48;
  return {
    x: workspace.left + workspace.width / 2,
    y: top + span * 0.44,
    r: clamp(Math.min(span * 0.27, inner * 0.32), 56, 128),
  };
}

/**
 * `n` points spaced evenly along the outlines of the given boxes, in proportion to each outline's
 * length (at least 4 per box), keeping only what sits between `bounds.top` and `bounds.bottom`.
 * Shuffled, so each dot of the globe flies to a random place on the page.
 */
export function outlinePoints(
  boxes: readonly Box[],
  n: number,
  bounds: { top: number; bottom: number },
  random: () => number = Math.random,
): Point[] {
  const rects = boxes
    .map((b) => {
      const y = Math.max(b.top, bounds.top);
      return { x: b.left, y, w: b.width, h: Math.min(b.top + b.height, bounds.bottom) - y };
    })
    .filter((r) => r.h > 3 && r.w > 3);
  const total = rects.reduce((sum, r) => sum + 2 * (r.w + r.h), 0);
  if (!total) return [];
  const points: [number, number][] = [];
  for (const r of rects) {
    const length = 2 * (r.w + r.h);
    const k = Math.max(4, Math.round((length / total) * n));
    for (let i = 0; i < k; i++) {
      let d = ((i + 0.5) / k) * length;
      if (d < r.w) points.push([r.x + d, r.y]);
      else if ((d -= r.w) < r.h) points.push([r.x + r.w, r.y + d]);
      else if ((d -= r.h) < r.w) points.push([r.x + r.w - d, r.y + r.h]);
      else points.push([r.x, r.y + r.h - (d - r.w)]);
    }
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = points[i];
    const b = points[j];
    if (a && b) {
      points[i] = b;
      points[j] = a;
    }
  }
  return points;
}

/** The 2D context, or null where there is none (jsdom). */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

export const canAnimate = () => typeof requestAnimationFrame === "function";

/** Sizes the canvas to its CSS box at the device's pixel ratio (at most 2). */
export function fit(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

interface Projected {
  x: number;
  y: number;
  a: number;
  s: number;
  depth: number;
}

interface Flight {
  from: Projected;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  delay: number;
  dur: number;
}

/** The thinking globe on a fixed, full-viewport canvas (mockup/js/orb.js `Orb`). */
export class DotGlobe {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly dots = fibonacciDots();
  private flights: Flight[] = [];
  private mode: "off" | "think" | "fly" = "off";
  private born = 0;
  private flyAt = 0;
  private fadeAt = 0;
  private raf = 0;
  private w = 0;
  private h = 0;
  private center: Center = { x: 0, y: 0, r: 100 };
  private place: () => Center = () => this.center;
  private still = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = context2d(canvas);
    this.resize();
  }

  /** Follows the window's size. */
  resize(): void {
    if (!this.ctx) return;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    fit(this.canvas, this.ctx, this.w, this.h);
    if (this.mode === "think" && this.still) this.drawStill();
  }

  /** How long the globe has been forming; landing waits until it has formed. */
  age(): number {
    return this.mode === "off" ? Infinity : performance.now() - this.born;
  }

  /**
   * Forms the globe out of a point and keeps it turning where `place` says (read every frame, so
   * the globe follows the workspace while the landing hero folds away). Reduced motion: one still
   * frame of the formed globe.
   */
  think(place: () => Center, reducedMotion: boolean): void {
    this.stop();
    if (!this.ctx) return;
    this.place = place;
    this.mode = "think";
    this.born = performance.now();
    this.still = reducedMotion || !canAnimate();
    if (this.still) this.drawStill();
    else this.raf = requestAnimationFrame(this.frame);
  }

  /** Every dot leaves the globe for a point on the outline; resolves once they have landed. */
  land(points: readonly Point[]): Promise<void> {
    if (!this.ctx || this.mode !== "think" || this.still || points.length === 0) {
      return Promise.resolve();
    }
    const now = performance.now();
    const c = this.center;
    this.flights = this.dots.map((dot, i) => {
      const from = this.sphereAt(dot, now - this.born);
      const [tx, ty] = points[i % points.length] ?? [c.x, c.y];
      // a curved path: each dot swings outward from the globe before landing
      const ox = from.x - c.x;
      const oy = from.y - c.y;
      const len = Math.hypot(ox, oy) || 1;
      const push = 60 + Math.random() * 70;
      return {
        from,
        tx,
        ty,
        cx: (from.x + tx) / 2 + (ox / len) * push,
        cy: (from.y + ty) / 2 + (oy / len) * push,
        delay: Math.random() * 260,
        dur: 680 + Math.random() * 260,
      };
    });
    this.flyAt = now;
    this.mode = "fly";
    return new Promise((resolve) => setTimeout(resolve, LAND_MS));
  }

  /** Fades the dots out (.52 s), wherever they are. */
  fade(): void {
    if (this.mode === "off") return;
    if (this.still) {
      this.stop();
      return;
    }
    this.fadeAt = performance.now();
  }

  stop(): void {
    if (this.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.mode = "off";
    this.fadeAt = 0;
    this.flights = [];
    this.ctx?.clearRect(0, 0, this.w, this.h);
  }

  private sphereAt(dot: Dot, t: number): Projected {
    const { x: cx, y: cy, r } = this.center;
    const a = t * 0.00042;
    const x = dot.ux * Math.cos(a) + dot.uz * Math.sin(a);
    const z = -dot.ux * Math.sin(a) + dot.uz * Math.cos(a);
    const y2 = dot.uy * Math.cos(TILT) - z * Math.sin(TILT);
    const z2 = dot.uy * Math.sin(TILT) + z * Math.cos(TILT);
    const g = 1 - Math.pow(1 - Math.min(1, t / FORM_MS), 3); // forms out of a point
    const wave = 1 + 0.05 * Math.sin(dot.lat * 5 - t * 0.0042); // the LFO, across latitudes
    const rr = r * wave * (0.5 + 0.5 * g);
    const depth = (z2 + 1) / 2;
    return {
      x: cx + x * rr,
      y: cy + y2 * rr,
      a: (0.1 + 0.8 * depth) * g,
      s: 0.55 + 1.45 * depth,
      depth,
    };
  }

  private drawStill(): void {
    if (!this.ctx) return;
    this.center = this.place();
    this.ctx.clearRect(0, 0, this.w, this.h);
    for (const dot of this.dots) this.thinking(this.sphereAt(dot, 4000), 1);
  }

  /** A dot of the turning globe: deep at the back, frost at the front. */
  private thinking(p: Projected, fade: number): void {
    this.dot(p, tint(DEEP, FROST, p.depth), fade);
  }

  private dot(p: Projected, colour: readonly number[], fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = rgba(colour, p.a * fade);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.s, 0, TAU);
    ctx.fill();
  }

  private readonly frame = (now: number): void => {
    const ctx = this.ctx;
    if (!ctx || this.mode === "off") return;
    ctx.clearRect(0, 0, this.w, this.h);
    const fade = this.fadeAt ? clamp(1 - (now - this.fadeAt) / FADE_MS, 0, 1) : 1;
    if (this.mode === "think") {
      this.center = this.place();
      for (const dot of this.dots) this.thinking(this.sphereAt(dot, now - this.born), fade);
    } else {
      const landed = tint(DEEP, STEEL, 0.7);
      for (const f of this.flights) {
        const k = outExpo(clamp((now - this.flyAt - f.delay) / f.dur, 0, 1));
        const u = 1 - k;
        const s = f.from;
        this.dot(
          {
            x: u * u * s.x + 2 * u * k * f.cx + k * k * f.tx,
            y: u * u * s.y + 2 * u * k * f.cy + k * k * f.ty,
            a: mix(s.a, 0.8, k),
            s: mix(s.s, 1.15, k),
            depth: mix(s.depth, 0.55, k),
          },
          landed,
          fade,
        );
      }
    }
    if (this.fadeAt && fade <= 0) {
      this.stop();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}

/** The landing globe's state each frame: how far it leans in, and how far through its breath. */
export interface IdleState {
  /** 0–1: the command bar has focus. */
  focus: number;
  /** 0–1: text is in the command bar. */
  typing: number;
  /** Accumulated turn, in ms of rotation. */
  spin: number;
}

/**
 * Draws one frame of the agent waiting on the landing (mockup/js/hero.js `draw`) on a `w`×`h`
 * canvas and returns the breath (0–1) the shell's seam brightens with. `still` holds the reduced
 * motion frame.
 */
export function drawIdle(
  ctx: CanvasRenderingContext2D,
  dots: readonly Dot[],
  w: number,
  h: number,
  now: number,
  { focus, typing, spin }: IdleState,
  still: boolean,
): number {
  const breath = still ? 0.5 : 0.5 - 0.5 * Math.cos((now / BREATH_MS) * Math.PI * 2);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.4 * (0.93 + 0.07 * breath + 0.04 * focus);
  const glow = 0.55 + 0.3 * breath + 0.15 * focus;
  const amp = 0.03 + 0.05 * typing;
  const a = spin * 0.00028;
  ctx.clearRect(0, 0, w, h);
  for (const d of dots) {
    const x = d.ux * Math.cos(a) + d.uz * Math.sin(a);
    const z = -d.ux * Math.sin(a) + d.uz * Math.cos(a);
    const y2 = d.uy * Math.cos(TILT) - z * Math.sin(TILT);
    const z2 = d.uy * Math.sin(TILT) + z * Math.cos(TILT);
    const rr = r * (1 + amp * Math.sin(d.lat * 5 - now * 0.0016)); // the slow wave
    const depth = (z2 + 1) / 2;
    ctx.fillStyle = rgba(tint(DEEP, FROST, depth), (0.08 + 0.82 * depth) * glow);
    ctx.beginPath();
    ctx.arc(cx + x * rr, cy + y2 * rr, 0.5 + 1.35 * depth, 0, TAU);
    ctx.fill();
  }
  return breath;
}
