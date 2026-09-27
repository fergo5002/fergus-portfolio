/**
 * The site's mark, as a beam would draw it.
 *
 * `app/icon.svg` is a shell prompt: a chevron and an amber caret, `>_`. At the
 * end of the boot the tube draws it the way a vector display draws anything,
 * with the beam moving along the strokes and the gun switched off for the move
 * between them. So the mark is one continuous polyline, every segment starting
 * where the last one ended, with the blanked move flagged rather than skipped:
 * the beam still has to travel there, it just lights nothing on the way.
 *
 * Coordinates are the icon's own 64-unit grid divided by 64, so `markPath()`
 * sits inside 0..1 and `lib/mark.test.ts` can check it against the icon file.
 * `markTraceAt` and `markSweep` put the beam somewhere along it at a given
 * moment. Both are pure; `BootSequence` turns their output into an SVG dash and
 * a deposit into the phosphor.
 */

/** One vertex. `draw` says whether the segment arriving here is lit. */
export type MarkVertex = { readonly x: number; readonly y: number; readonly draw: boolean };
export type MarkPoint = { x: number; y: number };

const U = 64;

const VERTICES: readonly MarkVertex[] = [
  // The chevron, in one stroke, the way the icon draws it.
  { x: 15 / U, y: 21 / U, draw: false },
  { x: 27 / U, y: 32 / U, draw: true },
  { x: 15 / U, y: 43 / U, draw: true },
  // Gun off, across to the caret.
  { x: 32 / U, y: 40 / U, draw: false },
  // The caret: the icon's 18 by 6 bar, drawn as its centre line at that width.
  { x: 50 / U, y: 40 / U, draw: true },
];

/** The mark as one continuous polyline in 0..1, starting with the gun off. */
export function markPath(): readonly MarkVertex[] {
  return VERTICES;
}

/**
 * The part of the icon's 64-unit grid the mark occupies, stroke width included
 * (the chevron's round caps reach three units past its ends). The SVG uses it
 * as its view box, so a point in the grid maps linearly onto the element.
 */
export const MARK_VIEWBOX = { x: 12, y: 18, w: 38, h: 28 } as const;

/** Each lit stroke as an SVG path in the icon's grid, for `pathLength="1"` dashes. */
export function markStrokePaths(): string[] {
  return strokes().map((s) =>
    s.map((i, k) => `${k === 0 ? "M" : "L"}${VERTICES[i].x * U} ${VERTICES[i].y * U}`).join(" "),
  );
}

/** Vertex indices of each lit stroke. */
function strokes(): number[][] {
  const out: number[][] = [];
  let current: number[] | null = null;
  for (let i = 1; i < VERTICES.length; i++) {
    if (!VERTICES[i].draw) {
      current = null;
      continue;
    }
    if (!current) {
      current = [i - 1];
      out.push(current);
    }
    current.push(i);
  }
  return out;
}

/*
 * The timing. A vector display moves its beam at a steady rate along a line,
 * settles for a moment wherever it changes direction, and slews much faster
 * with the gun off. The settle is what makes a real vector display's corners
 * brighter than its lines, and it does the same here, because the beam deposits
 * light for as long as it sits still.
 */
const START_DWELL = 0.03;
const CORNER_DWELL = 0.05;
const END_DWELL = 0.02;
const BLANK_SPEED = 3;

type Step = {
  readonly from: number;
  readonly to: number;
  readonly lit: boolean;
  readonly start: number;
  readonly end: number;
  /** Which lit stroke this step belongs to, or -1 for the blanked move. */
  readonly stroke: number;
  /** Drawn length of its stroke completed before this step, and during it. */
  readonly before: number;
  readonly length: number;
};

const dist = (a: number, b: number) =>
  Math.hypot(VERTICES[b].x - VERTICES[a].x, VERTICES[b].y - VERTICES[a].y);

const PLAN = (() => {
  const s = strokes();
  type Raw = Omit<Step, "start" | "end"> & { dwell: number; travel: number };
  const raw: Raw[] = [];
  s.forEach((stroke, k) => {
    if (k > 0) {
      const a = s[k - 1][s[k - 1].length - 1];
      const b = stroke[0];
      raw.push({ from: a, to: b, lit: false, stroke: -1, before: 0, length: 0, dwell: 0, travel: dist(a, b) / BLANK_SPEED });
    }
    let drawn = 0;
    raw.push({ from: stroke[0], to: stroke[0], lit: true, stroke: k, before: 0, length: 0, dwell: START_DWELL, travel: 0 });
    for (let j = 1; j < stroke.length; j++) {
      if (j > 1) {
        const at = stroke[j - 1];
        raw.push({ from: at, to: at, lit: true, stroke: k, before: drawn, length: 0, dwell: CORNER_DWELL, travel: 0 });
      }
      const len = dist(stroke[j - 1], stroke[j]);
      raw.push({ from: stroke[j - 1], to: stroke[j], lit: true, stroke: k, before: drawn, length: len, dwell: 0, travel: len });
      drawn += len;
    }
    const end = stroke[stroke.length - 1];
    raw.push({ from: end, to: end, lit: true, stroke: k, before: drawn, length: 0, dwell: END_DWELL, travel: 0 });
  });
  const dwellTotal = raw.reduce((n, r) => n + r.dwell, 0);
  const travelTotal = raw.reduce((n, r) => n + r.travel, 0);
  let at = 0;
  const steps: Step[] = raw.map((r) => {
    const dur = r.dwell + (1 - dwellTotal) * (r.travel / travelTotal);
    const step = { from: r.from, to: r.to, lit: r.lit, stroke: r.stroke, before: r.before, length: r.length, start: at, end: at + dur };
    at += dur;
    return step;
  });
  // Float drift must not leave u = 1 past the last step.
  (steps[steps.length - 1] as { end: number }).end = 1;
  const strokeLengths = s.map((stroke) =>
    stroke.slice(1).reduce((n, v, j) => n + dist(stroke[j], v), 0),
  );
  return { steps, strokeLengths };
})();

function stepAt(u: number): Step {
  const { steps } = PLAN;
  for (const step of steps) if (u < step.end) return step;
  return steps[steps.length - 1];
}

function position(step: Step, u: number): MarkPoint {
  const a = VERTICES[step.from];
  const b = VERTICES[step.to];
  const span = step.end - step.start;
  const t = span > 0 ? (u - step.start) / span : 1;
  if (t <= 0) return { x: a.x, y: a.y };
  if (t >= 1) return { x: b.x, y: b.y };
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Where the beam is, whether the gun is on, and how much of each stroke is drawn, `u` of the way through. */
export function markTraceAt(u: number): MarkPoint & { lit: boolean; strokes: number[] } {
  const v = Math.min(1, Math.max(0, Number.isNaN(u) ? 0 : u));
  const step = stepAt(v);
  const head = position(step, v);
  const drawn = PLAN.strokeLengths.map((len, k) => {
    if (step.stroke < 0) return k < strokeOfBlank(step) ? 1 : 0;
    if (k < step.stroke) return 1;
    if (k > step.stroke) return 0;
    const span = step.end - step.start;
    const t = span > 0 ? Math.min(1, Math.max(0, (v - step.start) / span)) : 1;
    return Math.min(1, (step.before + step.length * t) / len);
  });
  return { x: head.x, y: head.y, lit: step.lit, strokes: drawn };
}

/** The blanked move after stroke k is followed by stroke k + 1. */
function strokeOfBlank(step: Step): number {
  const i = PLAN.steps.indexOf(step);
  return PLAN.steps.slice(i).find((s) => s.stroke >= 0)?.stroke ?? PLAN.strokeLengths.length;
}

/**
 * The lit path the beam swept between two moments, split wherever the gun was
 * off, corners included. A frame hands this to the phosphor, so a fast beam
 * leaves a continuous trail instead of a row of dots, and a beam sitting still
 * comes back as a single point.
 */
export function markSweep(u0: number, u1: number): MarkPoint[][] {
  const a = Math.max(0, u0);
  const b = Math.min(1, u1);
  if (!(b > a)) return [];
  const runs: MarkPoint[][] = [];
  let run: MarkPoint[] | null = null;
  const push = (p: MarkPoint) => {
    const last = run![run!.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) run!.push(p);
  };
  for (const step of PLAN.steps) {
    const start = Math.max(a, step.start);
    const end = Math.min(b, step.end);
    if (end <= start) continue;
    if (!step.lit) {
      run = null;
      continue;
    }
    if (!run) {
      run = [];
      runs.push(run);
      push(position(step, start));
    }
    push(position(step, end));
  }
  return runs.filter((r) => r.length > 0);
}
