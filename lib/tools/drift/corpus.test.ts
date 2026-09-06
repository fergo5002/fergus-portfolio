import { describe, it, expect } from "vitest";
import { MARKER_COUNT, MIN_DOCUMENT_SHARE, MIN_REFERENCE_DOCUMENTS } from "./reference";
import { referenceDocuments, siteReference } from "./corpus";
import { words } from "./text";
import { articles } from "@/content/articles";
import { toPlainText } from "@/lib/markdown";
import { driftDemo } from "@/content/tools/drift";
import { selfSpread } from "./delta";
import { profileOf } from "./profile";
import { analyse } from "./report";

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
    expect(documents).toEqual(articles.map((article) => toPlainText(article.body)));
    // toPlainText drops fenced code, so no article body reaches the corpus with
    // a listing in it. If this starts failing, the markdown parser changed.
    expect(documents.join(" ")).not.toContain("```");
  });

  it("produces a usable marker set from it", () => {
    const ref = siteReference();
    expect(ref.markers.length).toBeGreaterThan(0);
    expect(ref.markers.length).toBeLessThanOrEqual(MARKER_COUNT);
    expect(ref.documents).toBe(referenceDocuments().length);
    expect(ref.totalWords).toBe(referenceDocuments().reduce((sum, doc) => sum + words(doc).length, 0));
    // The commonest words of English prose. If the top of this list stops
    // looking like function words, the tokeniser or the corpus has changed.
    expect(ref.markers.slice(0, 10)).toContain("the");
    expect(ref.markers.slice(0, 10)).toContain("and");
  });

  it("is memoised, so the build pays for it once", () => {
    expect(siteReference()).toBe(siteReference());
  });

  it("keeps every marker in at least half the articles", () => {
    // The reference follows the published collection, including editorial cuts.
    const documents = referenceDocuments();
    const needed = Math.ceil(documents.length * MIN_DOCUMENT_SHARE);
    const sets = documents.map((d) => new Set(words(d)));
    for (const w of siteReference().markers) {
      const seen = sets.filter((set) => set.has(w)).length;
      expect(seen, `${w} appears in ${seen} documents`).toBeGreaterThanOrEqual(needed);
    }
  });

  it("clears the document floor, so the demo is not itself a refusal", () => {
    expect(siteReference().documents).toBeGreaterThanOrEqual(MIN_REFERENCE_DOCUMENTS);
    const reference = siteReference();
    const documents = referenceDocuments();
    const report = analyse(
      profileOf(documents, reference), driftDemo.draft, reference, selfSpread(documents, reference),
    );
    expect(report.status).toBe("ok");
    expect(report.delta).not.toBeNull();
    expect(Number.isFinite(report.delta)).toBe(true);
  });
});
