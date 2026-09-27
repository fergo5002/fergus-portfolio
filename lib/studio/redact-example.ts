import type { Rect } from "@/lib/lab/redact";
import type { TextBox } from "./redaction";
import { redactCopy } from "@/content/studio/redact";

/**
 * The example invoice, as one layout drawn two ways.
 *
 * The server renders it as an inline SVG (`ExampleSheet`), so the document and
 * the mask on it are on the page before any script arrives. When the clean
 * copy is built, `drawExample` paints the same layout onto a canvas. Neither
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
