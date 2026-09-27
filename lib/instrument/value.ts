/**
 * The arithmetic every control in `components/instrument/` shares.
 *
 * The components are wiring over native elements (a range input, a radio, a
 * button). What a value is allowed to be, and how a pointer drag or a wheel
 * notch moves it, is decided here, where it can be tested without a DOM.
 * Nothing in this file knows about React, the page or the frame clock.
 */

export type Scale = "linear" | "log";

export type Bounds = { min: number; max: number; step: number };

/** Hold a value inside `[min, max]`. Not-a-number becomes the minimum, never NaN. */
export function clamp(value: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isNaN(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/** How many decimal places a step needs, so a snapped value prints cleanly. */
export function decimals(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  const text = String(Math.abs(step));
  const exp = /e-(\d+)$/.exec(text);
  if (exp) {
    const mantissa = text.slice(0, text.indexOf("e"));
    const dot = mantissa.indexOf(".");
    return Number(exp[1]) + (dot < 0 ? 0 : mantissa.length - dot - 1);
  }
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Round to the nearest step counted from `min`, with no floating-point residue. */
export function snap(value: number, min: number, step: number): number {
  if (!step) return value;
  const places = Math.max(decimals(step), decimals(min));
  return Number((min + Math.round((value - min) / step) * step).toFixed(places));
}

/**
 * Clamp, then snap, and never snap past either end: the value a control may
 * actually hold. `0..10` in threes settles 10 to 9, not 12.
 */
export function settle(value: number, { min, max, step }: Bounds): number {
  const clamped = clamp(value, min, max);
  if (!step) return clamped;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const last = Math.floor((hi - lo) / step + 1e-9);
  const index = Math.min(last, Math.max(0, Math.round((clamped - lo) / step)));
  const places = Math.max(decimals(step), decimals(lo));
  return Number((lo + index * step).toFixed(places));
}

function assertLog(min: number, max: number) {
  if (min <= 0 || max <= 0) throw new RangeError("A logarithmic control needs a positive range");
}

/** Where a value sits along its travel, 0 to 1, on a linear or logarithmic scale. */
export function toFraction(value: number, min: number, max: number, scale: Scale = "linear"): number {
  if (scale === "log") {
    assertLog(min, max);
    if (max === min) return 0;
    const v = clamp(value, min, max);
    return clamp(Math.log(v / min) / Math.log(max / min), 0, 1);
  }
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/** The value at a point along the travel. The inverse of `toFraction`. */
export function fromFraction(fraction: number, min: number, max: number, scale: Scale = "linear"): number {
  const f = clamp(fraction, 0, 1);
  if (scale === "log") {
    assertLog(min, max);
    return min * (max / min) ** f;
  }
  return min + f * (max - min);
}

/** The whole sweep of a knob, in degrees. Symmetric about twelve o'clock. */
export const KNOB_SWEEP = 270;

/** The indicator's angle for a fraction, from -135 to +135 degrees. */
export function knobAngle(fraction: number, sweep: number = KNOB_SWEEP): number {
  return -sweep / 2 + clamp(fraction, 0, 1) * sweep;
}

export type DragOptions = Bounds & {
  scale?: Scale;
  /** Pixels of vertical travel for the whole range. */
  travel?: number;
  /** Ten times slower, for a held modifier key. */
  fine?: boolean;
};

/** Default travel: long enough to be precise, short enough for a phone. */
export const DRAG_TRAVEL = 200;

/**
 * A vertical drag. Up the screen (negative `dy`) raises the value. Travel is
 * measured along the control's own scale, so a logarithmic knob drags along
 * its curve rather than racing through the top octave.
 */
export function dragValue(start: number, dy: number, options: DragOptions): number {
  const { min, max, scale = "linear", travel = DRAG_TRAVEL, fine = false } = options;
  const delta = -dy / travel / (fine ? 10 : 1);
  const next = fromFraction(toFraction(start, min, max, scale) + delta, min, max, scale);
  return settle(next, options);
}

export type WheelOptions = Bounds & { scale?: Scale; coarse?: boolean };

/**
 * One wheel notch. Any delta counts as one notch, because a trackpad reports a
 * stream of tiny ones and a mouse a few large ones, and both mean "a bit
 * more". Linear controls move one step (ten when coarse); logarithmic ones a
 * hundredth of their travel (a tenth when coarse).
 */
export function wheelValue(value: number, deltaY: number, options: WheelOptions): number {
  if (!deltaY) return value;
  const direction = deltaY < 0 ? 1 : -1;
  const { min, max, step, scale = "linear", coarse = false } = options;
  if (scale === "log") {
    const moved = toFraction(value, min, max, "log") + direction * (coarse ? 0.1 : 0.01);
    return settle(fromFraction(moved, min, max, "log"), options);
  }
  return settle(value + direction * (step || (max - min) / 100) * (coarse ? 10 : 1), { min, max, step });
}
