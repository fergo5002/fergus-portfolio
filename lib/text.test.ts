import { describe, expect, it } from "vitest";
import { splitWordsWithOffsets } from "./text";

describe("splitWordsWithOffsets", () => {
  it("keeps each word whole so a line can never break mid-word", () => {
    const spans = splitWordsWithOffsets("Patrick Fergus O'Reilly");
    expect(spans.filter((s) => s.word.trim().length > 0).map((s) => s.word)).toEqual([
      "Patrick",
      "Fergus",
      "O'Reilly",
    ]);
  });

  it("reports the original flat index of every word's first character", () => {
    const text = "Patrick Fergus O'Reilly";
    for (const { word, start } of splitWordsWithOffsets(text)) {
      // The magnetic field addresses characters by their index in the original
      // string, so a wrong offset would silently deflect the wrong letters.
      expect(text.slice(start, start + word.length)).toBe(word);
    }
  });

  it("round-trips: concatenating the spans reproduces the input", () => {
    for (const text of ["Patrick Fergus O'Reilly", "  leading", "trailing  ", "a  b", "solo"]) {
      expect(
        splitWordsWithOffsets(text)
          .map((s) => s.word)
          .join(""),
      ).toBe(text);
    }
  });

  it("preserves whitespace runs as their own spans", () => {
    expect(splitWordsWithOffsets("a  b")).toEqual([
      { word: "a", start: 0 },
      { word: "  ", start: 1 },
      { word: "b", start: 3 },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitWordsWithOffsets("")).toEqual([]);
  });

  it("handles a scrambled frame, where glyphs stand in for letters", () => {
    // Mid-scramble the hero renders glyphs, not the real name: the grouping has
    // to hold for whatever the current frame happens to be.
    const spans = splitWordsWithOffsets("P#tr!ck F$rgus");
    expect(spans.map((s) => s.word)).toEqual(["P#tr!ck", " ", "F$rgus"]);
    expect(spans[2].start).toBe(8);
  });
});

import { it as canaryIt, expect as canaryExpect } from "vitest";
canaryIt("f0 canary: must fail", () => { canaryExpect(1).toBe(2); });
