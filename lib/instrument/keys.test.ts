import { describe, expect, it } from "vitest";
import { applyKey, knobKey } from "./keys";

/**
 * The knob's keyboard map. A native range input already answers the arrows,
 * Page Up/Down, Home and End; the knob keeps those and adds the one thing the
 * native control lacks, Shift for ten steps at a time, so a wide range is not
 * a hundred key presses.
 */

describe("knobKey", () => {
  it("steps up on the up and right arrows, down on the down and left arrows", () => {
    expect(knobKey("ArrowUp", false)).toEqual({ kind: "step", steps: 1 });
    expect(knobKey("ArrowRight", false)).toEqual({ kind: "step", steps: 1 });
    expect(knobKey("ArrowDown", false)).toEqual({ kind: "step", steps: -1 });
    expect(knobKey("ArrowLeft", false)).toEqual({ kind: "step", steps: -1 });
  });

  it("takes ten steps with Shift held, and on Page Up and Page Down", () => {
    expect(knobKey("ArrowUp", true)).toEqual({ kind: "step", steps: 10 });
    expect(knobKey("ArrowLeft", true)).toEqual({ kind: "step", steps: -10 });
    expect(knobKey("PageUp", false)).toEqual({ kind: "step", steps: 10 });
    expect(knobKey("PageDown", false)).toEqual({ kind: "step", steps: -10 });
  });

  it("jumps to either end on Home and End", () => {
    expect(knobKey("Home", false)).toEqual({ kind: "min" });
    expect(knobKey("End", false)).toEqual({ kind: "max" });
  });

  it("leaves every other key alone, so Tab and typing still work", () => {
    for (const key of ["Tab", "Enter", " ", "a", "Escape"]) expect(knobKey(key, false), key).toBeNull();
  });
});

describe("applyKey", () => {
  const volume = { min: 0, max: 0.6, step: 0.01 };

  it("moves by whole steps and settles the result", () => {
    expect(applyKey(0.3, { kind: "step", steps: 1 }, volume)).toBe(0.31);
    expect(applyKey(0.3, { kind: "step", steps: -10 }, volume)).toBe(0.2);
  });

  it("clamps at both ends", () => {
    expect(applyKey(0.58, { kind: "step", steps: 10 }, volume)).toBe(0.6);
    expect(applyKey(0.02, { kind: "step", steps: -10 }, volume)).toBe(0);
  });

  it("goes straight to the minimum and the maximum", () => {
    expect(applyKey(0.3, { kind: "min" }, volume)).toBe(0);
    expect(applyKey(0.3, { kind: "max" }, volume)).toBe(0.6);
  });

  it("steps a logarithmic control along its curve, a hundredth of the travel per step", () => {
    const cutoff = { min: 150, max: 12000, step: 1, scale: "log" as const };
    const up = applyKey(1342, { kind: "step", steps: 1 }, cutoff);
    const down = applyKey(1342, { kind: "step", steps: -1 }, cutoff);
    expect(up).toBeGreaterThan(1342);
    expect(down).toBeLessThan(1342);
    // Equal ratios either side, give or take the one-hertz step.
    expect(Math.abs(up / 1342 - 1342 / down)).toBeLessThan(0.01);
  });
});
