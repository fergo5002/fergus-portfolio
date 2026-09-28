/**
 * Words for `/mcp`. The page leads with the thing working (a console that makes
 * real calls) and keeps the reasoning behind a disclosure, at Fergus's request
 * on 2026-09-26: clearer, the value shown, far fewer lines of text.
 */

export type McpPreset =
  | { id: string; label: string; method: "tools/call"; tool: string; arguments: Record<string, unknown> }
  | { id: string; label: string; method: "tools/list" };

const presets: readonly McpPreset[] = [
  { id: "who", label: "Who is Fergus?", method: "tools/call", tool: "get_profile", arguments: {} },
  { id: "building", label: "What has he built?", method: "tools/call", tool: "list_projects", arguments: {} },
  { id: "writing", label: "Anything on customers?", method: "tools/call", tool: "search_writing", arguments: { query: "customer" } },
  { id: "worked", label: "Where has he worked?", method: "tools/call", tool: "list_experience", arguments: {} },
  { id: "tools", label: "What can you do?", method: "tools/list" },
];

export const mcpCopy = {
  lede: "This site is an MCP server. Point your agent at one URL and it reads my work as data, rather than scraping a page that pretends to be a cathode ray tube.",
  endpoint: "endpoint",
  copy: "copy",
  copied: "copied",
  add: "add it",
  clients: { claude: "Claude Code", json: "Any client" },
  ask: "ask it",
  askHint: "Real calls to the live server, from your browser.",
  request: "request",
  answer: "answer",
  raw: "show the raw JSON",
  idle: "Pick a question to send it.",
  sending: "sending",
  failed: "The server did not answer. Try again in a moment.",
  presets,
  tools: "tools",
  /** One line per tool, for people. The descriptions the server sends are written for models. */
  toolNotes: {
    get_profile: "who he is and what he does now",
    list_projects: "every project, his role and the stack",
    list_experience: "where he has worked, newest first",
    list_writing: "everything published, newest first",
    search_writing: "search every article",
    get_article: "one article in full",
    check_voice: "a draft against a saved Drift voice profile",
  } as Record<string, string>,
  why: "Every answer comes from the same files these pages are built from, so an agent cannot hear something the site does not say.",
  details: "The protocol, and why this exists",
  wellKnown: "machine-readable description",
  reasons: [
    "I have no evidence this helps the site rank for anything. No search engine has said it reads MCP servers, and there is no ratified way to advertise one, so the discovery file is a bet on a convention that may never land. It cost one static file, which is about what the bet is worth.",
    "What it does do is real enough. If you are talking to an agent and it wants to know what I have built, it can ask this and get an answer I wrote, instead of guessing from training data that went stale months ago. Building it also meant reading the specification properly rather than installing an SDK for six methods: the current revision deleted the initialize handshake and moved the whole protocol to per-request metadata, which I would not have got from memory, and neither would a model.",
  ],
  talk: "If you are building agent tooling, or you pointed a client at this and something behaved oddly, I would like to hear about it.",
} as const;
