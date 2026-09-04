import type { Field } from "./types";

/**
 * A year of ground as something a printer can make.
 *
 * Binary STL, not ASCII: 50 bytes a triangle against roughly 250, which for
 * this mesh is 244 KB against about 1.2 MB, and the floats round-trip exactly
 * rather than through decimal text. The one trap is that a binary file whose
 * header begins with "solid" is read as ASCII by some parsers, so the header
 * here begins with "relief".
 *
 * The mesh is three parts and the third one is the interesting one. Top: two
 * triangles for each square between four neighbouring samples. Skirt: one quad
 * per boundary edge, dropped to z = 0. Base: the SAME grid, upside down. The
 * base has to be triangulated on the grid rather than as two big triangles,
 * because a long edge against the skirt's short ones is a T-junction, and a
 * T-junction means no edge is shared by exactly two triangles, which is what a
 * slicer calls "not watertight" before it either refuses the file or silently
 * repairs it into a different object. `openEdges` is the test for that and it
 * is the reason this file has one.
 */

/** Millimetres between samples. 52 columns comes out 102mm wide. */
export const CELL_MM = 2;
/** A floor under the relief, so the print has somewhere to start. */
export const BASE_MM = 2;
/** Full height above the base at a normalised height of 1. */
export const RELIEF_MM = 12;

/** 80 bytes, zero-padded. Deliberately not starting with "solid". */
export const STL_HEADER = "relief | fergusoreilly.dev | binary STL, mm";

export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];

export function triangleCount(rows: number, cols: number): number {
  if (rows < 2 || cols < 2) return 0;
  const cells = (rows - 1) * (cols - 1);
  const perimeter = 2 * (rows - 1) + 2 * (cols - 1);
  return cells * 2 + cells * 2 + perimeter * 2;
}

/**
 * One wall, from the top edge `a` to `b` down to the base.
 *
 * `a` and `b` arrive in the direction the top surface already winds that
 * boundary edge, and this emits the reverse of it, which is what makes the two
 * share the edge with opposite orientation.
 */
function wall(a: Vec3, b: Vec3): Triangle[] {
  const qa: Vec3 = [a[0], a[1], 0];
  const qb: Vec3 = [b[0], b[1], 0];
  return [
    [qa, qb, b],
    [qa, b, a],
  ];
}

export function buildMesh(field: Field): Triangle[] {
  const rows = field.length;
  const cols = rows > 0 ? field[0].length : 0;
  if (rows < 2 || cols < 2) return [];

  const v = (r: number, c: number): Vec3 => [
    c * CELL_MM,
    r * CELL_MM,
    BASE_MM + Math.min(1, Math.max(0, field[r][c])) * RELIEF_MM,
  ];
  const flat = (r: number, c: number): Vec3 => [c * CELL_MM, r * CELL_MM, 0];

  const out: Triangle[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Top. Counter-clockwise seen from +z, so both normals point up.
      const A = v(r, c);
      const B = v(r, c + 1);
      const C = v(r + 1, c + 1);
      const D = v(r + 1, c);
      out.push([A, B, C], [A, C, D]);

      // Base. The same grid, wound the other way, so the normals point down.
      const a = flat(r, c);
      const b = flat(r, c + 1);
      const c2 = flat(r + 1, c + 1);
      const d = flat(r + 1, c);
      out.push([a, c2, b], [a, d, c2]);
    }
  }

  // Skirt, walked so each `wall` call gets the top surface's own direction.
  for (let c = 0; c < cols - 1; c++) out.push(...wall(v(0, c), v(0, c + 1)));
  for (let r = 0; r < rows - 1; r++) out.push(...wall(v(r, cols - 1), v(r + 1, cols - 1)));
  for (let c = cols - 2; c >= 0; c--) out.push(...wall(v(rows - 1, c + 1), v(rows - 1, c)));
  for (let r = rows - 2; r >= 0; r--) out.push(...wall(v(r + 1, 0), v(r, 0)));

  return out;
}

/** Quantised, because a shared vertex is computed twice and floats are floats. */
const vkey = (v: Vec3) =>
  `${Math.round(v[0] * 1e4)},${Math.round(v[1] * 1e4)},${Math.round(v[2] * 1e4)}`;

/**
 * Every directed edge exactly once, and every one with its opposite present.
 * That is a closed, orientable, manifold surface, which is what "watertight"
 * means to a slicer. Returns the offending edges so a failure names them.
 */
export function openEdges(triangles: readonly Triangle[]): string[] {
  const seen = new Map<string, number>();
  for (const [a, b, c] of triangles) {
    const k = [vkey(a), vkey(b), vkey(c)];
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const edge = `${k[i]}|${k[j]}`;
      seen.set(edge, (seen.get(edge) ?? 0) + 1);
    }
  }
  const bad: string[] = [];
  for (const [edge, count] of seen) {
    const [p, q] = edge.split("|");
    if (count !== 1) bad.push(`${edge} appears ${count} times`);
    else if (!seen.has(`${q}|${p}`)) bad.push(`${edge} has no opposite`);
  }
  return bad;
}

/** Positive when the faces wind outward. Six times the tetrahedron sum. */
export function signedVolume(triangles: readonly Triangle[]): number {
  let total = 0;
  for (const [a, b, c] of triangles) {
    total +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return total;
}

function normalOf([a, b, c]: Triangle): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: Vec3 = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ];
  const len = Math.hypot(n[0], n[1], n[2]);
  // A degenerate triangle cannot occur in this mesh, and a zero-length normal
  // would write three NaNs into the file if one ever did.
  return len === 0 ? [0, 0, 0] : [n[0] / len, n[1] / len, n[2] / len];
}

export function writeBinaryStl(
  triangles: readonly Triangle[],
  header: string = STL_HEADER,
): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50 * triangles.length);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode(header).slice(0, 80), 0);
  view.setUint32(80, triangles.length, true);

  let at = 84;
  for (const tri of triangles) {
    for (const vec of [normalOf(tri), tri[0], tri[1], tri[2]]) {
      view.setFloat32(at, vec[0], true);
      view.setFloat32(at + 4, vec[1], true);
      view.setFloat32(at + 8, vec[2], true);
      at += 12;
    }
    view.setUint16(at, 0, true);
    at += 2;
  }
  return buffer;
}
