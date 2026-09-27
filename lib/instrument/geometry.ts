/**
 * Dial geometry for the knob's SVG. Degrees, zero at twelve o'clock, positive
 * clockwise: the way a dial is read. Numbers are rounded to three places so
 * the path strings stay short and identical on server and client renders.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: r3(cx + r * Math.sin(rad)), y: r3(cy - r * Math.cos(rad)) };
}

/** A clockwise arc between two angles, or an empty string for no arc at all. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  if (b - a < 1e-6) return "";
  const start = polar(cx, cy, r, a);
  const end = polar(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M${start.x} ${start.y}A${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

/** `count` angles spread evenly from `from` to `to`, both ends included. */
export function ticks(count: number, from: number, to: number): number[] {
  if (count <= 1) return [from];
  return Array.from({ length: count }, (_, i) => r3(from + ((to - from) * i) / (count - 1)));
}
