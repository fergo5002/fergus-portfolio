import { describe, it, expect } from "vitest";
import {
  euclidean,
  quantise,
  makePatch,
  parseStudioPatch,
  encodeWav,
  noteName,
} from "./music";
describe("Resonance instrument", () => {
  it("distributes the requested beats, including silence and a full grid", () => {
    expect(euclidean(5).filter(Boolean)).toHaveLength(5);
    expect(euclidean(0).some(Boolean)).toBe(false);
    expect(euclidean(16).every(Boolean)).toBe(true);
  });
  it("quantises to the selected key without losing octave information", () => {
    expect(quantise(61, 0, "major")).toBe(60);
    expect(noteName(69)).toBe("A4");
    expect(quantise(73, 0, "major")).toBe(72);
  });
  it("roundtrips patches and rejects invalid feedback, timing and notes", () => {
    const p = makePatch(0);
    expect(parseStudioPatch(JSON.stringify(p))).toEqual(p);
    expect(() => parseStudioPatch(JSON.stringify({ ...p, bpm: 0 }))).toThrow();
    expect(() =>
      parseStudioPatch(JSON.stringify({ ...p, delay: 2 })),
    ).toThrow();
    expect(() =>
      parseStudioPatch(
        JSON.stringify({ ...p, voices: [{ ...p.voices[0], note: NaN }] }),
      ),
    ).toThrow();
  });
  it("writes a PCM WAV with clamped samples and correct byte sizes", () => {
    const bytes = encodeWav([new Float32Array([-2, 0, 2])], 44100),
      view = new DataView(bytes);
    expect(new TextDecoder().decode(new Uint8Array(bytes, 0, 4))).toBe("RIFF");
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});
