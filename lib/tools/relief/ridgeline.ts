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

/**
 * Every ridge, ordered back (week 1) to front (week 52), with hidden lines
 * removed.
 *
 * The skyline is the highest line in front so far at each sample x (smallest
 * y, since y grows down the sheet). Walking from the front, a stretch of a
 * ridge is drawn where it stands above that skyline and cut where it crosses
 * it. Between samples the skyline is taken as the chord, which sits at or
 * below the true one, so the error only ever hides a sliver more: never draws
 * a line through a nearer hill.
 */
export function ridgelines(field: Field, g: RidgeLayout, samplesPerHour = SAMPLES_PER_HOUR): Ridge[] {
  const count = (HOURS - 1) * samplesPerHour + 1;
  const xs = Array.from({ length: count }, (_, i) => hourX(g, i / samplesPerHour));
  const sky = Array.from({ length: count }, () => Infinity);
  const ridges: Ridge[] = new Array(WEEKS);

  for (let w = WEEKS - 1; w >= 0; w--) {
    const baseline = baselineY(g, w + 1);
    const points: Point[] = xs.map((x, i) => ({
      x,
      y: baseline - g.amplitude * heightAt(field, w, i / samplesPerHour),
    }));

    const visible: Polyline[] = [];
    let run: Point[] | null = null;
    for (let i = 0; i < count; i++) {
      const shown = points[i].y < sky[i];
      if (i > 0) {
        const wasShown = run !== null;
        if (wasShown !== shown) {
          // The ridge crosses the skyline chord between i - 1 and i.
          const d0 = points[i - 1].y - sky[i - 1];
          const d1 = points[i].y - sky[i];
          const t = Number.isFinite(d0) && Number.isFinite(d1) && d0 !== d1 ? d0 / (d0 - d1) : 0;
          const cross = {
            x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
            y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
          };
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
        run.push(points[i]);
      }
    }
    if (run && run.length > 1) visible.push(run);

    for (let i = 0; i < count; i++) if (points[i].y < sky[i]) sky[i] = points[i].y;

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
