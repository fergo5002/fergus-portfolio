import { describe, expect, it } from "vitest";
import { overlap, overlapCopy } from "@/content/tools/overlap";

/**
 * The copy guard.
 *
 * Every other test in this tool checks that the code does what the page says.
 * This one checks the page says the right thing, because the central risk here
 * is not a bug, it is a sentence that oversells what a salted hash buys. A
 * salted hash of a profile slug is not a commitment against the peer, who
 * holds the salt and can grind a dictionary of plausible slugs against it.
 *
 * There is a mutation row on this file. Softening the paragraph is meant to
 * turn the suite red.
 */

const everything = [
  overlap.name,
  overlap.blurb,
  overlap.privacyNote ?? "",
  ...overlap.cantSee,
  ...JSON.stringify(overlapCopy).split('","'),
].join(" \n ");

describe("overlap copy", () => {
  it("never claims more than a salted hash buys", () => {
    for (const banned of [
      /cryptographically (private|secure)/i,
      /zero[- ]?knowledge/i,
      /end[- ]to[- ]end encrypted/i,
      /\banonymous\b/i,
      /military[- ]grade/i,
      /completely private/i,
    ]) {
      expect(everything, `banned phrase ${banned}`).not.toMatch(banned);
    }
  });

  it("makes the one claim it is allowed to make, in those words", () => {
    expect(everything).toContain(
      "your list never leaves your browser, and the person you are comparing with sees only hashes",
    );
  });

  it("says what a salted hash does not do", () => {
    expect(overlapCopy.honesty.notPsi).toContain("not a private set intersection protocol");
    expect(overlapCopy.honesty.notPsi).toContain("holds the same salt");
    expect(overlapCopy.honesty.notPsi).toContain("chosen to compare notes");
  });

  it("names the three things the other side actually learns", () => {
    expect(overlapCopy.honesty.theyLearn).toContain("IP address");
    expect(overlapCopy.honesty.theyLearn).toContain("how many connections");
  });

  it("says the safety string is useless unless it is read aloud", () => {
    expect(overlapCopy.honesty.safety).toContain("read them aloud");
  });

  it("tells the visitor that nothing is written to their machine", () => {
    expect(overlapCopy.honesty.storage).toContain("forget");
    expect(overlapCopy.honesty.storage).toContain("nothing");
  });

  it("tells the visitor how to get the file", () => {
    expect(overlapCopy.export.how).toContain("Get a copy of your data");
    expect(overlapCopy.export.link).toBe("https://www.linkedin.com/mypreferences/d/download-my-data");
  });

  it("is a browser tool with a note about the one server part", () => {
    expect(overlap.privacy).toBe("browser");
    expect(overlap.privacyNote).toContain("room code");
  });
});
