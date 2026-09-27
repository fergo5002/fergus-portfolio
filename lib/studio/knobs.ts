import { noteName, quantise, type Scale, type StudioPatch, type Voice } from "./music";

/**
 * The knob row's arithmetic. The kit's Knob carries a number, so the two
 * stepped knobs (scale and tone) are an index into a fixed list, and every
 * readout is formatted here rather than in the component.
 */

export const SCALES: readonly Scale[] = ["minor", "major", "pentatonic"];
export const TONES: readonly Voice["wave"][] = ["sine", "triangle", "sawtooth"];

const pick = <T>(list: readonly T[], index: number): T =>
  list[Number.isFinite(index) ? Math.min(list.length - 1, Math.max(0, Math.round(index))) : 0];

export const scaleIndex = (scale: Scale) => Math.max(0, SCALES.indexOf(scale));
export const scaleAt = (index: number) => pick(SCALES, index);
export const toneIndex = (tone: Voice["wave"]) => Math.max(0, TONES.indexOf(tone));
export const toneAt = (index: number) => pick(TONES, index);

/** A new key or scale, with every voice moved onto it. */
export function retune(patch: StudioPatch, root: number, scale: Scale): StudioPatch {
  return { ...patch, root, scale, voices: patch.voices.map((v) => ({ ...v, note: quantise(v.note, root, scale) })) };
}

export const keyName = (root: number) => noteName(60 + root).slice(0, -1);

export const hz = (value: number) =>
  value >= 1000 ? `${Number((value / 1000).toFixed(1))} kHz` : `${Math.round(value)} Hz`;

export const percent = (value: number, max: number) => `${Math.round((value / max) * 100)}%`;

export function panName(pan: number): string {
  const amount = Math.round(Math.abs(pan) * 100);
  if (amount < 5) return "C";
  return `${pan < 0 ? "L" : "R"}${amount}`;
}
