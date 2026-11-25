import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARCADE_HOLD_MS, navDoor, navItems, navShown } from "@/content/nav";

/**
 * Source-coupling checks for the nav, in the same spirit as
 * `components/chrome.test.ts`: vitest runs in node here, so nothing renders.
 * They fail the moment the shape changes, which is the regression they exist
 * for.
 */
const nav = readFileSync(join(process.cwd(), "components", "Nav.tsx"), "utf8");
const terminal = readFileSync(join(process.cwd(), "components", "Terminal.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("the top bar (Fergus, 2026-11-25)", () => {
  it("shows no cd mcp and no cd arcade", () => {
    expect(navShown.map((i) => i.href)).not.toContain("/mcp");
    expect(code(nav)).not.toContain("navDoor.command}");
    expect(code(nav)).toContain("navShown as items");
  });

  it("keeps /mcp a channel on the ejected monitor's dial", () => {
    expect(navItems.map((i) => i.href)).toContain("/mcp");
  });
});

describe("the arcade's hidden door: hold fergus@portfolio for three seconds", () => {
  it("is three seconds", () => {
    expect(ARCADE_HOLD_MS).toBe(3000);
  });

  it("starts on press, and letting go, sliding off or a cancelled gesture all stop it", () => {
    expect(code(nav)).toMatch(/onPointerDown=\{startHold\}/);
    expect(code(nav)).toMatch(/onPointerUp=\{cancelHold\}/);
    expect(code(nav)).toMatch(/onPointerLeave=\{cancelHold\}/);
    expect(code(nav)).toMatch(/onPointerCancel=\{cancelHold\}/);
    expect(code(nav)).toMatch(/window\.setTimeout\([\s\S]{0,120}openArcade\(\);[\s\S]{0,40}ARCADE_HOLD_MS\)/);
  });

  it("asks the shell to open the door, because the arcade is not a page", () => {
    const open = /function openArcade\(\): void \{([\s\S]*?)\n\}/.exec(code(nav))?.[1] ?? "";
    expect(open).toContain("requestCommand(navDoor.command)");
    expect(open).toContain('shellStore.dispatch({ type: "open" })');
    expect(navDoor.command).toBe("cd arcade");
  });

  it("shows the hold filling, so it never reads as a dead control", () => {
    expect(code(nav)).toMatch(/nav__prompt\$\{holding \? " is-holding" : ""\}/);
    expect(css).toMatch(/\.nav__prompt\.is-holding\s*\{\s*background-position: 0 0;/);
  });

  it("does not let a phone's long press select the name instead", () => {
    const rule = /\n\.nav__prompt \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("user-select: none");
    expect(rule).toContain("-webkit-touch-callout: none");
  });

  it("never becomes a link: there is no /arcade route to crawl", () => {
    expect(code(nav)).not.toMatch(/href:\s*"\/arcade"/);
  });

  it("is drained by the terminal, the one place allowed to host a program", () => {
    expect(code(terminal)).toContain("takeRequest()");
    expect(code(terminal)).toContain("subscribeRequests");
  });
});

describe("leaving the arcade from the top bar", () => {
  it("appears only while the room is up, because a phone has no Escape key", () => {
    expect(code(nav)).toMatch(/\{arcadeOpen && \(/);
    expect(code(nav)).toMatch(/onClick=\{leaveArcadeRoom\}/);
  });

  it("leaves the way Escape does, closing the shell only if the room is not listening", () => {
    const leave = /function leaveArcadeRoom\(\): void \{([\s\S]*?)\n\}/.exec(code(nav))?.[1] ?? "";
    expect(leave).toMatch(/if \(!requestArcadeLeave\(\)\) shellStore\.dispatch\(\{ type: "close" \}\);/);
  });
});

describe("the active link stays in view on a phone", () => {
  it("moves the list's own scrollLeft rather than scrollIntoView, which can move the page", () => {
    expect(code(nav)).toContain("scrollLeft");
    expect(code(nav)).not.toContain("scrollIntoView");
  });
});
