import { describe, it, expect } from "vitest";
import { HOURS, MS_WEEK, WEEKS, type ReliefEvent } from "./types";
import {
  CEILING_PERCENTILE,
  MIN_EVENTS,
  MIN_OCCUPIED_CELLS,
  buildHeightmap,
  ceilingFor,
  checkDensity,
  countGrid,
  normalise,
  smooth,
  weekIndex,
} from "./heightmap";

const spread = (n: number): ReliefEvent[] =>
  Array.from({ length: n }, (_, i) => ({ week: i % WEEKS, hour: (i * 7) % HOURS }));

describe("weekIndex", () => {
  const end = Date.UTC(2026, 8, 3);

  it("puts the newest week in the last column", () => {
    expect(weekIndex(end, end)).toBe(WEEKS - 1);
    expect(weekIndex(end - MS_WEEK, end)).toBe(WEEKS - 2);
  });

  it("drops anything older than the window", () => {
    expect(weekIndex(end - WEEKS * MS_WEEK, end)).toBeNull();
  });

  it("drops anything in the future, because a clock ahead is not a column", () => {
    expect(weekIndex(end + 1, end)).toBeNull();
  });
});

describe("countGrid", () => {
  it("is 24 rows by 52 columns of zeroes for no events", () => {
    const g = countGrid([]);
    expect(g).toHaveLength(HOURS);
    for (const row of g) expect(row).toHaveLength(WEEKS);
    expect(g.flat().every((v) => v === 0)).toBe(true);
  });

  it("counts each event into its own cell", () => {
    const g = countGrid([
      { week: 3, hour: 21 },
      { week: 3, hour: 21 },
      { week: 0, hour: 0 },
    ]);
    expect(g[21][3]).toBe(2);
    expect(g[0][0]).toBe(1);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores an event outside the grid rather than clamping it onto an edge", () => {
    const g = countGrid([
      { week: -1, hour: 0 },
      { week: WEEKS, hour: 0 },
      { week: 0, hour: HOURS },
    ]);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("ceilingFor", () => {
  it("ignores empty cells", () => {
    expect(ceilingFor([0, 0, 0, 5])).toBe(5);
  });

  it("never returns zero, so log1p has something to divide by", () => {
    expect(ceilingFor([])).toBe(1);
    expect(ceilingFor([0, 0])).toBe(1);
  });

  /**
   * The whole point. The index is taken with Math.floor and never interpolated
   * towards the value above it, because the value above it is the outlier.
   */
  it("steps down from the outlier rather than towards it", () => {
    expect(ceilingFor([1, 2, 4, 8, 200])).toBe(8);
    expect(CEILING_PERCENTILE).toBe(0.98);
  });
});

describe("normalise", () => {
  const ceiling = ceilingFor([1, 2, 4, 8, 200]);

  it("draws the table in the plan", () => {
    expect(normalise(0, ceiling)).toBe(0);
    expect(normalise(1, ceiling)).toBeCloseTo(0.3155, 4);
    // ln 3 / ln 9 is exactly one half, which is a pleasant accident and a
    // precise assertion.
    expect(normalise(2, ceiling)).toBeCloseTo(0.5, 12);
    expect(normalise(4, ceiling)).toBeCloseTo(0.7325, 4);
    expect(normalise(8, ceiling)).toBe(1);
  });

  it("clamps the outlier to the summit instead of letting it set the scale", () => {
    expect(normalise(200, ceiling)).toBe(1);
    // What this replaces: linear against the maximum.
    expect(1 / 200).toBeLessThan(0.01);
    expect(normalise(1, ceiling)).toBeGreaterThan(0.3);
  });
});

describe("smooth", () => {
  const grid = (fill: number) =>
    Array.from({ length: HOURS }, () => Array.from({ length: WEEKS }, () => fill));

  it("leaves a uniform field alone, because the kernel sums to one", () => {
    const g = grid(0.4);
    for (const row of smooth(g)) for (const v of row) expect(v).toBeCloseTo(0.4, 12);
  });

  it("never leaves the range it was given", () => {
    const g = grid(0);
    g[5][10] = 1;
    for (const row of smooth(g))
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
  });

  /**
   * Both directions, and that is the point rather than belt and braces. The
   * kernel reads an up neighbour and a down neighbour, so a version testing
   * only one of them survives a mutation to the other: the first run of
   * `scripts/mutation-check.mjs` proved exactly that, with the wrap taken off
   * `u` alone and the suite still green.
   */
  it("wraps the hour axis both ways, because 23:00 is next to 00:00", () => {
    const up = grid(0);
    up[0][10] = 1;
    expect(smooth(up, 1)[HOURS - 1][10]).toBeGreaterThan(0);

    const down = grid(0);
    down[HOURS - 1][10] = 1;
    expect(smooth(down, 1)[0][10]).toBeGreaterThan(0);
  });

  it("clamps the week axis both ways, because the first week of a year is not the last", () => {
    const right = grid(0);
    right[5][0] = 1;
    expect(smooth(right, 1)[5][WEEKS - 1]).toBe(0);

    const left = grid(0);
    left[5][WEEKS - 1] = 1;
    expect(smooth(left, 1)[5][0]).toBe(0);
  });

  it("damps a lone spike and keeps a broad ridge", () => {
    const spike = grid(0);
    spike[10][20] = 1;
    const ridge = grid(0);
    for (let c = 0; c < WEEKS; c++) for (let r = 9; r <= 11; r++) ridge[r][c] = 1;
    expect(smooth(spike)[10][20]).toBeLessThan(0.3);
    expect(smooth(ridge)[10][20]).toBeGreaterThan(0.8);
  });
});

describe("checkDensity", () => {
  it("refuses a year with too few events", () => {
    expect(checkDensity(spread(MIN_EVENTS - 1))).toEqual({ ok: false, reason: "few-events" });
  });

  it("refuses a year piled into too few cells", () => {
    const piled: ReliefEvent[] = [];
    for (let i = 0; i < 400; i++) piled.push({ week: i % 10, hour: 12 });
    expect(checkDensity(piled)).toEqual({ ok: false, reason: "few-cells" });
    expect(MIN_OCCUPIED_CELLS).toBe(30);
  });

  it("accepts a year that is neither", () => {
    expect(checkDensity(spread(400))).toEqual({ ok: true });
  });
});

describe("buildHeightmap", () => {
  it("reports what it drew", () => {
    const h = buildHeightmap(spread(600));
    expect(h.events).toBe(600);
    expect(h.occupied).toBeGreaterThan(MIN_OCCUPIED_CELLS);
    expect(h.field).toHaveLength(HOURS);
    expect(h.field[0]).toHaveLength(WEEKS);
    expect(h.hi).toBeLessThanOrEqual(1);
    expect(h.lo).toBeGreaterThanOrEqual(0);
    expect(h.counts[h.hiAt.row][h.hiAt.col]).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(buildHeightmap(spread(600))).toEqual(buildHeightmap(spread(600)));
  });
});
