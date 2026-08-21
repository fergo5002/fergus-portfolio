import { describe, it, expect } from "vitest";
import { identifyCrawler, CRAWLERS, ROBOTS_ONLY_TOKENS } from "./crawlers";

/**
 * The crawler table is the leading indicator for everything else on this site's
 * GEO work, so it gets tested harder than its size suggests.
 *
 * The reasoning: a citation in an answer engine is preceded by a fetch, and the
 * fetch is the only part of that chain this site can observe directly. Referral
 * traffic lags it by weeks and is filtered by whether anybody clicks. If the
 * table below is wrong, the earliest signal available is wrong, and nothing
 * downstream can recover it.
 */

describe("identifyCrawler", () => {
  it("returns null for an ordinary browser", () => {
    expect(
      identifyCrawler(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBeNull();
  });

  it("returns null for an empty or missing user agent", () => {
    expect(identifyCrawler("")).toBeNull();
    expect(identifyCrawler("   ")).toBeNull();
  });

  /**
   * The three-way purpose split is the whole point of the table, so each arm is
   * asserted with a real user agent string rather than a bare token.
   *
   * `user-fetch` is the valuable one. A training crawler tells you a model may
   * know about you in eighteen months. A search-index crawler tells you an
   * engine has you on file. A user-fetch tells you a person asked a question a
   * few seconds ago and the model went and read this page to answer it, which
   * is as close to observing a citation as this site can get without asking the
   * engines.
   */
  it.each([
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
      "GPTBot",
      "openai",
      "training",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
      "OAI-SearchBot",
      "openai",
      "search-index",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "ChatGPT-User",
      "openai",
      "user-fetch",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com",
      "ClaudeBot",
      "anthropic",
      "training",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0; +Claude-User@anthropic.com",
      "Claude-User",
      "anthropic",
      "user-fetch",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com",
      "Claude-SearchBot",
      "anthropic",
      "search-index",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
      "PerplexityBot",
      "perplexity",
      "search-index",
    ],
    [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user",
      "Perplexity-User",
      "perplexity",
      "user-fetch",
    ],
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Googlebot",
      "google",
      "search-index",
    ],
    [
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "bingbot",
      "microsoft",
      "search-index",
    ],
    ["Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)", "CCBot", "common-crawl", "training"],
    [
      "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "Bytespider",
      "bytedance",
      "training",
    ],
    [
      "Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://mistral.ai/mistralai-user)",
      "MistralAI-User",
      "mistral",
      "user-fetch",
    ],
    [
      "Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot)",
      "DuckAssistBot",
      "duckduckgo",
      "user-fetch",
    ],
  ])("classifies %s", (ua, name, vendor, purpose) => {
    const found = identifyCrawler(ua);
    expect(found).not.toBeNull();
    expect(found?.name).toBe(name);
    expect(found?.vendor).toBe(vendor);
    expect(found?.purpose).toBe(purpose);
  });

  /**
   * The ordering trap, and the reason the table is an ordered array rather than
   * an object.
   *
   * Four of these tokens are prefixes of another: `ClaudeBot` sits inside
   * nothing, but `Claude-User` and `Claude-SearchBot` both start with `Claude`,
   * `Applebot` is a prefix of `Applebot-Extended`, and `Perplexity-User`
   * contains `Perplexity`. A naive first-match-wins scan over an
   * alphabetically-sorted list files every Anthropic user-fetch as a training
   * crawl, which would quietly invert the single most useful number here.
   */
  it("prefers the longer token when one contains another", () => {
    expect(identifyCrawler("compatible; Claude-SearchBot/1.0")?.name).toBe("Claude-SearchBot");
    expect(identifyCrawler("compatible; Claude-User/1.0")?.name).toBe("Claude-User");
    expect(identifyCrawler("compatible; ClaudeBot/1.0")?.name).toBe("ClaudeBot");
  });

  it("keeps the table sorted longest-token-first so the scan above is sound", () => {
    // Asserting the invariant rather than the outcome: the test above only
    // covers the four collisions that exist today, and the next vendor to ship
    // a `Something-User` variant would slip past it.
    const lengths = CRAWLERS.map((c) => c.token.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });

  it("matches case-insensitively, because operators are not consistent about it", () => {
    expect(identifyCrawler("compatible; gptbot/1.2")?.name).toBe("GPTBot");
    expect(identifyCrawler("COMPATIBLE; PERPLEXITYBOT/1.0")?.name).toBe("PerplexityBot");
  });

  /**
   * The mistake this guards is one the site's own `robots.ts` invites.
   *
   * `Google-Extended` and `Applebot-Extended` are robots.txt control tokens.
   * They are opt-out switches Google and Apple read out of the file, and no
   * request ever arrives carrying either as a user agent. Copying the robots
   * list into the detection table would therefore add two rows that can never
   * fire, and, worse, `Applebot-Extended` would shadow real `Applebot` traffic
   * if it were sorted ahead of it.
   */
  it("excludes the robots.txt-only tokens from user-agent matching", () => {
    for (const token of ROBOTS_ONLY_TOKENS) {
      expect(CRAWLERS.some((c) => c.token.toLowerCase() === token.toLowerCase())).toBe(false);
    }
    // And the real Applebot still resolves, rather than being shadowed.
    expect(identifyCrawler("Mozilla/5.0 (compatible; Applebot/0.1)")?.name).toBe("Applebot");
  });

  it("does not fire on a browser that merely mentions a vendor", () => {
    // "Claude" appears in the wild inside ordinary strings; the token match is
    // deliberately narrow enough that a bare vendor name is not a crawler.
    expect(identifyCrawler("Mozilla/5.0 Claude Desktop Helper")).toBeNull();
    expect(identifyCrawler("Mozilla/5.0 Google Chrome/140")).toBeNull();
  });

  it("gives every row a token, a vendor and a purpose", () => {
    for (const c of CRAWLERS) {
      expect(c.token.length, c.name).toBeGreaterThan(2);
      expect(c.vendor.length, c.name).toBeGreaterThan(0);
      expect(["training", "search-index", "user-fetch"]).toContain(c.purpose);
    }
  });

  it("has no duplicate tokens", () => {
    const tokens = CRAWLERS.map((c) => c.token.toLowerCase());
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});
