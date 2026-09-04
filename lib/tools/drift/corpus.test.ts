import { describe, it, expect } from "vitest";
import { MARKER_COUNT, MIN_DOCUMENT_SHARE } from "./reference";
import { referenceDocuments, siteReference } from "./corpus";
import { words } from "./text";

/**
 * This corpus is the worked example and nothing else.
 *
 * A visitor's Delta is never measured against it: their reference is built in
 * their own tab from their own pieces. What these tests hold is that the demo
 * on the page has something real behind it, which is the only claim this module
 * makes.
 */
describe("the site's own corpus", () => {
  it("is every published article, as plain text", () => {
    const documents = referenceDocuments();
    expect(documents.length).toBeGreaterThanOrEqual(11);
    for (const d of documents) expect(words(d).length).toBeGreaterThan(300);
    // toPlainText drops fenced code, so no article body reaches the corpus with
    // a listing in it. If this starts failing, the markdown parser changed.
    expect(documents.join(" ")).not.toContain("```");
  });

  it("produces a full marker set from it", () => {
    const ref = siteReference();
    expect(ref.markers.length).toBe(MARKER_COUNT);
    expect(ref.documents).toBe(referenceDocuments().length);
    expect(ref.totalWords).toBeGreaterThan(5000);
    // The commonest words of English prose. If the top of this list stops
    // looking like function words, the tokeniser or the corpus has changed.
    expect(ref.markers.slice(0, 10)).toContain("the");
    expect(ref.markers.slice(0, 10)).toContain("and");
  });

  it("is memoised, so the build pays for it once", () => {
    expect(siteReference()).toBe(siteReference());
  });

  it("keeps every marker in at least half the articles", () => {
    // With eleven documents the share rule asks for six, which is the number an
    // earlier draft of this plan hard-coded. So moving to a share did not move
    // the worked example's marker set.
    const documents = referenceDocuments();
    const needed = Math.ceil(documents.length * MIN_DOCUMENT_SHARE);
    expect(needed).toBe(6);
    const sets = documents.map((d) => new Set(words(d)));
    for (const w of siteReference().markers) {
      const seen = sets.filter((set) => set.has(w)).length;
      expect(seen, `${w} appears in ${seen} documents`).toBeGreaterThanOrEqual(needed);
    }
  });

  it("clears the document floor, so the demo is not itself a refusal", () => {
    expect(siteReference().documents).toBeGreaterThanOrEqual(5);
  });
});
