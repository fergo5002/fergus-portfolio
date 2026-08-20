import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOTING_CLASS,
  BOOT_FAILSAFE_HANDLE,
  BOOT_FAILSAFE_MS,
  BOOT_FLOOR_MS,
  BOOT_REARM_MS,
  BOOT_WATCHDOG_MS,
  DEVICE_LINES,
  DEVICE_SPEED_MS,
  HEAD_LINES,
  HEAD_SPEED_MS,
  SESSION_KEY,
  SETTINGS_KEY,
  armBootFailsafe,
  bootInlineScript,
  disarmBootFailsafe,
  typewriterMs,
} from "./boot";

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

describe("typewriterMs", () => {
  /**
   * Models the SCHEDULER, not the formula.
   *
   * An earlier version of this helper added `speed` before its terminating
   * check, which made it algebraically identical to `typewriterMs` and therefore
   * incapable of ever disagreeing with it. Both carried the same off-by-one: the
   * first tick is scheduled with `startDelay`, not with `speed`
   * (components/Typewriter.tsx), so a T-tick run finishes at
   * `startDelay + (T-1) * speed`.
   *
   * The variable here is the clock, and it only advances between ticks.
   */
  function simulate(lines: readonly string[], speed: number, startDelay = 0): number {
    let li = 0;
    let ci = 0;
    let t = startDelay; // when the first tick fires
    for (;;) {
      if (li >= lines.length) return t; // this is the tick that calls onDone
      if (ci < lines[li].length) ci += 1;
      else {
        li += 1;
        ci = 0;
      }
      t += speed; // the next tick is scheduled `speed` later
    }
  }

  it("agrees with a simulation of the component's scheduler", () => {
    expect(typewriterMs(HEAD_LINES, HEAD_SPEED_MS)).toBe(simulate(HEAD_LINES, HEAD_SPEED_MS));
    expect(typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS)).toBe(
      simulate(DEVICE_LINES, DEVICE_SPEED_MS),
    );
  });

  it("does not charge for the first tick", () => {
    // "ab" at 10ms: 'a' at t=0, 'b' at t=10, line boundary at t=20, onDone at
    // t=30. Four ticks, three gaps. Counting four gaps is the off-by-one.
    expect(typewriterMs(["ab"], 10)).toBe(30);
    expect(simulate(["ab"], 10)).toBe(30);
  });

  it("honours a start delay", () => {
    expect(typewriterMs(["ab"], 10, 500)).toBe(530);
    expect(simulate(["ab"], 10, 500)).toBe(530);
  });
});

describe("the boot timings", () => {
  it("keeps the floor honest", () => {
    // Not a magic number: recomputed from the parts so a change to any timing
    // constant shows up here too.
    expect(BOOT_FLOOR_MS).toBe(
      420 +
        typewriterMs(HEAD_LINES, HEAD_SPEED_MS) +
        900 +
        typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS) +
        780 +
        420,
    );
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
    expect(src).toMatch(/!finishedRef\.current[^\n]*armBootFailsafe/);
  });

  it("arms a watchdog against stalling", () => {
    expect(src).toMatch(/setTimeout\([^\n]*finishRef\.current\(\)[^\n]*BOOT_WATCHDOG_MS/);
  });

  it("clears both of its own timers on unmount", () => {
    expect(src).toMatch(/clearTimeout\(strike\)/);
    expect(src).toMatch(/clearTimeout\(watchdog\)/);
  });

  it("reveals the page and drops the overlay together", () => {
    // Separated by the power-on flourish, a throw between them stranded the
    // overlay on top of a visible site.
    expect(src).toMatch(/classList\.remove\(BOOTING_CLASS\);\s*\n\s*setBooting\(false\);/);
  });
});
