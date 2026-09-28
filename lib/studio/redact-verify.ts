import type { Rect } from "@/lib/lab/redact";

/**
 * The verify pass: what the tool checks on the file it is about to hand over.
 *
 * Building the clean copy draws each page into pixels, paints every mask in
 * as solid black and writes a new PDF holding only those images. The tool
 * then reopens that PDF with pdf.js, exactly as it opened the original, and
 * asks two questions of what comes back:
 *
 *   1. Is every pixel under every mask black? The masks are scaled from the
 *      page they were drawn on to the render pdf.js made of the output (an
 *      image page is reopened at 1.125 times its size), and read a couple of
 *      pixels in from the edge, where resampling softens a hard black line.
 *   2. Is there any text left? The same text extraction that found the
 *      original's words now runs on the output, and it must find none.
 *
 * The scan line that sweeps the reopened page only reveals these answers; it
 * never makes one up. `canDownload` is the gate: every page must pass and
 * every page must have been looked at by the visitor, because the machine can
 * check the masks but only a person can check what was left uncovered.
 */
export type Pixels = { data: Uint8ClampedArray | number[]; width: number; height: number };

/** A pixel is burned only when every channel is at or under this. */
export const INK_MAX = 16;
/** How far in from a mask's edge the probe starts, in render pixels. */
export const EDGE = 2;

export function scaleRect(r: Rect, sx: number, sy: number): Rect {
  return { x: r.x * sx, y: r.y * sy, width: r.width * sx, height: r.height * sy };
}

/** The whole-pixel box inside `r` that is read, clamped to the render; null if none of it is on the render. */
export function probeRect(r: Rect, width: number, height: number): Rect | null {
  const inX = Math.min(EDGE, Math.floor((r.width - 1) / 2)),
    inY = Math.min(EDGE, Math.floor((r.height - 1) / 2)),
    x0 = Math.max(0, Math.ceil(r.x + Math.max(0, inX))),
    y0 = Math.max(0, Math.ceil(r.y + Math.max(0, inY))),
    x1 = Math.min(width, Math.floor(r.x + r.width - Math.max(0, inX))),
    y1 = Math.min(height, Math.floor(r.y + r.height - Math.max(0, inY)));
  if (x1 <= x0 || y1 <= y0) {
    // A mask thinner than the inset: read its middle pixel, if it is on the render.
    const cx = Math.floor(r.x + r.width / 2),
      cy = Math.floor(r.y + r.height / 2);
    return cx >= 0 && cy >= 0 && cx < width && cy < height ? { x: cx, y: cy, width: 1, height: 1 } : null;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function darkShare(px: Pixels, r: Rect): { dark: number; total: number } {
  let dark = 0,
    total = 0;
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) {
      const i = (y * px.width + x) * 4;
      total++;
      if (px.data[i] <= INK_MAX && px.data[i + 1] <= INK_MAX && px.data[i + 2] <= INK_MAX) dark++;
    }
  return { dark, total };
}

export type MaskVerdict = { rect: Rect; dark: number; total: number; solid: boolean };
export type PageVerdict = { masks: MaskVerdict[]; textBefore: number; textAfter: number; ok: boolean };

export function verifyPage({
  pixels,
  masks,
  source,
  textBefore,
  textAfter,
}: {
  /** The reopened output page, as rendered by pdf.js. */
  pixels: Pixels;
  /** The masks, in the pixel space of the page they were drawn on. */
  masks: Rect[];
  source: { width: number; height: number };
  /** Text runs found on the original page, and on the reopened output page. */
  textBefore: number;
  textAfter: number;
}): PageVerdict {
  const sx = pixels.width / source.width,
    sy = pixels.height / source.height;
  const read = masks.map((rect) => {
    const probe = probeRect(scaleRect(rect, sx, sy), pixels.width, pixels.height);
    const { dark, total } = probe ? darkShare(pixels, probe) : { dark: 0, total: 0 };
    return { rect, dark, total, solid: total > 0 && dark === total };
  });
  return {
    masks: read,
    textBefore,
    textAfter,
    ok: textAfter === 0 && read.every((m) => m.solid),
  };
}

/** The download gate: a verify pass has run, every page passed it, and the visitor has inspected every page. */
export function canDownload(verdicts: PageVerdict[] | null, reviewed: number[]): boolean {
  if (!verdicts || !verdicts.length) return false;
  const seen = new Set(reviewed.filter((i) => Number.isInteger(i) && i >= 0 && i < verdicts.length));
  return seen.size === verdicts.length && verdicts.every((v) => v.ok);
}

/** Where the scan line is, from 0 to 1, off the frame's own timestamp. */
export function scanProgress(start: number, now: number, duration: number): number {
  return Math.max(0, Math.min(1, (now - start) / duration));
}

/** Which masks the scan line has passed the middle of, so their verdicts may show. */
export function scanReveal(masks: Rect[], progress: number, height: number): boolean[] {
  const line = progress * height;
  return masks.map((m) => line >= m.y + m.height / 2);
}
