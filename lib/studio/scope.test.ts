import { describe, it, expect } from "vitest";
import { makePatch } from "./music";
import { autoGain, peak, stillTrace, trace, trigger } from "./scope";

/**
 * The scope's drawing, from a buffer of samples to the points of one trace.
 * The component hands it what the AnalyserNode heard; nothing here needs a
 * canvas or an AudioContext.
 */
const sine = (n: number, cycles: number, phase = 0, amp = 1) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin(phase + (2 * Math.PI * cycles * i) / n));

const box = { width: 200, height: 100, pad: 10 };

describe("the trigger", () => {
  it("starts the trace on a rising zero crossing, so a steady tone stands still", () => {
    // Starts at the top of the wave, falls through zero at a quarter cycle,
    // and rises back through zero at three quarters.
    const s = sine(256, 4, Math.PI / 2);
    const at = trigger(s);
    expect(s[at - 1]).toBeLessThan(0);
    expect(s[at]).toBeGreaterThanOrEqual(0);
    // Three quarters of the first 64-sample cycle, give or take the rounding
    // of a sine at exactly zero.
    expect(at).toBeGreaterThanOrEqual(48);
    expect(at).toBeLessThanOrEqual(49);
  });

  it("looks only in the first half, so a full window is always left to draw", () => {
    const s = new Float32Array(100).fill(-1);
    s.fill(1, 80);
    expect(trigger(s)).toBe(0);
  });

  it("falls back to the start of a silent buffer", () => {
    expect(trigger(new Float32Array(64))).toBe(0);
  });
});

describe("the trace", () => {
  it("draws one point per pixel column across the whole box", () => {
    const points = trace(sine(512, 2), box);
    expect(points.length).toBe(box.width * 2);
    expect(points[0]).toBe(0);
    expect(points[points.length - 2]).toBe(box.width - 1);
  });

  it("puts silence on the centre line", () => {
    const points = trace(new Float32Array(512), box);
    for (let i = 1; i < points.length; i += 2) expect(points[i]).toBe(50);
  });

  it("draws a positive sample above the centre, the way a scope does", () => {
    const points = trace(new Float32Array(512).fill(0.5), box);
    expect(points[1]).toBe(50 - 0.5 * 40);
  });

  it("clamps a clipped signal inside the glass instead of drawing off it", () => {
    const loud = new Float32Array(512).fill(9);
    const quiet = new Float32Array(512).fill(-9);
    expect(trace(loud, box, { gain: 3 })[1]).toBe(box.pad);
    expect(trace(quiet, box, { gain: 3 })[1]).toBe(box.height - box.pad);
  });

  it("reads the window after the trigger it is given", () => {
    const s = new Float32Array(400);
    s.fill(1, 100);
    expect(trace(s, box, { from: 100, count: 200 })[1]).toBe(box.pad);
    expect(trace(s, box, { from: 0, count: 200 })[1]).toBe(50);
  });
});

describe("the gain", () => {
  it("measures the loudest sample either side of zero", () => {
    expect(peak(Float32Array.from([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
    expect(peak(new Float32Array(8))).toBe(0);
  });

  it("brings a quiet mix up to fill the glass, but never magnifies hiss past a limit", () => {
    expect(autoGain(0.3) * 0.3).toBeCloseTo(0.9, 6);
    expect(autoGain(0.9)).toBeCloseTo(1, 6);
    expect(autoGain(0.001)).toBeLessThanOrEqual(5);
    expect(autoGain(0)).toBeLessThanOrEqual(5);
  });
});

describe("the still trace, drawn under reduced motion", () => {
  it("is the patch's own waveform: the sum of the audible voices, normalised", () => {
    const p = makePatch(0);
    const s = stillTrace(p.voices, 256);
    expect(s.length).toBe(256);
    expect(peak(s)).toBeCloseTo(0.8, 6);
  });

  it("is flat when nothing can sound", () => {
    const p = makePatch(0);
    const muted = p.voices.map((v) => ({ ...v, mute: true }));
    expect(peak(stillTrace(muted, 128))).toBe(0);
  });

  it("changes when the voices do", () => {
    const p = makePatch(0);
    const reeds = p.voices.map((v) => ({ ...v, wave: "sawtooth" as const }));
    expect(Array.from(stillTrace(reeds, 64))).not.toEqual(Array.from(stillTrace(p.voices, 64)));
  });
});
