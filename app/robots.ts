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
        // NOTHING IS DISALLOWED, AND `/_next/` IN PARTICULAR MUST STAY CRAWLABLE.
        //
        // This briefly carried `disallow: ["/_next/static/chunks/"]` on a crawl
        // budget argument, which was wrong twice over. There is no crawl budget
        // problem on a five-route site, and blocking the JavaScript would have
        // taken the landing page down in Google specifically:
        //
        //   1. The inline pre-paint script in `app/layout.tsx` is inline, so it
        //      always runs, and on "/" it adds `booting` to <html>.
        //   2. `.booting .screen/.nav/.statusbar` are `visibility: hidden`.
        //   3. The code that clears `booting` properly is `BootSequence`, which
        //      ships in a chunk under `/_next/static/chunks/`.
        //
        // A crawler that renders but honours the disallow therefore sets the
        // class, never loads the code that clears it, and sees an empty page
        // for `BOOT_FAILSAFE_MS` (lib/boot.ts). The inline script does clear the
        // class itself after that, so the exposure is bounded rather than
        // permanent, but it is bounded by a delay chosen for humans on a bad
        // connection, not by anything a renderer is guaranteed to wait out.
        // The named AI crawlers below would have been fine, because each gets
        // its own group and ignores this one, so the page carrying the Person
        // graph would have gone blank for Google and nobody else. Every status
        // code stays 200 throughout, which is why nothing would have caught it.
        //
        // Google's own guidance is not to block JS or CSS. Follow it.
      },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
