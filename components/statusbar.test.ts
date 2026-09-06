import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components", "system", "StatusBar.tsx"), "utf8");

/** Source-coupling checks; vitest runs in node here and nothing renders. */
describe("the status bar on a phone", () => {
  it("shortens the working directory through the pure helper", () => {
    expect(source).toContain("shortPwd(path)");
  });

  it("marks the uptime so the stylesheet can drop it for room", () => {
    expect(source).toContain('className="statusbar__seg statusbar__up"');
  });
});
