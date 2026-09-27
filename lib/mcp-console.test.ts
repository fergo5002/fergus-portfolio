import { describe, expect, it } from "vitest";
import { CONSOLE_CLIENT, CONSOLE_META_KEYS, CONSOLE_PROTOCOL_VERSION, consoleHeaders, consoleRequest, consoleSummary } from "./mcp-console";
import { handleHttpPost as serve, META, MODERN_PROTOCOL_VERSION, TOOL_NAMES, type McpHeaderView } from "./mcp";
import { mcpCopy, type McpPreset } from "@/content/mcp";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

/** The route reads these three headers; this is what it would hand the protocol. */
const view = (h: Record<string, string>): McpHeaderView => ({
  protocolVersion: h["MCP-Protocol-Version"] ?? null,
  method: h["Mcp-Method"] ?? null,
  name: h["Mcp-Name"] ?? null,
});
const handleHttpPost = (message: unknown, headers: Record<string, string>) => serve(message, view(headers));

describe("the console's copy of the protocol constants", () => {
  // The console is client code and must not import lib/mcp.ts, which would
  // bundle every article into the browser. So it keeps its own copies, pinned here.
  it("matches the server's protocol version and _meta keys", () => {
    expect(CONSOLE_PROTOCOL_VERSION).toBe(MODERN_PROTOCOL_VERSION);
    expect(CONSOLE_META_KEYS).toEqual({ protocolVersion: META.protocolVersion, clientInfo: META.clientInfo, clientCapabilities: META.clientCapabilities });
  });
});

/**
 * The /mcp page's console makes real calls from the visitor's browser. These
 * tests put every preset through the actual protocol handler, so a preset that
 * the server would refuse cannot ship.
 */
describe("the MCP console presets", () => {
  for (const preset of mcpCopy.presets) {
    it(`"${preset.label}" is answered, not refused`, () => {
      const request = consoleRequest(preset, 7);
      const reply = handleHttpPost(request, consoleHeaders(preset));
      expect(reply.status).toBe(200);
      expect(reply.body && "result" in reply.body).toBe(true);
    });
  }

  it("names only tools the server actually has", () => {
    for (const preset of mcpCopy.presets) {
      if (preset.method === "tools/call") expect(TOOL_NAMES).toContain(preset.tool);
    }
  });

  it("declares itself, so its calls can be told apart from real agents in the analytics", () => {
    const request = consoleRequest(mcpCopy.presets[0], 1) as { params: { _meta: Record<string, { name?: string }> } };
    expect(request.params._meta[META.clientInfo]?.name).toBe(CONSOLE_CLIENT);
  });
});

describe("consoleSummary", () => {
  const answer = (id: string) => {
    const preset: McpPreset | undefined = mcpCopy.presets.find((p) => p.id === id);
    if (!preset) throw new Error(`no preset ${id}`);
    const reply = handleHttpPost(consoleRequest(preset, 1), consoleHeaders(preset));
    return consoleSummary(preset, reply.body);
  };

  it("reads a profile answer as the person", () => {
    expect(answer("who").join(" ")).toContain(profile.shortName);
  });

  it("reads a projects answer as the projects", () => {
    expect(answer("building").join(" ")).toContain(projects[0].title);
  });

  it("reads a tools listing as the tool names", () => {
    const text = answer("tools").join(" ");
    for (const name of TOOL_NAMES) expect(text).toContain(name);
  });

  it("says plainly when the server returned an error", () => {
    expect(consoleSummary(mcpCopy.presets[0], { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad" } })).toEqual(["error -32602: bad"]);
  });
});

describe("the tool notes on the page", () => {
  it("cover every tool the server exposes, so a new tool cannot appear without a line", () => {
    expect(Object.keys(mcpCopy.toolNotes).sort()).toEqual([...TOOL_NAMES].sort());
  });
});
