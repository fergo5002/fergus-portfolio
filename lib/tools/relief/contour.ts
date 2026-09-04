import type { Field, Point, Polyline, Segment } from "./types";

/**
 * Marching squares, and the chaining that makes the output plottable.
 *
 * `contour` is lifted from Tigh Sauna's survey sheet,
 * `apps/site/src/lib/survey/terrain.ts` on branch `feat/ordnance-survey`,
 * written for the same purpose: drawing a trading year as ground. One change,
 * stated here so nobody has to diff two repositories to find it: the loop
 * bounds come off the array instead of the module constants ROWS and COLS,
 * because Relief contours grids of other sizes in its tests. The saddle
 * handling is the original's, cheap on purpose.
 *
 * `chainSegments` is new. `terrain.ts` draws to a canvas, where a thousand
 * loose two-point segments cost nothing. Relief writes an SVG a pen plotter
 * follows, and there each loose segment is a pen lift.
 */

/** Six, evenly spaced. A seventh moires against its neighbours at 52 columns on a phone. */
export const LEVELS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9] as const;

/** Every second line is heavier, which is how an Ordnance sheet is read. */
export function isIndexLevel(i: number): boolean {
  return i % 2 === 1;
}

export function contour(field: Field, level: number): Segment[] {
  const rows = field.length;
  const cols = rows > 0 ? field[0].length : 0;
  if (rows < 2 || cols < 2) return [];

  const segs: Segment[] = [];
  const lerp = (a: number, b: number, va: number, vb: number) =>
    a + (b - a) * ((level - va) / (vb - va));

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = field[r][c];
      const tr = field[r][c + 1];
      const br = field[r + 1][c + 1];
      const bl = field[r + 1][c];

      const k =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (k === 0 || k === 15) continue;

      const T = { x: lerp(c, c + 1, tl, tr), y: r };
      const R = { x: c + 1, y: lerp(r, r + 1, tr, br) };
      const B = { x: lerp(c, c + 1, bl, br), y: r + 1 };
      const L = { x: c, y: lerp(r, r + 1, tl, bl) };

      switch (k) {
        case 1: case 14: segs.push([L, B]); break;
        case 2: case 13: segs.push([B, R]); break;
        case 3: case 12: segs.push([L, R]); break;
        case 4: case 11: segs.push([T, R]); break;
        case 6: case 9:  segs.push([T, B]); break;
        case 7: case 8:  segs.push([L, T]); break;
        case 5:  segs.push([L, T]); segs.push([B, R]); break;
        case 10: segs.push([T, R]); segs.push([L, B]); break;
      }
    }
  }
  return segs;
}

/**
 * Quantised to 1e-4 of a cell before comparison. Two cells computing the same
 * crossing from opposite sides can differ in the last bit or two, and an exact
 * comparison would then break every ring into two open lines.
 */
const key = (p: Point) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`;

export function isClosed(line: Polyline): boolean {
  return line.length > 2 && key(line[0]) === key(line[line.length - 1]);
}

/** Loose segments into as few continuous runs as their endpoints allow. */
export function chainSegments(segments: readonly Segment[]): Polyline[] {
  const used = new Array<boolean>(segments.length).fill(false);
  const at = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const list = at.get(k);
    if (list) list.push(i);
    else at.set(k, [i]);
  };
  segments.forEach((s, i) => {
    add(key(s[0]), i);
    add(key(s[1]), i);
  });

  /** The far end of segment `i` from the point keyed `k`. */
  const far = (i: number, k: string): Point | null => {
    const [a, b] = segments[i];
    if (key(a) === k) return b;
    if (key(b) === k) return a;
    return null;
  };

  const unused = (k: string): number => {
    for (const i of at.get(k) ?? []) if (!used[i]) return i;
    return -1;
  };

  const out: Polyline[] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const line: Polyline = [segments[start][0], segments[start][1]];

    for (;;) {
      const k = key(line[line.length - 1]);
      const i = unused(k);
      if (i < 0) break;
      const p = far(i, k);
      if (!p) break;
      used[i] = true;
      line.push(p);
    }
    for (;;) {
      const k = key(line[0]);
      const i = unused(k);
      if (i < 0) break;
      const p = far(i, k);
      if (!p) break;
      used[i] = true;
      line.unshift(p);
    }
    out.push(line);
  }
  return out;
}

export type ContourLayer = { level: number; index: boolean; lines: Polyline[] };

/** Every level, contoured and chained. The one call the three writers share. */
export function contourLayers(field: Field): ContourLayer[] {
  return LEVELS.map((level, i) => ({
    level,
    index: isIndexLevel(i),
    lines: chainSegments(contour(field, level)),
  }));
}
