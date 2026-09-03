import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check. The page cannot be mounted here (node environment),
 * so this proves three things by reading the files: the page renders through
 * `ToolPage` rather than assembling its own shell, its stylesheet is its own
 * file, and the shell's stylesheet no longer carries a rule that belongs to
 * this tool. The behavioural proof is Task 8's production-build check.
 */
const dir = join(process.cwd(), "app", "tools", "headline-check");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const page = read("page.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("headline-check renders through the shell", () => {
  it("uses ToolPage with its registry entry", () => {
    expect(page).toMatch(/import ToolPage from "@\/components\/tools\/ToolPage"/);
    expect(page).toMatch(/import \{ headlineCheck as tool \} from "@\/content\/tools\/headline-check"/);
    expect(page).toMatch(/<ToolPage\s+tool=\{tool\}/);
  });

  it("keeps the article edge on the graph", () => {
    expect(page).toMatch(/extraSchema=\{\{ isBasedOn: absolute\(ARTICLE_PATH\) \}\}/);
  });

  it("assembles no shell of its own", () => {
    for (const forbidden of ["<PromptLine", 'className="page__title"', "<JsonLd", "breadcrumbSchema("]) {
      expect(page, forbidden).not.toContain(forbidden);
    }
  });

  it("still renders the form and the why section", () => {
    expect(page).toContain("<HeadlineForm />");
    expect(page).toContain('className="hcheck__why"');
  });
});

describe("headline-check owns its stylesheet", () => {
  it("imports tool.css", () => {
    expect(page).toMatch(/import "\.\/tool\.css";/);
    expect(existsSync(join(dir, "tool.css"))).toBe(true);
  });

  it("has the checker's rules in it, motion gated", () => {
    const css = read("tool.css");
    expect(css).toMatch(/^\.hcheck__input\s*\{/m);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(css).toMatch(/@keyframes hcheck-arrive/);
  });

  it("left nothing of itself in globals.css", () => {
    expect(globals).not.toMatch(/^\.hcheck/m);
    expect(globals).not.toContain("@keyframes hcheck-");
  });
});
