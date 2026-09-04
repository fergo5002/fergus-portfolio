import { describe, it, expect } from "vitest";
import { METRIC_KEYS } from "@/lib/tools/drift/report";
import { PAIRS } from "@/lib/tools/drift/substitutions";
import { MIN_DELTA_WORDS } from "@/lib/tools/drift/delta";
import { MIN_REFERENCE_DOCUMENTS } from "@/lib/tools/drift/reference";
import { wordCount } from "@/lib/tools/drift/text";
import { toolBySlug } from "./index";
import { drift, driftCopy, driftDemo } from "./drift";

describe("the registry entry", () => {
  it("is registered and live", () => {
    expect(toolBySlug("drift")).toBe(drift);
    expect(drift.status).toBe("live");
    expect(drift.privacy).toBe("browser");
  });

  it("says what it is not, first, because that is the whole framing", () => {
    // The blurb is the lede `ToolPage` renders straight under the heading, so
    // this sentence is the first line of body copy on the page.
    expect(drift.blurb.startsWith("This is not an AI detector.")).toBe(true);
  });

  it("names the things it cannot see", () => {
    const joined = drift.cantSee.join(" ").toLowerCase();
    expect(joined).toContain("meaning");
    expect(joined).toContain("register");
    expect(joined).toContain("150 words");
    expect(joined).toContain("five pieces");
    expect(joined).toContain("praise");
  });
});

describe("the copy", () => {
  it("has a label for every metric the report can emit, and no orphans", () => {
    expect(Object.keys(driftCopy.metricLabels).sort()).toEqual([...METRIC_KEYS].sort());
  });

  it("has a label for every pull reason", () => {
    expect(Object.keys(driftCopy.reasonLabels).sort()).toEqual(["em-dash", "long", "substitution"]);
  });

  it("names the visitor's own pieces as the reference population, not this site's", () => {
    // The distance is in units of how much THEIR writing varies. A note
    // pointing at /writing here would be describing a measurement the tool does
    // not make, and it would read as though the yardstick were mine.
    expect(driftCopy.referenceNote.toLowerCase()).toContain("your");
    expect(driftCopy.referenceNote).not.toContain("/writing");
  });

  it("keeps this site's articles in the demo note, where they belong", () => {
    expect(driftCopy.demoNote).toContain("/writing");
    expect(driftCopy.demoNote.toLowerCase()).toContain("example");
    expect(driftCopy.demoNote).not.toMatch(/everything on screen/i);
  });

  it("says the substitution list is fixed and how long it is", () => {
    expect(driftCopy.substitutionNote).toContain(String(PAIRS.length));
  });

  it("quotes both floors from their constants rather than retyping them", () => {
    expect(driftCopy.tooShort).toContain(String(MIN_DELTA_WORDS));
    expect(driftCopy.tooFewPieces).toContain(String(MIN_REFERENCE_DOCUMENTS));
  });

  it("says what a saved profile holds, in words that survived the marker change", () => {
    // It used to be true that a saved profile held none of the visitor's words.
    // The markers are theirs now, so the promise is narrower and has to say so.
    expect(driftCopy.savedContents.toLowerCase()).toContain("word");
    expect(driftCopy.savedContents.toLowerCase()).toContain("no sentence");
    expect(driftCopy.savedContents).not.toMatch(/your hundred commonest/i);
  });

  it("does not turn missing evidence into a conclusion", () => {
    expect(driftCopy.noPulls).not.toMatch(/spread evenly/i);
    expect(driftCopy.noSubstitutions).not.toMatch(/every word.*you use/i);
    expect(driftCopy.substitutionsHeading).toMatch(/samples/i);
    expect(
      driftCopy.substitutionRow({
        id: "utilise",
        formal: "utilise",
        plain: "use",
        profilePlain: 3,
        draftCount: 1,
      }),
    ).toContain('These samples never use "utilise"');
  });

  it("labels its uncalibrated floors as conservative choices", () => {
    expect(driftCopy.samplesHint).toMatch(/conservative|rule of thumb|starting point/i);
    expect(driftCopy.draftHint).toMatch(/conservative|rule of thumb|starting point/i);
    expect(driftCopy.thinProfile).toMatch(/conservative|rule of thumb|starting point/i);
    expect(driftCopy.tooShort).toMatch(/conservative|rule of thumb|starting point/i);
  });
});

describe("the demo draft", () => {
  it("clears the floor, so the worked example shows a real distance", () => {
    expect(wordCount(driftDemo.draft)).toBeGreaterThan(MIN_DELTA_WORDS);
  });

  it("carries the em dashes it is meant to demonstrate", () => {
    // Deliberately outside the house-style lint: it is a specimen of the thing
    // the lint exists to stop, written with escapes so the source-tree scan in
    // `content/voice.test.ts` stays green. If this ever reads zero, somebody
    // has tidied the demo and taken its point with it.
    expect([...driftDemo.draft.matchAll(/—/g)]).toHaveLength(2);
  });

  it("uses words the site's own corpus never uses", () => {
    for (const word of ["utilise", "leverage", "seamless", "delve"]) {
      expect(driftDemo.draft.toLowerCase(), word).toContain(word);
    }
  });
});
