import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GREEN_PHOSPHOR, readArcadeTheme, withAlpha } from "./theme";

/**
 * The canvas cannot read a CSS variable, so the renderer is handed the theme
 * as strings. These pin two things: that the real token blocks in globals.css
 * parse into a full palette on all three phosphors, and that a missing or
 * garbage value falls back to the green phosphor rather than painting black
 * on black, which is what an empty string does to a canvas fillStyle.
 */

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function tokensOf(selector: string): Record<string, string> {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`no block for ${selector}`);
  const end = css.indexOf("}", start);
  const vars: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const themes = [":root", 'html[data-theme="amber"]', 'html[data-theme="ice"]'] as const;

describe("readArcadeTheme", () => {
  for (const selector of themes) {
    it(`reads every colour it needs from the ${selector} block`, () => {
      const vars = { ...tokensOf(":root"), ...tokensOf(selector) };
      const theme = readArcadeTheme((name) => vars[name] ?? "");
      expect(theme.ink).toBe(vars["--green"]);
      expect(theme.bright).toBe(vars["--green-bright"]);
      expect(theme.dim).toBe(vars["--green-dim"]);
      expect(theme.line).toBe(vars["--green-line"]);
      expect(theme.accent).toBe(vars["--amber"]);
      expect(theme.accentBright).toBe(vars["--amber-bright"]);
      expect(theme.bg).toBe(vars["--bg"]);
      expect(theme.panel).toBe(vars["--bg-panel"]);
    });
  }

  it("falls back to the green phosphor for a missing or unusable value", () => {
    const theme = readArcadeTheme((name) => (name === "--green" ? "" : name === "--amber" ? "not a colour" : "#123456"));
    expect(theme.ink).toBe(GREEN_PHOSPHOR.ink);
    expect(theme.accent).toBe(GREEN_PHOSPHOR.accent);
    expect(theme.bright).toBe("#123456");
  });

  it("trims the whitespace getPropertyValue leaves in front of a value", () => {
    const theme = readArcadeTheme(() => "  #abcdef");
    expect(theme.ink).toBe("#abcdef");
  });
});

describe("withAlpha", () => {
  it("turns a hex colour into rgba with the given alpha", () => {
    expect(withAlpha("#33ff66", 0.3)).toBe("rgba(51, 255, 102, 0.3)");
    expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
  });

  it("replaces the alpha of an rgb or rgba colour", () => {
    expect(withAlpha("rgba(51, 255, 102, 0.22)", 0.5)).toBe("rgba(51, 255, 102, 0.5)");
    expect(withAlpha("rgb(1, 2, 3)", 0.1)).toBe("rgba(1, 2, 3, 0.1)");
  });

  it("returns the input untouched when it cannot parse it, rather than an empty string", () => {
    expect(withAlpha("currentColor", 0.5)).toBe("currentColor");
  });
});
