import { describe, it, expect, beforeEach } from "vitest";
import { LATE_HYDRATION_MS, isLateHydration, markNavigated, resetNavigationForTests } from "./navigation";

/**
 * Whether a component mounting right now is the hydration of a page the
 * visitor has already been looking at. Measured with a real GPU on
 * 2026-09-06: hydration landed 2.5s after navigation on the desktop and 4s on
 * a throttled Pixel, and at that moment the title flipped to scrambled glyphs
 * and every reveal block appeared from nothing. Nothing that has been seen may
 * be re-hidden or re-scrambled.
 */
describe("late hydration", () => {
  beforeEach(() => resetNavigationForTests());

  it("is late when the document painted long before the effect ran", () => {
    expect(isLateHydration(LATE_HYDRATION_MS + 1)).toBe(true);
  });

  it("is not late on a fast hydration, where nothing has been read yet", () => {
    expect(isLateHydration(LATE_HYDRATION_MS - 1)).toBe(false);
  });

  it("is never late once the visitor has navigated inside the site", () => {
    markNavigated();
    expect(isLateHydration(60_000)).toBe(false);
  });
});
