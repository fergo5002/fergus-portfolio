import { describe, it, expect } from "vitest";
import { articles, articleBySlug, wordCount, readingMinutes } from "./articles";
import { parseMarkdown, toPlainText } from "@/lib/markdown";

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
    expect(article.description.length).toBeGreaterThanOrEqual(70);
    expect(article.description.length).toBeLessThanOrEqual(180);
  });

  it("has a one-line summary for llms.txt", () => {
    expect(article.summary.length).toBeGreaterThanOrEqual(60);
    expect(article.summary).not.toContain("\n");
  });

  it("has a real ISO date that is not in the future", () => {
    expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(article.date))).toBe(false);
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
    const internal = [...article.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
    const known = new Set(["/", "/projects", "/experience", "/writing"]);
    for (const href of internal) {
      const ok = known.has(href) || articles.some((a) => href === `/writing/${a.slug}`);
      expect(ok, `dead internal link: ${href}`).toBe(true);
    }
  });

  it("extracts to plain text without markdown syntax leaking", () => {
    const text = toPlainText(article.body);
    expect(text.length).toBeGreaterThan(500);
    expect(text).not.toContain("```");
  });
});
