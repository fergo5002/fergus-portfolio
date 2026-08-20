import { describe, it, expect } from "vitest";
import {
  BOOT_FAILSAFE_HANDLE,
  BOOT_FAILSAFE_MS,
  BOOT_FLOOR_MS,
  BOOT_WATCHDOG_MS,
  DEVICE_LINES,
  DEVICE_SPEED_MS,
  HEAD_LINES,
  HEAD_SPEED_MS,
  SESSION_KEY,
  SETTINGS_KEY,
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
  };

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
    { documentElement },
    { pathname: opts.pathname ?? "/" },
    { getItem: () => JSON.stringify(opts.settings ?? {}) },
    { getItem: () => (opts.booted ? "1" : null) },
    setTimeoutStub,
  );

  return { classes, dataset, styles, timers, win };
}

/** Calls disarmBootFailsafe() against the stub, the way BootSequence does on mount. */
function mountBootSequence(state: ReturnType<typeof runInlineScript>) {
  const g = globalThis as unknown as Record<string, unknown>;
  const realWindow = g.window;
  const realClear = g.clearTimeout;
  g.window = state.win;
  g.clearTimeout = (id: number) => {
    state.timers.delete(id);
  };
  try {
    disarmBootFailsafe();
  } finally {
    g.window = realWindow;
    g.clearTimeout = realClear;
  }
}

describe("typewriterMs", () => {
  /**
   * Mirrors Typewriter's actual loop: one tick per character, one more at each
   * line boundary, one final tick that fires onDone, all spaced by `speed`.
   *
   * Modelling that loop wrongly is how the original estimate went astray, so the
   * formula is checked against a simulation of it rather than trusted.
   */
  function simulate(lines: readonly string[], speed: number): number {
    let li = 0;
    let ci = 0;
    let elapsed = 0;
    for (;;) {
      elapsed += speed;
      if (li >= lines.length) return elapsed;
      if (ci < lines[li].length) ci += 1;
      else {
        li += 1;
        ci = 0;
      }
    }
  }

  it("agrees with a simulation of the component's loop", () => {
    expect(typewriterMs(HEAD_LINES, HEAD_SPEED_MS)).toBe(simulate(HEAD_LINES, HEAD_SPEED_MS));
    expect(typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS)).toBe(
      simulate(DEVICE_LINES, DEVICE_SPEED_MS),
    );
  });

  it("counts a line boundary and the final done tick", () => {
    // "ab" = 2 chars + 1 boundary + 1 done tick = 4 ticks.
    expect(typewriterMs(["ab"], 10)).toBe(40);
  });
});

describe("BOOT_FAILSAFE_MS", () => {
  /**
   * THE REGRESSION TEST.
   *
   * This is the assertion that was missing. The failsafe shipped at 4000 ms
   * against a 6437 ms floor, so it stripped `booting` while the BIOS screen was
   * still typing and the landing page appeared underneath it. Confirmed live
   * before the fix: `booting` went false at 5333 ms with the overlay still
   * mounted.
   *
   * Disarming on mount is the real fix and is tested below. This is the second
   * line of defence: even if the disarming is lost, the ceiling alone must not
   * cut a nominal run short.
   */
  it("cannot fire before the sequence could possibly have finished", () => {
    expect(BOOT_FAILSAFE_MS).toBeGreaterThan(BOOT_FLOOR_MS);
  });

  it("gives the stall watchdog room to act first on a run that did start", () => {
    // The watchdog belongs to BootSequence and finishes cleanly; the inline
    // failsafe just unhides. If the failsafe were the later of the two it would
    // never be reached, which would make it dead code.
    expect(BOOT_WATCHDOG_MS).toBeGreaterThan(BOOT_FAILSAFE_MS);
    expect(BOOT_WATCHDOG_MS).toBeGreaterThan(BOOT_FLOOR_MS);
  });

  it("keeps the floor honest", () => {
    // Not a magic number: recomputed from the parts so a change to any timing
    // constant shows up here as well as in the guard above.
    expect(BOOT_FLOOR_MS).toBe(
      420 +
        typewriterMs(HEAD_LINES, HEAD_SPEED_MS) +
        900 +
        typewriterMs(DEVICE_LINES, DEVICE_SPEED_MS) +
        780 +
        420,
    );
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
    const g = new Function(
      "window",
      "document",
      "location",
      "localStorage",
      "sessionStorage",
      "setTimeout",
      bootInlineScript(),
    );
    const classes = new Set<string>();
    expect(() =>
      g(
        {},
        {
          documentElement: {
            classList: { add: (c: string) => classes.add(c), remove: () => {}, contains: () => false },
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
    const { classes, timers, win } = runInlineScript();
    expect(classes.has("booting")).toBe(true);
    const handle = win[BOOT_FAILSAFE_HANDLE] as number;
    expect(timers.get(handle)?.ms).toBe(BOOT_FAILSAFE_MS);
  });

  it.each([
    ["a route BootSequence never mounts on", { pathname: "/writing" }],
    ["a session that has already booted", { booted: true }],
    ["a visitor who asked for reduced motion", { reducedMotion: true }],
  ])("never hides the page for %s", (_label, opts) => {
    const { classes, timers, win } = runInlineScript(opts);
    // Hiding without a BootSequence to reveal it is how a route gets stuck blank.
    expect(classes.has("booting")).toBe(false);
    expect(timers.size).toBe(0);
    expect(win[BOOT_FAILSAFE_HANDLE]).toBeUndefined();
  });

  it("reveals the page itself if the boot code never arrives", () => {
    const { classes, timers, win } = runInlineScript();
    timers.get(win[BOOT_FAILSAFE_HANDLE] as number)!.fn();
    expect(classes.has("booting")).toBe(false);
  });

  it("reads the same storage keys BootSequence writes", () => {
    // A rename on one side only would mean the boot replayed on every
    // navigation, or never replayed at all.
    expect(bootInlineScript()).toContain(SESSION_KEY);
    expect(bootInlineScript()).toContain(SETTINGS_KEY);
  });
});

describe("disarmBootFailsafe", () => {
  it("cancels the failsafe so it can never truncate the animation", () => {
    const state = runInlineScript();
    const handle = state.win[BOOT_FAILSAFE_HANDLE] as number;
    expect(state.timers.has(handle)).toBe(true);

    mountBootSequence(state);

    expect(state.timers.has(handle)).toBe(false);
    // Still hidden: BootSequence now owns the reveal outright, which is the
    // whole point. Nothing on a fixed timer can unhide the page underneath a
    // sequence that is still playing.
    expect(state.classes.has("booting")).toBe(true);
  });

  it("is safe when no failsafe was ever armed", () => {
    // BootSequence calls it unconditionally, before it checks whether it is
    // booting at all, so every no-boot path goes through here.
    const state = runInlineScript({ reducedMotion: true });
    expect(() => mountBootSequence(state)).not.toThrow();
    expect(state.win[BOOT_FAILSAFE_HANDLE]).toBe(0);
  });

  it("is idempotent", () => {
    const state = runInlineScript();
    mountBootSequence(state);
    expect(() => mountBootSequence(state)).not.toThrow();
    expect(state.timers.size).toBe(0);
  });
});
