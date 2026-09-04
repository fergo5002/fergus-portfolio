import { describe, expect, it } from "vitest";
import {
  dayFromIso,
  detectDateStyle,
  isoDow,
  isoFromDay,
  medianCont,
  monthOfYear,
  parseDay,
  percentileCont,
  roundTo,
  widthBucket,
} from "./numbers";

describe("days since the epoch", () => {
  it("uses whole UTC days and round-trips them", () => {
    expect(dayFromIso("1970-01-01")).toBe(0);
    expect(dayFromIso("1970-01-02")).toBe(1);
    expect(dayFromIso("2026-09-04")).toBe(20700);
    for (const iso of ["1970-01-01", "2000-02-29", "2026-12-31", "2026-03-29"]) {
      expect(isoFromDay(dayFromIso(iso) as number)).toBe(iso);
    }
  });

  it("is not disturbed by either daylight-saving boundary", () => {
    expect((dayFromIso("2026-03-30") as number) - (dayFromIso("2026-03-29") as number)).toBe(1);
    expect((dayFromIso("2026-10-26") as number) - (dayFromIso("2026-10-25") as number)).toBe(1);
  });

  it("refuses calendar dates that do not exist", () => {
    for (const value of ["2026-02-30", "2026-13-01", "not a date", ""]) expect(dayFromIso(value)).toBeNull();
  });

  it("reports ISO weekday and one-based month", () => {
    expect(isoDow(dayFromIso("1970-01-01") as number)).toBe(4);
    expect(isoDow(dayFromIso("2026-09-07") as number)).toBe(1);
    expect(isoDow(dayFromIso("2026-09-13") as number)).toBe(7);
    expect(monthOfYear(dayFromIso("2026-01-15") as number)).toBe(1);
    expect(monthOfYear(dayFromIso("2026-12-31") as number)).toBe(12);
  });
});

describe("reading an export date", () => {
  it("takes ISO dates with an optional time suffix", () => {
    for (const value of ["2026-03-14", "2026-03-14T18:30:00Z", "2026-03-14 18:30"]) {
      expect(parseDay(value, "iso")).toBe(dayFromIso("2026-03-14"));
    }
  });

  it("takes day-first and month-first only when told which", () => {
    expect(parseDay("14/03/2026", "dmy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("03/14/2026", "mdy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("14-03-2026", "dmy")).toBe(dayFromIso("2026-03-14"));
    expect(parseDay("4/3/26", "dmy")).toBe(dayFromIso("2026-03-04"));
  });

  it("decides one style for the whole column", () => {
    expect(detectDateStyle(["2026-03-14", "2026-04-01"])).toEqual({ style: "iso", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "13/02/2026"])).toEqual({ style: "dmy", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "02/13/2026"])).toEqual({ style: "mdy", ambiguous: false });
    expect(detectDateStyle(["01/02/2026", "03/04/2026"])).toEqual({ style: "dmy", ambiguous: true });
    expect(detectDateStyle(["banana", ""])).toEqual({ style: "iso", ambiguous: false });
  });

  it("keeps a mostly ISO column ISO and refuses unreadable values", () => {
    expect(detectDateStyle(["2026-01-04", "2026-02-01", "04/02/2026"])).toEqual({
      style: "iso",
      ambiguous: false,
    });
    expect(parseDay("banana", "iso")).toBeNull();
    expect(parseDay("", "dmy")).toBeNull();
    expect(parseDay("32/01/2026", "dmy")).toBeNull();
  });
});

describe("Postgres percentile_cont", () => {
  it("interpolates rather than taking a nearest rank", () => {
    expect(percentileCont([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(medianCont([4, 1, 3, 2])).toBe(2.5);
    expect(percentileCont([10, 20, 30, 40, 50], 0.3)).toBeCloseTo(22, 12);
  });

  it("handles empty, singleton and endpoint inputs", () => {
    expect(medianCont([])).toBeNull();
    expect(medianCont([7])).toBe(7);
    expect(percentileCont([1, 2, 3], 0)).toBe(1);
    expect(percentileCont([1, 2, 3], 1)).toBe(3);
  });
});

describe("Postgres-like rounding over doubles", () => {
  it("rounds halves away from zero", () => {
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(3.5, 0)).toBe(4);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(1.23456, 3)).toBe(1.235);
    expect(roundTo(0.0625, 3)).toBe(0.063);
  });

  it("pins the known exact-decimal tie difference from numeric", () => {
    expect(roundTo(1.0005, 3)).toBe(1);
    expect(roundTo(120.05, 1)).toBe(120);
  });

  it("leaves non-finite and exponent-sized values alone", () => {
    expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
    expect(roundTo(1e22, 2)).toBe(1e22);
  });
});

describe("Postgres width_bucket", () => {
  const bounds = [30, 60, 120, 240];

  it("is inclusive at every lower bound", () => {
    expect(widthBucket(0, bounds)).toBe(0);
    expect(widthBucket(29.999, bounds)).toBe(0);
    expect(widthBucket(30, bounds)).toBe(1);
    expect(widthBucket(59.999, bounds)).toBe(1);
    expect(widthBucket(60, bounds)).toBe(2);
    expect(widthBucket(120, bounds)).toBe(3);
    expect(widthBucket(239.999, bounds)).toBe(3);
    expect(widthBucket(240, bounds)).toBe(4);
    expect(widthBucket(100000, bounds)).toBe(4);
  });
});
