import { describe, it, expect } from "vitest";
import { BUCKET_EDGES, countEmDashes, joinsOf, punctuationOf, rhythmOf } from "./signals";

describe("rhythmOf", () => {
  it("counts sentences and their mean length in words", () => {
    const r = rhythmOf("One two three. Four five.");
    expect(r.sentences).toBe(2);
    expect(r.meanWords).toBeCloseTo(2.5, 10);
  });

  it("reports the population standard deviation, so one sentence has none", () => {
    expect(rhythmOf("One two three.").sdWords).toBe(0);
    // Lengths 2 and 4: mean 3, population sd 1.
    expect(rhythmOf("One two. Three four five six.").sdWords).toBeCloseTo(1, 10);
  });

  it("puts each sentence in a bucket and reports the buckets as shares", () => {
    const short = "One two.";
    const long = `${"word ".repeat(40).trim()}.`;
    const r = rhythmOf(`${short} ${long}`);
    expect(r.buckets).toHaveLength(BUCKET_EDGES.length + 1);
    expect(r.buckets[0]).toBeCloseTo(0.5, 10);
    expect(r.buckets[r.buckets.length - 1]).toBeCloseTo(0.5, 10);
    expect(r.buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("returns zeroes for empty input rather than NaN", () => {
    const r = rhythmOf("");
    expect(r.sentences).toBe(0);
    expect(r.meanWords).toBe(0);
    expect(r.sdWords).toBe(0);
    expect(r.buckets.every((b) => b === 0)).toBe(true);
  });
});

describe("punctuationOf", () => {
  it("counts each habit per thousand words", () => {
    // Ten words, one semicolon: 100 per thousand.
    const p = punctuationOf("one two three four five; six seven eight nine ten");
    expect(p.semicolon).toBeCloseTo(100, 10);
    expect(p.exclamation).toBe(0);
  });

  it("counts em dashes and en dashes separately", () => {
    const p = punctuationOf("a — b – c d e f g h i j");
    expect(p.emDash).toBeGreaterThan(0);
    expect(p.enDash).toBeGreaterThan(0);
    expect(p.emDash).toBeCloseTo(p.enDash, 10);
  });

  it("counts a parenthetical as one, not two", () => {
    const p = punctuationOf("one two (three four) five six seven eight nine ten");
    expect(p.parenthetical).toBeCloseTo(100, 10);
  });

  it("counts contractions including the curly apostrophe", () => {
    const p = punctuationOf("don't it’s we'll one two three four five six seven");
    expect(p.contraction).toBeCloseTo(300, 10);
  });

  it("returns zeroes for empty input rather than dividing by zero", () => {
    const p = punctuationOf("");
    for (const value of Object.values(p)) expect(value).toBe(0);
  });
});

describe("joinsOf", () => {
  it("reports the share of sentences opening with and, but or so", () => {
    const j = joinsOf("And one. But two. So three. Four five.");
    expect(j.and).toBeCloseTo(0.25, 10);
    expect(j.but).toBeCloseTo(0.25, 10);
    expect(j.so).toBeCloseTo(0.25, 10);
    expect(j.any).toBeCloseTo(0.75, 10);
  });

  it("only counts the opening word, not the word anywhere in the sentence", () => {
    expect(joinsOf("One and two and three.").and).toBe(0);
  });

  it("returns zeroes for empty input", () => {
    expect(joinsOf("")).toEqual({ and: 0, but: 0, so: 0, any: 0 });
  });
});

describe("countEmDashes", () => {
  it("counts the character, which is what survives under the word floor", () => {
    expect(countEmDashes("a — b — c")).toBe(2);
    expect(countEmDashes("a - b – c")).toBe(0);
  });
});
