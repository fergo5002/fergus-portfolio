import { describe, expect, it } from "vitest";
import { compareLists, connectionsCsv, readLocalList } from "./local";

describe("local connection comparison", () => {
  it("matches profile identities, deduplicates, and keeps each side's names", () => {
    const result = compareLists(
      [{ slug: "a", label: "Alice" }, { slug: "a", label: "Alice again" }, { slug: "b", label: "Bob" }],
      [{ slug: "a", label: "A. Byrne" }, { slug: "c", label: "Cara" }],
    );
    expect(result.shared).toEqual([{ slug: "a", label: "Alice" }]);
    expect(result.onlyA.map(e => e.slug)).toEqual(["b"]);
    expect(result.onlyB.map(e => e.slug)).toEqual(["c"]);
    expect(result.union).toBe(3);
    expect(result.similarity).toBeCloseTo(1 / 3);
  });
  it("handles empty lists without NaN", () => {
    expect(compareLists([], []).similarity).toBe(0);
  });
  it("reads real export preambles and rejects files with no usable profiles", () => {
    expect(readLocalList('Notes:\nExport\n\nFirst Name,Last Name,URL\nAlice,Byrne,https://www.linkedin.com/in/alice/').entries)
      .toEqual([{ slug: "alice", label: "Alice Byrne" }]);
    expect(() => readLocalList("date,amount\n2026-01-01,40")).toThrow();
  });
  it("bounds input before parsing", () => {
    expect(() => readLocalList("x".repeat(5 * 1024 * 1024 + 1))).toThrow();
  });
  it("quotes names and neutralises spreadsheet formulas in downloaded lists", () => {
    const csv = connectionsCsv([{ slug: "alice", label: '=HYPERLINK("bad")' }, { slug: "bob", label: "Bob, Byrne" }]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Bob, Byrne"');
    expect(csv).toContain("https://www.linkedin.com/in/alice");
  });
});
