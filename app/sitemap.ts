import type { MetadataRoute } from "next";
import { absolute, articlePath } from "@/lib/seo";
import { articles } from "@/content/articles";

/**
 * `/sitemap.xml`, generated from `content/`.
 *
 * Generated rather than hand-written because a stale sitemap is worse than no
 * sitemap: it tells a crawler with total confidence that a page it can't reach
 * exists, and that it last changed on a date that is a lie. Deriving it from the
 * article list means publishing a post is the only step.
 *
 * `lastModified` uses the article's own revision date, not the build time.
 * Stamping every URL with "now" on each deploy is the standard way to teach a
 * crawler that your dates mean nothing, at which point it stops using them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const newestArticle = articles[0]?.updated ?? articles[0]?.date;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absolute("/"), changeFrequency: "monthly", priority: 1 },
    { url: absolute("/projects"), changeFrequency: "monthly", priority: 0.8 },
    { url: absolute("/experience"), changeFrequency: "monthly", priority: 0.8 },
    // Listed despite having no nav entry. It is the destination of the call to
    // action on every other page, so a crawler that only follows the nav would
    // never reach it.
    { url: absolute("/contact"), changeFrequency: "yearly", priority: 0.6 },
    {
      url: absolute("/writing"),
      changeFrequency: "weekly",
      priority: 0.9,
      lastModified: newestArticle ? new Date(newestArticle) : undefined,
    },
  ];

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: absolute(articlePath(a.slug)),
    lastModified: new Date(a.updated ?? a.date),
    changeFrequency: "yearly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...articleRoutes];
}
