import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-coupling checks for the nav, in the same spirit as
 * `components/chrome.test.ts`: vitest runs in node here, so nothing renders.
 * They fail the moment the shape changes, which is the regression they exist
 * for.
 */
const nav = readFileSync(join(process.cwd(), "components", "Nav.tsx"), "utf8");
const terminal = readFileSync(join(process.cwd(), "components", "Terminal.tsx"), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("cd arcade in the nav (Fergus, 2026-09-06)", () => {
  it("is a button that asks the shell to open the door, because the arcade is not a page", () => {
    expect(code(nav)).toMatch(/<button[^>]*className="nav__link nav__link--cmd"/);
    expect(code(nav)).toContain('requestCommand("cd arcade")');
    expect(code(nav)).toContain("summonShell()");
  });

  it("never becomes a link: there is no /arcade route to crawl", () => {
    expect(code(nav)).not.toMatch(/href:\s*"\/arcade"/);
  });

  it("is drained by the terminal, the one place allowed to host a program", () => {
    expect(code(terminal)).toContain("takeRequest()");
    expect(code(terminal)).toContain("subscribeRequests");
  });
});

describe("the active link stays in view on a phone", () => {
  it("moves the list's own scrollLeft rather than scrollIntoView, which can move the page", () => {
    expect(code(nav)).toContain("scrollLeft");
    expect(code(nav)).not.toContain("scrollIntoView");
  });
});
