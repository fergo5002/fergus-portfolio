import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_VERSION } from "@/content/machine";
import { typingDuration } from "@/lib/arcade/bios";
import {
  BOOTING_CLASS,
  BOOT_FAILSAFE_HANDLE,
  BOOT_FAILSAFE_MS,
  BOOT_FLOOR_MS,
  BOOT_PHASES,
  BOOT_REARM_MS,
  BOOT_WATCHDOG_MS,
  DEVICE_LINES,
  HEAD_LINES,
  MEMORY_K,
  SESSION_KEY,
  SETTINGS_KEY,
  STRIKE_FADE_MS,
  armBootFailsafe,
  bootInlineScript,
  bootPhases,
  bootTimeline,
  disarmBootFailsafe,
  FULL_BOOT,
  PHONE_BOOT,
  bootFloorMs,
  pickBootProfile,
} from "./boot";
import type { BootProfile, BootSnapshot } from "./boot";

/**
 * Runs the real inline script against a stub DOM.
 *
 * The point of building the script in a module is that it can be executed here.
 * As a string literal in the layout it was the one part of the app nothing could
 * assert on, which is how a two and a half second error in it shipped.
 *
 * Every global the script touches is passed in as a parameter, which shadows the
 * real one inside the function body. So this exercises the exact string that
 * goes into <head>, with no copy to drift.
 */
function runInlineScript(
  opts: {
    pathname?: string;
    booted?: boolean;
    reducedMotion?: boolean;
    settings?: Record<string, unknown>;
  } = {},
) {
  const classes = new Set<string>();
  const dataset: Record<string, string> = {};
  const styles: Record<string, string> = {};
  const documentElement = {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    dataset,
    style: {
      setProperty: (k: string, v: string) => {
        styles[k] = v;
      },
    },
  };

  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextId = 1;
  const setTimeoutStub = (fn: () => void, ms: number) => {
    const id = nextId++;
    timers.set(id, { fn, ms });
    return id;
  };

  const win: Record<string, unknown> = {
    matchMedia: () => ({ matches: Boolean(opts.reducedMotion) }),
    setTimeout: setTimeoutStub,
  };
  const doc = { documentElement };

  new Function(
    "window",
    "document",
    "location",
    "localStorage",
    "sessionStorage",
    "setTimeout",
    bootInlineScript(),
  )(
    win,
    doc,
    { pathname: opts.pathname ?? "/" },
    { getItem: () => JSON.stringify(opts.settings ?? {}) },
    { getItem: () => (opts.booted ? "1" : null) },
    setTimeoutStub,
  );

  return { classes, dataset, styles, timers, win, doc };
}

type BootState = ReturnType<typeof runInlineScript>;

/**
 * Runs `fn` with the stub standing in for the real globals, then puts everything
 * back exactly as it was, including deleting properties that did not exist
 * before rather than leaving them set to undefined.
 */
function withStubbedGlobals<T>(state: BootState, fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const hadWindow = "window" in g;
  const hadDocument = "document" in g;
  const prevWindow = g.window;
  const prevDocument = g.document;
  const prevClear = g.clearTimeout;

  g.window = state.win;
  g.document = state.doc;
  g.clearTimeout = (id: number) => {
    state.timers.delete(id);
  };
  try {
    return fn();
  } finally {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
    if (hadDocument) g.document = prevDocument;
    else delete g.document;
    g.clearTimeout = prevClear;
  }
}

/** The handle currently parked on the stub window, or 0/undefined. */
const handleOf = (state: BootState) => state.win[BOOT_FAILSAFE_HANDLE] as number | undefined;

/** The brace-matched body after `opener`, so a grep can be held to one function. */
function block(source: string, opener: string): string {
  const at = source.indexOf(opener);
  if (at < 0) throw new Error(`block not found: ${opener}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated block: ${opener}`);
}

/**
 * The sequence as a pure function of elapsed time.
 *
 * It used to be a chain of about 430 `setTimeout` ticks plus two rAF loops of
 * its own. Measured on 2026-09-27 against production in headless Chromium with
 * software WebGL: the header had typed 52 characters after nine seconds, one a
 * second or so, because every tick waited behind a 150ms shader frame. With a
 * real GPU the same page booted in about eight. A timeline read off the one
 * frame clock lands the same words at the same moment on both, and a tab that
 * comes back from the background catches up instead of crawling.
 */
describe("bootTimeline", () => {
  const PROFILES: [string, BootProfile][] = [["full", FULL_BOOT], ["phone", PHONE_BOOT]];
  /** The fields that must never go backwards. `phase` is covered by `step`. */
  const FORWARD: (keyof BootSnapshot)[] = [
    "step", "headChars", "memoryK", "postMs", "deviceChars", "trace", "collapse",
  ];

  it.each(PROFILES)("only ever moves forward (%s)", (_name, profile) => {
    const floor = bootFloorMs(profile);
    let prev = bootTimeline(profile, -50);
    for (let e = -49; e <= floor + 300; e++) {
      const next = bootTimeline(profile, e);
      for (const key of FORWARD) {
        expect(next[key] as number, `${key} at ${e}ms`).toBeGreaterThanOrEqual(prev[key] as number);
      }
      if (prev.done) expect(next.done, `done went false at ${e}ms`).toBe(true);
      prev = next;
    }
  });

  it.each(PROFILES)("finishes exactly at the profile's floor (%s)", (_name, profile) => {
    const floor = bootFloorMs(profile);
    expect(bootTimeline(profile, floor - 1).done).toBe(false);
    expect(bootTimeline(profile, floor - 1).phase).toBe("collapse");
    expect(bootTimeline(profile, floor).done).toBe(true);
    expect(bootTimeline(profile, floor).phase).toBe("done");
    // And stays there, however late the frame that notices.
    expect(bootTimeline(profile, floor + 60_000).done).toBe(true);
  });

  it.each(PROFILES)("visits every phase in order and nothing twice (%s)", (_name, profile) => {
    const seen: string[] = [];
    for (let e = 0; e <= bootFloorMs(profile); e++) {
      const { phase } = bootTimeline(profile, e);
      if (seen[seen.length - 1] !== phase) seen.push(phase);
    }
    // A zero-length phase (the phone has no memory test) is simply skipped.
    const expected = BOOT_PHASES.filter((p) => {
      const span = bootPhases(profile).find((s) => s.phase === p);
      return p === "done" || (span && span.end > span.start);
    });
    expect(seen).toEqual(expected);
  });

  it.each(PROFILES)("has typed every line, counted all memory and drawn the whole mark by the end (%s)", (_name, profile) => {
    const end = bootTimeline(profile, bootFloorMs(profile));
    expect(end.headChars).toBe(profile.headLines.join("").length);
    expect(end.deviceChars).toBe(profile.deviceLines.join("").length);
    expect(end.memoryK).toBe(profile.memoryMs > 0 ? MEMORY_K : 0);
    expect(end.postMs).toBe(profile.postMs);
    expect(end.trace).toBe(1);
    expect(end.collapse).toBe(1);
  });

  it("types from the arcade BIOS helpers rather than a copy of them", () => {
    // Elapsed-time typing already exists in lib/arcade/bios.ts. The head phase
    // lasts exactly as long as that module says its lines take to type.
    const head = bootPhases(FULL_BOOT).find((s) => s.phase === "head")!;
    expect(head.end - head.start).toBe(
      typingDuration(FULL_BOOT.headLines, FULL_BOOT.headSpeedMs, FULL_BOOT.headHoldMs),
    );
    const src = readFileSync(join(process.cwd(), "lib", "boot.ts"), "utf8");
    expect(src).toMatch(/from "@\/lib\/arcade\/bios"/);
    expect(src).not.toMatch(/function typedCount|function typedText/);
  });

  it("keeps the tube dark until the strike, then lets the line through", () => {
    // Genuinely off: the cover is up for the whole of `off` and gone once the
    // strike has faded in.
    expect(bootTimeline(FULL_BOOT, 0).cover).toBe(1);
    expect(bootTimeline(FULL_BOOT, FULL_BOOT.strikeMs - 1).cover).toBe(1);
    expect(bootTimeline(FULL_BOOT, FULL_BOOT.strikeMs + STRIKE_FADE_MS).cover).toBe(0);
  });

  it("blanks the screen for the mode switch and nowhere else after the strike", () => {
    const phases = bootPhases(FULL_BOOT);
    const sw = phases.find((s) => s.phase === "switch")!;
    expect(bootTimeline(FULL_BOOT, sw.start).cover).toBe(1);
    expect(bootTimeline(FULL_BOOT, sw.end - 1).cover).toBe(1);
    for (const span of phases) {
      if (span.phase === "off" || span.phase === "switch" || span.phase === "head") continue;
      if (span.end <= span.start) continue;
      expect(bootTimeline(FULL_BOOT, span.start).cover, span.phase).toBe(0);
    }
  });
});

describe("the boot timings", () => {
  it("keeps the floor honest", () => {
    // Not a magic number: recomputed from the parts so a change to any timing
    // constant shows up here too.
    const p = FULL_BOOT;
    expect(BOOT_FLOOR_MS).toBe(
      p.strikeMs +
        typingDuration(p.headLines, p.headSpeedMs, p.headHoldMs) +
        p.memoryMs +
        p.postMs +
        typingDuration(p.deviceLines, p.deviceSpeedMs, p.deviceHoldMs) +
        p.punchlineMs +
        p.switchMs +
        p.traceMs +
        p.readyMs +
        p.collapseMs,
    );
  });

  it("outlasts both floors with the watchdog, by a margin a slow machine can use", () => {
    // The watchdog is the one timer that can cut a live sequence short. It must
    // never be the thing that ends a healthy boot on either profile.
    for (const profile of [FULL_BOOT, PHONE_BOOT]) {
      expect(BOOT_WATCHDOG_MS).toBeGreaterThan(bootFloorMs(profile) * 2);
    }
  });

  /**
   * Note what is deliberately NOT asserted here: that the failsafe outlasts the
   * floor.
   *
   * An earlier attempt at this fix did assert that, on the reasoning that the
   * ceiling should be a second line of defence against truncation. It is not
   * one. A hidden tab clamps every tick to about a second and stretches the
   * animation past any ceiling worth having, so the guarantee would be false
   * exactly when it was needed. Meanwhile every second added to the failsafe is
   * a second of blank page for a visitor whose JavaScript never arrives.
   *
   * Truncation is prevented by ownership, not by arithmetic. That is what the
   * disarm and re-arm tests below are for.
   */
  it("gives the watchdog the last word on a run that did start", () => {
    expect(BOOT_WATCHDOG_MS).toBeGreaterThan(BOOT_FLOOR_MS);
  });

  it("waits less the second time, having already hidden the page once", () => {
    expect(BOOT_REARM_MS).toBeLessThan(BOOT_FAILSAFE_MS);
  });
});

describe("bootInlineScript", () => {
  it("always flags .js, whatever else it decides", () => {
    expect(runInlineScript({ pathname: "/writing" }).classes.has("js")).toBe(true);
  });

  it("restores the saved theme and CRT settings before paint", () => {
    const { dataset, classes, styles } = runInlineScript({
      settings: { theme: "amber", crtEnabled: false, scanlines: 0.4 },
    });
    expect(dataset.theme).toBe("amber");
    expect(classes.has("crt-off")).toBe(true);
    expect(styles["--scanline-intensity"]).toBe("0.4");
  });

  it("survives unparseable settings rather than taking the page down", () => {
    const classes = new Set<string>();
    expect(() =>
      new Function(
        "window",
        "document",
        "location",
        "localStorage",
        "sessionStorage",
        "setTimeout",
        bootInlineScript(),
      )(
        {},
        {
          documentElement: {
            classList: {
              add: (c: string) => classes.add(c),
              remove: () => {},
              contains: () => false,
            },
            dataset: {},
            style: { setProperty: () => {} },
          },
        },
        { pathname: "/writing" },
        { getItem: () => "{{{not json" },
        { getItem: () => null },
        () => 1,
      ),
    ).not.toThrow();
    expect(classes.has("js")).toBe(true);
  });

  it("hides the page and arms the failsafe on a first visit to the landing page", () => {
    const state = runInlineScript();
    expect(state.classes.has(BOOTING_CLASS)).toBe(true);
    expect(state.timers.get(handleOf(state)!)?.ms).toBe(BOOT_FAILSAFE_MS);
  });

  it.each([
    ["a route BootSequence never mounts on", { pathname: "/writing" }],
    ["a session that has already booted", { booted: true }],
    ["a visitor who asked for reduced motion", { reducedMotion: true }],
  ])("never hides the page for %s", (_label, opts) => {
    const state = runInlineScript(opts);
    // Hiding without a BootSequence to reveal it is how a route gets stuck blank.
    expect(state.classes.has(BOOTING_CLASS)).toBe(false);
    expect(state.timers.size).toBe(0);
    expect(handleOf(state)).toBeUndefined();
  });

  it("reveals the page itself if the boot code never arrives", () => {
    const state = runInlineScript();
    state.timers.get(handleOf(state)!)!.fn();
    expect(state.classes.has(BOOTING_CLASS)).toBe(false);
    expect(handleOf(state)).toBe(0);
  });

  it("reads the same storage keys BootSequence writes", () => {
    // A rename on one side only would mean the boot replayed on every
    // navigation, or never replayed at all.
    expect(bootInlineScript()).toContain(SESSION_KEY);
    expect(bootInlineScript()).toContain(SETTINGS_KEY);
  });
});

/**
 * Exactly one thing may own the reveal at a time. These tests walk the handover
 * in both directions, because getting the second direction wrong is how a page
 * ends up hidden with no timer left anywhere to unhide it.
 */
describe("ownership of the reveal", () => {
  it("disarming stops the failsafe truncating the animation", () => {
    const state = runInlineScript();
    const armed = handleOf(state)!;
    expect(state.timers.has(armed)).toBe(true);

    withStubbedGlobals(state, () => disarmBootFailsafe());

    expect(state.timers.has(armed)).toBe(false);
    // Still hidden: BootSequence owns the reveal outright from here, which is
    // the whole point. Nothing on a fixed delay can unhide the page underneath
    // a sequence that is still playing.
    expect(state.classes.has(BOOTING_CLASS)).toBe(true);
  });

  it("re-arms when BootSequence goes away without finishing", () => {
    const state = runInlineScript();
    withStubbedGlobals(state, () => disarmBootFailsafe()); // mount
    expect(state.timers.size).toBe(0);

    withStubbedGlobals(state, () => armBootFailsafe(BOOT_REARM_MS)); // unmount, unfinished

    const rearmed = handleOf(state)!;
    expect(state.timers.get(rearmed)?.ms).toBe(BOOT_REARM_MS);

    state.timers.get(rearmed)!.fn();
    expect(state.classes.has(BOOTING_CLASS)).toBe(false);
  });

  it("does not re-arm once the page is already revealed", () => {
    // Returning ownership after a normal finish must not resurrect a timer that
    // would have nothing to do.
    const state = runInlineScript();
    withStubbedGlobals(state, () => disarmBootFailsafe());
    state.classes.delete(BOOTING_CLASS); // finish() revealed the page

    withStubbedGlobals(state, () => armBootFailsafe(BOOT_REARM_MS));

    expect(state.timers.size).toBe(0);
  });

  it("never leaves two failsafes running at once", () => {
    const state = runInlineScript();
    withStubbedGlobals(state, () => {
      armBootFailsafe(BOOT_REARM_MS);
      armBootFailsafe(BOOT_REARM_MS);
      armBootFailsafe(BOOT_REARM_MS);
    });
    expect(state.timers.size).toBe(1);
  });

  it("survives the mount/unmount churn StrictMode and Fast Refresh produce", () => {
    const state = runInlineScript();
    for (let i = 0; i < 3; i++) {
      withStubbedGlobals(state, () => disarmBootFailsafe()); // mount
      expect(state.timers.size).toBe(0);
      withStubbedGlobals(state, () => armBootFailsafe(BOOT_REARM_MS)); // unmount
      expect(state.timers.size).toBe(1);
    }
    // Settles owned by whoever mounted last, and the page is still hidden.
    withStubbedGlobals(state, () => disarmBootFailsafe());
    expect(state.timers.size).toBe(0);
    expect(state.classes.has(BOOTING_CLASS)).toBe(true);
  });

  it("is safe when no failsafe was ever armed", () => {
    const state = runInlineScript({ reducedMotion: true });
    expect(() => withStubbedGlobals(state, () => disarmBootFailsafe())).not.toThrow();
    expect(handleOf(state)).toBe(0);
  });

  it("leaves no globals behind", () => {
    // The stubs are installed on globalThis, so a leak here would quietly change
    // how every later test in the file behaves.
    const state = runInlineScript();
    withStubbedGlobals(state, () => disarmBootFailsafe());
    expect("window" in globalThis).toBe(false);
    expect("document" in globalThis).toBe(false);
  });
});

/**
 * A COUPLING CHECK, not a behavioural one, and worth being honest about.
 *
 * vitest runs this project in a `node` environment with no DOM, and `include` is
 * `**\/*.test.ts`, so no test here can mount a React component. Everything above
 * proves that `disarmBootFailsafe` and `armBootFailsafe` behave correctly; none
 * of it proves BootSequence calls them. Delete either call and the suite above
 * stays green while the bug this commit fixes comes straight back.
 *
 * These greps close that specific hole and nothing more. They will not catch a
 * call moved somewhere useless. A jsdom environment and a real mount test would,
 * and is the right thing to add the next time this file needs work.
 */
describe("BootSequence is wired to the failsafe", () => {
  const src = readFileSync(join(process.cwd(), "components", "BootSequence.tsx"), "utf8");

  it("takes ownership of the reveal on mount", () => {
    expect(src).toMatch(/disarmBootFailsafe\(\)/);
  });

  it("hands ownership back if it unmounts before finishing", () => {
    // `\b` matters: `armBootFailsafe` is a substring of `disarmBootFailsafe`, so
    // without the boundary this would happily accept a cleanup that disarmed a
    // second time and left nothing to reveal the page. `s` and `a` are both word
    // characters, so the boundary cannot match inside the longer name.
    expect(src).toMatch(/!finishedRef\.current[\s\S]{0,120}\barmBootFailsafe\(/);
  });

  it("arms a watchdog against stalling", () => {
    expect(src).toMatch(/setTimeout\([\s\S]{0,120}finishRef\.current\(\)[\s\S]{0,120}BOOT_WATCHDOG_MS/);
  });

  it("clears both of its own timers on unmount", () => {
    expect(src).toMatch(/clearTimeout\(strike\)/);
    expect(src).toMatch(/clearTimeout\(watchdog\)/);
  });

  it("reveals the page and drops the overlay together", () => {
    // Separated by the power-on flourish, a throw between them stranded the
    // overlay on top of a visible site.
    // And in the same task: the overlay is dropped with flushSync, so the reveal
    // and the drop are one commit. As a plain state update it waited for
    // React's next commit, behind a software-rendered frame, and the overlay
    // outlived the reveal by up to 284ms (scripts/boot-check.mjs, 2026-09-27).
    expect(src).toMatch(/classList\.remove\(BOOTING_CLASS\);\s*\n\s*flushSync\(\(\) => setBooting\(false\)\);/);
  });

  it("reads the one frame clock and never starts a loop of its own", () => {
    // AGENTS.md: SystemProvider owns the only rAF loop. The old sequence ran
    // two of its own plus about 430 chained timeouts.
    expect(src).toMatch(/onFrame\(\(time\)/);
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/bootTimeline\(profile, /);
  });

  it("never sets state from inside the frame callback", () => {
    // Text goes through refs and continuous values through CSS variables on
    // the elements that use them. The one state change the sequence ends on,
    // dropping the overlay, is handed to a timeout rather than made here.
    const at = src.indexOf("onFrame((time)");
    const body = block(src.slice(at), "=>");
    expect(body.length).toBeGreaterThan(400);
    expect(body).not.toMatch(/\bset(?!Property|Timeout|Attribute)[A-Z]\w*\(/);
    expect(body).not.toMatch(/documentElement\.style/);
    expect(body).toMatch(/setTimeout\(\(\) => finishRef\.current\(\), 0\)/);
  });

  it("never leaves the tube dark if it unmounts part-way", () => {
    // The re-arm reveals the page a second later; a tube still switched off
    // behind it would show the page on a black screen with no rain and no
    // phosphor. The arcade entrance keeps the same rule for the same reason.
    expect(src).toMatch(/if \(!finishedRef\.current\) \{[\s\S]{0,400}bootTarget = 1;[\s\S]{0,80}targetLive = 1;/);
  });

  it("remembers what it published per element, so the mark and the fold line both get --collapse", () => {
    // A cache keyed by the variable's name alone skipped the fold line's
    // writes, because the mark had always just written the same value: the
    // fold stayed invisible on every boot. The paused-clock screenshots in
    // scripts/boot-check.mjs are what caught it; this pins the shape.
    expect(src).toMatch(/let seen = published\.get\(el\);/);
    expect(src).toMatch(/publish\(foldRef\.current, "--collapse", snap\.collapse\)/);
  });

  it("keeps the overlay out of PostHog's autocapture", () => {
    // Autocapture is on. A click that skips the boot lands on text that
    // includes the visitor's own readings, and ph-no-capture on the overlay is
    // what stops PostHog lifting that text into an event.
    expect(src).toMatch(/className="boot ph-no-capture"/);
  });

  it("stops reading the frame clock the moment it finishes", () => {
    // Otherwise the timeline runs on behind the revealed page: a skip mid-trace
    // left the beam tracing the mark into the phosphor for about 600ms after
    // the overlay went, and a skip before the mode switch could still throw its
    // relay (2026-09-27; scripts/boot-check.mjs "a skip mid-trace takes the
    // beam with it" is the browser half of this guard).
    expect(src).toMatch(/stopFrames\.current = unsubscribe;/);
    expect(src).toMatch(/finishedRef\.current = true;\s*\n\s*stopFrames\.current\(\);/);
  });

  it("re-arms the watchdog from the first frame the boot actually runs", () => {
    // The watchdog is armed at mount, but the sequence only advances on frames.
    // A tab opened in the background gets none until it is shown, and a boot
    // that started 15 seconds late was cut off 5 seconds in (code review,
    // 2026-09-27). Armed at mount still covers a boot that never gets a frame.
    expect(src).toMatch(
      /if \(struckAt < 0\) \{\s*struckAt = time;\s*window\.clearTimeout\(watchdog\);\s*watchdog = window\.setTimeout\(\(\) => finishRef\.current\(\), BOOT_WATCHDOG_MS\);/,
    );
  });

  it("draws the mark with the beam through lib/beam.ts, and lets go of it", () => {
    expect(src).toMatch(/writeBeam\(frame\.current, /);
    expect(src).toMatch(/clearBeam\(/);
  });

  it("stores and sends none of the readings it takes", () => {
    // Client-only, never stored, never sent. The one storage write is the boot
    // marker, and it carries a constant.
    const writes = [...src.matchAll(/(?:local|session)Storage\.setItem\(([^)]*)\)/g)].map((m) => m[1]);
    expect(writes).toEqual(['SESSION_KEY, "1"']);
    expect(src).not.toMatch(/fetch\(|sendBeacon|posthog/);
  });

  it("brings its own stylesheet and no longer needs the Typewriter", () => {
    expect(src).toMatch(/import "\.\/boot\.css";/);
    expect(src).not.toMatch(/Typewriter/);
    expect(existsSync(join(process.cwd(), "components", "Typewriter.tsx"))).toBe(false);
  });

  it("keeps the flourish from being able to strand the overlay", () => {
    // The adjacency above is the belt. This is the braces: whatever runs after
    // the reveal is wrapped, so a failure in decoration cannot take the page
    // with it, and cannot escape when the watchdog is the caller (a throw inside
    // a setTimeout callback reaches no error boundary at all).
    expect(src).toMatch(/setBooting\(false\)\);[\s\S]{0,400}\btry\s*\{[\s\S]{0,400}degauss\(\)/);
  });
});

describe("the phone boot (Fergus, 2026-09-06, lengthened 2026-09-13)", () => {
  // The full sequence is 6.4 seconds of BIOS on a first visit, and on a phone
  // that is a black screen for longer than most people give a link. Fergus
  // chose a shorter boot for phones over skipping it. The first version ran at
  // about two seconds and he said it looked bad, so it is now about three and a
  // half: still well under the desktop boot, long enough to read as a machine
  // starting up rather than a flash.
  it("is a real profile with a floor near three and a half seconds", () => {
    expect(bootFloorMs(PHONE_BOOT)).toBeLessThan(3900);
    expect(bootFloorMs(PHONE_BOOT)).toBeGreaterThan(3200);
  });

  // The reason the two second version looked cheap was not only its length.
  // Both typewriters ran at 6 and 7 milliseconds a character, which is fast
  // enough that a line appears whole instead of typing, and a BIOS that appears
  // is just unstyled text. Slower than the desktop boot is deliberate.
  it("types slowly enough to be seen typing", () => {
    expect(PHONE_BOOT.headSpeedMs).toBeGreaterThanOrEqual(12);
    expect(PHONE_BOOT.deviceSpeedMs).toBeGreaterThanOrEqual(8);
  });

  // A first line and a last line is not a list. The middle one is what makes
  // the device block read as a machine working through something.
  it("keeps a middle to the device list", () => {
    expect(PHONE_BOOT.deviceLines.length).toBeGreaterThanOrEqual(3);
    expect(PHONE_BOOT.deviceLines.length).toBeLessThan(DEVICE_LINES.length);
  });

  it("defines BOOT_FLOOR_MS as the full profile's floor", () => {
    expect(bootFloorMs(FULL_BOOT)).toBe(BOOT_FLOOR_MS);
  });

  it("is picked for a coarse pointer or a narrow window, and the full boot otherwise", () => {
    expect(pickBootProfile({ coarse: true, width: 1440 })).toBe(PHONE_BOOT);
    expect(pickBootProfile({ coarse: false, width: 390 })).toBe(PHONE_BOOT);
    expect(pickBootProfile({ coarse: false, width: 1440 })).toBe(FULL_BOOT);
  });

  it("still types real lines from the same script rather than a different story", () => {
    for (const line of [...PHONE_BOOT.headLines, ...PHONE_BOOT.deviceLines]) {
      expect([...HEAD_LINES, ...DEVICE_LINES]).toContain(line);
    }
  });

  it("is what BootSequence reads, not the constants", () => {
    const source = readFileSync(join(process.cwd(), "components", "BootSequence.tsx"), "utf8");
    expect(source).toContain("pickBootProfile(");
    expect(source).not.toMatch(/lines=\{\[\.\.\.HEAD_LINES\]\}/);
  });
});

/**
 * Presterly was wound down in August 2026 and Tigh Sauna is the company now.
 * Fergus asked for the mount line to say so (2026-09-27). Every line any
 * profile can type is checked, not just the one that changed, because the
 * retired name reaching a visitor through a different line is the same bug.
 */
describe("the boot mounts Tigh Sauna, not Presterly (Fergus, 2026-09-27)", () => {
  const everyLine = [...HEAD_LINES, ...DEVICE_LINES, ...PHONE_BOOT.headLines, ...PHONE_BOOT.deviceLines];

  it("mounts /usr/tighsauna", () => {
    expect(DEVICE_LINES.some((line) => line.includes("/usr/tighsauna"))).toBe(true);
  });

  it("never types the retired name, in any case", () => {
    for (const line of everyLine) expect(line.toLowerCase()).not.toContain("presterly");
  });

  it("says it on a phone too, where the old line was never typed", () => {
    expect(PHONE_BOOT.deviceLines.some((line) => line.includes("/usr/tighsauna"))).toBe(true);
  });

  it("keeps the leader column: the new line ends where its neighbours do", () => {
    const tigh = DEVICE_LINES.find((line) => line.includes("/usr/tighsauna"))!;
    expect(tigh.indexOf(" OK")).toBe(DEVICE_LINES[0].indexOf(" OK"));
  });

  it("reads the version from the machine's own copy", () => {
    expect(SYSTEM_VERSION).toBe("6.0");
    expect(HEAD_LINES[0].startsWith(`FergusOS BIOS v${SYSTEM_VERSION} `)).toBe(true);
  });
});
