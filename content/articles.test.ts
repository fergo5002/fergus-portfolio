import { describe, it, expect } from "vitest";
import { articles, articleBySlug, readingMinutes } from "./articles";
import { parseMarkdown, toPlainText } from "@/lib/markdown";
import { SITE_URL } from "@/lib/seo";
import sitemap from "@/app/sitemap";

/**
 * The publishing guard.
 *
 * Every rule here corresponds to a way a page can be published and then quietly
 * underperform or embarrass: a title a search result truncates, a description
 * outside the intended window, an empty body or a dead internal link.
 * None of these break a build on their own,
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

  it("uses HTTPS for external citations", () => {
    // Link counts and cross-linking are editorial decisions. Validate links
    // that are present without requiring extra citations to fill a quota.
    const outbound = articles.flatMap((a) => [...a.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)]);
    for (const [, href] of outbound) expect(href).toMatch(/^https:\/\//);
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

  it("reports a sane reading time", () => {
    expect(readingMinutes(article.body)).toBeGreaterThanOrEqual(1);
    expect(readingMinutes(article.body)).toBeLessThan(60);
  });

  it("parses without throwing and produces real blocks", () => {
    const blocks = parseMarkdown(article.body);
    expect(blocks.length).toBeGreaterThan(0);
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
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain("```");
  });
});
