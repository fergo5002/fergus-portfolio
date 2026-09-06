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
