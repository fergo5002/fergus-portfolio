
/**
 * How many first-time customers come back, computed the way a survival analyst
 * would rather than the way a dashboard does.
 *
 * The dashboard figure is `customers with one visit / all customers`, and it is
 * wrong in a specific direction: it counts somebody who first came last week as
 * somebody who never returned. On a growing business the recent arrivals
 * dominate, so the faster you grow the worse your retention looks. Kaplan-Meier
 * fixes exactly that by letting those customers contribute what is known about
 * them ("at least this long, still counting") instead of a verdict nobody has
 * earned yet.
 *
 * The interval is the complementary log-log one (Kalbfleisch-Prentice) over
 * Greenwood's variance, rather than a normal interval on the proportion. A
 * normal interval near 0 or 1 runs outside the range and then gets clipped, and
 * a clipped bound reads as certainty where the truth was "we do not know".
 *
 * Nothing here is a forecast. It is a description of what the file already
 * contains, with the uncertainty that description carries printed beside it.
 */

/** Two-sided 95%. */
export const Z_95 = 1.959963984540054;

export type Observation = {
  /** Days from the first visit: to the second one, or to the as-of date. */
  days: number;
  /** True if the second visit happened. False means still out, still counting. */
  returned: boolean;
};

export type KmPoint = {
  day: number;
  atRisk: number;
  events: number;
  /** S(day), after this day's events. */
  survival: number;
  /** Greenwood's running sum of d / (n * (n - d)) up to and including this day. */
  cumVariance: number;
};

export type KmCurve = {
  points: KmPoint[];
  n: number;
  events: number;
  censored: number;
  /** The longest observation, censored or not. Nothing past it means anything. */
  maxObserved: number;
  z: number;
};

export type Interval = {
  estimate: number;
  lo: number;
  hi: number;
  /**
   * False when there is no interval to give: no customers, or nothing has
   * happened yet in this window, where the log-log transform is undefined. The
   * page prints a sentence rather than a pair of numbers.
   */
  defined: boolean;
};

export function kaplanMeier(observations: readonly Observation[], z: number = Z_95): KmCurve {
  const usable = observations.filter((o) => Number.isFinite(o.days) && o.days >= 0);
  const n = usable.length;
  if (n === 0) return { points: [], n: 0, events: 0, censored: 0, maxObserved: 0, z };

  const sorted = [...usable].sort((a, b) => a.days - b.days);
  const eventDays = [...new Set(sorted.filter((o) => o.returned).map((o) => o.days))].sort(
    (a, b) => a - b,
  );

  const points: KmPoint[] = [];
  let survival = 1;
  let cumVariance = 0;
  for (const day of eventDays) {
    // Everybody whose observation runs to at least this day is at risk on it,
    // which includes somebody censored on exactly this day.
    const atRisk = sorted.filter((o) => o.days >= day).length;
    const events = sorted.filter((o) => o.returned && o.days === day).length;
    if (atRisk === 0) continue;
    survival *= 1 - events / atRisk;
    if (atRisk - events > 0) cumVariance += events / (atRisk * (atRisk - events));
    else cumVariance = Number.POSITIVE_INFINITY;
    points.push({ day, atRisk, events, survival, cumVariance });
  }

  return {
    points,
    n,
    events: sorted.filter((o) => o.returned).length,
    censored: sorted.filter((o) => !o.returned).length,
    maxObserved: sorted[sorted.length - 1].days,
    z,
  };
}

function stepAt(curve: KmCurve, day: number): { survival: number; cumVariance: number } {
  let survival = 1;
  let cumVariance = 0;
  for (const point of curve.points) {
    if (point.day > day) break;
    survival = point.survival;
    cumVariance = point.cumVariance;
  }
  return { survival, cumVariance };
}

/**
 * S(t) with its interval.
 *
 * The transform: the interval is computed on `ln(-ln S)`, where it is roughly
 * symmetric, then exponentiated twice to come back. That is what keeps both
 * ends inside [0, 1] without clipping either.
 */
export function survivalAt(curve: KmCurve, day: number): Interval {
  if (curve.n === 0) return { estimate: 0, lo: 0, hi: 0, defined: false };
  const { survival, cumVariance } = stepAt(curve, day);
  if (survival >= 1 || survival <= 0 || !Number.isFinite(cumVariance) || cumVariance <= 0) {
    return { estimate: survival, lo: survival, hi: survival, defined: false };
  }
  const logS = Math.log(survival);
  const sigma = Math.sqrt(cumVariance);
  const halfWidth = (curve.z * sigma) / Math.abs(logS);
  const centre = Math.log(-logS);
  const lower = Math.exp(-Math.exp(centre + halfWidth));
  const upper = Math.exp(-Math.exp(centre - halfWidth));
  return { estimate: survival, lo: lower, hi: upper, defined: true };
}

/** The share who have come back by day `day`, which is one minus the survival. */
export function returnedBy(curve: KmCurve, day: number): Interval {
  if (curve.n === 0) return { estimate: 0, lo: 0, hi: 0, defined: false };
  const s = survivalAt(curve, day);
  return { estimate: 1 - s.estimate, lo: 1 - s.hi, hi: 1 - s.lo, defined: s.defined };
}

/**
 * The first day by which half of them have come back, or null.
 *
 * Null is the common answer and it is a real one: if the curve never falls to a
 * half inside the file, the median has not been reached and any number printed
 * for it would be an extrapolation.
 */
export function medianTimeToReturn(curve: KmCurve): number | null {
  for (const point of curve.points) {
    if (point.survival <= 0.5) return point.day;
  }
  return null;
}

/**
 * The figure a dashboard shows, computed so the page can print it beside the
 * real one. Kept here rather than in the page so the comparison is a property
 * of the same input.
 */
export function naiveReturnRate(observations: readonly Observation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((o) => o.returned).length / observations.length;
}
