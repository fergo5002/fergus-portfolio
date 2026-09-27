import type { Metadata } from "next";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { CopyButton, McpConsole, McpInstall } from "@/components/mcp/McpPanels";
import { mcpCopy as copy } from "@/content/mcp";
import { profile } from "@/content/profile";
import { canonical, collectionPageSchema, breadcrumbSchema, OG_IMAGE } from "@/lib/seo";
import {
  MCP_ENDPOINT,
  MODERN_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  toolDescriptors,
} from "@/lib/mcp";
import "./mcp.css";

/**
 * `/mcp`: what the server at `/api/mcp` is, shown working.
 *
 * Rebuilt on 2026-09-26 to lead with the thing itself: the URL, how to add it,
 * and a console that makes real calls from the visitor's browser. The reasoning
 * that used to fill the page sits behind one disclosure. The tool list is still
 * read from `lib/mcp.ts` rather than retyped, so the page cannot document a
 * tool the server does not have, and `lib/mcp-console.test.ts` fails if a tool
 * appears without a line in `content/mcp.ts`.
 */

const DESCRIPTION =
  "This site runs a Model Context Protocol server. Point an MCP client at one URL and an agent can search the writing, read a full article, and pull the profile, projects and experience as structured data.";

const TOOLS = toolDescriptors();

const CLAUDE_SNIPPET = `claude mcp add --transport http fergus-oreilly ${MCP_ENDPOINT}`;
const JSON_SNIPPET = `{
  "mcpServers": {
    "fergus-oreilly": {
      "type": "http",
      "url": "${MCP_ENDPOINT}"
    }
  }
}`;

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
    <div className="stack mcp">
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
      <p className="page__lede">{copy.lede}</p>

      <div className="mcp-endpoint">
        <span className="mcp-endpoint__k">{copy.endpoint}</span>
        <code className="mcp-endpoint__url">{MCP_ENDPOINT}</code>
        <CopyButton text={MCP_ENDPOINT} />
      </div>

      <McpInstall claude={CLAUDE_SNIPPET} json={JSON_SNIPPET} />

      <McpConsole endpoint="/api/mcp" />

      <section className="mcp-tools" aria-labelledby="mcp-tools-title">
        <h2 id="mcp-tools-title" className="mcp-tools__title">{copy.tools}</h2>
        <ul className="mcp-tools__list">
          {TOOLS.map((tool) => (
            <li key={tool.name} className="mcp-tools__item">
              {/* The house offset-anchor pattern, so a jump lands below the nav. */}
              <span id={tool.name} className="anchor" />
              <code className="mcp-tools__name">{tool.name}</code>
              <span className="mcp-tools__note">{copy.toolNotes[tool.name]}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mcp-why">{copy.why}</p>

      <details className="mcp-details">
        <summary>{copy.details}</summary>
        <div className="prose">
          <p className="prose__p">
            {`Streamable HTTP, no authentication because everything it returns is already public. It implements revision ${MODERN_PROTOCOL_VERSION} of the spec and still answers the older initialize handshake used by ${SUPPORTED_PROTOCOL_VERSIONS.slice(1).join(", ")}, because that is what most clients open with. There is a ${copy.wellKnown} at `}
            <a className="prose__link" href="/.well-known/mcp.json">/.well-known/mcp.json</a>
            {"."}
          </p>
          {copy.reasons.map((paragraph) => (
            <p className="prose__p" key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
        </div>
      </details>

      <Talk line={copy.talk} />
    </div>
  );
}
