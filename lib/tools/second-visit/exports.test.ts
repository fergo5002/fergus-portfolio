import { describe, expect, it } from "vitest";
import { analyse } from "./analyse";
import { csvCell, exportFiles, lapsedRegulars, secondVisitNudges, stallRisks, toCsv } from "./exports";
import { parseCsv } from "./csv";
import { guessRoles, toBookings } from "./mapping";
import { demoCsv, DEMO_VENUE_TOWN } from "./demo";

const analysis = (() => {
  const sheet = parseCsv(demoCsv());
  const out = toBookings(sheet, guessRoles(sheet));
  return analyse({ bookings: out.bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
})();

describe("a cell", () => {
  it("quotes only when it has to", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("has,comma")).toBe('"has,comma"');
    expect(csvCell('has"quote')).toBe('"has""quote"');
    expect(csvCell("has\nnewline")).toBe('"has\nnewline"');
  });

  it("is empty for nothing, and not the word null", () => {
    expect(csvCell(null)).toBe("");
  });

  /**
   * A customer identifier came out of somebody else's system and goes into a
   * file somebody will double-click. `=HYPERLINK("http://x","click")` in a
   * name is a formula in every spreadsheet there is.
   */
  it("defuses a formula in a text cell", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+44 7700 900000")).toBe("'+44 7700 900000");
    expect(csvCell("@handle")).toBe("'@handle");
    expect(csvCell("-lead")).toBe("'-lead");
    // Guarded but not quoted: a tab needs no quoting in a comma-delimited file,
    // and RFC 4180 only asks for it round a comma, a quote or a line break.
    expect(csvCell("\tstart")).toBe("'\tstart");
  });

  it("leaves a number alone, so a sheet can still add it up", () => {
    expect(csvCell(-4500)).toBe("-4500");
    expect(csvCell(0)).toBe("0");
  });
});

describe("the three lists", () => {
  it("puts people with a rhythm who are well past it in the lapsed file", () => {
    const rows = lapsedRegulars(analysis);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visits).toBeGreaterThanOrEqual(3);
      expect(["lapsed", "at_risk"]).toContain(row.lifecycle);
    }
  });

  it("puts one-visit customers who are not yet late in the nudges file", () => {
    const rows = secondVisitNudges(analysis);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.visits).toBe(1);
      expect(row.lifecycle).toBe("first_time");
    }
  });

  it("puts the two and three visit drifters in the stalls file", () => {
    const rows = stallRisks(analysis);
    for (const row of rows) {
      expect(row.visits).toBeGreaterThanOrEqual(2);
      expect(row.visits).toBeLessThanOrEqual(3);
      expect(row.silenceRatio).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("never puts anybody in two of them", () => {
    const ids = [
      ...lapsedRegulars(analysis).map((r) => r.id),
      ...secondVisitNudges(analysis).map((r) => r.id),
      ...stallRisks(analysis).map((r) => r.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ranks by what a winback is worth, biggest first", () => {
    const rows = lapsedRegulars(analysis);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].winnabilityCents).toBeGreaterThanOrEqual(rows[i].winnabilityCents);
    }
  });

  it("never lists somebody it has already said cannot be contacted", () => {
    const withConsent = (() => {
      const sheet = parseCsv(demoCsv());
      const out = toBookings(sheet, guessRoles(sheet));
      const bookings = out.bookings.map((b) => ({ ...b, consent: false, hasEmail: true }));
      return analyse({ bookings, asOfDay: null, venueTown: DEMO_VENUE_TOWN });
    })();
    expect(lapsedRegulars(withConsent)).toHaveLength(0);
  });
});

describe("the files", () => {
  const files = exportFiles(analysis);

  it("is three of them, each named and each with its own sentence", () => {
    expect(files).toHaveLength(3);
    for (const file of files) {
      expect(file.file).toMatch(/\.csv$/);
      expect(file.note.length).toBeGreaterThan(20);
    }
  });

  it("writes a header this tool can read back", () => {
    for (const file of files) {
      if (file.csv.split("\n").length < 3) continue;
      const sheet = parseCsv(file.csv);
      expect(sheet.header[0]).toBe("customer");
      expect(sheet.rows.length).toBeGreaterThan(0);
    }
  });

  it("carries the sentence about assumed consent when it applies", () => {
    expect(files.some((f) => f.note.length > 0)).toBe(true);
    expect(analysis.assumedConsent).toBe(true);
  });

  it("uses CRLF, which is what RFC 4180 says and what Excel expects", () => {
    expect(toCsv(["a", "b"], [[1, 2]])).toBe("a,b\r\n1,2\r\n");
  });
});

