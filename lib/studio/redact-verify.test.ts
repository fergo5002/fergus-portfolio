import { describe, expect, it } from "vitest";
import {
  INK_MAX,
  canDownload,
  darkShare,
  probeRect,
  scanProgress,
  scanReveal,
  scaleRect,
  verifyPage,
  type PageVerdict,
  type Pixels,
} from "./redact-verify";

/** A white RGBA page with black rectangles painted in, the way flatten() paints masks. */
function page(
  width: number,
  height: number,
  black: { x: number; y: number; width: number; height: number }[] = [],
): Pixels & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const r of black)
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  return { data, width, height };
}

describe("reading the reopened pixels", () => {
  it("scales a mask from the page it was drawn on to the render it is read from", () => {
    expect(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 1.5, 2)).toEqual({ x: 15, y: 40, width: 45, height: 80 });
  });

  it("probes inside the edge a resampled render softens, and never an empty box", () => {
    expect(probeRect({ x: 10, y: 10, width: 20, height: 10 }, 100, 100)).toEqual({ x: 12, y: 12, width: 16, height: 6 });
    // A thin mask still gets its middle read rather than nothing.
    const thin = probeRect({ x: 10, y: 10, width: 2, height: 2 }, 100, 100)!;
    expect(thin.width).toBeGreaterThan(0);
    expect(thin.height).toBeGreaterThan(0);
    // Clamped to the render.
    expect(probeRect({ x: 95, y: 95, width: 20, height: 20 }, 100, 100)).toEqual({ x: 97, y: 97, width: 3, height: 3 });
    expect(probeRect({ x: 200, y: 200, width: 20, height: 20 }, 100, 100)).toBeNull();
  });

  it("counts a pixel as burned only when every channel is near black", () => {
    const px = page(10, 10, [{ x: 0, y: 0, width: 10, height: 5 }]);
    expect(darkShare(px, { x: 0, y: 0, width: 10, height: 5 })).toEqual({ dark: 50, total: 50 });
    expect(darkShare(px, { x: 0, y: 0, width: 10, height: 10 })).toEqual({ dark: 50, total: 100 });
    // Dark grey ink is not a burned mask.
    const grey = page(2, 1);
    grey.data.set([INK_MAX + 1, 0, 0, 255], 0);
    grey.data.set([INK_MAX, INK_MAX, INK_MAX, 255], 4);
    expect(darkShare(grey, { x: 0, y: 0, width: 2, height: 1 })).toEqual({ dark: 1, total: 2 });
  });
});

describe("the verify pass", () => {
  const mask = { x: 100, y: 200, width: 200, height: 30 };

  it("passes a page whose every mask came back solid black and whose text layer is gone", () => {
    // Drawn at 900 wide, reopened at 900: the same pixel space.
    const v = verifyPage({
      pixels: page(900, 1160, [mask]),
      masks: [mask],
      source: { width: 900, height: 1160 },
      textBefore: 7,
      textAfter: 0,
    });
    expect(v.ok).toBe(true);
    expect(v.masks[0].solid).toBe(true);
    expect(v.textBefore).toBe(7);
    expect(v.textAfter).toBe(0);
  });

  it("reads the mask where the reopened render put it, not where it was drawn", () => {
    // An image page is reopened at 1.125 times its size.
    const scaled = scaleRect(mask, 1.125, 1.125);
    const snapped = {
      x: Math.floor(scaled.x),
      y: Math.floor(scaled.y),
      width: Math.ceil(scaled.width) + 1,
      height: Math.ceil(scaled.height) + 1,
    };
    const v = verifyPage({
      pixels: page(1013, 1305, [snapped]),
      masks: [mask],
      source: { width: 900, height: 1160 },
      textBefore: 0,
      textAfter: 0,
    });
    expect(v.masks[0].solid).toBe(true);
    // Read unscaled, the same file would have failed.
    const wrong = darkShare(page(1013, 1305, [snapped]), probeRect(mask, 1013, 1305)!);
    expect(wrong.dark).toBeLessThan(wrong.total);
  });

  it("fails a page where one light pixel survives under a mask", () => {
    const px = page(900, 1160, [mask]);
    const i = ((mask.y + 15) * 900 + mask.x + 100) * 4;
    px.data[i] = px.data[i + 1] = px.data[i + 2] = 255;
    const v = verifyPage({ pixels: px, masks: [mask], source: { width: 900, height: 1160 }, textBefore: 1, textAfter: 0 });
    expect(v.masks[0].solid).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("fails a page where the reopened file still has a text layer, even with every mask black", () => {
    const v = verifyPage({ pixels: page(900, 1160, [mask]), masks: [mask], source: { width: 900, height: 1160 }, textBefore: 3, textAfter: 1 });
    expect(v.masks[0].solid).toBe(true);
    expect(v.ok).toBe(false);
  });

  it("passes a page with no masks only on its text layer", () => {
    expect(verifyPage({ pixels: page(10, 10), masks: [], source: { width: 10, height: 10 }, textBefore: 2, textAfter: 0 }).ok).toBe(true);
    expect(verifyPage({ pixels: page(10, 10), masks: [], source: { width: 10, height: 10 }, textBefore: 2, textAfter: 2 }).ok).toBe(false);
  });
});

describe("what may be downloaded", () => {
  const good: PageVerdict = { masks: [], textBefore: 1, textAfter: 0, ok: true };
  const bad: PageVerdict = { ...good, ok: false };

  it("needs every page checked by the verify pass and inspected by the visitor", () => {
    expect(canDownload([good, good], [0, 1])).toBe(true);
    expect(canDownload([good, good], [1, 0])).toBe(true);
    expect(canDownload([good, good], [0])).toBe(false);
    expect(canDownload([good, bad], [0, 1])).toBe(false);
  });

  it("never offers a download before the verify pass has run", () => {
    expect(canDownload([], [])).toBe(false);
    expect(canDownload(null, [0])).toBe(false);
  });

  it("does not count an inspection of a page that is not there", () => {
    expect(canDownload([good], [0, 3])).toBe(true);
    expect(canDownload([good, good], [0, 0, 3])).toBe(false);
  });
});

describe("the scan line", () => {
  it("runs on the frame's own timestamp, from 0 to 1 and no further", () => {
    expect(scanProgress(1000, 1000, 1200)).toBe(0);
    expect(scanProgress(1000, 1600, 1200)).toBeCloseTo(0.5, 6);
    expect(scanProgress(1000, 9000, 1200)).toBe(1);
    expect(scanProgress(1000, 900, 1200)).toBe(0);
  });

  it("reveals each mask's verdict once the line has passed the middle of it", () => {
    const masks = [
      { x: 0, y: 100, width: 10, height: 20 },
      { x: 0, y: 500, width: 10, height: 40 },
    ];
    expect(scanReveal(masks, 0, 1000)).toEqual([false, false]);
    expect(scanReveal(masks, 0.109, 1000)).toEqual([false, false]);
    expect(scanReveal(masks, 0.11, 1000)).toEqual([true, false]);
    expect(scanReveal(masks, 0.52, 1000)).toEqual([true, true]);
    expect(scanReveal(masks, 1, 1000)).toEqual([true, true]);
  });
});
