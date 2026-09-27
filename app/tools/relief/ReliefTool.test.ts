import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check, not a render. Vitest runs in a node environment
 * here, so nothing on this route can be mounted.
 *
 * Line endings are normalised first, because this is a Windows checkout with
 * autocrlf and a bare newline in a pattern is otherwise red locally and green
 * in CI for no real reason.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

const tool = read("app", "tools", "relief", "ReliefTool.tsx");
const css = read("app", "tools", "relief", "tool.css");

describe("the client island", () => {
  it("is a client component", () => {
    expect(tool.startsWith('"use client"')).toBe(true);
  });

  it("opens on the demo, so the page is never an empty form", () => {
    expect(tool).toMatch(/useState<ReliefEvent\[\]>\(\(\) => demoEvents\(\)\)/);
    expect(tool).toMatch(/useState<PlateSource>\("demo"\)/);
  });

  it("does the arithmetic by calling the tested modules, never by repeating it", () => {
    for (const call of [
      "buildHeightmap(",
      "contourLayers(",
      "checkDensity(",
      "plateGeometry(",
      "planPlate(",
      "paint(",
    ]) {
      expect(tool, call).toContain(call);
    }
    expect(tool).not.toContain("Math.log1p");
    expect(tool).not.toContain("marching");
  });

  it("refuses a thin year with the key the guard returned", () => {
    expect(tool).toContain("reliefCopy.refusal[density.reason]");
    expect(tool).toContain("FLAT_RANGE");
  });

  it("reads its colours from the theme and names the error when there are none", () => {
    expect(tool).toContain("paletteFromTokens(");
    expect(tool).toContain("getComputedStyle(document.documentElement)");
    expect(tool).toContain("ReliefPaletteError");
    expect(tool).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("redraws when the theme changes, because the plate is painted in tokens", () => {
    expect(tool).toMatch(/\[layers, geometry, settings\.theme\]/);
  });
});

describe("the token's rules, read off the source", () => {
  it("contains no URL at all, so nothing here can build one", () => {
    // Every request is built by `githubUrl` behind the origin fence. A URL
    // literal in this file is the beginning of a second path out.
    expect(tool).not.toMatch(/https?:\/\//);
  });

  it("has no form, so nothing can be submitted with the token in a query string", () => {
    expect(tool).not.toContain("<form");
    expect(tool).not.toContain("action=");
  });

  it("puts the token in a password field the browser will not remember", () => {
    const field = tool.match(/<input[^>]*value=\{token\}[\s\S]*?\/>/)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).toContain('autoComplete="off"');
    expect(field).not.toContain("name=");
  });

  it("hands the token to exactly one function", () => {
    expect([...tool.matchAll(/fetchCommitEvents\(/g)]).toHaveLength(1);
    expect(tool).toContain("fetchImpl: window.fetch.bind(window)");
  });

  it("aborts the token-bearing request when the route unmounts", () => {
    expect(tool).toMatch(/useEffect\(\(\) => \(\) => runRef\.current\?\.abort\(\), \[\]\)/);
  });

  it("refuses an oversized CSV before File.text allocates it", () => {
    const body = tool.match(/async function onFile\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(body.indexOf("csvFileAllowed(chosen.size)")).toBeGreaterThan(0);
    expect(body.indexOf("csvFileAllowed(chosen.size)")).toBeLessThan(body.indexOf("chosen.text()"));
    expect(body).toContain("readColumn(parsed.rows, guess, parsed.capped)");
    expect(tool).toContain("readColumn(table.rows, next, table.capped)");
  });
});

describe("the exports", () => {
  it("saves all three through the tested module", () => {
    for (const call of ["canvasBlob(", "svgBlob(", "stlBlob(", "saveBlob(", "plateFilename("]) {
      expect(tool, call).toContain(call);
    }
    expect(tool).toContain("plotterSvg(");
    expect(tool).toContain("writeBinaryStl(buildMesh(");
  });

  it("never reaches the network to make a file", () => {
    // Matched, not sliced between two markers. A slice whose start comes after
    // its end is the empty string, and every `not.toContain` on the empty
    // string passes, which is a check that could not fail. So the body is
    // pulled out by a regex and its length asserted first.
    const body = tool.match(/async function onExport\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain("saveBlob(");
    expect(body).not.toContain("fetch");
    expect(body).not.toContain("trackToolRun");
  });

  it("turns an export rejection into a visible status message", () => {
    const body = tool.match(/async function onExport\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(body).toContain("catch");
    expect(body).toContain("reliefCopy.errors.export");
  });
});

describe("what it reports", () => {
  it("keeps GitHub's incomplete warning visible even when density refuses the result", () => {
    expect(tool).toContain("accept(found, truncated ? reliefCopy.truncated : undefined)");
  });

  it("records a run with the slug, the outcome and the milliseconds, and nothing else", () => {
    // Three call sites and no more: the GitHub draw, the error it can end in,
    // and the CSV read. None on the demo, because nothing was asked for; none
    // on an export, because the run is the year being drawn and F3's payload
    // has no room to say which of the three files was taken; none on an abort,
    // because the visitor stopping it is not an outcome the tool produced.
    const sent = [...tool.matchAll(/trackToolRun\(\{[\s\S]*?\}\);/g)].map((m) => m[0]);
    expect(sent).toHaveLength(3);
    for (const call of sent) {
      expect(call).toContain('tool: "relief"');
      expect(call).toContain("outcome:");
      expect(call).toContain("ms:");
      expect(call).not.toContain("user");
      expect(call).not.toContain("token");
      expect(call).not.toContain("file");
      expect(call).not.toContain("events.length");
    }
  });
});

describe("the stylesheet", () => {
  /**
   * Since the instrument redesign (2026-09-27) the CSV file, its date column,
   * the two explorer sliders and the three exports are kit controls from
   * `components/instrument/`, and the stock `.relief__file`, `.relief__select`
   * and bare range rules are gone. The floors did not move out of reach: the
   * kit's own stylesheet is read here, so dropping one still turns this red.
   */
  const kit = read("components", "instrument", "instrument.css");

  it("uses the kit for the file, the column, the sliders and the exports", () => {
    expect(tool).toMatch(/<DropSlot[^>]*id=\{fileId\}/);
    expect(tool).toMatch(/<Select\s+id=\{columnId\}/);
    expect([...tool.matchAll(/<Slider\s/g)]).toHaveLength(2);
    expect(tool).toMatch(/<ExportBar\s/);
    expect(tool).not.toMatch(/type="range"|type="file"|<select/);
  });

  it("keeps every input at 16px, which is what stops iOS zooming on focus", () => {
    expect(css).toMatch(/\.relief__input[^}]*font-size:\s*16px/);
    expect(kit).toMatch(/\.inst-select \.inst-select__input\s*\{[^}]*font-size:\s*16px/);
    expect(kit).toMatch(/\.inst-slider \.inst-slider__input\s*\{[^}]*font-size:\s*16px/);
  });

  it("gives every control a 44px floor, the select included", () => {
    expect(css).toMatch(/\.relief__button[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.relief__input[^}]*min-height:\s*44px/);
    for (const selector of [".inst-select .inst-select__input", ".inst-slider .inst-slider__input", ".inst-picker__button", ".inst-export__btn"]) {
      const block = new RegExp(`${selector.replace(/\./g, "\\.")}\\s*\\{[^}]*min-height:\\s*44px`);
      expect(kit, selector).toMatch(block);
    }
  });

  it("no longer tints a stock range with an accent colour", () => {
    expect(css).not.toContain("accent-color");
  });

  it("stops the plate pushing the page sideways at 320", () => {
    expect(css).toMatch(/\.relief__plate\s*\{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.relief__plate\s*\{[^}]*width:\s*100%/);
  });

  /**
   * The pair that keeps the ground the right shape. The bitmap is sized from a
   * ResizeObserver reading that lags its box for a beat, so an explicit CSS
   * height on the canvas stretches the picture sideways whenever the two
   * disagree: measured at 2.13 drawn against 5.29 displayed on a 900px box.
   * Leaving the height to the bitmap's own ratio makes the lag cost resolution
   * instead. Both halves have to hold, so both are asserted.
   */
  it("lets the plate keep its own aspect ratio rather than being given a height", () => {
    expect(css).toMatch(/\.relief__plate\s*\{[^}]*height:\s*auto/);
    expect(tool).not.toContain("canvas.style.height");
  });

  it("never dims its text with the two tokens that fail on two of the three themes", () => {
    expect(css).not.toMatch(/color:\s*var\(--green-dim\)/);
    expect(css).not.toMatch(/color:\s*var\(--green-faint\)/);
  });

  it("gates its one animation behind reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    // The plate does not animate. SystemProvider owns the only rAF loop.
    expect(css).not.toContain("requestAnimationFrame");
  });
});
