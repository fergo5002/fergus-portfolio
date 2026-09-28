import { describe, expect, it } from "vitest";
import { previewPlacement } from "./preview-placement";

// A 900px viewport with the fixed status strip taking the bottom 48px.
const base = { viewportHeight: 900, reservedBottom: 48, panelHeight: 300, gap: 8 };

describe("previewPlacement", () => {
  it("opens below when the whole panel fits above the status strip", () => {
    expect(previewPlacement({ ...base, anchorTop: 100, anchorBottom: 144 })).toBe("below");
  });

  it("flips above when opening below would run under the status strip", () => {
    // 600 + 8 + 300 = 908 > 900 - 48
    expect(previewPlacement({ ...base, anchorTop: 556, anchorBottom: 600 })).toBe("above");
  });

  it("counts the status strip, not just the viewport edge", () => {
    // 520 + 8 + 300 = 828: inside the viewport, but under a 48px strip at 852.
    expect(previewPlacement({ ...base, anchorTop: 476, anchorBottom: 520 })).toBe("below");
    expect(previewPlacement({ ...base, anchorTop: 506, anchorBottom: 550 })).toBe("above");
  });

  it("stays below when neither side has room but below has more", () => {
    expect(previewPlacement({ ...base, viewportHeight: 400, anchorTop: 60, anchorBottom: 100 })).toBe("below");
  });

  it("counts the fixed nav at the top before flipping above", () => {
    // Floor 652. Below: 652 - 364 - 8 = 280, too little for 300. Above: 312 of
    // viewport, which fits, but only 268 under a 44px nav, which does not, and
    // then below's 280 is the bigger room.
    expect(previewPlacement({ ...base, reservedTop: 0, viewportHeight: 700, anchorTop: 320, anchorBottom: 364 })).toBe("above");
    expect(previewPlacement({ ...base, reservedTop: 44, viewportHeight: 700, anchorTop: 320, anchorBottom: 364 })).toBe("below");
  });

  it("goes above when neither side has room but above has more", () => {
    expect(previewPlacement({ ...base, viewportHeight: 400, anchorTop: 300, anchorBottom: 340 })).toBe("above");
  });
});
