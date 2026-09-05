import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import ToolPreview from "@/components/tools/ToolPreview";
import { workbenchCopy } from "@/content/tool-workbench";
import "@/components/tools/workbench.css";
import Talk from "@/components/Talk";
import { profile } from "@/content/profile";
import { liveTools, toolShellCopy, tools } from "@/content/tools";
import { OG_IMAGE, breadcrumbSchema, canonical, collectionPageSchema, toolPath } from "@/lib/seo";
import { toolListing } from "@/lib/tools/listing";

const DESCRIPTION =
  "Small free tools, each one built because something went wrong here first and the fix was worth handing over.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Tools",
  description: DESCRIPTION,
  alternates: canonical("/tools"),
  openGraph: {
    title: `Tools · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/tools",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * The index, read from `content/tools/`. Adding a tool is one file in that
 * folder and one import line; this page has no list of its own any more.
 *
 * A `soon` entry gets its name and its blurb and no link, because a link to a
 * page that is not there is a 404 with a nice label. The decision is made in
 * `lib/tools/listing.ts`, where it can be tested.
 */
export default function ToolsPage() {
  const rows = toolListing(tools);

  return (
    <div className="stack tools-workbench">
      <JsonLd
        nodes={[
          collectionPageSchema({
            path: "/tools",
            name: `Tools · ${profile.shortName}`,
            description: DESCRIPTION,
            itemType: "WebApplication",
            items: liveTools.map((t) => ({
              name: t.name,
              url: toolPath(t.slug),
              description: t.blurb,
            })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
          ]),
        ]}
      />
      <PromptLine command={toolShellCopy.indexCommand} path={toolShellCopy.indexPath} />
      <header className="bench-intro">
        <div>
          <h1>{workbenchCopy.title}</h1>
          <p>{workbenchCopy.description}</p>
          <p className="bench-subline">{workbenchCopy.noAccount}</p>
        </div>
        <span className="bench-intro__count" aria-label={`${liveTools.length} tools`}>{String(liveTools.length).padStart(2, "0")}</span>
      </header>
      <p className="bench-note">{workbenchCopy.example}</p>
      <ul className="bench-grid">
        {rows.map((row) => (
          <li key={row.slug} className="bench-card">
            {row.href ? (
              <Link href={row.href} className="bench-card__link">
                <div className="bench-card__top">
                  <h2>{row.name}</h2>
                  <span className="bench-card__category">{workbenchCopy.tools[row.slug]?.category}</span>
                </div>
                <p className="bench-card__purpose">{workbenchCopy.tools[row.slug]?.purpose ?? row.blurb}</p>
                <ToolPreview slug={row.slug} />
                <p>{workbenchCopy.tools[row.slug]?.output ?? row.blurb}</p>
                <p className="bench-card__input">{workbenchCopy.tools[row.slug]?.input}</p>
                <span className="bench-card__open">{workbenchCopy.open}</span>
              </Link>
            ) : (
              <h2 className="tools__title is-soon">
                {row.name}
                <span className="tools__soon">{toolShellCopy.soonLabel}</span>
              </h2>
            )}
          </li>
        ))}
      </ul>

      <Talk line="If one of these is nearly what you need but not quite, tell me and I'll have a look." />
    </div>
  );
}
