/**
 * What the boot draws with the beam, one frame at a time.
 *
 * The boot writes three things into the phosphor through `lib/beam.ts`, and
 * this decides which one a given frame gets:
 *
 *  - **the trace**: the beam moving along the mark, depositing the path it
 *    swept since the last frame, lit in proportion to the time the gun was on,
 *    so the line glows brightest where the beam has just been;
 *  - **the hold**: once drawn, the mark is kept lit the only way a vector
 *    display can keep anything lit, by retracing it, one stroke per visit;
 *  - **the fold**: the picture collapsing to a single bright line through the
 *    mark, widening to the page's column, which is the line the page opens out
 *    of. After it the beam stops, and what the phosphor still holds (the mark,
 *    the line) fades on its own as the page comes up.
 *
 * The tube reads one polyline a frame and clears it once drawn, and it can draw
 * less often than the frame clock ticks (30fps on a phone). So a writer never
 * overwrites a path the tube has not taken: it extends it when the beam has
 * carried straight on, and otherwise waits a frame. Pure over its inputs, so
 * `lib/boot-beam.test.ts` can run a whole boot against a simulated tube.
 */

import { BEAM_FOLD, MAX_BEAM_POINTS, beamGainFor, beamHoldGain, beamLength } from "./beam";
import type { BeamPoint } from "./beam";
import { BOOT_PHASES } from "./boot";
import type { BootSnapshot } from "./boot";
import { markPointIn, markRuns, markStrokePoints } from "./mark";

export type Box = { left: number; top: number; width: number; height: number };

export type BeamWriter = {
  /** How far along the trace (0..1) the beam has been written. */
  readonly u: number;
  /** Lit milliseconds carried by the path the tube has not taken yet. */
  readonly litMs: number;
  /** The stroke the hold retraces next. */
  readonly next: number;
  /** When each stroke, then the fold line, was last written, on the frame clock. */
  readonly last: readonly number[];
  /** The frame clock at the previous call. */
  readonly at: number;
};

export const BEAM_WRITER: BeamWriter = { u: 0, litMs: 0, next: 0, last: [-1, -1, -1], at: -1 };

export type BeamEnv = {
  /** The frame clock, in milliseconds. */
  readonly now: number;
  readonly traceMs: number;
  /** Where the mark is drawn, and the page column the fold widens to, in CSS pixels. */
  readonly mark: Box;
  readonly screen: Box;
  readonly vw: number;
  readonly vh: number;
  /** What the tube has not taken yet (`readBeam`). */
  readonly pending: readonly BeamPoint[];
};

export type BeamStep = { writer: BeamWriter; pts: BeamPoint[] | null; gain: number };

const TRACE = BOOT_PHASES.indexOf("trace");
const READY = BOOT_PHASES.indexOf("ready");
const COLLAPSE = BOOT_PHASES.indexOf("collapse");
const FOLD = 2;
/** A visit after a long gap tops the line up to its level and no further. */
const MAX_PERIOD_MS = 1000;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function writeBootBeam(w: BeamWriter, snap: BootSnapshot, env: BeamEnv): BeamStep {
  const idle = (writer: BeamWriter): BeamStep => ({ writer: { ...writer, at: env.now }, pts: null, gain: 0 });
  const wrote = (writer: Partial<BeamWriter>, slot: number, pts: BeamPoint[], gain: number): BeamStep => {
    const last = [...w.last];
    last[slot] = env.now;
    return { writer: { ...w, ...writer, last, at: env.now }, pts, gain };
  };
  const since = (slot: number) =>
    Math.min(MAX_PERIOD_MS, env.now - (w.last[slot] >= 0 ? w.last[slot] : w.at >= 0 ? w.at : env.now));

  if (snap.step < TRACE || snap.done) return idle(w);
  const busy = env.pending.length > 0;
  const toView = (p: BeamPoint): BeamPoint => {
    const q = markPointIn(p, env.mark);
    return { x: q.x / env.vw, y: q.y / env.vh };
  };

  // The trace, including whatever of it a late frame has not written yet.
  if (snap.step <= READY && w.u < 1) {
    const runs = markRuns(w.u, snap.trace);
    // Nothing lit since the last frame (the gun is off for the move between
    // strokes, or no time has passed): just move on.
    if (runs.length === 0) return idle({ ...w, u: Math.max(w.u, snap.trace) });
    const run = runs[0];
    const pts = run.pts.map(toView);
    const continues = busy && run.from === w.u;
    const path = continues ? [...env.pending, ...pts.slice(1)] : pts;
    // A path the tube has not drawn is never overwritten, and never grown past
    // what it reads: the next frame, once it has, picks up from here.
    if ((busy && !continues) || path.length > MAX_BEAM_POINTS) return idle(w);
    const litMs = (continues ? w.litMs : 0) + (run.to - run.from) * env.traceMs;
    const aspect = env.vw / Math.max(1, env.vh);
    // Only one run a frame: if this frame's sweep crossed the blanked move, the
    // rest is written next frame rather than joined across the gap.
    const u = runs.length > 1 ? run.to : snap.trace;
    return wrote({ u, litMs }, run.stroke, path, beamGainFor(litMs, beamLength(path, aspect)));
  }

  // The hold: retrace one whole stroke per visit, once the tube has taken the last.
  if (snap.step === READY) {
    if (busy) return idle(w);
    const strokes = markStrokePoints();
    const k = w.next % strokes.length;
    return wrote({ next: (k + 1) % strokes.length }, k, strokes[k].map(toView), beamHoldGain(since(k)));
  }

  // The fold: one line through the mark's centre, each end moving out from the
  // mark's edge to the page column's. The trace is over whatever it reached.
  if (snap.step === COLLAPSE) {
    if (busy) return idle({ ...w, u: 1 });
    const y = (env.mark.top + env.mark.height / 2) / env.vh;
    const x0 = lerp(env.mark.left, env.screen.left, snap.collapse) / env.vw;
    const x1 = lerp(env.mark.left + env.mark.width, env.screen.left + env.screen.width, snap.collapse) / env.vw;
    const line = [{ x: x0, y }, { x: x1, y }];
    return wrote({ u: 1 }, FOLD, line, beamHoldGain(since(FOLD), BEAM_FOLD));
  }

  return idle(w);
}
