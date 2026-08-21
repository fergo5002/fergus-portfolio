/**
 * What an answer engine can lift off a page.
 *
 * The retrieval step that decides whether a page gets cited does not read the
 * page the way a person does. It looks for a question and a self-contained
 * answer sitting next to each other, and it prefers a passage it can quote
 * without the surrounding paragraphs. This module is the site's own view of
 * that: given an article's markdown, what questions does the page visibly
 * answer, and what does the answer say.
 *
 * Two consequences follow, and both are deliberate:
 *
 *  1. **It parses raw markdown, not `lib/markdown.ts`'s blocks.** The renderer
 *     decides how a paragraph is drawn; this module decides what the site
 *     publishes as machine-readable truth. Coupling them would mean a styling
 *     change could quietly alter the structured data, which is the kind of
 *     silent drift `lib/seo.ts` exists to prevent.
 *  2. **A question with nothing under it is dropped.** An `FAQPage` entry with
 *     an empty `acceptedAnswer` is a claim that the page answers a question it
 *     does not, and a wrong machine-readable claim is worse than a missing one.
 *
 * `content/articles.test.ts` uses `sections` as a publishing guard, so a post
 * whose headings cannot be read this way fails the suite rather than shipping.
 */

/** Longest answer published into an `FAQPage`. Past this it stops being a quote. */
const ANSWER_LIMIT = 500;

export type Section = {
  /** The heading text, or `null` for the lead that precedes the first heading. */
  heading: string | null;
  /** Heading depth (2 for `##`), or 0 for the lead. */
  depth: number;
  /** Does the heading read as a question. */
  isQuestion: boolean;
  /** Does a paragraph, rather than a list or a fence, come first. */
  opensWithProse: boolean;
  /** Words of prose, excluding fenced code. */
  words: number;
  /** The raw markdown of the section, heading excluded. */
  body: string;
};

export type QuestionPair = { question: string; answer: string };

/**
 * Split the body on headings, ignoring anything inside a fence.
 *
 * The fence check is not defensive coding. Shell examples begin with `#` and
 * the split-text article ships one, so a naive line-based split would invent a
 * heading called `not a heading` and publish it.
 */
export function sections(body: string): Section[] {
  const lines = body.split("\n");
  const out: Section[] = [];
  let current: { heading: string | null; depth: number; lines: string[] } = {
    heading: null,
    depth: 0,
    lines: [],
  };
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;

    const match = inFence ? null : /^(#{2,6})\s+(.*\S)\s*$/.exec(line);
    if (match) {
      out.push(finish(current));
      current = { heading: match[2], depth: match[1].length, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  out.push(finish(current));

  // A body that opens straight on a heading produces an empty lead. Drop it:
  // there is nothing to read, and an empty section would fail every guard for
  // the wrong reason.
  return out.filter((s, i) => i > 0 || s.heading !== null || s.body.trim().length > 0);
}

function finish(part: { heading: string | null; depth: number; lines: string[] }): Section {
  const body = part.lines.join("\n").trim();
  return {
    heading: part.heading,
    depth: part.depth,
    isQuestion: part.heading !== null && part.heading.trim().endsWith("?"),
    opensWithProse: firstProse(body) === firstBlock(body) && firstProse(body).length > 0,
    words: countProseWords(body),
    body,
  };
}

/** Blocks are separated by a blank line, the same rule the renderer uses. */
function blocks(body: string): string[] {
  const out: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      buffer.push(line);
      if (!inFence) {
        out.push(buffer.join("\n"));
        buffer = [];
      }
      continue;
    }
    if (inFence) {
      buffer.push(line);
      continue;
    }
    if (line.trim() === "") {
      if (buffer.length) out.push(buffer.join("\n"));
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  if (buffer.length) out.push(buffer.join("\n"));
  return out.map((b) => b.trim()).filter(Boolean);
}

function isProse(block: string): boolean {
  if (block.startsWith("```")) return false;
  return !/^\s*(?:[-*+]\s|\d+\.\s|>|\|)/.test(block);
}

function firstBlock(body: string): string {
  return blocks(body)[0] ?? "";
}

function firstProse(body: string): string {
  return blocks(body).find(isProse) ?? "";
}

/** Prose words only. Fenced code is not reading, and it is not an answer. */
function countProseWords(body: string): number {
  return blocks(body)
    .filter(isProse)
    .join(" ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\]()]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Markdown syntax removed, so the answer reads as a sentence rather than source. */
function toSentence(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncated on a word boundary, because a half word reads as a broken quote. */
function cap(text: string): string {
  if (text.length <= ANSWER_LIMIT) return text;
  const cut = text.slice(0, ANSWER_LIMIT);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd();
}

/**
 * Every question the article visibly answers, with the answer beneath it.
 *
 * This is what `FAQPage` is built from, so it is also the reason the articles
 * use question-framed headings at all: the heading is the question a person
 * typed, and the paragraph under it is the passage worth quoting back.
 */
export function questionPairs(body: string): QuestionPair[] {
  return sections(body)
    .filter((s) => s.isQuestion && s.heading)
    .map((s) => ({ question: s.heading as string, answer: cap(toSentence(firstProse(s.body))) }))
    .filter((p) => p.answer.length > 0);
}

/**
 * The paragraph before the first heading.
 *
 * Roughly 44% of AI citations are drawn from the first 30% of a page, so this
 * is the highest-value sentence on the article and the guard in
 * `content/articles.test.ts` holds it to a length someone would actually quote.
 */
export function leadParagraph(body: string): string {
  const lead = sections(body)[0];
  if (!lead || lead.heading !== null) return "";
  return toSentence(firstProse(lead.body));
}
