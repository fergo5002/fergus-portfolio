import { describe, it, expect } from "vitest";
import { makePatch, quantise } from "./music";
import { SCALES, TONES, hz, keyName, panName, percent, retune, scaleAt, scaleIndex, toneAt, toneIndex } from "./knobs";

/**
 * The knob row's arithmetic. The kit's Knob carries a number, so the stepped
 * knobs (scale and tone) are an index into a fixed list, and the readouts are
 * formatted here rather than in the component.
 */
describe("the stepped knobs", () => {
  it("turns the scale knob through minor, major and pentatonic, and back", () => {
    expect(SCALES).toEqual(["minor", "major", "pentatonic"]);
    SCALES.forEach((scale, i) => {
      expect(scaleIndex(scale)).toBe(i);
      expect(scaleAt(i)).toBe(scale);
    });
  });

  it("turns the tone knob through glass, warm and reed as sine, triangle and sawtooth", () => {
    expect(TONES).toEqual(["sine", "triangle", "sawtooth"]);
    TONES.forEach((tone, i) => {
      expect(toneIndex(tone)).toBe(i);
      expect(toneAt(i)).toBe(tone);
    });
  });

  it("holds a stepped knob inside its list whatever number arrives", () => {
    expect(scaleAt(-3)).toBe("minor");
    expect(scaleAt(9)).toBe("pentatonic");
    expect(scaleAt(1.4)).toBe("major");
    expect(toneAt(Number.NaN)).toBe("sine");
  });
});

describe("the key and scale knobs retune the voices", () => {
  it("moves every voice onto the new key without losing its octave", () => {
    const p = makePatch(0);
    const next = retune(p, 2, "major");
    expect(next.root).toBe(2);
    expect(next.scale).toBe("major");
    next.voices.forEach((v, i) => {
      expect(v.note).toBe(quantise(p.voices[i].note, 2, "major"));
      expect(Math.abs(v.note - p.voices[i].note)).toBeLessThanOrEqual(2);
    });
    // Everything else about the voices stays.
    expect(next.voices.map((v) => v.steps)).toEqual(p.voices.map((v) => v.steps));
  });

  it("leaves a voice already in the key where it is", () => {
    const p = makePatch(0);
    expect(retune(p, p.root, p.scale).voices.map((v) => v.note)).toEqual(p.voices.map((v) => v.note));
  });
});

describe("the readouts", () => {
  it("names the key without an octave", () => {
    expect(keyName(0)).toBe("C");
    expect(keyName(9)).toBe("A");
    expect(keyName(1)).toBe("C♯");
  });

  it("writes brightness in hertz and then kilohertz", () => {
    expect(hz(150)).toBe("150 Hz");
    expect(hz(3200)).toBe("3.2 kHz");
    expect(hz(12000)).toBe("12 kHz");
  });

  it("writes a fraction of the knob's travel as a percentage", () => {
    expect(percent(0.24, 0.6)).toBe("40%");
    expect(percent(0, 0.45)).toBe("0%");
    expect(percent(0.45, 0.45)).toBe("100%");
  });

  it("writes the pan as centre, left or right", () => {
    expect(panName(0)).toBe("C");
    expect(panName(-0.5)).toBe("L50");
    expect(panName(1)).toBe("R100");
    expect(panName(-0.04)).toBe("C");
  });
});
