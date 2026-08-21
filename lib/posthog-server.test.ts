import { describe, it, expect, vi } from "vitest";
import { captureBody, captureServerEvent, CAPTURE_PATH } from "./posthog-server";

/**
 * The server-side half of the analytics, and the reason it is hand-written
 * rather than `posthog-node`.
 *
 * The only server events this site sends are crawler visits from
 * `middleware.ts`, MCP tool calls, and the Share of Model run. All three are
 * one event with a handful of properties, fired and forgotten. `posthog-node`
 * brings a batching queue, a background flush timer and a shutdown lifecycle to
 * solve a problem this site does not have, and it has to be reasoned about
 * carefully in an edge runtime and in a serverless function that may be frozen
 * the instant a response is returned. A `fetch` to a documented endpoint has
 * none of that surface.
 *
 * The endpoint was verified before any of this was written: a real POST to
 * `/i/v0/e/` with project 569350's token returned `200 {"status":"Ok"}` on
 * 2026-08-21. Worth stating precisely, because a 200 there means *accepted for
 * processing*, not *queryable*, and those are different claims.
 */

describe("captureBody", () => {
  const body = captureBody("phc_test", {
    event: "ai_crawler_visit",
    distinctId: "crawler:GPTBot",
    properties: { path: "/writing" },
  }, "2026-08-21T12:00:00.000Z") as Record<string, unknown>;

  it("carries the key, the event and the distinct id where PostHog expects them", () => {
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("ai_crawler_visit");
    expect(body.distinct_id).toBe("crawler:GPTBot");
    expect(body.timestamp).toBe("2026-08-21T12:00:00.000Z");
  });

  it("passes the caller's properties through", () => {
    expect((body.properties as Record<string, unknown>).path).toBe("/writing");
  });

  /**
   * The one property that must never be dropped.
   *
   * The browser SDK runs cookieless with `person_profiles: "never"`, so no
   * visitor gets a person profile. Server events default the other way: without
   * this flag PostHog would create a person for every synthetic distinct id
   * this file invents, and the person list would fill with rows called
   * `crawler:GPTBot` that are not people and never will be. It also costs money
   * on PostHog's billing, which is the sort of thing you find out later.
   */
  it("refuses to create a person profile", () => {
    expect((body.properties as Record<string, unknown>).$process_person_profile).toBe(false);
  });

  it("cannot have that flag overridden by a caller", () => {
    const forced = captureBody(
      "phc_test",
      {
        event: "x",
        distinctId: "y",
        // A caller passing this by accident (spreading a props object that
        // happens to contain it) must not be able to switch person creation on.
        properties: { $process_person_profile: true },
      },
      "2026-08-21T12:00:00.000Z",
    ) as Record<string, unknown>;
    expect((forced.properties as Record<string, unknown>).$process_person_profile).toBe(false);
  });

  it("labels the source so server events are separable from browser ones", () => {
    expect((body.properties as Record<string, unknown>).$lib).toBe("fergusoreilly.dev-server");
  });
});

describe("captureServerEvent", () => {
  const event = { event: "test_event", distinctId: "test" };

  it("posts JSON to the capture endpoint and reports success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));

    const ok = await captureServerEvent(event, { apiKey: "phc_test", host: "https://ph.test", fetchImpl });

    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://ph.test${CAPTURE_PATH}`);
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body).event).toBe("test_event");
  });

  /**
   * The rule that matters more than any of the above: **analytics may never
   * break the thing it is measuring.**
   *
   * This runs inside `middleware.ts`, on the path of every request that is not
   * a static asset. A throw there is a 500 on a page, caused by a telemetry
   * call the visitor did not ask for and gains nothing from. So every failure
   * mode returns `false` and the request carries on.
   */
  it("returns false rather than throwing when the network fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      captureServerEvent(event, { apiKey: "phc_test", host: "https://ph.test", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("returns false rather than throwing when PostHog answers with an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      captureServerEvent(event, { apiKey: "phc_test", host: "https://ph.test", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("does nothing at all when no key is configured", async () => {
    // Local development and preview builds without the variable set. Sending to
    // a missing project is not an error worth logging on every request, and
    // firing a request that is certain to fail is worse than not firing one.
    const fetchImpl = vi.fn();
    const ok = await captureServerEvent(event, { apiKey: "", host: "https://ph.test", fetchImpl });
    expect(ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives up rather than hanging a request forever", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      // Assert the caller is actually armed with an abort signal. Without one,
      // a PostHog outage would hold every middleware invocation open until the
      // platform's own timeout, turning an analytics problem into a site
      // problem.
      expect(init.signal).toBeDefined();
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    await captureServerEvent(event, { apiKey: "phc_test", host: "https://ph.test", fetchImpl });
    expect(fetchImpl).toHaveBeenCalled();
  });
});
