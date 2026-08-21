import { INGEST_PREFIX } from "./analytics";
import type { Crawler } from "./crawlers";

/**
 * The decisions `middleware.ts` makes, as pure functions.
 *
 * A middleware cannot be exercised by vitest without a request, a runtime and a
 * platform to host it, so the parts worth guarding live here instead. The
 * middleware itself is then thin enough to read in one go and contains no
 * branch that is not covered by `lib/edge.test.ts`.
 */

/** `true` for the PostHog reverse proxy, and only for it. */
export function isIngestPath(pathname: string): boolean {
  return pathname === INGEST_PREFIX || pathname.startsWith(`${INGEST_PREFIX}/`);
}

/**
 * The path a trailing-slash URL should be redirected to, or `null` to leave it.
 *
 * ## Why this is hand-rolled rather than left to Next.js
 *
 * PostHog's endpoints end in a slash (`/ingest/e/`, `/ingest/flags/`), and
 * Next's default trailing-slash redirect fires before rewrites, so it 308s them
 * to a slash-less path that the rewrite no longer matches, and no event ever
 * arrives. `skipTrailingSlashRedirect: true` is the documented fix.
 *
 * That switch is global, and turning it on to fix analytics also stops `/writing/`
 * being normalised to `/writing`. The site would then serve the same page on two
 * URLs, which is exactly the sort of duplicate that yesterday's canonical work
 * existed to avoid. Canonical tags would probably get search engines to
 * consolidate them; "probably, by a third party" is a worse answer than a 308.
 *
 * So the behaviour is restored here for everything except the proxy. Nothing
 * new: a visitor and a crawler see precisely what they saw before PostHog
 * arrived.
 */
export function trailingSlashTarget(pathname: string): string | null {
  if (isIngestPath(pathname)) return null;
  if (!pathname.endsWith("/")) return null;
  if (pathname === "/") return null;

  const stripped = pathname.replace(/\/+$/, "");
  // `"//"` strips to `""`, which is not a legal `Location` value: a browser
  // reads an empty location as the current URL, so the redirect would point at
  // itself and loop until the browser gives up.
  return stripped === "" ? "/" : stripped;
}

/** Long user agents are truncated to this before being stored. */
const UA_LIMIT = 256;

/**
 * The properties recorded for one crawler visit.
 *
 * `search` is accepted and then deliberately discarded. A crawler's URL is
 * public, but the query string is the one field in this whole function that a
 * stranger controls the contents of, and forwarding arbitrary attacker-supplied
 * text into an analytics store buys nothing: the unit of interest for "which
 * pages are being crawled" is the path.
 */
export function crawlerVisitProperties(input: {
  crawler: Crawler;
  pathname: string;
  search: string;
  host: string;
  userAgent: string;
}): Record<string, unknown> {
  return {
    crawler: input.crawler.name,
    vendor: input.crawler.vendor,
    purpose: input.crawler.purpose,
    path: input.pathname,
    // PostHog's built-in path and pageview reports key off `$current_url`.
    // Without it these events exist but sit outside every stock insight, which
    // reads as "no data" rather than as "wrong property name".
    $current_url: `https://${input.host}${input.pathname}`,
    user_agent: input.userAgent.slice(0, UA_LIMIT),
  };
}

/**
 * How many crawler visits one runtime instance will report per window.
 *
 * ## Why there is a cap at all
 *
 * Review raised this and was right to. A `User-Agent` is a string the client
 * chooses, so anybody can put `GPTBot` on a `curl` loop and make this site fire
 * one billed PostHog write per request, on nearly every route. Two things go
 * wrong: the bill, and the number. The second is worse. `user-fetch` is the
 * headline figure this whole exercise produces, and a metric a stranger can
 * inflate from their own machine is not a metric.
 *
 * ## What the cap does and does not do
 *
 * It is per runtime instance, because that is the only state an edge middleware
 * has. A platform running many instances multiplies the ceiling by however many
 * are warm, so this is **not** a defence against a determined flood and it is
 * not presented as one. What it does is turn an unbounded loop into a bounded
 * one per instance, which is the difference between a burst costing a few
 * thousand events and it costing as many as somebody feels like sending.
 *
 * The real defence is verifying the caller against the vendors' published IP
 * ranges and reverse DNS. That is deliberately not implemented: it is a lot of
 * machinery for a label on a chart, and `lib/crawlers.ts` says out loud that
 * nothing here is a security control. If the number ever matters enough to
 * defend properly, that is the thing to build, not a bigger cap.
 */
export const CRAWLER_CAPTURE_CAP = 240;
export const CRAWLER_CAPTURE_WINDOW_MS = 60 * 60 * 1000;

/**
 * `-Infinity` rather than `0`, and the test is why.
 *
 * With `0` the first window is anchored at the epoch instead of at first use,
 * so `now - start >= WINDOW` is only true once `now` itself exceeds an hour in
 * milliseconds. Against a real `Date.now()` that is true on the first call and
 * the thing self-corrects immediately, which is exactly why it would never have
 * been noticed. Against the small timestamps a test uses it silently anchors
 * every instance to the same imaginary hour. `-Infinity` says "no window yet"
 * and means it.
 */
let captureWindowStart = -Infinity;
let capturedInWindow = 0;

/**
 * `true` if this crawler visit should be reported.
 *
 * `now` is a parameter so the window is drivable in a test without waiting an
 * hour for a clock.
 */
export function shouldCaptureCrawlerVisit(now: number): boolean {
  if (now - captureWindowStart >= CRAWLER_CAPTURE_WINDOW_MS) {
    captureWindowStart = now;
    capturedInWindow = 0;
  }
  if (capturedInWindow >= CRAWLER_CAPTURE_CAP) return false;
  capturedInWindow += 1;
  return true;
}

/** Test seam. Nothing in the application calls this. */
export function resetCrawlerCaptureWindow(): void {
  captureWindowStart = -Infinity;
  capturedInWindow = 0;
}

/**
 * The distinct id used for a crawler.
 *
 * One id per crawler rather than per visit, so PostHog's unique counts read as
 * "how many distinct crawlers" rather than as an ever-growing list of
 * one-shot identities. Person profiles are refused for these anyway
 * (`lib/posthog-server.ts`), so this is a grouping key and nothing more.
 */
export function crawlerDistinctId(crawler: Crawler): string {
  return `crawler:${crawler.name}`;
}
