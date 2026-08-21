import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The decorative-text guard.
 *
 * `AGENTS.md` has carried one half of this rule since the hero name shipped as
 * separated letters: **a text effect must leave a whole copy of its words in the
 * server HTML.** This is the other half, and it cost more.
 *
 * Measured against the live site on 2026-08-21, a plain HTML-to-text extraction
 * of any article opened with about 150 characters of terminal costume before the
 * first real word, and all 46 article headings extracted as `#The actual reason`
 * because the anchor-link glyph was a real `#` text node. Both sit in the part of
 * a page a retrieval step reads first.
 *
 * `aria-hidden` does not fix either one. It is an accessibility property and a
 * text extractor has no reason to read it, exactly as `aria-label` did not fix
 * the hero name. The only thing that takes text out of extraction is not putting
 * it in the document, so both are drawn with CSS `content` instead.
 *
 * **This is a source-coupling check, and it is worth saying so plainly.** Vitest
 * runs in a `node` environment here, so nothing below renders a component or
 * parses a stylesheet: it reads the files and asserts on their text, the same
 * way `lib/boot.test.ts` greps `BootSequence`. It cannot prove what a browser
 * paints or what a crawler extracts. What it can do is fail the moment somebody
 * puts the literal text back, which is the regression it exists for. The real
 * proof is the post-deploy extraction check in `docs/PROGRESS.md`.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

const promptLine = read("components", "PromptLine.tsx");
const markdown = read("components", "Markdown.tsx");
const css = read("app", "globals.css");

/** Strip comments and docblocks so a rule is not satisfied by prose about it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("PromptLine writes no text into the document", () => {
  const source = code(promptLine);

  it("renders its spans empty", () => {
    // `<span className="promptline__user">{user}@{host}</span>` is the shape
    // that shipped, and the shape this forbids. A self-closing span has no
    // children by construction, so the check is that none of them has a body.
    const withChildren = /<span className="promptline__[a-z]+"\s*>[\s\S]*?<\/span>/.exec(source);
    expect(withChildren?.[0], "a promptline span has text children again").toBeUndefined();
  });

  it("passes its parts as CSS custom properties instead", () => {
    for (const part of ["--promptline-user", "--promptline-path", "--promptline-cmd"]) {
      expect(source, `${part} is not passed to the stylesheet`).toContain(part);
    }
  });

  it("quotes and escapes those values before they reach the stylesheet", () => {
    // A raw path or command interpolated into a `content` value could close the
    // string and continue as CSS. JSON.stringify produces a quoted, escaped
    // string, which is also valid CSS string syntax.
    expect(source).toContain("JSON.stringify");
  });

  it("is hidden from assistive technology too, because it is costume", () => {
    expect(source).toMatch(/aria-hidden=\{?["']?true/);
  });
});

describe("the heading anchor writes no text into the document", () => {
  const source = code(markdown);

  it("renders no # glyph as a child of the anchor", () => {
    const anchorWithText = /className="prose__anchor"[\s\S]{0,300}?>\s*[^<\s][\s\S]*?<\/a>/.exec(
      source,
    );
    expect(anchorWithText?.[0], "the anchor has text children again").toBeUndefined();
  });

  it("keeps the accessible name, which was never the problem", () => {
    expect(source).toContain("aria-label");
  });
});

describe("the stylesheet draws what the markup no longer says", () => {
  it("draws every prompt line part", () => {
    for (const [selector, value] of [
      ["promptline__user", "var(--promptline-user)"],
      ["promptline__path", "var(--promptline-path)"],
      ["promptline__cmd", "var(--promptline-cmd)"],
    ] as const) {
      const rule = new RegExp(`\\.${selector}::before\\s*\\{[^}]*content:[^;}]*${escape(value)}`);
      expect(rule.test(css), `.${selector}::before does not draw ${value}`).toBe(true);
    }
  });

  it("draws the separator, the dollar and the heading anchor", () => {
    expect(css).toMatch(/\.promptline__sep::before\s*\{[^}]*content:/);
    expect(css).toMatch(/\.promptline__dollar::before\s*\{[^}]*content:/);
    expect(css).toMatch(/\.prose__anchor::before\s*\{[^}]*content:\s*"#"/);
  });

  it("still declares a fallback for each custom property", () => {
    // A missing custom property makes the whole `content` declaration invalid,
    // which would silently blank the prompt line rather than degrade it.
    for (const part of ["--promptline-user", "--promptline-path", "--promptline-cmd"]) {
      expect(css, `${part} has no declared fallback`).toContain(`${part}:`);
    }
  });
});

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
