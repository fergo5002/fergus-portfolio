import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import {
  SAMPLES_PER_HOUR,
  baselineY,
  hourX,
  pickHour,
  pickRidge,
  readCount,
  ridgeGeometry,
  ridgelines,
  type Ridge,
  type RidgeLayout,
} from "./ridgeline";
import { HOURS, WEEKS, type Field, type ReliefEvent } from "./types";

/** A 24 by 52 field (rows are hours, columns are weeks), every cell `fill`. */
function field(fill = 0): Field {
  return Array.from({ length: HOURS }, () => Array.from({ length: WEEKS }, () => fill));
}

/** The y of `ridge`'s full line at `x`, read off its samples. */
function lineAt(ridge: Ridge, x: number): number {
  const pts = ridge.points;
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
      return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y);
    }
  }
  return pts[pts.length - 1].y;
}

const EPS = 1e-6;

describe("ridgeGeometry", () => {
  it("fills the width it is given and no more", () => {
    for (const w of [300, 320, 390, 760, 988]) {
      const g = ridgeGeometry(w);
      expect(g.width).toBe(w);
      expect(g.padLeft + g.plotWidth + g.padRight).toBeCloseTo(w, 6);
      expect(g.plotWidth).toBeGreaterThan(0);
      expect(g.spacing).toBeGreaterThan(0);
      expect(g.amplitude).toBeGreaterThan(g.spacing);
    }
  });

  it("is tall enough for every ridge and a full-height peak on the back one", () => {
    for (const w of [320, 760]) {
      const g = ridgeGeometry(w);
      expect(baselineY(g, 1) - g.amplitude).toBeGreaterThanOrEqual(g.padTop - EPS);
      expect(baselineY(g, WEEKS)).toBeLessThanOrEqual(g.height - g.padBottom + EPS);
    }
  });

  it("keeps the ridges far enough apart to read on a phone", () => {
    expect(ridgeGeometry(300).spacing).toBeGreaterThanOrEqual(3);
  });

  it("leaves room either side for an hour label centred on the plot's edge", () => {
    // Two digits at 12px are about 15px wide; half of that must fit in the pad.
    for (const w of [280, 330, 760]) expect(ridgeGeometry(w).padLeft).toBeGreaterThanOrEqual(8);
  });
});

describe("ridgelines: one ridge per week, back to front", () => {
  const g = ridgeGeometry(760);
  const demo = ridgelines(buildHeightmap(demoEvents()).field, g);

  it("draws one ridge for each of the 52 weeks", () => {
    expect(demo).toHaveLength(WEEKS);
    expect(demo.map((r) => r.week)).toEqual(Array.from({ length: WEEKS }, (_, i) => i + 1));
  });

  it("orders them back to front: week 1 furthest up the sheet, week 52 at the front", () => {
    for (let i = 1; i < demo.length; i++) {
      expect(demo[i].baseline).toBeGreaterThan(demo[i - 1].baseline);
    }
    expect(demo[0].baseline).toBeCloseTo(baselineY(g, 1), 6);
    expect(demo[WEEKS - 1].baseline).toBeCloseTo(baselineY(g, WEEKS), 6);
  });

  it("samples every ridge across the day at a fixed resolution", () => {
    for (const ridge of demo) {
      expect(ridge.points).toHaveLength((HOURS - 1) * SAMPLES_PER_HOUR + 1);
      expect(ridge.points[0].x).toBeCloseTo(hourX(g, 0), 6);
      expect(ridge.points[ridge.points.length - 1].x).toBeCloseTo(hourX(g, HOURS - 1), 6);
      expect(ridge.hourY).toHaveLength(HOURS);
    }
  });

  it("puts every point, drawn or hidden, inside the plot box, at every width", () => {
    // A full field and a comb of 0s and 1s: the comb is what a cubic through
    // the samples overshoots on, so it is the case that would leave the box.
    const comb = field();
    for (let h = 0; h < HOURS; h++) for (let w = 0; w < WEEKS; w++) comb[h][w] = (h + w) % 2;
    // Offenders are collected and asserted once: an `expect` per point is
    // three quarters of a million calls and fifteen seconds of suite.
    const offenders: string[] = [];
    let seen = 0;
    for (const width of [320, 390, 760, 988]) {
      const geo = ridgeGeometry(width);
      for (const [name, f] of [["full", field(1)], ["comb", comb], ["demo", buildHeightmap(demoEvents()).field]] as const) {
        for (const ridge of ridgelines(f, geo)) {
          for (const p of [...ridge.points, ...ridge.visible.flat()]) {
            seen++;
            const inside =
              p.x >= geo.padLeft - EPS &&
              p.x <= geo.width - geo.padRight + EPS &&
              p.y >= geo.padTop - EPS &&
              p.y <= geo.height - geo.padBottom + EPS &&
              // Never above a full-height peak, never below its own baseline.
              p.y >= ridge.baseline - geo.amplitude - EPS &&
              p.y <= ridge.baseline + EPS;
            if (!inside) offenders.push(`${width} ${name} week ${ridge.week} (${p.x}, ${p.y})`);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(50_000);
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it("draws a flat week flat, whatever its neighbours are doing", () => {
    const f = field(0.8);
    for (let h = 0; h < HOURS; h++) f[h][19] = 0;
    const week20 = ridgelines(f, g)[19];
    for (const p of week20.points) expect(p.y).toBeCloseTo(week20.baseline, 9);
  });

  it("lands a peak at its hour, at full height", () => {
    const f = field();
    f[7][29] = 1;
    const week30 = ridgelines(f, g)[29];
    const top = week30.points.reduce((a, b) => (b.y < a.y ? b : a));
    expect(top.x).toBeCloseTo(hourX(g, 7), 6);
    expect(top.y).toBeCloseTo(week30.baseline - g.amplitude, 6);
    expect(week30.hourY[7]).toBeCloseTo(week30.baseline - g.amplitude, 6);
  });

  it("gives each hour the height the field gives it, so the ground is the same ground as the contours", () => {
    const f = buildHeightmap(demoEvents()).field;
    const ridges = ridgelines(f, g);
    for (const w of [0, 25, 51]) {
      for (let h = 0; h < HOURS; h++) {
        expect(ridges[w].hourY[h]).toBeCloseTo(ridges[w].baseline - g.amplitude * f[h][w], 6);
      }
    }
  });
});

describe("ridgelines: occlusion", () => {
  const g = ridgeGeometry(760);

  it("draws the front ridge whole, because nothing stands in front of it", () => {
    const ridges = ridgelines(buildHeightmap(demoEvents()).field, g);
    const front = ridges[WEEKS - 1];
    expect(front.visible).toHaveLength(1);
    expect(front.visible[0]).toEqual(front.points);
  });

  it("never draws a line where a ridge in front of it stands", () => {
    const ridges = ridgelines(buildHeightmap(demoEvents()).field, g);
    const offenders: string[] = [];
    let checked = 0;
    for (let r = 0; r < ridges.length - 1; r++) {
      for (const p of ridges[r].visible.flat()) {
        for (let f = r + 1; f < ridges.length; f++) {
          // Smaller y is higher. A drawn point may touch a front line, never sit below it.
          if (p.y > lineAt(ridges[f], p.x) + 1e-3) offenders.push(`week ${r + 1} under week ${f + 1} at x ${p.x}`);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it("hides the stretch of a back ridge behind a tall front peak, and keeps the rest", () => {
    const f = field();
    f[12][51] = 1; // one tall peak on the front ridge at noon
    const ridges = ridgelines(f, g);
    const behind = ridges[47]; // four weeks back, well inside the peak's shadow
    const noon = hourX(g, 12);
    const drawnNearNoon = behind.visible.flat().filter((p) => Math.abs(p.x - noon) < g.plotWidth / 60);
    expect(drawnNearNoon).toEqual([]);
    // Broken around the peak into a morning piece and an evening piece.
    expect(behind.visible.length).toBe(2);
    expect(behind.visible[0][0].x).toBeCloseTo(hourX(g, 0), 6);
    expect(behind.visible[1][behind.visible[1].length - 1].x).toBeCloseTo(hourX(g, HOURS - 1), 6);
  });

  it("shows every line of a flat year, because a flat ridge hides nothing", () => {
    for (const ridge of ridgelines(field(), g)) {
      expect(ridge.visible).toHaveLength(1);
      expect(ridge.visible[0]).toHaveLength(ridge.points.length);
    }
  });
});

describe("the crosshair", () => {
  const g: RidgeLayout = ridgeGeometry(760);

  it("snaps to the nearest hour, and stays on the plot", () => {
    const step = hourX(g, 1) - hourX(g, 0);
    expect(pickHour(g, hourX(g, 4) + step * 0.2)).toBe(4);
    expect(pickHour(g, hourX(g, 4) + step * 0.6)).toBe(5);
    expect(pickHour(g, -50)).toBe(0);
    expect(pickHour(g, g.width + 50)).toBe(HOURS - 1);
  });

  it("snaps to the nearest ridge on flat ground", () => {
    const ridges = ridgelines(field(), g);
    const x = hourX(g, 9);
    expect(pickRidge(ridges, g, x, baselineY(g, 10))).toEqual({ week: 10, hour: 9 });
    expect(pickRidge(ridges, g, x, baselineY(g, 10) + g.spacing * 0.3)).toEqual({ week: 10, hour: 9 });
    expect(pickRidge(ridges, g, x, baselineY(g, 10) + g.spacing * 0.7)).toEqual({ week: 11, hour: 9 });
    // Above the whole terrain and below the front of it.
    expect(pickRidge(ridges, g, x, 0)).toEqual({ week: 1, hour: 9 });
    expect(pickRidge(ridges, g, x, g.height)).toEqual({ week: WEEKS, hour: 9 });
  });

  it("snaps to the ridge you can see, not the one hidden behind it", () => {
    const f = field();
    f[12][51] = 1;
    const ridges = ridgelines(f, g);
    // At noon, week 48's baseline is behind week 52's peak: the pointer is on the peak.
    expect(pickRidge(ridges, g, hourX(g, 12), baselineY(g, 48))).toEqual({ week: 52, hour: 12 });
    // At three in the morning week 52 is flat, so the same height is week 48 again.
    expect(pickRidge(ridges, g, hourX(g, 3), baselineY(g, 48))).toEqual({ week: 48, hour: 3 });
  });

  it("reads the original count, never the smoothed height", () => {
    const events: ReliefEvent[] = Array.from({ length: 5 }, () => ({ week: 9, hour: 3 }));
    const map = buildHeightmap(events);
    // The smoothing spreads the five onto the next hour; the count does not.
    expect(map.field[4][9]).toBeGreaterThan(0);
    expect(readCount(map.counts, 10, 4)).toBe(0);
    expect(readCount(map.counts, 10, 3)).toBe(5);
    expect(readCount(map.counts, 1, 0)).toBe(0);
  });

  it("reads nothing off the edge of the year rather than throwing", () => {
    const map = buildHeightmap([]);
    expect(readCount(map.counts, 0, 3)).toBe(0);
    expect(readCount(map.counts, WEEKS + 1, 3)).toBe(0);
    expect(readCount(map.counts, 1, HOURS)).toBe(0);
  });
});

/**
 * Same rule as `draw.ts`: the ridgeline is geometry, and colour arrives from
 * the theme through the palette guard, never from here.
 */
describe("ridgeline.ts owns no colours and no motion", () => {
  const src = readFileSync(join(process.cwd(), "lib", "tools", "relief", "ridgeline.ts"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("has no hex, rgb or hsl literal", () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\bhsla?\(/);
  });

  it("starts no animation loop of its own", () => {
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("setInterval");
  });
});
