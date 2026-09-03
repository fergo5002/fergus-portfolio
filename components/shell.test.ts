import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks for the shell drawer, in the pattern of `lib/boot.test.ts`.
 * The behaviour is in `lib/shell.ts` and tested there; these prove the
 * component, the CRT shell, the status bar and the stylesheet are wired to it.
 * Comments are stripped first so prose cannot satisfy a check for code.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const layout = code(read("app", "layout.tsx"));
const crtShell = code(read("components", "CrtShell.tsx"));
const drawer = code(read("components", "ShellDrawer.tsx"));
const css = read("app", "globals.css");

describe("the crt shell mounts the drawer", () => {
  it("imports ShellDrawer and renders it in the assembly, outside the screen, before the status bar", () => {
    // Outside `.crt__screen` on purpose. That div is a stacking context
    // (`z-index: 1`) and, ejected, a transformed containing block that follows
    // the scroll, so a fixed drawer inside it could neither rise above the
    // glass nor stay anchored to the display. Beside the status bar it does
    // both, the same way the status bar itself does.
    expect(crtShell).toMatch(/import ShellDrawer from "\.\/ShellDrawer";/);
    const screenOpen = crtShell.indexOf('<div className="crt__screen">');
    const screenClose = crtShell.indexOf("</div>", screenOpen);
    const at = crtShell.indexOf("<ShellDrawer />");
    const bar = crtShell.indexOf("<StatusBar />");
    expect(screenOpen).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(screenClose);
    expect(at).toBeLessThan(bar);
  });

  it("leaves the layout alone: the drawer is chrome on the machine, not a page", () => {
    expect(layout).not.toMatch(/ShellDrawer/);
  });
});

describe("the drawer", () => {
  it("routes the backtick through the pure predicate and closes on Escape", () => {
    expect(drawer).toMatch(/isShellHotkey\(e\.key, e, /);
    expect(drawer).toMatch(/e\.key === "Escape"/);
    expect(drawer).toMatch(/shellStore\.dispatch\(\{ type: "close" \}\)/);
  });

  it("tells the store which route it is on", () => {
    expect(drawer).toMatch(/shellStore\.dispatch\(\{ type: "route", inline: path === "\/" \}\)/);
  });

  it("renders nothing while closed, so no hidden input is ever focusable", () => {
    expect(drawer).toMatch(/if \(!state\.open\) return null;/);
  });

  it("mounts the one Terminal, in drawer dress, with focus", () => {
    expect(drawer).toMatch(/<Terminal variant="drawer" autoFocus \/>/);
  });

  it("swallows the backtick so it is not typed into the input it just focused", () => {
    expect(drawer).toMatch(/isShellHotkey\([\s\S]{0,120}\)\) return;\s*e\.preventDefault\(\);/);
  });

  it("hydrates from a closed server snapshot", () => {
    expect(drawer).toMatch(/useSyncExternalStore\(shellStore\.subscribe, shellStore\.get, getServerShell\)/);
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

  it("draws the drawer on the status bar, above the glass and below the chrome", () => {
    const rule = /\.shell \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position: fixed;/);
    expect(rule).toMatch(/bottom: var\(--status-h\);/);
    expect(rule).toMatch(/z-index: 9050;/);
  });

  it("slides only for people who have not asked for stillness", () => {
    expect(css).toMatch(/@keyframes shell-rise/);
    expect(insideMedia("@media (prefers-reduced-motion: no-preference)", "animation: shell-rise")).toBe(true);
    expect(css.split("animation: shell-rise").length - 1).toBe(1);
  });

  it("shrinks with the display when ejected, like the status bar", () => {
    expect(css).toMatch(/html\.is-ejecting \.shell \{\r?\n\s*position: absolute;/);
  });
});

describe("the status bar prompt", () => {
  const statusBar = code(read("components", "system", "StatusBar.tsx"));

  it("is a real button that summons the shell", () => {
    expect(statusBar).toMatch(/className="statusbar__prompt"/);
    expect(statusBar).toMatch(/onClick=\{summonShell\}/);
    expect(statusBar).toMatch(/<button\s+type="button"\s+className="statusbar__prompt"/);
  });

  it("says whether the drawer is open, except on the page that has no drawer", () => {
    expect(statusBar).toMatch(/aria-expanded=\{shell\.inline \? undefined : shell\.open\}/);
    expect(statusBar).toMatch(/useSyncExternalStore\(shellStore\.subscribe, shellStore\.get, getServerShell\)/);
  });

  it("is 44px both ways on small screens, in a rule that wins on order", () => {
    const mobile = /\.statusbar__prompt \{[^}]*min-height: 44px;[^}]*\}/.exec(css);
    expect(mobile).not.toBeNull();
    expect(mobile?.[0]).toMatch(/min-width: 44px;/);
    expect(mobile?.[0]).toMatch(/align-self: flex-end;/);
    // The override of `.statusbar__readouts { display: contents }` must come
    // after it in the file, or it loses on the cascade with equal specificity.
    const contents = /\.statusbar__readouts \{\r?\n\s*display: contents;/.exec(css);
    const flex = /\.statusbar__readouts \{\r?\n\s*display: flex;/.exec(css);
    expect(contents?.index).toBeGreaterThan(-1);
    expect(flex?.index).toBeGreaterThan(contents?.index ?? Infinity);
  });
});
