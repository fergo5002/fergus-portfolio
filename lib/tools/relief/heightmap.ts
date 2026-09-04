import { HOURS, MS_WEEK, WEEKS, type Field, type Heightmap, type ReliefEvent } from "./types";

/**
 * Counts to ground.
 *
 * Four decisions live in this file and each one is a way the plate could lie:
 * which cell an event lands in, what counts as the top of the scale, how a
 * count becomes a height, and how much the ground may be smoothed before it
 * stops being the data. They are all here, all pure, all tested.
 */

/** Under this in a year and the tool refuses. Rings around single cells are noise. */
export const MIN_EVENTS = 150;
/** And under this many occupied cells, for the same reason from the other side. */
export const MIN_OCCUPIED_CELLS = 30;
/**
 * The top of the scale, as a percentile of the occupied cells rather than the
 * maximum. One 200-commit hour is real and belongs on the sheet as the summit.
 * What it may not do is set the scale, because then every ordinary hour lands
 * under half a percent and the year draws as one spire on a flat plain.
 */
export const CEILING_PERCENTILE = 0.98;
/** Two passes of [1,2,1]/4. See the plan on what this deliberately loses. */
export const SMOOTH_PASSES = 2;
/** Below this spread the page says "flat" rather than drawing an empty sheet. */
export const FLAT_RANGE = 0.05;

/** Column for `atMs`, counting back from `endMs`. 51 is the week ending at `endMs`. */
export function weekIndex(atMs: number, endMs: number): number | null {
  if (!Number.isFinite(atMs) || !Number.isFinite(endMs)) return null;
  const back = Math.floor((endMs - atMs) / MS_WEEK);
  if (back < 0 || back >= WEEKS) return null;
  return WEEKS - 1 - back;
}

function blank(): Field {
  return Array.from({ length: HOURS }, () => Array.from({ length: WEEKS }, () => 0));
}

/** Events to raw counts. Anything off the grid is dropped, never clamped onto an edge. */
export function countGrid(events: readonly ReliefEvent[]): Field {
  const grid = blank();
  for (const e of events) {
    if (!Number.isInteger(e.week) || e.week < 0 || e.week >= WEEKS) continue;
    if (!Number.isInteger(e.hour) || e.hour < 0 || e.hour >= HOURS) continue;
    grid[e.hour][e.week] += 1;
  }
  return grid;
}

/**
 * The top of the scale.
 *
 * Nearest rank from below, deliberately: an interpolating percentile at n = 50
 * reaches 2% of the way into the 50th value, and the 50th value is the outlier
 * this function exists to step around.
 */
export function ceilingFor(values: readonly number[], p = CEILING_PERCENTILE): number {
  const occupied = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (occupied.length === 0) return 1;
  const index = Math.min(occupied.length - 1, Math.floor(p * (occupied.length - 1)));
  return Math.max(1, occupied[index]);
}

/** A count as a height in [0, 1]. Logarithmic, because commit counts are multiplicative. */
export function normalise(count: number, ceiling: number): number {
  if (!(count > 0)) return 0;
  return Math.min(1, Math.log1p(count) / Math.log1p(Math.max(1, ceiling)));
}

/**
 * Separable [1,2,1]/4, `passes` times.
 *
 * Wrapped on the hour axis because 23:00 really is next to 00:00 and a ridge
 * that crosses midnight is one ridge. Clamped on the week axis because the
 * first and last weeks of a year are a year apart. A convex kernel, so nothing
 * leaves the range it arrived in.
 */
export function smooth(grid: readonly (readonly number[])[], passes = SMOOTH_PASSES): Field {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  let out: Field = grid.map((row) => [...row]);
  for (let p = 0; p < passes; p++) {
    const h: Field = out.map((row) =>
      row.map((_, c) => {
        const l = row[Math.max(0, c - 1)];
        const r = row[Math.min(cols - 1, c + 1)];
        return (l + 2 * row[c] + r) / 4;
      }),
    );
    out = h.map((row, r) =>
      row.map((_, c) => {
        const u = h[(r - 1 + rows) % rows][c];
        const d = h[(r + 1) % rows][c];
        return (u + 2 * h[r][c] + d) / 4;
      }),
    );
  }
  return out;
}

export type Density = { ok: true } | { ok: false; reason: "few-events" | "few-cells" };

/**
 * Returns a key, not a sentence. The words are in `content/tools/relief.ts`,
 * so this stays arithmetic and the voice lint still covers the copy.
 */
export function checkDensity(events: readonly ReliefEvent[]): Density {
  if (events.length < MIN_EVENTS) return { ok: false, reason: "few-events" };
  const cells = new Set(events.map((e) => `${e.hour}:${e.week}`));
  if (cells.size < MIN_OCCUPIED_CELLS) return { ok: false, reason: "few-cells" };
  return { ok: true };
}

export function buildHeightmap(events: readonly ReliefEvent[]): Heightmap {
  const counts = countGrid(events);
  const flat = counts.flat();
  const ceiling = ceilingFor(flat);
  const normalised = counts.map((row) => row.map((v) => normalise(v, ceiling)));
  const field = smooth(normalised);

  let hi = -Infinity;
  let lo = Infinity;
  let hiAt = { row: 0, col: 0 };
  for (let r = 0; r < field.length; r++) {
    for (let c = 0; c < field[r].length; c++) {
      const v = field[r][c];
      if (v > hi) {
        hi = v;
        hiAt = { row: r, col: c };
      }
      if (v < lo) lo = v;
    }
  }

  return {
    field,
    counts,
    ceiling,
    events: flat.reduce((a, b) => a + b, 0),
    occupied: flat.filter((v) => v > 0).length,
    hi,
    lo,
    hiAt,
  };
}
