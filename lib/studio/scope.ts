import { audible, type Voice } from "./music";

/**
 * The scope's drawing, as pure functions: from a buffer of samples (what the
 * AnalyserNode heard) to the points of one trace. The component draws the
 * points on a canvas in the phosphor's colours; nothing here knows about
 * either.
 */

export type ScopeBox = { width: number; height: number; pad: number };

/** Below this the mix is hiss, not signal, and the gain stops climbing. */
const GAIN_FLOOR = 0.18;
/** How much of the glass a full-scale trace fills. */
const FILL = 0.9;
/** The still trace's height, as a fraction of full scale. */
const STILL_PEAK = 0.8;

/**
 * Index of the first rising zero crossing in the first half of the buffer,
 * so a steady tone draws in the same place every frame. 0 when there is none.
 */
export function trigger(samples: ArrayLike<number>, span = Math.floor(samples.length / 2)): number {
  for (let i = 1; i < span; i++) if (samples[i - 1] < 0 && samples[i] >= 0) return i;
  return 0;
}

export function peak(samples: ArrayLike<number>): number {
  let most = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > most) most = a;
  }
  return most;
}

/** Scale a quiet mix up to fill the glass, but never past what hiss would earn. */
export function autoGain(level: number): number {
  return FILL / Math.max(level, GAIN_FLOOR);
}

/**
 * One point per pixel column: `[x0, y0, x1, y1, ...]`. A positive sample is
 * drawn above the centre line, and nothing is drawn outside `pad`.
 */
export function trace(
  samples: ArrayLike<number>,
  box: ScopeBox,
  { from = 0, count = samples.length - from, gain = 1 }: { from?: number; count?: number; gain?: number } = {},
): Float32Array {
  const width = Math.max(1, Math.floor(box.width));
  const mid = box.height / 2;
  const reach = mid - box.pad;
  const points = new Float32Array(width * 2);
  for (let x = 0; x < width; x++) {
    const index = from + Math.floor((x * count) / width);
    const raw = (samples[index] ?? 0) * gain;
    const s = raw > 1 ? 1 : raw < -1 ? -1 : raw;
    points[x * 2] = x;
    points[x * 2 + 1] = mid - s * reach;
  }
  return points;
}

const shape: Record<Voice["wave"], (phase: number) => number> = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  sawtooth: (p) => 2 * (p % 1) - 1,
};

/**
 * A still picture of the patch, for reduced motion: the audible voices'
 * waveforms summed over two cycles of the lowest of them, normalised. The
 * shape changes with the notes and tones, and nothing moves.
 */
export function stillTrace(voices: readonly Voice[], count: number): Float32Array {
  const out = new Float32Array(count);
  const live = voices.filter((_, i) => audible(voices as Voice[], i));
  if (!live.length) return out;
  const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
  const lowest = Math.min(...live.map((v) => hz(v.note)));
  const seconds = 2 / lowest;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * seconds;
    let sum = 0;
    for (const v of live) sum += shape[v.wave](t * hz(v.note));
    out[i] = sum;
  }
  const most = peak(out);
  if (most > 0) for (let i = 0; i < count; i++) out[i] = (out[i] / most) * STILL_PEAK;
  return out;
}
