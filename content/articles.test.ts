import { describe, it, expect } from "vitest";
import { articles, articleBySlug, wordCount, readingMinutes } from "./articles";
import { parseMarkdown, toPlainText } from "@/lib/markdown";
import { sections, questionPairs, leadParagraph } from "@/lib/faq";
import { SITE_URL } from "@/lib/seo";
import sitemap from "@/app/sitemap";

/**
 * The publishing guard.
 *
 * Every rule here corresponds to a way a page can be published and then quietly
 * underperform or embarrass: a title a search result truncates, a description
 * outside the window anyone will see, a post too thin to have been worth
 * writing, a dead internal link. None of these break a build on their own,
 * which is exactly why they need a test.
 */

describe("article catalogue", () => {
  it("publishes at least one article", () => {
    expect(articles.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("is sorted newest first", () => {
    const dates = articles.map((a) => a.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it("links to each other", () => {
    // Eight related articles with no links between them is a missed SEO basic
    // and a worse read. This asserts across the corpus rather than per article,
    // because not every piece needs an outbound link, but a corpus with none at
    // all is a mistake. The per-article test below already proves any link that
    // does exist points somewhere real; without this one, that test passes
    // vacuously on zero links, which is exactly how it shipped.
    const all = articles.flatMap((a) => [...a.body.matchAll(/\]\((\/writing\/[^)\s]+)\)/g)]);
    expect(all.length).toBeGreaterThanOrEqual(articles.length);
  });

  it("cites something outside itself", () => {
    // The baseline audit on 2026-08-21 found zero outbound links across eight
    // articles and 8,578 words, which by any citability rubric reads as eight
    // pieces of unsourced opinion. It was not, but nothing on the page said so.
    //
    // Asserted across the corpus rather than per article on purpose. Three of
    // these posts are first-person accounts of things that happened to Fergus,
    // and there is no primary source for those beyond him. Padding them with
    // citations to look authoritative would be worse than having none. What is
    // not acceptable is a corpus that names GSAP, Shopify's webhook signing and
    // prefers-reduced-motion and links to none of them.
    const outbound = articles.flatMap((a) => [...a.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)]);
    expect(outbound.length).toBeGreaterThanOrEqual(5);
    for (const [, href] of outbound) {
      expect(href, `outbound link is not https: ${href}`).toMatch(/^https:\/\//);
    }
  });

  it("resolves every slug through articleBySlug", () => {
    for (const a of articles) expect(articleBySlug(a.slug)?.title).toBe(a.title);
    expect(articleBySlug("no-such-article")).toBeUndefined();
  });
});

describe.each(articles.map((a) => [a.slug, a] as const))("article: %s", (_slug, article) => {
  it("has a URL-safe slug", () => {
    expect(article.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a title a search result will not truncate", () => {
    expect(article.title.length).toBeGreaterThan(10);
    expect(article.title.length).toBeLessThanOrEqual(60);
  });

  it("has a description inside the window a search engine displays", () => {
    // 160, not 180. The design spec says 70 to 160 and this test briefly said
    // 180, which is how five of the eight shipped at 166 to 170 and would have
    // been truncated in every search result. A test that is looser than the
    // spec it is guarding does not guard anything.
    expect(article.description.length).toBeGreaterThanOrEqual(70);
    expect(article.description.length).toBeLessThanOrEqual(160);
  });

  it("has a one-line summary for llms.txt", () => {
    expect(article.summary.length).toBeGreaterThanOrEqual(60);
    expect(article.summary).not.toContain("\n");
  });

  it("has a real ISO date that is not in the future", () => {
    expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(article.date))).toBe(false);
    // The name promised this and the test did not check it. A future
    // `datePublished` in the BlogPosting graph is the kind of thing that gets a
    // page held back from an index, and a typo in the year is easy to make.
    // One day of slack for whoever is writing in a different timezone.
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    expect(Date.parse(article.date)).toBeLessThan(tomorrow);
  });

  it("carries at least one tag", () => {
    expect(article.tags.length).toBeGreaterThan(0);
    expect(article.tags.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("is long enough to be worth publishing", () => {
    // Thin content is the main way a writing surface makes a domain worse
    // rather than better. 600 words is the floor, not the target.
    expect(wordCount(article.body)).toBeGreaterThan(600);
  });

  it("reports a sane reading time", () => {
    expect(readingMinutes(article.body)).toBeGreaterThanOrEqual(1);
    expect(readingMinutes(article.body)).toBeLessThan(60);
  });

  it("parses without throwing and produces real blocks", () => {
    const blocks = parseMarkdown(article.body);
    expect(blocks.length).toBeGreaterThan(3);
    expect(blocks.some((b) => b.type === "heading")).toBe(true);
    expect(blocks.some((b) => b.type === "paragraph")).toBe(true);
  });

  it("has no unclosed code fences", () => {
    const fences = (article.body.match(/^```/gm) ?? []).length;
    expect(fences % 2).toBe(0);
  });

  it("uses no em dashes", () => {
    // House style, and it is easier to enforce than to proofread. See
    // ~/.claude/LANGUAGE.md.
    expect(article.body).not.toMatch(/[—–]/);
    expect(article.title).not.toMatch(/[—–]/);
    expect(article.description).not.toMatch(/[—–]/);
  });

  it("only links internally to routes that exist", () => {
    // Checked against the sitemap rather than a hand-written list. The list
    // version went stale the first time a route was added, which is the whole
    // failure mode a guard like this is supposed to prevent rather than
    // demonstrate. The sitemap is already the canonical set of published URLs,
    // so adding a route there is now the only step.
    const internal = [...article.body.matchAll(/\]\((\/[^)\s#]*)/g)].map((m) => m[1]);
    const published = new Set(sitemap().map((entry) => entry.url.replace(SITE_URL, "") || "/"));
    for (const href of internal) {
      expect(published.has(href), `dead internal link: ${href}`).toBe(true);
    }
  });

  it("extracts to plain text without markdown syntax leaking", () => {
    const text = toPlainText(article.body);
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toContain("```");
  });
});

/**
 * The citability guard.
 *
 * The tests above ask whether a post is worth publishing. These ask a different
 * question: if something reads this page looking for an answer to quote, does it
 * find one. That is the step that decides whether the site gets cited by an
 * answer engine, and on 2026-08-20 the shipped corpus scored zero on it: 46
 * headings across eight articles and not one of them framed as a question.
 *
 * Every threshold below is a rule about extractability, not about style. None of
 * them dictates what a paragraph may say. They exist because the alternative is
 * a note in a document that nobody rereads, and this repo has already learnt
 * that a rule which is not a test is a rule that comes back.
 *
 * The numbers, and where they come from:
 *
 *  - **Question-framed headings.** A heading that reads as a question is the
 *    cheapest citability signal there is, because it matches the shape of what
 *    somebody typed. Three is a floor, not a target, and statement headings are
 *    still fine for the rest.
 *  - **Sections open with prose.** A section that opens on a code fence or a
 *    list has no quotable answer under its heading, so `lib/faq.ts` drops it and
 *    the reader has to assemble the answer themselves.
 *  - **400 word ceiling.** A section longer than that stops being a passage and
 *    becomes a page, and a passage is the unit that gets lifted.
 *  - **A short lead.** Roughly 44% of AI citations come from the first 30% of a
 *    page, which makes the opening paragraph the most valuable sentence on the
 *    article. The window forces it to answer rather than warm up.
 */
describe.each(articles.map((a) => [a.slug, a] as const))("citability: %s", (_slug, article) => {
  it("asks at least three questions in its headings", () => {
    const questions = sections(article.body).filter((s) => s.isQuestion);
    expect(
      questions.length,
      `question-framed headings: ${questions.map((q) => q.heading).join(" | ") || "none"}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("opens every section with a paragraph rather than a fence or a list", () => {
    for (const section of sections(article.body)) {
      if (!section.heading) continue;
      expect(section.opensWithProse, `no prose under: ${section.heading}`).toBe(true);
    }
  });

  it("keeps every section short enough to be quoted whole", () => {
    for (const section of sections(article.body)) {
      expect(section.words, `section too long: ${section.heading ?? "(lead)"}`).toBeLessThanOrEqual(
        400,
      );
    }
  });

  it("has no stub sections", () => {
    for (const section of sections(article.body)) {
      if (!section.heading) continue;
      expect(section.words, `section too thin: ${section.heading}`).toBeGreaterThanOrEqual(40);
    }
  });

  it("answers before it warms up", () => {
    const lead = leadParagraph(article.body);
    const words = lead.split(/\s+/).filter(Boolean).length;
    expect(lead.length, "the body must open on a paragraph, not a heading").toBeGreaterThan(0);
    expect(words, `lead is ${words} words: "${lead}"`).toBeGreaterThanOrEqual(20);
    expect(words, `lead is ${words} words: "${lead}"`).toBeLessThanOrEqual(85);
  });

  it("yields a usable FAQPage", () => {
    const pairs = questionPairs(article.body);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (const pair of pairs) {
      const words = pair.answer.split(/\s+/).filter(Boolean).length;
      expect(words, `thin answer under "${pair.question}": ${pair.answer}`).toBeGreaterThanOrEqual(
        15,
      );
    }
  });
});
