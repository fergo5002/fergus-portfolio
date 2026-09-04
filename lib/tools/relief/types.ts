/**
 * The shapes every part of Relief agrees on.
 *
 * `Field`, `Point` and `Segment` are lifted from Tigh Sauna's
 * `apps/site/src/lib/survey/terrain.ts` (branch `feat/ordnance-survey`), so
 * the marching squares in `contour.ts` can be the same code rather than a
 * retyped copy of it.
 */

/** Columns. One year, ending at the window's end. */
export const WEEKS = 52;
/** Rows. Hour of the day, in the author's own local time. */
export const HOURS = 24;
export const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

/** One dated thing, already reduced to its cell. Nothing identifying survives. */
export type ReliefEvent = { week: number; hour: number };

export type Field = number[][];
export type Point = { x: number; y: number };
export type Segment = [Point, Point];
/** A chain of points. Closed when the first and last are the same point. */
export type Polyline = Point[];

export type Heightmap = {
  /** Normalised and smoothed, every value in [0, 1]. What gets contoured. */
  field: Field;
  /** The raw counts, kept for the readout so the page can say a real number. */
  counts: Field;
  ceiling: number;
  events: number;
  occupied: number;
  hi: number;
  lo: number;
  hiAt: { row: number; col: number };
};
