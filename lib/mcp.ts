/**
 * A Model Context Protocol server for this site, written by hand.
 *
 * ## Which spec, and where it was read
 *
 * Targeted at revision **`2026-07-28`**, read on 2026-08-21 from
 * `https://modelcontextprotocol.io/specification/2026-07-28/` (the `basic`,
 * `basic/versioning`, `basic/transports/streamable-http`, `server/discover`,
 * `server/tools` and `changelog` pages). It is not implemented from memory,
 * and the reason that matters is that `2026-07-28` changed the shape of the
 * protocol rather than adding to it:
 *
 *  - the `initialize` / `notifications/initialized` handshake is **gone**, and
 *    every request now carries its own protocol version and client
 *    capabilities in `_meta` under `io.modelcontextprotocol/*`;
 *  - `Mcp-Session-Id` and the standalone `GET` SSE stream are **gone**;
 *  - `server/discover` is new, and a server **MUST** implement it;
 *  - every result **MUST** carry `resultType`, and list results **MUST** carry
 *    `ttlMs` and `cacheScope`;
 *  - the reserved error range moved: `HeaderMismatch` is `-32020` and
 *    `UnsupportedProtocolVersion` is `-32022`.
 *
 * Anything written from a memory of MCP would have shipped the 2025 shape.
 *
 * ## Dual-era on purpose
 *
 * The spec calls a server that answers both eras **dual-era** and explicitly
 * permits it (`basic/versioning`, "Backward Compatibility with
 * Initialization-Based Versions"). This one is dual-era, because the shipped
 * clients people will actually point at this URL predate `2026-07-28` and open
 * with `initialize`. A modern-only server would be spec-perfect and unusable.
 *
 * The era is decided per request, from `_meta` or the `MCP-Protocol-Version`
 * header, and it changes exactly two things: the HTTP status on an unknown
 * method, and nothing else. `resultType`, `ttlMs`, `cacheScope` and the
 * `serverInfo` `_meta` are emitted on **every** result regardless of era.
 * That is a deliberate call: they are additive fields, unknown result keys are
 * passed through rather than rejected by the schemas the legacy SDKs use, and
 * one code path is worth more here than a second one nobody exercises.
 *
 * ## Deliberate deviations, each with its reason
 *
 *  1. **Missing standard headers are tolerated.** The spec lists a missing
 *     `MCP-Protocol-Version`, `Mcp-Method` or `Mcp-Name` as a validation
 *     failure. No client older than `2026-07-28` sends `Mcp-Method`, so
 *     enforcing it would reject every client in existence today. Headers that
 *     are *present and disagree with the body* are still rejected with
 *     `-32020`, which is the part that carries the security argument: it stops
 *     an intermediary routing on one value while this server executes another.
 *  2. **`GET` is content-negotiated instead of a flat `405`.** See
 *     `handleHttpGet`.
 *  3. **No `outputSchema` on any tool.** Declaring one obliges the server to
 *     produce conforming structured results, and that is a promise worth
 *     making only with a validator behind it. `structuredContent` is returned
 *     without the promise.
 *  4. **No `Origin` check.** The `MUST` exists to stop DNS rebinding reaching
 *     a server on someone's loopback. This one is public, unauthenticated,
 *     read-only, sets no cookies and reaches no private network, so there is
 *     nothing an attacker gains by making a victim's browser call it that they
 *     could not get by calling it themselves.
 *
 * ## Everything comes from `content/`
 *
 * Same rule as `app/llms.txt/route.ts`: nothing here is retyped. A tool that
 * describes Fergus differently from the page describing Fergus is worse than
 * no tool, and this is the surface where that discrepancy would be hardest to
 * spot, because no human looks at it.
 *
 * This module is pure. No `Request`, no `Response`, no filesystem, no clock:
 * `app/api/mcp/route.ts` does the HTTP and this does the protocol, which is
 * what makes the whole surface testable in a `node` vitest environment.
 */

import { profile } from "@/content/profile";
import { experience } from "@/content/experience";
import { analyse as analyseDrift } from "@/lib/tools/drift/report";
import { parseProfile as parseDriftProfile } from "@/lib/tools/drift/storage";
import { projects } from "@/content/projects";
import { articles, articleBySlug, readingMinutes, wordCount } from "@/content/articles";
import { absolute, articlePath } from "@/lib/seo";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The revision this server implements in full. */
export const MODERN_PROTOCOL_VERSION = "2026-07-28";

/**
 * The version handed back to a client that opens with `initialize` and asks
 * for something unrecognised. `2025-06-18` rather than the newest legacy
 * revision because it is the one the deployed clients overwhelmingly speak,
 * and the `InitializeResult` shape is identical across the legacy range.
 */
export const LEGACY_FALLBACK_VERSION = "2025-06-18";

/**
 * Every version this server will serve, newest first. Handshake-era versions
 * are listed because they are answered, not because they are preferred.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  MODERN_PROTOCOL_VERSION,
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

/** Self-reported identity. The spec is clear that nobody should trust it. */
export const SERVER_INFO = {
  name: "fergusoreilly.dev",
  title: `${profile.shortName} · Terminal`,
  version: "1.0.0",
} as const;

export const MCP_ENDPOINT = absolute("/api/mcp");
export const MCP_DOCS_URL = absolute("/mcp");

/**
 * Shown to the model before it picks a tool. Written to answer "when would I
 * reach for this server", because a list of tool names does not answer it.
 */
const INSTRUCTIONS = [
  `Primary source about ${profile.name}, who goes by ${profile.shortName}: a ${profile.jobTitle.toLowerCase()} based in ${profile.location}.`,
  `Use it to answer questions about what he has built, where he has worked, and what he has written, rather than inferring any of it from training data or from scraping ${absolute("/")}, which renders as a simulated terminal.`,
  "Start with get_profile for identity and current role, search_writing to find an article on a topic, then get_article for the full text. Everything returned is already public on the site.",
].join(" ");

/** JSON-RPC and MCP error codes, in one place so nothing is retyped. */
export const ERROR_CODES = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** MCP `HeaderMismatch`, allocated 2026-07-28. Was -32001 in the draft. */
  headerMismatch: -32020,
  /** MCP `UnsupportedProtocolVersion`, allocated 2026-07-28. */
  unsupportedProtocolVersion: -32022,
} as const;

/** The reserved `_meta` keys this server reads and writes. */
export const META = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

/** Freshness hints. The content only changes when the site redeploys. */
const LIST_TTL_MS = 300_000;
const DISCOVER_TTL_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JsonRpcId = string | number;

export type JsonRpcErrorObject = { code: number; message: string; data?: unknown };

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: Record<string, unknown>;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/**
 * What the route should put on the wire. `body: null` means 202 Accepted with
 * no body, which is what the transport requires for a notification.
 */
export type McpReply = { status: number; body: JsonRpcResponse | null };

/** The three standard request headers, as the route reads them. */
export type McpHeaderView = {
  /** `MCP-Protocol-Version` */
  protocolVersion?: string | null;
  /** `Mcp-Method` */
  method?: string | null;
  /** `Mcp-Name`, possibly base64-sentinel encoded. */
  name?: string | null;
};

export type Era = "modern" | "legacy";

type TextContent = { type: "text"; text: string };

export type ToolResult = {
  content: TextContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => ToolResult;
};

export type ToolDescriptor = Omit<ToolDefinition, "run">;

export type SearchHit = {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  url: string;
  excerpt: string;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: string): TextContent[] {
  return [{ type: "text", text: value }];
}

/** A result the model can act on: wrong input, missing record, nothing found. */
function toolError(message: string): ToolResult {
  return { content: text(message), isError: true };
}

/**
 * Structured data plus its serialisation.
 *
 * The spec's advice is that a tool returning `structuredContent` **SHOULD**
 * also put the serialised JSON in a text block, for clients that only read
 * `content`. `get_article` is the one place that is ignored, and it says why.
 */
function structured(value: unknown, prose?: string): ToolResult {
  return {
    content: text(prose ?? JSON.stringify(value, null, 2)),
    structuredContent: value,
  };
}

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/**
 * Decode the `=?base64?...?=` sentinel the transport defines for header values
 * that cannot be written as plain ASCII. Returns the input untouched when it
 * is not encoded, and when the payload is not valid base64, because a header
 * this server cannot decode should fail the comparison rather than the
 * process.
 */
export function decodeHeaderValue(value: string): string {
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  const payload = value.slice("=?base64?".length, -"?=".length);
  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * A window of prose around the first hit for `term`.
 *
 * Fenced code is stripped first: a search for a word that also appears in a
 * listing would otherwise return a snippet of TypeScript, which tells a model
 * nothing about whether the article answers the question. Falls back to the
 * opening of the body when the term matched on a tag or a title instead.
 */
export function excerpt(body: string, term: string, width = 240): string {
  const flat = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) {
    return flat.length > width ? `${flat.slice(0, width).trimEnd()}…` : flat;
  }

  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  let slice = flat.slice(start, end);
  // Trim the partial words the window cut in half at either edge.
  if (start > 0) slice = slice.replace(/^\S*\s/, "");
  if (end < flat.length) slice = slice.replace(/\s\S*$/, "");

  return `${start > 0 ? "…" : ""}${slice.trim()}${end < flat.length ? "…" : ""}`;
}

/**
 * Full-text search across the writing.
 *
 * Every term must appear somewhere in the article (AND, not OR). With eight
 * articles, an OR search returns most of the corpus for most queries, which is
 * the same as returning nothing useful. Weighting puts a hit in the title well
 * above a hit in the body, because a title match is a statement about what the
 * piece is *about*.
 */
export function searchWriting(query: string, limit = 5): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: { article: (typeof articles)[number]; score: number }[] = [];

  for (const article of articles) {
    const fields = {
      title: article.title.toLowerCase(),
      tags: article.tags.join(" ").toLowerCase(),
      description: article.description.toLowerCase(),
      summary: article.summary.toLowerCase(),
      body: article.body.toLowerCase(),
    };
    const whole = Object.values(fields).join(" ");
    if (!terms.every((term) => whole.includes(term))) continue;

    let score = 0;
    for (const term of terms) {
      score += occurrences(fields.title, term) * 8;
      score += occurrences(fields.tags, term) * 5;
      score += occurrences(fields.description, term) * 3;
      score += occurrences(fields.summary, term) * 3;
      score += occurrences(fields.body, term);
    }
    scored.push({ article, score });
  }

  // Newest wins a tie, matching the published order everywhere else.
  scored.sort((a, b) => b.score - a.score || b.article.date.localeCompare(a.article.date));

  return scored.slice(0, limit).map(({ article }) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    date: article.date,
    tags: article.tags,
    url: absolute(articlePath(article.slug)),
    excerpt: excerpt(article.body, terms[0]),
  }));
}

// ---------------------------------------------------------------------------
// Argument reading
//
// Hand-written rather than schema-driven. A general JSON Schema validator is a
// dependency, and this is six tools with nine arguments between them. Every
// failure here comes back as a tool error (`isError: true`) rather than a
// JSON-RPC error, because the spec's own guidance is that input validation
// problems are the ones a model can fix by itself on the next turn.
// ---------------------------------------------------------------------------

type Read<T> = { ok: true; value: T } | { ok: false; error: ToolResult };

function readString(args: Record<string, unknown>, key: string): Read<string> {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, error: toolError(`Missing required argument \`${key}\` (a string).`) };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: toolError(`Argument \`${key}\` must be a string, got ${typeof raw}.`),
    };
  }
  return { ok: true, value: raw };
}

function readInteger(
  args: Record<string, unknown>,
  key: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): Read<number> {
  const raw = args[key];
  if (raw === undefined || raw === null) return { ok: true, value: fallback };
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return {
      ok: false,
      error: toolError(`Argument \`${key}\` must be an integer between ${min} and ${max}.`),
    };
  }
  if (raw < min || raw > max) {
    return {
      ok: false,
      error: toolError(`Argument \`${key}\` must be between ${min} and ${max}, got ${raw}.`),
    };
  }
  return { ok: true, value: raw };
}

/** The schema for a tool that takes nothing, per the spec's recommendation. */
const NO_ARGUMENTS = { type: "object", additionalProperties: false } as const;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  {
    name: "search_writing",
    title: "Search the writing",
    description:
      "Full-text search across every article on the site. Every word in the query must appear in the article. Returns slug, title, description, date, tags, URL and an excerpt around the match. Use get_article for the full text of a hit.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Words to search for. All of them must appear in a matching article.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 5,
          description: "Maximum number of articles to return. Defaults to 5.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run(args) {
      const query = readString(args, "query");
      if (!query.ok) return query.error;
      const limit = readInteger(args, "limit", { min: 1, max: 20, fallback: 5 });
      if (!limit.ok) return limit.error;

      const results = searchWriting(query.value, limit.value);
      const payload = { query: query.value, count: results.length, results };

      // An empty result is a normal answer, not a failure. Say so in words as
      // well as in the shape, so a model reading only `content` can tell the
      // difference between "nothing matched" and "the tool broke".
      if (results.length === 0) {
        return {
          content: text(
            `No articles match "${query.value}". Every word in the query has to appear in the article. Try fewer words, or call list_writing to see everything published.`,
          ),
          structuredContent: payload,
        };
      }
      return structured(payload);
    },
  },
  {
    name: "get_article",
    title: "Read an article",
    description:
      "The full markdown body of one article, by slug, plus its metadata. Get slugs from search_writing or list_writing.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The article's URL segment, for example the last part of /writing/<slug>.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run(args) {
      const slug = readString(args, "slug");
      if (!slug.ok) return slug.error;

      const article = articleBySlug(slug.value);
      if (!article) {
        return toolError(
          `No article with slug "${slug.value}". Published slugs: ${articles.map((a) => a.slug).join(", ")}.`,
        );
      }

      const payload = {
        slug: article.slug,
        title: article.title,
        description: article.description,
        date: article.date,
        updated: article.updated ?? null,
        tags: article.tags,
        summary: article.summary,
        url: absolute(articlePath(article.slug)),
        wordCount: wordCount(article.body),
        readingMinutes: readingMinutes(article.body),
        body: article.body,
      };

      // The one place the "serialise the JSON into the text block" advice is
      // ignored. The body is markdown a model can read directly; JSON-escaping
      // it into a string would cost tokens and make it harder to read, which is
      // the opposite of what the advice is for.
      return {
        content: text(
          `# ${article.title}\n\n${article.description}\n\nPublished ${article.date}${
            article.updated ? `, updated ${article.updated}` : ""
          } · ${payload.readingMinutes} min read · ${payload.url}\n\n---\n\n${article.body}`,
        ),
        structuredContent: payload,
      };
    },
  },
  {
    name: "list_writing",
    title: "List the writing",
    description:
      "Metadata for every article on the site, newest first. Bodies are excluded on purpose: use get_article for those.",
    inputSchema: NO_ARGUMENTS,
    run() {
      return structured({
        count: articles.length,
        articles: articles.map((article) => ({
          slug: article.slug,
          title: article.title,
          description: article.description,
          date: article.date,
          updated: article.updated ?? null,
          tags: article.tags,
          summary: article.summary,
          url: absolute(articlePath(article.slug)),
          wordCount: wordCount(article.body),
          readingMinutes: readingMinutes(article.body),
        })),
      });
    },
  },
  {
    name: "get_profile",
    title: "Who Fergus is",
    description:
      "Identity, current role, education, location, what he is a credible source on, and every off-site profile. The first tool to call for any question about who he is or what he is doing now.",
    inputSchema: NO_ARGUMENTS,
    run() {
      const current = experience[0];
      const payload = {
        name: profile.name,
        shortName: profile.shortName,
        jobTitle: profile.jobTitle,
        tagline: profile.tagline,
        location: profile.location,
        education: profile.education,
        bio: profile.bio,
        knowsAbout: profile.knowsAbout,
        currentRole: current
          ? {
              org: current.org,
              role: current.role,
              dates: current.dates,
              summary: current.summary ?? null,
              link: current.link?.href ?? null,
            }
          : null,
        links: profile.contact.map((c) => c.href),
        url: absolute("/"),
      };

      return structured(
        payload,
        [
          `${profile.shortName} (full name ${profile.name}). ${profile.jobTitle}, ${profile.location}.`,
          current ? `Currently ${current.role} at ${current.org} (${current.dates}).` : "",
          profile.education,
          "",
          profile.bio.join("\n\n"),
          "",
          `Knows about: ${profile.knowsAbout.join(", ")}.`,
          `Elsewhere: ${payload.links.join(", ")}.`,
          `Site: ${payload.url}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  },
  {
    name: "list_projects",
    title: "List the projects",
    description:
      "Everything on the projects page: what each one is, his role, the year, the stack it was built on, and where it lives.",
    inputSchema: NO_ARGUMENTS,
    run() {
      return structured({
        count: projects.length,
        projects: projects.map((project) => ({
          slug: project.slug,
          title: project.title,
          tagline: project.tagline,
          role: project.role,
          year: project.year ?? null,
          bullets: project.bullets,
          stack: project.stack,
          links: project.links.map((l) => ({ label: l.label, href: l.href })),
          url: absolute(`/projects#${project.slug}`),
        })),
      });
    },
  },
  {
    name: "list_experience",
    title: "List the experience",
    description:
      "Where Fergus has worked and what he did there, newest first. Entries for companies that no longer trade stay in the list and are described in the past tense.",
    inputSchema: NO_ARGUMENTS,
    run() {
      return structured({
        count: experience.length,
        experience: experience.map((entry) => ({
          id: entry.id,
          org: entry.org,
          role: entry.role,
          dates: entry.dates,
          location: entry.location ?? null,
          summary: entry.summary ?? null,
          bullets: entry.bullets,
          link: entry.link?.href ?? null,
          url: absolute(`/experience#${entry.id}`),
        })),
      });
    },
  },
  {
    name: "check_voice",
    title: "Measure a draft against a voice profile",
    description:
      "Burrows's Delta, sentence rhythm, punctuation rates, join rates and substitution hits for a draft against a voice profile saved from /tools/drift. Pass the profile object exactly as that tool exports it, reference table included: the z-scores in it were computed against the writer's own pieces, and without that table they have no units, so a profile with it stripped out is refused rather than guessed at. The tool uses conservative, uncalibrated floors of 150 draft words and 5 reference pieces; below either it returns the counts and habits that still hold but no distance. This is not an AI detector: a low distance means the writer's own commonest words appear at similar rates, and nothing more.",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "object",
          description: "The saved profile object from /tools/drift, unchanged, reference included.",
        },
        draft: { type: "string", minLength: 1, description: "The draft to measure." },
      },
      required: ["profile", "draft"],
      additionalProperties: false,
    },
    run(args) {
      const draft = readString(args, "draft");
      if (!draft.ok) return draft.error;

      const saved = parseDriftProfile(args.profile);
      if (!saved) {
        return toolError(
          "`profile` is not a Drift profile. Paste the JSON object that /tools/drift saves, unchanged and with its reference table.",
        );
      }

      // The caller's own table, carried in the record. Nothing here builds one,
      // and nothing here imports this site's corpus: a stranger's draft scored
      // against my articles would be a real number in somebody else's units.
      const report = analyseDrift(saved.profile, draft.value, saved.reference, saved.spread);

      if (report.status === "too-short") {
        return {
          content: text(
            `${report.words} words, below this tool's conservative, uncalibrated floor of ${report.floor}, so no distance is printed. The counts still hold: ${report.emDashes} em dash(es), ${report.substitutions.length} substitution(s).`,
          ),
          structuredContent: report,
        };
      }
      if (report.status === "thin-reference") {
        return {
          content: text(
            `The profile was built from ${report.reference.documents} piece(s) and ${report.reference.markers} marker word(s), below this tool's conservative, uncalibrated floor of ${report.documentFloor} pieces, so no distance is printed. The habits, the em dashes and the substitutions are all in the structured result.`,
          ),
          structuredContent: report,
        };
      }
      return structured(report);
    },
  },
];

/** Tool names in wire order. Deterministic, which the spec asks for. */
export const TOOL_NAMES = TOOLS.map((tool) => tool.name) as readonly string[];

/** The wire shape of every tool, with the handler stripped off. */
export function toolDescriptors(): ToolDescriptor[] {
  return TOOLS.map(({ name, title, description, inputSchema }) => ({
    name,
    title,
    description,
    inputSchema,
  }));
}

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/**
 * Every result leaves through here, so `resultType` and the server identity
 * cannot be forgotten on one branch.
 */
function ok(id: JsonRpcId, result: Record<string, unknown>): McpReply {
  const meta = isPlainObject(result._meta) ? result._meta : {};
  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id,
      result: {
        resultType: "complete",
        ...result,
        _meta: { ...meta, [META.serverInfo]: SERVER_INFO },
      },
    },
  };
}

function fail(
  id: JsonRpcId | null,
  code: number,
  message: string,
  status: number,
  data?: unknown,
): McpReply {
  return {
    status,
    body: {
      jsonrpc: "2.0",
      id,
      error: data === undefined ? { code, message } : { code, message, data },
    },
  };
}

// ---------------------------------------------------------------------------
// Era and version
// ---------------------------------------------------------------------------

function metaProtocolVersion(message: unknown): string | null {
  if (!isPlainObject(message)) return null;
  const params = message.params;
  if (!isPlainObject(params)) return null;
  const meta = params._meta;
  if (!isPlainObject(meta)) return null;
  const version = meta[META.protocolVersion];
  return typeof version === "string" ? version : null;
}

/**
 * Which era of the protocol this request belongs to.
 *
 * ISO dates compare correctly as strings, so "at or after 2026-07-28" is a
 * plain `>=`. A junk version like "1.0.0" sorts below it and reads as legacy,
 * which is the safe way round: a legacy answer to a modern client is a missing
 * field, a modern answer to a legacy client is a 404 it misreads as a dead
 * endpoint.
 */
export function detectEra(message: unknown, protocolVersionHeader?: string | null): Era {
  const declared = metaProtocolVersion(message) ?? protocolVersionHeader ?? null;
  return declared !== null && declared >= MODERN_PROTOCOL_VERSION ? "modern" : "legacy";
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

/**
 * The legacy handshake.
 *
 * Version negotiation per `2025-06-18`: echo the requested version when it is
 * one we serve, otherwise answer with one we do serve. `2026-07-28` is
 * excluded from the echo on purpose, because a client that opens with
 * `initialize` while claiming to speak a version that has no `initialize` is
 * confused, and agreeing with it would leave both sides wrong.
 */
function initializeResult(params: unknown): Record<string, unknown> {
  const requested = isPlainObject(params) ? params.protocolVersion : undefined;
  const negotiated =
    typeof requested === "string" &&
    requested !== MODERN_PROTOCOL_VERSION &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : LEGACY_FALLBACK_VERSION;

  return {
    protocolVersion: negotiated,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
}

function discoverResult(): Record<string, unknown> {
  return {
    supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: { tools: { listChanged: false } },
    instructions: INSTRUCTIONS,
    ttlMs: DISCOVER_TTL_MS,
    cacheScope: "public",
  };
}

function toolsListReply(id: JsonRpcId, params: unknown): McpReply {
  // Six tools fit in one page, so this server never issues a cursor. A cursor
  // coming back therefore did not come from here, and honouring it would mean
  // silently returning page one again under the label of page two.
  if (isPlainObject(params) && params.cursor !== undefined && params.cursor !== null) {
    return fail(
      id,
      ERROR_CODES.invalidParams,
      "Invalid cursor: this server returns every tool in one page and never issues a cursor.",
      200,
    );
  }

  return ok(id, {
    tools: toolDescriptors(),
    ttlMs: LIST_TTL_MS,
    cacheScope: "public",
  });
}

function toolsCallReply(id: JsonRpcId, params: unknown): McpReply {
  if (!isPlainObject(params)) {
    return fail(
      id,
      ERROR_CODES.invalidParams,
      "Invalid params: tools/call takes an object with a `name` and optional `arguments`.",
      200,
    );
  }

  const name = params.name;
  if (typeof name !== "string") {
    return fail(id, ERROR_CODES.invalidParams, "Invalid params: `name` must be a string.", 200);
  }

  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    return fail(
      id,
      ERROR_CODES.invalidParams,
      `Unknown tool: ${name}. Available tools: ${TOOL_NAMES.join(", ")}.`,
      200,
    );
  }

  const args = params.arguments;
  if (args !== undefined && args !== null && !isPlainObject(args)) {
    return fail(
      id,
      ERROR_CODES.invalidParams,
      "Invalid params: `arguments` must be an object.",
      200,
    );
  }

  try {
    const result = tool.run(isPlainObject(args) ? args : {});
    return ok(id, result as unknown as Record<string, unknown>);
  } catch (cause) {
    // A thrown handler is this server's bug, not the caller's. Report it as
    // one rather than dressing it up as a tool result the model should retry.
    return fail(
      id,
      ERROR_CODES.internal,
      `Internal error running tool ${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function dispatch(
  id: JsonRpcId,
  method: string,
  params: unknown,
  era: Era,
): McpReply {
  switch (method) {
    case "initialize":
      return ok(id, initializeResult(params));
    case "server/discover":
      return ok(id, discoverResult());
    case "tools/list":
      return toolsListReply(id, params);
    case "tools/call":
      return toolsCallReply(id, params);
    // Removed in 2026-07-28, still sent by legacy clients as a liveness check.
    // Answering costs nothing and a -32601 would read as a broken server.
    case "ping":
      return ok(id, {});
    default:
      return fail(
        id,
        ERROR_CODES.methodNotFound,
        `Method not found: ${method}. This server implements tools only: server/discover, tools/list, tools/call.`,
        // 2026-07-28 requires 404 here so a client can tell an unimplemented
        // method from a legacy endpoint. A legacy client reads its errors out
        // of a 200 body and treats a 404 as a dead endpoint, so it gets 200.
        era === "modern" ? 404 : 200,
      );
  }
}

/**
 * Header and body must agree.
 *
 * Only checked where the header is actually present, for the reason in the
 * module docblock. The disagreement case is the one with teeth: an
 * intermediary routing on `Mcp-Name` while the server executes `params.name`
 * is a split-brain the spec calls out explicitly.
 */
function headerMismatch(
  message: Record<string, unknown>,
  headers: McpHeaderView,
): string | null {
  if (typeof headers.method === "string" && headers.method !== message.method) {
    return `Mcp-Method header value '${headers.method}' does not match body value '${String(message.method)}'`;
  }

  if (typeof headers.name === "string") {
    const params = message.params;
    const bodyName = isPlainObject(params)
      ? typeof params.name === "string"
        ? params.name
        : typeof params.uri === "string"
          ? params.uri
          : null
      : null;
    const decoded = decodeHeaderValue(headers.name);
    if (bodyName !== null && decoded !== bodyName) {
      return `Mcp-Name header value '${decoded}' does not match body value '${bodyName}'`;
    }
  }

  if (typeof headers.protocolVersion === "string") {
    const bodyVersion = metaProtocolVersion(message);
    if (bodyVersion !== null && bodyVersion !== headers.protocolVersion) {
      return `MCP-Protocol-Version header value '${headers.protocolVersion}' does not match body value '${bodyVersion}'`;
    }
  }

  return null;
}

/**
 * The whole POST path: validate, then dispatch.
 *
 * `message` is already-parsed JSON. Parse failure is the route's job, because
 * only it has the bytes, and it reports `-32700`.
 */
export function handleHttpPost(message: unknown, headers: McpHeaderView = {}): McpReply {
  if (Array.isArray(message)) {
    return fail(
      null,
      ERROR_CODES.invalidRequest,
      "Invalid request: the body must be a single JSON-RPC request or notification, not a batch.",
      400,
    );
  }

  if (!isPlainObject(message)) {
    return fail(
      null,
      ERROR_CODES.invalidRequest,
      "Invalid request: the body must be a JSON-RPC 2.0 object.",
      400,
    );
  }

  if (message.jsonrpc !== "2.0") {
    return fail(null, ERROR_CODES.invalidRequest, 'Invalid request: `jsonrpc` must be "2.0".', 400);
  }

  const method = message.method;
  if (typeof method !== "string" || method.length === 0) {
    return fail(
      null,
      ERROR_CODES.invalidRequest,
      "Invalid request: `method` must be a non-empty string.",
      400,
    );
  }

  const id = message.id;

  // No id at all is a notification. This server holds no state, so there is
  // nothing any notification can change; accept it and answer nothing, which
  // is what the transport requires.
  if (id === undefined) return { status: 202, body: null };

  if (id === null) {
    return fail(
      null,
      ERROR_CODES.invalidRequest,
      "Invalid request: `id` must not be null. Omit it entirely to send a notification.",
      400,
    );
  }

  if (typeof id !== "string" && typeof id !== "number") {
    return fail(
      null,
      ERROR_CODES.invalidRequest,
      "Invalid request: `id` must be a string or a number.",
      400,
    );
  }

  const mismatch = headerMismatch(message, headers);
  if (mismatch !== null) {
    return fail(id, ERROR_CODES.headerMismatch, `Header mismatch: ${mismatch}`, 400);
  }

  // `initialize` is exempt: it carries its version in `params`, not in `_meta`,
  // and its whole job is to negotiate one rather than to be refused for asking.
  const declared = metaProtocolVersion(message) ?? headers.protocolVersion ?? null;
  if (
    method !== "initialize" &&
    declared !== null &&
    !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(declared)
  ) {
    return fail(
      id,
      ERROR_CODES.unsupportedProtocolVersion,
      `Unsupported protocol version: ${declared}`,
      400,
      { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: declared },
    );
  }

  return dispatch(id, method, message.params, detectEra(message, headers.protocolVersion));
}

/**
 * A body that would not parse as JSON at all.
 *
 * Exported so the route has one place to get the shape right, rather than
 * hand-rolling a `-32700` next to the `try/catch`.
 */
export function parseErrorReply(detail: string): McpReply {
  return fail(null, ERROR_CODES.parse, `Parse error: ${detail}`, 400);
}

/**
 * Bigger than any legitimate MCP request by a wide margin, small enough that
 * refusing a hostile one costs nothing.
 */
export const MAX_BODY_BYTES = 256_000;

/**
 * Is this body too big to bother with?
 *
 * Two arguments because there are two moments to ask, and the first one is the
 * one that matters. `Content-Length` can be checked **before** the body is
 * read, which is the difference between refusing a large request and
 * buffering it into memory and then refusing it. Code review caught exactly
 * that: an earlier version only checked after `request.text()` had already
 * materialised the whole string, so the comment promised a protection the code
 * did not provide.
 *
 * The header is not sufficient on its own and does not replace the second
 * check: it is absent on a chunked request, and a client is free to lie about
 * it. Pass `null` for whichever one is not known yet.
 */
export function exceedsBodyLimit(contentLength: string | null, charCount: number | null): boolean {
  if (contentLength !== null) {
    const declared = Number(contentLength);
    // A missing, empty or junk header reads as "unknown", never as "huge".
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  }
  // UTF-16 units rather than bytes. For ASCII they are the same number, and
  // for anything else this undercounts, which only ever errs towards letting a
  // legitimate request through to the parser.
  return charCount !== null && charCount > MAX_BODY_BYTES;
}

/** The reply for a body that was refused on size. */
export function bodyTooLargeReply(): McpReply {
  return parseErrorReply(`body exceeds ${MAX_BODY_BYTES} bytes`);
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

/** Plain-text notes for the human who pasted the endpoint into a browser. */
export function humanReadableSummary(): string {
  const tools = toolDescriptors()
    .map((tool) => `  ${tool.name.padEnd(16)} ${tool.description.split(". ")[0]}.`)
    .join("\n");

  return `${SERVER_INFO.name} · Model Context Protocol server

This is an MCP endpoint, not a page. It speaks JSON-RPC 2.0 over Streamable
HTTP on POST. You have reached it with a GET, which most likely means you
pasted it into a browser, so here is what it is.

  Endpoint      ${MCP_ENDPOINT}
  Transport     Streamable HTTP (POST)
  Protocol      ${MODERN_PROTOCOL_VERSION}, and the initialize handshake used by
                ${SUPPORTED_PROTOCOL_VERSIONS.slice(1).join(", ")}
  Auth          none. Everything here is already public on the site.
  Docs          ${MCP_DOCS_URL}
  Discovery     ${absolute("/.well-known/mcp.json")}

Tools

${tools}

It answers questions about ${profile.shortName}: who he is, what he has built,
where he has worked, and what he has written. Point an MCP client at the
endpoint above and the tools show up.
`;
}

/**
 * `GET` is content-negotiated rather than a flat 405, and that is deliberate.
 *
 * `2026-07-28` removed the standalone GET stream and says a server that only
 * speaks this revision **SHOULD** answer GET with `405 Method Not Allowed`.
 * The clients that still open one are the `2025-03-26` to `2025-11-25`
 * generation, and they ask for it with `Accept: text/event-stream`, so those
 * get their 405 and move on, which is exactly how their SDKs read "there is no
 * standalone stream here".
 *
 * Everyone else asking for a GET is a person with a browser, and handing a
 * person a 405 for visiting a URL published on a page teaches them nothing.
 * A 200 of prose is not spec-compliant behaviour towards an MCP client, and it
 * is never sent to one.
 */
export function handleHttpGet(accept: string | null): {
  status: number;
  contentType: string;
  body: string;
} {
  if (accept !== null && accept.toLowerCase().includes("text/event-stream")) {
    return {
      status: 405,
      contentType: "text/plain; charset=utf-8",
      body: "Method Not Allowed. This server implements MCP revision 2026-07-28, which removed the standalone GET stream. Send JSON-RPC over POST instead.\n",
    };
  }

  return {
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: humanReadableSummary(),
  };
}

// ---------------------------------------------------------------------------
// Discovery document
// ---------------------------------------------------------------------------

/**
 * The body of `public/.well-known/mcp.json`.
 *
 * There is **no ratified `.well-known` discovery standard for MCP**. As of the
 * `2026-07-28` revision the spec defines discovery *inside* the protocol
 * (`server/discover`) and says nothing about a well-known URI, so this file is
 * a guess at a convention that may never land. It is here because it costs one
 * static JSON file and it is the first place a crawler or an agent would look,
 * not because anything is specified to read it.
 *
 * It is a committed static file rather than a route because `public/` is
 * served from the site root and there is no route segment that can own a
 * dot-directory. `lib/mcp.test.ts` asserts the file on disk equals this
 * function, which is what stops it going stale when a tool is added.
 */
export function wellKnownDocument(): Record<string, unknown> {
  return {
    $comment:
      "Not a ratified standard: MCP defines discovery in-protocol via server/discover and specifies no .well-known URI. This file is a cheap bet on a convention that may never be adopted, and nothing depends on it.",
    name: SERVER_INFO.name,
    title: `${profile.shortName} · MCP`,
    description: `Model Context Protocol server for ${absolute("/")}. Search and read ${profile.shortName}'s writing, profile, projects and experience.`,
    version: SERVER_INFO.version,
    documentation: MCP_DOCS_URL,
    endpoint: MCP_ENDPOINT,
    transport: "streamable-http",
    authentication: "none",
    protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    capabilities: { tools: { listChanged: false } },
    instructions: INSTRUCTIONS,
    tools: toolDescriptors().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
    })),
  };
}
