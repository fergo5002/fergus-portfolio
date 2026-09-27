import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_REFRESH_GAPS,
  POST_LABEL_WIDTH,
  POST_MAX_WIDTH,
  postLines,
  postReveal,
  refreshFromGaps,
} from "./post";
import type { HostEnv } from "./post";

const DESK: HostEnv = {
  cores: 8,
  memoryGb: 8,
  screenW: 1440,
  screenH: 900,
  dpr: 2,
  refreshHz: 60,
  locale: "en-IE",
  timeZone: "Europe/Dublin",
};

describe("postLines", () => {
  it("formats the injected readings, one aligned line each", () => {
    expect(postLines(DESK)).toEqual([
      "Host CPU      : 8 logical cores",
      "Host memory   : 8 GB or more",
      "Host display  : 1440 x 900 @2x, 60 Hz",
      "Host locale   : en-IE, Europe/Dublin",
    ]);
  });

  it("leaves an unmeasured refresh rate out rather than print a wrong one", () => {
    const lines = postLines({ ...DESK, refreshHz: null });
    expect(lines).toContain("Host display  : 1440 x 900 @2x");
    expect(lines.join("\n")).not.toMatch(/Hz/);
    expect(postLines({ ...DESK, refreshHz: undefined }).join("\n")).not.toMatch(/Hz/);
  });

  it.each([undefined, null, 0, -2, Number.NaN, 2.5])(
    "says so when the core count is missing or nonsense (%s)",
    (cores) => {
      expect(postLines({ ...DESK, cores })[0]).toBe("Host CPU      : not reported");
    },
  );

  it("counts one core in the singular", () => {
    expect(postLines({ ...DESK, cores: 1 })[0]).toBe("Host CPU      : 1 logical core");
  });

  it("prints memory only where the browser reports it", () => {
    // navigator.deviceMemory is Chromium only. Safari and Firefox get no line,
    // not a guess.
    const lines = postLines({ ...DESK, memoryGb: undefined });
    expect(lines.some((l) => l.startsWith("Host memory"))).toBe(false);
    expect(lines).toHaveLength(3);
  });

  it("words memory as the approximation it is", () => {
    // Chrome rounds to the nearest power of two and caps at 8, so a 32GB
    // machine reports 8. "8 GB" would be a wrong number on most developer
    // laptops; "8 GB or more" is not.
    const memory = (memoryGb: number) =>
      postLines({ ...DESK, memoryGb }).find((l) => l.startsWith("Host memory"));
    expect(memory(4)).toBe("Host memory   : about 4 GB");
    expect(memory(0.5)).toBe("Host memory   : about 512 MB");
    expect(memory(8)).toBe("Host memory   : 8 GB or more");
  });

  it("prints the pixel ratio as the browser gives it, trimmed", () => {
    const display = (dpr: number) =>
      postLines({ ...DESK, dpr, refreshHz: null }).find((l) => l.startsWith("Host display"));
    expect(display(1)).toBe("Host display  : 1440 x 900 @1x");
    expect(display(1.25)).toBe("Host display  : 1440 x 900 @1.25x");
    // Browser zoom lands here as a float with a tail.
    expect(display(1.100000023841858)).toBe("Host display  : 1440 x 900 @1.1x");
    expect(display(2.625)).toBe("Host display  : 1440 x 900 @2.63x");
  });

  it("drops the display line when there is no screen to describe", () => {
    const lines = postLines({ ...DESK, screenW: undefined, screenH: undefined });
    expect(lines.some((l) => l.startsWith("Host display"))).toBe(false);
  });

  it("prints only the fields a profile asks for, in its order", () => {
    expect(postLines(DESK, ["display", "locale"])).toEqual([
      "Host display  : 1440 x 900 @2x, 60 Hz",
      "Host locale   : en-IE, Europe/Dublin",
    ]);
  });

  it("aligns every value on the same column", () => {
    for (const line of postLines(DESK)) expect(line.slice(POST_LABEL_WIDTH - 3, POST_LABEL_WIDTH)).toBe(" : ");
  });

  it("never runs past the phone's 44 columns, however long the zone", () => {
    // globals.css sizes the phone BIOS to 44 characters. A line past that wraps
    // and the value lands under the label with nothing in front of it.
    expect(POST_MAX_WIDTH).toBe(44);
    const zones = [
      "America/Argentina/Buenos_Aires",
      "America/Indiana/Indianapolis",
      "America/North_Dakota/New_Salem",
      "Antarctica/DumontDUrville",
    ];
    for (const timeZone of zones) {
      const lines = postLines({ ...DESK, locale: "es-419", timeZone });
      for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(POST_MAX_WIDTH);
      const locale = lines.find((l) => l.startsWith("Host locale"))!;
      // What survives is the end of the zone, the part that names the place.
      expect(locale.endsWith(timeZone.split("/").pop()!)).toBe(true);
    }
  });

  it("keeps whichever half of the locale line it has", () => {
    const locale = (env: HostEnv) => postLines(env).find((l) => l.startsWith("Host locale"));
    expect(locale({ ...DESK, locale: undefined })).toBe("Host locale   : Europe/Dublin");
    expect(locale({ ...DESK, timeZone: undefined })).toBe("Host locale   : en-IE");
    expect(locale({ ...DESK, locale: undefined, timeZone: undefined })).toBeUndefined();
  });
});

describe("refreshFromGaps", () => {
  const steady = (hz: number, n: number) => Array.from({ length: n }, () => 1000 / hz);

  it("reads a steady 60, 120 and 144", () => {
    expect(refreshFromGaps(steady(60, 40))).toBe(60);
    expect(refreshFromGaps(steady(120, 40))).toBe(120);
    expect(refreshFromGaps(steady(144, 40))).toBe(144);
  });

  it("snaps to the rate a panel actually runs at, through timer jitter", () => {
    const jittered = steady(60, 60).map((g, i) => g + (i % 2 ? 0.6 : -0.6));
    expect(refreshFromGaps(jittered)).toBe(60);
    expect(refreshFromGaps(steady(59.94, 60))).toBe(60);
  });

  it("refuses to guess from fewer than about twenty frames", () => {
    expect(MIN_REFRESH_GAPS).toBe(20);
    expect(refreshFromGaps(steady(60, MIN_REFRESH_GAPS - 1))).toBeNull();
    expect(refreshFromGaps(steady(60, MIN_REFRESH_GAPS))).toBe(60);
    expect(refreshFromGaps([])).toBeNull();
  });

  it("shrugs off a few stalls, like the frame that compiled the shader", () => {
    const gaps = steady(60, 40);
    gaps[0] = 180;
    gaps[1] = 95;
    gaps[17] = 400;
    expect(refreshFromGaps(gaps)).toBe(60);
  });

  it("refuses a starved main thread rather than print its frame rate as a refresh rate", () => {
    // Software WebGL in headless Chromium: frames arrive every 80 to 200ms.
    const ragged = Array.from({ length: 60 }, (_, i) => 80 + ((i * 37) % 120));
    expect(refreshFromGaps(ragged)).toBeNull();
    // And a steady but slow cadence is not a panel's refresh rate either: it
    // is a phone in low power mode, or a busy machine, and printing 30 Hz for
    // a 60Hz screen would be a wrong number.
    expect(refreshFromGaps(steady(30, 60))).toBeNull();
    expect(refreshFromGaps(steady(12, 60))).toBeNull();
  });
});

describe("postReveal", () => {
  const lines = postLines(DESK);
  const POST_MS = 900;

  it("shows nothing before the block starts and everything once it ends", () => {
    expect(postReveal(lines, 0, POST_MS)).toBe("");
    expect(postReveal(lines, POST_MS, POST_MS)).toBe(lines.join("\n"));
    expect(postReveal(lines, POST_MS * 5, POST_MS)).toBe(lines.join("\n"));
  });

  it("types each label, then lands the whole reading at once, like a probe returning", () => {
    const slot = POST_MS / lines.length;
    const texts = Array.from({ length: Math.round(slot) }, (_, t) => postReveal(lines, t, POST_MS));
    // Part-way through the label the cursor rides on its end.
    expect(texts.some((t) => t.endsWith("Host C▋"))).toBe(true);
    // The label waits, complete, with the cursor after it.
    expect(texts.some((t) => t === `${lines[0].slice(0, POST_LABEL_WIDTH)}▋`)).toBe(true);
    // The value is never seen half-typed: every instant is nothing, part of the
    // label with the cursor, or the whole line.
    const label = lines[0].slice(0, POST_LABEL_WIDTH);
    for (const t of texts) {
      const partLabel = t.endsWith("▋") && label.startsWith(t.slice(0, -1));
      expect(t === "" || partLabel || t === lines[0], JSON.stringify(t)).toBe(true);
    }
    expect(texts[texts.length - 1]).toBe(lines[0]);
  });

  it("only ever grows", () => {
    let prev = "";
    for (let t = 0; t <= POST_MS; t++) {
      const next = postReveal(lines, t, POST_MS).replace("▋", "");
      expect(next.startsWith(prev.replace("▋", "")), `at ${t}ms`).toBe(true);
      prev = next;
    }
  });

  it("copes with no readings at all", () => {
    expect(postReveal([], 300, POST_MS)).toBe("");
  });
});

describe("the readings stay on the visitor's machine", () => {
  // Client-only, never stored, never sent. The formatter is pure, and the one
  // component that reads the machine hands the result to a text node.
  it("gives the formatter no way to store or send anything", () => {
    const src = readFileSync(join(process.cwd(), "lib", "post.ts"), "utf8");
    expect(src).not.toMatch(/fetch\(|sendBeacon|localStorage|sessionStorage|posthog|XMLHttpRequest|document\.cookie/);
  });
});
