import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  PRODUCTION_PARAMS,
  blendPrior,
  distanceBand,
  distanceKm,
  distancePriorFactor,
  expectedGapDays,
  pReturnPrior,
  reachability,
  retentionVerdict,
  seasonFactor,
  shrink,
  smoothRate,
  winnabilityCents,
} from "./model";

/**
 * Every number in this file is written out rather than read from
 * PRODUCTION_PARAMS. A test that asserts `shrink(3, 1, 30) === expected(p)`
 * moves with the constant and can never fail when the constant is wrong, which
 * is the trap T2 recorded on MIN_EVENTS and T3 on HASH_HEX_CHARS. The literals
 * below come from Tigh Sauna's migration 0300 and from arithmetic done by hand.
 */

describe("the production constants are migration 0300's", () => {
  it("carries k = 2 in both places it appears", () => {
    expect(PRODUCTION_PARAMS.shrinkK).toBe(2);
    expect(PRODUCTION_PARAMS.blendK).toBe(2);
  });

  it("carries the distance boundaries and their priors", () => {
    expect(PRODUCTION_PARAMS.localKm).toBe(15);
    expect(PRODUCTION_PARAMS.catchmentKm).toBe(45);
    expect(PRODUCTION_PARAMS.regionalKm).toBe(95);
    expect(PRODUCTION_PARAMS.priorLocal).toBe(1.0);
    expect(PRODUCTION_PARAMS.priorCatchment).toBe(1.35);
    expect(PRODUCTION_PARAMS.priorRegional).toBe(2.2);
    expect(PRODUCTION_PARAMS.priorDistant).toBe(4.0);
    expect(PRODUCTION_PARAMS.priorVisitor).toBe(8.0);
    expect(PRODUCTION_PARAMS.priorUnknown).toBe(1.0);
  });

  it("carries the clamps", () => {
    expect(PRODUCTION_PARAMS.seasonFloor).toBe(0.6);
    expect(PRODUCTION_PARAMS.seasonCap).toBe(3.0);
    expect(PRODUCTION_PARAMS.gapFloorDays).toBe(3.0);
    expect(PRODUCTION_PARAMS.gapCapDays).toBe(540.0);
    expect(PRODUCTION_PARAMS.gapDefaultBaseDays).toBe(30.0);
    expect(PRODUCTION_PARAMS.companionFactor).toBe(1.25);
    expect(PRODUCTION_PARAMS.smoothStrength).toBe(20);
    expect(PRODUCTION_PARAMS.pReturnBase).toBe(0.12);
    expect(PRODUCTION_PARAMS.pReturnCap).toBe(0.6);
  });

  it("is frozen, so a slider cannot edit the production values by reference", () => {
    expect(Object.isFrozen(PRODUCTION_PARAMS)).toBe(true);
  });
});

describe("distanceKm", () => {
  it("uses the mean earth radius the migration names", () => {
    expect(EARTH_RADIUS_KM).toBe(6371.0088);
  });

  /**
   * Aughnacliff to Dublin. The migration's own comment says "Dublin is 98km
   * from Aughnacliff, and that is the point of this boundary rather than an
   * accident of it", so this pair is the one worth pinning.
   */
  it("puts Dublin the far side of the 95km boundary from north Longford", () => {
    // The migration says 98km and does not publish the point it measured from.
    // These coordinates give 104. That the exact figure moves with the point is
    // the reason this asserts the band rather than the metre: what the model
    // does with it is the same either way.
    const km = distanceKm(53.8608, -7.5806, 53.3498, -6.2603) as number;
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(115);
    expect(distanceBand(km, true)).toBe("distant");
  });

  it("is zero for a point on itself", () => {
    expect(distanceKm(53.3498, -6.2603, 53.3498, -6.2603)).toBeCloseTo(0, 10);
  });

  it("is strict, so an unknown address never becomes a point off Africa", () => {
    expect(distanceKm(null, -6.26, 53.35, -6.26)).toBeNull();
    expect(distanceKm(53.35, null, 53.35, -6.26)).toBeNull();
    expect(distanceKm(53.35, -6.26, null, -6.26)).toBeNull();
    expect(distanceKm(53.35, -6.26, 53.35, null)).toBeNull();
    expect(distanceKm(Number.NaN, -6.26, 53.35, -6.26)).toBeNull();
  });

  it("is symmetric", () => {
    const there = distanceKm(53.86, -7.58, 51.9, -8.47) as number;
    const back = distanceKm(51.9, -8.47, 53.86, -7.58) as number;
    expect(there).toBeCloseTo(back, 12);
  });
});

describe("distanceBand", () => {
  it("is inclusive at the top of each band", () => {
    expect(distanceBand(15, true)).toBe("local");
    expect(distanceBand(15.001, true)).toBe("catchment");
    expect(distanceBand(45, true)).toBe("catchment");
    expect(distanceBand(45.001, true)).toBe("regional");
    expect(distanceBand(95, true)).toBe("regional");
    expect(distanceBand(98, true)).toBe("distant");
  });

  /**
   * The border decides, not the mileage, and it is checked before distance.
   * Somebody twelve kilometres away across a border is passing through.
   */
  it("calls a different country a visitor whatever the distance", () => {
    expect(distanceBand(12, false)).toBe("visitor");
    expect(distanceBand(null, false)).toBe("visitor");
  });

  it("treats an unknown country as no evidence of a border", () => {
    expect(distanceBand(12, null)).toBe("local");
    expect(distanceBand(null, null)).toBe("unknown");
    expect(distanceBand(null, true)).toBe("unknown");
  });
});

describe("distancePriorFactor", () => {
  it("charges nothing for not knowing", () => {
    // "Not knowing where somebody lives is a gap in our records and must never
    // be charged to the customer as suspicion." Migration 0300.
    expect(distancePriorFactor("unknown")).toBe(1.0);
  });

  it("is 1.00, 1.35, 2.20, 4.00, 8.00", () => {
    expect(distancePriorFactor("local")).toBe(1.0);
    expect(distancePriorFactor("catchment")).toBe(1.35);
    expect(distancePriorFactor("regional")).toBe(2.2);
    expect(distancePriorFactor("distant")).toBe(4.0);
    expect(distancePriorFactor("visitor")).toBe(8.0);
  });
});

describe("blendPrior, where evidence beats the prior", () => {
  /**
   * The three rows of the migration's own worked table, which is what makes
   * this the most important function in the file.
   */
  it("matches the migration's Dubliner table", () => {
    expect(blendPrior(4.0, 0)).toBeCloseTo(4.0, 12); // came once
    expect(blendPrior(4.0, 2)).toBeCloseTo(2.5, 12); // came three times
    expect(blendPrior(4.0, 9)).toBeCloseTo(1.5454545454545454, 12); // came ten
  });

  it("never becomes a discount", () => {
    // Floored at 1, so a prior can never make a distant customer look overdue
    // sooner than a local one.
    expect(blendPrior(0.5, 0)).toBe(1);
    expect(blendPrior(0.5, 100)).toBe(1);
  });

  it("treats a null prior as no prior and a null count as none", () => {
    expect(blendPrior(null, 5)).toBe(1);
    expect(blendPrior(4.0, null)).toBeCloseTo(4.0, 12);
    expect(blendPrior(4.0, -3)).toBeCloseTo(4.0, 12);
  });
});

describe("shrink, empirical Bayes toward the cohort", () => {
  it("gives the prior two observations' worth of weight", () => {
    // One observation of 3 against a prior of 30: (1*3 + 2*30) / (1+2) = 21.
    expect(shrink(3, 1, 30)).toBeCloseTo(21, 12);
    // Ten observations of 3: (10*3 + 2*30) / 12 = 7.5.
    expect(shrink(3, 10, 30)).toBeCloseTo(7.5, 12);
  });

  it("stops one lucky three-day gap becoming a cadence", () => {
    // The failure the migration's comment names, stated as a number.
    expect(shrink(3, 1, 30)).toBeGreaterThan(20);
  });

  it("falls back either way, and to null when there is nothing at all", () => {
    expect(shrink(null, 5, 30)).toBe(30);
    expect(shrink(12, 5, null)).toBe(12);
    expect(shrink(null, 5, null)).toBeNull();
  });

  it("treats a negative count as zero", () => {
    expect(shrink(3, -4, 30)).toBeCloseTo(30, 12);
  });
});

describe("seasonFactor", () => {
  it("inverts the month index, so a quiet month stretches the gap", () => {
    expect(seasonFactor(0.5)).toBeCloseTo(2, 12);
    expect(seasonFactor(1)).toBeCloseTo(1, 12);
    expect(seasonFactor(2)).toBeCloseTo(0.6, 12); // 0.5, floored at 0.6
  });

  it("is clamped at both ends", () => {
    expect(seasonFactor(0.01)).toBe(3);
    expect(seasonFactor(100)).toBe(0.6);
  });

  it("is neutral on no index and on nonsense", () => {
    expect(seasonFactor(null)).toBe(1);
    expect(seasonFactor(0)).toBe(1);
    expect(seasonFactor(-1)).toBe(1);
  });
});

describe("expectedGapDays", () => {
  it("multiplies, because the effects compound", () => {
    expect(expectedGapDays(30, 4, 1, 1)).toBeCloseTo(120, 12);
    expect(expectedGapDays(30, 4, 2, 1.25)).toBe(300);
  });

  it("is floored at three days so nobody is overdue by construction", () => {
    expect(expectedGapDays(1, 1, 1, 1)).toBe(3);
    expect(expectedGapDays(0, 1, 1, 1)).toBe(3);
  });

  it("is capped at 540 so a visitor gets a real number rather than infinity", () => {
    expect(expectedGapDays(200, 8, 3, 1.25)).toBe(540);
  });

  it("falls back to thirty days and to neutral factors", () => {
    expect(expectedGapDays(null, null, null, null)).toBeCloseTo(30, 12);
  });
});

describe("retentionVerdict", () => {
  it("calls somebody with no visits a prospect before anything else", () => {
    expect(retentionVerdict(0, 5, true, true, true, true)).toBe("prospect");
    expect(retentionVerdict(null, 5, false, false, false, false)).toBe("prospect");
  });

  /**
   * The ordering the migration says took a wrong turn to find. Visiting is a
   * statement about who somebody is, decided before lateness is considered, so
   * a Dubliner who came once to a Longford sauna is not filed as a pending
   * conversion for the eighteen months their inflated window takes to run out.
   */
  it("decides visiting before lateness", () => {
    expect(retentionVerdict(1, 2.5, false, false, false, true)).toBe("visiting");
    expect(retentionVerdict(1, 0.2, false, false, false, true)).toBe("visiting");
  });

  it("lets a prepaid commitment outrank geography", () => {
    expect(retentionVerdict(1, 2.5, true, false, false, true)).toBe("committed_idle");
  });

  it("calls an on-time customer by their experience", () => {
    expect(retentionVerdict(10, 0.5, false, false, false, false)).toBe("loyal");
    expect(retentionVerdict(1, 0.5, false, false, false, false)).toBe("first_time");
    expect(retentionVerdict(4, 0.5, false, false, false, false)).toBe("repeat");
    // A null ratio is somebody with no last visit to measure from, which is
    // not the same as being late.
    expect(retentionVerdict(4, null, false, false, false, false)).toBe("repeat");
  });

  it("ranks the causes of an overdue silence in the order of the action", () => {
    expect(retentionVerdict(5, 1.5, true, true, true, false)).toBe("committed_idle");
    expect(retentionVerdict(5, 1.5, false, true, true, false)).toBe("squeezed");
    expect(retentionVerdict(5, 1.5, false, false, true, false)).toBe("dormant");
    expect(retentionVerdict(5, 1.5, false, false, false, false)).toBe("at_risk");
    expect(retentionVerdict(5, 2.0, false, false, false, false)).toBe("lapsed");
  });

  it("is exactly on time at a ratio of one", () => {
    expect(retentionVerdict(4, 0.999, false, false, false, false)).toBe("repeat");
    expect(retentionVerdict(4, 1.0, false, false, false, false)).toBe("at_risk");
  });

  it("reads a null flag as no evidence rather than as true", () => {
    expect(retentionVerdict(5, 1.5, null, null, null, null)).toBe("at_risk");
  });
});

describe("reachability", () => {
  it("is a hard zero without consent", () => {
    expect(reachability(false, true, true, false)).toBe(0);
    expect(reachability(null, true, true, false)).toBe(0);
  });

  it("is a hard zero when suppressed", () => {
    expect(reachability(true, true, true, true)).toBe(0);
  });

  it("is 0.6 on one channel and 1.0 on two", () => {
    expect(reachability(true, true, false, false)).toBe(0.6);
    expect(reachability(true, false, true, false)).toBe(0.6);
    expect(reachability(true, true, true, false)).toBe(1);
    expect(reachability(true, false, false, false)).toBe(0);
  });
});

describe("pReturnPrior", () => {
  it("is the inverse of the distance prior, times experience, capped", () => {
    // local, one visit: 0.12 * (1/1.00) * min(1.5, 0.6 + 0.1) = 0.12 * 0.7.
    expect(pReturnPrior("local", 1)).toBeCloseTo(0.084, 12);
    // distant, one visit: 0.12 * (1/4) * 0.7.
    expect(pReturnPrior("distant", 1)).toBeCloseTo(0.021, 12);
    // local, twenty visits: experience is capped at 1.5, so 0.12 * 1.5.
    expect(pReturnPrior("local", 20)).toBeCloseTo(0.18, 12);
  });

  it("never exceeds 0.60", () => {
    expect(pReturnPrior("local", 1000)).toBeLessThanOrEqual(0.6);
  });

  it("treats no visits as no experience", () => {
    expect(pReturnPrior("local", null)).toBeCloseTo(0.072, 12); // 0.12 * 0.6
  });
});

describe("smoothRate", () => {
  it("does not let one customer make a cell a hundred per cent", () => {
    // 1 return out of 1 observation against a prior of 0.1 with strength 20:
    // (1 + 20*0.1) / (1 + 20) = 3/21 = 0.142857..., rounded to four places.
    expect(smoothRate(1, 1, 0.1, 20)).toBe(0.1429);
  });

  it("does not let one non-return make it zero", () => {
    // (0 + 20*0.1) / (1 + 20) = 2/21 = 0.095238..., rounded.
    expect(smoothRate(0, 1, 0.1, 20)).toBe(0.0952);
  });

  it("lets a real pattern through once there is enough of it", () => {
    // (60 + 2) / (100 + 20) = 0.516666..., rounded.
    expect(smoothRate(60, 100, 0.1, 20)).toBe(0.5167);
  });

  it("is the prior itself when there is nothing measured", () => {
    expect(smoothRate(0, 0, 0.25, 20)).toBe(0.25);
  });

  it("is null when the strength is zero and there are no trials", () => {
    expect(smoothRate(0, 0, 0.25, 0)).toBeNull();
  });
});

describe("winnabilityCents", () => {
  it("is probability times margin times reachability, in whole cents", () => {
    expect(winnabilityCents(0.25, 4000, 0.6)).toBe(600);
    expect(winnabilityCents(0.25, 4000, 1)).toBe(1000);
  });

  it("is zero when they cannot be reached, however good the odds", () => {
    expect(winnabilityCents(0.9, 100000, 0)).toBe(0);
  });

  it("floors a negative margin at zero rather than ranking below nothing", () => {
    expect(winnabilityCents(0.5, -5000, 1)).toBe(0);
  });

  it("rounds half away from zero, like the SQL", () => {
    expect(winnabilityCents(0.5, 5, 1)).toBe(3); // 2.5
  });
});

