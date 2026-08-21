import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Window from "@/components/Window";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { profile } from "@/content/profile";
import { canonical, collectionPageSchema, breadcrumbSchema, absolute, OG_IMAGE } from "@/lib/seo";
import {
  MCP_ENDPOINT,
  MODERN_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  toolDescriptors,
} from "@/lib/mcp";

/**
 * `/mcp`: the page a person lands on when they want to know what the server at
 * `/api/mcp` is.
 *
 * The tool list is read from `lib/mcp.ts` rather than retyped, for the same
 * reason `/llms.txt` is derived from `content/`: a page that documents six
 * tools while the server exposes seven is worse than no page, and there is no
 * moment at which anyone would notice the drift.
 *
 * Every class used here already exists in `app/globals.css`. Nothing was added
 * to it: another agent owns that file.
 */

const DESCRIPTION =
  "This site runs a Model Context Protocol server. Point an MCP client at one URL and an agent can search the writing, read a full article, and pull the profile, projects and experience as structured data.";

const LEDE =
  "This site is also an MCP server. Point a client at one URL and your agent can search my writing, read a whole article, and pull my profile, projects and experience as structured data, rather than trying to scrape a page whose main feature is pretending to be a cathode ray tube.";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "fergus-oreilly": {
      "type": "http",
      "url": "${MCP_ENDPOINT}"
    }
  }
}`;

const WHY = [
  "I have no evidence this helps the site rank for anything, and I am not going to pretend otherwise. No search engine has said it reads MCP servers, and there is no ratified way to advertise one, so the discovery file at /.well-known/mcp.json is a bet on a convention that may never land. It cost one static file, which is about what the bet is worth.",
  "What it does do is real enough. If you are talking to an agent and it wants to know what I have built, it can ask this and get an answer I wrote, instead of guessing from training data that went stale months ago. And building it meant reading the specification properly rather than installing an SDK for six methods, which was most of the point. The current revision deleted the initialize handshake and moved the whole protocol to per-request metadata. I would not have got that from memory, and neither would a model.",
  "Every tool reads from the same content modules the pages render from, so the server cannot tell you something the site does not say. That is the rule /llms.txt already follows, and it matters more here, because nobody ever reads this output with their own eyes.",
];

const TOOLS = toolDescriptors();

/** The three things somebody scanning this page needs before anything else. */
const FACTS = [
  { k: "transport", v: "Streamable HTTP" },
  { k: "protocol", v: MODERN_PROTOCOL_VERSION },
  { k: "auth", v: "None, it is all public" },
];

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "MCP server",
  description: DESCRIPTION,
  alternates: canonical("/mcp"),
  openGraph: {
    title: `MCP server · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/mcp",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

export default function McpPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          collectionPageSchema({
            path: "/mcp",
            name: `MCP server · ${profile.shortName}`,
            description: DESCRIPTION,
            items: TOOLS.map((tool) => ({
              name: tool.name,
              url: `/mcp#${tool.name}`,
              description: tool.description,
            })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "MCP server", path: "/mcp" },
          ]),
        ]}
      />

      <PromptLine command="cat ./mcp/README.md" path="~/mcp" />
      <h1 className="page__title">
        <Scramble text="mcp" speed={34} />
      </h1>
      <p className="page__lede">{LEDE}</p>

      <Window title="endpoint">
        <div className="prose">
          <pre className="prose__pre">
            <code>{`POST ${MCP_ENDPOINT}`}</code>
          </pre>
          <p className="prose__p">
            {
              "Open it in a browser and it tells you what it is. Send it JSON-RPC and it answers as a server."
            }
          </p>
        </div>
      </Window>

      {/* Same markup as the landing page's highlights: a list, with the key
          carrying a trailing slash so it reads as a path segment. */}
      <ul className="highlights" aria-label="Server details">
        {FACTS.map((fact) => (
          <li key={fact.k} className="hl">
            <span className="hl__k">{fact.k}/</span>
            <span className="hl__v">{fact.v}</span>
          </li>
        ))}
      </ul>

      <div className="prose">
        <h2 className="prose__h">Tools</h2>
        <ul className="prose__list">
          {TOOLS.map((tool) => (
            <li key={tool.name}>
              {/* The house offset-anchor pattern, same as ProjectCard. An `id`
                  straight on the `li` would land the jump underneath the
                  sticky nav, because nothing in this stylesheet sets
                  `scroll-margin`. */}
              <span id={tool.name} className="anchor" />
              <code className="prose__code">{tool.name}</code> {tool.description}
            </li>
          ))}
        </ul>

        <h2 className="prose__h">Connecting</h2>
        <p className="prose__p">
          {
            "Most clients take a block like this in their config file. Some want the same two values typed into a form instead, and a couple have a one-line command for it. The name is yours to choose, the URL is the part that matters."
          }
        </p>
      </div>

      <Window title="mcp config">
        <div className="prose">
          <pre className="prose__pre">
            <code>{CONFIG_SNIPPET}</code>
          </pre>
        </div>
      </Window>

      <div className="prose">
        <p className="prose__p">
          {`It implements revision ${MODERN_PROTOCOL_VERSION} of the spec, and it still answers the older initialize handshake used by ${SUPPORTED_PROTOCOL_VERSIONS.slice(1).join(", ")}, because that is what the clients people actually have will open with. There is a machine-readable description at `}
          <a className="prose__link" href="/.well-known/mcp.json">
            /.well-known/mcp.json
          </a>
          {"."}
        </p>

        <h2 className="prose__h">Why this exists</h2>
        {WHY.map((paragraph) => (
          <p className="prose__p" key={paragraph.slice(0, 32)}>
            {paragraph}
          </p>
        ))}
      </div>

      <Talk line="If you are building agent tooling, or you have pointed a client at this and something behaved oddly, I would genuinely like to hear about it." />
    </div>
  );
}
