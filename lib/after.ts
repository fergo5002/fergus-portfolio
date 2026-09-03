import { after } from "next/server";

/**
 * Schedule work for after the response, and shrug if that is not possible.
 *
 * `after` needs a request scope. It has one on every real request, and it does
 * **not** have one when a handler or an action is called directly, which is
 * exactly what `lib/mcp.test.ts` and `app/tools/headline-check/actions.test.ts`
 * do: they exercise the real code against a plain `Request` or `FormData` to
 * prove the behaviour without standing up a server. Six MCP tests went red the
 * moment `after` was first introduced.
 *
 * Catching is the right answer rather than a workaround, and it is the rule the
 * whole analytics layer is built on applied consistently: telemetry may not
 * change what the protocol answers, and a throw from the recording path would
 * do precisely that. The cost of the fallback is one unrecorded call in a
 * context where there was nothing worth recording anyway.
 *
 * There is deliberately no second guard on the presence of a PostHog key. It
 * would make the tests pass without ever running the work, and a guard that is
 * never exercised is decoration. `captureServerEvent` already returns `false`
 * without a key.
 *
 * `work` may return a promise. `after` waits for it, which is what keeps a
 * serverless function alive long enough for the capture to land.
 */
export function afterResponse(work: () => void | Promise<unknown>): void {
  try {
    after(work);
  } catch {
    // No request scope. Nothing to do, and nothing to say about it.
  }
}
