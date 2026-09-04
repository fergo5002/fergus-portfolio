import { describe, it, expect } from "vitest";
import {
  MARKER_COUNT,
  MIN_DOCUMENT_SHARE,
  MIN_REFERENCE_DOCUMENTS,
  buildReference,
} from "./reference";

/** Six documents, so the at-least-half threshold is three and a word in two is under it. */
function docs(...bodies: string[]): string[] {
  return bodies;
}

describe("the constants", () => {
  it("filters on a share of the documents, not a fixed count", () => {
    // A count written for eleven articles would keep nothing at all from five
    // pasted pieces. The threshold has to scale with what the visitor gave.
    expect(MIN_DOCUMENT_SHARE).toBe(0.5);
    expect(Math.ceil(11 * MIN_DOCUMENT_SHARE)).toBe(6);
    expect(Math.ceil(5 * MIN_DOCUMENT_SHARE)).toBe(3);
  });

  it("floors the population at five, where ceil-half is a strict majority", () => {
    expect(MIN_REFERENCE_DOCUMENTS).toBe(5);
    expect(Math.ceil(MIN_REFERENCE_DOCUMENTS * MIN_DOCUMENT_SHARE)).toBeGreaterThan(
      MIN_REFERENCE_DOCUMENTS / 2,
    );
    // Four documents: the threshold is two, which is exactly half and filters
    // nothing. That is the argument for five, written as an assertion.
    expect(Math.ceil(4 * MIN_DOCUMENT_SHARE)).toBe(4 / 2);
  });
});

describe("buildReference", () => {
  it("ranks markers by total frequency across the documents", () => {
    // "the" appears 10 times and "a" 8, both in all six documents and both
    // varying between them. "cat", "dog" and "bird" appear exactly once in
    // every document, so their standard deviation is zero and they are dropped
    // by the guard two tests below.
    const ref = buildReference(
      docs(
        "the cat the dog a bird",
        "the cat the dog a bird",
        "the cat a dog a bird",
        "the cat the dog a bird",
        "the cat the dog a bird",
        "the cat a dog a bird",
      ),
    );
    expect(ref.markers[0]).toBe("the");
    expect(ref.markers).toContain("a");
    expect(ref.documents).toBe(6);
    expect(ref.totalWords).toBe(36);
  });

  it("drops a word that appears in fewer than half the documents", () => {
    // "zeugma" is frequent, but only in one document. A standard deviation from
    // one non-zero reading is an accident, not a habit.
    const ref = buildReference(
      docs(
        "zeugma zeugma zeugma zeugma zeugma the cat",
        "the cat a dog",
        "the cat a dog",
        "the cat a dog",
        "the cat a dog",
        "the cat a bird",
      ),
    );
    expect(ref.markers).not.toContain("zeugma");
    expect(ref.markers).toContain("the");
  });

  it("scales that filter to the number of documents it was given", () => {
    // Five pieces, so the threshold is three. "here" is in three of them and
    // survives; "zeugma" is in two and does not. On eleven documents the same
    // rule asks for six, which is what the site's corpus test checks.
    const ref = buildReference(
      docs(
        "the cat and a dog here",
        "the cat and a dog here",
        "the cat and a bird here",
        "the cat and a fish zeugma",
        "the cat and a fish zeugma",
      ),
    );
    expect(ref.documents).toBe(5);
    expect(ref.markers).toContain("here");
    expect(ref.markers).not.toContain("zeugma");
  });

  it("drops a word whose frequency never varies, because its z-score is a division by zero", () => {
    // "the" is exactly one of two words in every document, so its standard
    // deviation is 0. Keeping it would put Infinity into every Delta.
    const ref = buildReference(docs("the cat", "the dog", "the bird", "the fish", "the cat", "the dog"));
    expect(ref.markers).not.toContain("the");
    for (const w of ref.markers) expect(ref.sd[w], w).toBeGreaterThan(0);
  });

  it("never returns more than MARKER_COUNT markers", () => {
    const many = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const ref = buildReference(docs(many, `${many} extra`, many, `${many} extra`, many, `${many} extra`));
    expect(ref.markers.length).toBeLessThanOrEqual(MARKER_COUNT);
  });

  it("gives every marker a finite mean and a positive standard deviation", () => {
    const ref = buildReference(
      docs(
        "the cat sat on the mat and the dog watched",
        "a cat and a dog and the mat",
        "the dog sat and the cat watched the mat",
        "and the mat and a dog and a cat",
        "the cat and the dog on a mat",
        "a dog and the cat and the mat",
      ),
    );
    expect(ref.markers.length).toBeGreaterThan(0);
    for (const w of ref.markers) {
      expect(Number.isFinite(ref.mean[w]), w).toBe(true);
      expect(ref.sd[w], w).toBeGreaterThan(0);
    }
  });

  it("returns an empty marker set for an empty population rather than throwing", () => {
    // A visitor who pastes nothing must not crash the tab. The report's own
    // guard is what stops an empty marker set being printed as a distance of
    // zero, which would read as "identical" and mean nothing at all.
    expect(buildReference([]).markers).toEqual([]);
    expect(buildReference([]).documents).toBe(0);
    expect(buildReference(["", "", "", "", "", ""]).markers).toEqual([]);
  });

  it("is a pure function of its argument, so two callers never share a table", () => {
    const a = buildReference(docs("the cat and a dog here", "the cat and a dog", "the cat and a bird here"));
    const b = buildReference(docs("one two three", "one two four", "one two five"));
    expect(a.markers).not.toEqual(b.markers);
  });
});
