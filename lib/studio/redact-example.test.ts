import { describe, expect, it } from "vitest";
import { EXAMPLE_PAGE, drawExample, exampleMask, exampleSheet, EXAMPLE_ADVANCE } from "./redact-example";
import { redactCopy } from "@/content/studio/redact";

/**
 * The example invoice is drawn twice from one layout: as an inline SVG the
 * server renders (so the document is on the page before any script), and on
 * a canvas when the clean copy is built. Neither measures a font. Every run
 * is forced to the width this layout gives it, so the text boxes the find
 * line lights, the mask drawn on it and both drawings agree to the pixel.
 */
describe("the example sheet", () => {
  const sheet = exampleSheet();

  it("is the page size the editor and the export both assume", () => {
    expect(EXAMPLE_PAGE).toMatchObject({ width: 900, height: 1160, pointsWidth: 600 });
    expect(EXAMPLE_PAGE.pointsHeight).toBeCloseTo((1160 * 600) / 900, 2);
  });

  it("lays out every sample line from the copy, one run each, at a fixed advance", () => {
    expect(sheet.lines.map((l) => l.text)).toEqual(redactCopy.sample);
    for (const line of sheet.lines) {
      expect(line.width).toBeCloseTo(line.text.length * EXAMPLE_ADVANCE, 6);
    }
    // The lines step down the page and never overlap.
    const ys = sheet.lines.map((l) => l.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(Math.min(...ys.slice(1).map((y, i) => y - ys[i]))).toBeGreaterThan(40);
  });

  it("gives find one whole text box per line, like a PDF text item, wrapping the run it came from", () => {
    expect(sheet.text).toHaveLength(redactCopy.sample.length);
    sheet.text.forEach((box, i) => {
      const line = sheet.lines[i];
      expect(box.text).toBe(line.text);
      expect(box.x).toBeLessThan(line.x);
      expect(box.x + box.width).toBeGreaterThan(line.x + line.width);
      // Ascenders above the baseline, descenders below it.
      expect(box.y).toBeLessThan(line.y - 16);
      expect(box.y + box.height).toBeGreaterThan(line.y + 5);
    });
  });

  it("keeps every box and the frame inside the page", () => {
    for (const box of sheet.text) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(EXAMPLE_PAGE.width);
      expect(box.y + box.height).toBeLessThanOrEqual(EXAMPLE_PAGE.height);
    }
    const f = sheet.frame;
    expect(f.x + f.width).toBeLessThanOrEqual(EXAMPLE_PAGE.width);
    expect(f.y + f.height).toBeLessThanOrEqual(EXAMPLE_PAGE.height);
  });
});

describe("the canvas drawing", () => {
  it("stretches every run to its layout width, as the SVG's textLength does, in the face it was given", () => {
    const calls: string[] = [];
    let font = "";
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
      scale: (x: number, y: number) => calls.push(`scale ${x.toFixed(4)} ${y}`),
      fillText: (t: string) => calls.push(`text ${t} in ${font}`),
      // A face whose advance is 0.55em: narrower than the layout's 0.6em.
      measureText: (t: string) => ({ width: t.length * 0.55 * parseFloat(font.replace(/^700 /, "")) }) as TextMetrics,
      fillRect: () => calls.push("fill"),
      strokeRect: () => calls.push("frame"),
      get font() {
        return font;
      },
      set font(v: string) {
        font = v;
      },
      fillStyle: "" as unknown,
      strokeStyle: "" as unknown,
      lineWidth: 0,
    };
    const sheet = exampleSheet();
    drawExample(ctx, sheet, "Mono Test");
    const scales = calls.filter((c) => c.startsWith("scale"));
    expect(scales).toHaveLength(sheet.lines.length + 1);
    for (const s of scales) expect(s).toBe(`scale ${(0.6 / 0.55).toFixed(4)} 1`);
    expect(calls).toContain(`text ${sheet.lines[0].text} in 22px Mono Test`);
    expect(calls).toContain(`text ${sheet.title.text} in 700 38px Mono Test`);
    expect(calls).toContain(`translate ${sheet.lines[1].x} ${sheet.lines[1].y}`);
  });
});

describe("the mask the example opens with", () => {
  const sheet = exampleSheet();
  const email = sheet.lines.find((l) => l.text.includes("@"))!;
  const mask = exampleMask(sheet);

  it("sits on the email line", () => {
    expect(email).toBeDefined();
    const box = sheet.text.find((b) => b.text === email.text)!;
    expect(mask.y).toBe(box.y);
    expect(mask.height).toBe(box.height);
  });

  it("covers the address and leaves its label readable", () => {
    const label = email.text.indexOf(": ") + 2;
    const valueStart = email.x + label * EXAMPLE_ADVANCE;
    // Starts in the gap after the colon, so "Email:" stays in the clear...
    expect(mask.x).toBeGreaterThan(email.x + (label - 2) * EXAMPLE_ADVANCE);
    expect(mask.x).toBeLessThan(valueStart);
    // ...and runs past the last character of the address.
    expect(mask.x + mask.width).toBeGreaterThan(email.x + email.width);
  });

  it("is whole pixels, which is what the editor's own masks are", () => {
    for (const n of [mask.x, mask.y, mask.width, mask.height]) expect(Number.isInteger(n)).toBe(true);
  });
});
