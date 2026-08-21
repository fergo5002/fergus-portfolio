import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { identifyCrawler } from "@/lib/crawlers";
import {
  crawlerDistinctId,
  crawlerVisitProperties,
  shouldCaptureCrawlerVisit,
  trailingSlashTarget,
} from "@/lib/edge";
import { captureServerEvent } from "@/lib/posthog-server";

/**
 * Two jobs, and the first one exists because of the second.
 *
 * ## 1. Put the trailing-slash redirect back
 *
 * `next.config.ts` sets `skipTrailingSlashRedirect: true`, which it has to:
 * PostHog's endpoints end in a slash and Next's own redirect fires before the
 * rewrite, so without the switch every event 308s into a path the proxy no
 * longer matches and nothing is ever recorded.
 *
 * That switch is global, so turning it on for the proxy also turns it off for
 * `/writing/`, `/projects/` and every other real route, which would start
 * serving the same page on two URLs. `lib/edge.ts` explains why "search engines
 * will probably consolidate them" is not good enough. The redirect below is
 * that behaviour restored, not a new feature.
 *
 * ## 2. Record AI crawler visits
 *
 * The pages an answer engine cites are almost all statically rendered, so a
 * crawler fetching one runs no server code at all: it is served from the CDN.
 * Middleware is the only place on this site that sees those requests. That is
 * the whole reason this file exists rather than a hook inside a page.
 *
 * `lib/crawlers.ts` explains why the three-way purpose split is the interesting
 * output, and in particular why `user-fetch` is the number worth watching.
 *
 * ## What this file must never do
 *
 * Block, throw, or slow a request down. The capture is handed to
 * `event.waitUntil`, so it runs after the response has been returned rather
 * than in front of it, and `captureServerEvent` has no throwing path. A visitor
 * must never see a 500 caused by telemetry they did not ask for.
 */
export function middleware(request: NextRequest, event: NextFetchEvent): NextResponse {
  const { pathname, search } = request.nextUrl;

  const userAgent = request.headers.get("user-agent") ?? "";
  const crawler = identifyCrawler(userAgent);

  // The cap is per runtime instance and it is not a defence against a flood.
  // `lib/edge.ts` says what it is for: a `User-Agent` is a string the caller
  // chooses, so without it anybody can run this site's PostHog bill up, and
  // worse, inflate the one number the whole exercise exists to produce.
  if (crawler && shouldCaptureCrawlerVisit(Date.now())) {
    // Fired for the URL as requested, before any redirect below rewrites it, so
    // the record says what the crawler actually asked for.
    event.waitUntil(
      captureServerEvent({
        event: "ai_crawler_visit",
        distinctId: crawlerDistinctId(crawler),
        properties: crawlerVisitProperties({
          crawler,
          pathname,
          search,
          host: request.nextUrl.host,
          userAgent,
        }),
      }),
    );
  }

  const target = trailingSlashTarget(pathname);
  if (target) {
    /**
     * A plain `URL` from `request.url`, **not** `request.nextUrl.clone()`.
     *
     * This is the bug the Docker parity container caught and no unit test here
     * could have. `NextURL` records path information, trailing slash included,
     * when it is constructed, and re-applies it when it is formatted. So
     * cloning the URL for `/writing/`, setting `.pathname = "/writing"` and
     * handing it to `NextResponse.redirect` produced:
     *
     *     HTTP/1.1 308 Permanent Redirect
     *     location: /writing/
     *
     * A permanent redirect to itself. curl followed it fifty times and gave up.
     * Every page with a trailing slash on the whole site, unreachable, and
     * `next build` was clean and all 903 tests were green throughout.
     *
     * `skipTrailingSlashRedirect` is why: it tells Next not to normalise, and
     * `NextURL` honours that when it re-formats. A standard `URL` has no such
     * memory and serialises exactly what it is given.
     */
    const url = new URL(request.url);
    url.pathname = target;
    // 308 rather than 301: it is the permanent redirect defined to preserve the
    // method, and it is what Next itself issues here. Anything that POSTs to a
    // trailing-slash URL keeps working.
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except the things it would be pointless or expensive to see.
   *
   * `_next/static` and `_next/image` are build output and image resizing, and
   * running a function in front of them would cost an invocation per asset for
   * nothing. `ingest` is the PostHog proxy: it is handled by a rewrite, it is
   * already exempt from the redirect above, and putting middleware in front of
   * every analytics beacon would double the cost of measuring. `_vercel` is the
   * other analytics package's own beacon path, excluded for the same reason and
   * belt-and-braces: those requests are believed to be handled at the platform
   * edge before Next sees them, and the exclusion costs nothing either way.
   *
   * **`.txt`, `.xml` and `.json` are deliberately NOT excluded.** `/robots.txt`,
   * `/sitemap.xml`, `/llms.txt`, `/feed.xml` and `/.well-known/mcp.json` are the
   * five URLs on this site a crawler is most likely to fetch, and the whole
   * point of the crawler log is to see them being fetched. Excluding them
   * because they look like static files is the obvious mistake here, and it
   * would remove exactly the rows worth having.
   */
  matcher: [
    "/((?!_next/static|_next/image|_vercel|ingest/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$).*)",
  ],
};
