import { describe, it, expect } from "vitest";
import { sections, questionPairs, leadParagraph } from "./faq";

/**
 * The extractor that decides what an answer engine can lift off a page.
 *
 * Everything here is asserted against raw markdown rather than against
 * `lib/markdown.ts`'s block types. That is deliberate: this module has one job,
 * which is to answer "if something reads this page looking for a question and
 * an answer, what does it get", and coupling it to the renderer's internals
 * would mean a change to how a paragraph is drawn could silently change what
 * the site publishes as structured data.
 */

const BODY = `Opening line that answers the question before anything else does.

## How does this work?

It works like this, in prose, immediately after the heading.

Second paragraph of the same section.

## What about code?

\`\`\`ts
const x = 1;
\`\`\`

Prose after the fence.

## A statement heading

Not a question, so it is not an FAQ pair.
`;

describe("sections", () => {
  it("splits a body into one section per heading, plus the lead", () => {
    const out = sections(BODY);
    expect(out.map((s) => s.heading)).toEqual([
      null,
      "How does this work?",
      "What about code?",
      "A statement heading",
    ]);
  });

  it("counts words per section without counting fenced code", () => {
    const code = sections(BODY).find((s) => s.heading === "What about code?");
    expect(code?.words).toBeGreaterThan(0);
    // "const x = 1;" must not be reading time.
    expect(code?.words).toBeLessThan(10);
  });

  it("reports whether a section opens with a paragraph", () => {
    const out = sections(BODY);
    expect(out.find((s) => s.heading === "How does this work?")?.opensWithProse).toBe(true);
    expect(out.find((s) => s.heading === "What about code?")?.opensWithProse).toBe(false);
  });

  it("marks question-framed headings", () => {
    const out = sections(BODY).filter((s) => s.heading);
    expect(out.filter((s) => s.isQuestion).map((s) => s.heading)).toEqual([
      "How does this work?",
      "What about code?",
    ]);
  });

  it("handles a body with no headings at all", () => {
    const out = sections("Just one paragraph.");
    expect(out).toHaveLength(1);
    expect(out[0].heading).toBeNull();
    expect(out[0].words).toBe(3);
  });

  it("does not mistake a hash inside a fence for a heading", () => {
    const out = sections("Lead.\n\n```sh\n# not a heading\n```\n\n## Real heading?\n\nYes.\n");
    expect(out.map((s) => s.heading)).toEqual([null, "Real heading?"]);
  });
});

describe("questionPairs", () => {
  it("returns only question-framed headings, with the prose beneath them", () => {
    const pairs = questionPairs(BODY);
    expect(pairs.map((p) => p.question)).toEqual(["How does this work?", "What about code?"]);
    expect(pairs[0].answer).toContain("It works like this");
  });

  it("strips markdown syntax out of the answer", () => {
    const pairs = questionPairs("## Does it?\n\nYes, **really**, see [here](/writing).\n");
    expect(pairs[0].answer).toBe("Yes, really, see here.");
  });

  it("skips a code fence to find the first real prose of an answer", () => {
    const pairs = questionPairs(BODY);
    const code = pairs.find((p) => p.question === "What about code?");
    expect(code?.answer).toBe("Prose after the fence.");
  });

  it("drops a question with nothing under it rather than emitting an empty answer", () => {
    // An FAQPage entry with a blank acceptedAnswer is worse than no entry: it
    // is a machine-readable claim that the page answers a question it does not.
    const pairs = questionPairs("## Unanswered?\n\n## Next?\n\nSomething.\n");
    expect(pairs.map((p) => p.question)).toEqual(["Next?"]);
  });

  it("returns an empty list for a body with no questions", () => {
    expect(questionPairs("## Statement\n\nProse.\n")).toEqual([]);
  });

  it("caps a long answer without cutting mid-word", () => {
    const long = `## Why?\n\n${"word ".repeat(400)}end.\n`;
    const [pair] = questionPairs(long);
    expect(pair.answer.length).toBeLessThanOrEqual(500);
    expect(pair.answer.endsWith(" ")).toBe(false);
    expect(pair.answer).not.toMatch(/wor$/);
  });
});

describe("leadParagraph", () => {
  it("returns the first paragraph before any heading", () => {
    expect(leadParagraph(BODY)).toBe(
      "Opening line that answers the question before anything else does.",
    );
  });

  it("returns an empty string when the body opens on a heading", () => {
    expect(leadParagraph("## Straight in?\n\nYes.\n")).toBe("");
  });

  it("ignores a leading code fence", () => {
    expect(leadParagraph("```ts\nconst x = 1;\n```\n\nThe real lead.\n")).toBe("The real lead.");
  });
});
