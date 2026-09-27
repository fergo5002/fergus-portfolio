import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contourLayers } from "./contour";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import {
  ReliefPaletteError,
  type Ctx2D,
  type DrawOp,
  hourLabels,
  paint,
  paletteFromTokens,
  pickPlate,
  planPlate,
  platePoint,
  planRidgeline,
  plateGeometry,
} from "./draw";
import { hourX, ridgeGeometry, ridgelines } from "./ridgeline";

const TOKENS: Record<string, string> = {
  "--bg": "#0a0e0a",
  "--green": "#33ff66",
  "--green-bright": "#6effa3",
  "--green-dim": "#1f8f3a",
  "--amber": "#ffb000",
};
const reader = (name: string) => TOKENS[name] ?? "";
const palette = paletteFromTokens(reader);

/** A recording context. Structurally a CanvasRenderingContext2D, minus the drawing. */
function recorder() {
  const calls: string[] = [];
  const ctx: Ctx2D = {
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    fillRect(x, y, w, h) {
      calls.push(`fillRect ${this.fillStyle} ${x} ${y} ${w} ${h}`);
    },
    beginPath() {
      calls.push("beginPath");
    },
    moveTo(x, y) {
      calls.push(`moveTo ${x} ${y}`);
    },
    lineTo(x, y) {
      calls.push(`lineTo ${x} ${y}`);
    },
    stroke() {
      calls.push(`stroke ${this.strokeStyle} ${this.lineWidth}`);
    },
    fillText(text, x, y) {
      calls.push(`fillText ${this.fillStyle} ${text} ${x} ${y}`);
    },
  };
  return { ctx, calls };
}

describe("paletteFromTokens", () => {
  it("takes every colour from the theme", () => {
    expect(palette.bg).toBe("#0a0e0a");
    expect(palette.line).toBe("#1f8f3a");
    expect(palette.index).toBe("#33ff66");
    expect(palette.ink).toBe("#6effa3");
    expect(palette.label).toBe("#ffb000");
  });

  it("names the token it could not read rather than substituting one", () => {
    expect(() => paletteFromTokens((n) => (n === "--amber" ? "" : "#fff"))).toThrow(
      ReliefPaletteError,
    );
    expect(() => paletteFromTokens((n) => (n === "--amber" ? "" : "#fff"))).toThrow(/--amber/);
  });
});

/**
 * The rule this guards is in the plan's Global Constraints and in AGENTS.md:
 * the phosphor look comes from the existing variables, not a new palette. A
 * colour literal in this file is how a second palette starts.
 */
describe("draw.ts owns no colours", () => {
  const src = readFileSync(join(process.cwd(), "lib", "tools", "relief", "draw.ts"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

  it("has no hex, rgb or hsl literal", () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\bhsla?\(/);
  });

  it("names the tokens it reads", () => {
    for (const token of ["--bg", "--green", "--green-bright", "--green-dim", "--amber"]) {
      expect(src).toContain(token);
    }
  });
});

describe("plateGeometry", () => {
  it("keeps the plate inside the width it is given", () => {
    for (const w of [320, 390, 760]) {
      const g = plateGeometry(w);
      expect(g.width).toBe(w);
      expect(g.padLeft + g.plotWidth + g.padRight).toBeLessThanOrEqual(w);
      expect(g.plotWidth).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
    }
  });

  it("drops the hour labels on a narrow phone, where they would collide", () => {
    expect(plateGeometry(320).labels).toBe(false);
    expect(plateGeometry(760).labels).toBe(true);
  });

  it("holds the field's aspect ratio, so the ground is never stretched", () => {
    const g = plateGeometry(760);
    expect(g.plotHeight / g.plotWidth).toBeCloseTo((24 - 1) / (52 - 1), 6);
  });
});

describe("planPlate", () => {
  const layers = contourLayers(buildHeightmap(demoEvents()).field);
  const geometry = plateGeometry(760);
  const ops = planPlate({ layers, geometry, palette, labels: geometry.labels });

  it("clears to the page background first", () => {
    expect(ops[0]).toEqual({
      op: "clear",
      w: geometry.width,
      h: geometry.height,
      fill: palette.bg,
    });
  });

  it("draws one polyline op per chained contour", () => {
    const drawn = ops.filter((o): o is Extract<DrawOp, { op: "polyline" }> => o.op === "polyline");
    expect(drawn.length).toBe(layers.reduce((a, l) => a + l.lines.length, 0));
    expect(drawn.length).toBeGreaterThan(0);
  });

  it("gives index contours the brighter token and a heavier pen", () => {
    const drawn = ops.filter((o): o is Extract<DrawOp, { op: "polyline" }> => o.op === "polyline");
    const strokes = new Set(drawn.map((o) => o.stroke));
    expect(strokes).toEqual(new Set([palette.line, palette.index]));
    const heavy = drawn.filter((o) => o.stroke === palette.index).map((o) => o.width);
    const light = drawn.filter((o) => o.stroke === palette.line).map((o) => o.width);
    expect(Math.min(...heavy)).toBeGreaterThan(Math.max(...light));
  });

  it("puts every point inside the plot box", () => {
    for (const op of ops) {
      if (op.op !== "polyline") continue;
      for (const p of op.points) {
        expect(p.x).toBeGreaterThanOrEqual(geometry.padLeft - 0.01);
        expect(p.x).toBeLessThanOrEqual(geometry.padLeft + geometry.plotWidth + 0.01);
        expect(p.y).toBeGreaterThanOrEqual(geometry.padTop - 0.01);
        expect(p.y).toBeLessThanOrEqual(geometry.padTop + geometry.plotHeight + 0.01);
      }
    }
  });

  it("omits every label when the geometry says there is no room", () => {
    const narrow = plateGeometry(320);
    const tight = planPlate({ layers, geometry: narrow, palette, labels: narrow.labels });
    expect(tight.some((o) => o.op === "text")).toBe(false);
  });
});

describe("hourLabels", () => {
  it("labels every sixth hour, from midnight", () => {
    expect(hourLabels(plateGeometry(760)).map((l) => l.text)).toEqual(["00", "06", "12", "18"]);
  });
});

describe("paint", () => {
  it("plays the ops onto a context and touches nothing else", () => {
    const { ctx, calls } = recorder();
    paint(ctx, [
      { op: "clear", w: 10, h: 4, fill: "BG" },
      {
        op: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 2 },
        ],
        stroke: "S",
        width: 1.5,
      },
      { op: "text", text: "00", x: 3, y: 4, fill: "L", align: "right" },
    ]);
    expect(calls).toEqual([
      "fillRect BG 0 0 10 4",
      "beginPath",
      "moveTo 0 0",
      "lineTo 1 2",
      "stroke S 1.5",
      "fillText L 00 3 4",
    ]);
  });

  it("skips a polyline with nothing in it rather than opening an empty path", () => {
    const { ctx, calls } = recorder();
    paint(ctx, [{ op: "polyline", points: [], stroke: "S", width: 1 }]);
    expect(calls).toEqual([]);
  });
});

describe("planRidgeline", () => {
  const geometry = ridgeGeometry(760);
  const ridges = ridgelines(buildHeightmap(demoEvents()).field, geometry);
  const plan = planRidgeline({ ridges, geometry, palette, labels: true });
  type Stroke = Extract<DrawOp, { op: "polyline" }>;
  const strokes = plan.ridges.flat().filter((o): o is Stroke => o.op === "polyline");

  it("clears to the page background first, before any ridge", () => {
    expect(plan.ground[0]).toEqual({ op: "clear", w: geometry.width, h: geometry.height, fill: palette.bg });
    expect(plan.ground.filter((o) => o.op === "polyline")).toEqual([]);
  });

  it("keeps one group of strokes per ridge, back to front, so it can be drawn in a ridge at a time", () => {
    expect(plan.ridges).toHaveLength(ridges.length);
    plan.ridges.forEach((ops, i) => {
      // A soft wide pass and a sharp thin one for every stretch that can be seen.
      expect(ops).toHaveLength(ridges[i].visible.length * 2);
    });
  });

  it("strokes only what the geometry says is visible, and nothing hidden", () => {
    plan.ridges.forEach((ops, i) => {
      const cores = ops.filter((_, k) => k % 2 === 1) as Stroke[];
      expect(cores.map((o) => o.points)).toEqual(ridges[i].visible);
    });
  });

  it("draws every ridge in the active phosphor, never a colour of its own", () => {
    expect(strokes.length).toBeGreaterThan(100);
    expect(new Set(strokes.map((o) => o.stroke))).toEqual(new Set([palette.index]));
  });

  it("glows: each stretch has a wider, fainter pass under the line itself", () => {
    for (const ops of plan.ridges) {
      for (let k = 0; k < ops.length; k += 2) {
        const [halo, core] = [ops[k], ops[k + 1]] as Stroke[];
        expect(halo.points).toBe(core.points);
        expect(halo.width).toBeGreaterThan(core.width * 2);
        expect(halo.alpha ?? 1).toBeLessThan((core.alpha ?? 1) / 2);
      }
    }
  });

  it("fades the far weeks a little and draws the front at full strength", () => {
    const coreAlpha = plan.ridges
      .map((ops) => (ops[1] as Stroke | undefined)?.alpha)
      .filter((a): a is number => a !== undefined);
    expect(coreAlpha).toHaveLength(ridges.length);
    expect(coreAlpha[coreAlpha.length - 1]).toBe(1);
    for (let i = 1; i < coreAlpha.length; i++) expect(coreAlpha[i]).toBeGreaterThanOrEqual(coreAlpha[i - 1]);
    // Faded, not gone: the back ridge must still clear WCAG 1.4.11's 3:1 on the
    // themes, and `app/globals.test.ts` measures --green far above that.
    expect(coreAlpha[0]).toBeGreaterThanOrEqual(0.5);
  });

  it("labels the hours along the front, centred on their hour, in the label colour", () => {
    const labels = plan.ground.filter((o): o is Extract<DrawOp, { op: "text" }> => o.op === "text");
    expect(labels.map((l) => l.text)).toEqual(["00", "06", "12", "18"]);
    for (const label of labels) {
      expect(label.fill).toBe(palette.label);
      expect(label.align).toBe("center");
      expect(label.x).toBeCloseTo(hourX(geometry, Number(label.text)), 6);
      expect(label.y).toBeGreaterThan(ridges[ridges.length - 1].baseline);
      expect(label.y).toBeLessThanOrEqual(geometry.height);
    }
    const bare = planRidgeline({ ridges, geometry, palette, labels: false });
    expect(bare.ground.some((o) => o.op === "text")).toBe(false);
  });
});

describe("paint with a fading pen", () => {
  it("sets the pen's strength for a faded stroke and restores it for everything else", () => {
    const { ctx } = recorder();
    const alphas: number[] = [];
    ctx.stroke = function stroke() {
      alphas.push(this.globalAlpha);
    };
    ctx.fillText = function fillText() {
      alphas.push(this.globalAlpha);
    };
    paint(ctx, [
      { op: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], stroke: "S", width: 1, alpha: 0.25 },
      { op: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], stroke: "S", width: 1 },
      { op: "text", text: "00", x: 0, y: 0, fill: "L", align: "center" },
    ]);
    expect(alphas).toEqual([0.25, 1, 1]);
  });
});

describe("pickPlate", () => {
  const g = plateGeometry(760);

  it("reads the week across and the hour down, snapped to the nearest cell", () => {
    expect(pickPlate(g, g.padLeft, g.padTop)).toEqual({ week: 1, hour: 0 });
    expect(pickPlate(g, g.padLeft + g.plotWidth, g.padTop + g.plotHeight)).toEqual({ week: 52, hour: 23 });
    const x = g.padLeft + (26.4 / 51) * g.plotWidth;
    const y = g.padTop + (11.6 / 23) * g.plotHeight;
    expect(pickPlate(g, x, y)).toEqual({ week: 27, hour: 12 });
  });

  it("keeps a point off the plot on its nearest edge", () => {
    expect(pickPlate(g, -40, -40)).toEqual({ week: 1, hour: 0 });
    expect(pickPlate(g, g.width + 40, g.height + 40)).toEqual({ week: 52, hour: 23 });
  });

  it("puts every cell's crosshair where picking it back gives the same cell", () => {
    for (const width of [320, 760]) {
      const plate = plateGeometry(width);
      for (let week = 1; week <= 52; week++) {
        for (let hour = 0; hour < 24; hour++) {
          const p = platePoint(plate, week, hour);
          expect(pickPlate(plate, p.x, p.y)).toEqual({ week, hour });
        }
      }
    }
  });
});
