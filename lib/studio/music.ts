export type Scale = "minor" | "major" | "pentatonic";
export type Voice = {
  note: number;
  steps: boolean[];
  mute: boolean;
  solo: boolean;
  pan: number;
  wave: "sine" | "triangle" | "sawtooth";
  decay: number;
};
export type StudioPatch = {
  format: "resonance-v2";
  bpm: number;
  root: number;
  scale: Scale;
  volume: number;
  cutoff: number;
  delay: number;
  swing: number;
  voices: Voice[];
};
const scales = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
};
export const noteName = (n: number) =>
  ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][n % 12] +
  (Math.floor(n / 12) - 1);
export function quantise(note: number, root: number, scale: Scale) {
  let best = 36,
    distance = Infinity;
  for (let n = 36; n <= 96; n++)
    if (
      scales[scale].includes((((n - root) % 12) + 12) % 12) &&
      Math.abs(note - n) < distance
    ) {
      best = n;
      distance = Math.abs(note - n);
    }
  return best;
}
export function euclidean(pulses: number, rotate = 0): boolean[] {
  return Array.from(
    { length: 16 },
    (_, i) =>
      (((i + rotate) % 16) * Math.max(0, Math.min(16, pulses))) % 16 <
      Math.max(0, Math.min(16, pulses)),
  );
}
export function makePatch(index: number): StudioPatch {
  const sets = [
      [48, 55, 60, 63],
      [48, 60, 67, 72],
      [45, 52, 57, 64],
      [36, 48, 55, 58],
    ],
    notes = sets[index % sets.length];
  return {
    format: "resonance-v2",
    bpm: [92, 112, 72, 126][index % 4],
    root: index === 2 ? 9 : 0,
    scale: index === 1 ? "major" : "minor",
    volume: 0.24,
    cutoff: 3200,
    delay: 0.22,
    swing: 0,
    voices: notes.map((note, i) => ({
      note,
      steps: euclidean([4, 3, 5, 2][i], i),
      mute: false,
      solo: false,
      pan: (i - 1.5) * 0.35,
      wave: i === 0 ? "triangle" : "sine",
      decay: 0.65 + i * 0.18,
    })),
  };
}
export function parseStudioPatch(raw: string): StudioPatch {
  if (raw.length > 50_000) throw new Error("Patch limit: 50 KB.");
  let p = JSON.parse(raw);
  if (p?.format === "resonance-v1" && Array.isArray(p.voices)) {
    const old = p.voices;
    p = makePatch(0);
    p.voices = old.map((v: { note: number; period: number }, i: number) => {
      if (!Number.isFinite(v.period) || v.period < 0.5 || v.period > 16)
        throw new Error("Invalid legacy period.");
      return {
        ...p.voices[i % 4],
        note: v.note,
        steps: euclidean(Math.max(1, Math.min(16, Math.round(8 / v.period)))),
      };
    });
  }
  const range = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (
    p?.format !== "resonance-v2" ||
    !range(p.bpm, 40, 180) ||
    !range(p.root, 0, 11) ||
    !Number.isInteger(p.root) ||
    !Object.hasOwn(scales, p.scale) ||
    !range(p.volume, 0, 0.6) ||
    !range(p.cutoff, 150, 12000) ||
    !range(p.delay, 0, 0.65) ||
    !range(p.swing, 0, 0.45) ||
    !Array.isArray(p.voices) ||
    p.voices.length !== 4
  )
    throw new Error("Invalid Resonance patch settings (four voices required).");
  for (const v of p.voices)
    if (
      !v ||
      !range(v.note, 36, 96) ||
      !Number.isInteger(v.note) ||
      !range(v.pan, -1, 1) ||
      !range(v.decay, 0.1, 2) ||
      !["sine", "triangle", "sawtooth"].includes(v.wave) ||
      typeof v.mute !== "boolean" ||
      typeof v.solo !== "boolean" ||
      !Array.isArray(v.steps) ||
      v.steps.length !== 16 ||
      v.steps.some((s: unknown) => typeof s !== "boolean")
    )
      throw new Error("Invalid voice or step pattern.");
  return p;
}
export const audible = (voices: Voice[], i: number) =>
  !voices[i].mute && (!voices.some((v) => v.solo) || voices[i].solo);
export function stepTime(step: number, p: StudioPatch) {
  const duration = 60 / p.bpm / 4;
  return (step + (step % 2 ? p.swing : 0)) * duration;
}
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const frames = channels[0]?.length ?? 0,
    count = channels.length,
    bytes = new ArrayBuffer(44 + frames * count * 2),
    v = new DataView(bytes);
  const text = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, count, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * count * 2, true);
  v.setUint16(32, count * 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, frames * count * 2, true);
  for (let i = 0; i < frames; i++)
    for (let ch = 0; ch < count; ch++) {
      const n = Math.max(-1, Math.min(1, channels[ch][i] || 0));
      v.setInt16(
        44 + (i * count + ch) * 2,
        Math.round(n * (n < 0 ? 32768 : 32767)),
        true,
      );
    }
  return bytes;
}
