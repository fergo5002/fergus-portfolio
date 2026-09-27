/**
 * Atlas's camera, as arithmetic. A camera maps a world point `p` to the
 * screen at `(x + p.x * k, y + p.y * k)`. The canvas and the server-drawn
 * picture that stands in for it before the script arrives both frame the map
 * through here, so the hand-over from one to the other does not jump.
 */

export type Camera = { x: number; y: number; k: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** The furthest out and in a visitor can zoom. */
export const K_MIN = 0.05;
export const K_MAX = 6;
/** Fitting never zooms in past this, so a map of three files is not three dinner plates. */
export const FIT_MAX = 2.4;
/** World units of margin around a fitted map. */
export const WORLD_PAD = 44;

export const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k));

export function boundsOf(points: readonly Point[]): Bounds | null {
  if (!points.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** The camera that shows the padded bounds as large as fits in `safe`, centred there. */
export function fitCamera(bounds: Bounds, safe: Rect, pad = WORLD_PAD): Camera {
  const w = bounds.maxX - bounds.minX + pad * 2;
  const h = bounds.maxY - bounds.minY + pad * 2;
  const k = Math.max(K_MIN, Math.min(FIT_MAX, safe.w / Math.max(w, 1e-9), safe.h / Math.max(h, 1e-9)));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, x: safe.x + safe.w / 2 - cx * k, y: safe.y + safe.h / 2 - cy * k };
}

/** Zoom by `factor` about the screen point (sx, sy), which keeps the world point under it. */
export function zoomAt(camera: Camera, factor: number, sx: number, sy: number): Camera {
  const k = clampK(camera.k * factor);
  const ratio = k / camera.k;
  return { k, x: sx - (sx - camera.x) * ratio, y: sy - (sy - camera.y) * ratio };
}

export const toWorld = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.k, y: (p.y - c.y) / c.k });
export const toScreen = (c: Camera, p: Point): Point => ({ x: c.x + p.x * c.k, y: c.y + p.y * c.k });

/** The same zoom, moved so the world point sits at the centre of `safe`. */
export function centreOn(camera: Camera, p: Point, safe: Rect): Camera {
  return { k: camera.k, x: safe.x + safe.w / 2 - p.x * camera.k, y: safe.y + safe.h / 2 - p.y * camera.k };
}

const one = (n: number) => Number(n.toFixed(1));

/** The fitted framing as an SVG viewBox, so a meet-scaled picture frames exactly as `fitCamera` does. */
export function viewBoxFor(bounds: Bounds, pad = WORLD_PAD): string {
  return [bounds.minX - pad, bounds.minY - pad, bounds.maxX - bounds.minX + pad * 2, bounds.maxY - bounds.minY + pad * 2]
    .map(one)
    .join(" ");
}

/** A node's radius in world units: folders are landmarks, files grow with their connections, to a cap. */
export function nodeRadius(n: { kind: string; degree: number }): number {
  return n.kind === "folder" ? 9 : Math.min(8, 4 + Math.sqrt(Math.max(0, n.degree)));
}

type Hittable = { kind: string; degree: number; x?: number; y?: number };

/**
 * The nearest node whose edge is within `slop` screen pixels of (sx, sy).
 * Measured on the screen, so the slop stays a fingertip at any zoom.
 */
export function hitNode<T extends Hittable>(nodes: readonly T[], camera: Camera, sx: number, sy: number, slop: number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = Math.hypot(camera.x + (n.x ?? 0) * camera.k - sx, camera.y + (n.y ?? 0) * camera.k - sy);
    if (d <= nodeRadius(n) * camera.k + slop && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}
