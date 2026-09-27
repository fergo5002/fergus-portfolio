/**
 * The screensaver's figure: an oscilloscope in XY mode, drawn by the beam.
 *
 * Left alone, the tube stops showing the page and the beam traces a Lissajous
 * figure through the phosphor, `x = sin(a·θ + δ)`, `y = sin(b·θ)`, the shape two
 * tones make on a scope. The ratio `a:b` steps through a short list, holding
 * each for a while, and the phase `δ` drifts, so the figure slowly turns
 * rather than sitting still. Nothing here is drawn by the page: it goes in
 * through `lib/beam.ts` like the boot's trace of the mark, and the phosphor's
 * own persistence is what makes a moving spot read as a figure.
 *
 * Pure over its inputs, so `lib/lissajous.test.ts` runs the whole writer at any
 * frame rate without a tube.
 */

import { BEAM_RADIUS, MAX_BEAM_POINTS, beamHoldGain, beamLength } from "./beam";
import type { BeamPoint } from "./beam";

/** How long the beam takes to go once round the figure. Short enough that the persistence still holds most of it. */
export const SAVER_PERIOD_MS = 450;
/** The level a point on the figure is topped up to each time the beam passes. */
export const SAVER_LEVEL = 0.42;
/** The ratios, in the order the saver tunes through them. */
export const SAVER_RATIOS: readonly (readonly [number, number])[] = [
  [3, 2],
  [1, 1],
  [3, 4],
  [1, 2],
  [5, 4],
  [2, 3],
];
/** How long each ratio holds. */
export const SAVER_HOLD_MS = 14_000;
/** One whole turn of the phase. */
export const SAVER_SPIN_MS = 24_000;
/**
 * How far past the last stroke's end the next one starts, in screen heights.
 * Two strokes that meet deposit a full capsule end each on the same spot,
 * which reads as a bead at every frame boundary. Offset by about 1.67 radii,
 * the two gaussian ends sum to within a few percent of the line between them.
 */
export const SAVER_JOIN = 1.67 * BEAM_RADIUS;
/** A frame further than this from the last write means the tab was away: blank and jump. */
const MAX_GAP_MS = 250;
/** A join never skips more of the curve than this, even where the beam all but stops. */
const MAX_JOIN_THETA = 0.25;
/** Where the beam is brighter because it is slower, and dimmer where faster, within these bounds. */
const WEIGHT_MIN = 0.6;
const WEIGHT_MAX = 1.8;

const TAU = Math.PI * 2;

export type Figure = { index: number; a: number; b: number; delta: number };

/** The figure on screen `elapsedMs` into the saver. */
export function figureAt(elapsedMs: number): Figure {
  const t = Math.max(0, elapsedMs);
  const index = Math.floor(t / SAVER_HOLD_MS) % SAVER_RATIOS.length;
  const [a, b] = SAVER_RATIOS[index];
  return { index, a, b, delta: (TAU * t) / SAVER_SPIN_MS };
}

/** The figure's half-height, in screen heights: as large as the narrower side allows. */
function amplitude(aspect: number): number {
  return Math.min(0.3, 0.4 * aspect);
}

/** A point of the figure in 0..1 viewport space, y down, as `lib/beam.ts` takes it. */
export function lissajousPoint(theta: number, fig: Figure, aspect: number): BeamPoint {
  const amp = amplitude(aspect);
  return {
    x: 0.5 + (amp / aspect) * Math.sin(fig.a * theta + fig.delta),
    y: 0.5 + amp * Math.sin(fig.b * theta),
  };
}

/**
 * Where the next stroke starts: the point `SAVER_JOIN` on from the last one's
 * end, measured straight across as the shader measures distance. Solved by
 * bisection rather than from the speed at the end, because the speed can
 * double within the join where the figure turns. Where the beam all but stops,
 * the skip is capped instead.
 */
function joinFrom(theta: number, fig: Figure, aspect: number): number {
  const from = lissajousPoint(theta, fig, aspect);
  const gap = (t: number) => beamLength([from, lissajousPoint(t, fig, aspect)], aspect);
  let lo = theta;
  let hi = theta + MAX_JOIN_THETA;
  if (gap(hi) <= SAVER_JOIN) return hi;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) < SAVER_JOIN) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The beam's speed along the figure, in screen heights per radian of θ, with
 * x measured the way the shader measures it (stretched by the aspect), which
 * makes it the same on every shape of screen.
 */
function speedAt(theta: number, fig: Figure, aspect: number): number {
  const amp = amplitude(aspect);
  return amp * Math.hypot(fig.a * Math.cos(fig.a * theta + fig.delta), fig.b * Math.cos(fig.b * theta));
}

/** The figure's mean speed over one turn, sampled. */
function meanSpeed(fig: Figure, aspect: number): number {
  let sum = 0;
  const n = 128;
  for (let i = 0; i < n; i++) sum += speedAt((i / n) * TAU, fig, aspect);
  return sum / n;
}

export type SaverWriter = {
  /** Where on the figure the last stroke ended. */
  readonly theta: number;
  /** The ratio it was drawn in. */
  readonly index: number;
  /** When it was written, in milliseconds into the saver. */
  readonly at: number;
};

export type SaverEnv = {
  readonly elapsedMs: number;
  /** Viewport width over height. */
  readonly aspect: number;
  /** What the tube has not drawn yet (`readBeam`). */
  readonly pending: readonly BeamPoint[];
};

export type SaverStep = { writer: SaverWriter; pts: BeamPoint[] | null; gain: number };

/**
 * One frame of the saver: the stroke the beam swept since the last one, and
 * how much light it lays down.
 *
 * The gain is `beamHoldGain` for the figure's period, the same top-up the boot
 * uses to hold the mark: every part of the figure is passed once a period
 * whatever the frame rate, so each pass puts back what decayed since the last
 * and the figure sits at `SAVER_LEVEL` at 30 frames a second or 165. Weighted
 * by speed within bounds, so the figure glows at its turning points, where a
 * real scope's beam slows, rather than drawing as a flat line.
 */
export function saverStep(w: SaverWriter | null, env: SaverEnv): SaverStep {
  const fig = figureAt(env.elapsedMs);
  const target = (TAU * env.elapsedMs) / SAVER_PERIOD_MS;
  // The beam moves blanked: at the start, across a change of ratio, and after
  // a gap long enough that drawing the missed sweep would be a scrawl.
  if (!w || w.index !== fig.index || env.elapsedMs - w.at > MAX_GAP_MS) {
    return { writer: { theta: target, index: fig.index, at: env.elapsedMs }, pts: null, gain: 0 };
  }
  // A path the tube has not taken is never overwritten: wait, and the next
  // frame sweeps from the same place.
  if (env.pending.length > 0) return { writer: w, pts: null, gain: 0 };

  const start = joinFrom(w.theta, fig, env.aspect);
  if (start >= target) return { writer: w, pts: null, gain: 0 };

  const pts: BeamPoint[] = [];
  for (let i = 0; i < MAX_BEAM_POINTS; i++) {
    pts.push(lissajousPoint(start + ((target - start) * i) / (MAX_BEAM_POINTS - 1), fig, env.aspect));
  }
  const strokeSpeed = beamLength(pts, env.aspect) / (target - start);
  const weight = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, meanSpeed(fig, env.aspect) / Math.max(strokeSpeed, 1e-6)));
  return {
    writer: { theta: target, index: fig.index, at: env.elapsedMs },
    pts,
    gain: beamHoldGain(SAVER_PERIOD_MS, SAVER_LEVEL) * weight,
  };
}
