import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * `/robots.txt`. There wasn't one, so this route is the difference between the
 * sitemap being discovered and it sitting there unread.
 *
 * The AI crawlers are named explicitly even though the wildcard already allows
 * them, and that is the point of this file rather than an oversight. Several of
 * these agents are run by operators who treat an absent or ambiguous rule
 * conservatively, and some publishers block them by default. A site whose whole
 * goal is to be the cited source when somebody asks a model about Fergus should
 * say so out loud rather than rely on a permissive default staying permissive.
 *
 * Splitting them out also makes the file the one place to revoke access. If any
 * of these ever needs turning off, it is one line here, not a rethink.
 */
const AI_CRAWLERS = [
  // OpenAI: training, live search, and on-demand user fetches respectively.
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic.
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  // Google's separate opt-out for Gemini and AI Overviews. Note this is not
  // Googlebot: blocking Google-Extended does not affect normal search ranking,
  // and allowing it is what permits citation in AI answers.
  "Google-Extended",
  // The rest of the field.
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "DuckAssistBot",
  "MistralAI-User",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Next's own build output. Nothing here is a page, and letting a
        // crawler spend its budget on chunk files costs the real routes.
        disallow: ["/_next/static/chunks/"],
      },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
