import { describe, expect, it } from "vitest";
import { draftReadiness, profileReadiness, MAX_DRAFT_CHARS, MAX_SAMPLES_CHARS } from "./readiness";

describe("Drift readiness", () => {
  it("counts separate pieces and words with the tool's tokeniser", () => {
    expect(profileReadiness("Hello there.\n---\nOne more piece.")).toMatchObject({ pieces: 2, words: 5, enoughPieces: false, bounded: true });
    expect(profileReadiness(Array(5).fill("word ".repeat(200)).join("\n---\n")))
      .toMatchObject({ pieces: 5, words: 1000, enoughPieces: true, enoughWords: true });
  });
  it("uses the existing 150-word draft floor", () => {
    expect(draftReadiness("word ".repeat(149)).ready).toBe(false);
    expect(draftReadiness("word ".repeat(150)).ready).toBe(true);
  });
  it("refuses oversized text before counting or analysing", () => {
    expect(profileReadiness("a".repeat(MAX_SAMPLES_CHARS + 1)).bounded).toBe(false);
    expect(draftReadiness("a".repeat(MAX_DRAFT_CHARS + 1)).bounded).toBe(false);
    expect(profileReadiness(Array(51).fill("A piece.").join("\n---\n")).bounded).toBe(false);
  });
});
