import { describe, expect, it } from "vitest";
import { barText, typedCount, typedText, typingDuration } from "./bios";
import { biosLines } from "@/content/arcade-collection";

const lines = ["abc", "de", "f"];

describe("typedCount", () => {
  it("shows nothing at zero and everything once the clock has covered every line", () => {
    expect(typedCount(lines, 0, 10, 100)).toBe(0);
    expect(typedCount(lines, typingDuration(lines, 10, 100), 10, 100)).toBe(6);
    expect(typedCount(lines, 1e9, 10, 100)).toBe(6);
  });

  it("types through a line at the given speed and then holds at its end", () => {
    expect(typedCount(lines, 10, 10, 100)).toBe(1);
    expect(typedCount(lines, 29, 10, 100)).toBe(2);
    expect(typedCount(lines, 30, 10, 100)).toBe(3);
    // Holding: the whole first line is up, the second has not started.
    expect(typedCount(lines, 100, 10, 100)).toBe(3);
    expect(typedCount(lines, 129, 10, 100)).toBe(3);
    expect(typedCount(lines, 140, 10, 100)).toBe(4);
  });

  it("is monotonic, so a late frame can only catch up and never un-type", () => {
    let last = 0;
    for (let t = 0; t < 1000; t += 3) {
      const now = typedCount(lines, t, 10, 100);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });
});

describe("typedText", () => {
  it("puts a cursor on the row being typed and none on a finished row", () => {
    expect(typedText(lines, 0)).toBe("");
    expect(typedText(lines, 2)).toBe("ab▋");
    expect(typedText(lines, 3)).toBe("abc");
    expect(typedText(lines, 4)).toBe("abc\nd▋");
    expect(typedText(lines, 6)).toBe("abc\nde\nf");
    expect(typedText(lines, 99)).toBe("abc\nde\nf");
  });
});

describe("the BIOS itself", () => {
  it("types the real cabinet count and the real board state, and finishes in about a second and a half", () => {
    const real = biosLines(6, "online");
    expect(real.join("\n")).toContain("cabinets found .... 6");
    expect(real.join("\n")).toContain("boards ............ online");
    expect(biosLines(6, "offline").join("\n")).toContain("offline");
    const ms = typingDuration(real, 6, 90);
    expect(ms).toBeGreaterThan(900);
    expect(ms).toBeLessThan(2000);
  });
});

describe("barText", () => {
  it("never throws for a frame timestamp that precedes the moment the bar started", () => {
    // rAF hands the frame's start time, which can be earlier than the
    // performance.now() taken when the effect ran, by a whole slow frame.
    // "█".repeat(-2) is a RangeError; this is the bug it was.
    expect(() => barText(-35, 420, 24)).not.toThrow();
    expect(barText(-35, 420, 24)).toBe(`[${"░".repeat(24)}]`);
  });

  it("fills left to right and clamps at full", () => {
    expect(barText(0, 420, 24)).toBe(`[${"░".repeat(24)}]`);
    expect(barText(210, 420, 24)).toBe(`[${"█".repeat(12)}${"░".repeat(12)}]`);
    expect(barText(420, 420, 24)).toBe(`[${"█".repeat(24)}]`);
    expect(barText(9999, 420, 24)).toBe(`[${"█".repeat(24)}]`);
  });
});
