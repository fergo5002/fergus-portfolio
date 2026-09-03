import { describe, it, expect } from "vitest";
import {
  AI_ENGINES,
  detectAiEngine,
  engineFromReferrer,
  engineFromUtmSource,
  posthogClientOptions,
  POSTHOG_API_HOST,
  POSTHOG_ASSET_HOST,
  POSTHOG_UI_HOST,
  INGEST_PREFIX,
  ingestRewrites,
  webVitalRating,
  mcpCallProperties,
  withMcpClient,
  MCP_CLIENT_INFO_KEY_FOR_TEST,
  TOOL_RUN_EVENT,
  toolRunProperties,
  type ToolOutcome,
  type ToolRunPayload,
} from "./analytics";
import { META } from "./mcp";

/**
 * Referrer classification is the one number in this whole exercise that
 * answers the question Fergus actually asked, so it is worth being precise
 * about what it does and does not claim.
 *
 * It measures **arrivals from an answer engine**: a person read an answer,
 * saw this site cited, and clicked. It does not measure citations. A citation
 * nobody clicks is invisible here, which is why the crawler table exists
 * beside it and why `scripts/share-of-model` exists at all. Three instruments,
 * three different failure modes, and the honest read is the overlap.
 */

describe("engineFromReferrer", () => {
  it.each([
    ["https://chatgpt.com/", "chatgpt"],
    ["https://chat.openai.com/c/abc-123", "chatgpt"],
    ["https://www.perplexity.ai/search/who-is-fergus", "perplexity"],
    ["https://perplexity.ai/", "perplexity"],
    ["https://claude.ai/chat/9f2", "claude"],
    ["https://gemini.google.com/app", "gemini"],
    ["https://copilot.microsoft.com/", "copilot"],
    ["https://meta.ai/", "meta-ai"],
    ["https://you.com/search?q=x", "you"],
    ["https://www.phind.com/search", "phind"],
    ["https://chat.mistral.ai/chat", "mistral"],
    ["https://grok.com/chat/1", "grok"],
    ["https://chat.deepseek.com/", "deepseek"],
    ["https://poe.com/chat/1", "poe"],
  ])("reads %s as %s", (referrer, engine) => {
    expect(engineFromReferrer(referrer)).toBe(engine);
  });

  it("returns null for ordinary referrers", () => {
    expect(engineFromReferrer("https://news.ycombinator.com/item?id=1")).toBeNull();
    expect(engineFromReferrer("https://www.google.com/search?q=fergus")).toBeNull();
    expect(engineFromReferrer("https://fergusoreilly.dev/writing")).toBeNull();
  });

  it("returns null for an absent referrer rather than throwing", () => {
    // A direct visit sends `document.referrer === ""`, which is the single most
    // common input this function will ever see.
    expect(engineFromReferrer("")).toBeNull();
    expect(engineFromReferrer("not a url")).toBeNull();
    expect(engineFromReferrer("javascript:alert(1)")).toBeNull();
  });

  /**
   * The trap that makes this a suffix match on the host rather than a substring
   * match on the string.
   *
   * `referrer.includes("perplexity.ai")` is the obvious implementation and it
   * is wrong in both directions: `https://notperplexity.ai/` is a different
   * site that would be counted, and, far worse, anybody can put
   * `?next=perplexity.ai` on their own URL and manufacture the number. A metric
   * a stranger can inflate from their own page is not a metric.
   */
  it("matches the host, not the string", () => {
    expect(engineFromReferrer("https://notperplexity.ai/")).toBeNull();
    expect(engineFromReferrer("https://perplexity.ai.evil.example/")).toBeNull();
    expect(engineFromReferrer("https://example.com/?ref=https://chatgpt.com/")).toBeNull();
    // A real subdomain still counts.
    expect(engineFromReferrer("https://www.perplexity.ai/")).toBe("perplexity");
  });
});

describe("engineFromUtmSource", () => {
  /**
   * ChatGPT appends `?utm_source=chatgpt.com` to the links it hands out, and
   * that tag survives in places the referrer does not: a link copied out of an
   * answer and pasted into Slack arrives with no referrer at all but keeps the
   * parameter. Reading both is the difference between counting the click and
   * counting the share.
   */
  it.each([
    ["chatgpt.com", "chatgpt"],
    ["openai", "chatgpt"],
    ["perplexity", "perplexity"],
    ["perplexity.ai", "perplexity"],
    ["claude.ai", "claude"],
  ])("reads utm_source=%s as %s", (utm, engine) => {
    expect(engineFromUtmSource(utm)).toBe(engine);
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(engineFromUtmSource("  ChatGPT.com ")).toBe("chatgpt");
  });

  it("returns null for ordinary campaign sources", () => {
    expect(engineFromUtmSource("newsletter")).toBeNull();
    expect(engineFromUtmSource("linkedin")).toBeNull();
    expect(engineFromUtmSource("")).toBeNull();
  });
});

describe("detectAiEngine", () => {
  it("prefers the referrer when both are present and disagree", () => {
    // The referrer is observed by the browser; the query string is whatever the
    // last person to touch the URL left on it. When they conflict, believe the
    // one the visitor could not have edited.
    expect(
      detectAiEngine({ referrer: "https://claude.ai/chat/1", utmSource: "chatgpt.com" }),
    ).toEqual({ engine: "claude", via: "referrer" });
  });

  it("falls back to utm_source when the referrer is empty", () => {
    expect(detectAiEngine({ referrer: "", utmSource: "chatgpt.com" })).toEqual({
      engine: "chatgpt",
      via: "utm",
    });
  });

  it("reports nothing for an ordinary visit", () => {
    expect(detectAiEngine({ referrer: "", utmSource: null })).toBeNull();
    expect(
      detectAiEngine({ referrer: "https://news.ycombinator.com/", utmSource: null }),
    ).toBeNull();
  });

  it("covers every engine in the table from at least one signal", () => {
    // Guards the case where a new engine is added to the type but only wired
    // into one of the two lookups, which would silently halve its detection.
    for (const engine of AI_ENGINES) {
      const hosts = engine.hosts.length > 0;
      const utms = engine.utmSources.length > 0;
      expect(hosts || utms, engine.id).toBe(true);
    }
  });

  it("has no duplicate engine ids", () => {
    const ids = AI_ENGINES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("posthogClientOptions", () => {
  const options = posthogClientOptions();

  /**
   * Fergus chose cookieless on 2026-08-21 and this is the line that delivers
   * it. It is asserted rather than trusted because the failure is silent: get
   * it wrong and the site sets tracking cookies on EU visitors with no banner,
   * everything still works, every test still passes, and nothing tells you.
   */
  it("runs cookieless, always", () => {
    expect(options.cookieless_mode).toBe("always");
  });

  it("keeps person profiles off, because a cookieless visitor has no identity to profile", () => {
    expect(options.person_profiles).toBe("never");
  });

  /**
   * Session replay was the other half of Fergus's answer and it cannot coexist
   * with the line above: PostHog disables replay when it has nowhere to keep a
   * session id. Rather than let it fail quietly and look like a bug later, it
   * is switched off explicitly and the reason is written down here and in the
   * module.
   */
  it("disables session replay explicitly rather than leaving it to fail quietly", () => {
    expect(options.disable_session_recording).toBe(true);
  });

  it("sends events through this site's own origin", () => {
    // The whole point of the proxy. If this ever reverts to the PostHog host,
    // roughly a third of a developer audience disappears from the numbers with
    // no error anywhere.
    expect(options.api_host).toBe(INGEST_PREFIX);
    expect(options.ui_host).toBe(POSTHOG_UI_HOST);
  });

  it("captures pageviews on client-side navigation", () => {
    // This site is an App Router SPA after first paint: without this, every
    // visit records exactly one pageview no matter how many routes are read.
    expect(options.capture_pageview).toBe("history_change");
  });

  it("pins the defaults date rather than tracking whatever ships next", () => {
    // `defaults` is PostHog's behaviour-versioning switch. Leaving it unset
    // opts into legacy behaviour; setting it to a moving target means an SDK
    // upgrade can change what is collected without a line of this repo
    // changing. Pinned, and bumped deliberately.
    expect(options.defaults).toBe("2026-05-30");
  });
});

describe("mcpCallProperties", () => {
  it("names the tool on a tools/call", () => {
    const t = mcpCallProperties(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile" } },
      200,
    );
    expect(t?.event).toBe("mcp_tool_call");
    expect(t?.properties.tool).toBe("get_profile");
    expect(t?.properties.ok).toBe(true);
  });

  it("records other methods without pretending they are tool calls", () => {
    const t = mcpCallProperties({ jsonrpc: "2.0", id: 1, method: "tools/list" }, 200);
    expect(t?.event).toBe("mcp_request");
    expect(t?.properties.method).toBe("tools/list");
  });

  it("marks a failed call as not ok", () => {
    const t = mcpCallProperties({ method: "tools/call", params: { name: "x" } }, 413);
    expect(t?.properties.ok).toBe(false);
    expect(t?.properties.status).toBe(413);
  });

  it("counts a batch rather than expanding it", () => {
    const t = mcpCallProperties([{ method: "tools/list" }, { method: "tools/list" }], 200);
    expect(t?.properties.method).toBe("batch");
    expect(t?.properties.count).toBe(2);
  });

  it("records nothing for a body that is not a JSON-RPC message", () => {
    expect(mcpCallProperties(null, 400)).toBeNull();
    expect(mcpCallProperties("garbage", 400)).toBeNull();
    expect(mcpCallProperties({ jsonrpc: "2.0" }, 400)).toBeNull();
  });

  /**
   * Both of these fields come out of a request body a stranger wrote, so the
   * only question that matters is whether an unbounded one can get through.
   */
  it("truncates attacker-supplied strings", () => {
    const t = mcpCallProperties(
      { method: "tools/call", params: { name: "a".repeat(5000) } },
      200,
    );
    expect((t?.properties.tool as string).length).toBeLessThanOrEqual(120);

    const long = mcpCallProperties({ method: "b".repeat(5000) }, 200);
    expect((long?.properties.method as string).length).toBeLessThanOrEqual(120);
  });

  it("does not choke on a non-string tool name", () => {
    const t = mcpCallProperties({ method: "tools/call", params: { name: { evil: true } } }, 200);
    expect(t?.properties.tool).toBe("unknown");
  });
});

/**
 * Client identity, and the correction behind it.
 *
 * This was read from the `Mcp-Name` header until 2026-08-21, on my own claim
 * that revision 2026-07-28 carries the client name there. It does not:
 * `Mcp-Name` is routing metadata that must equal `params.name`, and `lib/mcp.ts`
 * rejects a mismatch. Caught by a live request coming back `400 Header
 * mismatch`, after it had already written a row whose "client" was a tool name.
 */
describe("client identity from the protocol", () => {
  const modern = (clientName: string) => ({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "get_profile",
      _meta: { "io.modelcontextprotocol/clientInfo": { name: clientName, version: "1.0.0" } },
    },
  });

  it("reads a modern client's declared name off _meta", () => {
    const t = mcpCallProperties(modern("mcp-remote/0.1.29"), 200)!;
    expect(t.distinctId).toBe("mcp:mcp-remote/0.1.29");
    expect(t.properties.client).toBe("mcp-remote/0.1.29");
    expect(t.properties.client_source).toBe("protocol");
  });

  it("reads a legacy client's name off initialize", () => {
    const t = mcpCallProperties(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "ExampleClient", version: "1.0.0" } },
      },
      200,
    )!;
    expect(t.properties.client).toBe("ExampleClient");
    expect(t.properties.client_source).toBe("protocol");
  });

  it("says nothing about the client when nothing declared one", () => {
    const t = mcpCallProperties({ jsonrpc: "2.0", id: 1, method: "tools/list" }, 200)!;
    expect(t.distinctId).toBe("mcp:unknown");
    expect(t.properties.client).toBeUndefined();
    expect(t.properties.client_source).toBeUndefined();
  });

  it("does not choke on a malformed clientInfo", () => {
    for (const params of [
      { _meta: { "io.modelcontextprotocol/clientInfo": "a string" } },
      { _meta: { "io.modelcontextprotocol/clientInfo": { name: 42 } } },
      { _meta: { "io.modelcontextprotocol/clientInfo": { name: "   " } } },
      { _meta: [] },
      { clientInfo: null },
    ]) {
      const t = mcpCallProperties({ jsonrpc: "2.0", id: 1, method: "tools/list", params }, 200)!;
      expect(t.distinctId, JSON.stringify(params)).toBe("mcp:unknown");
    }
  });

  it("truncates a declared name", () => {
    const t = mcpCallProperties(modern("c".repeat(5000)), 200)!;
    expect((t.properties.client as string).length).toBeLessThanOrEqual(120);
  });

  /**
   * The `_meta` key is a literal in `lib/analytics.ts` rather than an import,
   * so that `middleware.ts` does not drag the whole MCP server and the
   * `content/` corpus into the edge bundle it runs in front of every request.
   * That trade is only safe while the two agree, so the test does the importing.
   */
  it("uses the same _meta key that lib/mcp.ts implements", () => {
    expect(MCP_CLIENT_INFO_KEY_FOR_TEST).toBe(META.clientInfo);
  });
});

describe("withMcpClient", () => {
  const base = { event: "mcp_tool_call", distinctId: "mcp:unknown", properties: { tool: "x" } };

  it("falls back to the User-Agent when the protocol declared nothing", () => {
    // A real user agent shape, with the slash, semicolon and parentheses that a
    // friendly display name does not have. The old test used "Claude Desktop",
    // which was the shape of the header this no longer reads.
    const ua = "node/22.3.0 (mcp-remote; +https://example.invalid)";
    const t = withMcpClient(base, ua);
    expect(t.distinctId).toBe(`mcp:${ua}`);
    expect(t.properties.client).toBe(ua);
    expect(t.properties.client_source).toBe("user-agent");
  });

  it("never overwrites an identity the client declared itself", () => {
    const declared = {
      ...base,
      distinctId: "mcp:mcp-remote/0.1.29",
      properties: { tool: "x", client: "mcp-remote/0.1.29", client_source: "protocol" },
    };
    const t = withMcpClient(declared, "curl/8.7.1");
    expect(t.distinctId).toBe("mcp:mcp-remote/0.1.29");
    expect(t.properties.client_source).toBe("protocol");
  });

  it("leaves the fallback in place when nothing identifies the caller", () => {
    expect(withMcpClient(base, null).distinctId).toBe("mcp:unknown");
    expect(withMcpClient(base, "   ").distinctId).toBe("mcp:unknown");
  });

  it("truncates a user agent", () => {
    expect(withMcpClient(base, "c".repeat(5000)).distinctId.length).toBeLessThanOrEqual(124);
  });
});

describe("webVitalRating", () => {
  /**
   * The thresholds are Google's, and they are asserted at the boundary in both
   * directions because "good" is defined as at-or-under rather than under, and
   * an off-by-one here would silently reclassify a chunk of real visits.
   */
  it.each([
    ["LCP", 2500, "good"],
    ["LCP", 2500.1, "needs-improvement"],
    ["LCP", 4000, "needs-improvement"],
    ["LCP", 4000.1, "poor"],
    ["INP", 200, "good"],
    ["INP", 501, "poor"],
    ["CLS", 0.1, "good"],
    ["CLS", 0.11, "needs-improvement"],
    ["CLS", 0.26, "poor"],
    ["FCP", 1800, "good"],
    ["TTFB", 800, "good"],
    ["TTFB", 1801, "poor"],
  ])("rates %s at %s as %s", (name, value, expected) => {
    expect(webVitalRating(name, value as number)).toBe(expected);
  });

  it("declines to rate a metric it has no threshold for", () => {
    // Next reports its own hydration and render timings through the same hook.
    // Inventing a verdict for them would put a made-up judgement on a chart
    // beside four real ones, which is worse than an honest gap.
    expect(webVitalRating("Next.js-hydration", 120)).toBe("unrated");
    expect(webVitalRating("", 1)).toBe("unrated");
  });
});

describe("ingestRewrites", () => {
  const rules = ingestRewrites();

  it("routes assets and events to the right PostHog hosts", () => {
    const asset = rules.find((r) => r.source.includes("/static/"));
    expect(asset?.destination).toBe(`${POSTHOG_ASSET_HOST}/static/:path*`);

    const events = rules.find((r) => r.source === `${INGEST_PREFIX}/:path*`);
    expect(events?.destination).toBe(`${POSTHOG_API_HOST}/:path*`);
  });

  /**
   * Rewrites are matched in order and `/ingest/:path*` matches everything under
   * the prefix, including `/ingest/static/array.js`. If the static rule is not
   * first, the SDK bundle is requested from the event host, which answers it
   * with a 404 and no analytics ever loads.
   */
  it("puts the more specific asset rules before the catch-all", () => {
    const catchAll = rules.findIndex((r) => r.source === `${INGEST_PREFIX}/:path*`);
    const specific = rules.filter((r) => r.source !== `${INGEST_PREFIX}/:path*`);
    expect(specific.length).toBeGreaterThan(0);
    for (const rule of specific) {
      expect(rules.indexOf(rule), rule.source).toBeLessThan(catchAll);
    }
  });

  it("keeps every rule under the ingest prefix", () => {
    // A rewrite that escaped the prefix would start proxying real site routes
    // to PostHog, which is the loudest possible way to take the site down.
    for (const rule of rules) {
      expect(rule.source.startsWith(`${INGEST_PREFIX}/`), rule.source).toBe(true);
    }
  });
});

/**
 * The toolshed's one privacy rule, as a value: `tool_run` carries the slug,
 * the outcome and the time, and never the input. The whitelist is what makes
 * that true even for a caller who spreads their whole state into the payload.
 */
describe("tool runs", () => {
  it("names the event tool_run", () => {
    expect(TOOL_RUN_EVENT).toBe("tool_run");
  });

  it("records the slug, the outcome and the time, and nothing else", () => {
    const props = toolRunProperties({ tool: "headline-check", outcome: "ok", ms: 412.6 });
    expect(props).toEqual({ tool: "headline-check", outcome: "ok", ms: 413 });
    expect(Object.keys(props).sort()).toEqual(["ms", "outcome", "tool"]);
  });

  it("drops anything a careless caller spreads in, the URL above all", () => {
    const leaky = {
      tool: "headline-check",
      outcome: "error",
      ms: 5,
      url: "https://example.com/private?token=secret",
      input: "pasted text",
    } as ToolRunPayload;
    const props = toolRunProperties(leaky) as Record<string, unknown>;
    expect(props.url).toBeUndefined();
    expect(props.input).toBeUndefined();
    expect(JSON.stringify(props)).not.toContain("secret");
  });

  it("truncates the slug and clamps the time", () => {
    expect(toolRunProperties({ tool: "a".repeat(500), outcome: "ok", ms: 1 }).tool.length).toBeLessThanOrEqual(120);
    expect(toolRunProperties({ tool: "x", outcome: "ok", ms: -20 }).ms).toBe(0);
    expect(toolRunProperties({ tool: "x", outcome: "ok", ms: Number.NaN }).ms).toBe(0);
    expect(toolRunProperties({ tool: "", outcome: "ok", ms: 1 }).tool).toBe("unknown");
  });

  it("refuses to invent an outcome", () => {
    expect(toolRunProperties({ tool: "x", outcome: "won" as ToolOutcome, ms: 1 }).outcome).toBe("error");
  });
});
