import { describe, it, expect } from "vitest";
import { makePatch, stepTime } from "./music";
import {
  STEPS,
  advance,
  clearSteps,
  hitsAt,
  horizon,
  newPattern,
  playheadAt,
  setVoice,
  stepLength,
  toggleStep,
  type Clock,
  type Scheduled,
} from "./sequencer";

/**
 * The grid model: four voices as four rows of sixteen lamps, one clock that
 * walks the columns, and the playhead that says which column is sounding.
 * Everything here is pure, so the component only wires it to the audio clock.
 */
describe("the grid", () => {
  it("toggles one lamp and leaves every other lamp and voice alone", () => {
    const p = makePatch(0);
    const next = toggleStep(p, 2, 5);
    expect(next.voices[2].steps[5]).toBe(!p.voices[2].steps[5]);
    next.voices.forEach((v, i) =>
      v.steps.forEach((on, s) => {
        if (i !== 2 || s !== 5) expect(on, `${i}:${s}`).toBe(p.voices[i].steps[s]);
      }),
    );
    // A new patch, never an edit in place: React sees the change.
    expect(next).not.toBe(p);
    expect(p.voices[2].steps[5]).toBe(makePatch(0).voices[2].steps[5]);
    expect(toggleStep(next, 2, 5)).toEqual(p);
  });

  it("changes one voice without touching the other three", () => {
    const p = makePatch(1);
    const next = setVoice(p, 1, { mute: true, decay: 1.2 });
    expect(next.voices[1]).toMatchObject({ mute: true, decay: 1.2, note: p.voices[1].note });
    expect(next.voices[0]).toBe(p.voices[0]);
    expect(next.voices[3]).toBe(p.voices[3]);
  });

  it("clears every lamp in every row", () => {
    const cleared = clearSteps(makePatch(0));
    expect(cleared.voices.every((v) => v.steps.length === STEPS && v.steps.every((on) => !on))).toBe(true);
  });

  it("deals a new pattern per voice from the random source it is given", () => {
    const rolls = [0.5, 0.25, 0, 0, 0.99, 0.99, 0.1, 0.6];
    let i = 0;
    const next = newPattern(makePatch(0), () => rolls[i++]);
    // 2 + floor(r * 6) pulses, rotated by floor(r * 16).
    expect(next.voices.map((v) => v.steps.filter(Boolean).length)).toEqual([5, 2, 7, 2]);
    expect(next.voices.every((v) => v.steps.length === STEPS)).toBe(true);
  });

  it("fires only lit, audible voices on a step, honouring mute and solo", () => {
    let p = makePatch(0);
    for (let v = 0; v < 4; v++) p = setVoice(p, v, { steps: Array(STEPS).fill(true) });
    expect(hitsAt(p.voices, 3)).toEqual([0, 1, 2, 3]);
    p = setVoice(p, 1, { mute: true });
    expect(hitsAt(p.voices, 3)).toEqual([0, 2, 3]);
    p = setVoice(p, 3, { solo: true });
    expect(hitsAt(p.voices, 3)).toEqual([3]);
    p = setVoice(p, 3, { steps: Array(STEPS).fill(false) });
    expect(hitsAt(p.voices, 3)).toEqual([]);
  });
});

describe("the clock", () => {
  it("gives even steps the long half of the swing and odd steps the short half, like the WAV", () => {
    const p = { ...makePatch(0), swing: 0.3 };
    expect(stepLength(p.bpm, p.swing, 0)).toBeCloseTo((60 / p.bpm / 4) * 1.3, 9);
    expect(stepLength(p.bpm, p.swing, 1)).toBeCloseTo((60 / p.bpm / 4) * 0.7, 9);
    // The live clock and the offline render agree on where every step starts.
    let t = 0;
    for (let s = 0; s < 32; s++) {
      expect(t, `step ${s}`).toBeCloseTo(stepTime(s, p), 9);
      t += stepLength(p.bpm, p.swing, s);
    }
  });

  it("schedules far enough ahead to outlast the gap between two frames", () => {
    expect(horizon(1 / 60)).toBeCloseTo(0.1, 9);
    // Headless Chromium draws a frame every 250 to 450ms. A fixed 90ms window
    // would drop most of the notes there.
    expect(horizon(0.4)).toBeGreaterThan(0.4);
    expect(horizon(5)).toBeLessThanOrEqual(0.5);
    expect(horizon(Number.NaN)).toBeCloseTo(0.1, 9);
  });

  it("returns every step that starts before the horizon, and no more", () => {
    const p = { ...makePatch(0), bpm: 120, swing: 0 };
    const clock: Clock = { next: 1, step: 0 };
    const { clock: after, due } = advance(clock, p, 1, 1.4);
    // 125ms steps from t = 1: 1, 1.125, 1.25, 1.375.
    expect(due.map((d) => d.step)).toEqual([0, 1, 2, 3]);
    expect(due.map((d) => d.time)).toEqual([1, 1.125, 1.25, 1.375]);
    expect(due.every((d) => d.length === 0.125)).toBe(true);
    expect(after).toEqual({ next: 1.5, step: 4 });
    expect(clock).toEqual({ next: 1, step: 0 });
  });

  it("carries each step's voices, wrapping the column after sixteen", () => {
    const p = { ...makePatch(0), bpm: 120, swing: 0 };
    const { due } = advance({ next: 0, step: 14 }, p, 0, 0.3);
    expect(due.map((d) => d.column)).toEqual([14, 15, 0]);
    expect(due.map((d) => d.voices)).toEqual([14, 15, 0].map((s) => hitsAt(p.voices, s)));
  });

  it("re-anchors a clock that fell behind instead of firing a burst of stale notes", () => {
    const p = makePatch(0);
    const { due } = advance({ next: 1, step: 0 }, p, 5, 5.1);
    expect(due[0].time).toBeGreaterThan(5);
    expect(due[0].time).toBeLessThan(5.05);
  });
});

describe("the playhead", () => {
  const queue: Scheduled[] = [
    { step: 8, column: 8, time: 2, length: 0.125, voices: [] },
    { step: 9, column: 9, time: 2.125, length: 0.125, voices: [] },
    { step: 10, column: 10, time: 2.25, length: 0.125, voices: [] },
  ];

  it("reads the column sounding now, not the one scheduled ahead of it", () => {
    expect(playheadAt(queue, 2.2)).toEqual({ column: 9, phase: expect.closeTo(0.6, 9), step: 9 });
    expect(playheadAt(queue, 2.25)?.column).toBe(10);
  });

  it("is nowhere before the first scheduled note sounds", () => {
    expect(playheadAt(queue, 1.99)).toBeNull();
    expect(playheadAt([], 3)).toBeNull();
  });

  it("holds the last column at its end rather than running off the grid", () => {
    expect(playheadAt(queue, 9)).toEqual({ column: 10, phase: 1, step: 10 });
  });
});
