import type { ContourLayer } from "./contour";
import { HOURS, WEEKS, type Point } from "./types";

/**
 * The plate, as a list of instructions.
 *
 * Split in two on purpose. `planPlate` decides what to draw and is pure, so
 * the geometry and the colour choices are testable in a node environment with
 * no canvas anywhere. `paint` is the nine lines that talk to a context. The
 * bugs live in the first half and so do the tests.
 *
 * Every colour comes from the site's own CSS variables through `read`, which
 * the component wires to `getComputedStyle(document.documentElement)`. That is
 * what makes the plate change with the `theme` command for free, and it is why
 * this file contains no colour of its own: `draw.test.ts` greps it and fails
 * on a hex literal.
 */

export type Palette = {
  /** `--bg`. The page, so the plate sits on the page rather than in a box. */
  bg: string;
  /** `--green-dim`. The ordinary contour. */
  line: string;
  /** `--green`. Every second contour, the index line. */
  index: string;
  /** `--green-bright`. Reserved for the summit mark. */
  ink: string;
  /** `--amber`. Labels, as everywhere else on the site. */
  label: string;
};

export class ReliefPaletteError extends Error {
  constructor(token: string) {
    super(`relief: the theme token ${token} is empty, so the plate has no colour to draw in`);
    this.name = "ReliefPaletteError";
  }
}

export function paletteFromTokens(read: (name: string) => string): Palette {
  const need = (name: string) => {
    const value = read(name).trim();
    if (!value) throw new ReliefPaletteError(name);
    return value;
  };
  return {
    bg: need("--bg"),
    line: need("--green-dim"),
    index: need("--green"),
    ink: need("--green-bright"),
    label: need("--amber"),
  };
}

/** The subset of CanvasRenderingContext2D the painter uses. The real one satisfies it. */
export type Ctx2D = {
  canvas: { width: number; height: number };
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
};

export type PlateGeometry = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  plotWidth: number;
  plotHeight: number;
  /** False on a narrow phone, where hour labels collide with the plot. */
  labels: boolean;
};

/** Below this the labels are dropped rather than overlapped. */
const LABEL_FLOOR_PX = 480;
const GUTTER_PX = 26;
const BARE_PAD_PX = 6;

export function plateGeometry(width: number): PlateGeometry {
  const labels = width >= LABEL_FLOOR_PX;
  const padLeft = labels ? GUTTER_PX : BARE_PAD_PX;
  const padRight = BARE_PAD_PX;
  const padTop = BARE_PAD_PX;
  const padBottom = labels ? GUTTER_PX : BARE_PAD_PX;
  const plotWidth = Math.max(1, width - padLeft - padRight);
  const plotHeight = (plotWidth * (HOURS - 1)) / (WEEKS - 1);
  return {
    width,
    height: Math.round(padTop + plotHeight + padBottom),
    padLeft,
    padRight,
    padTop,
    padBottom,
    plotWidth,
    plotHeight,
    labels,
  };
}

export type DrawOp =
  | { op: "clear"; w: number; h: number; fill: string }
  | { op: "polyline"; points: readonly Point[]; stroke: string; width: number }
  | { op: "text"; text: string; x: number; y: number; fill: string; align: "left" | "right" };

/** Every sixth hour. Four labels fit at any width that has labels at all. */
export function hourLabels(_geometry: PlateGeometry): { text: string; row: number }[] {
  const rows = [0, 6, 12, 18];
  return rows.map((row) => ({ text: String(row).padStart(2, "0"), row }));
}

const LIGHT_PEN = 0.9;
const HEAVY_PEN = 1.6;

export function planPlate(input: {
  layers: readonly ContourLayer[];
  geometry: PlateGeometry;
  palette: Palette;
  labels: boolean;
}): DrawOp[] {
  const { layers, geometry: g, palette, labels } = input;
  const toX = (fx: number) => g.padLeft + (fx / (WEEKS - 1)) * g.plotWidth;
  const toY = (fy: number) => g.padTop + (fy / (HOURS - 1)) * g.plotHeight;

  const ops: DrawOp[] = [{ op: "clear", w: g.width, h: g.height, fill: palette.bg }];

  for (const layer of layers) {
    for (const line of layer.lines) {
      ops.push({
        op: "polyline",
        points: line.map((p) => ({ x: toX(p.x), y: toY(p.y) })),
        stroke: layer.index ? palette.index : palette.line,
        width: layer.index ? HEAVY_PEN : LIGHT_PEN,
      });
    }
  }

  if (labels) {
    for (const { text, row } of hourLabels(g)) {
      ops.push({
        op: "text",
        text,
        x: g.padLeft - 6,
        y: toY(row) + 4,
        fill: palette.label,
        align: "right",
      });
    }
  }

  return ops;
}

/** Plays the list. The only part that needs a real canvas. */
export function paint(ctx: Ctx2D, ops: readonly DrawOp[]): void {
  for (const op of ops) {
    if (op.op === "clear") {
      ctx.fillStyle = op.fill;
      ctx.fillRect(0, 0, op.w, op.h);
    } else if (op.op === "polyline") {
      if (op.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(op.points[0].x, op.points[0].y);
      for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.width;
      ctx.stroke();
    } else {
      ctx.fillStyle = op.fill;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
