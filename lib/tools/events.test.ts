import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerToolRunSink, resetToolRunSink, toolRunEvent, trackToolRun } from "./events";

/**
 * Both ways out. On the server the event goes through `captureServerEvent`
 * over `fetch`, the same path `mcp_tool_call` takes. In a browser it goes to
 * whatever sink `PostHogAnalytics.tsx` registered, which is that component's
 * own queue. Neither path may ever see the input, and the whitelist in
 * `lib/analytics.ts` is tested there; here the question is only whether the
 * right door opens.
 */

const captured = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.length ? JSON.parse(fetchMock.mock.calls[0][1].body) : null;

describe("toolRunEvent", () => {
  it("keys the server event on the tool, not on a person", () => {
    const event = toolRunEvent({ tool: "headline-check", outcome: "ok", ms: 12 });
    expect(event.event).toBe("tool_run");
    expect(event.distinctId).toBe("tool:headline-check");
    expect(event.properties).toEqual({ tool: "headline-check", outcome: "ok", ms: 12 });
  });
});

describe("trackToolRun", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetToolRunSink();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it("sends through the server path when there is no window", async () => {
    await trackToolRun({ tool: "headline-check", outcome: "refused", ms: 3 });
    const body = captured(fetchMock);
    expect(body, "no capture was sent").not.toBeNull();
    expect(body.event).toBe("tool_run");
    expect(body.distinct_id).toBe("tool:headline-check");
    expect(body.properties.outcome).toBe("refused");
    // The guarantee server events never create a person, asserted at the
    // caller most likely to be hit by strangers.
    expect(body.properties.$process_person_profile).toBe(false);
  });

  it("sends nothing from the server without a project key", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await trackToolRun({ tool: "headline-check", outcome: "ok", ms: 3 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands the event to the registered sink when there is a window", async () => {
    vi.stubGlobal("window", {});
    const sink = vi.fn();
    registerToolRunSink(sink);
    await trackToolRun({ tool: "drift", outcome: "ok", ms: 80 });
    expect(sink).toHaveBeenCalledWith("tool_run", { tool: "drift", outcome: "ok", ms: 80 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues a browser event fired before the sink exists, and drains it on registration", async () => {
    vi.stubGlobal("window", {});
    await trackToolRun({ tool: "drift", outcome: "error", ms: 1 });
    const sink = vi.fn();
    registerToolRunSink(sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe("tool_run");
  });
});
