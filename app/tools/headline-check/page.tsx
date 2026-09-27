import type { Metadata } from "next";
import Link from "next/link";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { headlineCheck as tool } from "@/content/tools/headline-check";
import { headlineWhy } from "@/content/tools/headline-check";
import { OG_IMAGE, absolute, canonical, toolPath } from "@/lib/seo";
import HeadlineForm from "./HeadlineForm";
import HeadlineLab from "./HeadlineLab";
import { ARTICLE_PATH } from "./state";
import "./tool.css";

const PATH = toolPath(tool.slug);

const DESCRIPTION =
  "Paste a URL and see how its h1 extracts for a crawler that reads HTML without running it. Catches per-character split-text animations that turn a headline into loose letters.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: tool.name,
  description: DESCRIPTION,
  alternates: canonical(PATH),
  openGraph: {
    title: `${tool.name} · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/headline-check`.
 *
 * The article at `ARTICLE_PATH` explains why a per-character heading animation
 * costs you the words it decorates. This is the same check, pointed at anyone's
 * page, because an argument somebody has to take on trust is worth less than
 * one they can run against their own site in ten seconds.
 *
 * The shell (`ToolPage`) draws the prompt line, the heading, the one sentence,
 * the privacy line and the disclosure from the registry entry. This file owns
 * the stage (the two readings on their example, then the URL form) and the
 * note that says why it is worth ten seconds, which goes in the disclosure.
 * `isBasedOn` is the one edge the registry has no field for: it ties the tool
 * to the article so the two are one piece of work rather than two pages that
 * happen to link.
 */
export default function HeadlineCheckPage() {
  return (
    <ToolPage
      tool={tool}
      extraSchema={{ isBasedOn: absolute(ARTICLE_PATH) }}
      talk="If this found something on your site, I'd genuinely like to know what it was."
      notes={
        <section className="hcheck__why" aria-labelledby="why-this-matters">
          <h3 id="why-this-matters" className="hcheck__why-title">
            {headlineWhy.title}
          </h3>
          <p className="hcheck__why-body">{headlineWhy.body}</p>
          <p className="hcheck__why-body">
            {headlineWhy.before}{" "}
            <Link className="prose__link" href={ARTICLE_PATH}>
              {headlineWhy.link}
            </Link>
            {headlineWhy.after}
          </p>
        </section>
      }
    >
      <HeadlineLab />
      <HeadlineForm />
    </ToolPage>
  );
}
