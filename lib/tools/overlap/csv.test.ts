import { describe, expect, it } from "vitest";
import { MIN_USABLE_ROWS, entriesFrom, parseCsv, readConnections } from "./csv";

/** The real shape: three lines of preamble, then the header, then the rows. */
const REAL = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Aoife,Ni Bhriain,https://www.linkedin.com/in/aoife-ni-bhriain-1a2b3c,,Stripe,Engineer,01 Mar 2024",
  "Cormac,O Suilleabhain,https://www.linkedin.com/in/cormac-o-suilleabhain,,Intercom,Designer,14 Jun 2023",
  "Restricted,Member,,,,,02 Feb 2022",
].join("\r\n");

describe("parseCsv", () => {
  it("reads plain rows on both line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("reads quoted fields, embedded commas, newlines and doubled quotes", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
    expect(parseCsv('"line\nbreak",x')).toEqual([["line\nbreak", "x"]]);
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });

  it("keeps empty fields and ignores one trailing newline", () => {
    expect(parseCsv("a,,c\r\n")).toEqual([["a", "", "c"]]);
    expect(parseCsv("a,b\n\n")).toEqual([["a", "b"], [""]]);
  });
});

describe("readConnections", () => {
  it("skips the preamble and finds the header", () => {
    const file = readConnections(REAL);
    expect(file.headerRow).toBe(3);
    expect(file.headers[2]).toBe("URL");
    expect(file.urlColumn).toBe(2);
    expect(file.nameColumns).toEqual({ first: 0, last: 1 });
    expect(file.rows).toHaveLength(3);
  });

  it("finds a header with no preamble at all", () => {
    const file = readConnections("First Name,Last Name,URL\nA,B,https://www.linkedin.com/in/a-b");
    expect(file.headerRow).toBe(0);
    expect(file.urlColumn).toBe(2);
  });

  it("accepts the other names LinkedIn has used for the column", () => {
    expect(readConnections("Name,Profile URL\nA,https://www.linkedin.com/in/a").urlColumn).toBe(1);
    expect(readConnections("Name,profile_url\nA,https://www.linkedin.com/in/a").urlColumn).toBe(1);
  });

  it("reports no column rather than guessing when nothing looks like one", () => {
    const file = readConnections("alpha,beta\n1,2");
    expect(file.urlColumn).toBe(-1);
    expect(file.headers).toEqual(["alpha", "beta"]);
  });

  it("gives back an empty file rather than throwing on rubbish", () => {
    const file = readConnections("");
    expect(file.rows).toEqual([]);
    expect(file.urlColumn).toBe(-1);
  });
});

describe("entriesFrom", () => {
  const file = readConnections(REAL);

  it("takes the usable rows and counts the rest by reason", () => {
    const { entries, counts } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(entries.map((e) => e.slug)).toEqual(["aoife-ni-bhriain-1a2b3c", "cormac-o-suilleabhain"]);
    expect(counts).toEqual({ rows: 3, used: 2, empty: 1, legacyPub: 0, notAProfile: 0, duplicate: 0 });
  });

  it("builds the label from the name columns and never from the wire", () => {
    const { entries } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(entries[0].label).toBe("Aoife Ni Bhriain");
  });

  it("falls back to the slug when there are no name columns", () => {
    const bare = readConnections("URL\nhttps://www.linkedin.com/in/a-b-1c");
    const { entries } = entriesFrom(bare, bare.urlColumn, bare.nameColumns);
    expect(entries[0].label).toBe("a-b-1c");
  });

  it("counts a duplicate once and keeps the first label", () => {
    const dupes = readConnections(
      [
        "First Name,Last Name,URL",
        "Aoife,One,https://www.linkedin.com/in/aoife-x",
        "Aoife,Two,https://www.linkedin.com/in/aoife-x/?trk=b",
      ].join("\n"),
    );
    const { entries, counts } = entriesFrom(dupes, dupes.urlColumn, dupes.nameColumns);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Aoife One");
    expect(counts.duplicate).toBe(1);
  });

  it("counts an old /pub/ link and a foreign URL under their own reasons", () => {
    const mixed = readConnections(
      [
        "URL",
        "https://www.linkedin.com/pub/john-smith/1/2a/3b4",
        "https://example.com/in/nope",
        "https://www.linkedin.com/in/real-one",
      ].join("\n"),
    );
    const { counts } = entriesFrom(mixed, mixed.urlColumn, mixed.nameColumns);
    expect(counts).toMatchObject({ rows: 3, used: 1, legacyPub: 1, notAProfile: 1 });
  });

  it("returns nothing at all when handed a column index that is not there", () => {
    expect(entriesFrom(file, 99, null).entries).toEqual([]);
  });

  it("names the floor a caller checks against", () => {
    expect(MIN_USABLE_ROWS).toBe(5);
  });
});
