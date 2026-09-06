export type Rect = { x: number; y: number; width: number; height: number };
export function normaliseRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
): Rect {
  const x = Math.floor(Math.max(0, Math.min(w, x1, x2))),
    y = Math.floor(Math.max(0, Math.min(h, y1, y2)));
  return {
    x,
    y,
    width: Math.ceil(Math.min(w, Math.max(0, x1, x2))) - x,
    height: Math.ceil(Math.min(h, Math.max(0, y1, y2))) - y,
  };
}
export function coveredPixels(r: Rect, w: number, h: number) {
  const rect = normaliseRect(r.x, r.y, r.x + r.width, r.y + r.height, w, h);
  return rect.width * rect.height;
}
