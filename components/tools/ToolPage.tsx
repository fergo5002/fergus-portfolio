import type { ReactNode } from "react";
import Link from "next/link";
import { workbenchCopy } from "@/content/tool-workbench";
import { labCopy } from "@/content/lab";
import "./workbench.css";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";
import { breadcrumbSchema, toolPageSchema, toolPath, type JsonLdObject } from "@/lib/seo";

/**
 * The instrument shell: the page every tool renders through.
 *
 * Server component, no state. Top to bottom:
 *
 *   1. the prompt line and the back link
 *   2. the h1, which is the slug (unchanged for SEO: every page on this site
 *      heads itself the terminal way, and the headline checker's h1 has stayed
 *      byte-identical since it moved into the shell)
 *   3. ONE sentence of purpose: `tool.purpose`, falling back to `tool.blurb`
 *   4. the stage: `children`, full width, nothing above it but the heading
 *   5. one privacy line with a lock: `tool.privacyLine`, falling back to the
 *      generic line for `tool.privacy` (`toolShellCopy.privacy`, pinned
 *      verbatim by `content/tools/index.test.ts`)
 *   6. ONE disclosure holding everything secondary, in this order:
 *      `tool.privacyNote`, `tool.method` (paragraphs), the page's `notes`, and
 *      the "Can't see" list (`tool.cantSee`, required, because a tool that
 *      hides its blind spot is worse than no tool)
 *   7. the call to action, when the page passes `talk`
 *
 * ## How a tool plugs in (the contract for every tool page)
 *
 * ```tsx
 * export default function Page() {
 *   return (
 *     <ToolPage tool={tool} talk="..." notes={<p>...</p>}>
 *       <MyInstrument />
 *     </ToolPage>
 *   );
 * }
 * ```
 *
 * - **The stage slot is `children`.** Render the instrument itself, already
 *   running on its example, with no heading, eyebrow or lede of its own: the
 *   shell has said what the tool is. `components/tools/ToolPage.test.ts`
 *   fails if anything but the heading sits above the stage, and
 *   `components/studio/eyebrow.test.ts` fails on an eyebrow anywhere in the
 *   tools. Stage furniture comes from `components/instrument/`.
 * - **The example is the instrument's own business.** Build it in a lazy
 *   `useState` initialiser (or on the server and pass it as props, as Drift
 *   does) so the first paint is the visual, not an empty form.
 * - **Words come from the registry entry** in `content/tools/<slug>.ts`:
 *   `purpose` for the one sentence, `privacyLine` when the generic line would
 *   be false, `privacyNote` and `method` for the disclosure, `cantSee` for the
 *   list. `notes` is for disclosure content that needs markup, such as a link.
 * - `extraSchema` adds an edge the registry has no field for (`isBasedOn`).
 * - The page stays a server component and imports its own `./tool.css`.
 */
export default function ToolPage({
  tool,
  children,
  extraSchema,
  talk,
  notes,
  localReview = false,
}: {
  tool: ToolEntry;
  children: ReactNode;
  extraSchema?: JsonLdObject;
  talk?: string;
  /** Extra disclosure content that needs markup (a link, a list). Words still come from content/. */
  notes?: ReactNode;
  localReview?: boolean;
}) {
  return (
    <div className="stack tool-workbench">
      {!localReview && (
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
      )}
      <PromptLine command={`./${tool.slug}`} path={toolShellCopy.indexPath} />
      <Link className="bench-back" href={localReview ? "/lab" : "/tools"}>
        {localReview ? labCopy.back : workbenchCopy.back}
      </Link>
      <header className="bench-head">
        <h1 className="page__title">
          <Scramble text={tool.slug} speed={34} />
        </h1>
        <p className="page__lede">{tool.purpose ?? tool.blurb}</p>
      </header>
      <div className="bench-stage">{children}</div>
      <p className="tool__privacy">
        <svg className="bench-lock" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3.5 7.5h9v6.5h-9zM5.5 7.5V5.25a2.5 2.5 0 0 1 5 0V7.5" />
        </svg>
        <span>{tool.privacyLine ?? toolShellCopy.privacy[tool.privacy]}</span>
      </p>
      <details className="bench-disclosure tool__cantsee">
        <summary>{toolShellCopy.disclosure}</summary>
        <div className="bench-disclosure__body">
          {tool.privacyNote ? <p className="tool__privacynote">{tool.privacyNote}</p> : null}
          {tool.method?.map((line) => (
            <p key={line} className="bench-method">
              {line}
            </p>
          ))}
          {notes}
          <h2 className="tool__cantsee-title">{toolShellCopy.cantSeeHeading}</h2>
          <ul className="tool__cantsee-list">
            {tool.cantSee.map((line) => (
              <li key={line} className="tool__cantsee-item">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </details>

      {talk ? <Talk line={talk} /> : null}
    </div>
  );
}
