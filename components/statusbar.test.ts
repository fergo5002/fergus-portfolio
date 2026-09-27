import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components", "system", "StatusBar.tsx"), "utf8");

/** Source-coupling checks; vitest runs in node here and nothing renders. */
describe("the status bar on a phone", () => {
  it("shortens the working directory through the pure helper", () => {
    expect(source).toContain("shortPwd(path)");
  });

  it("labels the strip as the machine's controls", () => {
    expect(source).toContain('aria-label={copy.controls}');
  });
});

/**
 * The readouts came back on 2026-09-26 at Fergus's request (uptime, the hex
 * memory address, fps, pointer, clock, theme, and a new activity lamp). They
 * are costume, so they must never be text in the document: `StatusBar` writes
 * each value into a CSS custom property and the stylesheet draws it with
 * `content`. Source-coupling checks; nothing renders in this environment.
 */
describe("the status bar readouts", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  it("computes its values in the pure module, not inline", () => {
    expect(source).toMatch(/\breadouts\(/);
  });

  it("writes values into custom properties and never into text nodes", () => {
    expect(source).toContain('setProperty("--ro"');
    expect(source).not.toMatch(/textContent\s*=/);
    // No readout value may be written as a JSX child either.
    expect(source).not.toMatch(/>\s*(00:00:00|0x0|60 fps|--:--)/);
  });

  it("draws each readout with CSS content from that property", () => {
    expect(css).toMatch(/\.statusbar__ro::after\s*\{[^}]*content:\s*var\(--ro/);
  });

  it("gives a phone's whole strip to the four labelled controls", () => {
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.statusbar__readouts\s*\{\s*display:\s*none;/);
  });
});

describe("the status bar on a narrow screen", () => {

  it("keeps control labels visible on a narrow screen", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    for (const cls of ["machine__label", "statusbar__prompt-label"]) {
      for (const match of css.matchAll(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, "g"))) {
        expect(match[1]).not.toMatch(/clip-path|display:\s*none|width:\s*1px/);
      }
    }
  });
});
