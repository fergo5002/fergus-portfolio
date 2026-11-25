import { describe, it, expect } from "vitest";
import { MARKER_COUNT, MIN_DOCUMENT_SHARE, MIN_REFERENCE_DOCUMENTS } from "./reference";
import { referenceDocuments, siteReference } from "./corpus";
import { words } from "./text";
import { articles } from "@/content/articles";
import { toPlainText } from "@/lib/markdown";

/**
 * This corpus is the worked example and nothing else.
 *
 * A visitor's Delta is never measured against it: their reference is built in
 * their own tab from their own pieces. What these tests hold is that the demo
 * on the page has something real behind it, which is the only claim this module
 * makes.
 *
 * The numbers below were written for eleven articles, moved to five on
 * 2026-09-13 when Fergus retired seven and commissioned one, and to four on
 * 2026-11-25 when he retired the Presterly post and lowered the floor to keep
 * the demo. Worth knowing before retiring another: `MIN_REFERENCE_DOCUMENTS` is
 * four, so the corpus sits exactly on the floor, and the next retirement takes
 * the demo with it.
 */
describe("the site's own corpus", () => {
  it("uses the long-form articles, leaving short visual notes out of the reference", () => {
    const documents = referenceDocuments();
    expect(documents).toEqual(articles.filter((article) => article.format !== "visual-note").map((article) => toPlainText(article.body)));
    expect(documents.length).toBeGreaterThanOrEqual(MIN_REFERENCE_DOCUMENTS);
    for (const d of documents) expect(words(d).length).toBeGreaterThan(300);
    // toPlainText drops fenced code, so no article body reaches the corpus with
    // a listing in it. If this starts failing, the markdown parser changed.
    expect(documents.join(" ")).not.toContain("```");
  });

  it("produces a full marker set from it", () => {
    const ref = siteReference();
    expect(ref.markers.length).toBe(MARKER_COUNT);
    expect(ref.documents).toBe(referenceDocuments().length);
    // Four articles of 700 to 900 words each since 2026-11-25.
    expect(ref.totalWords).toBeGreaterThan(2500);
    // The commonest words of English prose. If the top of this list stops
    // looking like function words, the tokeniser or the corpus has changed.
    expect(ref.markers.slice(0, 10)).toContain("the");
    expect(ref.markers.slice(0, 10)).toContain("and");
  });

  it("is memoised, so the build pays for it once", () => {
    expect(siteReference()).toBe(siteReference());
  });

  it("keeps every marker in at least half the articles", () => {
    // A share rather than a count, which is what let the corpus go from eleven
    // documents to four without this rule needing a new number: it asks for
    // two now, and it asked for six then.
    const documents = referenceDocuments();
    const needed = Math.ceil(documents.length * MIN_DOCUMENT_SHARE);
    expect(needed).toBe(2);
    const sets = documents.map((d) => new Set(words(d)));
    for (const w of siteReference().markers) {
      const seen = sets.filter((set) => set.has(w)).length;
      expect(seen, `${w} appears in ${seen} documents`).toBeGreaterThanOrEqual(needed);
    }
  });

  it("clears the document floor, so the demo is not itself a refusal", () => {
    expect(siteReference().documents).toBeGreaterThanOrEqual(MIN_REFERENCE_DOCUMENTS);
  });
});
