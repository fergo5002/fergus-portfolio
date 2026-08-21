import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { CRAWLER_CAPTURE_CAP, resetCrawlerCaptureWindow } from "./lib/edge";
import { config, middleware } from "./middleware";

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

/**
 * What the middleware actually returns, run against real `NextRequest` objects.
 *
 * ## The bug this exists for
 *
 * The first version of the redirect used `request.nextUrl.clone()`, set
 * `.pathname` to the stripped path, and returned it. Against the production
 * build in a container, `/writing/` answered:
 *
 *     HTTP/1.1 308 Permanent Redirect
 *     location: /writing/
 *
 * A permanent redirect to itself. curl followed it fifty times and stopped.
 * Every trailing-slash URL on the site was unreachable, and `next build` was
 * clean, `tsc` was clean, and all 903 tests were green while it was true.
 *
 * `NextURL` records path information when it is constructed, trailing slash
 * included, and re-applies it when formatted, which is exactly what
 * `skipTrailingSlashRedirect: true` asks it to do. Setting `.pathname` does not
 * clear that memory.
 *
 * The lesson worth keeping is not about `NextURL`. It is that every test here
 * was about the **inputs** to the decision (`lib/edge.test.ts` proves
 * `trailingSlashTarget("/writing/") === "/writing"`, and it does) and none was
 * about the **response**. The unit under test was correct and the thing it was
 * wired into was not. So these assert the header that ships.
 */
describe("the middleware's response", () => {
  /** `NextFetchEvent` is not constructible here; only `waitUntil` is used. */
  const event = { waitUntil: () => {} } as unknown as Parameters<typeof middleware>[1];

  const run = (url: string, userAgent = "Mozilla/5.0 (a browser)") =>
    middleware(new NextRequest(new Request(url, { headers: { "user-agent": userAgent } })), event);

  it("redirects a trailing slash to a path WITHOUT one", () => {
    const res = run("https://fergusoreilly.dev/writing/");
    expect(res.status).toBe(308);

    const location = res.headers.get("location");
    expect(location, "no Location header on a redirect").toBeTruthy();
    // The assertion that was missing. `.endsWith("/writing")` alone would pass
    // for `/writing/` on some URL shapes, so the self-reference is named too.
    expect(new URL(location!, "https://fergusoreilly.dev").pathname).toBe("/writing");
    expect(location).not.toMatch(/\/writing\/$/);
  });

  it("keeps the query string across the redirect", () => {
    const res = run("https://fergusoreilly.dev/writing/?utm_source=chatgpt.com");
    const url = new URL(res.headers.get("location")!, "https://fergusoreilly.dev");
    expect(url.pathname).toBe("/writing");
    expect(url.searchParams.get("utm_source")).toBe("chatgpt.com");
  });

  it("does not redirect a path that is already clean", () => {
    expect(run("https://fergusoreilly.dev/writing").status).toBe(200);
    expect(run("https://fergusoreilly.dev/").status).toBe(200);
  });

  it("does not redirect the analytics proxy", () => {
    // The reason `skipTrailingSlashRedirect` was turned on in the first place.
    expect(run("https://fergusoreilly.dev/ingest/e/").status).toBe(200);
  });

  it("lets a crawler through rather than blocking it", () => {
    // The capture is fire-and-forget through `waitUntil`; what matters here is
    // that identifying a crawler never changes what it is served.
    const res = run(
      "https://fergusoreilly.dev/writing",
      "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    );
    expect(res.status).toBe(200);
  });

  it("records the crawler visit exactly once, without awaiting it", () => {
    const scheduled: unknown[] = [];
    const capturingEvent = {
      waitUntil: (p: unknown) => scheduled.push(p),
    } as unknown as Parameters<typeof middleware>[1];

    middleware(
      new NextRequest(
        new Request("https://fergusoreilly.dev/writing", {
          headers: { "user-agent": "compatible; ChatGPT-User/1.0" },
        }),
      ),
      capturingEvent,
    );
    expect(scheduled).toHaveLength(1);

    scheduled.length = 0;
    middleware(
      new NextRequest(
        new Request("https://fergusoreilly.dev/writing", {
          headers: { "user-agent": "Mozilla/5.0 (a browser)" },
        }),
      ),
      capturingEvent,
    );
    expect(scheduled, "an ordinary visitor must cost no network call").toHaveLength(0);
  });

  /**
   * That the cap is actually wired in, not merely written.
   *
   * `lib/edge.test.ts` proves `shouldCaptureCrawlerVisit` counts correctly. That
   * is a fact about a function. Deleting the call from `middleware.ts` would
   * leave every one of those assertions green while the site went back to
   * firing one billed write per forged request, which is the same
   * inputs-tested-outputs-not shape that produced the redirect loop.
   */
  it("stops scheduling once the instance's hourly budget is spent", () => {
    resetCrawlerCaptureWindow();

    const scheduled: unknown[] = [];
    const capturingEvent = {
      waitUntil: (p: unknown) => scheduled.push(p),
    } as unknown as Parameters<typeof middleware>[1];

    const attempts = CRAWLER_CAPTURE_CAP + 50;
    for (let i = 0; i < attempts; i += 1) {
      middleware(
        new NextRequest(
          new Request(`https://fergusoreilly.dev/writing?i=${i}`, {
            headers: { "user-agent": "compatible; GPTBot/1.2" },
          }),
        ),
        capturingEvent,
      );
    }

    expect(scheduled.length).toBe(CRAWLER_CAPTURE_CAP);
    expect(scheduled.length).toBeLessThan(attempts);
  });

  it("still serves the page after the budget is spent", () => {
    // The cap must throttle the measuring, never the site. A crawler that has
    // exhausted the budget still gets its page.
    resetCrawlerCaptureWindow();
    for (let i = 0; i < CRAWLER_CAPTURE_CAP + 5; i += 1) {
      run("https://fergusoreilly.dev/writing", "compatible; GPTBot/1.2");
    }
    expect(run("https://fergusoreilly.dev/writing", "compatible; GPTBot/1.2").status).toBe(200);
  });
});
