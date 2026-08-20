import { absolute, articlePath, SITE_URL } from "@/lib/seo";
import { profile } from "@/content/profile";
import { articles } from "@/content/articles";
import { toPlainText } from "@/lib/markdown";

/**
 * `/feed.xml`, RSS 2.0.
 *
 * Still the cheapest distribution on the web. Readers, aggregators, newsletter
 * tools and several crawlers all discover new posts from it without anyone
 * having to be told a post exists.
 *
 * The escaping below is not optional. An unescaped `&` alone makes the document
 * malformed, and a strict reader will reject the whole feed rather than skip the
 * item, so one ampersand in one title silently costs you every subscriber.
 */

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822, which is what RSS wants and what ISO 8601 is not. */
function rfc822(date: string): string {
  return new Date(`${date}T09:00:00Z`).toUTCString();
}

export function GET(): Response {
  const email = profile.contact.find((c) => c.href.startsWith("mailto:"))?.value ?? "";
  const author = email ? `${email} (${profile.shortName})` : profile.shortName;

  const items = articles
    .map((article) => {
      const url = absolute(articlePath(article.slug));
      // A generous excerpt rather than the whole body: enough for a reader to
      // decide, not so much that there is no reason to visit.
      const excerpt = toPlainText(article.body).slice(0, 600).trim();
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${rfc822(article.date)}</pubDate>
      <author>${escapeXml(author)}</author>
${article.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
      <description>${escapeXml(article.description)}</description>
      <content:encoded><![CDATA[<p>${excerpt}...</p><p><a href="${url}">Read the rest</a></p>]]></content:encoded>
    </item>`;
    })
    .join("\n");

  const newest = articles[0]?.date;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(`Writing · ${profile.shortName}`)}</title>
    <link>${SITE_URL}/writing</link>
    <description>${escapeXml("Essays on building software, shipping products, and the things that went wrong.")}</description>
    <language>en</language>
    <managingEditor>${escapeXml(author)}</managingEditor>
    <webMaster>${escapeXml(author)}</webMaster>
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>` : ""}
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
