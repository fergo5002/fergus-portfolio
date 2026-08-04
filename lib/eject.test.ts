import { describe, expect, it } from "vitest";
import {
  EJECT_PARALLAX,
  ejectGeometry,
  ejectScaleFor,
  ejectScreenRect,
  smootherstep,
} from "./eject";

describe("smootherstep", () => {
  it("pins both ends", () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
  });

  it("clamps outside the unit range", () => {
    expect(smootherstep(-2)).toBe(0);
    expect(smootherstep(4)).toBe(1);
  });

  it("is symmetric about the midpoint and flat at both ends", () => {
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smootherstep(0.25) + smootherstep(0.75)).toBeCloseTo(1, 6);
    // Zero first derivative at the ends is the whole point: the pull-back must
    // not start or stop with a visible jerk.
    expect(smootherstep(0.001)).toBeLessThan(0.0001);
    expect(smootherstep(0.999)).toBeGreaterThan(0.9999);
  });
});

describe("ejectGeometry", () => {
  it("is a no-op at rest, so the un-ejected site is untransformed", () => {
    const g = ejectGeometry(0, 0, 0);
    expect(g.scale).toBe(1);
    expect(g.dx).toBe(0);
    expect(g.dy).toBe(0);
  });

  it("shrinks and lifts the assembly as it pulls back", () => {
    const g = ejectGeometry(1, 0, 0);
    expect(g.scale).toBeLessThan(0.7);
    expect(g.scale).toBeGreaterThan(0.4);
    // Lifted, to leave desk below the monitor.
    expect(g.dy).toBeLessThan(0);
  });

  it("is monotonic in t", () => {
    let prev = 1.1;
    for (let t = 0; t <= 1; t += 0.05) {
      const s = ejectGeometry(t, 0, 0).scale;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it("applies pointer parallax only once ejected, and against the pointer", () => {
    expect(ejectGeometry(0, 1, 1).dx).toBe(0);
    // Moving the pointer right should look past the right edge of the monitor,
    // so the assembly slides left. Getting this sign backwards reads as the
    // monitor chasing the cursor, which is the opposite of parallax.
    const g = ejectGeometry(1, 1, -1);
    expect(g.dx).toBeCloseTo(-EJECT_PARALLAX, 6);
    expect(g.dy).toBeCloseTo(-0.055 + EJECT_PARALLAX, 6);
  });

  it("keeps parallax small enough that the screen never leaves the bezel", () => {
    for (const px of [-1, 0, 1]) {
      for (const py of [-1, 0, 1]) {
        const r = ejectScreenRect(ejectGeometry(1, px, py));
        expect(r.x0).toBeGreaterThan(0.05);
        expect(r.x1).toBeLessThan(0.95);
        expect(r.y0).toBeGreaterThan(0.05);
        expect(r.y1).toBeLessThan(0.95);
      }
    }
  });
});

describe("ejectScreenRect", () => {
  it("is the whole viewport at rest", () => {
    const r = ejectScreenRect(ejectGeometry(0, 0, 0));
    expect(r.x0).toBe(0);
    expect(r.x1).toBe(1);
    expect(r.y0).toBe(0);
    expect(r.y1).toBe(1);
  });

  it("stays centred horizontally with no parallax", () => {
    const r = ejectScreenRect(ejectGeometry(0.6, 0, 0));
    expect(r.x0 + r.x1).toBeCloseTo(1, 6);
  });

  it("matches the CSS transform it is derived from", () => {
    // The shader draws the bezel around this rect while CSS scales the DOM by
    // the same numbers. If these two ever disagree the content visibly hangs
    // over the plastic, so the relationship is asserted rather than assumed.
    const g = ejectGeometry(0.7, 0.3, -0.2);
    const r = ejectScreenRect(g);
    expect(r.x1 - r.x0).toBeCloseTo(g.scale, 6);
    expect(r.y1 - r.y0).toBeCloseTo(g.scale, 6);
    expect((r.x0 + r.x1) / 2).toBeCloseTo(0.5 + g.dx, 6);
    expect((r.y0 + r.y1) / 2).toBeCloseTo(0.5 + g.dy, 6);
  });
});

describe("ejectScaleFor", () => {
  it("pulls back less on a narrow viewport, so the text stays readable", () => {
    expect(ejectScaleFor(390)).toBeGreaterThan(ejectScaleFor(1440));
    expect(ejectScaleFor(780)).toBeGreaterThan(ejectScaleFor(1440));
  });

  it("never inverts: a wider viewport is never pulled back less", () => {
    let prev = 1;
    for (let w = 320; w <= 2560; w += 40) {
      const s = ejectScaleFor(w);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("keeps the screen inside the bezel at every breakpoint", () => {
    for (const w of [320, 390, 559, 560, 899, 900, 1440, 2560]) {
      const r = ejectScreenRect(ejectGeometry(1, 1, 1, ejectScaleFor(w)));
      expect(r.x0).toBeGreaterThan(0.02);
      expect(r.x1).toBeLessThan(0.98);
      expect(r.y0).toBeGreaterThan(0.02);
      expect(r.y1).toBeLessThan(0.98);
    }
  });
});
