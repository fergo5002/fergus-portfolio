import { TOOL_RUN_EVENT, toolRunProperties, type ToolRunPayload } from "@/lib/analytics";
import { captureServerEvent, type ServerEvent } from "@/lib/posthog-server";

/**
 * Recording one run of a tool, from wherever the run happened.
 *
 * Two callers, two paths, one function. A server action (the headline checker)
 * calls this inside `afterResponse`, and it goes out over `fetch` exactly as
 * `mcp_tool_call` does from `app/api/mcp/route.ts`. A browser-only tool
 * (Drift, Relief) calls it from a client component, and it goes to the sink
 * `components/analytics/PostHogAnalytics.tsx` registered, which is that
 * component's queue: bounded, drained when the SDK arrives, gated on the
 * project key so development reports nothing.
 *
 * This module imports nothing from `next/server` and nothing marked
 * `"use client"`, and that is what makes both callers possible. A `"use client"`
 * export called from the server throws at call time; `next/server` in a client
 * bundle fails at build time. So the client side is inverted: the component
 * registers itself here, and this file knows nothing about it.
 *
 * The payload is whitelisted in `lib/analytics.ts`. Nothing here adds a field.
 */

export type ToolRunSink = (event: string, properties: Record<string, unknown>) => void;

let clientSink: ToolRunSink | null = null;

/**
 * Runs that happen before the sink is registered. In practice that cannot
 * happen (the layout's analytics component evaluates before any tool renders),
 * and the queue costs six lines, so it is there rather than assumed.
 */
const BEFORE_SINK_LIMIT = 20;
const beforeSink: Array<{ event: string; properties: Record<string, unknown> }> = [];

/** Called once, at module scope, by `PostHogAnalytics.tsx`. */
export function registerToolRunSink(sink: ToolRunSink): void {
  clientSink = sink;
  for (const queued of beforeSink.splice(0)) sink(queued.event, queued.properties);
}

/** Test seam. Nothing in the application calls this. */
export function resetToolRunSink(): void {
  clientSink = null;
  beforeSink.length = 0;
}

/**
 * The server event for one run. Keyed `tool:<slug>` rather than on anything
 * about the visitor, so PostHog's unique counts read "how many tools ran"
 * and never "how many people", which a cookieless site cannot know and must
 * not pretend to. Person profiles are refused by `captureBody` regardless.
 */
export function toolRunEvent(
  payload: ToolRunPayload,
): ServerEvent & { properties: Record<string, unknown> } {
  const properties = toolRunProperties(payload);
  return { event: TOOL_RUN_EVENT, distinctId: `tool:${properties.tool}`, properties };
}

/**
 * Record a run. Resolves once the server capture has been attempted, or at
 * once in the browser. Never throws: `captureServerEvent` has no throwing path
 * and a sink is a plain function call.
 */
export async function trackToolRun(payload: ToolRunPayload): Promise<void> {
  const event = toolRunEvent(payload);
  if (typeof window === "undefined") {
    await captureServerEvent(event);
    return;
  }
  if (clientSink) clientSink(event.event, event.properties);
  else if (beforeSink.length < BEFORE_SINK_LIMIT) {
    beforeSink.push({ event: event.event, properties: event.properties });
  }
}
