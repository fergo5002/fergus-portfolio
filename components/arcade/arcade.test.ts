import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Coupling checks, in the pattern of `lib/boot.test.ts` and
 * `components/terminal.test.ts`, and worth being honest about what they are.
 *
 * Vitest runs in a `node` environment with no DOM, so this component cannot be
 * mounted. Everything it decides has been pushed into `lib/arcade/`, where it
 * is tested properly. What is left is whether this file calls those functions,
 * and these greps close that hole and nothing more. Comments are stripped
 * first, so prose about a call can never satisfy a check for the call: that
 * exact hole let a missing `audio.key()` ship on 2026-08-20.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const screen = code(read("components", "arcade", "ArcadeScreen.tsx"));

describe("the arcade runs on the one frame clock", () => {
  it("subscribes to the system loop and never starts its own", () => {
    expect(screen).toMatch(/onFrame\(/);
    expect(screen).toMatch(/unsubscribe\(\)/);
    expect(screen).not.toMatch(/requestAnimationFrame/);
    expect(screen).not.toMatch(/setInterval/);
  });

  it("turns the frame delta into fixed ticks rather than ticking on the frame", () => {
    expect(screen).toMatch(/advance\(\s*loopRef\.current,\s*dt,/);
  });

  it("never calls setState from inside the frame callback", () => {
    // The rule from AGENTS.md. The frame callback is the arrow passed to
    // onFrame; nothing in it may schedule a render.
    const match = /onFrame\(\([^)]*\) => \{([\s\S]*?)\n {4}\}\);/.exec(screen);
    expect(match, "frame callback not found").toBeTruthy();
    expect(match![1]).not.toMatch(/set[A-Z]\w*\(/);
  });

  it("stops ticking an instance as soon as a tick disposes or replaces it", () => {
    expect(screen).toMatch(/if \(runningRef\.current\?\.instance !== instance\) return;/);
  });

  it("updates the running host on resize instead of restarting the program", () => {
    expect(screen).toMatch(/host\.cols = fit\.cols;\s*host\.rows = fit\.rows;/);
    expect(screen).toMatch(/instance\?\.resize\?\.\(fit\.cols, fit\.rows\)/);
    const subscription = /const unsubscribe = onFrame[\s\S]*?\}, \[([^\]]+)\]\);/.exec(screen);
    expect(subscription, "arcade subscription effect not found").toBeTruthy();
    expect(subscription![1]).not.toMatch(/\bfit\b|\bmeasured\b/);
  });
});

describe("the screen is measured, not assumed", () => {
  it("measures a probe with the rect, not offsetWidth", () => {
    expect(screen).toMatch(/getBoundingClientRect\(\)/);
    expect(screen).not.toMatch(/offsetWidth/);
  });

  it("divides the probe by its length instead of measuring one glyph", () => {
    expect(screen).toMatch(/\/\s*PROBE_LENGTH/);
  });

  it("asks fitGrid, and refuses in a sentence when it says no", () => {
    expect(screen).toMatch(/fitGrid\(/);
    // The whole statement, not just the copy reference: a mutation that
    // disarmed the guard would leave the reference behind and this grep would
    // have gone on passing over a grid that clipped instead of refusing.
    expect(screen).toMatch(/if \(measured && !fit\) leave\(\[\.\.\.arcadeCopy\.noRoom\]\);/);
  });

  it("re-measures when the box changes size", () => {
    expect(screen).toMatch(/new ResizeObserver\(/);
    expect(screen).toMatch(/observer\.observe\(probe\)/);
    expect(screen).toMatch(/\.disconnect\(\)/);
  });
});

describe("drawing", () => {
  it("writes text through a ref and not through state", () => {
    expect(screen).toMatch(/preRef\.current\.textContent = /);
    expect(screen).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("skips the write when nothing changed", () => {
    expect(screen).toMatch(/if \(next === lastDrawnRef\.current\) return;/);
  });
});

describe("input", () => {
  it("owns every key that reaches it, so the drawer keeps none of them", () => {
    // Counted, not merely present: keydown and keyup each need one, and a grep
    // for "at least one" would pass with the keydown's removed, which is the
    // one that keeps Escape and the backtick away from the drawer.
    expect(screen.match(/e\.stopPropagation\(\)/g) ?? []).toHaveLength(2);
  });

  it("lets Escape out first, before the program sees anything", () => {
    const esc = screen.indexOf('e.key === "Escape"');
    const map = screen.indexOf("arcadeKey(e.key");
    expect(esc).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(esc);
  });

  it("stops the page scrolling under the player", () => {
    expect(screen).toMatch(/if \(shouldCapture\(e\.key, mods\)\) e\.preventDefault\(\);/);
  });

  it("ignores an auto-repeat, so a held key is one press", () => {
    expect(screen).toMatch(/holdKey\(heldKeysRef\.current,/);
  });

  it("releases held keys on focus loss and when the document is hidden", () => {
    expect(screen).toMatch(/onBlur=\{onBlur\}/);
    expect(screen).toMatch(/document\.visibilityState === "hidden"/);
    expect(screen).toMatch(/window\.addEventListener\("blur", releaseHeld\)/);
  });

  it("pairs keyup from the physical-key ledger instead of remapping it", () => {
    const keyup = /const onKeyUp[\s\S]*?\n  \};/.exec(screen)?.[0] ?? "";
    expect(keyup).toMatch(/releaseKey\(heldKeysRef\.current, e\.code \|\| e\.key\)/);
    expect(keyup).not.toMatch(/arcadeKey\(/);
  });

  it("releases every held input before disposing on exit", () => {
    expect(screen).toMatch(/exitedRef\.current = true;\s*releaseHeld\(\);\s*runningRef\.current\?\.instance\.dispose\(\)/);
  });

  it("routes a gesture through deliverGesture rather than deciding itself", () => {
    expect(screen).toMatch(/deliverGesture\(\s*gestureOf\(/);
  });

  it("does not send button events to the running game", () => {
    // Only keydown consults the target. Keyup must release a physical key that
    // began on the game even if focus moved onto the exit button meanwhile.
    expect(screen.match(/if \(fromControl\(e\.target\)\) return;/g) ?? []).toHaveLength(1);
    expect(screen.match(/if \(fromControl\(e\.target\)\) \{\s*pointerRef\.current = null;\s*return;/g) ?? []).toHaveLength(2);
  });
});

describe("sound and light", () => {
  it("goes through the vocabulary, never straight at the synth", () => {
    expect(screen).toMatch(/soundFor\(name\)/);
  });

  it("never forms a second opinion about whether sound is on", () => {
    // TubeAudio is inert until enabled and muted by `sound off`. A component
    // that also checked would be a second switch that can disagree.
    expect(screen).not.toMatch(/settings\.audio/);
  });

  it("lights the tube through the frame the shader already reads", () => {
    expect(screen).toMatch(/pushImpact\(frame\.current,/);
  });

  it("caps the light to one a frame, so physics keeps its slots", () => {
    expect(screen).toMatch(/flashesRef\.current >= 1/);
  });
});

describe("leaving", () => {
  it("declines when the system asks for reduced motion, even mid-game", () => {
    expect(screen).toMatch(/if \(reducedMotion\) leave\(\[\.\.\.arcadeCopy\.declined\]\);/);
  });

  it("offers the board only when there is a board to offer", () => {
    expect(screen).toMatch(/finishOutcome\(/);
    expect(screen).toMatch(/createInitialsProgram\(/);
  });

  it("keeps the latest exit callback without restarting the program", () => {
    expect(screen).toMatch(/onExitRef\.current = onExit/);
    const leave = /const leave = useCallback\([\s\S]*?\n  \}, \[releaseHeld\]\);/.exec(screen)?.[0] ?? "";
    expect(leave).toMatch(/onExitRef\.current\(lines\)/);
    expect(leave).not.toMatch(/\bonExit\(lines\)/);
  });

  it("prints what the server said, not what it hoped", () => {
    expect(screen).toMatch(/result\.ok \? arcadeCopy\.initials\.saved : result\.reason/);
  });

  it("has an exit control for a screen with no Escape key on it", () => {
    expect(screen).toMatch(/className="arcade__exit"/);
    expect(screen).toMatch(/arcadeCopy\.exitLabel/);
  });
});

/* ── the room, inside the tube (2026-09-05 overhaul) ──────────────────────── */

const room = code(read("components", "arcade", "ArcadeExperience.tsx"));
const css = read("components", "arcade", "arcade.css");
const attract = code(read("components", "arcade", "AttractScreen.tsx"));
const entrance = code(read("components", "arcade", "ArcadeEntrance.tsx"));
const game = code(read("components", "arcade", "CanvasGame.tsx"));

describe("the room sits inside the tube", () => {
  it("is portaled to the body and carries data-lenis-prevent, which is the scroll fix", () => {
    // Lenis, stopped, cancels every wheel event unless an ancestor carries this.
    // Measured on the release build: 0px of movement without it.
    expect(room).toMatch(/createPortal\(/);
    expect(room).toMatch(/data-lenis-prevent=""/);
  });

  it("locks the document behind it and unlocks on the way out", () => {
    expect(room).toMatch(/setScrollLocked\(true\)/);
    expect(room).toMatch(/setScrollLocked\(false\)/);
  });

  it("stacks below every glass layer and never above 9000", () => {
    const z = /\.arcade-room\s*\{[^}]*z-index:\s*(\d+)/.exec(css);
    expect(z, "room z-index not found").toBeTruthy();
    expect(Number(z![1])).toBeLessThan(8997);
    for (const m of css.matchAll(/z-index:\s*(\d+)/g)) expect(Number(m[1])).toBeLessThan(9000);
  });

  it("hides the page, nav, drawer and status strip while it is up, and puts them back", () => {
    expect(css).toMatch(/html\.arcade-open \.crt__screen,\s*html\.arcade-open \.nav,\s*html\.arcade-open \.shell,\s*html\.arcade-open \.statusbar\s*\{\s*visibility:\s*hidden;/);
    expect(room).toMatch(/classList\.add\("arcade-open"\)/);
    expect(room).toMatch(/classList\.remove\("arcade-open"\)/);
  });

  it("owns every key that reaches it, so the drawer sees neither Escape nor a backtick", () => {
    expect(room.match(/e\.stopPropagation\(\)/g) ?? []).toHaveLength(2);
    expect(room).toMatch(/e\.key === "Escape"/);
  });

  it("never leaves the tube dark on the way out", () => {
    expect(room).toMatch(/frame\.current\.bootTarget = 1;/);
    expect(entrance).toMatch(/f\.bootTarget = 1;/);
  });

  it("uses no colour literal of its own: every colour is a token", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    // The two rgba literals mirror `.window` in globals.css exactly, so a
    // cabinet and a window panel are the same object. Nothing else may add one.
    const literals = rules.match(/rgba?\([^)]*\)/g) ?? [];
    for (const l of literals) expect(["rgba(51, 255, 102, 0.015)", "rgba(51, 255, 102, 0.04)", "rgba(51, 255, 102, 0.08)", "rgba(0, 0, 0, 0.4)"]).toContain(l);
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("does not use the banned typefaces or an eyebrow", () => {
    expect(css).not.toMatch(/Arial|Helvetica|Inter|Roboto/);
    expect(css).not.toMatch(/eyebrow/i);
    expect(room + attract + entrance).not.toMatch(/eyebrow/i);
  });
});

describe("the attract screen runs on the one frame clock", () => {
  it("subscribes to onFrame and never starts its own loop", () => {
    expect(attract).toMatch(/onFrame\(/);
    expect(attract).toMatch(/unsubscribe\(\)/);
    expect(attract).not.toMatch(/requestAnimationFrame/);
    expect(attract).not.toMatch(/setInterval/);
  });

  it("never calls setState from inside the frame callback", () => {
    const match = /onFrame\(\([^)]*\) => \{([\s\S]*?)\n {4}\}\);/.exec(attract);
    expect(match, "frame callback not found").toBeTruthy();
    expect(match![1]).not.toMatch(/set[A-Z]\w*\(/);
  });

  it("runs only while on screen and while the tab is visible", () => {
    expect(attract).toMatch(/new IntersectionObserver\(/);
    expect(attract).toMatch(/if \(!visibleRef\.current \|\| !liveRef\.current\) return;/);
  });

  it("drops the persistence layer and halves its rate on a coarse pointer", () => {
    expect(attract).toMatch(/\(pointer: coarse\)/);
    expect(attract).toMatch(/coarse \? null : document\.createElement\("canvas"\)/);
    expect(attract).toMatch(/if \(coarse && parity\) return;/);
  });
});

describe("the entrance is a power-cycle told with the tube's own machinery", () => {
  it("drives the shader's power ramp down and back up rather than fading a div", () => {
    expect(entrance).toMatch(/frame\.current\.bootTarget = 0;/);
    expect(entrance).toMatch(/frame\.current\.bootTarget = 1;/);
    expect(entrance).toMatch(/audio\.powerOn\(\)/);
    expect(entrance).toMatch(/degauss\(\)/);
  });

  it("runs the long form once per page lifetime and the short form after", () => {
    expect(room).toMatch(/!arcadeSession\(\)\.entered/);
    expect(room).toMatch(/markArcadeEntered\(\)/);
    expect(entrance).toMatch(/if \(!long\) \{/);
  });

  it("types lines that are true: the cabinet count and the boards' real state", () => {
    expect(entrance).toMatch(/biosLines\(cabinetCount, boardsRef\.current\)/);
    expect(room).toMatch(/boards === null \? "checking" : boards\.available \? "online" : "offline"/);
  });

  it("advances its bar from the one clock through a ref, never a second loop", () => {
    expect(entrance).toMatch(/onFrame\(/);
    expect(entrance).not.toMatch(/requestAnimationFrame/);
    expect(entrance).toMatch(/barRef\.current\.textContent = /);
  });
});

describe("a running game lights the tube where things happen", () => {
  it("pushes an impact at the engine's event position, projected through the canvas rect", () => {
    expect(game).toMatch(/pushImpact\(frame\.current,/);
    expect(game).toMatch(/state\.eventAt\.x \/ WORLD\.w/);
    expect(game).toMatch(/state\.eventAt\.y \/ WORLD\.h/);
  });

  it("draws through a ghost layer so motion has phosphor memory", () => {
    expect(game).toMatch(/document\.createElement\("canvas"\)/);
    expect(game).toMatch(/\{ compact, ghost \}/);
  });

  it("takes its colours from the theme the room read, never a literal", () => {
    expect(game).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(game).toMatch(/themeRef\.current/);
  });
});
