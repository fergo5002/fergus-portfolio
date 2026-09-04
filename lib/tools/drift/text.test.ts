import { describe, it, expect } from "vitest";
import { sentences, splitPieces, wordCount, words } from "./text";

describe("words", () => {
  it("lowercases and drops punctuation", () => {
    expect(words("The Quick, brown fox.")).toEqual(["the", "quick", "brown", "fox"]);
  });

  it("keeps an apostrophe inside a word and normalises the curly one", () => {
    expect(words("don't. It’s fine")).toEqual(["don't", "it's", "fine"]);
  });

  it("drops bare numbers, so a table of figures cannot shift a frequency", () => {
    expect(words("we shipped 12 of 15 in 2026")).toEqual(["we", "shipped", "of", "in"]);
  });

  it("keeps accented letters as one word", () => {
    expect(words("café naïve")).toEqual(["café", "naïve"]);
  });

  it("returns nothing for empty and whitespace-only input", () => {
    expect(words("")).toEqual([]);
    expect(words("   \n  ")).toEqual([]);
    expect(wordCount("")).toBe(0);
  });
});

describe("sentences", () => {
  it("splits on terminators and keeps the offset of each", () => {
    const list = sentences("One two. Three four! Five?");
    expect(list.map((s) => s.text)).toEqual(["One two.", "Three four!", "Five?"]);
    expect(list.map((s) => s.words.length)).toEqual([2, 2, 1]);
    expect(list[1].start).toBe(9);
  });

  it("keeps a closing quote or bracket with its sentence", () => {
    expect(sentences('He said "no." Then he left.').map((s) => s.text)).toEqual([
      'He said "no."',
      "Then he left.",
    ]);
  });

  it("treats a trailing fragment with no terminator as a sentence", () => {
    expect(sentences("Done. And one more").map((s) => s.text)).toEqual(["Done.", "And one more"]);
  });

  it("is naive about abbreviations, which the page says out loud", () => {
    // Not a bug being tested in: a real abbreviation list is a dictionary, and
    // the tool would rather state the limit than pretend to a lexicon.
    expect(sentences("Ask Dr. Byrne.").map((s) => s.text)).toEqual(["Ask Dr.", "Byrne."]);
  });

  it("returns nothing for empty input", () => {
    expect(sentences("")).toEqual([]);
    expect(sentences("   ")).toEqual([]);
  });
});

describe("splitPieces", () => {
  it("splits on a line of three or more dashes and drops the empties", () => {
    expect(splitPieces("one\n---\ntwo\n-----\n\n\nthree\n---\n   ")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("treats text with no separator as one piece", () => {
    expect(splitPieces("just the one")).toEqual(["just the one"]);
  });

  it("returns nothing for empty input", () => {
    expect(splitPieces("")).toEqual([]);
    expect(splitPieces("---")).toEqual([]);
  });
});
