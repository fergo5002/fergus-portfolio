import { describe, it, expect } from "vitest";
import {
  BOUNCE_STEP_TICKS, bounce, bounceView, initialBounceState, resizeBounce, stepBounce, steerBounce,
} from "@/lib/arcade/bounce";
import type { ProgramHost } from "@/lib/arcade/program";

const COLS = 12;
const ROWS = 6;

/** Run whole steps: the state only moves on every BOUNCE_STEP_TICKS-th tick. */
function steps(state: ReturnType<typeof initialBounceState>, n: number): string[] {
  const hits: string[] = [];
  for (let i = 0; i < n * BOUNCE_STEP_TICKS; i++) hits.push(stepBounce(state, COLS, ROWS));
  return hits.filter((h) => h === "wall");
}

describe("bounce", () => {
  it("starts in the middle, moving down and to the right", () => {
    const s = initialBounceState(COLS, ROWS);
    expect(s).toMatchObject({ x: 6, y: 3, dx: 1, dy: 1, bounces: 0 });
  });

  it("moves one cell every third tick and not before", () => {
    const s = initialBounceState(COLS, ROWS);
    stepBounce(s, COLS, ROWS);
    stepBounce(s, COLS, ROWS);
    expect(s.x).toBe(6);
    stepBounce(s, COLS, ROWS);
    expect(s.x).toBe(7);
  });

  it("turns at a wall instead of leaving the grid", () => {
    const s = initialBounceState(COLS, ROWS);
    for (let i = 0; i < 60 * BOUNCE_STEP_TICKS; i++) {
      stepBounce(s, COLS, ROWS);
      expect(s.x, "x stayed on the grid").toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(COLS);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(ROWS);
    }
    expect(s.bounces).toBeGreaterThan(0);
  });

  it("moves an existing position inside a smaller grid immediately", () => {
    const s = { ...initialBounceState(40, 18), x: 39, y: 17 };
    resizeBounce(s, 32, 16);
    expect(s.x).toBe(31);
    expect(s.y).toBe(15);
    expect(bounceView(s, 32, 16).some((line) => line.includes("O"))).toBe(true);
  });

  it("reports the wall it hit, once, on the step it hit it", () => {
    const s = initialBounceState(COLS, ROWS);
    const hits = steps(s, 40);
    expect(hits.length).toBe(s.bounces);
  });

  it("steers with the four directions and reverses on fire", () => {
    const s = initialBounceState(COLS, ROWS);
    steerBounce(s, "left");
    expect(s.dx).toBe(-1);
    steerBounce(s, "up");
    expect(s.dy).toBe(-1);
    steerBounce(s, "fire");
    expect([s.dx, s.dy]).toEqual([1, 1]);
  });

  it("ignores a key it has no use for", () => {
    const s = initialBounceState(COLS, ROWS);
    const before = { ...s };
    steerBounce(s, "pause");
    steerBounce(s, "3");
    expect(s).toMatchObject(before);
  });

  it("draws a rectangle with the glyph where the state says", () => {
    const s = initialBounceState(COLS, ROWS);
    const lines = bounceView(s, COLS, ROWS);
    expect(lines).toHaveLength(ROWS);
    for (const line of lines) expect(line).toHaveLength(COLS);
    expect(lines[3][6]).toBe("O");
  });
});

describe("bounce as a program", () => {
  function fakeHost(): { host: ProgramHost; drawn: string[][]; sounds: string[]; result: { got?: unknown } } {
    const drawn: string[][] = [];
    const sounds: string[] = [];
    const result: { got?: unknown } = {};
    return {
      drawn,
      sounds,
      result,
      host: {
        cols: COLS,
        rows: ROWS,
        draw: (lines) => drawn.push(lines),
        sound: (name) => sounds.push(name),
        flash: () => {},
        exit: (r) => {
          result.got = r ?? null;
        },
      },
    };
  }

  it("draws on the first tick, so the screen is never blank", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    p.tick(33.334);
    expect(f.drawn.length).toBeGreaterThan(0);
    p.dispose();
  });

  it("clicks the tube when it hits a wall", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    for (let i = 0; i < 200; i++) p.tick(33.334);
    expect(f.sounds).toContain("wall");
    p.dispose();
  });

  it("hands its bounces to the board on the way out", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    for (let i = 0; i < 200; i++) p.tick(33.334);
    p.key("start", true);
    expect(f.result.got).toMatchObject({ score: expect.any(Number) });
    p.dispose();
  });

  it("redraws visibly inside the new world when the host shrinks", () => {
    const f = fakeHost();
    const p = bounce.start(f.host);
    for (let i = 0; i < 80; i++) p.tick(33.334);
    f.host.cols = 8;
    f.host.rows = 4;
    p.resize?.(8, 4);
    const last = f.drawn.at(-1) ?? [];
    expect(last).toHaveLength(4);
    expect(last.every((line) => line.length === 8)).toBe(true);
    expect(last.some((line) => line.includes("O"))).toBe(true);
  });

  it("says who it is", () => {
    expect(bounce.id).toBe("bounce");
    expect(bounce.title.length).toBeGreaterThan(0);
  });
});
