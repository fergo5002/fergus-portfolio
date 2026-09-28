import { describe, it, expect } from "vitest";
import { bootFloorMs, bootPhases, bootTimeline, FULL_BOOT, PHONE_BOOT } from "./boot";
import type { BootProfile } from "./boot";
import {
  BEAM_FOLD,
  BEAM_GAIN,
  BEAM_RADIUS,
  MAX_BEAM_POINTS,
  beamHoldGain,
  beamLength,
} from "./beam";
import type { BeamPoint } from "./beam";
import { markPointIn, markStrokePoints, markTraceAt } from "./mark";
import { BEAM_WRITER, writeBootBeam } from "./boot-beam";
import type { BeamWriter, Box } from "./boot-beam";

const VW = 1440;
const VH = 900;
const MARK: Box = { left: 610, top: 369, width: 220, height: (220 * 28) / 38 };
const SCREEN: Box = { left: 200, top: 0, width: 1040, height: 3200 };

type Deposit = { pts: BeamPoint[]; gain: number; phase: string; at: number };

/**
 * One boot, frame by frame, with a tube that takes the pending path every
 * `tubeEvery` frames. The order inside a frame is the real one: PhosphorScreen
 * subscribed to the frame clock first, so the tube draws (and takes what was
 * written last frame) before BootSequence writes this frame's path.
 */
function simulate(profile: BootProfile, fps = 60, tubeEvery = 1, startAt = 0) {
  let writer: BeamWriter = BEAM_WRITER;
  let pending: BeamPoint[] = [];
  let pendingGain = 0;
  let pendingPhase = "";
  const deposits: Deposit[] = [];
  const dt = 1000 / fps;
  let n = 0;
  for (let e = startAt; e <= bootFloorMs(profile) + 3 * dt; e += dt, n++) {
    if (n % tubeEvery === 0 && pending.length) {
      deposits.push({ pts: pending, gain: pendingGain, phase: pendingPhase, at: e });
      pending = [];
    }
    const snap = bootTimeline(profile, e);
    const out = writeBootBeam(writer, snap, {
      now: e,
      traceMs: profile.traceMs,
      mark: MARK,
      screen: SCREEN,
      vw: VW,
      vh: VH,
      pending,
    });
    writer = out.writer;
    if (out.pts) {
      pending = out.pts;
      pendingGain = out.gain;
      pendingPhase = snap.phase;
    }
  }
  return { deposits, writer };
}

const toView = (p: { x: number; y: number }) => {
  const q = markPointIn(p, MARK);
  return { x: q.x / VW, y: q.y / VH };
};
const STROKES = markStrokePoints().map((s) => s.map(toView));

/** Distance in CSS pixels from a point to a polyline. */
function distPx(p: BeamPoint, line: BeamPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[Math.min(i + 1, line.length - 1)];
    const ax = a.x * VW, ay = a.y * VH, bx = b.x * VW, by = b.y * VH;
    const px = p.x * VW, py = p.y * VH;
    const vx = bx - ax, vy = by - ay;
    const h = Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / Math.max(vx * vx + vy * vy, 1e-9)));
    best = Math.min(best, Math.hypot(px - ax - vx * h, py - ay - vy * h));
  }
  return best;
}

/** Points every pixel or so along a polyline. */
function samples(line: BeamPoint[]): BeamPoint[] {
  const out: BeamPoint[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const steps = Math.max(1, Math.ceil(Math.hypot((b.x - a.x) * VW, (b.y - a.y) * VH)));
    for (let s = 1; s <= steps; s++) out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
  }
  return out;
}

const onStroke = (p: BeamPoint) => Math.min(...STROKES.map((s) => distPx(p, s)));

describe.each([
  ["full, 60fps tube", FULL_BOOT, 60, 1, 4],
  ["full, 30fps tube", FULL_BOOT, 60, 2, 4],
  ["phone, 30fps tube", PHONE_BOOT, 60, 2, 3],
  ["full, 144Hz", FULL_BOOT, 144, 1, 4],
  // Software WebGL in headless Chromium: frames 80 to 200ms apart, long enough
  // for one frame's sweep to cross the whole blanked move between strokes.
  ["full, starved at 12fps", FULL_BOOT, 12, 1, 2],
  ["phone, starved at 10fps", PHONE_BOOT, 10, 1, 1],
] as const)("the boot's beam (%s)", (_name, profile, fps, tubeEvery, minHolds) => {
  const { deposits } = simulate(profile, fps, tubeEvery);
  const phases = bootPhases(profile);
  const traceStart = phases.find((s) => s.phase === "trace")!.start;
  const byPhase = (p: string) => deposits.filter((d) => d.phase === p);

  it("draws nothing before the trace", () => {
    expect(deposits.every((d) => d.at > traceStart)).toBe(true);
  });

  it("never hands the tube more points than it reads", () => {
    for (const d of deposits) expect(d.pts.length).toBeLessThanOrEqual(MAX_BEAM_POINTS);
  });

  it("traces only the mark's strokes, never the blanked move between them", () => {
    expect(byPhase("trace").length).toBeGreaterThan(5);
    for (const d of byPhase("trace").concat(byPhase("ready"))) {
      for (const p of samples(d.pts)) expect(onStroke(p), JSON.stringify(p)).toBeLessThan(0.5);
    }
  });

  it("leaves no gap along the strokes", () => {
    const traced = byPhase("trace").concat(byPhase("ready"));
    for (const stroke of STROKES) {
      for (const p of samples(stroke)) {
        const near = Math.min(...traced.map((d) => distPx(p, d.pts)));
        expect(near, JSON.stringify(p)).toBeLessThan(1);
      }
    }
  });

  it("puts down light for exactly the time the gun was on", () => {
    // gain = BEAM_GAIN * litMs / (length + sqrt(pi) * radius), so the lit time
    // each deposit carries can be read back and summed.
    const aspect = VW / VH;
    const lit = byPhase("trace").reduce(
      (ms, d) => ms + (d.gain * (beamLength(d.pts, aspect) + Math.sqrt(Math.PI) * BEAM_RADIUS)) / BEAM_GAIN,
      0,
    );
    let on = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (markTraceAt((i + 0.5) / N).lit) on++;
    const expected = (on / N) * profile.traceMs;
    // Within two frames: the end of the trace can land in the next phase.
    expect(Math.abs(lit - expected)).toBeLessThan((2 * 1000) / fps);
  });

  /** Which whole stroke a deposit is, or -1 for part of one. */
  const strokeOf = (d: Deposit) =>
    STROKES.findIndex((s) => s.length === d.pts.length && s.every((q, i) => distPx(q, [d.pts[i]]) < 1e-6));

  it("holds the finished mark by retracing each stroke in turn", () => {
    const holds = byPhase("ready").map(strokeOf).filter((k) => k >= 0);
    expect(holds.length).toBeGreaterThanOrEqual(minHolds);
    for (let i = 1; i < holds.length; i++) expect(holds[i]).not.toBe(holds[i - 1]);
  });

  it("sizes each retrace from the time since that stroke was last put down", () => {
    // Written the frame the tube took the last path, so the interval between
    // writes is the interval between deposits, whatever the tube's cadence.
    const last = new Map<number, number>();
    let checked = 0;
    for (const d of byPhase("ready")) {
      const k = strokeOf(d);
      if (k < 0) continue;
      if (last.has(k)) {
        expect(d.gain).toBeCloseTo(beamHoldGain(d.at - last.get(k)!), 9);
        checked++;
      }
      last.set(k, d.at);
    }
    expect(checked).toBeGreaterThanOrEqual(minHolds - 2);
  });

  it("folds to a horizontal line through the mark, widening to the page's column", () => {
    const fold = byPhase("collapse");
    expect(fold.length).toBeGreaterThanOrEqual(1);
    const cy = (MARK.top + MARK.height / 2) / VH;
    let prevWidth = 0;
    for (const d of fold) {
      expect(d.pts).toHaveLength(2);
      expect(d.pts[0].y).toBeCloseTo(cy, 9);
      expect(d.pts[1].y).toBeCloseTo(cy, 9);
      const width = (d.pts[1].x - d.pts[0].x) * VW;
      expect(width).toBeGreaterThanOrEqual(MARK.width - 1e-6);
      expect(width).toBeLessThanOrEqual(SCREEN.width + 1e-6);
      expect(width).toBeGreaterThanOrEqual(prevWidth);
      prevWidth = width;
    }
    // Aiming past the clamp: the line a collapsing raster leaves is the brightest thing on the tube.
    expect(fold[fold.length - 1].gain).toBeCloseTo(beamHoldGain((tubeEvery * 1000) / fps, BEAM_FOLD), 6);
  });

  it("stops drawing once the boot is done", () => {
    expect(deposits.every((d) => d.phase !== "done")).toBe(true);
  });
});

describe("one slow frame that spans the whole blanked move", () => {
  // Starved frames (software WebGL, a busy phone) can carry the beam from the
  // end of the chevron, across the move with the gun off, into the caret. One
  // polyline cannot hold both strokes without lighting the move between them.
  const traceStart = bootPhases(FULL_BOOT).find((s) => s.phase === "trace")!.start;
  const us = Array.from({ length: 10_001 }, (_, i) => i / 10_000);
  const blankStart = us.find((u) => !markTraceAt(u).lit)!;
  const blankEnd = us.find((u) => u > blankStart && markTraceAt(u).lit)!;
  const env = (now: number, pending: BeamPoint[] = []) => ({
    now, traceMs: FULL_BOOT.traceMs, mark: MARK, screen: SCREEN, vw: VW, vh: VH, pending,
  });
  const at = (u: number) => traceStart + u * FULL_BOOT.traceMs;

  it("writes the end of the chevron, then the caret on the next frame, and never the move", () => {
    const w: BeamWriter = { ...BEAM_WRITER, u: blankStart - 0.02, at: at(blankStart - 0.02) };
    const now = at(blankEnd + 0.02);
    const first = writeBootBeam(w, bootTimeline(FULL_BOOT, now), env(now));
    expect(first.pts).not.toBeNull();
    for (const p of samples(first.pts!)) expect(distPx(p, STROKES[0])).toBeLessThan(0.5);
    expect(first.writer.u).toBeLessThanOrEqual(blankEnd);

    const second = writeBootBeam(first.writer, bootTimeline(FULL_BOOT, now + 1), env(now + 1));
    expect(second.pts).not.toBeNull();
    for (const p of samples(second.pts!)) expect(distPx(p, STROKES[1])).toBeLessThan(0.5);
  });
});

describe("a boot the frame clock skips through", () => {
  it("abandons the trace and folds if the frames only arrive at the collapse", () => {
    // A tab that comes back late. The words and the mark catch up to where they
    // should be; the beam does not replay a trace nobody saw.
    const phases = bootPhases(FULL_BOOT);
    const collapse = phases.find((s) => s.phase === "collapse")!;
    const { deposits } = simulate(FULL_BOOT, 60, 1, collapse.start + 1);
    expect(deposits.length).toBeGreaterThan(0);
    expect(deposits.every((d) => d.phase === "collapse" && d.pts.length === 2)).toBe(true);
  });

  it("waits for the tube rather than overwrite a path it has not drawn", () => {
    const traceStart = bootPhases(FULL_BOOT).find((s) => s.phase === "trace")!.start;
    const env = { traceMs: FULL_BOOT.traceMs, mark: MARK, screen: SCREEN, vw: VW, vh: VH };
    // Somewhere in the blanked move: whatever is written next starts a new stroke.
    const blankU = Array.from({ length: 1000 }, (_, i) => i / 1000).find((u) => !markTraceAt(u).lit)!;
    const w: BeamWriter = { ...BEAM_WRITER, u: blankU };
    const later = traceStart + FULL_BOOT.traceMs * 0.95;
    const stale = [{ x: 0.1, y: 0.1 }];
    const out = writeBootBeam(w, bootTimeline(FULL_BOOT, later), { ...env, now: later, pending: stale });
    expect(out.pts).toBeNull();
    expect(out.writer.u).toBe(blankU);
    const free = writeBootBeam(w, bootTimeline(FULL_BOOT, later), { ...env, now: later, pending: [] });
    expect(free.pts).not.toBeNull();
  });
});
