"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { detectAiEngine, posthogClientOptions, webVitalRating } from "@/lib/analytics";

/**
 * PostHog, loaded after first paint, plus the two things this site measures
 * that PostHog does not do on its own.
 *
 * Renders nothing. It sits at the end of `<body>` beside `<Analytics />` for
 * the same reason that one does: the placement buys lifetime, not layout.
 *
 * ## Why the import is dynamic, and why it must stay that way
 *
 * A static `import posthog from "posthog-js"` in this file puts the SDK in the
 * **layout** bundle, which means every page on the site downloads it before
 * anything can hydrate. Measured on the 2026-08-21 build, that was a 248 KB
 * chunk, the largest in the repo, ahead of the framework itself.
 *
 * On a site with a WebGL phosphor shader, a physics solver and a boot sequence,
 * that is a quarter of a megabyte of contention in front of first paint. And
 * the specific irony is the point: one of the things this component reports is
 * Core Web Vitals, so a static import would have measurably worsened the exact
 * number it exists to measure, and then reported the worse number as if it were
 * news.
 *
 * So the SDK is fetched during idle time after mount, and the site is fully
 * interactive without it. **Do not "tidy" this into a static import.**
 * `components/analytics/PostHogAnalytics.test.ts` fails if anybody does.
 *
 * ## What deferring costs
 *
 * A visitor who leaves within the first couple of seconds is not counted. That
 * is a real loss and it is the right trade: they did not read anything either,
 * `@vercel/analytics` still counts them, and the alternative was making the
 * page slower for everyone in order to count the people who did not wait for it.
 *
 * ## Why `@vercel/analytics` is still here
 *
 * Not indecision. It is a second, independent instrument measuring the same
 * thing by a different route, which is the only way to tell "nobody visited"
 * apart from "the new thing is broken". If the two ever disagree by a lot, the
 * disagreement is the finding.
 *
 * ## Cookieless
 *
 * `lib/analytics.ts` holds the configuration and the reasoning. No cookies, no
 * local storage, no banner, and therefore no session replay, because replay
 * needs somewhere to keep a session id and there isn't one. A consequence of
 * the choice, not an oversight.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

type Capturable = { capture: (event: string, properties?: Record<string, unknown>) => void };

/**
 * Module scope rather than refs, all three.
 *
 * React 19 mounts effects twice in development, and a ref is recreated on the
 * second mount, so a ref guard would let the SDK initialise twice and double
 * every pageview.
 */
let client: Capturable | null = null;
let started = false;

/**
 * Events that happened before the SDK finished loading.
 *
 * Web Vitals are the reason this exists: `LCP` and `FCP` are reported by the
 * browser in the first second or so, which is precisely the window the SDK is
 * deliberately not present for. Without a queue, deferring the import would
 * silently drop the two most important metrics on the list and leave a chart
 * of `INP` and `CLS` looking complete.
 *
 * Bounded, because an unbounded queue fed by a page nobody closes is a leak.
 * Fifty is far more than the handful of events a real session produces.
 */
const pending: Array<{ event: string; properties: Record<string, unknown> }> = [];
const PENDING_LIMIT = 50;

function capture(event: string, properties: Record<string, unknown>): void {
  if (client) {
    client.capture(event, properties);
    return;
  }
  if (pending.length < PENDING_LIMIT) pending.push({ event, properties });
}

/**
 * How long to wait before giving up on idle time and loading anyway.
 *
 * `requestIdleCallback` can be starved indefinitely on a busy main thread, and
 * this site's main thread is busy by design for the first few seconds. The
 * timeout is what stops "after the work" becoming "never".
 */
const IDLE_TIMEOUT_MS = 2500;

function whenIdle(work: () => void): void {
  // Safari shipped `requestIdleCallback` late enough that a fallback is still
  // worth having, and a plain timeout is the correct one: it fires at roughly
  // the moment the timeout above would have forced the issue anyway.
  const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") ric(work, { timeout: IDLE_TIMEOUT_MS });
  else window.setTimeout(work, IDLE_TIMEOUT_MS);
}

export default function PostHogAnalytics() {
  useEffect(() => {
    // Absent unless `.env.local` or the Vercel project sets it. Every call site
    // treats that as "do nothing" rather than as an error.
    if (!KEY || started) return;
    started = true;

    /**
     * Read at mount, not after the import resolves.
     *
     * `location.search` is mutable: a client-side navigation between mount and
     * the SDK arriving would leave the campaign tag reading the wrong URL, and
     * the arrival would be attributed to whichever page the visitor happened to
     * reach rather than the one the engine sent them to. `document.referrer`
     * survives a pushState, but taking both at the same instant is the only
     * version of this that is obviously correct.
     */
    const arrival = detectAiEngine({
      referrer: document.referrer,
      utmSource: new URLSearchParams(window.location.search).get("utm_source"),
    });
    const landingPath = window.location.pathname;

    whenIdle(() => {
      void import("posthog-js").then(({ default: posthog }) => {
        posthog.init(KEY, posthogClientOptions());
        client = posthog;

        /**
         * The answer-engine arrival. This is the number Fergus asked for: not
         * "was I cited", which no engine will tell you, but "did a citation put
         * a person on the site".
         *
         * `register` is best effort. Under cookieless the persistence layer is
         * memory, so super properties last for the tab and no longer, which is
         * why the event below is the record that actually survives.
         */
        if (arrival) {
          posthog.register({ ai_engine: arrival.engine, ai_via: arrival.via });
          posthog.capture("ai_referral", {
            ai_engine: arrival.engine,
            ai_via: arrival.via,
            landing_path: landingPath,
          });
        }

        for (const queued of pending.splice(0)) posthog.capture(queued.event, queued.properties);
      });
    });
  }, []);

  /**
   * Core Web Vitals from real visitors.
   *
   * Worth having twice over. It is a Google ranking input, so it belongs in an
   * SEO exercise. And it is the only performance number about this site that is
   * not a lab score: a shader, a solver and a boot sequence are exactly the
   * sort of thing that measures beautifully on a developer's machine and badly
   * on a four-year-old laptop.
   *
   * The rating is computed here rather than left to a dashboard, so "what share
   * of visits had a good LCP" is a property filter instead of a threshold
   * somebody has to remember correctly at query time.
   */
  useReportWebVitals((metric) => {
    if (!KEY) return;
    capture("web_vital", {
      metric: metric.name,
      value: metric.value,
      rating: webVitalRating(metric.name, metric.value),
      // Next reports its own hydration and render timings through this hook as
      // `custom`, which is worth keeping apart from the standard set.
      kind: metric.label,
      path: window.location.pathname,
    });
  });

  return null;
}
