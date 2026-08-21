import type { PostHogConfig } from "posthog-js";

/**
 * Everything this site knows about measuring itself, in one testable place.
 *
 * Three separate jobs live here because they share the same handful of
 * constants and would otherwise be spread across a config file, a client
 * component and a middleware:
 *
 * 1. **Where PostHog is**, and the fact that this site talks to it through its
 *    own origin rather than directly.
 * 2. **Which answer engine sent a visitor**, read from the referrer and from
 *    the campaign tag, because the two disagree more often than you would think.
 * 3. **How the browser SDK is configured**, as a value rather than as an
 *    argument buried in a `useEffect`, so the choices can be asserted.
 *
 * The rule that shaped all three: an analytics decision that is wrong should
 * fail a test, not quietly produce a plausible number. Every option in
 * `posthogClientOptions` that would still "work" if it were wrong has an
 * assertion in `lib/analytics.test.ts` saying what it must be and why.
 */

/* ------------------------------------------------------------------ */
/* Where PostHog is                                                     */
/* ------------------------------------------------------------------ */

/**
 * Project 569350, US Cloud. Read off the project's own settings page on
 * 2026-08-21 rather than guessed: the EU and US clouds are different hosts and
 * pointing at the wrong one fails as a silent nothing, not as an error.
 */
export const POSTHOG_API_HOST = "https://us.i.posthog.com";
/** The SDK bundle lives on a separate host from the event endpoint. */
export const POSTHOG_ASSET_HOST = "https://us-assets.i.posthog.com";
/**
 * Where a human goes to look at the data. Set as `ui_host` so the SDK's
 * "view recording"-style deep links point at the app rather than at the
 * ingestion host, which serves no UI and would 404.
 */
export const POSTHOG_UI_HOST = "https://us.posthog.com";

/**
 * The path this site's own origin serves PostHog through.
 *
 * ## Why proxy at all
 *
 * Every mainstream blocker ships a rule for `*.i.posthog.com`. On a general
 * audience that costs a few percent; on an audience of developers, who are the
 * only people who visit this site, it is closer to a third and it is not a
 * random third, it is the most technical visitors. Unproxied numbers here would
 * not be slightly low, they would be biased in the exact direction that makes
 * them useless.
 *
 * ## What it costs
 *
 * Requests to `/ingest/*` are rewritten to PostHog by `next.config.ts`, which
 * means they pass through this project's Vercel deployment instead of going
 * straight out. That is real, billable traffic. It is worth it, but it is worth
 * knowing about before the invoice explains it.
 */
export const INGEST_PREFIX = "/ingest";

export type RewriteRule = { source: string; destination: string };

/**
 * The rewrite rules that make `INGEST_PREFIX` work.
 *
 * **Order is load-bearing.** `/ingest/:path*` matches everything under the
 * prefix, `/ingest/static/array.js` included. If the asset rules are not ahead
 * of it, the SDK bundle is fetched from the event host, that host answers 404,
 * the script never loads and analytics is silently absent while the rewrite
 * itself looks fine. The test asserts the ordering rather than the rules.
 */
export function ingestRewrites(): RewriteRule[] {
  return [
    { source: `${INGEST_PREFIX}/static/:path*`, destination: `${POSTHOG_ASSET_HOST}/static/:path*` },
    { source: `${INGEST_PREFIX}/array/:path*`, destination: `${POSTHOG_ASSET_HOST}/array/:path*` },
    { source: `${INGEST_PREFIX}/:path*`, destination: `${POSTHOG_API_HOST}/:path*` },
  ];
}

/* ------------------------------------------------------------------ */
/* Which answer engine sent this visitor                                */
/* ------------------------------------------------------------------ */

export type AiEngineId =
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "copilot"
  | "meta-ai"
  | "you"
  | "phind"
  | "mistral"
  | "grok"
  | "deepseek"
  | "poe";

export type AiEngine = {
  readonly id: AiEngineId;
  /** Registrable hosts. Matched as the host itself or any subdomain of it. */
  readonly hosts: readonly string[];
  /** Values seen in `utm_source`, lower-cased. */
  readonly utmSources: readonly string[];
};

export const AI_ENGINES: readonly AiEngine[] = [
  {
    id: "chatgpt",
    hosts: ["chatgpt.com", "chat.openai.com", "openai.com"],
    // ChatGPT appends `?utm_source=chatgpt.com` to the links in its answers.
    utmSources: ["chatgpt.com", "chatgpt", "openai"],
  },
  { id: "perplexity", hosts: ["perplexity.ai"], utmSources: ["perplexity", "perplexity.ai"] },
  { id: "claude", hosts: ["claude.ai"], utmSources: ["claude", "claude.ai"] },
  {
    id: "gemini",
    hosts: ["gemini.google.com", "bard.google.com"],
    utmSources: ["gemini", "gemini.google.com"],
  },
  {
    id: "copilot",
    hosts: ["copilot.microsoft.com", "m365.cloud.microsoft"],
    utmSources: ["copilot", "copilot.microsoft.com"],
  },
  { id: "meta-ai", hosts: ["meta.ai"], utmSources: ["meta.ai"] },
  { id: "you", hosts: ["you.com"], utmSources: ["you.com"] },
  { id: "phind", hosts: ["phind.com"], utmSources: ["phind", "phind.com"] },
  { id: "mistral", hosts: ["chat.mistral.ai", "lechat.mistral.ai"], utmSources: ["mistral", "lechat"] },
  { id: "grok", hosts: ["grok.com", "x.ai"], utmSources: ["grok", "grok.com"] },
  { id: "deepseek", hosts: ["chat.deepseek.com"], utmSources: ["deepseek"] },
  { id: "poe", hosts: ["poe.com"], utmSources: ["poe.com"] },
];

/**
 * `true` when `host` is `domain` or a subdomain of it.
 *
 * A suffix check on the parsed host rather than `referrer.includes(domain)`,
 * and the difference matters twice. `notperplexity.ai` is a different website
 * that a substring test would count. And anybody can put `?ref=chatgpt.com` on
 * a URL of their own, so a substring test over the whole referrer string makes
 * the headline GEO number something a stranger can manufacture from their own
 * page. A metric an outsider can inflate is not a metric.
 */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * The answer engine behind a referrer, or `null`.
 *
 * Never throws. The commonest input by a wide margin is `""`, because that is
 * what `document.referrer` gives for a direct visit, and the second commonest
 * is something that is not a URL at all.
 */
export function engineFromReferrer(referrer: string | null | undefined): AiEngineId | null {
  if (!referrer) return null;

  let host: string;
  try {
    const url = new URL(referrer);
    // `new URL("javascript:alert(1)")` parses happily and yields an empty host,
    // so the protocol is checked rather than assumed from the parse succeeding.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;

  for (const engine of AI_ENGINES) {
    if (engine.hosts.some((domain) => hostMatches(host, domain))) return engine.id;
  }
  return null;
}

/**
 * The answer engine behind a `utm_source`, or `null`.
 *
 * Worth reading as well as the referrer because the two survive different
 * things. A link copied out of a ChatGPT answer and pasted into Slack arrives
 * with no referrer at all and keeps its `utm_source`; a click straight out of
 * the answer arrives with both. Reading only the referrer therefore misses the
 * share, which is the more valuable of the two events.
 */
export function engineFromUtmSource(utmSource: string | null | undefined): AiEngineId | null {
  if (!utmSource) return null;
  const value = utmSource.trim().toLowerCase();
  if (!value) return null;

  for (const engine of AI_ENGINES) {
    if (engine.utmSources.includes(value)) return engine.id;
  }
  return null;
}

export type AiArrival = { engine: AiEngineId; via: "referrer" | "utm" };

/**
 * Combine both signals.
 *
 * The referrer wins when they disagree, and the reason is trust rather than
 * precedence: the referrer is set by the browser from where the visitor
 * genuinely came, whereas the query string is whatever the last person to touch
 * the URL left on it. When one is observed and the other is asserted, believe
 * the observation.
 */
export function detectAiEngine(input: {
  referrer: string | null | undefined;
  utmSource: string | null | undefined;
}): AiArrival | null {
  const fromReferrer = engineFromReferrer(input.referrer);
  if (fromReferrer) return { engine: fromReferrer, via: "referrer" };

  const fromUtm = engineFromUtmSource(input.utmSource);
  if (fromUtm) return { engine: fromUtm, via: "utm" };

  return null;
}

/* ------------------------------------------------------------------ */
/* The MCP server                                                       */
/* ------------------------------------------------------------------ */

/** Client-supplied strings are truncated to this before being recorded. */
const MCP_FIELD_LIMIT = 120;

export type McpTelemetry = { event: string; distinctId: string; properties: Record<string, unknown> };

/**
 * The `_meta` key a 2026-07-28 client puts its identity under.
 *
 * Copied as a literal rather than imported from `lib/mcp.ts`, and that is a
 * deliberate trade rather than an oversight. `middleware.ts` imports this module
 * for `INGEST_PREFIX`, so an import of `lib/mcp.ts` here would pull the entire
 * MCP server, its tool table and the whole `content/` corpus into the edge
 * bundle that runs in front of every request on the site. That is a large price
 * for one string.
 *
 * The duplication is guarded: `lib/analytics.test.ts` imports `META` from
 * `lib/mcp.ts` and asserts the two agree, so it cannot drift silently.
 */
const MCP_CLIENT_INFO_KEY = "io.modelcontextprotocol/clientInfo";

/** Exported for the drift guard in `lib/analytics.test.ts`, and nothing else. */
export const MCP_CLIENT_INFO_KEY_FOR_TEST = MCP_CLIENT_INFO_KEY;

/** `{ name, version }`, if it is there and shaped as expected. */
function clientInfoName(message: unknown): string | null {
  if (!isRecord(message)) return null;
  const params = message.params;
  if (!isRecord(params)) return null;

  // Modern: on `_meta`, on every request, which is what makes it worth reading.
  const meta = params._meta;
  if (isRecord(meta)) {
    const info = meta[MCP_CLIENT_INFO_KEY];
    if (isRecord(info) && typeof info.name === "string" && info.name.trim()) {
      return info.name.trim().slice(0, MCP_FIELD_LIMIT);
    }
  }

  // Legacy: on `initialize` only, so it identifies the handshake and nothing
  // after it. Read anyway, because one labelled row beats none.
  const legacy = params.clientInfo;
  if (isRecord(legacy) && typeof legacy.name === "string" && legacy.name.trim()) {
    return legacy.name.trim().slice(0, MCP_FIELD_LIMIT);
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What to record about one call to `/api/mcp`, or `null` for nothing.
 *
 * ## Why this is worth measuring at all
 *
 * `/api/mcp` is the one surface on this site built for machines rather than
 * people, and it is completely invisible to every other instrument here: no
 * browser runs, so PostHog's SDK never loads, and the caller is not a crawler,
 * so `middleware.ts` files it as nothing. Six tools were shipped on 2026-08-21
 * on the argument that agents would use them. This is the only thing that will
 * ever say whether that was true, and which of the six earned their place.
 *
 * ## Every field here is attacker-controlled
 *
 * The tool name and the client name both come out of a request body a stranger
 * wrote. They are truncated, and nothing downstream branches on them. They are
 * labels on a chart, not decisions.
 */
export function mcpCallProperties(message: unknown, status: number): McpTelemetry | null {
  if (!message || typeof message !== "object") return null;

  const ok = status >= 200 && status < 300;

  // A JSON-RPC batch. Recorded as one row with a count rather than expanded:
  // the interesting question is how often batching happens at all, and nothing
  // shipped today sends one.
  if (Array.isArray(message)) {
    return {
      event: "mcp_request",
      distinctId: "mcp:unknown",
      properties: { method: "batch", count: message.length, status, ok },
    };
  }

  const rpc = message as { method?: unknown; params?: unknown };
  const method = typeof rpc.method === "string" ? rpc.method.slice(0, MCP_FIELD_LIMIT) : null;
  if (!method) return null;

  // The protocol's own answer to "who is calling", preferred over the transport's
  // because a client that declares itself in `_meta` is telling you rather than
  // being inferred. `client_source` travels with it so a chart never has to
  // guess how much the label is worth.
  const declared = clientInfoName(message);
  const identity = declared
    ? { distinctId: `mcp:${declared}`, client: declared, client_source: "protocol" }
    : { distinctId: "mcp:unknown" };
  const { distinctId, ...clientProps } = identity;

  if (method === "tools/call") {
    const params = (rpc.params ?? {}) as { name?: unknown };
    const tool = typeof params.name === "string" ? params.name.slice(0, MCP_FIELD_LIMIT) : "unknown";
    return {
      event: "mcp_tool_call",
      distinctId,
      properties: { tool, status, ok, ...clientProps },
    };
  }

  return {
    event: "mcp_request",
    distinctId,
    properties: { method, status, ok, ...clientProps },
  };
}

/**
 * Attach the calling client's identity, taken from its `User-Agent`.
 *
 * ## The correction
 *
 * This read the `Mcp-Name` header until 2026-08-21, on my own claim that
 * revision `2026-07-28` carries the client name there. **It does not.**
 * `Mcp-Name` is per-request routing metadata that must equal `params.name`, and
 * `lib/mcp.ts` rejects a request where the two disagree, which is how this was
 * found: a live `tools/call` with `Mcp-Name: post-deploy-verification` came back
 * `400 Header mismatch`.
 *
 * So the old version would have labelled every row with the **tool name** and
 * called it the client, putting `mcp:get_profile` in the distinct id and a
 * duplicate of `tool` in a field called `client`. Not a crash, just a column
 * that quietly meant something other than its name. The answer was in
 * `lib/mcp.ts` the whole time and I asserted it from memory instead.
 *
 * ## What identifies a client instead
 *
 * Two sources, in order of how much the label is worth, and `client_source`
 * records which one produced it so a chart never has to guess:
 *
 * 1. **`protocol`.** The client declared itself. A 2026-07-28 client puts
 *    `clientInfo` on `_meta` on **every** request, and a legacy client puts it
 *    on `initialize` only. Read by `mcpCallProperties`, and preferred, because a
 *    client telling you who it is beats inferring it.
 * 2. **`user-agent`.** The fallback here, for the legacy era's `tools/call`,
 *    where the handshake carried the identity and this request does not. There
 *    is no per-request identity header in stateless MCP, so this is the only
 *    thing left, and it is the reason the fallback exists at all rather than
 *    leaving those rows unlabelled.
 *
 * Both are free text chosen by the caller, so both are truncated and neither is
 * trusted for anything. They exist so that "one client called `get_profile`
 * forty times" can be told apart from "forty clients did".
 *
 * A caveat worth keeping, since this docblock exists because of an unverified
 * claim: **no real MCP client has connected to this server yet**, so the shape
 * of what these fields actually contain in the wild is unobserved. The examples
 * in the tests are invented.
 */
export function withMcpClient(telemetry: McpTelemetry, userAgent: string | null): McpTelemetry {
  // A client that declared itself in the protocol has already been read by
  // `mcpCallProperties`, and that is the better signal. This only fills a gap.
  if (telemetry.properties.client) return telemetry;

  const name = userAgent?.trim().slice(0, MCP_FIELD_LIMIT);
  if (!name) return telemetry;
  return {
    ...telemetry,
    distinctId: `mcp:${name}`,
    properties: { ...telemetry.properties, client: name, client_source: "user-agent" },
  };
}

/* ------------------------------------------------------------------ */
/* Core Web Vitals                                                      */
/* ------------------------------------------------------------------ */

export type WebVitalRating = "good" | "needs-improvement" | "poor" | "unrated";

/**
 * Google's Core Web Vitals thresholds, as `[good ceiling, poor floor]`.
 *
 * At or below the first number is good; above the second is poor; between them
 * is the middle. Milliseconds everywhere except CLS, which is a unitless score.
 */
const VITAL_THRESHOLDS: Record<string, readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/**
 * Turn a raw measurement into Google's three-band verdict.
 *
 * Computed here rather than left to a dashboard so that "what share of real
 * visits had a good LCP" is a property filter instead of a threshold somebody
 * has to remember correctly at query time.
 *
 * Anything without a published threshold comes back `unrated`. Next reports its
 * own hydration and render timings through the same hook, and inventing a
 * verdict for those would put a made-up judgement on a chart next to four real
 * ones.
 */
export function webVitalRating(name: string, value: number): WebVitalRating {
  const thresholds = VITAL_THRESHOLDS[name];
  if (!thresholds) return "unrated";
  const [good, poor] = thresholds;
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

/* ------------------------------------------------------------------ */
/* How the browser SDK is configured                                    */
/* ------------------------------------------------------------------ */

/**
 * PostHog's behaviour-versioning switch, pinned.
 *
 * Leaving `defaults` unset opts into legacy behaviour; setting it to whatever
 * is newest means an SDK upgrade can change what gets collected without a line
 * of this repo changing. `2026-05-30` is the value PostHog's own project
 * settings page generated for project 569350 on 2026-08-21. The installed SDK
 * types also offer `2026-08-29`, which is a date in the future at the time of
 * writing, so it is deliberately not used: opting into behaviour that has not
 * shipped yet is not a default, it is a preview.
 */
const POSTHOG_DEFAULTS = "2026-05-30" as const;

/**
 * The browser SDK configuration.
 *
 * Returned as a value so `lib/analytics.test.ts` can assert the choices. Three
 * of them are decisions Fergus made on 2026-08-21 rather than defaults, and all
 * three fail silently if they regress, which is precisely why they are asserted:
 *
 * - **`cookieless_mode: "always"`.** No cookies, no local storage, no banner,
 *   nothing to consent to. PostHog counts people with a privacy-preserving hash
 *   computed on its own servers instead. Get this wrong and the site starts
 *   setting tracking cookies on EU visitors with no banner in front of them,
 *   and every test still passes.
 * - **`disable_session_recording: true`.** Not a preference, an entailment.
 *   Replay needs somewhere to keep a session id and the line above removes it,
 *   so PostHog would disable replay anyway. It is stated explicitly so it reads
 *   as a consequence rather than as a bug somebody should fix later.
 * - **`person_profiles: "never"`.** A cookieless visitor has no stable identity,
 *   so a person profile would be a row per page load claiming to be a person.
 *
 * `autocapture` is left on (the `defaults` bundle enables it) deliberately. On
 * a site whose main interaction is a terminal nobody is required to use, the
 * value is in finding out which commands people try, and autocapture is the
 * only thing that records the ones nobody thought to instrument.
 */
export function posthogClientOptions(): Partial<PostHogConfig> {
  return {
    api_host: INGEST_PREFIX,
    ui_host: POSTHOG_UI_HOST,
    defaults: POSTHOG_DEFAULTS,

    cookieless_mode: "always",
    person_profiles: "never",
    disable_session_recording: true,
    // Nothing here runs an experiment or a survey, and both cost a network
    // request on load that would buy nothing.
    disable_surveys: true,
    advanced_disable_feature_flags: true,

    // This site is a single-page app after first paint, so without
    // `history_change` a visitor who reads four articles records one pageview.
    capture_pageview: "history_change",
    capture_pageleave: true,

    // Heatmaps on a CRT that scales and skews the whole DOM would be measuring
    // the tube, not the page.
    capture_heatmaps: false,
  };
}
