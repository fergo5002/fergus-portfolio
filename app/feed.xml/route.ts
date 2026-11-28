import { absolute, articlePath, SITE_URL } from "@/lib/seo";
import { profile } from "@/content/profile";
import { articles, newestArticleDate } from "@/content/articles";
import { toHtml } from "@/lib/markdown";

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
      // The whole article. It was the first 600 characters until 2026-11-28,
      // on the theory that a reader needs a reason to visit; a reader who
      // cannot read the piece where they read everything else unsubscribes
      // instead, and a crawler that takes the feed got a seventh of each one.
      //
      // CDATA is not an escape hatch for everything: the one sequence it
      // cannot carry is its own terminator. A single `]]>` anywhere in a body
      // closes the section early and makes the whole document malformed, and
      // a strict reader drops the entire feed rather than the item. The
      // standard trick is to split the terminator across two CDATA sections
      // so neither half is one.
      const html = toHtml(article.body, SITE_URL).replace(/]]>/g, "]]]]><![CDATA[>");
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${rfc822(article.date)}</pubDate>
      <author>${escapeXml(author)}</author>
${article.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
      <description>${escapeXml(article.description)}</description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  const newest = newestArticleDate();

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
