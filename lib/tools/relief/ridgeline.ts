import { HOURS, WEEKS, type Field, type Point, type Polyline } from "./types";

/**
 * The year as a ridgeline: one ridge per week, stacked from week 1 at the
 * back (top of the sheet) to week 52 at the front (bottom), each ridge that
 * week's ground across the twenty-four hours, seen from low over the horizon.
 *
 * The height is the heightmap's `profile`: the same counts under the same
 * compression as the contours and the STL, smoothed along each day and never
 * across weeks, because a ridge is one week and blurring it into its
 * neighbours draws fifty-two copies of one line. Orthographic on purpose. A
 * perspective that shrank the back weeks would make the start of the year
 * look quieter than it was.
 *
 * Occlusion is geometry, not paint. `ridgelines` removes hidden lines itself,
 * front to back against a running skyline, so what comes out is only the
 * strokes a viewer can see. That is what lets the same polylines go to the
 * canvas with no fills and to a pen plotter, which cannot fill at all.
 *
 * Pure and colourless: the palette arrives in `draw.ts` through the guard.
 */

export type RidgeLayout = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  plotWidth: number;
  /** Between one week's baseline and the next. */
  spacing: number;
  /** How far a full-height hour (field value 1) rises above its baseline. */
  amplitude: number;
};

/** Six points an hour: under two pixels a step at desktop width, so the line reads as a curve. */
export const SAMPLES_PER_HOUR = 6;

/**
 * A full-height hour stands this many ridges tall, so a busy afternoon hides
 * the weeks behind it: tall enough to be terrain, short enough that the back
 * of the year still shows over the front. Judged on screenshots in all three
 * themes on 2026-09-27; ten read as silk rather than ground.
 */
export const PEAK_RIDGES = 14;
/** The gap between weeks as a share of the plot's width, so the terrain keeps its shape at any size. */
export const SPACING_SHARE = 0.0055;
/** Room under the front ridge for the hour labels. */
const AXIS_PX = 22;
/** The sky over the back ridge. The page's own display band sits above the canvas, so this is a hairline. */
const SKY_PX = 4;
/** The floor on a phone: below about three pixels neighbouring weeks merge into a band. */
const MIN_SPACING = 3.2;

export function ridgeLayout(input: {
  width: number;
  spacing: number;
  amplitude: number;
  padX: number;
  padTop: number;
  padBottom: number;
}): RidgeLayout {
  const { width, spacing, amplitude, padX, padTop, padBottom } = input;
  return {
    width,
    height: padTop + amplitude + (WEEKS - 1) * spacing + padBottom,
    padLeft: padX,
    padRight: padX,
    padTop,
    padBottom,
    plotWidth: Math.max(1, width - 2 * padX),
    spacing,
    amplitude,
  };
}

/** The screen's layout for a box `width` pixels wide. Everything scales with the width. */
export function ridgeGeometry(width: number): RidgeLayout {
  // Ten at least, so the "00" centred on midnight is not cut by the frame on a phone.
  const padX = Math.min(16, Math.max(10, Math.round(width * 0.02)));
  const plotWidth = Math.max(1, width - 2 * padX);
  const spacing = Math.max(MIN_SPACING, plotWidth * SPACING_SHARE);
  return ridgeLayout({
    width,
    spacing,
    amplitude: spacing * PEAK_RIDGES,
    padX,
    padTop: SKY_PX,
    padBottom: AXIS_PX,
  });
}

/** Where week `week` (1 to 52) stands on the sheet. */
export function baselineY(g: RidgeLayout, week: number): number {
  return g.padTop + g.amplitude + (week - 1) * g.spacing;
}

/** Hours run left to right, midnight to 23:00, like the contour plate's weeks. */
export function hourX(g: RidgeLayout, hour: number): number {
  return g.padLeft + (hour / (HOURS - 1)) * g.plotWidth;
}

export type Ridge = {
  /** 1 to 52. */
  week: number;
  baseline: number;
  /** The whole line, drawn or not, left to right. */
  points: Point[];
  /** The line's y at each whole hour, for the crosshair. */
  hourY: number[];
  /** Only what a viewer can see: the line with every stretch behind a nearer ridge removed. */
  visible: Polyline[];
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The field's height for one week at a fractional hour. Catmull-Rom through
 * the whole hours, so a peak stays on its hour and the line passes through
 * every sample; wrapped at midnight like the smoothing, because 23:00 is next
 * to 00:00. Clamped, because a cubic through a spike overshoots.
 */
function heightAt(field: Field, week: number, hour: number): number {
  const i = Math.floor(hour);
  const t = hour - i;
  const at = (h: number) => field[((h % HOURS) + HOURS) % HOURS][week];
  const p0 = at(i - 1);
  const p1 = at(i);
  if (t === 0) return clamp01(p1);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  const v =
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  return clamp01(v);
}

/** The y of an x-ordered polyline at `x`, reading forward from index `from`. */
function yAt(line: readonly Point[], x: number, from: number): { y: number; at: number } {
  let i = from;
  while (i < line.length - 2 && line[i + 1].x < x) i++;
  const a = line[i];
  const b = line[i + 1];
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return { y: a.y + t * (b.y - a.y), at: i };
}

/**
 * One ridge against the horizon of everything in front of it, segment by
 * segment. Both are polylines over the same span of x, so between their
 * merged breakpoints each is a straight line and they cross at most once:
 * the crossing is interpolated, the ridge is kept where it stands above the
 * horizon (smaller y), and the horizon comes back raised to include it.
 */
function clip(ridge: readonly Point[], horizon: readonly Point[]): { visible: Polyline[]; next: Point[] } {
  const merged: { x: number; r: number; h: number; sample: boolean }[] = [];
  let i = 0;
  let j = 0;
  let ri = 0;
  let hi = 0;
  while (i < ridge.length || j < horizon.length) {
    const xr = i < ridge.length ? ridge[i].x : Infinity;
    const xh = j < horizon.length ? horizon[j].x : Infinity;
    const x = Math.min(xr, xh);
    const r = yAt(ridge, x, ri);
    const h = yAt(horizon, x, hi);
    ri = r.at;
    hi = h.at;
    merged.push({ x, r: r.y, h: h.y, sample: xr === x });
    if (xr === x) i++;
    if (xh === x) j++;
  }

  const visible: Polyline[] = [];
  const next: Point[] = [];
  let run: Point[] | null = null;
  for (let k = 0; k < merged.length; k++) {
    const m = merged[k];
    const shown = m.r < m.h;
    if (k > 0) {
      const p = merged[k - 1];
      const d0 = p.r - p.h;
      const d1 = m.r - m.h;
      if (d0 < 0 !== d1 < 0 && d0 !== d1) {
        const t = d0 / (d0 - d1);
        const cross = { x: p.x + t * (m.x - p.x), y: p.r + t * (m.r - p.r) };
        next.push(cross);
        if (run) {
          run.push(cross);
          if (run.length > 1) visible.push(run);
          run = null;
        } else {
          run = [cross];
        }
      }
    }
    if (shown) {
      if (!run) run = [];
      // A horizon-only breakpoint lies on the ridge's straight segment, so it adds nothing to draw.
      if (m.sample || k === merged.length - 1) run.push({ x: m.x, y: m.r });
    }
    next.push({ x: m.x, y: Math.min(m.r, m.h) });
  }
  if (run && run.length > 1) visible.push(run);
  return { visible, next };
}

/**
 * Every ridge, ordered back (week 1) to front (week 52), with hidden lines
 * removed.
 *
 * The horizon is the highest line in front so far (smallest y, since y grows
 * down the sheet), kept as an exact polyline with every crossing in it.
 * Walking from the front, each ridge is clipped to where it stands above that
 * horizon, segment by segment, with the crossing points interpolated, then
 * the horizon is raised to include it. So two drawn ridges may touch but can
 * never cross, and nothing above the horizon is left undrawn.
 */
export function ridgelines(field: Field, g: RidgeLayout, samplesPerHour = SAMPLES_PER_HOUR): Ridge[] {
  const count = (HOURS - 1) * samplesPerHour + 1;
  const xs = Array.from({ length: count }, (_, i) => hourX(g, i / samplesPerHour));
  const ridges: Ridge[] = new Array(WEEKS);
  let horizon: Point[] | null = null;

  for (let w = WEEKS - 1; w >= 0; w--) {
    const baseline = baselineY(g, w + 1);
    const points: Point[] = xs.map((x, i) => ({
      x,
      y: baseline - g.amplitude * heightAt(field, w, i / samplesPerHour),
    }));

    let visible: Polyline[];
    if (horizon === null) {
      visible = [points];
      horizon = points.slice();
    } else {
      const cut = clip(points, horizon);
      visible = cut.visible;
      horizon = cut.next;
    }

    ridges[w] = {
      week: w + 1,
      baseline,
      points,
      hourY: Array.from({ length: HOURS }, (_, h) => points[h * samplesPerHour].y),
      visible,
    };
  }
  return ridges;
}

/** The whole hour nearest `x`, kept on the plot. */
export function pickHour(g: RidgeLayout, x: number): number {
  const h = Math.round(((x - g.padLeft) / g.plotWidth) * (HOURS - 1));
  return Math.max(0, Math.min(HOURS - 1, h));
}

/**
 * The ridge and hour under a point, the way a viewer sees it.
 *
 * Each ridge owns the ground from its line down to its baseline, widened by
 * half a spacing either way, and the nearest ridge that owns the point wins:
 * so a pointer on a tall front peak reads that peak, not the week hidden
 * behind it, and on flat ground it snaps to the nearest line. Above the whole
 * terrain or below the front of it, the nearest line wins.
 */
export function pickRidge(
  ridges: readonly Ridge[],
  g: RidgeLayout,
  x: number,
  y: number,
): { week: number; hour: number } {
  const hour = pickHour(g, x);
  const half = g.spacing / 2;
  for (let i = ridges.length - 1; i >= 0; i--) {
    const ridge = ridges[i];
    if (y >= ridge.hourY[hour] - half && y <= ridge.baseline + half) return { week: ridge.week, hour };
  }
  let best = ridges[0];
  for (const ridge of ridges) {
    if (Math.abs(ridge.hourY[hour] - y) < Math.abs(best.hourY[hour] - y)) best = ridge;
  }
  return { week: best.week, hour };
}

/**
 * The raw count in one cell: what actually happened in that hour of that
 * week. The drawn height is smoothed and compressed, so it is the wrong
 * number to put beside a crosshair.
 */
export function readCount(counts: Field, week: number, hour: number): number {
  return counts[hour]?.[week - 1] ?? 0;
}
