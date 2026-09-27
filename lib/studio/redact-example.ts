import type { Rect } from "@/lib/lab/redact";
import type { TextBox } from "./redaction";
import { redactCopy } from "@/content/studio/redact";

/**
 * The example invoice, as one layout drawn two ways.
 *
 * The server renders it as an image of a standalone SVG (`EXAMPLE_SRC`), so the
 * document and the mask on it are on the page before any script arrives. When
 * the clean copy is built, `drawExample` paints the same layout onto a canvas,
 * because an SVG drawn onto a canvas can taint it in some browsers. Neither
 * trusts a font's metrics: every run is stretched to the width this layout
 * gives it (SVG `textLength`, a canvas scale), so the text boxes the find line
 * lights, the mask the example opens with, the SVG and the burned pixels all
 * agree to the pixel whatever face the browser ends up using.
 */
export const EXAMPLE_PAGE = {
  width: 900,
  height: 1160,
  pointsWidth: 600,
  pointsHeight: (1160 * 600) / 900,
} as const;

/** The advance of one character at the body size: 0.6em, the site's mono face's own. */
export const EXAMPLE_ADVANCE = 13.2;
const BODY = 22;
const TITLE = 38;

export type ExampleRun = { text: string; x: number; y: number; size: number; bold: boolean; width: number };
export type ExampleSheetLayout = {
  frame: Rect;
  title: ExampleRun;
  lines: ExampleRun[];
  /** One box per line, like a PDF text item: what the find line searches. */
  text: TextBox[];
};

export function exampleSheet(): ExampleSheetLayout {
  const lines = redactCopy.sample.map((text, i) => ({
    text,
    x: 70,
    y: 230 + i * 80,
    size: BODY,
    bold: false,
    width: text.length * EXAMPLE_ADVANCE,
  }));
  return {
    frame: { x: 50, y: 50, width: 800, height: 1060 },
    title: {
      text: redactCopy.sampleTitle,
      x: 70,
      y: 120,
      size: TITLE,
      bold: true,
      width: redactCopy.sampleTitle.length * TITLE * 0.6,
    },
    lines,
    text: lines.map((l) => ({
      text: l.text,
      x: l.x - 3,
      y: l.y - 24,
      width: Math.ceil(l.width) + 6,
      height: 32,
    })),
  };
}

/** The mask the example opens with: over the email address, with its label left in the clear. */
export function exampleMask(sheet: ExampleSheetLayout): Rect {
  const i = sheet.lines.findIndex((l) => l.text.includes("@")),
    line = sheet.lines[i],
    box = sheet.text[i],
    start = line.x + (line.text.indexOf(": ") + 2) * EXAMPLE_ADVANCE,
    x = Math.floor(start - 4);
  return { x, y: box.y, width: Math.ceil(line.x + line.width + 4 - x), height: box.height };
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The example as a standalone SVG document. It is shown as an image rather
 * than inline, so the invoice's invented name, email and phone number are
 * pixels to a crawler and never words competing with the page's own. As an
 * image it cannot see the site's web font, so it asks for the browser's
 * monospace, which is what `drawExample` is given for the export too.
 */
export function exampleSvg(sheet: ExampleSheetLayout): string {
  const { width, height } = EXAMPLE_PAGE,
    f = sheet.frame;
  const runs = [sheet.title, ...sheet.lines]
    .map(
      (r) =>
        `<text x="${r.x}" y="${r.y}" font-size="${r.size}"${r.bold ? ' font-weight="700"' : ""} textLength="${r.width.toFixed(1)}" lengthAdjust="spacingAndGlyphs">${xml(r.text)}</text>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/>` +
    `<rect x="${f.x + 0.5}" y="${f.y + 0.5}" width="${f.width}" height="${f.height}" fill="none" stroke="#bbb"/>` +
    `<g font-family="monospace" fill="#171b18">${runs}</g>` +
    `</svg>`
  );
}

/** The example page's image, as a data URI the server can put straight into the HTML. */
export const EXAMPLE_SRC = `data:image/svg+xml,${encodeURIComponent(exampleSvg(exampleSheet()))}`;

/** The generic face both drawings ask for. */
export const EXAMPLE_FACE = "monospace";

type Ink = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "translate" | "scale" | "fillText" | "measureText" | "fillRect" | "strokeRect"
> & { font: string; fillStyle: unknown; strokeStyle: unknown; lineWidth: number };

/** Paint the example onto a canvas the size of `EXAMPLE_PAGE`, in `family`. */
export function drawExample(ctx: Ink, sheet: ExampleSheetLayout, family: string) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, EXAMPLE_PAGE.width, EXAMPLE_PAGE.height);
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1;
  const f = sheet.frame;
  ctx.strokeRect(f.x, f.y, f.width, f.height);
  ctx.fillStyle = "#171b18";
  for (const run of [sheet.title, ...sheet.lines]) {
    ctx.font = `${run.bold ? "700 " : ""}${run.size}px ${family}`;
    const natural = ctx.measureText(run.text).width || run.width;
    ctx.save();
    ctx.translate(run.x, run.y);
    ctx.scale(run.width / natural, 1);
    ctx.fillText(run.text, 0, 0);
    ctx.restore();
  }
}
