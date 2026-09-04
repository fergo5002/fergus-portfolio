import { describe, it, expect } from "vitest";
import type { Field, Point } from "./types";
import { LEVELS, chainSegments, contour, contourLayers, isClosed, isIndexLevel } from "./contour";

/** 0 everywhere except a single 1 in the middle. The smallest closed ring there is. */
const peak: Field = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 0],
];

describe("contour", () => {
  it("finds nothing when the level is above everything", () => {
    expect(contour(peak, 2)).toHaveLength(0);
  });

  it("finds nothing when the level is below everything", () => {
    expect(contour(peak, -1)).toHaveLength(0);
  });

  it("rings a single peak with four segments", () => {
    expect(contour(peak, 0.5)).toHaveLength(4);
  });

  it("puts the crossings exactly halfway when the level is halfway", () => {
    const key = (p: Point) => `${p.x},${p.y}`;
    const points = contour(peak, 0.5).flat().map(key);
    expect(new Set(points)).toEqual(new Set(["0.5,1", "1,0.5", "1.5,1", "1,1.5"]));
  });

  it("reads its size off the array rather than a module constant", () => {
    const wide: Field = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    expect(contour(wide, 0.5).length).toBeGreaterThan(4);
  });

  it("returns nothing for a grid too small to hold a cell", () => {
    expect(contour([[1]], 0.5)).toHaveLength(0);
    expect(contour([], 0.5)).toHaveLength(0);
  });
});

describe("chainSegments", () => {
  it("joins a ring into one closed polyline", () => {
    const lines = chainSegments(contour(peak, 0.5));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(5);
    expect(isClosed(lines[0])).toBe(true);
  });

  it("keeps an open line open", () => {
    const ramp: Field = [
      [0, 1],
      [0, 1],
    ];
    const lines = chainSegments(contour(ramp, 0.5));
    expect(lines).toHaveLength(1);
    expect(isClosed(lines[0])).toBe(false);
  });

  it("loses no segment", () => {
    const segs = contour(peak, 0.5);
    const drawn = chainSegments(segs).reduce((a, l) => a + l.length - 1, 0);
    expect(drawn).toBe(segs.length);
  });

  /**
   * The reason this function exists. A plotter lifts the pen between paths, so
   * loose segments mean one lift per cell edge and a plot that takes hours and
   * comes out furry.
   */
  it("cuts the pen lifts by an order of magnitude on a real-sized field", () => {
    const field: Field = Array.from({ length: 24 }, (_, r) =>
      Array.from({ length: 52 }, (_, c) => Math.sin(c / 6) * 0.3 + Math.cos(r / 4) * 0.3 + 0.5),
    );
    const segs = contour(field, 0.5);
    const lines = chainSegments(segs);
    expect(segs.length).toBeGreaterThan(40);
    expect(lines.length * 8).toBeLessThan(segs.length);
  });

  it("handles an empty input", () => {
    expect(chainSegments([])).toEqual([]);
  });
});

describe("levels", () => {
  it("is six, evenly spaced, inside the open unit interval", () => {
    expect(LEVELS).toEqual([0.15, 0.3, 0.45, 0.6, 0.75, 0.9]);
    for (const l of LEVELS) {
      expect(l).toBeGreaterThan(0);
      expect(l).toBeLessThan(1);
    }
  });

  it("makes every second one an index contour, which is the Ordnance convention", () => {
    expect([0, 1, 2, 3, 4, 5].map(isIndexLevel)).toEqual([false, true, false, true, false, true]);
  });
});

describe("contourLayers", () => {
  it("returns one layer per level, in order, each with its own lines", () => {
    const field: Field = Array.from({ length: 24 }, (_, r) =>
      Array.from({ length: 52 }, (_, c) => Math.min(1, Math.max(0, (c + r) / 74))),
    );
    const layers = contourLayers(field);
    expect(layers).toHaveLength(LEVELS.length);
    expect(layers.map((l) => l.level)).toEqual([...LEVELS]);
    expect(layers.some((l) => l.lines.length > 0)).toBe(true);
  });
});
