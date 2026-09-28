import type { McpPreset } from "@/content/mcp";

/**
 * The /mcp page's console: the requests it sends and how it reads the answers.
 *
 * Client code, so it deliberately does not import `lib/mcp.ts`, which pulls in
 * every article to answer searches and would put the lot in the browser bundle.
 * The protocol version and `_meta` keys are therefore repeated here, and
 * `lib/mcp-console.test.ts` pins them to the server's own constants.
 *
 * The console names itself in `_meta` clientInfo. The endpoint's analytics read
 * that name (`lib/analytics.ts`, `mcpCallProperties`), so a visitor pressing a
 * button on this page is never counted as an agent using the server.
 */
export const CONSOLE_CLIENT = "fergusoreilly.dev-console";
export const CONSOLE_PROTOCOL_VERSION = "2026-07-28";
export const CONSOLE_META_KEYS = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
} as const;

export function consoleRequest(preset: McpPreset, id: number): Record<string, unknown> {
  const _meta = {
    [CONSOLE_META_KEYS.protocolVersion]: CONSOLE_PROTOCOL_VERSION,
    [CONSOLE_META_KEYS.clientInfo]: { name: CONSOLE_CLIENT, version: "1" },
    [CONSOLE_META_KEYS.clientCapabilities]: {},
  };
  if (preset.method === "tools/list") return { jsonrpc: "2.0", id, method: "tools/list", params: { _meta } };
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: preset.tool, arguments: preset.arguments, _meta } };
}

/** The standard request headers a modern client sends, matching the body. */
export function consoleHeaders(preset: McpPreset): Record<string, string> {
  return {
    "MCP-Protocol-Version": CONSOLE_PROTOCOL_VERSION,
    "Mcp-Method": preset.method,
    ...(preset.method === "tools/call" ? { "Mcp-Name": preset.tool } : {}),
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

/**
 * A reply read as a few short lines, the way a person would summarise it. The
 * raw JSON is always one click away on the page; this is what shows first.
 */
export function consoleSummary(preset: McpPreset, body: unknown): string[] {
  if (!isObj(body)) return ["no answer"];
  if (isObj(body.error)) return [`error ${String(body.error.code)}: ${str(body.error.message)}`];
  const result = isObj(body.result) ? body.result : {};

  if (preset.method === "tools/list") {
    return list(result.tools).map((t) => `${str(t.name)}  ${str(t.title)}`);
  }

  const data = isObj(result.structuredContent) ? result.structuredContent : {};
  switch (preset.tool) {
    case "get_profile": {
      const now = isObj(data.currentRole) ? `${str(data.currentRole.role)} at ${str(data.currentRole.org)}` : "";
      const knows = Array.isArray(data.knowsAbout) ? data.knowsAbout.slice(0, 4).join(", ") : "";
      return [str(data.shortName), `${str(data.jobTitle)}, ${str(data.location)}`, now && `now: ${now}`, knows && `knows about: ${knows}`].filter(Boolean);
    }
    case "list_projects": {
      const rows = list(data.projects);
      const shown = rows.slice(0, 4).map((p) => `${str(p.title)}: ${str(p.tagline)}`);
      return rows.length > shown.length ? [...shown, `and ${rows.length - shown.length} more`] : shown;
    }
    case "list_experience":
      return list(data.experience).slice(0, 5).map((e) => `${str(e.dates)}  ${str(e.role)}, ${str(e.org)}`);
    case "search_writing": {
      const hits = list(data.results);
      const head = `${hits.length} ${hits.length === 1 ? "article matches" : "articles match"} "${str(data.query)}"`;
      return [head, ...hits.map((h) => `${str(h.title)} (${str(h.date)})`)];
    }
    default: {
      const content = list(result.content)[0];
      return str(content?.text).split("\n").filter(Boolean).slice(0, 4);
    }
  }
}
