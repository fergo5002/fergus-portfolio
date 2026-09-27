import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check. Vitest runs in a `node` environment here, so the
 * shell cannot be mounted; what this proves is that the instrument shell's
 * parts are present, in the order the redesign fixed, and that the words come
 * from `content/` rather than from this file.
 *
 * The order is the point of the redesign: the slug heading, ONE sentence of
 * purpose, then the tool running on its example at full width, then a single
 * privacy line under the stage, then everything secondary in one disclosure.
 * The old shell put a blurb, a privacy box and a second in-studio hero above
 * the visual; this fails if any of that creeps back above the stage.
 *
 * `lib/seo.test.ts` proves the schema node, `content/tools/index.test.ts` pins
 * the privacy strings. This is the glue between them.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");
const src = read("components", "tools", "ToolPage.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
const css = read("components", "tools", "workbench.css").replace(/\/\*[\s\S]*?\*\//g, " ");
const globals = read("app", "globals.css");

describe("ToolPage renders the instrument shell in order", () => {
  const marks = [
    "<JsonLd",
    "<PromptLine",
    'className="bench-back"',
    'className="page__title"',
    "<Scramble text={tool.slug}",
    'className="page__lede">{tool.purpose ?? tool.blurb}',
    'className="bench-stage"',
    "{children}",
    'className="tool__privacy"',
    "{tool.privacyLine ?? toolShellCopy.privacy[tool.privacy]}",
    'className="bench-disclosure tool__cantsee"',
    'className="tool__privacynote">{tool.privacyNote}',
    "tool.method?.map(",
    "{notes}",
    "{tool.cantSee.map(",
  ];

  it("has every part", () => {
    for (const mark of marks) expect(src, mark).toContain(mark);
  });

  it("in that order", () => {
    const positions = marks.map((m) => src.indexOf(m));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("puts nothing between the one sentence and the stage", () => {
    const lede = src.indexOf('className="page__lede"');
    const stage = src.indexOf('className="bench-stage"');
    const between = src.slice(src.indexOf("</p>", lede) + 4, stage);
    // Closing the header is the only thing allowed between them.
    expect(between.replace(/<\/header>/, "").replace(/<div\s*$/, "").trim()).toBe("");
  });

  it("has exactly one disclosure, and no second hero, eyebrow or privacy box above the stage", () => {
    expect(src.match(/<details/g)).toHaveLength(1);
    expect(src).not.toMatch(/eyebrow/i);
    const aboveStage = src.slice(0, src.indexOf('className="bench-stage"'));
    expect(aboveStage).not.toContain("tool__privacy");
    expect(aboveStage).not.toContain("<h2");
  });

  it("draws the privacy line's lock as an SVG with no text in it", () => {
    const privacy = src.slice(src.indexOf('className="tool__privacy"'), src.indexOf("toolShellCopy.privacy[tool.privacy]"));
    expect(privacy).toMatch(/<svg[^>]*className="bench-lock"[^>]*aria-hidden="true"/);
    expect(privacy).not.toMatch(/<text/);
  });

  it("builds its JSON-LD from the registry entry", () => {
    expect(src).toMatch(/toolPageSchema\(tool, extraSchema\)/);
    expect(src).toMatch(/breadcrumbSchema\(/);
  });

  it("carries no copy of its own", () => {
    // The privacy lines, the headings and the disclosure summary live in content/.
    expect(src).not.toContain("Runs in your browser");
    expect(src).not.toContain("Runs on the server");
    expect(src).not.toContain('"Can\'t see"');
    expect(src).toContain("toolShellCopy.cantSeeHeading");
    expect(src).toContain("toolShellCopy.disclosure");
  });

  it("renders the call to action last, and only when asked", () => {
    expect(src).toMatch(/\{talk \? <Talk line=\{talk\} \/> : null\}/);
    expect(src.indexOf("{talk ?")).toBeGreaterThan(src.indexOf("{tool.cantSee.map("));
  });

  it("stays a server component", () => {
    expect(src).not.toContain('"use client"');
  });
});

describe("the stylesheets", () => {
  it("globals.css still carries the shell's base rules, which workbench.css builds on", () => {
    for (const selector of [".tool__privacy", ".tool__cantsee", ".tool__cantsee-title", ".tool__cantsee-item"]) {
      expect(globals, selector).toMatch(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
    }
  });

  it("workbench.css gives the stage the full width and the disclosure a 44px summary", () => {
    expect(css).toMatch(/\.bench-stage\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.bench-disclosure > summary\s*\{[^}]*min-height:\s*44px/);
  });

  it("workbench.css takes every colour from the tokens and has no eyebrow", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/eyebrow/i);
    expect(css).not.toMatch(/color:\s*var\(--green-(dim|faint)\)/);
  });
});
