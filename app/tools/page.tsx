import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
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
    <div className="stack">
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
      <h1 className="page__title">
        <Scramble text="tools" speed={34} />
      </h1>
      <p className="page__lede">{DESCRIPTION}</p>

      <ul className="tools__list">
        {rows.map((row) => (
          <li key={row.slug} className="tools__item">
            {row.href ? (
              <Link href={row.href} className="tools__link">
                <h2 className="tools__title">{row.name}</h2>
              </Link>
            ) : (
              <h2 className="tools__title is-soon">
                {row.name}
                <span className="tools__soon">{toolShellCopy.soonLabel}</span>
              </h2>
            )}
            <p className="tools__blurb">{row.blurb}</p>
            <p className="tools__meta">{row.privacyLine}</p>
          </li>
        ))}
      </ul>

      <Talk line="If one of these is nearly what you need but not quite, tell me and I'll have a look." />
    </div>
  );
}
