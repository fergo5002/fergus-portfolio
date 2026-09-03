import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The headline checker records one `tool_run` on every path out of its
 * action, with the outcome that path means, and never the URL.
 *
 * Runs the real action. `next/server`'s `after` is replaced with something
 * that runs the callback at once (the real one needs a request scope, which is
 * why `lib/after.ts` catches). `next/headers` is replaced so the IP can be
 * chosen per test, because the limiter is real and keyed on it. The page fetch
 * is mocked: the fence and the parser have their own suites, and this file is
 * about what gets recorded, not about what gets fetched.
 */

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (work: () => unknown) => work() };
});

let requestHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(requestHeaders) }));

vi.mock("@/lib/headline-fetch", () => ({ fetchPage: vi.fn() }));

const { headlineCheckAction } = await import("./actions");
const { INITIAL_TOOL_STATE } = await import("./state");
const { fetchPage } = await import("@/lib/headline-fetch");

const GOOD_PAGE = {
  ok: true as const,
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status: 200,
  redirects: 0,
  html: "<html><body><h1>Hello there</h1></body></html>",
};

const form = (url: string) => {
  const fd = new FormData();
  fd.set("url", url);
  return fd;
};

/** Every capture body sent, in order. */
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((c) => JSON.parse(c[1].body) as { event: string; properties: Record<string, unknown> });

describe("headline-check records a tool_run", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(fetchPage).mockResolvedValue(GOOD_PAGE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchPage).mockReset();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it("ok: a report came back", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.1" };
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("example.com"));
    expect(state.status).toBe("done");

    const events = sent(fetchMock);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("tool_run");
    expect(events[0].properties.tool).toBe("headline-check");
    expect(events[0].properties.outcome).toBe("ok");
    expect(typeof events[0].properties.ms).toBe("number");
  });

  it("error: the page could not be read", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.2" };
    vi.mocked(fetchPage).mockResolvedValue({ ok: false, detail: "That address is private." } as never);
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("http://10.0.0.1/"));
    expect(state.status).toBe("failed");
    expect(sent(fetchMock).map((e) => e.properties.outcome)).toEqual(["error"]);
  });

  it("refused: nothing was typed", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.3" };
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("   "));
    expect(state.status).toBe("invalid");
    expect(sent(fetchMock).map((e) => e.properties.outcome)).toEqual(["refused"]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("refused: the courtesy limit", async () => {
    // BUCKET_SIZE is 6. The seventh call from one address is refused, and
    // the recording says so rather than reading as a seventh success.
    requestHeaders = { "x-real-ip": "10.1.0.4" };
    let state = INITIAL_TOOL_STATE;
    for (let i = 0; i < 7; i++) state = await headlineCheckAction(state, form("example.com"));
    expect(state.status).toBe("limited");
    const outcomes = sent(fetchMock).map((e) => e.properties.outcome);
    expect(outcomes).toHaveLength(7);
    expect(outcomes.slice(0, 6).every((o) => o === "ok")).toBe(true);
    expect(outcomes[6]).toBe("refused");
  });

  it("never sends the URL, on any path", async () => {
    const typed = "https://example.com/private-page?token=do-not-record";
    requestHeaders = { "x-real-ip": "10.1.0.5" };
    await headlineCheckAction(INITIAL_TOOL_STATE, form(typed));
    vi.mocked(fetchPage).mockResolvedValue({ ok: false, detail: "nope" } as never);
    await headlineCheckAction(INITIAL_TOOL_STATE, form(typed));
    for (const call of fetchMock.mock.calls) {
      expect(String(call[1].body)).not.toContain("do-not-record");
      expect(String(call[1].body)).not.toContain("private-page");
    }
  });

  it("still answers when PostHog is down", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.6" };
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("example.com"));
    expect(state.status).toBe("done");
  });
});
