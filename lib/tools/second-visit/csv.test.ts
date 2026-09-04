import { describe, expect, it } from "vitest";
import { MAX_ROWS, detectDelimiter, parseCsv } from "./csv";
import { ReadError } from "./types";

describe("the shape of a field", () => {
  it("splits on the delimiter and trims nothing inside quotes", () => {
    const sheet = parseCsv('a,b\n1, 2 \n');
    expect(sheet.header).toEqual(["a", "b"]);
    expect(sheet.rows).toEqual([["1", " 2 "]]);
  });

  it("keeps a delimiter, a newline and a quote inside a quoted field", () => {
    const sheet = parseCsv('a,b\n"x,y","line1\nline2"\n"he said ""no""",z\n');
    expect(sheet.rows[0]).toEqual(["x,y", "line1\nline2"]);
    expect(sheet.rows[1][0]).toBe('he said "no"');
  });

  /**
   * The rule this repository has already been bitten by once. Git hands this
   * checkout CRLF and hands CI LF, so a reader that treats them differently is
   * a test that is red on one machine and green on the other for no reason to
   * do with the code.
   */
  it("reads CRLF, LF and a lone CR to exactly the same rows", () => {
    const lf = parseCsv("a,b\n1,2\n3,4\n");
    const crlf = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    const cr = parseCsv("a,b\r1,2\r3,4\r");
    expect(crlf).toEqual(lf);
    expect(cr).toEqual(lf);
  });

  it("drops a byte order mark rather than putting it in the first header", () => {
    // Written as an escape rather than a literal, so nobody's editor eats it.
    const sheet = parseCsv("\uFEFFcustomer,date\n1,2026-01-01\n");
    expect(sheet.header[0]).toBe("customer");
  });

  it("does not invent a final empty row from a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n").rows).toHaveLength(1);
    expect(parseCsv("a,b\n1,2").rows).toHaveLength(1);
  });

  it("keeps a genuinely blank field but drops a blank line", () => {
    const sheet = parseCsv("a,b\n1,\n\n2,3\n");
    expect(sheet.rows).toEqual([["1", ""], ["2", "3"]]);
  });

  it("pads a short row and keeps an over-long one rather than throwing", () => {
    const sheet = parseCsv("a,b,c\n1,2\n1,2,3,4\n");
    expect(sheet.rows[0]).toEqual(["1", "2", ""]);
    expect(sheet.rows[1]).toEqual(["1", "2", "3", "4"]);
  });
});

describe("the delimiter", () => {
  it("finds a comma, a semicolon or a tab from the header line", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("is not fooled by commas inside quoted headers", () => {
    expect(detectDelimiter('"Name, full";"Date"\n"a";"b"')).toBe(";");
  });

  it("falls back to a comma when there is only one column", () => {
    expect(detectDelimiter("date\n2026-01-01")).toBe(",");
  });
});

describe("finding the header when the file starts with something else", () => {
  it("takes the first row when the file is ordinary", () => {
    const sheet = parseCsv("customer,date\nc1,2026-01-01\n");
    expect(sheet.headerIndex).toBe(0);
    expect(sheet.skipped).toBe(0);
  });

  /**
   * Booking systems put a title, a date range and a blank line above the
   * header often enough that a reader which assumes row one is a header will
   * happily treat "Bookings export" as a column name and then find no dates
   * anywhere.
   */
  it("skips a preamble narrower than the table under it", () => {
    const text = [
      "Bookings export",
      "Generated 2026-09-01",
      "",
      "Customer,Date,Amount",
      "c1,2026-01-01,45.00",
      "c2,2026-01-04,45.00",
    ].join("\n");
    const sheet = parseCsv(text);
    // Two, not three: the blank line is dropped before a header is chosen, so
    // `headerIndex` counts parsed rows rather than lines in the file.
    expect(sheet.headerIndex).toBe(2);
    expect(sheet.skipped).toBe(2);
    expect(sheet.header).toEqual(["Customer", "Date", "Amount"]);
    expect(sheet.rows).toHaveLength(2);
  });

  it("does not mistake a data row for a header when every header cell is a number", () => {
    // No row here has all-non-numeric cells, so the first full-width row wins
    // and the caller is left to notice the headers are useless.
    const sheet = parseCsv("1,2,3\n4,5,6\n");
    expect(sheet.headerIndex).toBe(0);
  });

  it("refuses a file with nothing in it, by kind", () => {
    expect(() => parseCsv("")).toThrow(ReadError);
    expect(() => parseCsv("   \n\n")).toThrow(/no rows/i);
  });
});

describe("the limits, which refuse rather than hang", () => {
  it("stops at MAX_ROWS and says it was truncated", () => {
    const body = Array.from({ length: 20 }, (_, i) => `c${i},2026-01-01`).join("\n");
    const sheet = parseCsv(`customer,date\n${body}\n`, { maxRows: 10 });
    expect(sheet.rows).toHaveLength(10);
    expect(sheet.truncated).toBe(true);
    expect(MAX_ROWS).toBe(500000);
  });

  it("does not claim truncation when it read everything", () => {
    expect(parseCsv("a,b\n1,2\n").truncated).toBe(false);
  });
});

