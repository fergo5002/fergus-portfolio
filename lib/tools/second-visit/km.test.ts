import { describe, expect, it } from "vitest";
import {
  Z_95,
  kaplanMeier,
  medianTimeToReturn,
  naiveReturnRate,
  returnedBy,
  survivalAt,
} from "./km";
import type { Observation } from "./km";

/**
 * The worked example from the plan, eight customers.
 *
 *   returned at 5, 5, 12, 30
 *   still out at 3, 8, 20, 40
 *
 *   day 5:  7 at risk, 2 events, S = 5/7
 *   day 12: 4 at risk, 1 event,  S = 15/28
 *   day 30: 2 at risk, 1 event,  S = 15/56
 *
 * Every number below is that arithmetic, written out, so a failure says which
 * step is wrong rather than that a float moved.
 */
const eight: Observation[] = [
  { days: 5, returned: true },
  { days: 5, returned: true },
  { days: 12, returned: true },
  { days: 30, returned: true },
  { days: 3, returned: false },
  { days: 8, returned: false },
  { days: 20, returned: false },
  { days: 40, returned: false },
];

describe("the curve", () => {
  const curve = kaplanMeier(eight);

  it("has one point per day something happened, and no others", () => {
    expect(curve.points.map((p) => p.day)).toEqual([5, 12, 30]);
  });

  it("counts everybody still out at a day as at risk on it", () => {
    expect(curve.points.map((p) => p.atRisk)).toEqual([7, 4, 2]);
    expect(curve.points.map((p) => p.events)).toEqual([2, 1, 1]);
  });

  it("multiplies the survival down step by step", () => {
    expect(curve.points[0].survival).toBeCloseTo(5 / 7, 15);
    expect(curve.points[1].survival).toBeCloseTo(15 / 28, 15);
    expect(curve.points[2].survival).toBeCloseTo(15 / 56, 15);
  });

  it("knows how many of each kind it had", () => {
    expect(curve.n).toBe(8);
    expect(curve.events).toBe(4);
    expect(curve.censored).toBe(4);
    expect(curve.maxObserved).toBe(40);
  });

  /**
   * A censored observation on the same day as an event is at risk for that
   * event and leaves afterwards. Getting this backwards moves every step of
   * the curve.
   */
  it("counts a censoring on an event day as at risk", () => {
    const tied = kaplanMeier([
      { days: 10, returned: true },
      { days: 10, returned: false },
      { days: 20, returned: true },
    ]);
    expect(tied.points[0].atRisk).toBe(3);
    expect(tied.points[0].survival).toBeCloseTo(2 / 3, 15);
    expect(tied.points[1].atRisk).toBe(1);
  });
});

describe("the answer somebody came for", () => {
  const curve = kaplanMeier(eight);

  it("says 73%, not 50%", () => {
    const answer = returnedBy(curve, 40);
    // 12 places, not 15: `1 - 15/56` and `41/56` are the same number to within
    // one bit of double precision, and pinning the last bit tests the floating
    // point unit rather than the model.
    expect(answer.estimate).toBeCloseTo(41 / 56, 12);
    expect(naiveReturnRate(eight)).toBe(0.5);
  });

  it("steps at the event days and not between them", () => {
    expect(returnedBy(curve, 4).estimate).toBe(0);
    expect(returnedBy(curve, 5).estimate).toBeCloseTo(2 / 7, 15);
    expect(returnedBy(curve, 11).estimate).toBeCloseTo(2 / 7, 15);
    expect(returnedBy(curve, 12).estimate).toBeCloseTo(13 / 28, 15);
  });

  it("prints an interval that stays inside nought and one", () => {
    // The plan's hand-worked figures: sigma^2 = 0.6404761905, and the
    // complementary log-log interval on S(30) is about [0.0131, 0.6700]. The
    // return fraction is one minus that, with the bounds swapped.
    const answer = returnedBy(curve, 30);
    expect(answer.defined).toBe(true);
    expect(answer.lo).toBeCloseTo(1 - 0.670013, 3);
    expect(answer.hi).toBeCloseTo(1 - 0.013124, 3);
    expect(answer.lo).toBeGreaterThan(0);
    expect(answer.hi).toBeLessThan(1);
    expect(answer.lo).toBeLessThan(answer.estimate);
    expect(answer.hi).toBeGreaterThan(answer.estimate);
  });

  it("carries Greenwood's sum on each point", () => {
    const curveAt = kaplanMeier(eight);
    expect(curveAt.points[2].cumVariance).toBeCloseTo(2 / 35 + 1 / 12 + 1 / 2, 12);
  });

  it("narrows as the sample grows, which is the whole point of printing it", () => {
    const wide = returnedBy(kaplanMeier(eight), 30);
    const many: Observation[] = [];
    for (let i = 0; i < 50; i++) many.push(...eight);
    const narrow = returnedBy(kaplanMeier(many), 30);
    expect(narrow.estimate).toBeCloseTo(wide.estimate, 12);
    expect(narrow.hi - narrow.lo).toBeLessThan((wide.hi - wide.lo) / 3);
  });

  it("refuses to print an interval when nothing has happened yet", () => {
    const nothing = kaplanMeier([
      { days: 10, returned: false },
      { days: 20, returned: false },
    ]);
    const answer = returnedBy(nothing, 20);
    expect(answer.estimate).toBe(0);
    expect(answer.defined).toBe(false);
  });

  it("gives a degenerate answer on no customers rather than a NaN", () => {
    const empty = kaplanMeier([]);
    expect(empty.n).toBe(0);
    expect(returnedBy(empty, 30)).toEqual({ estimate: 0, lo: 0, hi: 0, defined: false });
  });

  it("uses the two-sided 95% z", () => {
    expect(Z_95).toBeCloseTo(1.959963984540054, 15);
  });
});

describe("the median that often does not exist", () => {
  it("is the first day survival reaches a half", () => {
    const curve = kaplanMeier(eight);
    // S drops to 15/28 = 0.536 at day 12 and to 15/56 = 0.268 at day 30, so the
    // first day at or below a half is 30.
    expect(medianTimeToReturn(curve)).toBe(30);
  });

  it("is null when the curve never gets there, rather than extrapolated", () => {
    const shy = kaplanMeier([
      { days: 10, returned: true },
      { days: 20, returned: false },
      { days: 30, returned: false },
      { days: 40, returned: false },
    ]);
    // One event out of four at risk: S = 0.75 and it never falls further.
    expect(medianTimeToReturn(shy)).toBeNull();
  });
});

describe("survivalAt, which is the same thing the other way up", () => {
  it("is one before anything has happened", () => {
    const curve = kaplanMeier(eight);
    expect(survivalAt(curve, 0).estimate).toBe(1);
    expect(survivalAt(curve, 4).estimate).toBe(1);
  });

  it("mirrors returnedBy exactly", () => {
    const curve = kaplanMeier(eight);
    const s = survivalAt(curve, 30);
    const r = returnedBy(curve, 30);
    expect(r.estimate).toBeCloseTo(1 - s.estimate, 15);
    expect(r.lo).toBeCloseTo(1 - s.hi, 15);
    expect(r.hi).toBeCloseTo(1 - s.lo, 15);
  });
});

