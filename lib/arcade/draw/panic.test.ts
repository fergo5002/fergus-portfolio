import { describe, expect, it } from "vitest";
import { screenCopy } from "@/content/arcade-collection";
import { chipLeft, dumpLines } from "./panic";

/**
 * Two pure pieces of Kernel Panic's drawing: the panic dump's text, and where
 * a name is drawn so a long command near the edge stays on the glass. How any
 * of it looks is for the screenshots.
 */
describe("the panic dump", () => {
  const dump = { at: 42.318201, comm: "rm -rf /tmp", pid: 4021, code: 0x1f2e3d4c };

  it("says the kernel panicked, names the process that did it, and is the same every time", () => {
    const lines = dumpLines(dump, screenCopy.panicDump, true);
    expect(lines.length).toBe(screenCopy.panicDump.length);
    expect(lines[0]).toMatch(/^\[\s+42\.318201\] Kernel panic - not syncing:/);
    expect(lines.join("\n")).toContain("PID: 4021 Comm: rm -rf /tmp");
    expect(lines.join("\n")).not.toMatch(/\{\w+\}/);
    expect(dumpLines(dump, screenCopy.panicDump, true)).toEqual(lines);
    expect(dumpLines({ ...dump, code: 7 }, screenCopy.panicDump, true)).not.toEqual(lines);
  });

  it("drops the timestamps where the screen is narrow", () => {
    const lines = dumpLines(dump, screenCopy.panicDump, false);
    expect(lines[0]).toMatch(/^Kernel panic - not syncing:/);
    for (const line of lines) expect(line).not.toMatch(/^\[/);
  });
});

describe("a name's place on the glass", () => {
  it("is centred on the process, and pushed in from either edge when it would not fit", () => {
    expect(chipLeft(450, 100)).toBe(400);
    expect(chipLeft(30, 200)).toBeGreaterThanOrEqual(12);
    expect(chipLeft(880, 200) + 200).toBeLessThanOrEqual(888);
  });
});
