import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ejectCopy } from "@/content/eject";
import { EJECT_CONTROLS } from "@/lib/eject";

/**
 * Coupling checks for the ejected monitor's hardware, in the pattern of
 * `components/shell.test.ts`. Vitest runs in a node environment here, so
 * nothing below mounts anything: these prove the parts are wired to the
 * contracts the rest of the site depends on (one frame clock, Escape, the
 * tube left switched on, the page's scroll range), and nothing more. The
 * geometry is tested for real in `lib/eject.test.ts`, and
 * `scripts/eject-check.mjs` drives the controls in a browser.
 *
 * Comments are stripped first, so prose cannot satisfy a check for code.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
function code(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/** The body of the first call to `opener`, brace-matched from the `{` after it. */
function body(source: string, opener: string): string {
  const at = source.indexOf(opener);
  if (at < 0) throw new Error(`not found: ${opener}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated: ${opener}`);
}

const hw = code(read("components", "system", "EjectHardware.tsx"));
const rig = code(read("components", "system", "EjectRig.tsx"));
const css = read("components", "system", "eject.css");
const globals = read("app", "globals.css");

describe("the hardware runs on the one frame clock", () => {
  it("follows the monitor through onFrame and never starts a loop of its own", () => {
    expect(hw).toMatch(/onFrame\(\(\) => \{/);
    expect(hw).not.toContain("requestAnimationFrame");
    expect(rig).not.toContain("requestAnimationFrame");
  });

  it("writes the transform through a ref, with no React state and nothing on <html> per frame", () => {
    const frame = body(hw, "onFrame(() =>");
    expect(frame).toMatch(/\.style\.transform = /);
    expect(frame).not.toMatch(/\bset[A-Z]\w*\(/);
    expect(frame).not.toContain("documentElement");
    expect(frame).not.toContain("setProperty");
  });

  it("places itself from the shared geometry, not a copy of it", () => {
    for (const fn of ["ejectLayout(", "ejectGeometry(", "ejectCase(", "ejectLean("]) {
      expect(hw).toContain(fn);
    }
  });
});

describe("Escape takes you back in", () => {
  it("docks on Escape while ejected", () => {
    const handler = body(hw, "const onKey = (e: KeyboardEvent) =>");
    expect(handler).toContain('e.key !== "Escape"');
    expect(handler).toContain("setEjected(false)");
    expect(hw).toContain('window.addEventListener("keydown", onKey)');
    expect(hw).toContain('window.removeEventListener("keydown", onKey)');
  });

  it("lets the drawer have Escape first, so closing the terminal does not also dock", () => {
    const handler = body(hw, "const onKey = (e: KeyboardEvent) =>");
    expect(handler).toContain("e.defaultPrevented");
    expect(handler).toContain("shellStore.get().open");
  });
});

describe("power leaves the tube switched on", () => {
  it("switches off in one place only, the power button", () => {
    expect(hw.match(/bootTarget = 0/g)).toHaveLength(1);
    expect(body(hw, "const togglePower = () =>")).toContain("bootTarget = 0");
  });

  it("switches back on whenever the monitor stops being ejected", () => {
    // Escape, the enter control, gravity, the arcade and a nav link all dock
    // through `ejected`, so one effect keyed on it covers every one of them.
    expect(hw).toMatch(/useEffect\(\(\) => \{\s*if \(!ejected\) restorePower\(\);\s*\}, \[ejected, restorePower\]\);/);
    expect(body(hw, "const restorePower = useCallback(() =>")).toContain("frame.current.bootTarget = 1;");
  });

  it("switches back on if the hardware unmounts while the tube is off", () => {
    expect(hw).toMatch(/return \(\) => \{\s*if \(offRef\.current\) frame\.current\.bootTarget = 1;\s*\};/);
  });
});

describe("the channel dial changes route and stays ejected", () => {
  it("navigates with the router and never docks to do it", () => {
    const tune = body(hw, "const tune = (i: number) =>");
    expect(tune).toContain("router.push(");
    expect(tune).not.toContain("setEjected");
    // The arcade detent opens the door the same way the nav does.
    expect(tune).toContain("requestCommand(");
    expect(tune).toContain('shellStore.dispatch({ type: "open" })');
  });

  it("drives the settings through the provider, which persists only what differs from the defaults", () => {
    expect(hw).toContain("setTheme(");
    expect(hw).toContain("setScanlines(contrastFromDial(");
    expect(hw).toContain("degauss()");
    // No storage of its own: `forget` only knows the keys it can vouch for.
    expect(hw).not.toMatch(/localStorage|sessionStorage|setItem/);
  });
});

describe("the spacer follows the page inside the monitor", () => {
  it("re-measures the scroll range whenever the screen's content changes size, a route change included", () => {
    expect(rig).toMatch(/new ResizeObserver\(remeasure\)/);
    expect(body(rig, "const remeasure = () =>")).toMatch(/spacer\.style\.height = `\$\{screen\.offsetHeight \+ extra\}px`;/);
    expect(body(rig, "const engage = () =>")).toContain("observer.observe(screen);");
    expect(body(rig, "const release = () =>")).toContain("observer.disconnect();");
  });

  it("squashes the page with the picture when the tube is switched off", () => {
    expect(rig).toContain("ejectTransform(g, powerBand(f.boot))");
  });

  it("clips the glass to the same corner radius the shader draws", () => {
    expect(rig).toContain("EJECT_CASE.glass * window.innerHeight");
  });
});

describe("real controls, with real names", () => {
  it("renders a native range under each knob and a button for each switch", () => {
    expect(hw.match(/type="range"/g)).toHaveLength(1);
    expect(hw).toMatch(/<Knob\b/);
    expect(hw.match(/<Knob\b/g)).toHaveLength(3);
    expect(hw.match(/<button\b/g)).toHaveLength(2);
    expect(hw).toContain("aria-pressed={power}");
    expect(hw).toContain("aria-valuetext={valueText}");
  });

  it("takes every name from content/eject.ts", () => {
    for (const name of EJECT_CONTROLS) {
      expect(ejectCopy[name]).toBe(name);
      expect(hw).toContain(`copy.${name}`);
    }
  });

  it("renders nothing until somebody first ejects, so none of it reaches the server HTML", () => {
    expect(hw).toMatch(/if \(!armed \|\| !layout\) return null;/);
  });

  it("is gone from the page and the focus order whenever the monitor is not ejected", () => {
    expect(css).toMatch(/html:not\(\.is-ejecting\) \.ejhw \{\s*display: none;/);
    expect(hw).toContain("inert={!ejected}");
  });

  it("gives every control a visible focus ring", () => {
    expect(css).toMatch(/:focus-visible/);
  });

  it("keeps a thumb's worth of target under every knob and switch", () => {
    // The sizes themselves come from lib/eject.ts; this pins that nothing in the
    // stylesheet shrinks the hit area below the box it is placed in.
    expect(css).not.toMatch(/\.ejhw__(knob|btn)\s*\{[^}]*(max-width|max-height)/);
  });
});

describe("the eject block in globals.css", () => {
  it("still takes the chrome inside the display while ejected", () => {
    expect(globals).toMatch(/html\.is-ejecting \.crt__assembly \{/);
    expect(globals).toMatch(/html\.is-ejecting \.statusbar \{/);
  });

  it("cannot be scrolled from inside by scrollIntoView, because it is not a scroll container", () => {
    // `overflow: hidden` is programmatically scrollable, and Next's scroll
    // restoration on a channel change would scroll the assembly instead of the
    // document. `clip` clips the same corners and scrolls nothing.
    const block = body(globals, "html.is-ejecting .crt__assembly {");
    expect(block).toContain("overflow: clip;");
    expect(block).not.toContain("overflow: hidden;");
  });
});
