import { describe, it, expect } from "vitest";
import { CUTOFF, ECHO_MAX, extendTrail, liveTrail, padPoint, padToSound, soundToPad, trailAlpha, type TrailPoint } from "./pad";

/**
 * The performance pad: a square where left to right is brightness and bottom
 * to top is echo, with a phosphor trail behind the finger. Pure mapping, so
 * the knobs and the pad can never disagree about where a sound sits.
 */
describe("the pad's mapping", () => {
  it("runs brightness left to right, dark at the left edge and open at the right", () => {
    expect(padToSound(0, 0.5).cutoff).toBe(CUTOFF.min);
    expect(padToSound(1, 0.5).cutoff).toBe(CUTOFF.max);
  });

  it("spends equal travel on equal ratios of brightness, the way an ear hears a filter", () => {
    const a = padToSound(0.25, 0).cutoff;
    const b = padToSound(0.5, 0).cutoff;
    const c = padToSound(0.75, 0).cutoff;
    expect(b / a).toBeCloseTo(c / b, 1);
    expect(b).toBe(Math.round(Math.sqrt(CUTOFF.min * CUTOFF.max)));
  });

  it("runs echo bottom to top: none at the bottom edge, the most at the top", () => {
    expect(padToSound(0.5, 1).delay).toBe(0);
    expect(padToSound(0.5, 0).delay).toBe(ECHO_MAX);
    expect(padToSound(0.5, 0.5).delay).toBeCloseTo(ECHO_MAX / 2, 3);
  });

  it("clamps a drag past the edge to the edge", () => {
    expect(padToSound(-2, 3)).toEqual(padToSound(0, 1));
    expect(padToSound(7, -1)).toEqual(padToSound(1, 0));
  });

  it("puts the puck back where the knobs say the sound is", () => {
    for (const [x, y] of [[0, 0], [0.3, 0.8], [0.62, 0.15], [1, 1]]) {
      const sound = padToSound(x, y);
      const back = soundToPad(sound.cutoff, sound.delay);
      expect(back.x, `x ${x}`).toBeCloseTo(x, 2);
      expect(back.y, `y ${y}`).toBeCloseTo(y, 2);
    }
  });

  it("keeps a knob value outside the pad's range on the pad", () => {
    expect(soundToPad(20, 9)).toEqual({ x: 0, y: 0 });
  });

  it("reads a pointer against the pad's own box", () => {
    const rect = { left: 100, top: 50, width: 200, height: 200 };
    expect(padPoint(200, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(padPoint(0, 400, rect)).toEqual({ x: 0, y: 1 });
  });
});

describe("the trail", () => {
  const at = (x: number, t: number): TrailPoint => ({ x, y: 0.5, t });

  it("keeps the newest points and drops the oldest past its length", () => {
    let trail: TrailPoint[] = [];
    for (let i = 0; i < 40; i++) trail = extendTrail(trail, at(i / 40, i), 32);
    expect(trail).toHaveLength(32);
    expect(trail[0].t).toBe(8);
    expect(trail[31].t).toBe(39);
  });

  it("forgets points once they have faded", () => {
    const trail = [at(0, 0), at(0.1, 500), at(0.2, 900)];
    expect(liveTrail(trail, 1000, 600).map((p) => p.t)).toEqual([500, 900]);
    expect(liveTrail(trail, 5000, 600)).toEqual([]);
  });

  it("fades from full at the finger to nothing at the end of its life", () => {
    expect(trailAlpha(0, 600)).toBe(1);
    expect(trailAlpha(600, 600)).toBe(0);
    expect(trailAlpha(900, 600)).toBe(0);
    expect(trailAlpha(150, 600)).toBeGreaterThan(trailAlpha(450, 600));
  });
});
