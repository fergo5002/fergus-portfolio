import { describe, expect, it } from "vitest";
import { DEMO_VENUE_TOWN, generate } from "./demo";
import { parseCsv } from "./csv";
import { emptyRoles, guessRoles, toBookings } from "./mapping";
import { buildCustomers, buildOccupancy, buildSeasonality, squeezeOf } from "./customers";
import { dayFromIso } from "./numbers";
import { isoDow } from "./numbers";

const options = { seed: 1, customers: 40, months: 24, startIso: "2024-09-01", venueTown: DEMO_VENUE_TOWN };

describe("the generator", () => {
  it("is deterministic, byte for byte", () => {
    expect(generate(options).csv).toBe(generate(options).csv);
  });

  it("changes completely on a different seed", () => {
    expect(generate({ ...options, seed: 2 }).csv).not.toBe(generate(options).csv);
  });

  it("produces a file this tool can read back with no help", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const roles = guessRoles(sheet);
    expect(roles.customer).toBeGreaterThanOrEqual(0);
    expect(roles.date).toBeGreaterThanOrEqual(0);
    expect(roles.town).not.toBeNull();
    expect(roles.capacity).not.toBeNull();
    const out = toBookings(sheet, roles);
    expect(out.ignored).toBe(0);
    expect(out.bookings.length).toBe(file.rows);
  });

  /**
   * The fixture has to be free of the one thing Postgres does not promise:
   * `mode()` breaks a tie arbitrarily, so a customer whose modal weekday, hour
   * or party size is tied could legitimately differ between the two sides and
   * the oracle would report a difference that is nobody's bug.
   */
  it("gives every customer an unambiguous modal weekday, hour and party size", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const out = toBookings(sheet, guessRoles(sheet));
    const byCustomer = new Map<string, typeof out.bookings>();
    for (const b of out.bookings) {
      const list = byCustomer.get(b.customerId) ?? [];
      list.push(b);
      byCustomer.set(b.customerId, list);
    }
    for (const [id, rows] of byCustomer) {
      const attended = rows.filter((r) => r.status !== "cancelled");
      if (attended.length === 0) continue;
      expect(new Set(attended.map((r) => isoDow(r.day))).size, `${id} weekday`).toBe(1);
      expect(new Set(attended.map((r) => r.hour)).size, `${id} hour`).toBe(1);
      expect(new Set(attended.map((r) => r.party)).size, `${id} party`).toBe(1);
    }
  });

  it("contains all five distance bands, so the oracle exercises each", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const towns = new Set(toBookings(sheet, guessRoles(sheet)).bookings.map((b) => b.town));
    expect(towns.has("Longford")).toBe(true);
    expect(towns.has("Dublin")).toBe(true);
    expect(towns.has("Belfast")).toBe(true);
    expect(towns.has(null)).toBe(true);
  });

  it("contains customers of every visit count the buckets care about", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    const facts = buildCustomers(bookings, dayFromIso(file.asOfIso) as number, buildSeasonality(bookings));
    const counts = facts.map((f) => f.visits);
    expect(counts.some((n) => n === 1)).toBe(true);
    expect(counts.some((n) => n >= 2 && n <= 3)).toBe(true);
    expect(counts.some((n) => n >= 4 && n <= 9)).toBe(true);
    expect(counts.some((n) => n >= 10)).toBe(true);
  });

  it("contains cancellations, no-shows, memberships and sold-out slots", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    expect(bookings.some((b) => b.status === "cancelled")).toBe(true);
    expect(bookings.some((b) => b.status === "no_show")).toBe(true);
    expect(bookings.some((b) => b.creditsRemaining > 0)).toBe(true);
    const byslot = new Map<string, number>();
    for (const b of bookings) {
      if (b.status === "cancelled" || b.hour === null) continue;
      const key = `${b.day}:${b.hour}`;
      byslot.set(key, (byslot.get(key) ?? 0) + 1);
    }
    expect([...byslot.values()].some((n) => n >= 8)).toBe(true);
  });

  it("contains a customer whose habitual slot was squeezed after they left", () => {
    const file = generate({ ...options, customers: 120 });
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    const asOf = dayFromIso(file.asOfIso) as number;
    const facts = buildCustomers(bookings, asOf, buildSeasonality(bookings));
    const occupancy = buildOccupancy(bookings);
    const customer = facts.find((fact) => fact.id === "SQUEEZED");

    expect(customer).toBeDefined();
    expect(squeezeOf(occupancy, customer!, asOf)).toMatchObject({ squeezed: true });
  });

  it("covers twelve calendar months, so the season factor can be on", () => {
    const file = generate(options);
    const sheet = parseCsv(file.csv);
    const bookings = toBookings(sheet, guessRoles(sheet)).bookings;
    expect(buildSeasonality(bookings).enoughHistory).toBe(true);
  });

  it("names nobody real", () => {
    // Every identifier is generated. This is a guard against somebody later
    // pasting a real export in here as "better test data".
    expect(generate(options).csv).toMatch(/^customer_id,/);
    expect(/@/.test(generate(options).csv)).toBe(false);
  });
});
