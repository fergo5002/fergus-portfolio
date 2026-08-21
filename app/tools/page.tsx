import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { profile } from "@/content/profile";
import { OG_IMAGE, breadcrumbSchema, canonical, collectionPageSchema } from "@/lib/seo";

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
 * The list. One entry at the time of writing, and a list of one is still the
 * right shape: `/tools/headline-check` would otherwise be a page with no parent,
 * which means `/tools` is a 404 that a breadcrumb points at.
 *
 * Hard-coded here rather than read from `content/`, only because this change was
 * scoped to `app/tools/`. The second tool is the moment to move it.
 */
const tools = [
  {
    href: "/tools/headline-check",
    name: "Headline check",
    blurb:
      "Paste a URL and see how its h1 comes out for something that reads HTML without running it. Catches split-text animations that turn a headline into loose letters.",
    meta: "No sign-up, no JavaScript required, nothing stored.",
  },
];

export default function ToolsPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          collectionPageSchema({
            path: "/tools",
            name: `Tools · ${profile.shortName}`,
            description: DESCRIPTION,
            items: tools.map((t) => ({ name: t.name, url: t.href, description: t.blurb })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
          ]),
        ]}
      />
      <PromptLine command="ls -la ./tools" path="~/tools" />
      <h1 className="page__title">
        <Scramble text="tools" speed={34} />
      </h1>
      <p className="page__lede">{DESCRIPTION}</p>

      <ul className="tools__list">
        {tools.map((tool) => (
          <li key={tool.href} className="tools__item">
            <Link href={tool.href} className="tools__link">
              <h2 className="tools__title">{tool.name}</h2>
            </Link>
            <p className="tools__blurb">{tool.blurb}</p>
            <p className="tools__meta">{tool.meta}</p>
          </li>
        ))}
      </ul>

      <Talk line="If one of these is nearly what you need but not quite, tell me and I'll have a look." />
    </div>
  );
}
