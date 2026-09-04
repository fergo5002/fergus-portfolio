import { PRODUCTION_PARAMS } from "./model";
import { isoDow, medianCont, monthOfYear, roundTo } from "./numbers";
import type { Booking, ModelParams } from "./types";

/**
 * Bookings to the facts the model needs, which is where the four inputs
 * migration 0300 takes from `analytics.customer_metrics` are reproduced.
 *
 * Source for these definitions: `apps/api/migrations/0070_analytics_views.sql`
 * in `fergo5002/sauna-os`, the same commit as the model. 0300 consumes them and
 * does not define them, so reading 0300 alone would mean inventing four inputs
 * and then testing the invention against itself.
 *
 * The three that are easy to get almost right:
 *
 *   1. A visit is attended, which is completed or no-show. A no-show counts.
 *   2. A cadence is the median gap between COMPLETED visits, zero-day gaps
 *      dropped, rounded to one decimal. A no-show is not part of a rhythm, two
 *      bookings on one day are not a gap, and `numeric(6,1)` rounds.
 *   3. Silence is measured to the as-of date and not to today, because an
 *      export is a snapshot and today is a fact about the download.
 */

const attended = (b: Booking) => b.status === "completed" || b.status === "no_show";

export type Seasonality = {
  /** Index by calendar month, 1 to 12. Absent months are not present. */
  months: { month: number; visits: number; index: number }[];
  monthsSeen: number;
  total: number;
  /** Twelve distinct calendar months of trade, or the season factor is off. */
  enoughHistory: boolean;
};

/**
 * Trade per calendar month against this venue's own average month.
 *
 * Against the average month actually observed, not against a twelfth of the
 * total, so a venue that has only traded through one winter is not told its
 * summer is catastrophic. That the tool switches the factor off entirely below
 * twelve months is this tool's addition, and it is stated on the page.
 */
export function buildSeasonality(bookings: readonly Booking[]): Seasonality {
  const counts = new Map<number, number>();
  let total = 0;
  for (const b of bookings) {
    if (!attended(b)) continue;
    const month = monthOfYear(b.day);
    counts.set(month, (counts.get(month) ?? 0) + 1);
    total++;
  }
  const monthsSeen = counts.size;
  const average = monthsSeen === 0 ? 0 : total / monthsSeen;
  const months = [...counts.entries()]
    .map(([month, visits]) => ({
      month,
      visits,
      index: average === 0 ? 1 : roundTo(visits / average, 3),
    }))
    .sort((a, b) => a.month - b.month);

  // Distinct calendar months across the whole file, so two Januaries count once
  // for the shape of the year and the history test asks for twelve of them.
  return { months, monthsSeen, total, enoughHistory: monthsSeen >= 12 };
}

/** 1.0 for a month with no trade, which is the right amount of confidence. */
export function monthIndexFor(season: Seasonality, month: number): number {
  return season.months.find((m) => m.month === month)?.index ?? 1;
}

/** Keyed `day:hour`. Only slots somebody booked exist here; see the page's note. */
export type OccupancyIndex = Map<string, { day: number; hour: number; booked: number; capacity: number | null }>;

export function buildOccupancy(bookings: readonly Booking[]): OccupancyIndex {
  const index: OccupancyIndex = new Map();
  for (const b of bookings) {
    if (!attended(b) || b.hour === null) continue;
    const key = `${b.day}:${b.hour}`;
    const cell = index.get(key) ?? { day: b.day, hour: b.hour, booked: 0, capacity: null };
    cell.booked += 1;
    if (b.capacity !== null) cell.capacity = Math.max(cell.capacity ?? 0, b.capacity);
    index.set(key, cell);
  }
  return index;
}

export type CustomerFacts = {
  id: string;
  visits: number;
  cancelled: number;
  observedGaps: number;
  firstDay: number | null;
  lastDay: number | null;
  daysSinceLast: number | null;
  visitCadenceDays: number | null;
  daysToSecondVisit: number | null;
  orders: number;
  lifetimeValueCents: number;
  modalPartySize: number;
  modalWeekday: number | null;
  modalHour: number | null;
  town: string | null;
  country: string | null;
  creditsRemaining: number;
  consent: boolean | null;
  hasEmail: boolean;
  hasPhone: boolean;
  seasonVisitsSeen: number;
  seasonVisitsInTrough: number;
  /** Sorted days per product, for the reorder radar. Only products they bought. */
  productDays: { product: string; days: number[] }[];
};

/** The most frequent value, ties broken on the smaller, so a file is deterministic. */
function modeOf(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = fallback;
  let bestCount = -1;
  for (const [value, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function buildCustomers(
  bookings: readonly Booking[],
  asOfDay: number,
  season: Seasonality,
  p: ModelParams = PRODUCTION_PARAMS,
): CustomerFacts[] {
  const byCustomer = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = byCustomer.get(b.customerId);
    if (list) list.push(b);
    else byCustomer.set(b.customerId, [b]);
  }

  const out: CustomerFacts[] = [];
  for (const [id, rows] of byCustomer) {
    const ordered = [...rows].sort((a, b) => a.day - b.day);
    const visits = ordered.filter(attended);
    const completed = ordered.filter((b) => b.status === "completed");

    const gaps: number[] = [];
    for (let i = 1; i < completed.length; i++) {
      const gap = completed[i].day - completed[i - 1].day;
      if (gap > 0) gaps.push(gap);
    }
    const cadence = medianCont(gaps);

    const products = new Map<string, number[]>();
    for (const b of visits) {
      if (!b.product) continue;
      const days = products.get(b.product);
      if (days) days.push(b.day);
      else products.set(b.product, [b.day]);
    }

    let consent: boolean | null = null;
    for (const b of ordered) {
      if (b.consent === true) consent = true;
      else if (b.consent === false && consent === null) consent = false;
    }

    const lastWithTown = [...ordered].reverse().find((b) => b.town);
    const lastWithCountry = [...ordered].reverse().find((b) => b.country);

    const firstDay = visits.length > 0 ? visits[0].day : null;
    const lastDay = visits.length > 0 ? visits[visits.length - 1].day : null;

    out.push({
      id,
      visits: visits.length,
      cancelled: ordered.filter((b) => b.status === "cancelled").length,
      observedGaps: Math.max(0, visits.length - 1),
      firstDay,
      lastDay,
      daysSinceLast: lastDay === null ? null : asOfDay - lastDay,
      visitCadenceDays: cadence === null ? null : roundTo(cadence, 1),
      daysToSecondVisit: visits.length >= 2 ? visits[1].day - visits[0].day : null,
      orders: ordered.filter((b) => b.amountCents !== null).length,
      lifetimeValueCents: ordered.reduce((sum, b) => sum + (b.amountCents ?? 0), 0),
      modalPartySize: modeOf(visits.map((b) => b.party), 1),
      modalWeekday: visits.length === 0 ? null : modeOf(visits.map((b) => isoDow(b.day)), 1),
      modalHour:
        visits.some((b) => b.hour !== null)
          ? modeOf(visits.filter((b) => b.hour !== null).map((b) => b.hour as number), 0)
          : null,
      town: lastWithTown?.town ?? null,
      country: lastWithCountry?.country ?? null,
      // An export usually repeats the current balance on every row, so the
      // largest value is the balance and an older smaller one is not evidence
      // that they spent it.
      creditsRemaining: ordered.reduce((max, b) => Math.max(max, b.creditsRemaining), 0),
      consent,
      hasEmail: ordered.some((b) => b.hasEmail),
      hasPhone: ordered.some((b) => b.hasPhone),
      seasonVisitsSeen: visits.length,
      seasonVisitsInTrough: visits.filter(
        (b) => monthIndexFor(season, monthOfYear(b.day)) < p.dormantMonthIndex,
      ).length,
      productDays: [...products.entries()]
        .map(([product, days]) => ({ product, days: [...days].sort((a, b) => a - b) }))
        .sort((a, b) => a.product.localeCompare(b.product)),
    });
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Whether their usual slot kept selling out after they stopped coming.
 *
 * Somebody shut out of the only time that suits them has not churned, and the
 * fix is the timetable rather than a discount. Three visits before this can
 * fire, because the claim is that a habit was taken away and somebody who came
 * twice had no habit to take: without that floor the flag lands on one-off
 * visitors whose chosen evening happens to be the busy one, which is a
 * coincidence dressed up as a cause.
 *
 * **What this cannot see**: a slot nobody booked. An export contains bookings,
 * so an empty Saturday is not in the file at all, and the share below is the
 * share of the slots that had at least one booking. The page says so.
 */
export function squeezeOf(
  occupancy: OccupancyIndex,
  customer: CustomerFacts,
  asOfDay: number,
  p: ModelParams = PRODUCTION_PARAMS,
): { slotsSince: number; slotsFull: number; squeezed: boolean } {
  if (customer.modalHour === null || customer.modalWeekday === null || customer.lastDay === null) {
    return { slotsSince: 0, slotsFull: 0, squeezed: false };
  }
  let slotsSince = 0;
  let slotsFull = 0;
  for (const cell of occupancy.values()) {
    if (cell.hour !== customer.modalHour) continue;
    if (cell.day <= customer.lastDay || cell.day > asOfDay) continue;
    if (isoDow(cell.day) !== customer.modalWeekday) continue;
    slotsSince++;
    if (cell.capacity !== null && cell.booked >= cell.capacity) slotsFull++;
  }
  const squeezed =
    customer.visits >= p.squeezeMinVisits &&
    slotsSince >= p.squeezeMinSlots &&
    slotsSince > 0 &&
    slotsFull / slotsSince >= p.squeezeFullRatio;
  return { slotsSince, slotsFull, squeezed };
}

