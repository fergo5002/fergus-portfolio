import { describe, expect, it } from "vitest";
import { buildCustomers, buildOccupancy, buildSeasonality, monthIndexFor, squeezeOf } from "./customers";
import { PRODUCTION_PARAMS } from "./model";
import { dayFromIso } from "./numbers";
import type { Booking } from "./types";

const day = (iso: string) => dayFromIso(iso) as number;

const booking = (over: Partial<Booking> & { customerId: string; day: number }): Booking => ({
  hour: null,
  capacity: null,
  status: "completed",
  amountCents: null,
  town: null,
  country: null,
  product: null,
  party: 1,
  creditsRemaining: 0,
  consent: null,
  hasEmail: false,
  hasPhone: false,
  ...over,
});

describe("the trading year", () => {
  it("puts an average month at 1.0", () => {
    const bookings = [
      ...Array.from({ length: 10 }, () => booking({ customerId: "a", day: day("2026-01-10") })),
      ...Array.from({ length: 10 }, () => booking({ customerId: "b", day: day("2026-07-10") })),
    ];
    const season = buildSeasonality(bookings);
    expect(monthIndexFor(season, 1)).toBe(1);
    expect(monthIndexFor(season, 7)).toBe(1);
  });

  it("halves a month that traded half as much", () => {
    const bookings = [
      ...Array.from({ length: 12 }, () => booking({ customerId: "a", day: day("2026-01-10") })),
      ...Array.from({ length: 6 }, () => booking({ customerId: "b", day: day("2026-07-10") })),
    ];
    const season = buildSeasonality(bookings);
    // Average month is 9, so January is 12/9 and July is 6/9, rounded to three
    // places the way the view does.
    expect(monthIndexFor(season, 1)).toBe(1.333);
    expect(monthIndexFor(season, 7)).toBe(0.667);
  });

  it("is 1.0 for a month with no trade in it at all", () => {
    const season = buildSeasonality([booking({ customerId: "a", day: day("2026-01-10") })]);
    expect(monthIndexFor(season, 6)).toBe(1);
  });

  /**
   * The design's own "can't see" line. One winter is no evidence about a
   * summer, and a month index computed from six months would say otherwise
   * with total confidence.
   */
  it("says it has too little history under twelve months", () => {
    const short = buildSeasonality([
      booking({ customerId: "a", day: day("2026-01-10") }),
      booking({ customerId: "a", day: day("2026-06-10") }),
    ]);
    expect(short.enoughHistory).toBe(false);

    const long = buildSeasonality(
      Array.from({ length: 12 }, (_, i) =>
        booking({ customerId: "a", day: day(`2026-${String(i + 1).padStart(2, "0")}-10`) }),
      ),
    );
    expect(long.enoughHistory).toBe(true);
  });

  it("ignores a cancelled row", () => {
    const season = buildSeasonality([
      booking({ customerId: "a", day: day("2026-01-10") }),
      booking({ customerId: "b", day: day("2026-01-11"), status: "cancelled" }),
    ]);
    expect(season.total).toBe(1);
  });
});

describe("one customer's facts", () => {
  const asOf = day("2026-06-01");

  it("counts a no-show as a visit but not as part of the rhythm", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-11"), status: "no_show" }),
      booking({ customerId: "c1", day: day("2026-01-31") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.visits).toBe(3);
    expect(c.observedGaps).toBe(2);
    // Completed rows are the 1st and the 31st, so one gap of 30 days.
    expect(c.visitCadenceDays).toBe(30);
    // Days to a second visit counts the no-show, per 0070.
    expect(c.daysToSecondVisit).toBe(10);
  });

  it("drops a zero-day gap rather than letting a double booking halve the cadence", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-21") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Gaps are 0 and 20. Keeping the zero would give a median of 10.
    expect(c.visitCadenceDays).toBe(20);
  });

  /**
   * `numeric(6,1)` in 0070 is a rounding, and this port applies it. On integer
   * day gaps it is a no-op, because `percentile_cont` at 0.5 over integers is
   * always a whole number or a half. It is here so the port matches the column
   * type rather than because it changes an answer, and that is worth saying
   * out loud so nobody deletes it as dead code.
   */
  it("gives a half where the median falls between two gaps", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01") }),
      booking({ customerId: "c1", day: day("2026-01-04") }),
      booking({ customerId: "c1", day: day("2026-01-12") }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Gaps 3 and 8, median 5.5, which numeric(6,1) leaves alone.
    expect(c.visitCadenceDays).toBe(5.5);
  });

  it("measures silence to the as-of date, not to today", () => {
    const bookings = [booking({ customerId: "c1", day: day("2026-05-01") })];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.daysSinceLast).toBe(31);
  });

  it("has no cadence and no second visit after one booking", () => {
    const bookings = [booking({ customerId: "c1", day: day("2026-05-01") })];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.visitCadenceDays).toBeNull();
    expect(c.daysToSecondVisit).toBeNull();
    expect(c.observedGaps).toBe(0);
  });

  it("counts money only where there is a figure", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), amountCents: 4500 }),
      booking({ customerId: "c1", day: day("2026-02-01") }),
      booking({ customerId: "c1", day: day("2026-03-01"), amountCents: 5500 }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.orders).toBe(2);
    expect(c.lifetimeValueCents).toBe(10000);
  });

  it("takes the modal party size and breaks a tie on the smaller", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), party: 2 }),
      booking({ customerId: "c1", day: day("2026-02-01"), party: 4 }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    // Postgres `mode()` breaks a tie arbitrarily; this port breaks it on the
    // smaller value so the same file gives the same answer twice. That is a
    // deliberate difference and the oracle fixture avoids ties because of it.
    expect(c.modalPartySize).toBe(2);
  });

  it("takes the most recent town and the strongest consent", () => {
    const bookings = [
      booking({ customerId: "c1", day: day("2026-01-01"), town: "Longford", consent: false }),
      booking({ customerId: "c1", day: day("2026-02-01"), town: "Sligo", consent: true }),
    ];
    const [c] = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(c.town).toBe("Sligo");
    expect(c.consent).toBe(true);
  });

  it("counts visits in the trough against the venue's own quiet months", () => {
    // Twelve bookings in January and three in July makes July the trough.
    const bookings = [
      ...Array.from({ length: 12 }, (_, i) => booking({ customerId: `x${i}`, day: day("2026-01-10") })),
      ...Array.from({ length: 3 }, (_, i) => booking({ customerId: `y${i}`, day: day("2026-07-10") })),
      booking({ customerId: "c1", day: day("2026-01-05") }),
      booking({ customerId: "c1", day: day("2026-07-05") }),
    ];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1");
    expect(c?.seasonVisitsSeen).toBe(2);
    expect(c?.seasonVisitsInTrough).toBe(1);
  });

  it("returns one row per customer, in a stable order", () => {
    const bookings = [
      booking({ customerId: "b", day: day("2026-01-01") }),
      booking({ customerId: "a", day: day("2026-01-01") }),
      booking({ customerId: "b", day: day("2026-02-01") }),
    ];
    const rows = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the slot that kept selling out", () => {
  const asOf = day("2026-03-01");

  /**
   * Six Saturdays at 18:00 after the customer's last visit, five of which sold
   * out. The migration's floor is three visits before this can fire, because
   * the claim is that a habit was taken away and somebody who came twice had no
   * habit to take.
   */
  function saturdays(sold: number) {
    const rows: Booking[] = [];
    const dates = ["2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31", "2026-02-07", "2026-02-14"];
    dates.forEach((iso, i) => {
      const full = i < sold;
      for (let seat = 0; seat < (full ? 8 : 3); seat++) {
        rows.push(booking({ customerId: `other${i}-${seat}`, day: day(iso), hour: 18, capacity: 8 }));
      }
    });
    return rows;
  }

  const regular = [
    booking({ customerId: "c1", day: day("2025-12-06"), hour: 18, capacity: 8 }),
    booking({ customerId: "c1", day: day("2025-12-13"), hour: 18, capacity: 8 }),
    booking({ customerId: "c1", day: day("2025-12-20"), hour: 18, capacity: 8 }),
  ];

  it("fires when the habitual slot sold out at least half the time", () => {
    const bookings = [...regular, ...saturdays(5)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    const squeeze = squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS);
    expect(squeeze.slotsSince).toBe(6);
    expect(squeeze.slotsFull).toBe(5);
    expect(squeeze.squeezed).toBe(true);
  });

  it("does not fire when the slot was mostly available", () => {
    const bookings = [...regular, ...saturdays(2)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS).squeezed).toBe(false);
  });

  it("does not fire on somebody with two visits, who had no habit to take", () => {
    const twice = regular.slice(0, 2);
    const bookings = [...twice, ...saturdays(6)];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS).squeezed).toBe(false);
  });

  it("does not fire on fewer than four slots since they left", () => {
    const bookings = [...regular, ...saturdays(6).filter((b) => b.day <= day("2026-01-24"))];
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    const squeeze = squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS);
    expect(squeeze.slotsSince).toBe(3);
    expect(squeeze.squeezed).toBe(false);
  });

  it("says nothing at all when there is no slot column", () => {
    const bookings = regular.map((b) => ({ ...b, hour: null, capacity: null }));
    const season = buildSeasonality(bookings);
    const c = buildCustomers(bookings, asOf, season).find((r) => r.id === "c1")!;
    expect(squeezeOf(buildOccupancy(bookings), c, asOf, PRODUCTION_PARAMS)).toEqual({
      slotsSince: 0,
      slotsFull: 0,
      squeezed: false,
    });
  });
});

