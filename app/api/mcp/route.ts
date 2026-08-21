import {
  handleHttpPost,
  handleHttpGet,
  parseErrorReply,
  exceedsBodyLimit,
  bodyTooLargeReply,
  MODERN_PROTOCOL_VERSION,
  type McpReply,
} from "@/lib/mcp";

/**
 * `/api/mcp`: the Model Context Protocol endpoint.
 *
 * This file is only the HTTP skin. Every protocol decision lives in
 * `lib/mcp.ts`, which is pure and therefore testable without a server, and the
 * spec revision it targets is named in that module's docblock along with the
 * URL it was read from.
 *
 * ## No authentication, deliberately
 *
 * There is nothing here to protect. Every byte this endpoint returns is
 * already published on the pages of this site and in `/llms.txt`, it is all
 * read-only, there is no write path, no user data, no session and no cookie.
 * Putting a token in front of it would add no security and would stop the
 * agents it exists for from using it. If a tool that mutates anything is ever
 * added here, that reasoning stops holding, and this comment is the first
 * thing that has to change.
 *
 * ## Runtime
 *
 * Node, and `force-dynamic`. It reads nothing off the filesystem and imports
 * nothing that does: the whole corpus is `content/*.ts`, compiled into the
 * bundle, so there is no `fs` call to go wrong in a serverless environment and
 * no build-time file to go stale. `force-dynamic` is stated rather than
 * inferred, because an RPC endpoint that got prerendered would answer every
 * caller with one frozen reply.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open CORS, on purpose.
 *
 * The transport requires `Origin` validation to stop DNS rebinding, and that
 * requirement is aimed at MCP servers bound to someone's loopback, where a
 * malicious page in their browser can reach something otherwise private.
 * Nothing about that threat applies here: this origin is public,
 * unauthenticated and read-only, it sets no cookies, and credentials are never
 * allowed, so a hostile page calling it learns exactly what it would learn by
 * calling it from its own server. Refusing browser-based clients would cost
 * real users for no gain.
 *
 * `Mcp-Session-Id` and `Last-Event-ID` are allow-listed even though this
 * server ignores both. They belong to the 2025-03-26 to 2025-11-25 shape of
 * Streamable HTTP, clients of that era still send them, and a preflight that
 * rejects a header is a hard failure rather than a header the server can
 * quietly drop.
 */
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID",
  "access-control-expose-headers": "MCP-Protocol-Version",
  "access-control-max-age": "86400",
};

/** Headers common to every JSON-RPC answer. An RPC reply is never cacheable. */
const RPC_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "cache-control": "no-store",
  "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
};

export async function POST(request: Request): Promise<Response> {
  const reply = await handle(request);

  // A notification gets 202 and no body, which is what the transport requires.
  if (reply.body === null) {
    return new Response(null, { status: reply.status, headers: RPC_HEADERS });
  }

  return Response.json(reply.body, { status: reply.status, headers: RPC_HEADERS });
}

async function handle(request: Request): Promise<McpReply> {
  // Refuse on the declared length **before** reading the body. Checking only
  // after `request.text()` still stops the parse, but the whole string has
  // already been pulled into memory by then, which is not the protection this
  // was meant to be. Code review caught that; `exceedsBodyLimit` documents why
  // the second check below stays anyway.
  if (exceedsBodyLimit(request.headers.get("content-length"), null)) {
    return bodyTooLargeReply();
  }

  const raw = await request.text();
  if (exceedsBodyLimit(null, raw.length)) return bodyTooLargeReply();

  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch (cause) {
    // Covers an empty body too: `JSON.parse("")` throws, and a POST with no
    // body is a parse error rather than a request with nothing in it.
    return parseErrorReply(cause instanceof Error ? cause.message : "invalid JSON");
  }

  // Header field names are case-insensitive per RFC 9110 and `Headers.get`
  // already folds them, so these lower-case spellings match whatever the
  // client actually sent.
  return handleHttpPost(message, {
    protocolVersion: request.headers.get("mcp-protocol-version"),
    method: request.headers.get("mcp-method"),
    name: request.headers.get("mcp-name"),
  });
}

/**
 * `GET` answers a person with prose and an MCP client with a 405.
 *
 * The negotiation, and the reasoning behind it, is in `handleHttpGet`. This
 * end only turns the decision into a response.
 */
export function GET(request: Request): Response {
  const { status, contentType, body } = handleHttpGet(request.headers.get("accept"));

  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": contentType,
      "mcp-protocol-version": MODERN_PROTOCOL_VERSION,
      // Keep the endpoint out of the index without touching `robots.ts`.
      // `/mcp` is the page that should rank for this; a second URL carrying a
      // plain-text paraphrase of it is a competing duplicate, and it would be
      // an odd thing for a person to land on from a search result. A header is
      // the right tool rather than a `Disallow`: a disallowed URL can still be
      // indexed from a link to it, whereas `noindex` needs the crawler to
      // fetch the page, which nothing here prevents.
      "x-robots-tag": "noindex",
      // The prose is identical for everyone and changes only on deploy, so let
      // the CDN hold it. The 405 must not be cached: it is an answer to one
      // client's `Accept` header, not a property of the URL.
      "cache-control":
        status === 200
          ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      ...(status === 405 ? { allow: "POST, GET, OPTIONS" } : {}),
    },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
