import { POSTHOG_API_HOST } from "./analytics";

/**
 * Sending an event to PostHog from the server, over `fetch` and nothing else.
 *
 * ## Why not `posthog-node`
 *
 * The same reason `lib/contact-server.ts` talks to Resend over plain `fetch`:
 * the SDK solves problems this site does not have and brings lifecycle that is
 * awkward in the two places this code actually runs.
 *
 * `posthog-node` batches events in memory and flushes them on a timer, which
 * means it needs a `shutdown()` at the end of every serverless invocation or
 * events are lost when the container freezes. Two of the three callers here
 * (`middleware.ts` and `app/api/mcp/route.ts`) send exactly one event and then
 * return a response, so the queue is pure overhead and the flush is a footgun.
 * The third is a Node script that exits. A single POST has none of that.
 *
 * ## The endpoint
 *
 * `POST /i/v0/e/` with a JSON body. Verified against project 569350 on
 * 2026-08-21: `200 {"status":"Ok"}`. That response means **accepted for
 * processing**. It is not a promise the event is queryable, and the two were
 * confirmed separately.
 *
 * ## The rule this file is built around
 *
 * **Analytics may never break the thing it is measuring.** `captureServerEvent`
 * has no throwing path. A missing key, a dead network, a 503, a timeout: all of
 * them return `false` and let the request carry on. `middleware.ts` runs this on
 * requests that are serving real pages to real people, and a visitor should
 * never see a 500 caused by telemetry they did not ask for.
 */

/** The capture path, exported so the test can assert the URL is built from it. */
export const CAPTURE_PATH = "/i/v0/e/";

/** How long to wait before abandoning a capture. */
const TIMEOUT_MS = 2500;

export type ServerEvent = {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
};

/**
 * Build the request body.
 *
 * Pure, and separated from the sending so the shape can be asserted without a
 * network. `timestamp` is a parameter rather than read from the clock for the
 * same reason.
 */
export function captureBody(apiKey: string, event: ServerEvent, timestamp: string): unknown {
  return {
    api_key: apiKey,
    event: event.event,
    distinct_id: event.distinctId,
    timestamp,
    properties: {
      ...event.properties,
      // Both of these are set **after** the spread, deliberately. A caller
      // spreading a properties object that happens to contain either key must
      // not be able to change them: without the ordering, one stray property
      // switches on person creation for every synthetic id this file invents,
      // and PostHog's person list fills with rows called `crawler:GPTBot` that
      // are not people, cannot become people, and are billed as people.
      $process_person_profile: false,
      $lib: "fergusoreilly.dev-server",
    },
  };
}

export type CaptureOptions = {
  apiKey?: string;
  host?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

/**
 * Send one event. Resolves `true` if PostHog accepted it, `false` otherwise.
 *
 * Never throws, never retries. A retry would mean holding a request open longer
 * to improve a number nobody is waiting on.
 */
export async function captureServerEvent(
  event: ServerEvent,
  options: CaptureOptions = {},
): Promise<boolean> {
  const apiKey = options.apiKey ?? process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
  // The key is only absent in local development and in a preview that has not
  // been given the variable. Firing a request certain to be rejected is worse
  // than not firing one, and logging it on every request would be noise.
  if (!apiKey) return false;

  const host = options.host ?? POSTHOG_API_HOST;
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const now = options.now ?? (() => new Date());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await doFetch(`${host}${CAPTURE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(captureBody(apiKey, event, now().toISOString())),
      signal: controller.signal,
      // Analytics must not be served from a cache, and must not populate one.
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
