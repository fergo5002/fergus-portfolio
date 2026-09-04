import { describe, expect, it } from "vitest";
import { HORIZONS, MIN_CUSTOMERS, analyse } from "./analyse";
import { PRODUCTION_PARAMS } from "./model";
import { dayFromIso } from "./numbers";
import type { Booking } from "./types";

const day = (iso: string) => dayFromIso(iso) as number;

const b = (over: Partial<Booking> & { customerId: string; day: number }): Booking => ({
  hour: null,
  capacity: null,
  status: "completed",
  amountCents: 4500,
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

/** Thirty customers so the headline is not refused, plus whoever the test adds. */
function crowd(): Booking[] {
  const rows: Booking[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push(b({ customerId: `bulk${i}`, day: day("2026-01-05") + i }));
    if (i % 2 === 0) rows.push(b({ customerId: `bulk${i}`, day: day("2026-02-05") + i }));
    if (i % 4 === 0) rows.push(b({ customerId: `bulk${i}`, day: day("2026-03-08") + i }));
  }
  return rows;
}

describe("what it decides for itself", () => {
  it("takes the as-of date from the newest booking in the file", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.asOfDay).toBe(Math.max(...crowd().map((r) => r.day)));
    expect(out.asOfIso).toBe(out.asOfIso.slice(0, 10));
  });

  it("takes an as-of date it is given instead", () => {
    const out = analyse({ bookings: crowd(), asOfDay: day("2026-12-31"), venueTown: null });
    expect(out.asOfDay).toBe(day("2026-12-31"));
  });

  it("knows whether it is running the production constants", () => {
    const plain = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(plain.usingProductionParams).toBe(true);
    const moved = analyse({
      bookings: crowd(),
      asOfDay: null,
      venueTown: null,
      params: { ...PRODUCTION_PARAMS, shrinkK: 5 },
    });
    expect(moved.usingProductionParams).toBe(false);
  });
});

describe("the season factor, and why it is off", () => {
  it("is off under twelve months and says so in a warning", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.season.enabled).toBe(false);
    expect(out.rows.every((r) => r.seasonFactor === 1)).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/twelve months/i);
  });

  it("is on once the file covers twelve calendar months", () => {
    const rows: Booking[] = [];
    for (let m = 0; m < 12; m++) {
      const month = String(m + 1).padStart(2, "0");
      for (let i = 0; i < 4; i++) rows.push(b({ customerId: `c${m}-${i}`, day: day(`2026-${month}-10`) }));
    }
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.season.enabled).toBe(true);
    expect(out.season.months).toHaveLength(12);
  });
});

describe("the cohort baselines", () => {
  it("falls back to thirty and forty-five days when nothing can be measured", () => {
    // Every customer here has one visit, so there is no cadence and no second
    // visit anywhere in the file.
    const rows = Array.from({ length: 25 }, (_, i) => b({ customerId: `c${i}`, day: day("2026-01-05") + i }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.cohort.cadenceDays).toBe(30);
    expect(out.cohort.firstRepeatDays).toBe(45);
  });

  it("judges a first-timer against the first-repeat baseline, not the steady-state one", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const firstTimer = out.rows.find((r) => r.visits === 1);
    expect(firstTimer?.baseGapDays).toBeCloseTo(out.cohort.firstRepeatDays, 6);
  });
});

describe("distance, when there is a venue and a town", () => {
  const withTowns = () => [
    ...crowd(),
    b({ customerId: "near", day: day("2026-01-10"), town: "Longford" }),
    b({ customerId: "far", day: day("2026-01-10"), town: "Dublin" }),
    b({ customerId: "nowhere", day: day("2026-01-10"), town: "Zzzzz" }),
    b({ customerId: "abroad", day: day("2026-01-10"), town: "Belfast" }),
  ];

  it("bands a customer against the venue's town", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    const band = (id: string) => out.rows.find((r) => r.id === id)?.distanceBand;
    expect(band("near")).toBe("local");
    expect(band("far")).toBe("distant");
    expect(band("nowhere")).toBe("unknown");
  });

  it("calls a customer in another country a visitor, whatever the mileage", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    // Belfast is in the table as GB, Longford as IE, so the border decides.
    expect(out.rows.find((r) => r.id === "abroad")?.distanceBand).toBe("visitor");
  });

  it("charges nothing for a town it could not match", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: "Longford" });
    expect(out.rows.find((r) => r.id === "nowhere")?.distanceFactor).toBe(1);
    expect(out.counts.townUnmatched).toBeGreaterThan(0);
  });

  it("bands everybody unknown when no venue is chosen, and warns", () => {
    const out = analyse({ bookings: withTowns(), asOfDay: null, venueTown: null });
    expect(out.rows.every((r) => r.distanceBand === "unknown")).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/no town/i);
  });
});

describe("the verdict, and the one it replaces", () => {
  it("carries both, so the difference can be listed rather than asserted", () => {
    const rows = [
      ...crowd(),
      // Three visits a fortnight apart, then silence for a year.
      b({ customerId: "gone", day: day("2025-01-06") }),
      b({ customerId: "gone", day: day("2025-01-20") }),
      b({ customerId: "gone", day: day("2025-02-03") }),
    ];
    const out = analyse({ bookings: rows, asOfDay: day("2026-03-08"), venueTown: null });
    const gone = out.rows.find((r) => r.id === "gone");
    expect(gone?.lifecycle).toBe("lapsed");
    expect(gone?.lifecycleNaive).toBe("lapsed");
    expect(gone?.silenceRatio).toBeGreaterThan(2);
  });

  it("calls a prepaid absentee committed_idle rather than lapsed", () => {
    const rows = [
      ...crowd(),
      b({ customerId: "paid", day: day("2025-01-06"), creditsRemaining: 5 }),
      b({ customerId: "paid", day: day("2025-01-20"), creditsRemaining: 5 }),
      b({ customerId: "paid", day: day("2025-02-03"), creditsRemaining: 5 }),
    ];
    const out = analyse({ bookings: rows, asOfDay: day("2026-03-08"), venueTown: null });
    expect(out.rows.find((r) => r.id === "paid")?.lifecycle).toBe("committed_idle");
  });

  it("counts the verdicts, every kind that occurred", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const total = out.verdicts.reduce((sum, v) => sum + v.count, 0);
    expect(total).toBe(out.rows.length);
  });
});

describe("the headline", () => {
  it("is refused under twenty customers, by name", () => {
    const rows = Array.from({ length: 5 }, (_, i) => b({ customerId: `c${i}`, day: day("2026-01-05") }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(MIN_CUSTOMERS).toBe(20);
    expect(out.secondVisit.enough).toBe(false);
    // Everything else still computed, so the table is there to look at.
    expect(out.rows).toHaveLength(5);
  });

  it("prints the naive figure beside the modelled one", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.secondVisit.enough).toBe(true);
    expect(out.secondVisit.naive).toBeGreaterThan(0);
    expect(out.secondVisit.naive).toBeLessThan(1);
    const at90 = out.secondVisit.horizons.find((h) => h.day === 90);
    expect(at90?.estimate).toBeGreaterThanOrEqual(out.secondVisit.naive);
  });

  it("offers the four horizons and marks the ones the file cannot reach", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.secondVisit.horizons.map((h) => h.day)).toEqual([...HORIZONS]);
    expect(out.secondVisit.horizons.find((h) => h.day === 365)?.beyondFile).toBe(true);
  });
});

describe("money, and the assumption it rests on", () => {
  it("takes the order value as the margin and says so", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const row = out.rows.find((r) => r.orders > 0);
    expect(row?.expectedMarginCents).toBe(4500);
    expect(out.warnings.join(" ")).toMatch(/costs/i);
  });

  it("assumes it may contact people when the file says nothing about consent", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    expect(out.assumedConsent).toBe(true);
    expect(out.rows.every((r) => r.reachability === 1)).toBe(true);
  });

  it("uses the real reachability once the file carries consent", () => {
    const rows = crowd().map((r, i) => ({ ...r, consent: i % 2 === 0, hasEmail: true }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.assumedConsent).toBe(false);
    expect(out.rows.some((r) => r.reachability === 0)).toBe(true);
    expect(out.rows.some((r) => r.reachability === 0.6)).toBe(true);
  });

  it("cannot rank somebody it cannot contact above zero", () => {
    const rows = crowd().map((r) => ({ ...r, consent: false, hasEmail: true }));
    const out = analyse({ bookings: rows, asOfDay: null, venueTown: null });
    expect(out.rows.every((r) => r.winnabilityCents === 0)).toBe(true);
  });
});

describe("the output crosses a worker and a JSON round trip unchanged", () => {
  it("holds nothing but plain data", () => {
    const out = analyse({ bookings: crowd(), asOfDay: null, venueTown: null });
    const round = JSON.parse(JSON.stringify(out));
    expect(round).toEqual(out);
  });
});

