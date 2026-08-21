/**
 * Which non-human fetched a page, and what it wanted.
 *
 * ## Why this exists
 *
 * `app/robots.ts` already names every AI crawler and lets them all in. That
 * grants permission; it records nothing. This module is the other half: when
 * one of them actually arrives, `middleware.ts` uses this to say who it was and
 * file the visit in PostHog.
 *
 * The reason to bother is timing. The chain that ends in a person reading about
 * Fergus in an answer engine runs: crawl, index, cite, click. This site can only
 * observe the two ends of it. The click is measured by
 * `lib/analytics.ts`'s referrer work, and it is the truest signal but also the
 * slowest and the most heavily filtered: it needs somebody to be asked, to be
 * cited, and then to click. The crawl is the earliest thing observable, it
 * moves weeks or months before the click does, and it is the only one of the
 * four that arrives at this origin.
 *
 * ## The purpose split is the useful part
 *
 * Three kinds of visit, and they mean completely different things:
 *
 * - **training** (`GPTBot`, `ClaudeBot`, `CCBot`, `Bytespider`, ...): a corpus
 *   is being assembled. Whatever it reads may surface in a model in a year, or
 *   never. Worth allowing, close to worthless as a signal.
 * - **search-index** (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`,
 *   `Googlebot`, `bingbot`): the page is being put on file so it can be
 *   retrieved later to answer somebody. This is the one that gates whether
 *   citation is possible at all.
 * - **user-fetch** (`ChatGPT-User`, `Claude-User`, `Perplexity-User`,
 *   `MistralAI-User`, `DuckAssistBot`): a person asked a question a few seconds
 *   ago and the model went and read this page to answer it. This is as close to
 *   watching a citation happen as this site can get without asking the engines,
 *   and it is the number worth putting on a dashboard.
 *
 * ## What this is not
 *
 * A security control. A user agent is a string a client chooses, so everything
 * here is self-reported and trivially forged. That is fine for the purpose:
 * nothing is authorised or refused on the strength of it, it only labels a row
 * in an analytics table. If a decision that matters ever hangs off this, the
 * vendors publish verifiable IP ranges and reverse-DNS, and none of that is
 * implemented here.
 */

export type CrawlerPurpose = "training" | "search-index" | "user-fetch";

export type CrawlerVendor =
  | "openai"
  | "anthropic"
  | "google"
  | "perplexity"
  | "microsoft"
  | "apple"
  | "meta"
  | "amazon"
  | "bytedance"
  | "common-crawl"
  | "cohere"
  | "mistral"
  | "duckduckgo"
  | "you";

export type Crawler = {
  /** Display name, and the value that reaches PostHog. */
  readonly name: string;
  /** The substring looked for in the user agent, matched case-insensitively. */
  readonly token: string;
  readonly vendor: CrawlerVendor;
  readonly purpose: CrawlerPurpose;
};

/**
 * Robots.txt control tokens that are **not** user agents.
 *
 * `Google-Extended` and `Applebot-Extended` exist only inside robots.txt. They
 * are switches Google and Apple read out of the file to decide whether content
 * may be used for model training; no HTTP request ever arrives carrying either
 * one. They are listed in `app/robots.ts` for exactly that reason and they are
 * deliberately absent from `CRAWLERS` below.
 *
 * Copying the robots list into the detection table is the obvious mistake, and
 * it costs more than two dead rows: sorted by length, `Applebot-Extended` would
 * sit ahead of `Applebot` and swallow every real Applebot visit under a label
 * that can never be correct. `lib/crawlers.test.ts` asserts they stay out.
 */
export const ROBOTS_ONLY_TOKENS = ["Google-Extended", "Applebot-Extended"] as const;

/**
 * The table, sorted longest token first.
 *
 * **The order is load-bearing, not cosmetic.** Matching is first-token-wins over
 * a substring scan, and several tokens contain others: `Claude-SearchBot` and
 * `Claude-User` would both be missed by a scan that reached `ClaudeBot` first
 * if it were a prefix, `Perplexity-User` contains `Perplexity`, and
 * `Applebot` sits inside `Applebot-Extended`. Sorting by descending length
 * makes the most specific token always win, and the test asserts the sort so
 * the next row added cannot quietly break it by being inserted in the wrong
 * place.
 */
const TABLE: readonly Crawler[] = [
  { name: "meta-externalagent", token: "meta-externalagent", vendor: "meta", purpose: "training" },
  { name: "Claude-SearchBot", token: "Claude-SearchBot", vendor: "anthropic", purpose: "search-index" },
  { name: "Perplexity-User", token: "Perplexity-User", vendor: "perplexity", purpose: "user-fetch" },
  { name: "MistralAI-User", token: "MistralAI-User", vendor: "mistral", purpose: "user-fetch" },
  { name: "DuckAssistBot", token: "DuckAssistBot", vendor: "duckduckgo", purpose: "user-fetch" },
  { name: "OAI-SearchBot", token: "OAI-SearchBot", vendor: "openai", purpose: "search-index" },
  { name: "PerplexityBot", token: "PerplexityBot", vendor: "perplexity", purpose: "search-index" },
  { name: "ChatGPT-User", token: "ChatGPT-User", vendor: "openai", purpose: "user-fetch" },
  { name: "Claude-User", token: "Claude-User", vendor: "anthropic", purpose: "user-fetch" },
  { name: "DuckDuckBot", token: "DuckDuckBot", vendor: "duckduckgo", purpose: "search-index" },
  { name: "anthropic-ai", token: "anthropic-ai", vendor: "anthropic", purpose: "training" },
  { name: "Googlebot", token: "Googlebot", vendor: "google", purpose: "search-index" },
  { name: "Bytespider", token: "Bytespider", vendor: "bytedance", purpose: "training" },
  { name: "ClaudeBot", token: "ClaudeBot", vendor: "anthropic", purpose: "training" },
  { name: "Amazonbot", token: "Amazonbot", vendor: "amazon", purpose: "training" },
  { name: "cohere-ai", token: "cohere-ai", vendor: "cohere", purpose: "training" },
  { name: "Applebot", token: "Applebot", vendor: "apple", purpose: "search-index" },
  { name: "bingbot", token: "bingbot", vendor: "microsoft", purpose: "search-index" },
  { name: "GPTBot", token: "GPTBot", vendor: "openai", purpose: "training" },
  { name: "YouBot", token: "YouBot", vendor: "you", purpose: "search-index" },
  { name: "CCBot", token: "CCBot", vendor: "common-crawl", purpose: "training" },
];

/**
 * Sorted by the code as well as by hand, so the invariant that
 * `identifyCrawler` depends on is enforced rather than remembered. The hand
 * ordering in `TABLE` stays because a reader should be able to see the shape
 * without running it, and `lib/crawlers.test.ts` asserts the result is sorted
 * so that a row inserted in the wrong place still cannot break the scan.
 */
export const CRAWLERS: readonly Crawler[] = [...TABLE].sort(
  (a, b) => b.token.length - a.token.length,
);

/**
 * Identify the crawler behind a user agent, or `null` for anything else.
 *
 * Everything that is not in the table is `null`, including ordinary browsers,
 * uptime monitors, and the many bots this site has no opinion about. That is
 * the right default: the point is to count a specific, named set of agents, not
 * to divide the world into human and machine.
 */
export function identifyCrawler(userAgent: string | null | undefined): Crawler | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.trim().length === 0) return null;

  for (const crawler of CRAWLERS) {
    if (ua.includes(crawler.token.toLowerCase())) return crawler;
  }
  return null;
}
