import type { ReactNode } from "react";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";
import { breadcrumbSchema, toolPageSchema, toolPath, type JsonLdObject } from "@/lib/seo";

/**
 * The page every tool renders through.
 *
 * Server component, no state. It takes the registry entry and puts the same
 * five things around every tool: the prompt line, the heading, the lede (the
 * registry blurb, so the index and the page cannot disagree), the privacy
 * line, and the "Can't see" list at the foot. A tool that hides its blind spot
 * is worse than no tool, and putting the list in the shell means no tool can
 * forget it.
 *
 * The heading is the slug, not the name. Every other page on this site heads
 * itself the terminal way (`tools`, `contact`, `headline-check`), the name is
 * for the index, the breadcrumb and the graph, and keeping the slug is what
 * keeps the headline checker's h1 byte-identical through the move.
 *
 * `extraSchema` and `talk` are optional additions to the frozen `{ tool,
 * children }` contract: the first lets a page add an edge the registry has no
 * field for (`isBasedOn`), the second renders the site's call to action after
 * the list so it stays the last thing on the page, where it is everywhere else.
 */
export default function ToolPage({
  tool,
  children,
  extraSchema,
  talk,
}: {
  tool: ToolEntry;
  children: ReactNode;
  extraSchema?: JsonLdObject;
  talk?: string;
}) {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          toolPageSchema(tool, extraSchema),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
            { name: tool.name, path: toolPath(tool.slug) },
          ]),
        ]}
      />
      <PromptLine command={`./${tool.slug}`} path={toolShellCopy.indexPath} />
      <h1 className="page__title">
        <Scramble text={tool.slug} speed={34} />
      </h1>
      <p className="page__lede">{tool.blurb}</p>
      <p className="tool__privacy">{toolShellCopy.privacy[tool.privacy]}</p>
      {tool.privacyNote ? <p className="tool__privacynote">{tool.privacyNote}</p> : null}

      {children}

      <section className="tool__cantsee" aria-labelledby="tool-cantsee">
        <h2 id="tool-cantsee" className="tool__cantsee-title">
          {toolShellCopy.cantSeeHeading}
        </h2>
        <ul className="tool__cantsee-list">
          {tool.cantSee.map((line) => (
            <li key={line} className="tool__cantsee-item">
              {line}
            </li>
          ))}
        </ul>
      </section>

      {talk ? <Talk line={talk} /> : null}
    </div>
  );
}
