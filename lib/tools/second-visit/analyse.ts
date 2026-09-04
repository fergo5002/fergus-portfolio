import {
  buildCustomers,
  buildOccupancy,
  buildSeasonality,
  monthIndexFor,
  squeezeOf,
  type CustomerFacts,
  type Seasonality,
} from "./customers";
import { Z_95, kaplanMeier, medianTimeToReturn, naiveReturnRate, returnedBy, type Observation } from "./km";
import {
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
import { isoDow, isoFromDay, medianCont, monthOfYear, percentileCont, roundTo, widthBucket } from "./numbers";
import { findTown, type Town } from "./towns";
import type { Band, Booking, Lifecycle, ModelParams } from "./types";

/**
 * The whole model, in one pure function.
 *
 * This is migration 0300's `base` / `cohort` / `modelled` / `scored` /
 * `ratioed` chain re-expressed over a flat file, with the four inputs it takes
 * from `analytics.customer_metrics` supplied by `customers.ts`. It is checked
 * against Postgres by `oracle.test.ts` over a committed fixture, and that test
 * is the only reason to believe the numbers coming out of here.
 *
 * Nothing in the return value is a Map, a Date or a class instance, because it
 * crosses a Web Worker boundary and then a `JSON.stringify`.
 */

/** Below this there is nothing a survival curve could honestly say. */
export const MIN_CUSTOMERS = 20;

/** The horizons the headline offers. Anything past the file is marked. */
export const HORIZONS = [30, 90, 180, 365] as const;

/** The overdue buckets `analytics.reactivation_rates` uses. */
const OVERDUE_BOUNDS = [30, 60, 120, 240];

export type Cohort = { cadenceDays: number; firstRepeatDays: number; averageOrderCents: number };

export type CustomerRow = {
  id: string;
  visits: number;
  cancelled: number;
  observedGaps: number;
  firstIso: string | null;
  lastIso: string | null;
  daysSinceLast: number | null;
  visitCadenceDays: number | null;
  daysToSecondVisit: number | null;
  orders: number;
  lifetimeValueCents: number;
  town: string | null;
  distanceKm: number | null;
  distanceBand: Band;
  modalPartySize: number;
  baseGapDays: number | null;
  distanceFactor: number;
  seasonFactor: number;
  companionFactor: number;
  expectedGapDays: number;
  silenceRatio: number | null;
  committed: boolean;
  slotSqueezed: boolean;
  seasonalDormant: boolean;
  lowEvidenceFar: boolean;
  habitualSlotsSince: number;
  habitualSlotsFull: number;
  lifecycle: Lifecycle;
  lifecycleNaive: Lifecycle;
  expectedMarginCents: number;
  reachability: number;
  pReturn: number | null;
  pReturnObservations: number;
  winnabilityCents: number;
};

export type AnalyseInput = {
  bookings: readonly Booking[];
  /** Null takes the newest attended booking in the file. */
  asOfDay: number | null;
  /** The town the business is in. Null means no distance bands at all. */
  venueTown: string | null;
  params?: ModelParams;
};

export type Analysis = {
  asOfDay: number;
  asOfIso: string;
  venue: { name: string; county: string; country: string; lat: number; lng: number } | null;
  params: ModelParams;
  usingProductionParams: boolean;
  assumedConsent: boolean;
  counts: {
    bookings: number;
    attended: number;
    cancelled: number;
    customers: number;
    townMatched: number;
    townUnmatched: number;
  };
  span: { firstIso: string | null; lastIso: string | null; months: number };
  season: { enabled: boolean; months: { month: number; visits: number; index: number }[] };
  cohort: Cohort;
  rows: CustomerRow[];
  verdicts: { lifecycle: Lifecycle; count: number }[];
  bands: { band: Band; customers: number; medianExpectedGapDays: number | null }[];
  secondVisit: {
    enough: boolean;
    n: number;
    events: number;
    censored: number;
    naive: number;
    medianDays: number | null;
    curve: { day: number; returned: number }[];
    horizons: { day: number; estimate: number; lo: number; hi: number; defined: boolean; beyondFile: boolean }[];
  };
  slots: { weekday: number; hour: number; slots: number; visits: number; full: number }[];
  products: { product: string; customers: number; medianGapDays: number | null; overdue: number }[];
  warnings: string[];
};

const attended = (b: Booking) => b.status === "completed" || b.status === "no_show";

function visitsBucket(visits: number): string {
  if (visits <= 1) return "1";
  if (visits <= 3) return "2-3";
  if (visits <= 9) return "4-9";
  return "10+";
}

/**
 * Every silence this file contains, closed or still running.
 *
 * One row per gap between consecutive visits, which ended in a visit, plus one
 * trailing row per customer for the silence still counting. Counting only the
 * gaps that closed would measure the survivors and conclude that everybody
 * comes back, which is the same mistake the naive one-and-done figure makes at
 * the other end of the tool.
 */
function reactivationRates(
  facts: readonly CustomerFacts[],
  bandOf: (c: CustomerFacts) => Band,
  asOfDay: number,
  bookings: readonly Booking[],
): Map<string, { observations: number; returns: number }> {
  const byCustomer = new Map<string, number[]>();
  for (const b of bookings) {
    if (!attended(b)) continue;
    const days = byCustomer.get(b.customerId);
    if (days) days.push(b.day);
    else byCustomer.set(b.customerId, [b.day]);
  }

  const table = new Map<string, { observations: number; returns: number }>();
  const add = (key: string, returned: boolean) => {
    const cell = table.get(key) ?? { observations: 0, returns: 0 };
    cell.observations += 1;
    if (returned) cell.returns += 1;
    table.set(key, cell);
  };

  for (const customer of facts) {
    const days = (byCustomer.get(customer.id) ?? []).sort((a, b) => a - b);
    if (days.length === 0) continue;
    const band = bandOf(customer);
    const bucket = visitsBucket(customer.visits);
    for (let i = 1; i < days.length; i++) {
      add(`${band}|${bucket}|${widthBucket(days[i] - days[i - 1], OVERDUE_BOUNDS)}`, true);
    }
    add(`${band}|${bucket}|${widthBucket(asOfDay - days[days.length - 1], OVERDUE_BOUNDS)}`, false);
  }
  return table;
}

/** 0070's rule, verbatim, so the difference between the two verdicts is listable. */
function naiveLifecycle(customer: CustomerFacts): Lifecycle {
  if (customer.visits === 0) return "prospect";
  if (customer.visits === 1) return "first_time";
  if (customer.daysSinceLast === null) return "prospect";
  const cadence = customer.visitCadenceDays;
  if (customer.daysSinceLast > (cadence === null ? 90 : cadence * 4)) return "lapsed";
  if (customer.daysSinceLast > (cadence === null ? 45 : cadence * 2)) return "at_risk";
  if (customer.visits >= 10) return "loyal";
  return "repeat";
}

function sameParams(a: ModelParams, b: ModelParams): boolean {
  return (Object.keys(b) as (keyof ModelParams)[]).every((key) => a[key] === b[key]);
}

export function analyse(input: AnalyseInput): Analysis {
  const params = input.params ?? PRODUCTION_PARAMS;
  const bookings = input.bookings;
  const warnings: string[] = [];

  const attendedRows = bookings.filter(attended);
  const asOfDay =
    input.asOfDay ??
    (attendedRows.length > 0 ? Math.max(...attendedRows.map((r) => r.day)) : 0);

  const venueTown: Town | null = findTown(input.venueTown);
  if (input.venueTown && !venueTown) {
    warnings.push(`No town matched "${input.venueTown}", so nobody has a distance band.`);
  }
  if (!input.venueTown) {
    warnings.push("No town chosen for the business, so nobody has a distance band and everybody is judged on behaviour alone.");
  }

  const season: Seasonality = buildSeasonality(bookings);
  // Said in words as well as carried as a field, because a switched-off factor
  // that nobody mentions reads as a factor of one that was measured.
  if (!season.enoughHistory) {
    warnings.push("This file covers fewer than twelve months, so the season factor is switched off. One winter is no evidence at all about your summer.");
  }

  // Migration 0300 starts from the attended-visits CTE. A customer represented
  // only by cancelled rows is not in that relation and must not acquire a
  // synthetic prospect score here.
  const facts = buildCustomers(bookings, asOfDay, season, params).filter((customer) => customer.visits > 0);
  const occupancy = buildOccupancy(bookings);

  const townOf = new Map<string, Town | null>();
  let townMatched = 0;
  let townUnmatched = 0;
  for (const customer of facts) {
    const town = customer.town ? findTown(customer.town) : null;
    townOf.set(customer.id, town);
    if (customer.town) {
      if (town) townMatched++;
      else townUnmatched++;
    }
  }

  const bandOf = (customer: CustomerFacts): Band => {
    if (!venueTown) return "unknown";
    const town = townOf.get(customer.id) ?? null;
    const km = town ? distanceKm(town.lat, town.lng, venueTown.lat, venueTown.lng) : null;
    const country = customer.country ?? town?.country ?? null;
    const sameCountry = country === null ? null : country === venueTown.country;
    return distanceBand(km, sameCountry, params);
  };

  // The cohort baselines. Three numbers, the same for every customer.
  const cadences = facts.filter((c) => c.visits >= 3 && c.visitCadenceDays !== null).map((c) => c.visitCadenceDays as number);
  const firstRepeats = facts.filter((c) => c.daysToSecondVisit !== null).map((c) => c.daysToSecondVisit as number);
  const orderValues = facts.filter((c) => c.orders > 0).map((c) => c.lifetimeValueCents / c.orders);
  const cohort: Cohort = {
    cadenceDays: percentileCont(cadences, 0.5) ?? params.cohortDefaultCadenceDays,
    firstRepeatDays: percentileCont(firstRepeats, 0.5) ?? params.cohortDefaultFirstRepeatDays,
    averageOrderCents:
      orderValues.length === 0 ? 0 : orderValues.reduce((a, b) => a + b, 0) / orderValues.length,
  };

  const hasContactData = facts.some((c) => c.consent !== null || c.hasEmail || c.hasPhone);
  const assumedConsent = !hasContactData;
  if (assumedConsent) {
    warnings.push("Your file says nothing about marketing consent, so the ranking assumes you may contact everybody in it. The model in production refuses to guess and scores an unreachable customer at zero.");
  }
  warnings.push("Your file does not carry your costs, so the margin behind every winnability figure is the order value itself. Treat those numbers as an upper bound.");

  const monthIndexNow = season.enoughHistory ? monthIndexFor(season, monthOfYear(asOfDay)) : null;
  const rates = reactivationRates(facts, bandOf, asOfDay, bookings);

  const rows: CustomerRow[] = facts.map((customer) => {
    const band = bandOf(customer);
    const town = townOf.get(customer.id) ?? null;
    const km = venueTown && town ? distanceKm(town.lat, town.lng, venueTown.lat, venueTown.lng) : null;

    const baseGap =
      customer.visits <= 1
        ? cohort.firstRepeatDays
        : shrink(customer.visitCadenceDays, customer.observedGaps, cohort.cadenceDays, params);
    const distanceFactor = blendPrior(distancePriorFactor(band, params), customer.observedGaps, params);
    const season_ = seasonFactor(monthIndexNow, params);
    const companion = customer.modalPartySize >= params.companionPartyThreshold ? params.companionFactor : 1.0;
    const expected = expectedGapDays(baseGap, distanceFactor, season_, companion, params);
    const ratio =
      customer.daysSinceLast === null ? null : roundTo(customer.daysSinceLast / expected, 3);

    const squeeze = squeezeOf(occupancy, customer, asOfDay, params);
    const committed = customer.creditsRemaining > 0;
    const dormant =
      monthIndexNow !== null &&
      monthIndexNow < params.dormantMonthIndex &&
      customer.seasonVisitsSeen >= params.dormantMinVisits &&
      customer.seasonVisitsInTrough / customer.seasonVisitsSeen < params.dormantTroughRatio;
    const lowEvidenceFar =
      (band === "distant" && customer.visits <= params.farDistantVisits) ||
      (band === "visitor" && customer.visits <= params.farVisitorVisits);

    const aov = customer.orders > 0 ? customer.lifetimeValueCents / customer.orders : cohort.averageOrderCents;
    const margin = Math.max(0, roundTo(aov, 0));
    const reach = assumedConsent
      ? 1.0
      : reachability(customer.consent, customer.hasEmail, customer.hasPhone, false);
    const cell = rates.get(`${band}|${visitsBucket(customer.visits)}|${widthBucket(customer.daysSinceLast ?? 0, OVERDUE_BOUNDS)}`);
    const pReturn = smoothRate(
      cell?.returns ?? 0,
      cell?.observations ?? 0,
      pReturnPrior(band, customer.visits, params),
      params.smoothStrength,
    );

    return {
      id: customer.id,
      visits: customer.visits,
      cancelled: customer.cancelled,
      observedGaps: customer.observedGaps,
      firstIso: customer.firstDay === null ? null : isoFromDay(customer.firstDay),
      lastIso: customer.lastDay === null ? null : isoFromDay(customer.lastDay),
      daysSinceLast: customer.daysSinceLast,
      visitCadenceDays: customer.visitCadenceDays,
      daysToSecondVisit: customer.daysToSecondVisit,
      orders: customer.orders,
      lifetimeValueCents: customer.lifetimeValueCents,
      town: customer.town,
      distanceKm: km === null ? null : roundTo(km, 2),
      distanceBand: band,
      modalPartySize: customer.modalPartySize,
      baseGapDays: baseGap === null ? null : roundTo(baseGap, 1),
      distanceFactor: roundTo(distanceFactor, 3),
      seasonFactor: roundTo(season_, 3),
      companionFactor: roundTo(companion, 3),
      expectedGapDays: roundTo(expected, 1),
      silenceRatio: ratio,
      committed,
      slotSqueezed: squeeze.squeezed,
      seasonalDormant: dormant,
      lowEvidenceFar,
      habitualSlotsSince: squeeze.slotsSince,
      habitualSlotsFull: squeeze.slotsFull,
      lifecycle: retentionVerdict(customer.visits, ratio, committed, squeeze.squeezed, dormant, lowEvidenceFar, params),
      lifecycleNaive: naiveLifecycle(customer),
      expectedMarginCents: margin,
      reachability: reach,
      pReturn,
      pReturnObservations: cell?.observations ?? 0,
      winnabilityCents: winnabilityCents(pReturn, margin, reach),
    };
  });

  // The headline.
  const observations: Observation[] = facts
    .filter((c) => c.firstDay !== null)
    .map((c) =>
      c.daysToSecondVisit !== null
        ? { days: c.daysToSecondVisit, returned: true }
        : { days: Math.max(0, asOfDay - (c.firstDay as number)), returned: false },
    );
  const curve = kaplanMeier(observations, Z_95);
  const horizons = HORIZONS.map((day) => {
    const answer = returnedBy(curve, day);
    return {
      day,
      estimate: answer.estimate,
      lo: answer.lo,
      hi: answer.hi,
      defined: answer.defined,
      beyondFile: day > curve.maxObserved,
    };
  });

  // The slot grid, aggregated from the occupancy that exists.
  const grid = new Map<string, { weekday: number; hour: number; slots: number; visits: number; full: number }>();
  for (const cell of occupancy.values()) {
    const weekday = isoDow(cell.day);
    const key = `${weekday}:${cell.hour}`;
    const entry = grid.get(key) ?? { weekday, hour: cell.hour, slots: 0, visits: 0, full: 0 };
    entry.slots += 1;
    entry.visits += cell.booked;
    if (cell.capacity !== null && cell.booked >= cell.capacity) entry.full += 1;
    grid.set(key, entry);
  }

  // The reorder radar.
  const productGaps = new Map<string, { gaps: number[]; customers: Set<string>; overdue: number }>();
  for (const customer of facts) {
    for (const { product, days } of customer.productDays) {
      if (days.length < 2) continue;
      const entry = productGaps.get(product) ?? { gaps: [], customers: new Set<string>(), overdue: 0 };
      for (let i = 1; i < days.length; i++) {
        const gap = days[i] - days[i - 1];
        if (gap > 0) entry.gaps.push(gap);
      }
      entry.customers.add(customer.id);
      const own = medianCont(days.slice(1).map((d, i) => d - days[i]).filter((g) => g > 0));
      const since = asOfDay - days[days.length - 1];
      if (own !== null && since > own) entry.overdue += 1;
      productGaps.set(product, entry);
    }
  }

  const verdictCounts = new Map<Lifecycle, number>();
  for (const row of rows) verdictCounts.set(row.lifecycle, (verdictCounts.get(row.lifecycle) ?? 0) + 1);

  const bandCounts = new Map<Band, CustomerRow[]>();
  for (const row of rows) {
    const list = bandCounts.get(row.distanceBand);
    if (list) list.push(row);
    else bandCounts.set(row.distanceBand, [row]);
  }

  const days = attendedRows.map((r) => r.day);
  return {
    asOfDay,
    asOfIso: isoFromDay(asOfDay),
    venue: venueTown
      ? {
          name: venueTown.name,
          county: venueTown.county,
          country: venueTown.country,
          lat: venueTown.lat,
          lng: venueTown.lng,
        }
      : null,
    params,
    usingProductionParams: sameParams(params, PRODUCTION_PARAMS),
    assumedConsent,
    counts: {
      bookings: bookings.length,
      attended: attendedRows.length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      customers: facts.length,
      townMatched,
      townUnmatched,
    },
    span: {
      firstIso: days.length === 0 ? null : isoFromDay(Math.min(...days)),
      lastIso: days.length === 0 ? null : isoFromDay(Math.max(...days)),
      months: season.monthsSeen,
    },
    season: { enabled: season.enoughHistory, months: season.months },
    cohort,
    rows,
    verdicts: [...verdictCounts.entries()]
      .map(([lifecycle, count]) => ({ lifecycle, count }))
      .sort((a, b) => b.count - a.count || a.lifecycle.localeCompare(b.lifecycle)),
    bands: [...bandCounts.entries()]
      .map(([band, list]) => ({
        band,
        customers: list.length,
        medianExpectedGapDays: medianCont(list.map((r) => r.expectedGapDays)),
      }))
      .sort((a, b) => b.customers - a.customers || a.band.localeCompare(b.band)),
    secondVisit: {
      enough: facts.length >= MIN_CUSTOMERS,
      n: curve.n,
      events: curve.events,
      censored: curve.censored,
      naive: naiveReturnRate(observations),
      medianDays: medianTimeToReturn(curve),
      curve: curve.points.map((p) => ({ day: p.day, returned: 1 - p.survival })),
      horizons,
    },
    slots: [...grid.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour),
    products: [...productGaps.entries()]
      .map(([product, entry]) => ({
        product,
        customers: entry.customers.size,
        medianGapDays: medianCont(entry.gaps),
        overdue: entry.overdue,
      }))
      .sort((a, b) => b.customers - a.customers || a.product.localeCompare(b.product)),
    warnings,
  };
}
