import { describe, it, expect } from "vitest";
import { config } from "./middleware";

/**
 * What the middleware matcher actually lets through.
 *
 * ## Why this exists
 *
 * It was written immediately after the exact failure it guards. The matcher's
 * docblock was edited to say `_vercel` was excluded, and the regex on the next
 * line was not. Comment and code disagreed, in the same commit, and nothing
 * anywhere would have said so: the site would have worked, the tests would have
 * passed, and the only symptom would have been a slightly larger invoice.
 *
 * That is the second time this class of thing has happened on this repo. The
 * first is in the mistakes ledger, and the shape is identical: prose describing
 * a state of the world that the code beside it does not implement.
 *
 * ## What this test can and cannot claim
 *
 * Next compiles `config.matcher` with path-to-regexp, not with `new RegExp`.
 * The construction below is therefore an **approximation** of what the platform
 * does, and it is a fair one for these patterns because everything in this
 * matcher (`(?!...)`, `.*`, an anchored extension group) means the same thing in
 * both. It is not proof that Vercel routes a given request the same way.
 *
 * What it does prove is the thing that broke: that the exclusion list contains
 * what the comment above it says, and that the inclusions nobody should touch
 * are still included.
 */

const [pattern] = config.matcher;
const matcher = new RegExp(`^${pattern}$`);

describe("the middleware matcher", () => {
  it("runs on the pages people and crawlers read", () => {
    for (const path of ["/", "/writing", "/writing/split-text-audit-2026", "/projects", "/api/mcp"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  /**
   * **The five URLs that must never be excluded.**
   *
   * These look like static files and are not: they are generated routes, and
   * they are the ones an AI crawler is most likely to fetch. The whole purpose
   * of the crawler log is to watch them being fetched. Excluding them because
   * of their extension is the obvious mistake, and it would silently remove the
   * most interesting rows in the dataset while leaving the feature apparently
   * working.
   */
  it("runs on robots.txt, the sitemap, llms.txt, the feed and the MCP manifest", () => {
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/feed.xml",
      "/.well-known/mcp.json",
    ]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  it("stays off build output and image resizing", () => {
    expect(matcher.test("/_next/static/chunks/main.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
  });

  /**
   * The one this test was written for. Both analytics beacon paths are excluded
   * so that measuring the site does not cost a function invocation per event.
   */
  it("stays off both analytics beacon paths", () => {
    expect(matcher.test("/ingest/e/"), "PostHog proxy").toBe(false);
    expect(matcher.test("/ingest/static/array.js"), "PostHog SDK").toBe(false);
    expect(matcher.test("/_vercel/insights/view"), "Vercel Analytics").toBe(false);
    expect(matcher.test("/_vercel/speed-insights/vitals"), "Vercel Speed Insights").toBe(false);
  });

  it("stays off images and fonts", () => {
    for (const path of ["/img/hero.png", "/icon.svg", "/favicon.ico", "/fonts/mono.woff2"]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it("declares exactly one matcher, because the assertions above read only the first", () => {
    // Without this, adding a second pattern would leave every test here quietly
    // measuring a subset of the real configuration.
    expect(config.matcher).toHaveLength(1);
  });
});
