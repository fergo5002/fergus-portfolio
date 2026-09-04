import { describe, it, expect } from "vitest";
import {
  blankGrid, centre, fitGrid, GRID_SCALES, GRID_SIZES, MIN_CELL_PX, put, toLines, write,
} from "@/lib/arcade/grid";

describe("the size ladder", () => {
  it("runs biggest first and ends at the phone size", () => {
    expect(GRID_SIZES[0]).toEqual({ cols: 48, rows: 20 });
    expect(GRID_SIZES[GRID_SIZES.length - 1]).toEqual({ cols: 32, rows: 16 });
  });

  it("never shrinks the type below the point a glyph stops being one", () => {
    expect(MIN_CELL_PX).toBe(6);
    expect(GRID_SCALES[0]).toBe(1);
  });
});

describe("fitGrid", () => {
  // A 16px monospace advance is about 9.6px wide and 20px tall at line-height 1.25.
  const cell = { width: 9.6, height: 20 };

  it("takes the biggest board that fits a desktop terminal", () => {
    expect(fitGrid({ width: 640, height: 460 }, cell)).toEqual({ cols: 48, rows: 20, scale: 1 });
  });

  it("drops a size rather than a scale when the width is the problem", () => {
    // 40 columns need 384px; 48 need 461.
    expect(fitGrid({ width: 400, height: 460 }, cell)).toEqual({ cols: 40, rows: 18, scale: 1 });
  });

  it("shrinks the type only once the smallest board has failed at full size", () => {
    // A 320-wide phone: 32 columns at 15px (9px advance, 18.75px line) need
    // 288 by 300, and the drawer offers about 296 by 288. Width is fine, height
    // is not, so full size is exhausted and nine tenths is the answer.
    const phone = { width: 9, height: 18.75 };
    expect(fitGrid({ width: 296, height: 288 }, phone)).toEqual({ cols: 32, rows: 16, scale: 0.9 });
  });

  it("prefers a smaller board at full size to a bigger one at nine tenths", () => {
    // 48 columns fit at 0.9 (415px) but not at 1 (461px); 40 fit at 1 (384px).
    // Readable type wins, because the board is made of characters.
    expect(fitGrid({ width: 430, height: 460 }, cell)).toEqual({ cols: 40, rows: 18, scale: 1 });
  });

  it("refuses rather than drawing a grid nobody can read", () => {
    expect(fitGrid({ width: 200, height: 120 }, cell)).toBeNull();
  });

  it("refuses when the scale would take the cell under the legibility floor", () => {
    // A 7px cell at 0.8 is 5.6px, under MIN_CELL_PX, so no scale is allowed
    // and the only question left is whether full size fits. It does not.
    expect(fitGrid({ width: 200, height: 400 }, { width: 7, height: 9 })).toBeNull();
  });

  it("refuses a cell it could not have measured", () => {
    expect(fitGrid({ width: 999, height: 999 }, { width: 0, height: 0 })).toBeNull();
    expect(fitGrid({ width: 999, height: 999 }, { width: Number.NaN, height: 20 })).toBeNull();
  });
});

describe("drawing", () => {
  it("starts blank and stays rectangular", () => {
    const g = blankGrid(6, 3);
    expect(toLines(g)).toEqual(["      ", "      ", "      "]);
  });

  it("puts one character where it is told", () => {
    const g = blankGrid(4, 2);
    put(g, 2, 1, "o");
    expect(toLines(g)).toEqual(["    ", "  o "]);
  });

  it("writes a string from a column", () => {
    const g = blankGrid(8, 1);
    write(g, 2, 0, "abc");
    expect(toLines(g)).toEqual(["  abc   "]);
  });

  it("centres a string, rounding left on an odd gap", () => {
    const g = blankGrid(7, 1);
    centre(g, 0, "abcd");
    expect(toLines(g)).toEqual([" abcd  "]);
  });

  it("clips at the edges instead of throwing or growing the grid", () => {
    // A game with an off-by-one should misdraw for one frame, not take the
    // terminal down with it.
    const g = blankGrid(4, 2);
    expect(() => {
      put(g, -1, 0, "x");
      put(g, 9, 0, "x");
      put(g, 0, 5, "x");
      write(g, 3, 0, "abcd");
      write(g, -2, 1, "abcd");
    }).not.toThrow();
    expect(toLines(g)).toEqual(["   a", "cd  "]);
  });

  it("ignores an empty write rather than blanking a cell", () => {
    const g = blankGrid(3, 1);
    write(g, 0, 0, "");
    put(g, 0, 0, "");
    expect(toLines(g)).toEqual(["   "]);
  });

  it("returns exactly rows lines of exactly cols characters", () => {
    const lines = toLines(blankGrid(48, 20));
    expect(lines).toHaveLength(20);
    for (const line of lines) expect(line).toHaveLength(48);
  });
});
