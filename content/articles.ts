/**
 * The writing surface.
 *
 * One module per article in `content/articles/`, collected here and sorted
 * newest first. Bodies are markdown strings rendered by `lib/markdown.ts`,
 * which handles the subset used here and nothing else. That is a deliberate
 * trade: a general markdown library is tens of kilobytes to render a handful of
 * documents whose syntax is entirely under our own control, and it would arrive
 * with an HTML-injection surface this site does not otherwise have.
 *
 * `content/articles.test.ts` guards the shape of every entry: unique slugs,
 * metadata, dates, links and rendering. Length and heading style are editorial
 * decisions, not publishing quotas.
 *
 * The September 2026 edit retired six entries from this registry. Their source
 * modules remain for reference; only entries below are published or indexed.
 */

export type Article = {
  /** URL segment. Lowercase, hyphenated, stable once published. */
  slug: string;
  /** Headline. Keep under 60 characters or a search result truncates it. */
  title: string;
  /** Meta description. 70 to 160 characters is the window worth writing for. */
  description: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** ISO date of a substantive revision, if there has been one. */
  updated?: string;
  tags: string[];
  /**
   * One line for `/llms.txt`, written for a model deciding whether this page
   * answers a question rather than for a person deciding whether to click.
   */
  summary: string;
  /** Markdown. See `lib/markdown.ts` for the supported subset. */
  body: string;
};

import { presterlyPostMortem } from "./articles/why-presterly-wound-down";
import { crtThatBehaves } from "./articles/a-crt-that-behaves-like-a-crt";
import { splitTextAudit } from "./articles/split-text-audit-2026";
import { uuidsAgreed } from "./articles/the-test-passed-because-the-uuids-agreed";
import { qualcommOverlay } from "./articles/a-qualcomm-overlay-appeared-in-our-dungeon";

/** Newest first. This order is the published order everywhere. */
export const articles: Article[] = [
  uuidsAgreed,
  qualcommOverlay,
  splitTextAudit,
  presterlyPostMortem,
  crtThatBehaves,
].sort((a, b) => b.date.localeCompare(a.date));

export function articleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

/**
 * Word count from the markdown source, with fenced code blocks removed.
 *
 * Code is excluded because it is not reading time in the sense a reader means,
 * and because a post that is mostly a listing would otherwise report as long
 * when it is quick to read. Published in `BlogPosting.wordCount`, so it should
 * mean what a person would mean by it.
 */
export function wordCount(body: string): number {
  const prose = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-[\]()]/g, " ");
  return prose.split(/\s+/).filter(Boolean).length;
}

/** Rounded up, floored at one minute. 200 words a minute is the usual figure. */
export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(wordCount(body) / 200));
}
