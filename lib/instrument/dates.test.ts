import { describe, expect, it } from "vitest";
import {
  addDays,
  availablePresets,
  daysBetween,
  formatDay,
  isoDay,
  moveFrom,
  moveTo,
  presetOf,
  presetRange,
  rangeIndices,
  spanOf,
} from "./dates";

/**
 * The arithmetic behind `DateRange`, the designed replacement for a pair of
 * stock date inputs. Every day here is a local calendar day written
 * YYYY-MM-DD, because that is what `filterMessages` in `lib/studio/lore.ts`
 * compares against (local midnight to local end of day). Timestamps are built
 * with the local-time Date constructor so the suite passes in any zone.
 */

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("calendar days", () => {
  it("writes a timestamp as its local calendar day", () => {
    expect(isoDay(at(2026, 1, 3, 0))).toBe("2026-01-03");
    expect(isoDay(at(2026, 12, 31, 23))).toBe("2026-12-31");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2025-12-30", 3)).toBe("2026-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between two dates, across a clock change", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    // Europe's spring change falls on 29 March 2026; the count must not drop an hour into a day.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-02-01", "2026-01-01")).toBe(-31);
  });

  it("formats a day for a person to read", () => {
    expect(formatDay("2026-01-03")).toBe("3 Jan 2026");
  });
});

describe("spanOf", () => {
  it("finds the first and last day of an archive, in any order", () => {
    expect(spanOf([at(2026, 3, 14), at(2025, 1, 3), at(2025, 6, 1)])).toEqual({
      first: "2025-01-03",
      last: "2026-03-14",
      days: daysBetween("2025-01-03", "2026-03-14"),
    });
  });

  it("has no span for an empty archive", () => {
    expect(spanOf([])).toBeNull();
  });
});

const span = { first: "2025-01-03", last: "2026-03-14", days: daysBetween("2025-01-03", "2026-03-14") };

describe("presets", () => {
  it("counts back from the last message, not from today, because archives are old", () => {
    expect(presetRange("month", span)).toEqual({ start: "2026-02-13", end: undefined });
    expect(presetRange("quarter", span)).toEqual({ start: addDays("2026-03-14", -89), end: undefined });
  });

  it("means no bounds at all for everything", () => {
    expect(presetRange("all", span)).toEqual({ start: undefined, end: undefined });
  });

  it("only offers a preset shorter than the archive, because a longer one is just everything", () => {
    const short = { first: "2026-03-01", last: "2026-03-14", days: 13 };
    expect(availablePresets(short)).toEqual(["all"]);
    expect(availablePresets(span)).toEqual(["all", "year", "quarter", "month"]);
  });

  it("recognises a range that is a preset, and calls anything else custom", () => {
    expect(presetOf({}, span)).toBe("all");
    expect(presetOf(presetRange("quarter", span), span)).toBe("quarter");
    expect(presetOf({ start: "2025-05-01" }, span)).toBeNull();
    expect(presetOf({ start: "2026-02-13", end: "2026-03-01" }, span)).toBeNull();
  });
});

describe("the two thumbs", () => {
  it("places an open range at either end of the track", () => {
    expect(rangeIndices({}, span)).toEqual({ from: 0, to: span.days });
    expect(rangeIndices({ start: "2025-01-13", end: "2025-02-02" }, span)).toEqual({ from: 10, to: 30 });
  });

  it("clamps a range that reaches outside the archive onto the track", () => {
    expect(rangeIndices({ start: "2020-01-01", end: "2030-01-01" }, span)).toEqual({ from: 0, to: span.days });
  });

  it("drops a bound that sits on the end of the track, so the filter stays open", () => {
    expect(moveFrom({ end: "2025-02-02" }, 0, span)).toEqual({ start: undefined, end: "2025-02-02" });
    expect(moveTo({ start: "2025-01-13" }, span.days, span)).toEqual({ start: "2025-01-13", end: undefined });
  });

  it("never lets the start pass the end or the end pass the start", () => {
    expect(moveFrom({ end: "2025-02-02" }, 60, span)).toEqual({ start: "2025-02-02", end: "2025-02-02" });
    expect(moveTo({ start: "2025-02-02" }, 5, span)).toEqual({ start: "2025-02-02", end: "2025-02-02" });
  });

  it("writes a moved thumb as a calendar day", () => {
    expect(moveFrom({}, 10, span)).toEqual({ start: "2025-01-13", end: undefined });
    expect(moveTo({}, 30, span)).toEqual({ start: undefined, end: "2025-02-02" });
  });
});
