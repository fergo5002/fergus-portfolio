/**
 * The beam hook: drawing with the electron gun instead of the page.
 *
 * AGENTS.md's rule for the phosphor is that nothing writes light straight to
 * the screen. Emitters deposit energy into the persistence buffer and let it
 * decay. This is that rule's door for anything that wants to draw a line: the
 * boot's trace of the mark today, and whatever draws with the beam after it.
 *
 * The contract, all on `SystemFrame`:
 *
 *  - `beamPts`: the polyline the beam swept since the sim pass last read it,
 *    as flat x,y pairs in 0..1 viewport space, y down, up to `MAX_BEAM_POINTS`.
 *  - `beamCount`: how many of those points are live. 0 is off; 1 is a beam
 *    sitting still, which comes out as a dot.
 *  - `beamGain`: how much light to lay down along it, from `beamGainFor`, which
 *    is where the frame-rate normalisation happens. The shader multiplies by
 *    it and nothing else, and in particular not by `uEmit`.
 *
 * `PhosphorScreen` reads the three once a frame, deposits a capsule of energy
 * around the polyline into the sim buffer's energy channel (never burn-in), and
 * clears them with `clearBeam`. A writer that runs faster than the tube draws
 * (the tube runs at 30fps on a phone) should therefore extend what is still
 * there when `beamCount` is not 0, and start afresh when it is, so no part of a
 * sweep is lost between two draws.
 */

import { MAX_BEAM_POINTS } from "./system";
import type { SystemFrame } from "./system";

export { MAX_BEAM_POINTS };

/**
 * The capsule's radius, in screen heights. The shader measures distance with
 * x stretched by the aspect ratio, so this is the same on a portrait phone as
 * on a wide monitor. The kernel is `exp(-(d / BEAM_RADIUS)^2)`, so this is where
 * the glow has fallen to about a third.
 */
export const BEAM_RADIUS = 0.011;

/**
 * Light laid down per millisecond of beam-on time, per screen height of path.
 * Solved backwards from the trail it should leave: along a line drawn at the
 * desktop mark's speed (about 0.00046 screen heights a millisecond) the energy
 * settles near 0.75, under the buffer's clamp at 1.0 so the line keeps a
 * brightness rather than a ceiling, while the corners, where the beam sits
 * still for a moment, are allowed to reach it. Checked on real pixels with
 * `gl.readPixels` in `scripts/boot-check.mjs`, not by eye.
 */
export const BEAM_GAIN = 0.00035;

export type BeamPoint = { x: number; y: number };
type BeamFrame = Pick<SystemFrame, "beamPts" | "beamCount" | "beamGain">;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Replace the beam's path. Keeps the newest points if handed too many. */
export function writeBeam(f: BeamFrame, pts: readonly BeamPoint[], gain: number): void {
  const n = Math.min(MAX_BEAM_POINTS, pts.length);
  const from = pts.length - n;
  for (let i = 0; i < MAX_BEAM_POINTS; i++) {
    const p = i < n ? pts[from + i] : null;
    f.beamPts[i * 2] = p ? clamp01(p.x) : 0;
    f.beamPts[i * 2 + 1] = p ? clamp01(p.y) : 0;
  }
  f.beamCount = n;
  f.beamGain = n > 0 && Number.isFinite(gain) ? Math.max(0, gain) : 0;
}

/** Switch the beam off. The sim pass calls this once it has deposited a path. */
export function clearBeam(f: BeamFrame): void {
  f.beamPts.fill(0);
  f.beamCount = 0;
  f.beamGain = 0;
}

/** The live points, for a writer extending a path the tube has not read yet. */
export function readBeam(f: BeamFrame): BeamPoint[] {
  const out: BeamPoint[] = [];
  for (let i = 0; i < f.beamCount; i++) out.push({ x: f.beamPts[i * 2], y: f.beamPts[i * 2 + 1] });
  return out;
}

/** A polyline's length in screen heights, x stretched by `aspect` (width / height) as the shader does. */
export function beamLength(pts: readonly BeamPoint[], aspect: number): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot((pts[i].x - pts[i - 1].x) * aspect, pts[i].y - pts[i - 1].y);
  }
  return len;
}

/**
 * The gain for a path the beam swept in `spanMs` over `length` screen heights.
 *
 * Energy goes in proportion to the time the gun was on, so the same line gets
 * the same light at 30fps as at 165. It is spread over the length swept plus
 * the width of the capsule's two rounded ends (`sqrt(pi) * BEAM_RADIUS`, their
 * gaussian integral), because consecutive frames' capsules share an end and
 * would otherwise count it twice, which reads as beads along the trail. The
 * result is energy per unit length in proportion to one over the beam's speed,
 * which is how a real one behaves: slow means bright.
 */
export function beamGainFor(spanMs: number, length: number): number {
  if (!(spanMs > 0)) return 0;
  return (BEAM_GAIN * spanMs) / (Math.max(0, length) + Math.sqrt(Math.PI) * BEAM_RADIUS);
}

/**
 * The shader's kernel, ported line for line so the normalisation above can be
 * tested: `exp(-(d / BEAM_RADIUS)^2)`, where `d` is the aspect-corrected
 * distance from (px, py) to the nearest point of the polyline.
 */
export function beamDeposit(px: number, py: number, pts: readonly BeamPoint[], aspect: number): number {
  if (pts.length === 0) return 0;
  const qx = px * aspect;
  let ax = pts[0].x * aspect;
  let ay = pts[0].y;
  let d = Math.hypot(qx - ax, py - ay);
  for (let i = 1; i < pts.length; i++) {
    const bx = pts[i].x * aspect;
    const by = pts[i].y;
    const vx = bx - ax;
    const vy = by - ay;
    const h = Math.min(1, Math.max(0, ((qx - ax) * vx + (py - ay) * vy) / Math.max(vx * vx + vy * vy, 1e-8)));
    d = Math.min(d, Math.hypot(qx - ax - vx * h, py - ay - vy * h));
    ax = bx;
    ay = by;
  }
  const k = d / BEAM_RADIUS;
  return Math.exp(-k * k);
}
