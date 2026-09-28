/**
 * The performance pad's arithmetic. Left to right is brightness (the filter
 * cutoff), on a log scale because an ear hears a filter in ratios; bottom to
 * top is echo (the delay feedback). The Brightness and Echo knobs read the
 * same patch values, so `soundToPad` is how the puck follows a knob.
 *
 * `x` and `y` are 0 to 1 across the pad, `y` measured down from the top, the
 * way a pointer reports it.
 */

export const CUTOFF = { min: 150, max: 12000 } as const;
export const ECHO_MAX = 0.65;

export type TrailPoint = { x: number; y: number; t: number };

const unit = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function padToSound(x: number, y: number): { cutoff: number; delay: number } {
  return {
    cutoff: Math.round(CUTOFF.min * (CUTOFF.max / CUTOFF.min) ** unit(x)),
    delay: Number(((1 - unit(y)) * ECHO_MAX).toFixed(3)),
  };
}

export function soundToPad(cutoff: number, delay: number): { x: number; y: number } {
  const x = Math.log(Math.max(CUTOFF.min, cutoff) / CUTOFF.min) / Math.log(CUTOFF.max / CUTOFF.min);
  return { x: unit(x), y: unit(1 - delay / ECHO_MAX) };
}

export function padPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return { x: unit((clientX - rect.left) / rect.width), y: unit((clientY - rect.top) / rect.height) };
}

/** The newest `max` points, oldest first. */
export function extendTrail(trail: readonly TrailPoint[], point: TrailPoint, max = 32): TrailPoint[] {
  const next = [...trail, point];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** The points still glowing at `now`. */
export function liveTrail(trail: readonly TrailPoint[], now: number, life: number): TrailPoint[] {
  return trail.filter((p) => now - p.t < life);
}

/** A point's brightness at `age`: full at the finger, gone at the end of its life, eased like phosphor. */
export function trailAlpha(age: number, life: number): number {
  const left = 1 - age / life;
  return left <= 0 ? 0 : Math.min(1, left * left);
}
