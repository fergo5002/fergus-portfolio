import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The index cards' live previews follow the same rules as the arcade's attract
 * screens (`components/arcade/arcade.test.ts`), because five of them on one
 * page would otherwise spend the frame budget the tube itself needs:
 *
 *   - the site's one frame clock (`onFrame`), never a loop of their own
 *   - an IntersectionObserver gate, so a card off screen costs nothing
 *   - half rate on a coarse pointer
 *   - no subscription at all under reduced motion: the server's frame stays
 *   - no React state from inside a frame
 *
 * Source greps with comments stripped. The scenes themselves are tested as
 * values in `lib/tools/attract.test.ts`.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const src = read("components", "tools", "ToolPreview.tsx");
const page = read("app", "tools", "page.tsx");
const css = read("components", "tools", "workbench.css");

describe("the preview runs on the one frame clock", () => {
  it("is a client component that subscribes to onFrame and cleans up", () => {
    expect(src.startsWith('"use client"')).toBe(true);
    expect(src).toMatch(/onFrame\(/);
    expect(src).toMatch(/unsubscribe\(\)/);
    expect(src).not.toMatch(/requestAnimationFrame|setInterval|setTimeout/);
  });

  it("never calls setState from inside the frame callback", () => {
    const match = /onFrame\(\([^)]*\) => \{([\s\S]*?)\n {4}\}\);/.exec(src);
    expect(match, "frame callback not found").toBeTruthy();
    expect(match![1]).not.toMatch(/set[A-Z]\w*\(/);
  });

  it("runs only while on screen", () => {
    expect(src).toMatch(/new IntersectionObserver\(/);
    expect(src).toMatch(/if \(!visibleRef\.current\) return;/);
  });

  it("halves its rate on a coarse pointer", () => {
    expect(src).toMatch(/\(pointer: coarse\)/);
    expect(src).toMatch(/if \(coarse && parity\) return;/);
  });

  it("does not subscribe at all under reduced motion, so the first frame stays", () => {
    expect(src).toMatch(/if \(reducedMotion\) return;[\s\S]*onFrame\(/);
  });

  it("animates by elapsed time, not by counting frames", () => {
    expect(src).toMatch(/elapsed \+= dt \/ 1000/);
  });

  it("draws the server frame from the same pure scene it animates", () => {
    expect(src).toMatch(/scene\(slug, 0\)/);
    expect(src).toMatch(/scene\(slug, elapsed\)/);
  });

  it("is decoration: hidden from assistive technology, with no text of its own", () => {
    expect(src).toMatch(/<svg[\s\S]*?aria-hidden="true"/);
    expect(src).not.toMatch(/<text/);
  });
});

describe("the index uses it", () => {
  it("puts a live preview and the tool's one sentence on every card", () => {
    expect(page).toMatch(/<ToolPreview slug=\{row\.slug\}/);
    expect(page).toContain("{row.purpose}");
    expect(page).not.toMatch(/eyebrow/i);
  });

  it("paints every preview class from the theme tokens", () => {
    for (const cls of ["grid", "line", "node", "hub", "signal", "page", "text", "mask", "scan", "cell", "contour", "step"]) {
      expect(css, cls).toMatch(new RegExp(`\\.bench-attract__${cls}\\b`));
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
