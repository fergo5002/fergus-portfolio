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

describe("Terminal reads the shared history", () => {
  it("subscribes to the history store rather than keeping entries in state", () => {
    expect(terminal).toMatch(/useSyncExternalStore\(historyStore\.subscribe, historyStore\.get/);
    expect(terminal).not.toMatch(/useState<Entry\[\]>/);
  });

  it("dispatches typed, print and clear, and nothing else", () => {
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "typed", cmd: raw \}\)/);
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "print", cmd: raw, lines: \[res\.program\.title, "no runtime yet"\] \}\)/);
    expect(terminal).toMatch(/historyStore\.dispatch\(\{ type: "clear" \}\)/);
  });

  it("gives the drawer a way to take focus and its own ids", () => {
    expect(terminal).toMatch(/autoFocus/);
    expect(terminal).toMatch(/useId\(\)/);
    expect(terminal).not.toMatch(/id="term-input"/);
  });
});

describe("Terminal applies forget and feeds the session commands", () => {
  it("hands the command the storage keys and the presence count", () => {
    expect(terminal).toMatch(/storageKeys: readStorageKeys\(\)/);
    expect(terminal).toMatch(/presence,/);
    expect(terminal).toMatch(/localPresence\.count\(\)/);
  });

  it("removes exactly the keys the effect names, through the owned-key filter", () => {
    expect(terminal).toMatch(/case "forget":[\s\S]{0,200}removeKeys\(window\.localStorage, effect\.keys\)/);
  });

  it("admits it when storage refuses", () => {
    expect(terminal).toMatch(/storage refused the change/);
  });
});
