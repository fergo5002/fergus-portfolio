import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components", "system", "StatusBar.tsx"), "utf8");

/** Source-coupling checks; vitest runs in node here and nothing renders. */
describe("the status bar on a phone", () => {
  it("shortens the working directory through the pure helper", () => {
    expect(source).toContain("shortPwd(path)");
  });

  it("leaves room for the real controls instead of decorative telemetry", () => {
    expect(source).not.toMatch(/formatUptime|memoryAddress|fpsRef|posRef/);
    expect(source).toContain('aria-label={copy.controls}');
  });

  it("keeps control labels visible on a narrow screen", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    for (const cls of ["machine__label", "statusbar__prompt-label"]) {
      for (const match of css.matchAll(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, "g"))) {
        expect(match[1]).not.toMatch(/clip-path|display:\s*none|width:\s*1px/);
      }
    }
  });
});
