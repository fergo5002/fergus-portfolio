import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

it("gives the arcade keyboard focus before its first paint", () => {
  const source = code(read("components", "arcade", "ArcadeExperience.tsx"));
  // A passive effect leaves an interval where Escape can reach the drawer's
  // window handler and remove both the program and its terminal.
  expect(source).toMatch(/useLayoutEffect\(\(\) => \{\s*roomRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[\]\)/);
});

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

  it("hides the page and terminal chrome, and hides the nav only for the entrance", () => {
    expect(css).toMatch(/html\.arcade-open \.crt__screen,\s*html\.arcade-open \.shell,\s*html\.arcade-open \.statusbar\s*\{\s*visibility:\s*hidden;/);
    expect(css).toMatch(/html\.arcade-entering \.nav\s*\{\s*visibility:\s*hidden;/);
    expect(css).not.toMatch(/html\.arcade-open \.nav/);
    expect(css).toMatch(/\.arcade-room\s*\{[^}]*inset:\s*var\(--nav-h\) 0 0;/);
    expect(room).toMatch(/classList\.add\("arcade-open"\)/);
    expect(room).toMatch(/classList\.remove\("arcade-open"\)/);
  });

  it("keeps the screensaver off a room that is always moving, since it cannot hear the room's keys", () => {
    expect(css).toMatch(/html\.arcade-open \.saver \{\s*visibility: hidden;\s*\}/);
  });

  it("puts focus on the stage when a game starts, never on the back button", () => {
    // The first Space is the launch key. With the back button under focus it was "all cabinets".
    expect(room).toMatch(/screen\.kind === "play" \? "\.arcade-stage"/);
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

describe("arcade multiplayer is retired (2026-09-27)", () => {
  it("has no lobby, no peer link and no second player left in the room", () => {
    expect(existsSync(join(process.cwd(), "components", "arcade", "NetworkLobby.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "lib", "arcade", "network.ts"))).toBe(false);
    const detail = code(read("components", "arcade", "CabinetDetail.tsx"));
    for (const [name, src] of [["room", room], ["game", game], ["detail", detail]] as const) {
      expect(src, name).not.toMatch(/NetworkLobby|arcade\/network|\bp2(up|down|left|right|action)\b|mode === "local"|\bGameMode\b|\bLink\b/);
    }
  });

  it("leaves Overlap's own WebRTC tool code where it was", () => {
    expect(existsSync(join(process.cwd(), "lib", "tools", "overlap", "webrtc.ts"))).toBe(true);
  });
});

describe("a running game lights the tube where things happen", () => {
  it("pushes an impact at the engine's event position, projected through the stage and the canvas rect", () => {
    expect(game).toMatch(/pushImpact\(frame\.current,/);
    expect(game).toMatch(/const at = eventPoint\(state\.id, event\.at, v\.stage\);/);
    expect(game).toMatch(/at\.x \/ v\.stage\.w/);
    expect(game).toMatch(/at\.y \/ v\.stage\.h/);
  });

  it("caps the light to one a frame, so physics keeps its slots", () => {
    expect(frameCallback(game).match(/pushImpact\(/g) ?? []).toHaveLength(1);
  });

  it("draws through a ghost layer so motion has phosphor memory", () => {
    expect(game).toMatch(/document\.createElement\("canvas"\)/);
    expect(game).toMatch(/const view = \(\) => \(\{ stage: stageFor\(cabinet\.id, kindRef\.current\), ghost,/);
  });

  it("takes its colours from the theme the room read, never a literal", () => {
    expect(game).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(game).toMatch(/themeRef\.current/);
  });
});

/** The body of the one onFrame callback in a component, which may schedule no render. */
function frameCallback(src: string): string {
  const match = /onFrame\(\([^)]*\) => \{([\s\S]*?)\n {4}\}\);/.exec(src);
  if (!match) throw new Error("frame callback not found");
  return match[1];
}

/* ── the shared chrome and the header's replacement (2026-09-27) ─────────── */

describe("a game view without the header bar", () => {
  it("has no header bar left: no prompt path, no hall of fame button, no bar-level sound or esc", () => {
    expect(room).not.toMatch(/arcade-bar/);
    expect(css).not.toMatch(/arcade-bar/);
    expect(room).not.toMatch(/kind: "fame"/);
  });

  it("carries pause and sound as visible controls, with P and M as their keys", () => {
    expect(game).toMatch(/className="arcade-btn arcade-tool arcade-tool--pause"[^\n]*aria-keyshortcuts="P"/);
    expect(game).toMatch(/<SoundSwitch className="arcade-tool" keyShortcut="M" returnFocus=/);
    expect(sound).toMatch(/aria-keyshortcuts=\{keyShortcut\}/);
    expect(game).toMatch(/if \(k === "p"\) \{ e\.preventDefault\(\); if \(!e\.repeat\) pause\(!runRef\.current!\.paused\); return; \}/);
    expect(game).toMatch(/if \(k === "m"\) \{ e\.preventDefault\(\); if \(!e\.repeat\) setAudioEnabled\(!audioLive\); return; \}/);
  });

  it("keeps a way back to the cabinets in the game view", () => {
    expect(game).toMatch(/className="arcade-btn arcade-back" onClick=\{onBack\}/);
  });

  it("pauses and lets go of every held key when the window blurs or the tab hides", () => {
    expect(game).toMatch(/const blur = \(\) => pause\(true\);/);
    expect(game).toMatch(/window\.addEventListener\("blur", blur\)/);
    expect(game).toMatch(/if \(document\.hidden\) blur\(\);/);
    expect(game).toMatch(/const done = pauseRun\(runRef\.current!, value\);\s*setPaused\(done && value\);\s*release\(\);/);
  });

  it("steps the run, not the bare game, from the one frame clock, and never renders React from it", () => {
    const body = frameCallback(game);
    expect(body).toMatch(/stepRun\(state, 1 \/ 60, keys\.current\)/);
    expect(body).toMatch(/renderRun\(ctx, state,/);
    expect(body).not.toMatch(/set[A-Z]\w*\(/);
    expect(game).not.toMatch(/requestAnimationFrame|setInterval/);
  });

  it("routes every key through the run, so the first Space on the card starts it", () => {
    expect(game).toMatch(/const out = pressRun\(runRef\.current!, key\);/);
    expect(game).toMatch(/physical\.current\.set\(e\.code, key\); keys\.current\.add\(key\); press\(key\);/);
  });

  it("gives a screen reader the HUD through a hidden status line, written through a ref about once a second", () => {
    expect(game).toMatch(/<p className="arcade-status vh" role="status" aria-live="polite" aria-atomic="true" ref=\{statusRef\} \/>/);
    expect(frameCallback(game)).toMatch(/if \(\(time - statusAt >= 1000 \|\| state\.phase !== statusPhase\) && statusRef\.current\) \{/);
    expect(frameCallback(game)).toMatch(/statusRef\.current\.textContent = statusLine\(/);
    expect(game).not.toMatch(/arcade-live-hud/);
  });

  it("chooses the stage's shape from the room's width on resize, never in a frame", () => {
    expect(game).toMatch(/const fit = \(\) => setKind\(stageKind\(root\.clientWidth\)\);/);
    expect(frameCallback(game)).not.toMatch(/stageKind\(|clientWidth/);
  });

  it("shows the HUD's best from this tab or the board, and stores nothing for it", () => {
    expect(game).toMatch(/best: bestFor\(cabinet\.id, boards\)/);
    expect(game).toMatch(/rememberBest\(cabinet\.id, s\.score\)/);
    expect(game).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe("a typing game's text input", () => {
  it("is a real input a phone keyboard will type into without correcting or zooming", () => {
    for (const attr of ['autoCapitalize="none"', 'autoCorrect="off"', 'autoComplete="off"', "spellCheck={false}", 'type="text"']) expect(game).toContain(attr);
    expect(css).toMatch(/\.arcade-type__input \{[^}]*font-size: 16px;/);
  });

  it("reads the value through the diff, never keydown, because Android sends keydown 229", () => {
    expect(game).toMatch(/for \(const key of pressesFor\(diffInput\(typedRef\.current, value\)\)\) pressRun\(run, key\);/);
    expect(game).toMatch(/onInput=\{typed\}/);
  });

  it("takes focus inside the gesture that starts the run, the one moment iOS raises a keyboard", () => {
    expect(game).toMatch(/if \(out === "start"\) \{\s*audio\.relay\(\);\s*if \(typing\) focusType\(\);/);
    expect(game).toMatch(/const canvasClick = \(\) => \{ if \(runRef\.current!\.phase === "card"\) press\("action"\); \};/);
  });

  it("lets Escape through to the room, which leaves", () => {
    const typeKey = /const typeKey = [\s\S]*?\n  \};/.exec(game)?.[0] ?? "";
    expect(typeKey).toMatch(/if \(e\.key === "Escape"\) return;/);
    expect(typeKey).not.toMatch(/stopPropagation/);
  });

  it("follows the visual viewport on resize, throttled, outside the frame clock", () => {
    expect(game).toMatch(/vv\.addEventListener\("resize", onResize\)/);
    expect(game).toMatch(/root\.style\.setProperty\("--vv-h"/);
    expect(frameCallback(game)).not.toMatch(/--vv-h|visualViewport/);
  });

  it("sizes its screen to what is left under the nav, so the HUD shows with the room scrolled to its end", () => {
    // What has to fit in the visual viewport below the fixed nav: the canvas, the typing line (61px),
    // the room's bottom padding (56px) and a gap. The browser proof is arcade-collection-check at 390 by 400.
    const rule = /\.arcade-play--text \.arcade-frame \{\s*width: min\(100%, calc\(\(var\(--vv-h, 100dvh\) - var\(--nav-h\) - (\d+)px\) \* var\(--stage-ratio, 1\.25\)\)\);/.exec(css);
    expect(rule, "the typing game's frame is sized from --vv-h less the nav").not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(61 + 56 + 8);
    expect(css).toMatch(/\.arcade-room__inner \{[^}]*padding: var\(--sp-3\) var\(--arcade-gutter\) 56px;/);
  });

  it("keeps the typing line one row, whatever the room's generic label rule says", () => {
    // `.arcade-room label` (0,1,1) sets display: block and a bottom margin; a bare `.arcade-type` (0,1,0)
    // loses to it, and the prompt then wraps above the input on a narrow frame, 82px instead of 61.
    expect(css).toMatch(/\.arcade-room label \{[^}]*display: block;/);
    expect(css).toMatch(/\.arcade-room \.arcade-type \{\s*display: flex;[^}]*margin: 0;/);
  });
});

describe("the Hall of Fame is a section of the front, not a screen", () => {
  const gallery = code(read("components", "arcade", "Gallery.tsx"));
  const fame = code(read("components", "arcade", "HallOfFame.tsx"));

  it("sits under the cabinets, on the front, from the same board snapshot", () => {
    expect(gallery.indexOf("<HallOfFame boards={boards} />")).toBeGreaterThan(gallery.indexOf("</ul>"));
  });

  it("decides what to show in lib, and says loading or offline in a sentence", () => {
    expect(fame).toMatch(/const fame = fameTable\(boards, GAME_IDS\);/);
    expect(fame).toMatch(/fame\.kind === "checking" \? copy\.loading : copy\.unavailable/);
  });

  it("draws an empty slot's dashes in CSS and keeps the word in the document", () => {
    expect(fame).toMatch(/<span className="fame__empty"><span className="vh">\{copy\.fameEmptySlot\}<\/span><\/span>/);
    expect(css).toMatch(/\.fame__empty::before \{\s*content: "---";/);
  });

  it("shows one cabinet's column at a time on a phone, chosen with a switcher", () => {
    expect(fame).toMatch(/<table className="fame__table" data-shown=\{shown\}>/);
    expect(css).toMatch(/@media \(max-width: 700px\) \{\s*\.fame__switch \{\s*display: flex;/);
    for (const id of ["signal", "poker", "panic"]) expect(css).toContain(`.fame__table[data-shown="${id}"] [data-game="${id}"]`);
  });
});

describe("what the arcade keeps on the visitor's machine", () => {
  it("writes exactly one key, the posted initials, from exactly one place", () => {
    const dirs = [["components", "arcade"], ["lib", "arcade"]];
    const writes: string[] = [];
    for (const dir of dirs) {
      for (const file of readdirSync(join(process.cwd(), ...dir))) {
        if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
        const src = code(read(...dir, file));
        for (const m of src.matchAll(/\.setItem\(\s*([^,]+?)\s*,/g)) writes.push(`${dir.join("/")}/${file}: ${m[1]}`);
      }
    }
    expect(writes).toEqual(["lib/arcade/session.ts: INITIALS_KEY"]);
  });
});

describe("the direction pad is for thumbs", () => {
  it("hides on a machine with a mouse and a keyboard", () => {
    // On a 1440 desktop the pad sat under every game as clutter; the arrows
    // and WASD do its job there (2026-09-27). Touch screens keep it.
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.arcade-dpad \{\s*display: none;\s*\}\s*\}/);
  });
});

describe("the room keeps a typing game's field and a held finger honest (code review, 2026-09-27)", () => {
  const room = read("components", "arcade", "CanvasGame.tsx");
  it("resyncs the field from the game each frame, outside a composition", () => {
    // A process landing released the lock but the field kept the dead word's
    // letters, so the next letter was misread as a fresh first letter.
    expect(room).toMatch(/if \(typing && !composing\.current && typedOf\(state\.game\) !== typedRef\.current\) syncTyped\(\);/);
  });
  it("hears P and M from the typing field while paused", () => {
    expect(room).toMatch(/if \(run\.paused && \(k === "p" \|\| k === "m"\)\)/);
  });
  it("starts a typing game from the card on a typed space or newline", () => {
    // Android reports Space as keydown "Unidentified", so the key handler never sees it.
    expect(room).toMatch(/if \(run\.phase === "card"\) \{[\s\S]{0,500}\/\[ \\n\]\/\.test\(/);
  });
  it("steers towards a held finger every frame, not only on pointer events", () => {
    expect(room).toMatch(/steerTo\.current = at;/);
    expect(room).toMatch(/for \(const k of steerKeys\(s\.player, steerTo\.current\)\) keys\.current\.add\(k\);/);
  });
});

/* ── one universal header (Fergus, 2026-09-28) ─────────────────────────────── */

const gallery = code(read("components", "arcade", "Gallery.tsx"));
const sound = code(read("components", "arcade", "SoundSwitch.tsx"));

describe("the room has no header of its own: the site nav is the only one", () => {
  it("draws no bar, prompt or header inside the room", () => {
    expect(room).not.toMatch(/<header/);
    expect(room).not.toMatch(/arcade-bar/);
    expect(css).not.toMatch(/\.arcade-bar/);
  });

  it("keeps a sound switch where sound happens: the gallery front and beside the running game", () => {
    expect(sound).toMatch(/setAudioEnabled\(!audioLive\)/);
    expect(sound).toMatch(/aria-pressed=\{audioLive\}/);
    expect(sound).toMatch(/audioLive \? copy\.soundOn : copy\.soundOff/);
    expect(gallery).toMatch(/<SoundSwitch \/>/);
    const head = /<div className="arcade-play__head">([\s\S]*?)<\/div>/.exec(game)?.[1] ?? "";
    expect(head).toMatch(/<SoundSwitch [^>]*returnFocus=\{/);
  });

  it("never takes focus off a running game, so a held key cannot stick on the switch", () => {
    // mousedown, not pointerdown: cancelling pointerdown does not stop the focus move in every browser.
    expect(sound).toMatch(/onMouseDown=\{returnFocus \? \(e\) => e\.preventDefault\(\) : undefined\}/);
    expect(sound).toMatch(/returnFocus\?\.\(\);/);
  });

  it("hands focus back to a typing game's field, not its stage, after the switch", () => {
    expect(game).toMatch(/returnFocus=\{\(\) => \(typing \? focusType\(\) : stageRef\.current\?\.focus\(\{ preventScroll: true \}\)\)\}/);
  });

  it("leaves through its own leave() when the nav asks, the same way Escape does", () => {
    expect(room).toMatch(/useEffect\(\(\) => subscribeArcadeLeave\(leave\), \[leave\]\);/);
  });

  it("still leaves on Escape", () => {
    expect(room).toMatch(/if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*leave\(\);/);
  });
});
