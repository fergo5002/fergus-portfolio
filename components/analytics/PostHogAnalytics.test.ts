import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check, and honest about being one.
 *
 * vitest runs in a `node` environment in this repo, so nothing here mounts the
 * component, no effect runs and no bundle is produced. What this file asserts
 * is that specific lines are still in the source. That is weaker than a
 * behavioural test and it is the right strength for what it guards, which is a
 * property of the **build** rather than of the runtime.
 *
 * ## What it guards
 *
 * Measured on the 2026-08-21 build: a static `import posthog from "posthog-js"`
 * in this component puts a **248 KB** chunk into the layout bundle, so every
 * page on the site downloads the whole SDK before it can hydrate. It was the
 * largest chunk in the repo, larger than the React framework chunk.
 *
 * The reason that is worth a test rather than a comment: it is invisible.
 * Changing the dynamic import to a static one is a one-line tidy-up that makes
 * the file read better, breaks no test, produces no warning, and silently puts
 * a quarter of a megabyte back in front of first paint on a site whose whole
 * SEO story now includes Core Web Vitals. Nothing else in the repo would catch
 * it. `docs/PROGRESS.md` records the same measurement.
 */

const source = readFileSync(
  join(process.cwd(), "components", "analytics", "PostHogAnalytics.tsx"),
  "utf8",
);

describe("PostHogAnalytics keeps the SDK out of the critical path", () => {
  it("imports posthog-js dynamically", () => {
    expect(source).toMatch(/import\(["']posthog-js["']\)/);
  });

  it("never imports posthog-js statically", () => {
    // The mutation this exists for. A static import is the tidier-looking line
    // and it costs 248 KB on every route.
    //
    // `[^\n(]*` rather than `[^(]*`, and the reason is a bug this test had for
    // one run: without the `\n` in the negated class the match ran across
    // several lines from the `react` import into the docblock above, which
    // quotes `import posthog from "posthog-js"` while explaining why not to
    // write it. The guard failed against a file that was already correct.
    expect(source).not.toMatch(/^\s*import\s[^\n(]*from\s+["']posthog-js["']/m);
  });

  it("waits for idle time rather than loading on mount", () => {
    expect(source).toMatch(/requestIdleCallback/);
    // A timeout as well, because idle time can be starved indefinitely and this
    // site's main thread is busy by design for the first few seconds.
    expect(source).toMatch(/IDLE_TIMEOUT_MS/);
  });

  /**
   * The queue is what makes deferring safe rather than merely cheap.
   *
   * LCP and FCP are reported by the browser inside the first second, which is
   * exactly the window the SDK is deliberately absent for. Without somewhere to
   * put them, deferring would silently drop the two most important metrics and
   * leave a chart of INP and CLS looking complete.
   */
  it("queues events captured before the SDK arrives", () => {
    expect(source).toMatch(/pending\.push/);
    expect(source).toMatch(/pending\.splice\(0\)/);
  });

  it("bounds the queue", () => {
    // An unbounded queue fed by a page nobody closes is a leak.
    expect(source).toMatch(/PENDING_LIMIT/);
    expect(source).toMatch(/pending\.length < PENDING_LIMIT/);
  });

  /**
   * Cookieless is Fergus's choice and the failure mode is silent: get it wrong
   * and the site sets tracking cookies on EU visitors with no banner while
   * everything keeps working. `lib/analytics.test.ts` asserts the option value
   * itself; this asserts that this component is still the thing that applies it
   * rather than passing its own hand-written config.
   */
  it("takes its configuration from lib/analytics rather than inlining it", () => {
    expect(source).toMatch(/posthog\.init\(KEY, posthogClientOptions\(\)\)/);
  });

  /**
   * Development must not report.
   *
   * Review caught this as a documentation contradiction and it was worse than
   * that: the doc said development does not report and nothing in the code made
   * it so. The key lives in `.env.local` because the share-of-model publisher
   * needs it on disk, so without this gate every `npm run dev` posted real
   * pageviews and web vitals into the live project beside genuine visitors.
   *
   * The gate has to be on `KEY` itself rather than inside the effect, because
   * `useReportWebVitals` reads `KEY` too and would otherwise keep queueing.
   */
  it("reports only from a production build", () => {
    expect(source).toMatch(/process\.env\.NODE_ENV === "production"/);
    // And the guard must be what defines KEY, not a second check further down
    // that a later edit could drift away from.
    expect(source).toMatch(
      /const KEY =\s*process\.env\.NODE_ENV === "production" \? process\.env\.NEXT_PUBLIC_POSTHOG_KEY : undefined;/,
    );
  });

  it("reads the referrer and campaign tag at mount, not after the import resolves", () => {
    // `location.search` is mutable across a client-side navigation, so reading
    // it inside the `.then` would attribute an arrival to the wrong page.
    //
    // Anchored on `whenIdle(() =>`, the call, not `whenIdle(`, which also
    // matches the function's own definition higher up the file and produced an
    // empty slice that matched nothing.
    const start = source.indexOf("started = true");
    const end = source.indexOf("whenIdle(() =>");
    expect(start, "anchor: started = true").toBeGreaterThan(-1);
    expect(end, "anchor: whenIdle call").toBeGreaterThan(start);

    const mountBlock = source.slice(start, end);
    expect(mountBlock).toMatch(/detectAiEngine/);
    expect(mountBlock).toMatch(/document\.referrer/);
  });

  /**
   * The client half of `tool_run`. `lib/tools/events.test.ts` proves a
   * registered sink receives the event; this proves this component is the
   * thing that registers one, and that it keeps the development gate.
   */
  it("hands browser-side tool runs to the same queue, behind the same gate", () => {
    expect(source).toMatch(
      /registerToolRunSink\(\(event, properties\) => \{\s*if \(!KEY\) return;\s*capture\(event, properties\);\s*\}\);/,
    );
  });
});
