import type { Rect } from "@/lib/lab/redact";
export type TextBox = Rect & { text: string };
export type MaskHistory = {
  past: Rect[][][];
  present: Rect[][];
  future: Rect[][][];
};
export function editMasks(
  h: MaskHistory,
  page: number,
  rects: Rect[],
): MaskHistory {
  return {
    past: [...h.past.slice(-79), h.present],
    present: h.present.map((r, i) => (i === page ? rects : r)),
    future: [],
  };
}
export function undoMasks(h: MaskHistory): MaskHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redoMasks(h: MaskHistory): MaskHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
export function moveMask(
  r: Rect,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Rect {
  return {
    ...r,
    x: Math.max(0, Math.min(width - r.width, r.x + dx)),
    y: Math.max(0, Math.min(height - r.height, r.y + dy)),
  };
}
/** Grow or shrink a mask from its bottom-right corner, never below 2px and never past the page. */
export function resizeMask(
  r: Rect,
  dw: number,
  dh: number,
  width: number,
  height: number,
): Rect {
  return {
    ...r,
    width: Math.max(2, Math.min(width - r.x, r.width + dw)),
    height: Math.max(2, Math.min(height - r.y, r.height + dh)),
  };
}
/** A mask made from the keyboard: a line-sized bar in the middle of the page. */
export function centredMask(width: number, height: number): Rect {
  const w = Math.max(2, Math.min(width, Math.round(width * 0.3))),
    h = Math.max(2, Math.min(height, Math.max(24, Math.round(height * 0.03))));
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    width: w,
    height: h,
  };
}
const inside = (r: Rect, x: number, y: number, slop = 0) =>
  x >= r.x - slop &&
  x <= r.x + r.width + slop &&
  y >= r.y - slop &&
  y <= r.y + r.height + slop;
/** The topmost mask under a point (the last drawn wins), or -1. */
export function hitMask(masks: Rect[], x: number, y: number, slop = 0) {
  for (let i = masks.length - 1; i >= 0; i--)
    if (inside(masks[i], x, y, slop)) return i;
  return -1;
}
/** The topmost lit candidate under a tap, or -1. */
export function candidateAt(boxes: Rect[], x: number, y: number) {
  return hitMask(boxes, x, y);
}
/** Candidates still worth lighting: any box one mask already covers whole is done. */
export function pendingCandidates<T extends Rect>(boxes: T[], masks: Rect[]) {
  return boxes.filter(
    (b) =>
      !masks.some(
        (m) =>
          m.x <= b.x &&
          m.y <= b.y &&
          m.x + m.width >= b.x + b.width &&
          m.y + m.height >= b.y + b.height,
      ),
  );
}
export function matchingBoxes(boxes: TextBox[], query: string, kind = "text") {
  return boxes.filter((b) =>
    kind === "email"
      ? /[^\s@]+@[^\s@]+\.[^\s@]+/.test(b.text)
      : kind === "phone"
        ? /(?:\+?\d[\d ().-]{7,}\d)/.test(b.text)
        : query.trim().length > 0 &&
          b.text.toLowerCase().includes(query.toLowerCase()),
  );
}
