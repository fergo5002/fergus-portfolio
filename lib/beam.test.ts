import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSystemFrame, MAX_BEAM_POINTS } from "./system";
import {
  BEAM_FOLD,
  BEAM_GAIN,
  BEAM_HOLD,
  BEAM_RADIUS,
  PHOSPHOR_DECAY,
  beamDeposit,
  beamGainFor,
  beamHoldGain,
  beamLength,
  clearBeam,
  readBeam,
  writeBeam,
} from "./beam";

describe("the frame carries a beam, off by default", () => {
  it("starts with room for eight points and nothing lit", () => {
    const f = createSystemFrame();
    expect(MAX_BEAM_POINTS).toBe(8);
    expect(f.beamPts).toHaveLength(MAX_BEAM_POINTS * 2);
    expect(f.beamPts.every((v) => v === 0)).toBe(true);
    expect(f.beamCount).toBe(0);
    expect(f.beamGain).toBe(0);
  });
});

describe("writeBeam and clearBeam", () => {
  it("writes a polyline, its point count and its gain", () => {
    const f = createSystemFrame();
    writeBeam(f, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }], 0.25);
    expect(f.beamCount).toBe(3);
    expect(f.beamGain).toBe(0.25);
    expect(f.beamPts.slice(0, 6)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(f.beamPts.slice(6).every((v) => v === 0)).toBe(true);
    expect(readBeam(f)).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }]);
  });

  it("keeps the newest eight when handed more, because the head is what matters", () => {
    const f = createSystemFrame();
    const pts = Array.from({ length: 11 }, (_, i) => ({ x: i / 10, y: 0.5 }));
    writeBeam(f, pts, 1);
    expect(f.beamCount).toBe(MAX_BEAM_POINTS);
    expect(readBeam(f)[0].x).toBeCloseTo(0.3);
    expect(readBeam(f)[MAX_BEAM_POINTS - 1].x).toBeCloseTo(1);
  });

  it("clears stale points when a shorter polyline follows a longer one", () => {
    const f = createSystemFrame();
    writeBeam(f, Array.from({ length: 6 }, (_, i) => ({ x: i / 10, y: 0.1 })), 1);
    writeBeam(f, [{ x: 0.9, y: 0.9 }], 1);
    expect(f.beamCount).toBe(1);
    expect(f.beamPts.slice(2).every((v) => v === 0)).toBe(true);
  });

  it("keeps points on the screen and a gain that cannot go negative or NaN", () => {
    const f = createSystemFrame();
    writeBeam(f, [{ x: -0.5, y: 1.7 }], -3);
    expect(f.beamPts.slice(0, 2)).toEqual([0, 1]);
    expect(f.beamGain).toBe(0);
    writeBeam(f, [{ x: 0.5, y: 0.5 }], Number.NaN);
    expect(f.beamGain).toBe(0);
  });

  it("turns the beam off completely", () => {
    const f = createSystemFrame();
    writeBeam(f, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }], 0.5);
    clearBeam(f);
    expect(f.beamCount).toBe(0);
    expect(f.beamGain).toBe(0);
    expect(f.beamPts.every((v) => v === 0)).toBe(true);
    expect(readBeam(f)).toEqual([]);
  });

  it("writes nothing lit for an empty polyline", () => {
    const f = createSystemFrame();
    writeBeam(f, [], 1);
    expect(f.beamCount).toBe(0);
    expect(f.beamGain).toBe(0);
  });
});

describe("beamLength", () => {
  it("measures in screen heights, with x stretched by the aspect", () => {
    // The shader corrects x by the aspect before measuring, so this must too,
    // or the gain is solved for a different line from the one drawn.
    expect(beamLength([{ x: 0, y: 0 }, { x: 0, y: 0.5 }], 1.6)).toBeCloseTo(0.5);
    expect(beamLength([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], 1.6)).toBeCloseTo(0.8);
    expect(beamLength([{ x: 0.2, y: 0.2 }], 1.6)).toBe(0);
  });
});

/**
 * The part of this file that is a real test rather than bookkeeping, in the
 * spirit of the `uEmit` block in PhosphorScreen.test.ts.
 *
 * A beam that deposits a fixed amount every frame is twice as bright at 120Hz
 * as at 60, and a beam that deposits a capsule per frame double-counts the
 * rounded end it shares with the next frame's capsule, which reads as beads
 * along the trail. `beamGainFor` solves both on the CPU: energy in proportion
 * to the time the beam was on, spread over the length it swept plus the width
 * of its own rounded ends. This simulates the sim pass at several refresh
 * rates, with `beamDeposit` as the shader's arithmetic ported line for line,
 * and requires the trail to come out the same brightness at all of them.
 */
describe("the trail is the same brightness at any refresh rate", () => {
  const decay = (dt: number) => Math.pow(0.045, dt / 1000);
  const ASPECT = 1.6;

  /** Sweep a horizontal line at `speed` screen heights a millisecond, and return the peak energy each probe saw. */
  function sweep(fps: number, speed: number, probes: number[]): number[] {
    const dt = 1000 / fps;
    const energy = probes.map(() => 0);
    const peak = probes.map(() => 0);
    const y = 0.5;
    const totalMs = 0.5 / speed; // across half a screen height of x, aspect-corrected below
    let prevX = 0.2;
    for (let t = dt; t <= totalMs + dt; t += dt) {
      const x = 0.2 + (Math.min(t, totalMs) * speed) / ASPECT;
      const pts = [{ x: prevX, y }, { x, y }];
      const gain = beamGainFor(dt, beamLength(pts, ASPECT));
      probes.forEach((px, i) => {
        energy[i] = Math.min(1, energy[i] * decay(dt) + beamDeposit(px, y, pts, ASPECT) * gain);
        peak[i] = Math.max(peak[i], energy[i]);
      });
      prevX = x;
    }
    return peak;
  }

  const SPEED = 0.00046; // the desktop mark's drawing speed, in screen heights per millisecond
  const probes = Array.from({ length: 41 }, (_, i) => 0.3 + i * 0.001);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("holds the mean trail brightness flat from 30Hz to 165Hz", () => {
    const reference = mean(sweep(60, SPEED, probes));
    expect(reference).toBeGreaterThan(0.2);
    for (const fps of [30, 48, 60, 90, 120, 144, 165]) {
      const drift = Math.abs(mean(sweep(fps, SPEED, probes)) / reference - 1);
      expect(drift, `${fps}Hz drifts ${(drift * 100).toFixed(1)}%`).toBeLessThan(0.03);
    }
  });

  it("leaves no beads along the trail at 60Hz and above", () => {
    for (const fps of [60, 120, 165]) {
      const peaks = sweep(fps, SPEED, probes);
      const ripple = (Math.max(...peaks) - Math.min(...peaks)) / mean(peaks);
      expect(ripple, `${fps}Hz ripples ${(ripple * 100).toFixed(1)}%`).toBeLessThan(0.05);
    }
  });

  it("draws a slower beam brighter, as a real one is", () => {
    // Energy per unit length goes as one over speed, which is why a vector
    // display's corners, where the beam settles, are its brightest points.
    // Compared against a faster beam, because half the speed reaches the clamp.
    expect(mean(sweep(60, SPEED, probes))).toBeGreaterThan(mean(sweep(60, SPEED * 2, probes)) * 1.6);
  });

  it("fails without the normalisation, which is what made it worth doing", () => {
    // Guards the guard: a fixed gain per frame really does double at 120Hz.
    const fixed = (fps: number) => {
      const dt = 1000 / fps;
      let e = 0;
      let peak = 0;
      for (let x = 0.2; x < 0.5; x += (SPEED * dt) / ASPECT) {
        const pts = [{ x, y: 0.5 }, { x: x + (SPEED * dt) / ASPECT, y: 0.5 }];
        e = Math.min(1, e * decay(dt) + beamDeposit(0.35, 0.5, pts, ASPECT) * BEAM_GAIN * 16);
        peak = Math.max(peak, e);
      }
      return peak;
    };
    expect(fixed(120) / fixed(60)).toBeGreaterThan(1.6);
  });

  it("keeps a sitting beam's glow in proportion to the time it sat", () => {
    const still = (ms: number) => beamDeposit(0.5, 0.5, [{ x: 0.5, y: 0.5 }], ASPECT) * beamGainFor(ms, 0);
    expect(still(40)).toBeCloseTo(still(20) * 2);
    expect(beamGainFor(0, 0.1)).toBe(0);
    expect(beamGainFor(-5, 0.1)).toBe(0);
  });

  it("measures its own width in the units the shader uses", () => {
    // A capsule of this radius, a screen height tall: sanity on the scale, so
    // a radius typed in pixels by mistake cannot pass.
    expect(BEAM_RADIUS).toBeGreaterThan(0.002);
    expect(BEAM_RADIUS).toBeLessThan(0.03);
    expect(beamDeposit(0.5 + BEAM_RADIUS / ASPECT, 0.5, [{ x: 0.5, y: 0.5 }], ASPECT)).toBeCloseTo(Math.exp(-1));
  });
});

/**
 * Holding a picture. A vector display's image lasts only as long as the beam
 * keeps retracing it, so a writer holding a finished drawing revisits each
 * stroke and tops the phosphor up. `beamHoldGain` sizes each visit from the
 * time since the last one, so the level a retraced stroke settles at does not
 * depend on how often the tube gets to draw it.
 */
describe("a retraced stroke settles at the hold level at any refresh rate", () => {
  const decay = (dt: number) => Math.pow(PHOSPHOR_DECAY, dt / 1000);

  /** The energy on the line, visited every `periodMs`, simulated on the tube's own frames. */
  function hold(periodMs: number, level = BEAM_HOLD) {
    let e = 0;
    let min = Infinity;
    let max = 0;
    // Measured once settled: from cold, the phosphor takes about a second and a
    // half to come within a percent of any level.
    for (let t = 0; t < 4000; t += periodMs) {
      e = Math.min(1, e * decay(periodMs) + beamHoldGain(periodMs, level));
      if (t > 3000) {
        max = Math.max(max, e);
        min = Math.min(min, e * decay(periodMs));
      }
    }
    return { max, min };
  }

  it("mirrors the persistence the tube itself uses", () => {
    // PhosphorScreen resolves uDecay from the same base. If one moves alone, a
    // held stroke drifts brighter or dimmer than intended, silently.
    const src = readFileSync(join(process.cwd(), "components", "system", "PhosphorScreen.tsx"), "utf8");
    expect(src).toContain(`su.uDecay.value = Math.pow(${PHOSPHOR_DECAY}, dt / 1000);`);
  });

  it("holds within a few percent of the level from 30Hz to 165Hz, and every other frame at 60", () => {
    for (const period of [1000 / 30, 1000 / 60, 2000 / 60, 1000 / 120, 1000 / 165]) {
      const { max, min } = hold(period);
      expect(Math.abs(max / BEAM_HOLD - 1), `${period.toFixed(1)}ms peak`).toBeLessThan(0.01);
      // Between visits it sags by one period of decay: a tenth at 30Hz, less above.
      expect(min / BEAM_HOLD, `${period.toFixed(1)}ms trough`).toBeGreaterThan(0.89);
    }
  });

  it("holds the finished mark near where the trace left it, under the clamp", () => {
    expect(BEAM_HOLD).toBeGreaterThan(0.45);
    expect(BEAM_HOLD).toBeLessThan(0.8);
  });

  it("lets the collapsing line build towards the clamp inside a sixth of a second", () => {
    // The fold concentrates the beam's energy into one line, so it aims past the
    // buffer's ceiling and is caught by the clamp: bright almost at once.
    let e = 0;
    for (let t = 0; t < 150; t += 1000 / 60) e = Math.min(1, e * decay(1000 / 60) + beamHoldGain(1000 / 60, BEAM_FOLD));
    expect(e).toBeGreaterThan(0.8);
  });

  it("puts nothing down for no time", () => {
    expect(beamHoldGain(0)).toBe(0);
    expect(beamHoldGain(-10)).toBe(0);
    expect(beamHoldGain(Number.NaN)).toBe(0);
  });
});
