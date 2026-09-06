export type Patch = {
  format: "resonance-v1";
  voices: { note: number; period: number }[];
};
export function pendulumPosition(t: number, period: number) {
  return Math.sin((t * Math.PI * 2) / period);
}
export function crossings(from: number, to: number, period: number) {
  return Math.min(
    2,
    Math.max(
      0,
      Math.floor(to / (period / 2)) - Math.floor(from / (period / 2)),
    ),
  );
}
export function parsePatch(text: string): Patch {
  const p = JSON.parse(text);
  if (
    p?.format !== "resonance-v1" ||
    !Array.isArray(p.voices) ||
    !p.voices.length ||
    p.voices.length > 8 ||
    p.voices.some(
      (v: Patch["voices"][number]) =>
        !Number.isInteger(v.note) ||
        v.note < 36 ||
        v.note > 96 ||
        !Number.isFinite(v.period) ||
        v.period < 0.5 ||
        v.period > 16,
    )
  )
    throw new Error(
      "Use a Resonance patch with 1–8 voices, notes 36–96 and periods 0.5–16 seconds.",
    );
  return p;
}
