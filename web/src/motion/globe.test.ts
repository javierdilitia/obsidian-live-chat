/* The dot globe's geometry (mockup/js/orb.js): where the dots land, and where the globe sits. */
import { fibonacciDots, orbCenter, outlinePoints, type Box } from "./globe";

/** How far along a box's outline a point sits, clockwise from its top-left corner; -1 if off it. */
function along(box: Box, [x, y]: readonly [number, number]): number {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const { left, top, width, height } = box;
  if (near(y, top) && x >= left && x <= left + width) return x - left;
  if (near(x, left + width) && y >= top && y <= top + height) return width + (y - top);
  if (near(y, top + height) && x >= left && x <= left + width) {
    return width + height + (left + width - x);
  }
  if (near(x, left) && y >= top && y <= top + height) {
    return 2 * width + height + (top + height - y);
  }
  return -1;
}

test("outlinePoints spaces n points along the given rects", () => {
  const wide: Box = { left: 10, top: 100, width: 300, height: 100 }; // outline 800
  const small: Box = { left: 400, top: 300, width: 50, height: 50 }; // outline 200
  const points = outlinePoints([wide, small], 100, { top: 0, bottom: 1000 });

  // each box gets its share of n by outline length (800:200), at least 4
  const onWide = points.map((p) => along(wide, p)).filter((d) => d >= 0);
  const onSmall = points.map((p) => along(small, p)).filter((d) => d >= 0);
  expect(onWide).toHaveLength(80);
  expect(onSmall).toHaveLength(20);
  expect(points).toHaveLength(100);

  // evenly spaced: the k points sit at (i + .5) / k of the way round
  const spaced = (distances: number[], length: number) => {
    const sorted = [...distances].sort((a, b) => a - b);
    sorted.forEach((d, i) => {
      expect(d).toBeCloseTo(((i + 0.5) / sorted.length) * length, 6);
    });
  };
  spaced(onWide, 800);
  spaced(onSmall, 200);
});

test("outlinePoints keeps to what is on screen, and gives a tiny box at least 4 points", () => {
  const bounds = { top: 150, bottom: 600 };
  const cut: Box = { left: 0, top: 100, width: 100, height: 100 }; // the top 50px is under the chrome
  const gone: Box = { left: 0, top: 700, width: 100, height: 100 }; // below the fold
  const dot: Box = { left: 300, top: 300, width: 4, height: 4 };
  const points = outlinePoints([cut, gone, dot], 40, bounds);

  for (const [, y] of points) {
    expect(y).toBeGreaterThanOrEqual(150);
    expect(y).toBeLessThanOrEqual(600);
  }
  const visible: Box = { left: 0, top: 150, width: 100, height: 50 };
  expect(points.filter((p) => along(visible, p) >= 0).length).toBeGreaterThan(30);
  expect(points.filter((p) => along(dot, p) >= 0)).toHaveLength(4);
  expect(outlinePoints([gone], 40, bounds)).toEqual([]);
});

test("the globe sits in the middle of the visible workspace", () => {
  const workspace = { left: 100, top: 300, width: 1000, height: 2000 };
  // the sticky chrome ends above the workspace: the globe sits 44 % down what is left
  expect(orbCenter(workspace, 200, 900)).toEqual({ x: 600, y: 300 + 600 * 0.44, r: 128 });
  // scrolled: the workspace runs under the chrome, so the chrome's bottom is the top
  const scrolled = { ...workspace, top: -500 };
  const { y, r } = orbCenter(scrolled, 171, 600);
  expect(y).toBeCloseTo(171 + 429 * 0.44);
  expect(r).toBeCloseTo(429 * 0.27);
  // never smaller than 56 px
  expect(orbCenter({ ...workspace, width: 120 }, 200, 900).r).toBe(56);
});

test("the globe has 300 dots on a unit sphere", () => {
  const dots = fibonacciDots();
  expect(dots).toHaveLength(300);
  for (const { ux, uy, uz } of dots) {
    expect(Math.hypot(ux, uy, uz)).toBeCloseTo(1, 9);
  }
});
