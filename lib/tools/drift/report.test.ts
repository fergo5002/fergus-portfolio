import { describe, it, expect } from "vitest";
import { MIN_REFERENCE_DOCUMENTS, buildReference } from "./reference";
import { MIN_DELTA_WORDS } from "./delta";
import { profileOf } from "./profile";
import { BUCKET_KEYS, METRIC_KEYS, analyse, sentencePulls } from "./report";
import { BUCKET_EDGES } from "./signals";
import { wordCount } from "./text";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);
const profile = profileOf([doc(1)], ref);

/** 180 words: twenty sentences leaning on "and", ten leaning on "here". */
const draft = [
  ...Array.from({ length: 20 }, () => "And the cat was a thing."),
  ...Array.from({ length: 10 }, () => "The cat was a thing here."),
].join(" ");

describe("the bucket labels", () => {
  it("are derived from the edges, so the two cannot drift apart", () => {
    expect(BUCKET_KEYS).toEqual(["1-8", "9-16", "17-24", "25-32", "33+"]);
    expect(BUCKET_KEYS).toHaveLength(BUCKET_EDGES.length + 1);
  });
});

describe("analyse under the word floor", () => {
  const short = "We utilise the thing — briefly.";

  it("refuses every statistic and says which floor it refused against", () => {
    const report = analyse(profile, short, ref);
    expect(report.status).toBe("too-short");
    expect(report.floor).toBe(MIN_DELTA_WORDS);
    expect(report.words).toBe(wordCount(short));
    expect(report.delta).toBeNull();
    expect(report.selfSpread).toBeNull();
    expect(report.metrics).toEqual([]);
    expect(report.shape).toEqual([]);
    expect(report.pulls).toEqual([]);
  });

  it("still reports the counts, because a count is a count at any length", () => {
    const withPlain = profileOf(["We use it. We use it again. It is used daily."], ref);
    const report = analyse(withPlain, short, ref);
    expect(report.emDashes).toBe(1);
    expect(report.substitutions.map((s) => s.id)).toEqual(["utilise"]);
  });

  it("is checked before the population's thinness, because it refuses more", () => {
    const thin = buildReference([doc(1), doc(3), doc(6)]);
    expect(analyse(profileOf([doc(1)], thin), short, thin).status).toBe("too-short");
  });
});

describe("analyse under the document floor", () => {
  const pieces = [doc(1), doc(3), doc(6)];
  const thin = buildReference(pieces);
  const thinProfile = profileOf(pieces, thin);

  it("refuses a distance built on fewer than MIN_REFERENCE_DOCUMENTS pieces", () => {
    const report = analyse(thinProfile, draft, thin, { pieces: 3, min: 0.2, median: 0.4, max: 0.9 });
    expect(report.status).toBe("thin-reference");
    expect(report.documentFloor).toBe(MIN_REFERENCE_DOCUMENTS);
    expect(report.reference.documents).toBe(3);
    expect(report.delta).toBeNull();
    // The spread is dropped even though one was handed in: it is leave-one-out
    // Deltas, so it is measured in the same units the refusal just rejected.
    expect(report.selfSpread).toBeNull();
    expect(report.pulls).toEqual([]);
  });

  it("keeps the habits, because none of them ever needed a reference population", () => {
    const report = analyse(thinProfile, draft, thin);
    expect(report.metrics.map((m) => m.key)).toEqual([...METRIC_KEYS]);
    expect(report.shape.map((s) => s.key)).toEqual([...BUCKET_KEYS]);
    expect(report.emDashes).toBe(0);
  });

  it("refuses an empty marker set too, so a Delta of zero is never printed", () => {
    // Every word in these documents has the same rate in all of them, so every
    // one is dropped by the sd guard and the marker set comes back empty. The
    // Delta would be 0, which on a page reads as "identical".
    const flat = buildReference(["the cat", "the cat", "the cat", "the cat", "the cat"]);
    expect(flat.markers).toEqual([]);
    expect(flat.documents).toBeGreaterThanOrEqual(MIN_REFERENCE_DOCUMENTS);
    const report = analyse(profileOf(["the cat"], flat), draft, flat);
    expect(report.status).toBe("thin-reference");
    expect(report.delta).toBeNull();
  });
});

describe("analyse over both floors", () => {
  it("prints a distance and every metric row exactly once, in order", () => {
    const report = analyse(profile, draft, ref);
    expect(report.status).toBe("ok");
    expect(report.words).toBeGreaterThanOrEqual(MIN_DELTA_WORDS);
    expect(report.delta).not.toBeNull();
    expect(Number.isFinite(report.delta ?? NaN)).toBe(true);
    expect(report.metrics.map((m) => m.key)).toEqual([...METRIC_KEYS]);
    expect(report.shape.map((s) => s.key)).toEqual([...BUCKET_KEYS]);
  });

  it("says what the population it measured against was made of", () => {
    const report = analyse(profile, draft, ref);
    expect(report.reference.documents).toBe(6);
    expect(report.reference.markers).toBe(ref.markers.length);
    expect(report.reference.totalWords).toBe(ref.totalWords);
  });

  it("puts the profile and the draft side by side in every row", () => {
    const report = analyse(profile, draft, ref);
    const join = report.metrics.find((m) => m.key === "join-and");
    expect(join?.profile).toBeCloseTo(1 / 40, 10);
    expect(join?.draft).toBeCloseTo(20 / 30, 10);
  });

  it("passes a self-spread through untouched when it is given one", () => {
    const spread = { pieces: 3, min: 0.2, median: 0.4, max: 0.9 };
    expect(analyse(profile, draft, ref, spread).selfSpread).toEqual(spread);
  });
});

describe("sentencePulls", () => {
  it("blames only the sentences carrying words the draft overuses", () => {
    // The draft leans on "and" and uses "here" less than the profile does.
    // A sentence containing an underused word is not the reason it is
    // underused, so it must not be listed at all.
    const pulls = sentencePulls(profile, draft, ref);
    expect(pulls.length).toBeGreaterThan(0);
    for (const pull of pulls) expect(pull.text.startsWith("And")).toBe(true);
  });

  it("ranks by pull and caps the list", () => {
    const pulls = sentencePulls(profile, draft, ref, 3);
    expect(pulls).toHaveLength(3);
    expect(pulls[0].pull).toBeGreaterThanOrEqual(pulls[1].pull);
    expect(pulls[0].pull).toBeGreaterThan(0);
  });

  it("names an em dash, a formal word and an unusually long sentence as reasons", () => {
    const flagged = `${draft} We utilise it — ${"very ".repeat(40)}slowly.`;
    const pulls = sentencePulls(profile, flagged, ref, 30);
    const last = pulls.find((p) => p.text.includes("utilise"));
    expect(last?.reasons).toContain("em-dash");
    expect(last?.reasons).toContain("substitution");
    expect(last?.reasons).toContain("long");
  });

  it("returns nothing for a draft with no pull and no reasons", () => {
    // Neither marker is overused here: no "and" at all, and no "here" either,
    // so both signed gaps are negative and nothing is attributed.
    expect(sentencePulls(profile, "The cat was a thing.", ref)).toEqual([]);
  });
});
