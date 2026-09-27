import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BEAM_RADIUS, MAX_BEAM_POINTS, beamHoldGain, beamLength } from "./beam";
import type { BeamPoint } from "./beam";
import {
  SAVER_HOLD_MS,
  SAVER_JOIN,
  SAVER_LEVEL,
  SAVER_PERIOD_MS,
  SAVER_RATIOS,
  figureAt,
  lissajousPoint,
  saverStep,
} from "./lissajous";
import type { SaverWriter } from "./lissajous";

const ASPECTS = [390 / 844, 320 / 568, 1, 1440 / 900, 2560 / 1080];

/** Runs the writer for `ms` at a steady frame rate against a tube that takes every path at once. */
function run(ms: number, fps: number, aspect = 1440 / 900, from = 0) {
  let w: SaverWriter | null = null;
  const frames: { t: number; pts: BeamPoint[]; gain: number }[] = [];
  for (let t = from; t <= from + ms; t += 1000 / fps) {
    const step = saverStep(w, { elapsedMs: t, aspect, pending: [] });
    w = step.writer;
    if (step.pts) frames.push({ t, pts: step.pts, gain: step.gain });
  }
  return frames;
}

describe("the saver's figure", () => {
  it("stays well inside the tube at every ratio, phase and shape of screen", () => {
    let lo = 1;
    let hi = 0;
    for (const aspect of ASPECTS) {
      for (let t = 0; t < SAVER_HOLD_MS * SAVER_RATIOS.length; t += 397) {
        const fig = figureAt(t);
        for (let k = 0; k < 64; k++) {
          const p = lissajousPoint((k / 64) * Math.PI * 2, fig, aspect);
          lo = Math.min(lo, p.x, p.y);
          hi = Math.max(hi, p.x, p.y);
        }
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0.06);
    expect(hi).toBeLessThanOrEqual(0.94);
  });

  it("holds each ratio for a while, in order, and comes round again", () => {
    const seen = SAVER_RATIOS.map((_, i) => figureAt(i * SAVER_HOLD_MS + 10).index);
    expect(seen).toEqual(SAVER_RATIOS.map((_, i) => i));
    expect(figureAt(SAVER_RATIOS.length * SAVER_HOLD_MS + 10).index).toBe(0);
    expect(figureAt(SAVER_HOLD_MS - 1).index).toBe(0);
  });

  it("drifts its phase slowly, so the figure turns rather than sits", () => {
    const a = figureAt(1000).delta;
    const b = figureAt(1100).delta;
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(0.1);
  });
});

describe("saverStep, the beam's writer", () => {
  it("starts with the gun blanked, then writes short strokes the tube can take", () => {
    const first = saverStep(null, { elapsedMs: 0, aspect: 1.6, pending: [] });
    expect(first.pts).toBeNull();
    const frames = run(2000, 60);
    expect(frames.length).toBeGreaterThan(100);
    for (const f of frames) {
      expect(f.pts.length).toBeGreaterThanOrEqual(2);
      expect(f.pts.length).toBeLessThanOrEqual(MAX_BEAM_POINTS);
      expect(f.gain).toBeGreaterThan(0);
    }
  });

  it("never overwrites a path the tube has not drawn, and picks up where it left off", () => {
    const a = saverStep(null, { elapsedMs: 0, aspect: 1.6, pending: [] });
    const b = saverStep(a.writer, { elapsedMs: 16, aspect: 1.6, pending: [] });
    expect(b.pts).not.toBeNull();
    const waiting = saverStep(b.writer, { elapsedMs: 33, aspect: 1.6, pending: b.pts! });
    expect(waiting.pts).toBeNull();
    expect(waiting.writer.theta).toBe(b.writer.theta);
    const next = saverStep(waiting.writer, { elapsedMs: 50, aspect: 1.6, pending: [] });
    expect(next.pts).not.toBeNull();
  });

  it("starts each stroke just past the last one's end, so the joins do not bead", () => {
    const aspect = 1.6;
    const frames = run(1500, 60, aspect, 500);
    let checked = 0;
    for (let i = 1; i < frames.length; i++) {
      const gap = beamLength([frames[i - 1].pts[frames[i - 1].pts.length - 1], frames[i].pts[0]], aspect);
      // Consecutive frames only: a blank across a ratio change is a jump.
      if (frames[i].t - frames[i - 1].t > 20) continue;
      expect(gap).toBeGreaterThan(SAVER_JOIN * 0.6);
      expect(gap).toBeLessThan(SAVER_JOIN * 1.6);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(SAVER_JOIN).toBeGreaterThan(BEAM_RADIUS);
  });

  it("lays down the same light on the figure at 30 frames a second as at 120", () => {
    // Each part of the figure is visited once a period whatever the frame
    // rate, so the light per visit must not depend on how the sweep was cut up.
    const mean = (fps: number) => {
      const f = run(3000, fps, 1.6, 200);
      return f.reduce((s, x) => s + x.gain, 0) / f.length;
    };
    const slow = mean(30);
    const fast = mean(120);
    expect(Math.abs(slow - fast) / fast).toBeLessThan(0.15);
    const base = beamHoldGain(SAVER_PERIOD_MS, SAVER_LEVEL);
    expect(fast).toBeGreaterThan(base * 0.5);
    expect(fast).toBeLessThan(base * 2);
  });

  it("jumps rather than drawing a giant stroke when a hidden tab comes back", () => {
    const a = saverStep(null, { elapsedMs: 0, aspect: 1.6, pending: [] });
    const b = saverStep(a.writer, { elapsedMs: 16, aspect: 1.6, pending: [] });
    const back = saverStep(b.writer, { elapsedMs: 16 + 5000, aspect: 1.6, pending: [] });
    expect(back.pts).toBeNull();
    const after = saverStep(back.writer, { elapsedMs: 16 + 5016, aspect: 1.6, pending: [] });
    expect(after.pts).not.toBeNull();
  });

  it("blanks the gun across a change of ratio instead of joining two figures", () => {
    const env = (elapsedMs: number) => ({ elapsedMs, aspect: 1.6, pending: [] });
    const a = saverStep(null, env(SAVER_HOLD_MS - 40));
    const b = saverStep(a.writer, env(SAVER_HOLD_MS - 24));
    expect(b.pts).not.toBeNull();
    // The first frame of the new figure writes nothing: the beam moves blanked.
    const across = saverStep(b.writer, env(SAVER_HOLD_MS + 4));
    expect(across.pts).toBeNull();
    expect(across.writer.index).toBe(1);
    expect(saverStep(across.writer, env(SAVER_HOLD_MS + 20)).pts).not.toBeNull();
  });
});

describe("the Screensaver draws with the beam", () => {
  const src = readFileSync(join(process.cwd(), "components", "system", "Screensaver.tsx"), "utf8");

  it("reads the one frame clock and writes through lib/beam.ts", () => {
    expect(src).toMatch(/onFrame\(/);
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/saverStep\(/);
    expect(src).toMatch(/writeBeam\(frame\.current, /);
  });

  it("lets go of the beam and gives the page back when it wakes", () => {
    expect(src).toMatch(/clearBeam\(frame\.current\)/);
    expect(src).toMatch(/classList\.remove\(SAVING_CLASS\)/);
  });

  it("draws on the tube only when there is a tube, and keeps the plate otherwise", () => {
    expect(src).toMatch(/webgl-ok/);
    expect(src).toMatch(/crt-off/);
    expect(src).toMatch(/saver__plate/);
  });

  it("hears keys the arcade stops from bubbling, and never saves over the arcade", () => {
    // The arcade room stops keydown propagation, as its contract requires. A
    // bubble-phase listener never heard a keyboard player, who then got the
    // saver over a running game after 45 seconds.
    expect(src).toMatch(/capture: true/);
    expect(src).toMatch(/arcade-open/);
  });
});
