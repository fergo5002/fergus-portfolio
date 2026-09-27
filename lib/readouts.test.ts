import { describe, expect, it } from "vitest";
import { cssString, formatClock, formatPointer, readouts, type ReadoutInput } from "./readouts";

const rest: ReadoutInput = {
  uptimeMs: 3_723_000,
  scrollProgress: 0.5,
  fps: 59.6,
  pointerX: 0.5123,
  pointerY: 0.33,
  scrollVelocity: 0,
  tapAt: -Infinity,
  degaussAt: -Infinity,
  impacts: 0,
  keyAt: -Infinity,
};
const now = new Date(2026, 8, 27, 9, 5, 7);

describe("formatClock", () => {
  it("reads like a wall clock, with seconds when the machine is live", () => {
    expect(formatClock(now)).toBe("09:05:07");
    expect(formatClock(now, false)).toBe("09:05");
  });
});

describe("formatPointer", () => {
  it("reports the pointer in thousandths of the screen, clamped", () => {
    expect(formatPointer(0.5123, 0.33)).toBe("512,330");
    expect(formatPointer(1.2, -0.1)).toBe("999,000");
  });
});

describe("readouts", () => {
  it("gives live values when motion is allowed", () => {
    const r = readouts(rest, now, 10_000, false);
    expect(r).toMatchObject({ up: "01:02:03", mem: "0x0047FFFF", fps: "60", pos: "512,330", clock: "09:05:07" });
  });

  it("gives honest static values under reduced motion rather than a frozen live readout", () => {
    const r = readouts(rest, now, 10_000, true);
    expect(r).toMatchObject({ up: "--:--:--", mem: "0x00400000", fps: "--", pos: "---,---", clock: "09:05", busy: false });
  });

  it("lights the activity lamp while the machine is working and not at rest", () => {
    expect(readouts(rest, now, 10_000, false).busy).toBe(false);
    expect(readouts({ ...rest, scrollVelocity: 0.3 }, now, 10_000, false).busy).toBe(true);
    expect(readouts({ ...rest, keyAt: 9_950 }, now, 10_000, false).busy).toBe(true);
    expect(readouts({ ...rest, impacts: 2 }, now, 10_000, false).busy).toBe(true);
    expect(readouts({ ...rest, keyAt: 9_000 }, now, 10_000, false).busy).toBe(false);
  });
});

describe("cssString", () => {
  it("quotes a value for CSS content, escaping what would end the string", () => {
    expect(cssString("09:05")).toBe('"09:05"');
    expect(cssString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
