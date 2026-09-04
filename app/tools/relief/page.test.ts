import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools } from "@/content/tools";

/**
 * A source-coupling check, not a render.
 *
 * `vitest.config.ts` runs in a node environment with no jsdom, so no React on
 * this route can be mounted. These assert on the source text in the shape of
 * `lib/boot.test.ts`, and everything they cannot see is Task 12's and Task
 * 13's job.
 *
 * Line endings are normalised first. This is a Windows checkout with autocrlf,
 * so a match written with a bare newline is red here and green in CI for no
 * real reason.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

const page = read("app", "tools", "relief", "page.tsx");

describe("the page", () => {
  it("renders through the shared tool shell", () => {
    expect(page).toContain('from "@/components/tools/ToolPage"');
    expect(page).toMatch(/<ToolPage[\s\S]*tool=\{relief\}/);
  });

  it("takes its metadata off the registry entry rather than restating it", () => {
    expect(page).toContain("description: relief.blurb");
    expect(page).toContain("canonical(PATH)");
    expect(page).not.toContain("A year of your activity");
  });

  it("imports its own stylesheet and leaves globals.css alone", () => {
    expect(page).toContain('import "./tool.css"');
  });

  it("holds no state and computes no demo", () => {
    // The demo is a seed and a generator, so it is built in the client island
    // on both renders instead of being serialised into the RSC payload.
    expect(page).not.toContain("useState");
    expect(page).not.toContain("demoEvents");
  });

  it("is listed as a live tool, so the sitemap and llms.txt pick it up", () => {
    expect(liveTools.map((t) => t.slug)).toContain("relief");
  });
});
