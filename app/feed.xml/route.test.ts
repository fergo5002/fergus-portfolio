import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { articles, newestArticleDate, wordCount } from "@/content/articles";

/**
 * The feed had no test. On 2026-11-28 it carried a 600-character excerpt of
 * each article and a build date three weeks older than the newest revision.
 */
describe("/feed.xml", async () => {
  const xml = await GET().text();
  const items = xml.split("<item>").slice(1);

  it("has one item per article", () => {
    expect(items).toHaveLength(articles.length);
  });

  it("carries each article in full, as HTML", () => {
    for (const [i, article] of articles.entries()) {
      const encoded = items[i].split("<content:encoded><![CDATA[")[1].split("]]></content:encoded>")[0];
      const words = encoded.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      // Prose only is counted by `wordCount`; the feed also carries the tables.
      expect(words, article.slug).toBeGreaterThanOrEqual(Math.floor(wordCount(article.body) * 0.9));
      expect(encoded, article.slug).toContain("<h2");
      expect(encoded, article.slug).not.toContain("Read the rest");
    }
  });

  it("is built on the newest revision", () => {
    const built = xml.match(/<lastBuildDate>([^<]+)<\/lastBuildDate>/)![1];
    expect(new Date(built).toISOString().slice(0, 10)).toBe(newestArticleDate());
  });

  it("never lets an article close its own CDATA section", () => {
    for (const item of items) {
      const inner = item.split("<content:encoded>")[1].split("</content:encoded>")[0];
      // Every `]]>` must be the end of a section, immediately reopened or final.
      const closes = inner.split("]]>").length - 1;
      const opens = inner.split("<![CDATA[").length - 1;
      expect(closes).toBe(opens);
    }
  });
});
