import type { ContourLayer } from "./contour";
import { HOURS, WEEKS, type Polyline } from "./types";

/**
 * The plotter file.
 *
 * A pen plotter is not a printer: one pen, one width, and a lift between every
 * path. So this file is geometry and nothing else. Physical millimetres on the
 * root element because every toolchain guesses a different DPI without them;
 * `fill="none"` everywhere because a filled shape makes the machine scribble
 * the interior; one group per level because that is how somebody swaps the pen
 * for the index contours; no text at all, because a plotter has no font and
 * would either drop it or convert it to a filled outline.
 *
 * Black on nothing, deliberately. The phosphor palette is for the screen; this
 * comes out as ink on the visitor's own paper.
 */

export type Sheet = { widthMm: number; heightMm: number; marginMm: number };

/** A4 landscape. The field is 52 by 24, so the wide sheet wastes the least paper. */
export const A4_LANDSCAPE: Sheet = { widthMm: 297, heightMm: 210, marginMm: 15 };

/** Fine enough that the pen is the limit. Hundredths of a millimetre. */
const DP = 2;
/** A hint. The pen decides. */
const STROKE_MM = 0.3;

export type Fit = {
  scale: number;
  offsetX: number;
  offsetY: number;
  widthMm: number;
  heightMm: number;
};

export function fitToSheet(cols: number, rows: number, sheet: Sheet): Fit {
  const innerW = sheet.widthMm - 2 * sheet.marginMm;
  const innerH = sheet.heightMm - 2 * sheet.marginMm;
  const scale = Math.min(innerW / Math.max(1, cols - 1), innerH / Math.max(1, rows - 1));
  const widthMm = (cols - 1) * scale;
  const heightMm = (rows - 1) * scale;
  return {
    scale,
    offsetX: sheet.marginMm + (innerW - widthMm) / 2,
    offsetY: sheet.marginMm + (innerH - heightMm) / 2,
    widthMm,
    heightMm,
  };
}

const round = (v: number) => Number(v.toFixed(DP)).toString();

/** Quantised the same way `contour.ts` does, so a ring closed there is closed here. */
const same = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.round(a.x * 1e4) === Math.round(b.x * 1e4) && Math.round(a.y * 1e4) === Math.round(b.y * 1e4);

export function pathData(line: Polyline, fit: Fit): string {
  if (line.length === 0) return "";
  const closed = line.length > 3 && same(line[0], line[line.length - 1]);
  const points = closed ? line.slice(0, -1) : line;
  const at = (p: { x: number; y: number }) =>
    `${round(fit.offsetX + p.x * fit.scale)} ${round(fit.offsetY + p.y * fit.scale)}`;
  const head = `M${at(points[0])}`;
  const rest = points
    .slice(1)
    .map((p) => `L${at(p)}`)
    .join("");
  return closed ? `${head}${rest}Z` : `${head}${rest}`;
}

export function plotterSvg(layers: readonly ContourLayer[], sheet: Sheet = A4_LANDSCAPE): string {
  const fit = fitToSheet(WEEKS, HOURS, sheet);
  const x0 = round(fit.offsetX);
  const y0 = round(fit.offsetY);
  const x1 = round(fit.offsetX + fit.widthMm);
  const y1 = round(fit.offsetY + fit.heightMm);

  const groups = layers
    .map((layer, i) => {
      const paths = layer.lines.map((line) => `<path d="${pathData(line, fit)}"/>`).join("");
      return `<g id="level-${i}" data-level="${layer.level}">${paths}</g>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.widthMm}mm" height="${sheet.heightMm}mm" viewBox="0 0 ${sheet.widthMm} ${sheet.heightMm}">`,
    `<g fill="none" stroke="black" stroke-width="${STROKE_MM}" stroke-linecap="round" stroke-linejoin="round">`,
    groups,
    `<path id="neatline" d="M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
