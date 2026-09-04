import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check. Vitest runs in a `node` environment here, so the
 * shell cannot be mounted; what this proves is that the parts the programme's
 * interface block names are present, in the order it names them, and that the
 * words come from `content/` rather than from this file.
 *
 * `lib/seo.test.ts` proves the schema node, `content/tools/index.test.ts` pins
 * the privacy strings. This is the glue between them.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const src = read("components", "tools", "ToolPage.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
const css = read("app", "globals.css");

describe("ToolPage renders the shell in the interface's order", () => {
  const marks = [
    "<JsonLd",
    "<PromptLine",
    'className="page__title"',
    "<Scramble text={tool.slug}",
    'className="page__lede">{tool.blurb}',
    'className="tool__privacy">{tool.privacyLine ?? toolShellCopy.privacy[tool.privacy]}',
    'className="tool__privacynote">{tool.privacyNote}',
    "{children}",
    'className="tool__cantsee"',
    "{tool.cantSee.map(",
  ];

  it("has every part", () => {
    for (const mark of marks) expect(src, mark).toContain(mark);
  });

  it("in that order", () => {
    const positions = marks.map((m) => src.indexOf(m));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("builds its JSON-LD from the registry entry", () => {
    expect(src).toMatch(/toolPageSchema\(tool, extraSchema\)/);
    expect(src).toMatch(/breadcrumbSchema\(/);
  });

  it("carries no copy of its own", () => {
    // The privacy lines and the heading live in content/tools/index.ts.
    expect(src).not.toContain("Runs in your browser");
    expect(src).not.toContain("Runs on the server");
    expect(src).not.toContain('"Can\'t see"');
    expect(src).toContain("toolShellCopy.cantSeeHeading");
  });

  it("renders the call to action last, and only when asked", () => {
    expect(src).toMatch(/\{talk \? <Talk line=\{talk\} \/> : null\}/);
    expect(src.indexOf("{talk ?")).toBeGreaterThan(src.indexOf('className="tool__cantsee"'));
  });
});

describe("the stylesheet has the shell's rules", () => {
  it("styles the privacy line and the can't see list", () => {
    for (const selector of [".tool__privacy", ".tool__cantsee", ".tool__cantsee-title", ".tool__cantsee-item"]) {
      expect(css, selector).toMatch(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
    }
  });
});
