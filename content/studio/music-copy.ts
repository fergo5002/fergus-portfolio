/**
 * Resonance's words. The face carries labels only: every instruction that
 * used to sit on it (the pendulums, the pad, when sound starts) is in the
 * tool's `method`, in `content/tools/resonance.ts`, which the shell prints in
 * its one disclosure under the stage.
 */
export const musicCopy = {
  /** The play key's accessible names, and the word under its glyph. */
  play: "Play sequence",
  stop: "Stop sound",
  playWord: "Play",
  stopWord: "Stop",
  preset: "Sound worlds",
  presets: ["After hours", "Glasshouse", "Slow tide", "Subterranean"],
  bpm: "Tempo",
  root: "Key",
  scale: "Scale",
  swing: "Swing",
  volume: "Output",
  cutoff: "Brightness",
  delay: "Echo",
  note: "Note",
  decay: "Decay",
  pan: "Pan",
  wave: "Tone",
  scales: { minor: "Minor", major: "Major", pentatonic: "Pentatonic" },
  tones: { sine: "Glass", triangle: "Warm", sawtooth: "Reed" },
  voice: (n: number) => `Play voice ${n}`,
  voiceGroup: (n: number) => `Voice ${n}`,
  mute: (n: number) => `Mute voice ${n}`,
  solo: (n: number) => `Solo voice ${n}`,
  cell: (voice: number, step: number) => `Voice ${voice}, step ${step}`,
  muteMark: "M",
  soloMark: "S",
  keys: ["A", "S", "D", "F"],
  scope: "Scope: the waveform of what is playing",
  bpmUnit: "BPM",
  random: "New pattern",
  clear: "Clear steps",
  exports: "Keep this patch",
  save: "Save patch",
  render: "Render 8 bars to WAV",
  rendering: "Rendering…",
  load: "Open patch",
  wavNote: "The WAV is eight bars plus the release tail.",
  tooLarge: "Patch limit: 50 KB.",
};

/** Kept for the `studioLabels` barrel; the face reads `musicCopy` directly. */
export const musicLabels = {
  minor: musicCopy.scales.minor,
  major: musicCopy.scales.major,
  pentatonic: musicCopy.scales.pentatonic,
} as const;
