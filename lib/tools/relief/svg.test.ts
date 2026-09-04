import { describe, it, expect } from "vitest";
import { contourLayers } from "./contour";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import { HOURS, WEEKS } from "./types";
import { A4_LANDSCAPE, fitToSheet, pathData, plotterSvg } from "./svg";

const layers = contourLayers(buildHeightmap(demoEvents()).field);
const svg = plotterSvg(layers);

describe("fitToSheet", () => {
  const fit = fitToSheet(WEEKS, HOURS, A4_LANDSCAPE);

  it("fits inside the margins on both axes", () => {
    expect(fit.offsetX).toBeGreaterThanOrEqual(A4_LANDSCAPE.marginMm - 0.001);
    expect(fit.offsetY).toBeGreaterThanOrEqual(A4_LANDSCAPE.marginMm - 0.001);
    expect(fit.offsetX + fit.widthMm).toBeLessThanOrEqual(
      A4_LANDSCAPE.widthMm - A4_LANDSCAPE.marginMm + 0.001,
    );
    expect(fit.offsetY + fit.heightMm).toBeLessThanOrEqual(
      A4_LANDSCAPE.heightMm - A4_LANDSCAPE.marginMm + 0.001,
    );
  });

  it("uses one scale for both axes, so the ground is not stretched", () => {
    expect(fit.widthMm / (WEEKS - 1)).toBeCloseTo(fit.heightMm / (HOURS - 1), 9);
  });

  it("centres what is left over", () => {
    const inner = A4_LANDSCAPE.heightMm - 2 * A4_LANDSCAPE.marginMm;
    expect(fit.offsetY - A4_LANDSCAPE.marginMm).toBeCloseTo((inner - fit.heightMm) / 2, 9);
  });
});

describe("pathData", () => {
  const fit = fitToSheet(WEEKS, HOURS, A4_LANDSCAPE);

  it("closes a ring with Z and does not repeat the first point", () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ];
    const d = pathData(ring, fit);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/L/g) ?? []).toHaveLength(2);
  });

  it("leaves an open line open", () => {
    const open = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ];
    const d = pathData(open, fit);
    expect(d.endsWith("Z")).toBe(false);
    expect(d.match(/L/g) ?? []).toHaveLength(2);
  });

  it("rounds to hundredths of a millimetre, which is finer than any plotter", () => {
    for (const n of pathData(
      [
        { x: 1 / 3, y: 2 / 7 },
        { x: 1, y: 1 },
      ],
      fit,
    ).matchAll(/-?\d+\.?\d*/g)) {
      const decimals = (n[0].split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});

describe("plotterSvg", () => {
  it("declares real millimetres and a matching viewBox", () => {
    expect(svg).toContain('width="297mm"');
    expect(svg).toContain('height="210mm"');
    expect(svg).toContain('viewBox="0 0 297 210"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("fills nothing, anywhere", () => {
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/fill="(?!none)/);
  });

  it("carries no style, opacity, gradient or filter for a toolchain to drop", () => {
    for (const banned of ["style=", "opacity", "<linearGradient", "<filter", "<style"]) {
      expect(svg, banned).not.toContain(banned);
    }
  });

  it("has no text, because a plotter has no font", () => {
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("<tspan");
  });

  it("uses one pen width", () => {
    const widths = new Set([...svg.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]));
    expect(widths.size).toBe(1);
  });

  it("writes one path per chained polyline and not one per segment", () => {
    const paths = (svg.match(/<path /g) ?? []).length;
    const lines = layers.reduce((a, l) => a + l.lines.length, 0);
    // Every polyline, plus the neatline.
    expect(paths).toBe(lines + 1);
  });

  it("groups by level so a pen can be assigned per layer", () => {
    const groups = [...svg.matchAll(/<g id="level-(\d)" data-level="([\d.]+)"/g)];
    expect(groups).toHaveLength(layers.length);
    expect(groups.map((m) => Number(m[2]))).toEqual(layers.map((l) => l.level));
  });

  it("draws a neatline around the plot", () => {
    expect(svg).toContain('id="neatline"');
  });

  it("is well formed enough to open, and one element deep at the root", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
  });

  it("survives having nothing to draw", () => {
    const empty = plotterSvg([]);
    expect(empty).toContain("<svg");
    expect(empty).toContain('id="neatline"');
  });
});
