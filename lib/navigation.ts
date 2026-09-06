/**
 * Whether a component mounting right now is the hydration of a page the
 * visitor has already been looking at, or a genuinely new page.
 *
 * The rule this decides for: **animate only what the visitor has not seen.**
 *
 * Measured with a real GPU on 2026-09-06: on a hard load the page painted at
 * a few hundred milliseconds and hydration landed at 2.5 seconds (4 on a
 * throttled Pixel). At that moment every mount-time effect ran for the first
 * time: the page title and the hero name flipped from readable text to
 * scrambled glyphs and decoded again, and the raster blocks, which the
 * stylesheet had been holding at opacity 0 behind the pre-paint `js` flag,
 * appeared from nothing. On /experience and /projects that was a heading over
 * a blank page for as long as hydration took.
 *
 * Two facts decide it. Time since navigation start says whether the document
 * has been on screen long enough to have been read; `LATE_HYDRATION_MS` is
 * the threshold, and it is deliberately short, because even a fast hydration
 * on a fast connection lands after first paint. And whether the visitor has
 * navigated inside the site since: a client-side route change mounts a page
 * nobody has seen, however long the tab has been open, so after the first one
 * nothing is ever "late" again.
 *
 * `markNavigated` also stamps `navigated` on `<html>`, which is what the
 * stylesheet keys the reveal pre-hide on. Module level, never persisted: a
 * reload is a hard load.
 */
export const LATE_HYDRATION_MS = 400;

let navigated = false;

export function markNavigated(): void {
  navigated = true;
  if (typeof document !== "undefined") document.documentElement.classList.add("navigated");
}

export function hasNavigated(): boolean {
  return navigated;
}

export function isLateHydration(now: number = performance.now()): boolean {
  return !navigated && now > LATE_HYDRATION_MS;
}

export function resetNavigationForTests(): void {
  navigated = false;
  if (typeof document !== "undefined") document.documentElement.classList.remove("navigated");
}
