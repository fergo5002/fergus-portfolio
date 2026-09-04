import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-coupling checks, not renders. vitest is in a node environment here so
 * nothing can mount React. Each assertion below is a wiring fact that no unit
 * test can reach, and every one of them is a way this tool could look right
 * and be wrong.
 *
 * Both files are normalised to LF first. This is a Windows checkout with
 * autocrlf, so a pattern that crosses a line break is red here and green in CI
 * for no real reason.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const source = read("app", "tools", "overlap", "OverlapTool.tsx");
const css = read("app", "tools", "overlap", "tool.css");

describe("the island is wiring and nothing else", () => {
  it("builds no sentence of its own", () => {
    // Every visible string comes from content. A quoted sentence in here would
    // be copy outside the voice lint.
    const body = source.slice(source.indexOf("export default function"));
    const sentences = [...body.matchAll(/"[A-Z][^"]{25,}"/g)].map((m) => m[0]);
    expect(sentences).toEqual([]);
  });

  it("opens on the demo and runs the real exchange for it", () => {
    expect(source).toContain('useState<Panel>("demo")');
    expect(source).toContain("runDemo()");
  });

  it("records one tool_run per path out, rounded, and never the input", () => {
    const calls = [...source.matchAll(/trackToolRun\(\{[^}]*\}\)/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      expect(call).toContain('tool: "overlap"');
      expect(call).toContain("round100(");
      expect(call).not.toMatch(/entries|slug|label|counts|code/);
    }
    expect(source).toMatch(/outcome: "ok"/);
    expect(source).toMatch(/outcome: "refused"/);
    expect(source).toMatch(/outcome: "error"/);
  });

  it("rounds the duration before sending it, because a precise one leaks the list size", () => {
    expect(source).toMatch(/const round100 = \(ms: number\) => Math\.round\(ms \/ 100\) \* 100;/);
  });

  it("falls through to copy and paste when the relay is unavailable", () => {
    expect(source).toMatch(/error === "relay-unavailable"[\s\S]{0,160}setPasteOpen\(true\)/);
    // And it stops offering codes, rather than leaving a button that cannot work.
    expect(source).toMatch(/setCodesOff\(true\)/);
  });

  it("touches no storage API", () => {
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      expect(source).not.toContain(api);
    }
  });

  it("reads the file with FileReader and sends it nowhere", () => {
    expect(source).toContain("new FileReader()");
    expect(source).not.toMatch(/FormData|\.upload|XMLHttpRequest/);
  });

  it("refuses to connect at all until there are enough usable rows", () => {
    expect(source).toContain("const ready = entries.length >= MIN_USABLE_ROWS;");
    expect(source).toMatch(/<fieldset[^>]*disabled=\{!ready\}/);
  });
});

describe("the stylesheet clears the phone floors before the phone check runs", () => {
  /**
   * Every declaration that applies to one selector, not the first block whose
   * text happens to contain it. Matching on the raw text found
   * `.overlap__summary` inside `.overlap__summary:focus-visible` and read out
   * the outline rule, which is the shape of a check that passes by accident.
   * The comments come out first for the same reason they do in the safety
   * greps: this file's own header names the tokens it forbids.
   */
  const bare = css
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .trim();
  const blocks = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((s) => s.trim()),
    body: m[2],
  }));
  const rule = (selector: string) => {
    const bodies = blocks.filter((b) => b.selectors.includes(selector)).map((b) => b.body);
    if (bodies.length === 0) throw new Error(`no rule for ${selector}`);
    return bodies.join("\n");
  };

  it("puts 16px on every control, so iOS does not zoom on focus", () => {
    for (const selector of [".overlap__input", ".overlap__select", ".overlap__file", ".overlap__blob"]) {
      expect(rule(selector), selector).toContain("font-size: 16px");
    }
    expect(rule(".overlap__tab")).toContain("font-size: 16px");
    expect(rule(".overlap__button")).toContain("font-size: 16px");
  });

  it("puts 44px under every tap target", () => {
    for (const selector of [
      ".overlap__tab",
      ".overlap__button",
      ".overlap__input",
      ".overlap__select",
      ".overlap__file",
      ".overlap__blob",
      ".overlap__summary",
    ]) {
      expect(rule(selector), selector).toContain("min-height: 44px");
    }
    // The label takes its 44px only where there is a finger.
    expect(bare).toMatch(/@media \(hover: none\)[\s\S]*?\.overlap__label \{[\s\S]*?min-height: 44px/);
  });

  it("stops a pasted blob pushing the page sideways", () => {
    expect(rule(".overlap__blob")).toContain("word-break: break-all");
    expect(rule(".overlap__blob")).toContain("overflow-wrap: anywhere");
    expect(rule(".overlap__blob")).toContain("max-width: 100%");
  });

  it("uses neither of the two tokens that fail the contrast floor on some theme", () => {
    expect(bare).not.toContain("--green-faint");
    expect(bare).not.toContain("--green-dim");
  });

  it("gates the one animation behind reduced motion", () => {
    expect(bare).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*overlap__result/);
  });
});
