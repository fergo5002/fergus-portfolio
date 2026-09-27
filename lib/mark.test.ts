import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARK_VIEWBOX, markPath, markStrokePaths, markSweep, markTraceAt } from "./mark";

/** The icon's own geometry, read from the file rather than retyped. */
function iconStrokes(): number[][][] {
  const svg = readFileSync(join(process.cwd(), "app", "icon.svg"), "utf8");
  const d = /<path d="([^"]+)"/.exec(svg)![1];
  const chevron = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const caret = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*fill="#ffb000"/.exec(svg)!;
  const [x, y, w, h] = caret.slice(1, 5).map(Number);
  // A filled bar drawn by a beam is its centre line at the bar's thickness.
  return [chevron, [[x, y + h / 2], [x + w, y + h / 2]]];
}

describe("markPath", () => {
  const path = markPath();

  it("is one continuous polyline inside 0..1", () => {
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (const v of path) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(1);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(1);
    }
    // Continuous: one ordered list, every segment starting where the last one
    // ended, and no segment of zero length for the beam to stall on.
    for (let i = 1; i < path.length; i++) {
      expect(path[i].x !== path[i - 1].x || path[i].y !== path[i - 1].y, `segment ${i}`).toBe(true);
    }
    expect(path[0].draw).toBe(false);
  });

  it("traces the site's own icon, stroke for stroke", () => {
    // Walk the beam: a lit segment extends the stroke in progress (starting one
    // if the gun was just switched on), a blanked one ends it.
    const strokes: number[][][] = [];
    let current: number[][] | null = null;
    for (let i = 1; i < path.length; i++) {
      if (!path[i].draw) {
        current = null;
        continue;
      }
      if (!current) {
        current = [[path[i - 1].x * 64, path[i - 1].y * 64]];
        strokes.push(current);
      }
      current.push([path[i].x * 64, path[i].y * 64]);
    }
    expect(strokes).toEqual(iconStrokes());
  });

  it("blanks the gun only between strokes, as a vector display does", () => {
    const blanks = path.slice(1).filter((v) => !v.draw);
    expect(blanks).toHaveLength(iconStrokes().length - 1);
  });

  it("frames the mark in a view box that holds every stroke", () => {
    const { x, y, w, h } = MARK_VIEWBOX;
    for (const v of path) {
      expect(v.x * 64).toBeGreaterThanOrEqual(x);
      expect(v.x * 64).toBeLessThanOrEqual(x + w);
      expect(v.y * 64).toBeGreaterThanOrEqual(y);
      expect(v.y * 64).toBeLessThanOrEqual(y + h);
    }
  });

  it("gives the SVG the same strokes the beam draws", () => {
    expect(markStrokePaths()).toEqual(["M15 21 L27 32 L15 43", "M32 40 L50 40"]);
  });
});

describe("markTraceAt", () => {
  const path = markPath();
  const first = path[0];
  const last = path[path.length - 1];

  it("starts with the beam on the first vertex and ends on the last", () => {
    expect(markTraceAt(0)).toMatchObject({ x: first.x, y: first.y, strokes: [0, 0] });
    expect(markTraceAt(1)).toMatchObject({ x: last.x, y: last.y, strokes: [1, 1] });
    expect(markTraceAt(-1).strokes).toEqual([0, 0]);
    expect(markTraceAt(2).strokes).toEqual([1, 1]);
  });

  it("draws each stroke in turn and never undraws one", () => {
    let prev = markTraceAt(0).strokes;
    for (let i = 1; i <= 2000; i++) {
      const { strokes } = markTraceAt(i / 2000);
      strokes.forEach((s, k) => expect(s, `stroke ${k} at ${i}`).toBeGreaterThanOrEqual(prev[k]));
      // The second stroke waits for the first to finish.
      if (strokes[1] > 0) expect(strokes[0]).toBe(1);
      prev = strokes;
    }
  });

  it("switches the gun off for the move between strokes", () => {
    const states = Array.from({ length: 2001 }, (_, i) => markTraceAt(i / 2000).lit);
    const offRuns = states.filter((lit, i) => !lit && (i === 0 || states[i - 1])).length;
    expect(offRuns).toBe(1);
    expect(states[0]).toBe(true);
    expect(states[2000]).toBe(true);
  });
});

describe("markSweep", () => {
  it("returns the lit path between two instants, corners included", () => {
    const runs = markSweep(0, 0.5);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const pts = runs.flat();
    const corner = markPath()[1];
    expect(pts.some((p) => p.x === corner.x && p.y === corner.y)).toBe(true);
  });

  it("splits at the blanked move rather than drawing a line along it", () => {
    const runs = markSweep(0, 1);
    expect(runs).toHaveLength(2);
    const path = markPath();
    const blank = path.findIndex((v, i) => i > 0 && !v.draw);
    // The first run ends where the gun switches off and the second starts where
    // it comes back on.
    expect(runs[0][runs[0].length - 1]).toEqual({ x: path[blank - 1].x, y: path[blank - 1].y });
    expect(runs[1][0]).toEqual({ x: path[blank].x, y: path[blank].y });
  });

  it("is a single point while the beam dwells", () => {
    const [run] = markSweep(0, 0.001);
    expect(run).toHaveLength(1);
    expect(run[0]).toEqual({ x: markPath()[0].x, y: markPath()[0].y });
  });

  it("is empty while the gun is off or time has not moved", () => {
    const off = Array.from({ length: 1000 }, (_, i) => i / 1000).find((u) => !markTraceAt(u).lit)!;
    expect(markSweep(off, off + 0.0005)).toEqual([]);
    expect(markSweep(0.3, 0.3)).toEqual([]);
    expect(markSweep(0.4, 0.3)).toEqual([]);
  });

  it("joins consecutive sweeps end to start, so a trail has no gaps", () => {
    for (const [a, b, c] of [[0.1, 0.2, 0.3], [0.2, 0.26, 0.4], [0.6, 0.7, 0.9]]) {
      const one = markSweep(a, b);
      const two = markSweep(b, c);
      if (!one.length || !two.length) continue;
      const end = one[one.length - 1];
      expect(two[0][0]).toEqual(end[end.length - 1]);
    }
  });
});
