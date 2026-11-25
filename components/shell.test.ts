import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks for the terminal's dock, in the pattern of `lib/boot.test.ts`.
 * The behaviour is in `lib/shell.ts` and `lib/dock.ts` and tested there; these
 * prove the component, the CRT shell and the stylesheet are wired to it.
 * Comments are stripped first so prose cannot satisfy a check for code.
 *
 * The dock replaced the status bar and its drawer on 2026-11-25: one handle in
 * the bottom right that grows the terminal out of itself as a window.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const layout = code(read("app", "layout.tsx"));
const crtShell = code(read("components", "CrtShell.tsx"));
const dock = code(read("components", "TermDock.tsx"));
const css = read("app", "globals.css");

describe("the crt shell mounts the dock", () => {
  it("renders it outside the tube's assembly, so an ejected or fallen page keeps its way out", () => {
    expect(crtShell).toMatch(/import TermDock from "\.\/TermDock";/);
    const assemblyOpen = crtShell.indexOf('<div className="crt__assembly">');
    const at = crtShell.indexOf("<TermDock />");
    const assemblyClose = crtShell.lastIndexOf("</div>", at);
    expect(assemblyOpen).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(assemblyClose);
  });

  it("has no status bar and no drawer left in it", () => {
    expect(crtShell).not.toMatch(/StatusBar|ShellDrawer|Screensaver/);
  });

  it("leaves the layout alone: the dock is chrome on the machine, not a page", () => {
    expect(layout).not.toMatch(/TermDock/);
  });
});

describe("the dock", () => {
  it("routes the backtick through the pure predicate and minimises on Escape", () => {
    expect(dock).toMatch(/isShellHotkey\(e\.key, e, /);
    expect(dock).toMatch(/e\.key === "Escape"/);
    expect(dock).toMatch(/shellStore\.dispatch\(\{ type: "close" \}\)/);
  });

  it("renders no window while closed, so no hidden input is ever focusable", () => {
    expect(dock).toMatch(/\{phase !== "closed" && \(/);
  });

  it("keeps the window through its genie, and lets the animation's end move it on", () => {
    expect(dock).toMatch(/dockPhaseFor\(current, state\.open, reducedMotion\)/);
    expect(dock).toMatch(/onAnimationEnd=\{onAnimationEnd\}/);
    expect(dock).toMatch(/inert=\{phase === "closing" \? true : undefined\}/);
  });

  it("mounts the one Terminal, in window dress, with focus", () => {
    expect(dock).toMatch(/<Terminal variant="drawer" autoFocus \/>/);
  });

  it("swallows the backtick so it is not typed into the input it just focused", () => {
    expect(dock).toMatch(/isShellHotkey\([\s\S]{0,120}\)\) return;\s*e\.preventDefault\(\);/);
  });

  it("hydrates from a closed server snapshot", () => {
    expect(dock).toMatch(/useSyncExternalStore\(shellStore\.subscribe, shellStore\.get, getServerShell\)/);
  });

  it("offers the way back from gravity and eject only while there is one to take", () => {
    expect(dock).toMatch(/\{gravityOn && \(/);
    expect(dock).toMatch(/\{ejected && \(/);
  });
});

describe("the handle", () => {
  it("is a real button that toggles the one terminal", () => {
    expect(dock).toMatch(/export function summonShell\(\): void \{\s*shellStore\.dispatch\(\{ type: "toggle" \}\);\s*\}/);
    expect(dock).toMatch(/<button\s+type="button"\s+className="term-handle"\s+onClick=\{summonShell\}/);
  });

  it("says whether the window is up", () => {
    expect(dock).toMatch(/aria-expanded=\{state\.open\}/);
  });

  it("gets focus back on keyboard or explicit minimise, never on a click elsewhere", () => {
    const pointer = dock.slice(dock.indexOf("const onPointerDown"), dock.indexOf('document.addEventListener("pointerdown"'));
    expect(pointer).not.toContain("focus");
    expect(dock).toContain('querySelector<HTMLElement>(".term-handle")?.focus()');
  });
});

describe("the stylesheet", () => {
  /** True when `decl` sits inside some block opened by `media`. */
  const insideMedia = (media: string, decl: string): boolean => {
    let from = 0;
    for (;;) {
      const at = css.indexOf(media, from);
      if (at < 0) return false;
      const open = css.indexOf("{", at);
      let depth = 0;
      for (let i = open; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) {
          if (css.slice(open, i).includes(decl)) return true;
          break;
        }
      }
      from = at + media.length;
    }
  };

  it("floats the window above the glass and the nav, under the boot", () => {
    const rule = /\n\.shell \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position: fixed;/);
    expect(rule).toMatch(/z-index: 9140;/);
    const dockRule = /\n\.term-dock \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(dockRule).toMatch(/z-index: 9150;/);
  });

  it("plays the genie only for people who have not asked for stillness", () => {
    expect(insideMedia("@media (prefers-reduced-motion: no-preference)", "animation: genie-in")).toBe(true);
    expect(insideMedia("@media (prefers-reduced-motion: no-preference)", "animation: genie-out")).toBe(true);
    expect(css.split("animation: genie-in").length - 1).toBe(1);
  });

  it("scrolls instantly for them too", () => {
    expect(insideMedia("@media (prefers-reduced-motion: no-preference)", "scroll-behavior: smooth")).toBe(true);
    expect(css.split("scroll-behavior: smooth").length - 1).toBe(1);
  });
});
