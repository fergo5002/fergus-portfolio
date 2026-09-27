import { describe, expect, it } from "vitest";
import { arcPath, polar, ticks } from "./geometry";

/**
 * The knob is drawn in SVG from these. Angles are in degrees with zero at
 * twelve o'clock and positive clockwise, the way a dial is read, not the way
 * trigonometry measures.
 */

const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });

describe("polar", () => {
  it("puts zero degrees at twelve o'clock and ninety at three", () => {
    expect(round(polar(32, 32, 10, 0))).toEqual({ x: 32, y: 22 });
    expect(round(polar(32, 32, 10, 90))).toEqual({ x: 42, y: 32 });
    expect(round(polar(32, 32, 10, -90))).toEqual({ x: 22, y: 32 });
  });
});

describe("arcPath", () => {
  it("draws a clockwise arc from one angle to another", () => {
    expect(arcPath(32, 32, 10, -90, 90)).toBe("M22 32A10 10 0 0 1 42 32");
  });

  it("sets the large-arc flag past half a turn", () => {
    expect(arcPath(32, 32, 10, -135, 135)).toMatch(/A10 10 0 1 1 /);
    expect(arcPath(32, 32, 10, -135, 0)).toMatch(/A10 10 0 0 1 /);
  });

  it("draws nothing for an arc of no length", () => {
    expect(arcPath(32, 32, 10, 40, 40)).toBe("");
  });

  it("draws the arc forwards even when given the angles backwards", () => {
    expect(arcPath(32, 32, 10, 90, -90)).toBe(arcPath(32, 32, 10, -90, 90));
  });
});

describe("ticks", () => {
  it("spaces tick marks evenly across the sweep, both ends included", () => {
    const marks = ticks(5, -135, 135);
    expect(marks).toEqual([-135, -67.5, 0, 67.5, 135]);
  });

  it("has one tick for a count of one, at the start", () => {
    expect(ticks(1, -135, 135)).toEqual([-135]);
  });
});
