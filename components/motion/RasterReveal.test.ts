import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const raster = read("components", "motion", "RasterReveal.tsx");
const scramble = read("components", "Scramble.tsx");
const hero = read("components", "motion", "HeroName.tsx");
const route = read("components", "system", "RouteTransition.tsx");

/**
 * Source-coupling checks for the rule in `lib/navigation.ts`: animate only
 * what the visitor has not seen. vitest runs in node here, so these grep; the
 * behaviour is proved by the headed-browser scramble timeline recorded in
 * docs/PROGRESS.md.
 */
describe("animate only what the visitor has not seen", () => {
  it("every mount-time effect asks whether this is a late hydration", () => {
    for (const [name, src] of [
      ["RasterReveal", raster],
      ["Scramble", scramble],
      ["HeroName", hero],
    ]) {
      expect(src, `${name} does not consult isLateHydration`).toContain("isLateHydration()");
    }
  });

  it("the reveal shows an on-screen block at once, without the animation", () => {
    expect(raster).toContain('"is-instant"');
    expect(raster).toContain('"is-unseen"');
  });

  it("the route transition is what marks an in-site navigation", () => {
    expect(route).toContain("markNavigated()");
  });
});

describe("scrolled past during a slow hydration counts as seen (review, 2026-09-06)", () => {
  // A visitor waiting four seconds for the JavaScript scrolls. When the effect
  // finally runs, a block above the viewport has been on screen already;
  // marking it unseen would hide content they read a moment ago, until they
  // scrolled back up. Only a block still below the fold is genuinely unseen.
  it("the reveal hides only what is still below the fold", () => {
    const late = raster.slice(raster.indexOf("if (isLateHydration())"), raster.indexOf('el.classList.add("is-unseen")'));
    expect(late).toContain("rect.top < window.innerHeight");
    expect(late).not.toContain("rect.bottom > 0");
  });

  it("a view-triggered heading already on or above the screen is left readable", () => {
    const view = scramble.slice(scramble.indexOf('trigger === "view"'));
    expect(view).toContain("isLateHydration()");
    expect(view).toContain("getBoundingClientRect().top < window.innerHeight");
  });
});
