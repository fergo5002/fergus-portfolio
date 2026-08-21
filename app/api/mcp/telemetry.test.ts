import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The `/api/mcp` telemetry wiring, end to end through the real route handler.
 *
 * ## Why this file exists
 *
 * Review found the gap and was right about it. `mcpCallProperties` and
 * `withMcpClient` are thoroughly tested in `lib/analytics.test.ts`, and
 * `lib/mcp.test.ts` proves the protocol, but **nothing tested the glue**: that
 * the route hands the parsed message to the right function, passes the status it
 * actually returned, reads the client name off the right header, and schedules
 * the send rather than awaiting it.
 *
 * That is exactly the shape of the middleware bug caught an hour earlier by a
 * container rather than a test: every assertion was about the inputs to a
 * decision, none about what the wired-up thing did. Twice in one change is a
 * pattern, not bad luck.
 *
 * ## How it gets a look in
 *
 * Two mocks, both narrow. `next/server`'s `after` is replaced with something
 * that runs the callback immediately, because the real one needs a request scope
 * the route never has under vitest (that is why `afterResponse` catches). And
 * `fetch` is stubbed so the capture can be observed without a network.
 *
 * `NEXT_PUBLIC_POSTHOG_KEY` has to be set, because `captureServerEvent`
 * correctly does nothing without it. Set per test and restored, so the rest of
 * the suite is unaffected.
 */

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (work: () => void) => work() };
});

const { POST } = await import("./route");

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://fergusoreilly.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/** The JSON body of the one capture that was sent, or `null` if none was. */
function captured(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> | null {
  if (fetchMock.mock.calls.length === 0) return null;
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("/api/mcp telemetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it("records a tools/call with the tool that was called", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile" } }),
    );
    expect(res.status).toBe(200);

    const body = captured(fetchMock);
    expect(body, "no capture was sent").not.toBeNull();
    expect(body!.event).toBe("mcp_tool_call");
    const props = body!.properties as Record<string, unknown>;
    expect(props.tool).toBe("get_profile");
    expect(props.ok).toBe(true);
    // The guarantee that server events never create a person, asserted here as
    // well as in `lib/posthog-server.test.ts`, because this is the caller most
    // likely to be hit by strangers.
    expect(props.$process_person_profile).toBe(false);
  });

  /**
   * The client identity comes from `User-Agent`, and this test exists because
   * the first version took it from `Mcp-Name` on a claim I made from memory.
   *
   * `Mcp-Name` is per-request routing metadata that must equal `params.name`.
   * `lib/mcp.ts` rejects a request where they disagree, which is exactly how it
   * was caught: a live `tools/call` carrying `Mcp-Name: post-deploy-verification`
   * came back `400 Header mismatch`. Every row would have been labelled with the
   * tool name and called the client.
   */
  it("takes the client identity from the User-Agent, not from Mcp-Name", async () => {
    await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile" } }, {
        "user-agent": "claude-desktop/1.4",
        // Present and legal, because it agrees with `params.name`. If this ever
        // becomes the client label again, the assertions below go red.
        "Mcp-Name": "get_profile",
      }),
    );

    const body = captured(fetchMock)!;
    expect(body.distinct_id).toBe("mcp:claude-desktop/1.4");
    expect((body.properties as Record<string, unknown>).client).toBe("claude-desktop/1.4");
    expect(body.distinct_id).not.toBe("mcp:get_profile");
  });

  it("falls back to an unknown client when nothing identifies the caller", async () => {
    await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(captured(fetchMock)!.distinct_id).toBe("mcp:unknown");
  });

  it("records a non-tool request as a request, not as a tool call", async () => {
    await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

    const body = captured(fetchMock)!;
    expect(body.event).toBe("mcp_request");
    expect((body.properties as Record<string, unknown>).method).toBe("tools/list");
  });

  /**
   * The status has to be the one the route actually returned, not an assumed
   * 200. Without this, every row in the table would read as a success and the
   * only genuinely interesting question about this endpoint ("are agents
   * failing to use it?") would be unanswerable.
   */
  /**
   * Asserted as an equality against the real response rather than against a
   * hard-coded number, and that is deliberate rather than lazy.
   *
   * The first draft of this test set `content-length: 99999999` by hand to force
   * a 413 and asserted that literal. It went red with a 400, because `Request`
   * recomputes `content-length` from the body and throws the header away, so the
   * test was really measuring a protocol path I had guessed at. The invariant
   * worth pinning is not "this input yields 413", it is **"whatever status went
   * back to the caller is the status that gets recorded"**. Without that, every
   * row on the chart reads as a success and the one genuinely interesting
   * question about this endpoint, whether agents are failing to use it, cannot
   * be answered.
   */
  it("records the status the route really returned, whatever it was", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    const props = captured(fetchMock)!.properties as Record<string, unknown>;

    expect(props.status).toBe(res.status);
    expect(props.ok).toBe(res.status >= 200 && res.status < 300);
  });

  /**
   * A status that is **not** 200, which is the only version of the test above
   * that can actually fail.
   *
   * The mutation run caught this: replacing `reply.status` with a hard-coded
   * `200` left the suite green, because every case exercised happened to return
   * 200 and an equality against a constant is satisfied by that constant. The
   * assertion looked like it was checking the wiring and was checking nothing.
   *
   * A JSON-RPC notification is the case to use: no `id`, so the transport
   * requires 202 and an empty body, and the message still parses so it is still
   * observed and still recorded.
   */
  it("records a 202 as a 202, so the assertion above is not satisfied by a constant", async () => {
    const res = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(res.status, "a notification must get 202").toBe(202);

    const props = captured(fetchMock)!.properties as Record<string, unknown>;
    expect(props.status).toBe(202);
    expect(props.ok).toBe(true);
  });

  it("records nothing for a body that is not JSON", async () => {
    const res = await POST(
      new Request("https://fergusoreilly.dev/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    // A parse error is a real HTTP error here, not a JSON-RPC error object with
    // a 200 around it. Asserted because I assumed the opposite and was wrong.
    expect(res.status).toBe(400);
    // Nothing is recorded: the parse failed, so there is no message to describe
    // and an event claiming to know what was asked for would be inventing it.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still answers correctly when PostHog is unreachable", async () => {
    // The rule the whole analytics layer is built on: measuring must never
    // break the thing being measured. A dead PostHog is an MCP server that
    // still works.
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile" } }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { result?: unknown };
    expect(payload.result).toBeTruthy();
  });

  it("sends nothing at all when no project key is configured", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
