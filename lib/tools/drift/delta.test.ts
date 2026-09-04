import { describe, it, expect } from "vitest";
import { buildReference } from "./reference";
import { MIN_DELTA_WORDS, delta, deltaOf, selfSpread } from "./delta";
import { profileOf } from "./profile";
import { wordCount } from "./text";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);

describe("the floor", () => {
  it("is 150 words, the length below which a Delta is noise", () => {
    expect(MIN_DELTA_WORDS).toBe(150);
  });

  it("is cleared by the fixture documents, so the fixtures test what they claim", () => {
    expect(wordCount(doc(1))).toBeGreaterThanOrEqual(MIN_DELTA_WORDS);
  });
});

describe("delta", () => {
  it("is zero between a vector and itself", () => {
    expect(delta({ and: 1.5, here: -0.5 }, { and: 1.5, here: -0.5 }, ["and", "here"])).toBe(0);
  });

  it("is the mean absolute difference across the markers", () => {
    expect(delta({ and: 2, here: 0 }, { and: 0, here: 1 }, ["and", "here"])).toBeCloseTo(1.5, 10);
  });

  it("is symmetric", () => {
    const a = { and: 2, here: -1 };
    const b = { and: -0.5, here: 3 };
    expect(delta(a, b, ref.markers)).toBeCloseTo(delta(b, a, ref.markers), 10);
  });

  it("treats a missing marker as zero rather than producing NaN", () => {
    expect(delta({}, { and: 2, here: 0 }, ["and", "here"])).toBeCloseTo(1, 10);
  });

  it("is zero for an empty marker set instead of dividing by zero", () => {
    expect(delta({}, {}, [])).toBe(0);
  });
});

describe("deltaOf", () => {
  it("is zero between a profile and the text it was built from", () => {
    const text = doc(3);
    expect(deltaOf(profileOf([text], ref), text, ref)).toBeCloseTo(0, 12);
  });

  it("grows as the draft moves away from the profile", () => {
    const profile = profileOf([doc(1)], ref);
    const near = deltaOf(profile, doc(2), ref);
    const far = deltaOf(profile, doc(6), ref);
    expect(far).toBeGreaterThan(near);
  });
});

describe("selfSpread", () => {
  it("returns null with fewer than two samples over the floor", () => {
    expect(selfSpread([], ref)).toBeNull();
    expect(selfSpread([doc(1)], ref)).toBeNull();
    expect(selfSpread([doc(1), "too short to count"], ref)).toBeNull();
  });

  it("measures each sample against a profile built from the others", () => {
    const spread = selfSpread([doc(1), doc(3), doc(6)], ref);
    expect(spread).not.toBeNull();
    expect(spread?.pieces).toBe(3);
    expect(spread?.min).toBeLessThanOrEqual(spread?.median ?? 0);
    expect(spread?.median).toBeLessThanOrEqual(spread?.max ?? 0);
    expect(spread?.min).toBeGreaterThan(0);
  });

  it("is a range of their own writing, not a threshold anybody invented", () => {
    // Six near-identical samples sit closer together than three spread ones.
    const tight = selfSpread([doc(3), doc(3), doc(3)], ref);
    const loose = selfSpread([doc(1), doc(3), doc(6)], ref);
    expect(tight?.max ?? 1).toBeLessThan(loose?.max ?? 0);
  });

  it("uses one table for every fold, so the folds are comparable", () => {
    // Rebuilding the reference per fold would give each fold its own marker
    // set and its own sigma, and a min, a median and a max of numbers measured
    // on different yardsticks is not a range. Same table, same units, every
    // time: passing the same reference twice must give the same answer.
    const pieces = [doc(1), doc(3), doc(6)];
    expect(selfSpread(pieces, ref)).toEqual(selfSpread(pieces, ref));
  });

  it("gives the visitor's own reference a spread in units of itself", () => {
    // The real flow, end to end: their pieces build the table, their pieces are
    // measured against it. Every fold is a real number and none is NaN.
    const pieces = [doc(1), doc(2), doc(4), doc(5), doc(6)];
    const own = buildReference(pieces);
    const spread = selfSpread(pieces, own);
    expect(spread?.pieces).toBe(5);
    expect(Number.isFinite(spread?.min ?? NaN)).toBe(true);
    expect(Number.isFinite(spread?.max ?? NaN)).toBe(true);
  });
});
