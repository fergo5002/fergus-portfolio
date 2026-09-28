import { describe, expect, it } from "vitest";
import { ATTRACT_SLUGS, VIEW, scene, type Primitive } from "./attract";

/**
 * The index cards' live previews, as data. Each is a scene: a fixed list of
 * SVG primitives whose attributes are a pure function of elapsed seconds.
 * The component renders the scene at t = 0 on the server (so the first paint
 * and a reduced-motion visit both show a real picture) and then rewrites the
 * same elements' attributes from the site's one frame clock. That only works
 * if the list never changes shape, so that is the first thing pinned here.
 */

const numbers = (p: Primitive) =>
  Object.entries(p)
    .filter(([key, value]) => key !== "kind" && key !== "cls" && typeof value === "number")
    .map(([key, value]) => [key, value as number] as const);

describe.each(ATTRACT_SLUGS.map((slug) => [slug]))("preview: %s", (slug) => {
  const at = (t: number) => scene(slug, t);

  it("has something to draw", () => {
    expect(at(0).length).toBeGreaterThan(5);
  });

  it("keeps the same primitives in the same order at every moment", () => {
    const shape = (list: Primitive[]) => list.map((p) => `${p.kind}:${p.cls}`).join(",");
    for (const t of [0.4, 3.7, 12.25, 61.5, 600]) expect(shape(at(t)), `t=${t}`).toBe(shape(at(0)));
  });

  it("is deterministic, so the server and the browser draw the same first frame", () => {
    expect(at(0)).toEqual(at(0));
    expect(at(8.5)).toEqual(at(8.5));
  });

  it("moves, so it is a live preview and not a picture", () => {
    expect(at(1.3)).not.toEqual(at(0));
  });

  it("stays inside its frame with sane opacities at every moment", () => {
    for (const t of [0, 0.9, 2.2, 5.5, 13.1, 47.3, 300.7]) {
      for (const p of at(t)) {
        for (const [key, value] of numbers(p)) {
          expect(Number.isFinite(value), `${key} at t=${t}`).toBe(true);
          if (key === "opacity") {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          } else if (key.startsWith("x") || key === "cx") {
            expect(value, `${p.kind}.${key} at t=${t}`).toBeGreaterThanOrEqual(-1);
            expect(value, `${p.kind}.${key} at t=${t}`).toBeLessThanOrEqual(VIEW.w + 1);
          } else if (key.startsWith("y") || key === "cy") {
            expect(value, `${p.kind}.${key} at t=${t}`).toBeGreaterThanOrEqual(-1);
            expect(value, `${p.kind}.${key} at t=${t}`).toBeLessThanOrEqual(VIEW.h + 1);
          } else if (key === "width" || key === "height" || key === "r") {
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("writes short numbers, so a frame is cheap to apply", () => {
    for (const p of at(7.77)) {
      for (const [key, value] of numbers(p)) expect(String(value).replace("-", "").length, key).toBeLessThanOrEqual(7);
    }
  });

  it("names its classes for the stylesheet, never a colour", () => {
    for (const p of at(0)) {
      expect(p.cls).toMatch(/^bench-attract__[a-z-]+$/);
      expect(JSON.stringify(p)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb/i);
    }
  });
});

describe("the scenes", () => {
  it("cover the five tools on the shelf", () => {
    expect([...ATTRACT_SLUGS].sort()).toEqual(["atlas", "group-lore", "pocket-redact", "relief", "resonance"]);
  });

  it("fall back to a quiet grid for any other slug rather than throwing", () => {
    expect(scene("no-such-tool", 3).every((p) => p.cls === "bench-attract__grid")).toBe(true);
  });
});
