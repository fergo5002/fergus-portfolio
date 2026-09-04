import { describe, it, expect } from "vitest";
import { buildReference } from "./reference";
import { MIN_PROFILE_WORDS, profileOf, relativeFrequencies, zScores } from "./profile";
import { words } from "./text";

/** Six documents whose "and" and "here" rates vary, so both survive both filters. */
function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);

describe("the fixture reference", () => {
  it("keeps only the two words that vary", () => {
    expect([...ref.markers].sort()).toEqual(["and", "here"]);
  });
});

describe("relativeFrequencies", () => {
  it("divides each marker's count by the total tokens", () => {
    const freq = relativeFrequencies(words("and and here there"), ["and", "here"]);
    expect(freq.and).toBeCloseTo(0.5, 10);
    expect(freq.here).toBeCloseTo(0.25, 10);
  });

  it("gives a marker that never appears a frequency of zero, not undefined", () => {
    expect(relativeFrequencies(words("nothing relevant"), ["and"])).toEqual({ and: 0 });
  });

  it("returns zeroes for an empty token list rather than dividing by zero", () => {
    expect(relativeFrequencies([], ["and", "here"])).toEqual({ and: 0, here: 0 });
  });
});

describe("zScores", () => {
  it("is the distance from the reference mean in reference standard deviations", () => {
    const freq = { and: ref.mean.and + 2 * ref.sd.and, here: ref.mean.here };
    const z = zScores(freq, ref);
    expect(z.and).toBeCloseTo(2, 10);
    expect(z.here).toBeCloseTo(0, 10);
  });

  it("covers every marker and nothing else", () => {
    expect(Object.keys(zScores({}, ref)).sort()).toEqual([...ref.markers].sort());
  });
});

describe("profileOf", () => {
  it("pools the pieces rather than averaging them", () => {
    // Pooled: 2 "and" in 7 tokens. Averaged it would be the mean of 1/2 and 1/5.
    const pooled = profileOf(["and here", "here here and here here"], ref);
    expect(pooled.words).toBe(7);
    expect(pooled.freq.and).toBeCloseTo(2 / 7, 10);
  });

  it("counts the pieces it was given, ignoring blank ones", () => {
    expect(profileOf(["one thing", "   ", "another thing"], ref).pieces).toBe(2);
  });

  it("carries the rhythm, punctuation, joins and pair counts", () => {
    const p = profileOf(["And it works; it does. We use it."], ref);
    expect(p.rhythm.sentences).toBe(2);
    expect(p.punctuation.semicolon).toBeGreaterThan(0);
    expect(p.joins.and).toBeCloseTo(0.5, 10);
    expect(p.pairs.utilise).toEqual({ formal: 0, plain: 1 });
  });

  it("stamps its version, so a stored profile from a later shape is refusable", () => {
    expect(profileOf(["anything at all"], ref).version).toBe(1);
  });

  it("survives an empty profile without producing NaN", () => {
    const empty = profileOf([], ref);
    expect(empty.words).toBe(0);
    expect(empty.pieces).toBe(0);
    for (const value of Object.values(empty.z)) expect(Number.isFinite(value)).toBe(true);
  });

  it("states a floor for a profile worth trusting", () => {
    expect(MIN_PROFILE_WORDS).toBe(1000);
  });

  it("sits at the centre of a reference built from its own pieces", () => {
    // The real flow: the same pieces build the table and the profile. Every
    // z-score is then zero or near it by construction, which is what makes the
    // Delta readable as roughly the draft's mean absolute z-score. These
    // fixture pieces are all 240 words, so pooling and the reference mean agree
    // exactly and the answer is 0. Real pieces differ in length, pooling
    // weights by that length, and the profile lands near the centre instead of
    // on it, which is why the assertion below is a closeness and not an
    // equality.
    const pieces = [doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)];
    const own = buildReference(pieces);
    const p = profileOf(pieces, own);
    for (const marker of own.markers) expect(p.z[marker], marker).toBeCloseTo(0, 10);
  });

  it("moves off that centre when the pieces are different lengths", () => {
    const pieces = [doc(1), doc(6), `${doc(6)} ${doc(6)}`, doc(2), doc(3), doc(4)];
    const own = buildReference(pieces);
    const p = profileOf(pieces, own);
    const away = own.markers.some((marker) => Math.abs(p.z[marker]) > 0.01);
    expect(away).toBe(true);
  });
});
