import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { emptyRoles, guessRoles, parseAmountCents, statusRole, toBookings, validateRoles } from "./mapping";
import { dayFromIso } from "./numbers";

const sheetOf = (text: string) => parseCsv(text);

describe("guessing from the header", () => {
  it("finds the obvious names", () => {
    const sheet = sheetOf(
      "Customer ID,Booking Date,Total,Town,Product\nc1,2026-01-04,45.00,Longford,Sauna\n",
    );
    const roles = guessRoles(sheet);
    expect(roles.customer).toBe(0);
    expect(roles.date).toBe(1);
    expect(roles.amount).toBe(2);
    expect(roles.town).toBe(3);
    expect(roles.product).toBe(4);
  });

  it("prefers an email over a name for identity, because a name is not unique", () => {
    const sheet = sheetOf("Name,Email,Date\nJohn Smith,a@b.ie,2026-01-04\n");
    const roles = guessRoles(sheet);
    expect(roles.customer).toBe(1);
    expect(roles.email).toBe(1);
  });

  it("finds a date column by its content when the header is unhelpful", () => {
    // No header word in this file says "date", so the content fallback is the
    // only thing that can find it.
    const sheet = sheetOf("ref,col2,who\nA1,2026-01-04,c1\nA2,2026-02-11,c2\nA3,2026-03-01,c1\n");
    expect(guessRoles(sheet).date).toBe(1);
  });

  it("does not guess a role it has no evidence for", () => {
    const sheet = sheetOf("customer,date\nc1,2026-01-04\n");
    const roles = guessRoles(sheet);
    expect(roles.amount).toBeNull();
    expect(roles.capacity).toBeNull();
    expect(roles.credits).toBeNull();
  });

  it("starts from nothing", () => {
    const roles = emptyRoles();
    expect(roles.customer).toBe(-1);
    expect(roles.date).toBe(-1);
    expect(roles.town).toBeNull();
  });
});

describe("refusing, by name", () => {
  const sheet = sheetOf("a,b\n1,2026-01-04\n");

  it("names the customer column when it is missing", () => {
    const error = validateRoles({ ...emptyRoles(), date: 1 }, sheet);
    expect(error?.kind).toBe("no-customer");
  });

  it("names the date column when it is missing", () => {
    const error = validateRoles({ ...emptyRoles(), customer: 0 }, sheet);
    expect(error?.kind).toBe("no-date");
  });

  it("is happy with the two", () => {
    expect(validateRoles({ ...emptyRoles(), customer: 0, date: 1 }, sheet)).toBeNull();
  });
});

describe("reading money", () => {
  it("takes a plain number as whole cents", () => {
    expect(parseAmountCents("45.00")).toBe(4500);
    expect(parseAmountCents("45")).toBe(4500);
    expect(parseAmountCents("0.99")).toBe(99);
  });

  it("takes a currency symbol and a thousands separator", () => {
    expect(parseAmountCents("EUR 1,234.56")).toBe(123456);
    expect(parseAmountCents("1 234.56")).toBe(123456);
  });

  /**
   * A file made in a locale where the comma is the decimal point. Decided per
   * value rather than per column, because the two forms are distinguishable:
   * a comma with exactly two digits after it and no full stop anywhere is a
   * decimal comma, and anything else is a thousands separator.
   */
  it("takes a decimal comma", () => {
    expect(parseAmountCents("45,00")).toBe(4500);
    expect(parseAmountCents("1.234,56")).toBe(123456);
  });

  it("reads a bracketed number as a refund", () => {
    expect(parseAmountCents("(45.00)")).toBe(-4500);
    expect(parseAmountCents("-45.00")).toBe(-4500);
  });

  it("is null on anything it cannot read, rather than zero", () => {
    // Zero would be a claim that the booking was free.
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("free")).toBeNull();
    expect(parseAmountCents("n/a")).toBeNull();
  });

  it("does not lose a cent to floating point", () => {
    expect(parseAmountCents("35.35")).toBe(3535);
    expect(parseAmountCents("8.15")).toBe(815);
  });
});

describe("reading a status", () => {
  it("knows the three that matter and files the rest as other", () => {
    for (const word of ["completed", "Complete", "attended", "checked in", "CHECKED_IN", "fulfilled"]) {
      expect(statusRole(word)).toBe("completed");
    }
    for (const word of ["no show", "no-show", "NoShow", "did not attend"]) {
      expect(statusRole(word)).toBe("no_show");
    }
    for (const word of ["cancelled", "canceled", "refunded", "void"]) {
      expect(statusRole(word)).toBe("cancelled");
    }
    expect(statusRole("pending")).toBe("other");
    expect(statusRole("")).toBe("other");
  });
});

describe("turning rows into bookings", () => {
  const text = [
    "customer,date,amount,slot,capacity,status,town,product,party,credits",
    "c1,2026-01-04,45.00,18:00,8,completed,Longford,Sauna,2,0",
    "c1,2026-02-01,45.00,18:00,8,completed,Longford,Sauna,2,0",
    "c2,2026-02-04,45.00,20:00,8,cancelled,Dublin,Sauna,1,3",
    "c3,not a date,45.00,,,completed,,,1,0",
  ].join("\n");

  const roles = {
    ...emptyRoles(),
    customer: 0,
    date: 1,
    amount: 2,
    slotStart: 3,
    capacity: 4,
    status: 5,
    town: 6,
    product: 7,
    party: 8,
    credits: 9,
  };

  it("keeps the rows it could read and counts the ones it could not", () => {
    const out = toBookings(sheetOf(text), roles);
    expect(out.bookings).toHaveLength(3);
    expect(out.used).toBe(3);
    expect(out.ignored).toBe(1);
    expect(out.reasons.badDate).toBe(1);
  });

  it("reads the parts of a booking", () => {
    const b = toBookings(sheetOf(text), roles).bookings[0];
    expect(b.customerId).toBe("c1");
    expect(b.day).toBe(dayFromIso("2026-01-04"));
    expect(b.hour).toBe(18);
    expect(b.capacity).toBe(8);
    expect(b.status).toBe("completed");
    expect(b.amountCents).toBe(4500);
    expect(b.town).toBe("Longford");
    expect(b.product).toBe("Sauna");
    expect(b.party).toBe(2);
  });

  it("keeps a cancelled row, marked, rather than dropping it", () => {
    // The cancellation rate is a number worth showing, and a row that is
    // silently gone cannot be counted later.
    const cancelled = toBookings(sheetOf(text), roles).bookings.find((b) => b.customerId === "c2");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.creditsRemaining).toBe(3);
  });

  it("decides the date style once for the whole column", () => {
    const out = toBookings(sheetOf(text), roles);
    expect(out.dateStyle).toBe("iso");
    expect(out.ambiguousDates).toBe(false);
  });

  it("reads a day-first column day-first, and says when it had to guess", () => {
    const dmy = sheetOf("customer,date\nc1,14/03/2026\nc2,01/02/2026\n");
    const out = toBookings(dmy, { ...emptyRoles(), customer: 0, date: 1 });
    expect(out.dateStyle).toBe("dmy");
    expect(out.ambiguousDates).toBe(false);
    expect(out.bookings[0].day).toBe(dayFromIso("2026-03-14"));

    const guessed = toBookings(sheetOf("customer,date\nc1,01/02/2026\nc2,03/04/2026\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(guessed.ambiguousDates).toBe(true);
  });

  it("defaults a party of nothing to one person", () => {
    const out = toBookings(sheetOf("customer,date\nc1,2026-01-04\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(out.bookings[0].party).toBe(1);
    expect(out.bookings[0].status).toBe("completed");
    expect(out.bookings[0].amountCents).toBeNull();
  });

  it("drops a row with no customer identifier at all", () => {
    const out = toBookings(sheetOf("customer,date\n,2026-01-04\nc1,2026-01-05\n"), {
      ...emptyRoles(),
      customer: 0,
      date: 1,
    });
    expect(out.bookings).toHaveLength(1);
    expect(out.reasons.noCustomer).toBe(1);
  });

  it("reads a slot as an hour from several shapes", () => {
    const out = toBookings(
      sheetOf("customer,date,slot\nc1,2026-01-04,18:00\nc2,2026-01-04,2026-01-04T09:30:00Z\nc3,2026-01-04,7pm\n"),
      { ...emptyRoles(), customer: 0, date: 1, slotStart: 2 },
    );
    expect(out.bookings.map((b) => b.hour)).toEqual([18, 9, 19]);
  });
});

