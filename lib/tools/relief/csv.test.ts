import { describe, it, expect } from "vitest";
import { MS_WEEK, WEEKS } from "./types";
import { dateColumnGuess, eventsFromCsv, parseCsv, parseWhen } from "./csv";

describe("parseCsv", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("a,b\n1,2\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps a comma inside quotes", () => {
    expect(parseCsv('a,b\n"one, two",3').rows).toEqual([["one, two", "3"]]);
  });

  it("keeps a newline inside quotes", () => {
    expect(parseCsv('a,b\n"one\ntwo",3').rows).toEqual([["one\ntwo", "3"]]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('a\n"he said ""no"""').rows).toEqual([['he said "no"']]);
  });

  it("survives CRLF, which is what a spreadsheet exports on Windows", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([["1", "2"]]);
  });

  it("strips a UTF-8 byte order mark, which Excel writes and nothing else expects", () => {
    expect(parseCsv("﻿date,n\n2026-01-01,1").headers).toEqual(["date", "n"]);
  });

  it("drops a trailing blank line rather than reading it as a row", () => {
    expect(parseCsv("a\n1\n\n").rows).toEqual([["1"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("parseWhen", () => {
  it("reads an ISO timestamp with an offset and keeps the local hour", () => {
    const p = parseWhen("2026-01-14T21:03:11+01:00");
    expect(p?.hour).toBe(21);
    expect(p?.at).toBe(Date.parse("2026-01-14T21:03:11+01:00"));
  });

  it("keeps the local hour for Z too, which is a zero offset and still local", () => {
    expect(parseWhen("2026-01-14T21:03:11Z")?.hour).toBe(21);
  });

  it("reads a bare timestamp as wall clock, which is what a spreadsheet writes", () => {
    expect(parseWhen("2026-01-14 21:03:11")?.hour).toBe(21);
  });

  it("reads a date with no time as midnight, and says so by putting it in row 0", () => {
    expect(parseWhen("2026-01-14")?.hour).toBe(0);
  });

  it("refuses anything it cannot read rather than guessing a format", () => {
    for (const bad of ["", "not a date", "14/01/2026", "20260114"]) {
      expect(parseWhen(bad), bad).toBeNull();
    }
  });
});

describe("dateColumnGuess", () => {
  it("picks the column that parses most often", () => {
    const headers = ["id", "when", "amount"];
    const rows = [
      ["1", "2026-01-01T09:00:00Z", "10"],
      ["2", "2026-01-02T09:00:00Z", "11"],
    ];
    expect(dateColumnGuess(headers, rows)).toBe(1);
  });

  it("breaks a tie towards the column whose header sounds like a date", () => {
    const headers = ["created", "updated"];
    const rows = [
      ["2026-01-01", "2026-01-01"],
      ["2026-01-02", "2026-01-02"],
    ];
    expect(dateColumnGuess(headers, rows)).toBe(0);
  });

  it("returns -1 when nothing parses, so the page asks rather than guessing", () => {
    expect(dateColumnGuess(["a"], [["x"], ["y"]])).toBe(-1);
  });
});

describe("eventsFromCsv", () => {
  const at = (iso: string) => [iso];

  it("anchors the window on the newest row in the file, not on today", () => {
    const newest = "2024-06-05T12:00:00Z";
    const reading = eventsFromCsv([at(newest), at("2024-06-04T09:00:00Z")], 0);
    expect(reading.endMs).toBe(Date.parse(newest));
    expect(reading.events.map((e) => e.week)).toEqual([WEEKS - 1, WEEKS - 1]);
    // A numeric comparator, because a bare sort() compares as strings and
    // would happily accept [12, 9] as sorted.
    expect(reading.events.map((e) => e.hour).sort((a, b) => a - b)).toEqual([9, 12]);
  });

  it("puts a row a year back in the first column", () => {
    const newest = "2024-06-05T12:00:00Z";
    const old = new Date(Date.parse(newest) - 51 * MS_WEEK).toISOString();
    const reading = eventsFromCsv([at(newest), at(old)], 0);
    expect(reading.events.some((e) => e.week === 0)).toBe(true);
  });

  it("counts what it could not read instead of dropping it quietly", () => {
    const reading = eventsFromCsv([at("2026-01-01T00:00:00Z"), at("nonsense"), []], 0);
    expect(reading.read).toBe(1);
    expect(reading.skipped).toBe(2);
  });

  it("drops a row older than the window and counts it as skipped", () => {
    const newest = "2026-06-05T12:00:00Z";
    const ancient = new Date(Date.parse(newest) - 60 * MS_WEEK).toISOString();
    const reading = eventsFromCsv([at(newest), at(ancient)], 0);
    expect(reading.events).toHaveLength(1);
    expect(reading.skipped).toBe(1);
  });

  it("returns an empty reading for an empty file rather than throwing", () => {
    expect(eventsFromCsv([], 0)).toEqual({ events: [], read: 0, skipped: 0, endMs: 0 });
  });
});
