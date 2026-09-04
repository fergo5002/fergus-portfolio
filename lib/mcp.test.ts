import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MCP_ENDPOINT,
  MODERN_PROTOCOL_VERSION,
  LEGACY_FALLBACK_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  SERVER_INFO,
  ERROR_CODES,
  META,
  TOOL_NAMES,
  toolDescriptors,
  detectEra,
  handleHttpPost,
  handleHttpGet,
  humanReadableSummary,
  wellKnownDocument,
  exceedsBodyLimit,
  MAX_BODY_BYTES,
  searchWriting,
  excerpt,
} from "./mcp";
import {
  POST,
  GET,
  OPTIONS,
  runtime,
  dynamic as routeDynamic,
} from "@/app/api/mcp/route";
import { articles } from "@/content/articles";
import { projects } from "@/content/projects";
import { experience } from "@/content/experience";
import { profile } from "@/content/profile";
import { buildReference } from "@/lib/tools/drift/reference";
import { profileOf } from "@/lib/tools/drift/profile";
import { serialiseProfile } from "@/lib/tools/drift/storage";

/** Shorthand: a well-formed JSON-RPC request body. */
const rpc = (method: string, params?: unknown, id: string | number = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

/** The `_meta` block a 2026-07-28 client puts on every request. */
const modernMeta = (version = MODERN_PROTOCOL_VERSION) => ({
  [META.protocolVersion]: version,
  [META.clientInfo]: { name: "vitest", version: "0.0.0" },
  [META.clientCapabilities]: {},
});

/** Narrow a reply body to its success half, failing loudly if it is an error. */
function resultOf(reply: ReturnType<typeof handleHttpPost>): Record<string, unknown> {
  const body = reply.body;
  expect(body, "expected a JSON-RPC body").not.toBeNull();
  if (!body || !("result" in body)) {
    throw new Error(`expected a result, got ${JSON.stringify(body)}`);
  }
  return body.result;
}

/** Narrow a reply body to its error half. */
function errorOf(reply: ReturnType<typeof handleHttpPost>) {
  const body = reply.body;
  expect(body, "expected a JSON-RPC body").not.toBeNull();
  if (!body || !("error" in body)) {
    throw new Error(`expected an error, got ${JSON.stringify(body)}`);
  }
  return body.error;
}

/** Call a tool and hand back its result object. */
function call(name: string, args?: Record<string, unknown>) {
  return resultOf(handleHttpPost(rpc("tools/call", { name, arguments: args })));
}

// ---------------------------------------------------------------------------
// Handshake, both eras
// ---------------------------------------------------------------------------

describe("initialize (legacy handshake)", () => {
  it("answers a 2025-06-18 initialize with the same version echoed back", () => {
    const reply = handleHttpPost(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "ExampleClient", version: "1.0.0" },
      }),
    );

    expect(reply.status).toBe(200);
    const result = resultOf(reply);
    // The legacy rule: if the server supports the requested version it MUST
    // respond with that same version.
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toMatchObject({ tools: {} });
    expect(result.serverInfo).toEqual(SERVER_INFO);
    expect(typeof result.instructions).toBe("string");
  });

  it("falls back to a version it does support when asked for an unknown one", () => {
    const result = resultOf(
      handleHttpPost(rpc("initialize", { protocolVersion: "1.0.0", capabilities: {} })),
    );
    expect(result.protocolVersion).toBe(LEGACY_FALLBACK_VERSION);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(result.protocolVersion);
  });

  it("does not error on an initialize with no params at all", () => {
    const result = resultOf(handleHttpPost(rpc("initialize")));
    expect(result.protocolVersion).toBe(LEGACY_FALLBACK_VERSION);
  });

  it("refuses to agree that 2026-07-28 has an initialize handshake", () => {
    // A client opening with `initialize` while claiming a version that deleted
    // `initialize` is confused. Echoing it back would leave both sides wrong,
    // so it gets negotiated down to a version that really does have one.
    const result = resultOf(
      handleHttpPost(rpc("initialize", { protocolVersion: MODERN_PROTOCOL_VERSION })),
    );
    expect(result.protocolVersion).toBe(LEGACY_FALLBACK_VERSION);
    expect(result.protocolVersion).not.toBe(MODERN_PROTOCOL_VERSION);
  });

  it("accepts notifications/initialized with 202 and no body", () => {
    const reply = handleHttpPost({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(reply.status).toBe(202);
    expect(reply.body).toBeNull();
  });
});

describe("server/discover (modern handshake replacement)", () => {
  it("advertises supported versions, capabilities and identity", () => {
    const result = resultOf(
      handleHttpPost(rpc("server/discover", { _meta: modernMeta() }), {
        protocolVersion: MODERN_PROTOCOL_VERSION,
        method: "server/discover",
      }),
    );

    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    expect(result.capabilities).toMatchObject({ tools: {} });
    expect(result.cacheScope).toBe("public");
    expect(typeof result.ttlMs).toBe("number");
    expect(result._meta).toMatchObject({ [META.serverInfo]: SERVER_INFO });
  });

  it("is reachable without any headers, because a client may probe it cold", () => {
    const reply = handleHttpPost(rpc("server/discover"));
    expect(reply.status).toBe(200);
    expect(resultOf(reply).supportedVersions).toContain(MODERN_PROTOCOL_VERSION);
  });
});

describe("detectEra", () => {
  it("reads the era off the body _meta", () => {
    expect(detectEra(rpc("tools/list", { _meta: modernMeta() }))).toBe("modern");
  });

  it("reads the era off the header when the body says nothing", () => {
    expect(detectEra(rpc("tools/list"), MODERN_PROTOCOL_VERSION)).toBe("modern");
  });

  it("treats an initialize-era client as legacy", () => {
    expect(detectEra(rpc("tools/list"), "2025-06-18")).toBe("legacy");
    expect(detectEra(rpc("initialize"))).toBe("legacy");
  });

  it("does not mistake a junk version string for a modern client", () => {
    expect(detectEra(rpc("tools/list"), "1.0.0")).toBe("legacy");
  });
});

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

describe("tools/list", () => {
  it("returns every tool with a name, description and object inputSchema", () => {
    const result = resultOf(handleHttpPost(rpc("tools/list")));
    const tools = result.tools as Record<string, unknown>[];

    expect(tools).toHaveLength(TOOL_NAMES.length);
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);

    for (const tool of tools) {
      expect(typeof tool.name, `${tool.name} name`).toBe("string");
      expect(typeof tool.title, `${tool.name} title`).toBe("string");
      expect((tool.description as string).length, `${tool.name} description`).toBeGreaterThan(20);

      const schema = tool.inputSchema as Record<string, unknown>;
      expect(schema, `${tool.name} inputSchema`).toBeTypeOf("object");
      expect(schema.type, `${tool.name} schema type`).toBe("object");
      // A tool that takes arguments must say which are required; a tool that
      // takes none must say it takes none. Neither may be left implicit.
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        expect(schema, `${tool.name}`).toHaveProperty("required");
      } else {
        expect(schema.additionalProperties, `${tool.name}`).toBe(false);
      }
    }
  });

  it("carries the cache hints the 2026-07-28 revision requires on list results", () => {
    const result = resultOf(handleHttpPost(rpc("tools/list")));
    expect(typeof result.ttlMs).toBe("number");
    expect(result.cacheScope).toBe("public");
  });

  it("returns tools in a stable order across calls", () => {
    const once = resultOf(handleHttpPost(rpc("tools/list"))).tools as { name: string }[];
    const twice = resultOf(handleHttpPost(rpc("tools/list"))).tools as { name: string }[];
    expect(once.map((t) => t.name)).toEqual(twice.map((t) => t.name));
  });

  it("rejects a cursor it never issued rather than silently ignoring it", () => {
    const error = errorOf(handleHttpPost(rpc("tools/list", { cursor: "made-up" })));
    expect(error.code).toBe(ERROR_CODES.invalidParams);
  });

  it("exposes no tool that tools/call cannot dispatch", () => {
    const tools = resultOf(handleHttpPost(rpc("tools/list"))).tools as { name: string }[];
    for (const tool of tools) {
      const reply = handleHttpPost(rpc("tools/call", { name: tool.name, arguments: {} }));
      // It may legitimately answer "you forgot an argument", but it must never
      // be an unknown method or an unknown tool.
      expect(reply.body, tool.name).not.toHaveProperty("error");
    }
  });
});

// ---------------------------------------------------------------------------
// tools/call, one round trip per tool
// ---------------------------------------------------------------------------

describe("tools/call round trip", () => {
  it("returns text content and structured content for get_profile", () => {
    const reply = handleHttpPost(rpc("tools/call", { name: "get_profile", arguments: {} }, "abc"));
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ jsonrpc: "2.0", id: "abc" });

    const result = resultOf(reply);
    expect(result.isError).toBeFalsy();

    const content = result.content as { type: string; text: string }[];
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain(profile.shortName);

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.name).toBe(profile.name);
    expect(structured.jobTitle).toBe(profile.jobTitle);
    expect(structured.location).toBe(profile.location);
    expect(structured.education).toBe(profile.education);
    expect(structured.currentRole).toMatchObject({ org: experience[0].org });
    expect(structured.links).toContain(profile.contact[1].href);
  });

  it("lists every article's metadata in list_writing", () => {
    const structured = call("list_writing", {}).structuredContent as Record<string, unknown>;
    const rows = structured.articles as Record<string, unknown>[];

    expect(rows).toHaveLength(articles.length);
    expect(rows[0].slug).toBe(articles[0].slug);
    expect(rows[0].url).toBe(`https://fergusoreilly.dev/writing/${articles[0].slug}`);
    expect(rows[0].tags).toEqual(articles[0].tags);
    expect(typeof rows[0].readingMinutes).toBe("number");
    // Metadata only. The bodies are what `get_article` is for, and shipping
    // eight of them here would blow a client's context for a listing.
    expect(rows[0]).not.toHaveProperty("body");
  });

  it("returns the full markdown body from get_article", () => {
    const target = articles[0];
    const result = call("get_article", { slug: target.slug });

    expect(result.isError).toBeFalsy();
    const content = result.content as { text: string }[];
    expect(content[0].text).toContain(target.body.trim().slice(0, 60));

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.slug).toBe(target.slug);
    expect(structured.body).toBe(target.body);
    expect(structured.url).toBe(`https://fergusoreilly.dev/writing/${target.slug}`);
  });

  it("lists projects with their stack and links", () => {
    const structured = call("list_projects", {}).structuredContent as Record<string, unknown>;
    const rows = structured.projects as Record<string, unknown>[];

    expect(rows).toHaveLength(projects.length);
    expect(rows[0].title).toBe(projects[0].title);
    expect(rows[0].stack).toEqual(projects[0].stack);
    expect(rows[0].url).toBe(`https://fergusoreilly.dev/projects#${projects[0].slug}`);
  });

  it("lists experience newest first with bullets intact", () => {
    const structured = call("list_experience", {}).structuredContent as Record<string, unknown>;
    const rows = structured.experience as Record<string, unknown>[];

    expect(rows).toHaveLength(experience.length);
    expect(rows[0].org).toBe(experience[0].org);
    expect(rows[0].bullets).toEqual(experience[0].bullets);
    expect(rows[0].url).toBe(`https://fergusoreilly.dev/experience#${experience[0].id}`);
  });

  it("never leaks a function into a tool result", () => {
    // `run` is a function on the internal tool table, and a result that
    // carried one would reach the client with it missing rather than with an
    // error, because `JSON.stringify` drops function-valued properties in
    // silence. An earlier version of this test asserted `stringify` did not
    // throw, which is a check that could not fail: code review caught it and
    // `node -e "JSON.stringify({run(){}})"` confirms it returns `{}` happily.
    // So walk the result and look for the function directly.
    const functionsIn = (value: unknown, path = "$"): string[] => {
      if (typeof value === "function") return [path];
      if (Array.isArray(value)) return value.flatMap((v, i) => functionsIn(v, `${path}[${i}]`));
      if (typeof value === "object" && value !== null) {
        return Object.entries(value).flatMap(([k, v]) => functionsIn(v, `${path}.${k}`));
      }
      return [];
    };

    // The walker has to be able to find one, or it is the same ritual again.
    expect(functionsIn({ tools: [{ name: "x", run: () => 1 }] })).toEqual(["$.tools[0].run"]);

    for (const name of TOOL_NAMES) {
      const args =
        name === "get_article"
          ? { slug: articles[0].slug }
          : name === "search_writing"
            ? { query: "shopify" }
            : {};
      expect(functionsIn(call(name, args)), name).toEqual([]);
    }

    // And the same for the tool list, which is where the table is nearest the
    // wire.
    expect(functionsIn(resultOf(handleHttpPost(rpc("tools/list"))))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe("search_writing", () => {
  it("finds an article by a word from its own title", () => {
    const target = articles[0];
    const term = target.title.split(/\s+/).find((w) => w.length > 5) ?? target.title;
    const hits = searchWriting(term, 5);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.slug)).toContain(target.slug);
  });

  it("returns every field the tool promises, including a matching excerpt", () => {
    const hits = searchWriting("shopify", 3);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).toHaveProperty("slug");
      expect(hit).toHaveProperty("title");
      expect(hit).toHaveProperty("description");
      expect(hit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(hit.tags)).toBe(true);
      expect(hit.url).toBe(`https://fergusoreilly.dev/writing/${hit.slug}`);
      expect(hit.excerpt.length).toBeGreaterThan(0);
      // An excerpt that is really the whole article is not an excerpt.
      expect(hit.excerpt.length).toBeLessThan(400);
    }
  });

  it("requires every term to appear, so two unrelated words match nothing", () => {
    expect(searchWriting("shopify zzzqqqxyzzy")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchWriting("the", 2)).toHaveLength(2);
  });

  it("is case insensitive", () => {
    expect(searchWriting("SHOPIFY").map((h) => h.slug)).toEqual(
      searchWriting("shopify").map((h) => h.slug),
    );
  });

  it("returns an empty result, not an error, when nothing matches", () => {
    const result = call("search_writing", { query: "zzzqqqxyzzy" });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.results).toEqual([]);
    expect(structured.query).toBe("zzzqqqxyzzy");

    // The model has to be able to tell "no matches" from "something broke",
    // and be told what to do next. A bare "no results" is a dead end.
    const content = result.content as { text: string }[];
    expect(content[0].text).toContain("zzzqqqxyzzy");
    expect(content[0].text).toContain("list_writing");
  });

  it("excerpts around the match rather than from the top of the article", () => {
    const body = `${"filler ".repeat(200)}NEEDLE and the words after it.${" tail".repeat(50)}`;
    const out = excerpt(body, "needle");
    expect(out.toLowerCase()).toContain("needle");
    expect(out.startsWith("…")).toBe(true);
  });

  it("falls back to the start of the body when the term is only in metadata", () => {
    const out = excerpt("Alpha beta gamma delta.", "tag-only-term");
    expect(out).toContain("Alpha");
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("unknown methods", () => {
  it("returns -32601 rather than throwing", () => {
    const reply = handleHttpPost(rpc("does/not/exist"));
    const error = errorOf(reply);
    expect(error.code).toBe(ERROR_CODES.methodNotFound);
    expect(error.message).toContain("does/not/exist");
    // A legacy client reads its errors out of a 200 body. Handing it a 404
    // reads as "the endpoint moved" and it reconnects instead of reporting.
    expect(reply.status).toBe(200);
  });

  it("returns 404 alongside -32601 for a modern client, which the spec requires", () => {
    const reply = handleHttpPost(rpc("does/not/exist", { _meta: modernMeta() }));
    expect(errorOf(reply).code).toBe(ERROR_CODES.methodNotFound);
    expect(reply.status).toBe(404);
  });

  it("does not answer methods for capabilities it never declared", () => {
    for (const method of ["resources/list", "prompts/list", "completion/complete"]) {
      expect(errorOf(handleHttpPost(rpc(method))).code).toBe(ERROR_CODES.methodNotFound);
    }
  });
});

describe("malformed requests", () => {
  it("rejects a non-object body", () => {
    for (const body of [null, "hello", 42, true]) {
      const reply = handleHttpPost(body);
      expect(errorOf(reply).code, String(body)).toBe(ERROR_CODES.invalidRequest);
      expect(reply.status, String(body)).toBe(400);
      expect((reply.body as { id: unknown }).id).toBeNull();
    }
  });

  it("rejects a JSON-RPC batch, which this revision does not allow", () => {
    const reply = handleHttpPost([rpc("tools/list"), rpc("tools/list", undefined, 2)]);
    expect(errorOf(reply).code).toBe(ERROR_CODES.invalidRequest);
    expect(reply.status).toBe(400);
    // Assert the message, not just the code. An array already falls through
    // the plain-object check to the same code, so without this the batch
    // branch is decoration and deleting it changes nothing observable.
    expect(errorOf(reply).message).toContain("batch");
  });

  it("rejects a wrong or missing jsonrpc version", () => {
    expect(errorOf(handleHttpPost({ id: 1, method: "tools/list" })).code).toBe(
      ERROR_CODES.invalidRequest,
    );
    expect(errorOf(handleHttpPost({ jsonrpc: "1.0", id: 1, method: "tools/list" })).code).toBe(
      ERROR_CODES.invalidRequest,
    );
  });

  it("rejects a missing or non-string method", () => {
    expect(errorOf(handleHttpPost({ jsonrpc: "2.0", id: 1 })).code).toBe(
      ERROR_CODES.invalidRequest,
    );
    expect(errorOf(handleHttpPost({ jsonrpc: "2.0", id: 1, method: 7 })).code).toBe(
      ERROR_CODES.invalidRequest,
    );
  });

  it("rejects a null id, which MCP forbids even though JSON-RPC allows it", () => {
    const reply = handleHttpPost({ jsonrpc: "2.0", id: null, method: "tools/list" });
    expect(errorOf(reply).code).toBe(ERROR_CODES.invalidRequest);
  });

  it("accepts any well-formed notification with 202 and answers nothing", () => {
    const reply = handleHttpPost({ jsonrpc: "2.0", method: "notifications/something/new" });
    expect(reply.status).toBe(202);
    expect(reply.body).toBeNull();
  });
});

describe("tools/call with bad arguments", () => {
  it("is a protocol error when the tool does not exist", () => {
    const error = errorOf(handleHttpPost(rpc("tools/call", { name: "rm_rf_slash" })));
    expect(error.code).toBe(ERROR_CODES.invalidParams);
    expect(error.message).toContain("rm_rf_slash");
    // Name the tools it does have, so a model can correct itself in one turn.
    expect(error.message).toContain(TOOL_NAMES[0]);
  });

  it("is a protocol error when params are structurally wrong", () => {
    expect(errorOf(handleHttpPost(rpc("tools/call"))).code).toBe(ERROR_CODES.invalidParams);
    expect(errorOf(handleHttpPost(rpc("tools/call", { name: 42 }))).code).toBe(
      ERROR_CODES.invalidParams,
    );
    expect(
      errorOf(handleHttpPost(rpc("tools/call", { name: "list_writing", arguments: "nope" }))).code,
    ).toBe(ERROR_CODES.invalidParams);
  });

  it("is a tool error, not a crash, when a required argument is missing", () => {
    const result = call("search_writing", {});
    expect(result.isError).toBe(true);
    const content = result.content as { text: string }[];
    expect(content[0].text).toContain("query");
  });

  it("is a tool error when an argument is the wrong type", () => {
    const result = call("get_article", { slug: 42 });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain("slug");
  });

  it("is a tool error when a number is out of range", () => {
    const result = call("search_writing", { query: "shopify", limit: 999 });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain("limit");
  });

  it("names the valid slugs when get_article is given an unknown one", () => {
    const result = call("get_article", { slug: "no-such-article" });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0].text;
    expect(text).toContain("no-such-article");
    expect(text).toContain(articles[0].slug);
  });

  it("treats an omitted arguments object as an empty one", () => {
    const reply = handleHttpPost(rpc("tools/call", { name: "list_projects" }));
    expect(resultOf(reply).isError).toBeFalsy();
  });

  it("turns a thrown handler into -32603 instead of taking the route down", () => {
    // No JSON body can make a handler throw, so the only way to exercise the
    // catch is to hand it something JSON cannot express. A throwing getter is
    // a plain object as far as the dispatcher is concerned, and it explodes at
    // exactly the point a real bug in a handler would.
    const args = {
      query: "shopify",
      get limit(): number {
        throw new Error("boom");
      },
    };
    const reply = handleHttpPost(rpc("tools/call", { name: "search_writing", arguments: args }));

    const error = errorOf(reply);
    expect(error.code).toBe(ERROR_CODES.internal);
    expect(error.message).toContain("search_writing");
    expect(error.message).toContain("boom");
    // The caller did nothing wrong, so this must not masquerade as -32602 and
    // invite the model to retry with different arguments for ever.
    expect(error.code).not.toBe(ERROR_CODES.invalidParams);
    expect(reply.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Transport-level concerns
// ---------------------------------------------------------------------------

describe("header and body agreement", () => {
  it("accepts matching headers", () => {
    const reply = handleHttpPost(rpc("tools/call", { name: "list_writing", arguments: {} }), {
      protocolVersion: LEGACY_FALLBACK_VERSION,
      method: "tools/call",
      name: "list_writing",
    });
    expect(reply.status).toBe(200);
    expect(reply.body).not.toHaveProperty("error");
  });

  it("rejects an Mcp-Method header that disagrees with the body", () => {
    const reply = handleHttpPost(rpc("tools/list"), { method: "tools/call" });
    expect(reply.status).toBe(400);
    expect(errorOf(reply).code).toBe(ERROR_CODES.headerMismatch);
  });

  it("rejects an Mcp-Name header that disagrees with the body", () => {
    const reply = handleHttpPost(rpc("tools/call", { name: "list_writing" }), {
      method: "tools/call",
      name: "get_profile",
    });
    expect(reply.status).toBe(400);
    expect(errorOf(reply).code).toBe(ERROR_CODES.headerMismatch);
  });

  it("decodes the base64 sentinel before comparing Mcp-Name", () => {
    const encoded = `=?base64?${Buffer.from("list_writing", "utf8").toString("base64")}?=`;
    const reply = handleHttpPost(rpc("tools/call", { name: "list_writing", arguments: {} }), {
      method: "tools/call",
      name: encoded,
    });
    expect(reply.status).toBe(200);
  });

  it("rejects a protocol version header that disagrees with the body _meta", () => {
    const reply = handleHttpPost(rpc("tools/list", { _meta: modernMeta() }), {
      protocolVersion: "2025-06-18",
    });
    expect(reply.status).toBe(400);
    expect(errorOf(reply).code).toBe(ERROR_CODES.headerMismatch);
  });

  it("tolerates absent headers, because every shipped client predates them", () => {
    const reply = handleHttpPost(rpc("tools/list"));
    expect(reply.status).toBe(200);
  });
});

describe("protocol version support", () => {
  it("rejects a version it does not implement with -32022 and the list it does", () => {
    const reply = handleHttpPost(rpc("tools/list", { _meta: modernMeta("1999-01-01") }));
    expect(reply.status).toBe(400);
    const error = errorOf(reply);
    expect(error.code).toBe(ERROR_CODES.unsupportedProtocolVersion);
    expect(error.data).toMatchObject({
      supported: SUPPORTED_PROTOCOL_VERSIONS,
      requested: "1999-01-01",
    });
  });

  it("does not apply the version check to initialize, which negotiates instead", () => {
    // The version has to arrive where the check actually reads it, or this
    // asserts nothing: `params.protocolVersion` is the legacy handshake field
    // and `_meta`/the header are the per-request ones. An earlier version of
    // this test only set the first, so deleting the exemption left it green.
    const reply = handleHttpPost(
      rpc("initialize", {
        protocolVersion: "1999-01-01",
        _meta: { [META.protocolVersion]: "1999-01-01" },
      }),
      { protocolVersion: "1999-01-01" },
    );
    expect(reply.status).toBe(200);
    expect(resultOf(reply).protocolVersion).toBe(LEGACY_FALLBACK_VERSION);
  });

  it("does not read the legacy handshake field as a per-request version", () => {
    // `params.protocolVersion` on any other method is not the modern field and
    // must not be treated as one, in either direction.
    const reply = handleHttpPost(rpc("tools/list", { protocolVersion: "1999-01-01" }));
    expect(reply.status).toBe(200);
    expect(detectEra(rpc("tools/list", { protocolVersion: MODERN_PROTOCOL_VERSION }))).toBe(
      "legacy",
    );
  });

  it("accepts every version it advertises", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const reply = handleHttpPost(rpc("tools/list"), { protocolVersion: version });
      expect(reply.status, version).toBe(200);
    }
  });
});

describe("exceedsBodyLimit", () => {
  it("refuses a declared length over the limit", () => {
    expect(exceedsBodyLimit(String(MAX_BODY_BYTES + 1), null)).toBe(true);
    expect(exceedsBodyLimit(String(MAX_BODY_BYTES), null)).toBe(false);
  });

  it("refuses a read body over the limit", () => {
    expect(exceedsBodyLimit(null, MAX_BODY_BYTES + 1)).toBe(true);
    expect(exceedsBodyLimit(null, MAX_BODY_BYTES)).toBe(false);
  });

  it("reads a missing, empty or junk Content-Length as unknown, never as huge", () => {
    // A chunked request has no `content-length`, and a lying client can send
    // anything. Neither may be treated as a refusal on its own, or a normal
    // request from a normal client gets a 400.
    for (const header of [null, "", "not-a-number", "-1"]) {
      expect(exceedsBodyLimit(header, 10), String(header)).toBe(false);
    }
  });

  it("still catches a body that lied about its own length", () => {
    // Header says small, body is enormous. The second check is what makes the
    // header advisory rather than trusted.
    expect(exceedsBodyLimit("10", MAX_BODY_BYTES + 1)).toBe(true);
  });
});

describe("GET", () => {
  it("serves a human-readable page for a browser, not a 405", () => {
    const reply = handleHttpGet("text/html,application/xhtml+xml");
    expect(reply.status).toBe(200);
    expect(reply.contentType).toContain("text/plain");
    expect(reply.body).toContain(MCP_ENDPOINT);
    for (const name of TOOL_NAMES) expect(reply.body).toContain(name);
  });

  it("serves a plain GET the same way", () => {
    expect(handleHttpGet(null).status).toBe(200);
  });

  it("returns 405 to a legacy client probing for a standalone SSE stream", () => {
    // Those clients treat 405 as "no standalone stream here" and carry on. A
    // 200 of prose would be fed to their SSE parser instead.
    expect(handleHttpGet("text/event-stream").status).toBe(405);
    expect(handleHttpGet("application/json, text/event-stream").status).toBe(405);
  });
});

describe("humanReadableSummary", () => {
  it("is built from content/, so it cannot drift from the pages", () => {
    const text = humanReadableSummary();
    expect(text).toContain(profile.shortName);
    expect(text).toContain(MODERN_PROTOCOL_VERSION);
    expect(text).toContain("https://fergusoreilly.dev/mcp");
  });
});

// ---------------------------------------------------------------------------
// Discovery document
// ---------------------------------------------------------------------------

describe("public/.well-known/mcp.json", () => {
  it("is byte-identical to wellKnownDocument(), so it cannot go stale", () => {
    // The committed file is a static artefact: Next serves `public/` from the
    // site root and there is no route to generate it. This assertion is the
    // only thing standing between "we added a tool" and a discovery document
    // that quietly lies about which tools exist.
    const path = fileURLToPath(new URL("../public/.well-known/mcp.json", import.meta.url));
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    expect(onDisk).toEqual(wellKnownDocument());
  });

  it("describes the endpoint, transport and every tool", () => {
    const doc = wellKnownDocument();
    expect(doc.endpoint).toBe(MCP_ENDPOINT);
    expect(doc.transport).toBe("streamable-http");
    expect(doc.protocolVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    expect((doc.tools as { name: string }[]).map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });

  it("says out loud that it is not a ratified standard", () => {
    expect(String(wellKnownDocument().$comment).toLowerCase()).toContain("not");
  });
});

// ---------------------------------------------------------------------------
// The route handler itself
//
// Lives here rather than beside the route because `lib/mcp.ts` is the thing
// under test everywhere else in this file and the HTTP skin is three functions
// thin. Running it for real is the only way to know that `Response.json`, a
// null-bodied 202 and the header plumbing actually behave, rather than
// assuming they do because the pure layer passes.
// ---------------------------------------------------------------------------

describe("app/api/mcp/route", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request(MCP_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
    );

  it("answers a real tools/list POST with JSON and 200", async () => {
    const response = await post(JSON.stringify(rpc("tools/list")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("mcp-protocol-version")).toBe(MODERN_PROTOCOL_VERSION);

    const payload = await response.json();
    expect(payload.result.tools).toHaveLength(TOOL_NAMES.length);
  });

  it("round trips a tools/call over real HTTP objects", async () => {
    const response = await post(
      JSON.stringify(rpc("tools/call", { name: "get_profile", arguments: {} })),
    );
    const payload = await response.json();
    expect(payload.result.structuredContent.shortName).toBe(profile.shortName);
  });

  it("returns 202 with a genuinely empty body for a notification", async () => {
    const response = await post(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("reports unparseable JSON as -32700 rather than throwing", async () => {
    const response = await post("{ this is not json");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(ERROR_CODES.parse);
  });

  it("treats an empty POST body as a parse error, not an empty request", async () => {
    const response = await post("");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(ERROR_CODES.parse);
  });

  it("rejects an oversized body it has already read", async () => {
    // Valid JSON, just far too much of it. This is the backstop path: no
    // `content-length` is set here, so only the post-read check can catch it.
    const response = await post(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "x".repeat(300_000) }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("exceeds");
  });

  it("rejects on Content-Length before reading the body at all", async () => {
    // The point of the header check is that it fires without the body being
    // buffered, so prove it fires on the header alone: the actual body here is
    // a handful of bytes and would sail through every other check.
    const request = new Request(MCP_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpc("tools/list")),
    });
    // undici strips a hand-set content-length, so set it on the live Headers
    // object instead, which is what the route actually reads.
    request.headers.set("content-length", String(MAX_BODY_BYTES + 1));

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("exceeds");
    // And the body really was never consumed, which is the whole claim.
    expect(request.bodyUsed).toBe(false);
  });

  it("reads the standard headers off the real request", async () => {
    const response = await post(JSON.stringify(rpc("tools/list")), { "Mcp-Method": "tools/call" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(ERROR_CODES.headerMismatch);
  });

  it("serves prose to a browser GET", async () => {
    const response = await GET(
      new Request(MCP_ENDPOINT, { headers: { accept: "text/html" } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toContain("s-maxage");
    expect(await response.text()).toContain(MCP_ENDPOINT);
    // `/mcp` is the page that should rank. This URL serving a plain-text
    // paraphrase of it is a duplicate competing with it.
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("serves 405 and an Allow header to an SSE probe", async () => {
    const response = await GET(
      new Request(MCP_ENDPOINT, { headers: { accept: "text/event-stream" } }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toContain("POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers a CORS preflight with 204 and the headers a browser client needs", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    for (const header of ["mcp-protocol-version", "mcp-method", "mcp-name", "content-type"]) {
      expect(
        response.headers.get("access-control-allow-headers")?.toLowerCase(),
        header,
      ).toContain(header);
    }
  });

  it("completes a whole legacy client session in order", async () => {
    // The closest thing to plugging a real client in that can be done without
    // one: the exact four-step opening a 2025-06-18 client makes, each step
    // over real Request and Response objects, each feeding the next. It is
    // still a simulation of a client rather than a client, and the difference
    // is the whole reason this is not called a verification of interop.

    // 1. initialize
    const init = await post(
      JSON.stringify(
        rpc("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "ExampleClient", version: "1.0.0" },
        }),
      ),
    );
    expect(init.status).toBe(200);
    const negotiated = (await init.json()).result.protocolVersion;
    expect(negotiated).toBe("2025-06-18");

    // 2. notifications/initialized, then every later request carries the
    //    negotiated version in the header, which is what that era does.
    const ack = await post(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(ack.status).toBe(202);

    const versioned = { "MCP-Protocol-Version": negotiated };

    // 3. tools/list
    const list = await post(JSON.stringify(rpc("tools/list", undefined, 2)), versioned);
    const listed = (await list.json()).result.tools as { name: string }[];
    expect(listed.map((t) => t.name)).toEqual([...TOOL_NAMES]);

    // 4. tools/call, using a name taken from step 3 rather than a literal, so
    //    this breaks if the advertised list and the callable set ever diverge.
    const search = await post(
      JSON.stringify(rpc("tools/call", { name: listed[0].name, arguments: { query: "agents" } }, 3)),
      versioned,
    );
    const searchResult = (await search.json()).result;
    expect(searchResult.isError).toBeFalsy();
    expect(searchResult.structuredContent.count).toBeGreaterThan(0);

    // 5. and the slug that came back is one get_article will actually accept.
    const slug = searchResult.structuredContent.results[0].slug;
    const article = await post(
      JSON.stringify(rpc("tools/call", { name: "get_article", arguments: { slug } }, 4)),
      versioned,
    );
    const articleResult = (await article.json()).result;
    expect(articleResult.isError).toBeFalsy();
    expect(articleResult.structuredContent.slug).toBe(slug);
  });

  it("completes a whole modern client session with no handshake at all", async () => {
    // The 2026-07-28 opening: no initialize, no session, version and
    // capabilities on every request, with the headers mirroring the body.
    const meta = modernMeta();

    const discover = await post(JSON.stringify(rpc("server/discover", { _meta: meta })), {
      "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
      "Mcp-Method": "server/discover",
    });
    expect(discover.status).toBe(200);
    expect((await discover.json()).result.supportedVersions).toContain(MODERN_PROTOCOL_VERSION);

    const call = await post(
      JSON.stringify(rpc("tools/call", { name: "get_profile", arguments: {}, _meta: meta }, 2)),
      {
        "MCP-Protocol-Version": MODERN_PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "get_profile",
      },
    );
    expect(call.status).toBe(200);
    const result = (await call.json()).result;
    expect(result.resultType).toBe("complete");
    expect(result._meta[META.serverInfo].name).toBe(SERVER_INFO.name);
  });

  it("runs on Node and is never prerendered", () => {
    // A prerendered RPC endpoint answers every caller with one frozen reply,
    // and the failure mode is a server that looks fine and is stuck.
    expect(runtime).toBe("nodejs");
    expect(routeDynamic).toBe("force-dynamic");
  });
});

describe("toolDescriptors", () => {
  it("hands out the wire shape only, with no handler attached", () => {
    for (const tool of toolDescriptors()) {
      expect(tool).not.toHaveProperty("run");
    }
  });

  it("is a fresh array each call, so a client cannot mutate the table", () => {
    const a = toolDescriptors();
    const b = toolDescriptors();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("check_voice", () => {
  function doc(joins: number): string {
    return Array.from({ length: 40 }, (_, i) =>
      i < joins ? "And the cat was a thing." : "The cat was a thing here.",
    ).join(" ");
  }

  const pieces = [doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)];
  const callerRef = buildReference(pieces);
  const saved = JSON.parse(
    serialiseProfile(callerRef, profileOf(pieces, callerRef), null, "2026-09-03T12:00:00.000Z"),
  );

  const draft = [
    ...Array.from({ length: 20 }, () => "And the cat was a thing."),
    ...Array.from({ length: 10 }, () => "The cat was a thing here."),
  ].join(" ");

  /** The first text block of a tool result, which every case below reads. */
  function prose(result: Record<string, unknown>): string {
    return (result.content as { text: string }[])[0].text;
  }

  it("is listed", () => {
    expect(TOOL_NAMES).toContain("check_voice");
  });

  it("measures a draft against a saved profile", () => {
    const result = call("check_voice", { profile: saved, draft });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.status).toBe("ok");
    expect(typeof payload.delta).toBe("number");
    expect(Array.isArray(payload.metrics)).toBe(true);
  });

  it("measures against the caller's own reference, not this site's", () => {
    // The whole point. The population in the answer is the six documents the
    // caller's profile was built from, not the eleven articles at /writing.
    const payload = call("check_voice", { profile: saved, draft }).structuredContent as {
      reference: { documents: number; totalWords: number; markers: number };
    };
    expect(payload.reference.documents).toBe(6);
    expect(payload.reference.markers).toBe(callerRef.markers.length);
    expect(payload.reference.totalWords).toBe(callerRef.totalWords);
  });

  it("refuses a distance under the word floor and says so in words", () => {
    const result = call("check_voice", { profile: saved, draft: "Short. Far too short." });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.status).toBe("too-short");
    expect(payload.delta).toBeNull();
    expect(prose(result).toLowerCase()).toContain("150");
  });

  it("refuses a distance from a reference of three pieces and says so in words", () => {
    const thinPieces = [doc(1), doc(3), doc(6)];
    const thinRef = buildReference(thinPieces);
    const thin = JSON.parse(
      serialiseProfile(thinRef, profileOf(thinPieces, thinRef), null, "2026-09-03T12:00:00.000Z"),
    );
    const result = call("check_voice", { profile: thin, draft });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.status).toBe("thin-reference");
    expect(payload.delta).toBeNull();
    // The habits survive: none of them was ever measured in the population's units.
    expect((payload.metrics as unknown[]).length).toBeGreaterThan(0);
    expect(prose(result)).toContain("5");
  });

  it("returns a tool error, not a protocol error, for a profile it does not recognise", () => {
    const result = call("check_voice", { profile: { nope: true }, draft });
    expect(result.isError).toBe(true);
    expect(prose(result)).toContain("Drift profile");
  });

  it("returns a tool error for a profile with its reference stripped out", () => {
    // A z-score vector with no table behind it has no units. Measuring it
    // against whatever table was to hand is the exact failure this tool was
    // rewritten to remove, so it is refused rather than guessed at.
    const { reference: _dropped, ...noRef } = saved;
    expect(call("check_voice", { profile: noRef, draft }).isError).toBe(true);
  });

  it("returns a tool error when the draft is missing", () => {
    expect(call("check_voice", { profile: saved }).isError).toBe(true);
  });
});
