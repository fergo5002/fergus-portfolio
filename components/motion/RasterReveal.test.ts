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
