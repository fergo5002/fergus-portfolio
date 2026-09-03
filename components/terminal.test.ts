import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks on `Terminal.tsx`, in the pattern of `lib/boot.test.ts`.
 *
 * Vitest runs in a `node` environment with no DOM, so the component cannot be
 * mounted. What can be checked is that the source contains the calls the pure
 * modules depend on it making. Comments are stripped first so prose about a
 * call can never satisfy a check for the call: that exact hole let a missing
 * `audio.key()` ship on 2026-08-20.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const terminal = code(read("components", "Terminal.tsx"));

describe("Terminal and a program result", () => {
  it("gives a program result a branch of its own before the output branches", () => {
    const at = terminal.indexOf('res.type === "program"');
    const effectAt = terminal.indexOf('res.type === "effect"');
    expect(at).toBeGreaterThan(-1);
    expect(effectAt).toBeGreaterThan(at);
  });

  it("prints the program's title and says there is no runtime", () => {
    expect(terminal).toMatch(/res\.program\.title/);
    expect(terminal).toMatch(/"no runtime yet"/);
  });
});
