import { describe, it, expect } from "vitest";
import { makePatch, quantise } from "./music";
import { SCALES, TONES, hz, keyName, keyNotes, noteIndex, panName, percent, retune, scaleAt, scaleIndex, toneAt, toneIndex } from "./knobs";

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

describe("the note knob", () => {
  it("turns through the notes of the key, one detent a note, so no press is snapped back", () => {
    // C3 in C minor: a chromatic knob would go to C#3, which quantises back
    // to C3, and the arrow key would do nothing at all.
    expect(quantise(49, 0, "minor")).toBe(48);
    const notes = keyNotes(0, "minor");
    const at = notes.indexOf(48);
    expect(notes[at + 1]).toBe(50);
    expect(notes[at - 1]).toBe(46);
  });

  it("holds every note in the key across the voice's range, and nothing else", () => {
    for (const [root, scale] of [[0, "minor"], [9, "minor"], [0, "major"], [5, "pentatonic"]] as const) {
      const notes = keyNotes(root, scale);
      const expected = Array.from({ length: 61 }, (_, i) => 36 + i).filter((n) => quantise(n, root, scale) === n);
      expect(notes, `${root} ${scale}`).toEqual(expected);
    }
  });

  it("finds a voice's place on the knob, and the nearest place for a note off the key", () => {
    const notes = keyNotes(0, "minor");
    expect(noteIndex(48, notes)).toBe(notes.indexOf(48));
    expect(noteIndex(49, notes)).toBe(notes.indexOf(48));
    expect(notes[noteIndex(96, notes)]).toBe(96);
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
