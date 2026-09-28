import { describe, expect, it } from "vitest";
import { articles } from "@/content/articles";
import { FIGURE_VIEWBOX, articleFigures, figureBounds } from "./writing-figures";

describe("the writing index figures", () => {
  it("draw every published article, so a new piece cannot ship without one", () => {
    for (const article of articles) expect(articleFigures[article.slug], article.slug).toBeDefined();
  });

  it("draw nothing for an article that is not published", () => {
    const published = new Set(articles.map((a) => a.slug));
    for (const slug of Object.keys(articleFigures)) expect(published.has(slug), slug).toBe(true);
  });

  it("stay inside their frame", () => {
    for (const [slug, parts] of Object.entries(articleFigures)) {
      const b = figureBounds(parts);
      expect(b.minX, slug).toBeGreaterThanOrEqual(0);
      expect(b.minY, slug).toBeGreaterThanOrEqual(0);
      expect(b.maxX, slug).toBeLessThanOrEqual(FIGURE_VIEWBOX.w);
      expect(b.maxY, slug).toBeLessThanOrEqual(FIGURE_VIEWBOX.h);
    }
  });

  it("carry exactly one accent each, the thing the eye should land on first", () => {
    for (const [slug, parts] of Object.entries(articleFigures)) {
      const accents = parts.filter((p) => p.tone === "accent");
      expect(accents.length, slug).toBeGreaterThan(0);
      // One idea in amber, however many marks it takes to draw it.
      expect(new Set(accents.map((p) => p.group ?? "accent")).size, slug).toBe(1);
    }
  });
});

describe("figureBounds", () => {
  it("measures circles, rects and absolute path coordinates", () => {
    expect(
      figureBounds([
        { kind: "circle", cx: 10, cy: 10, r: 4 },
        { kind: "rect", x: 20, y: 5, w: 10, h: 30 },
        { kind: "path", d: "M2 50 H90 V60" },
      ]),
    ).toEqual({ minX: 2, minY: 5, maxX: 90, maxY: 60 });
  });
});
