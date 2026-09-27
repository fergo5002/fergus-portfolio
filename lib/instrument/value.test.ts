import { describe, expect, it } from "vitest";
import {
  KNOB_SWEEP,
  clamp,
  decimals,
  dragValue,
  fromFraction,
  knobAngle,
  settle,
  snap,
  toFraction,
  wheelValue,
} from "./value";

/**
 * The arithmetic every kit control shares. The components are wiring over a
 * native element; what a value may be, and how a drag or a wheel notch moves
 * it, is decided here where it can be tested without a DOM.
 */

describe("clamp", () => {
  it("holds a value inside its range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it("turns a value that is not a number into the minimum, never NaN", () => {
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });

  it("copes with a range given backwards", () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-1, 10, 0)).toBe(0);
  });
});

describe("decimals", () => {
  it("counts the places a step needs", () => {
    expect(decimals(1)).toBe(0);
    expect(decimals(0.05)).toBe(2);
    expect(decimals(0.1)).toBe(1);
    expect(decimals(1e-7)).toBe(7);
    expect(decimals(2.5e-3)).toBe(4);
  });
});

describe("snap", () => {
  it("rounds to the nearest step counted from the minimum", () => {
    expect(snap(7, 0, 5)).toBe(5);
    expect(snap(8, 0, 5)).toBe(10);
    expect(snap(41, 40, 3)).toBe(40);
    expect(snap(42, 40, 3)).toBe(43);
  });

  it("leaves no floating-point residue behind", () => {
    // 0.1 + 0.2 is the classic; a step of 0.05 from 0.1 hits the same problem.
    expect(snap(0.30000000000000004, 0, 0.1)).toBe(0.3);
    expect(snap(0.35, 0.1, 0.05)).toBe(0.35);
    expect(String(snap(1.15, 0.1, 0.05))).toBe("1.15");
  });

  it("returns the value untouched when there is no step", () => {
    expect(snap(3.14159, 0, 0)).toBe(3.14159);
  });
});

describe("settle", () => {
  it("clamps then snaps, so a settled value is always one the control may hold", () => {
    expect(settle(181, { min: 40, max: 180, step: 1 })).toBe(180);
    expect(settle(0.6333, { min: 0, max: 0.65, step: 0.01 })).toBe(0.63);
    expect(settle(-5, { min: -1, max: 1, step: 0.1 })).toBe(-1);
  });

  it("never snaps past the maximum", () => {
    // 0..10 in threes: 9 is the last reachable value, and 10 rounds to 9, not 12.
    expect(settle(10, { min: 0, max: 10, step: 3 })).toBe(9);
  });
});

describe("fractions", () => {
  it("maps a linear range onto 0..1 and back", () => {
    expect(toFraction(110, 40, 180)).toBeCloseTo(0.5);
    expect(fromFraction(0.5, 40, 180)).toBeCloseTo(110);
    expect(toFraction(40, 40, 180)).toBe(0);
    expect(toFraction(180, 40, 180)).toBe(1);
  });

  it("maps a logarithmic range so equal travel is an equal ratio", () => {
    // 150 Hz to 12 kHz: the geometric middle is sqrt(150 * 12000), about 1342 Hz.
    expect(fromFraction(0.5, 150, 12000, "log")).toBeCloseTo(Math.sqrt(150 * 12000), 6);
    expect(toFraction(1342.0, 150, 12000, "log")).toBeCloseTo(0.5, 3);
  });

  it("refuses a logarithmic range that touches zero, rather than returning Infinity", () => {
    expect(() => toFraction(5, 0, 10, "log")).toThrow(/positive/);
    expect(() => fromFraction(0.5, -1, 10, "log")).toThrow(/positive/);
  });

  it("clamps the fraction, so a value outside the range cannot draw outside the dial", () => {
    expect(toFraction(500, 40, 180)).toBe(1);
    expect(fromFraction(-0.2, 40, 180)).toBe(40);
  });

  it("treats an empty range as the minimum instead of dividing by zero", () => {
    expect(toFraction(5, 5, 5)).toBe(0);
  });
});

describe("knobAngle", () => {
  it("sweeps symmetrically about twelve o'clock", () => {
    expect(knobAngle(0)).toBe(-KNOB_SWEEP / 2);
    expect(knobAngle(0.5)).toBe(0);
    expect(knobAngle(1)).toBe(KNOB_SWEEP / 2);
  });

  it("clamps a fraction outside 0..1", () => {
    expect(knobAngle(2)).toBe(KNOB_SWEEP / 2);
  });
});

describe("dragValue", () => {
  const tempo = { min: 40, max: 180, step: 1 };

  it("raises the value when the pointer moves up", () => {
    // Negative dy is up the screen. 200px of travel is the full range by default.
    expect(dragValue(110, -100, tempo)).toBe(180);
    expect(dragValue(110, -50, tempo)).toBe(145);
  });

  it("lowers it when the pointer moves down, and stops at the floor", () => {
    expect(dragValue(110, 50, tempo)).toBe(75);
    expect(dragValue(110, 900, tempo)).toBe(40);
  });

  it("moves ten times more slowly in fine mode", () => {
    expect(dragValue(110, -50, { ...tempo, fine: true })).toBe(114);
  });

  it("respects a custom travel", () => {
    expect(dragValue(110, -35, { ...tempo, travel: 70 })).toBe(180);
  });

  it("drags a logarithmic control along its own curve", () => {
    const cutoff = { min: 150, max: 12000, step: 1, scale: "log" as const };
    const middle = dragValue(150, -100, cutoff);
    expect(middle).toBe(Math.round(Math.sqrt(150 * 12000)));
  });
});

describe("wheelValue", () => {
  const swing = { min: 0, max: 0.45, step: 0.01 };

  it("adds one step per notch scrolled up and removes one per notch down", () => {
    expect(wheelValue(0.2, -120, swing)).toBe(0.21);
    expect(wheelValue(0.2, 120, swing)).toBe(0.19);
  });

  it("treats a trackpad's small deltas as one step, not zero", () => {
    expect(wheelValue(0.2, -3, swing)).toBe(0.21);
  });

  it("ignores a zero delta", () => {
    expect(wheelValue(0.2, 0, swing)).toBe(0.2);
  });

  it("takes ten steps at a time when asked for a coarse move, and clamps", () => {
    expect(wheelValue(0.2, -120, { ...swing, coarse: true })).toBe(0.3);
    expect(wheelValue(0.4, -120, { ...swing, coarse: true })).toBe(0.45);
  });

  it("moves a logarithmic control by a hundredth of its travel per notch", () => {
    const cutoff = { min: 150, max: 12000, step: 1, scale: "log" as const };
    const up = wheelValue(1342, -100, cutoff);
    expect(up).toBeGreaterThan(1342);
    expect(toFraction(up, 150, 12000, "log") - toFraction(1342, 150, 12000, "log")).toBeCloseTo(0.01, 2);
  });
});
