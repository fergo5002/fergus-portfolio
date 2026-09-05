import type { Metadata } from "next";
import Link from "next/link";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { headlineCheck as tool } from "@/content/tools/headline-check";
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
 * The shell (`ToolPage`) draws the prompt line, the heading, the lede, the
 * privacy line and the "Can't see" list from the registry entry. This file owns
 * the tool itself and the paragraph that says why it is worth ten seconds.
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
    >
      <HeadlineForm />
      <HeadlineLab />

      <section className="hcheck__why" aria-labelledby="why-this-matters">
        <h2 id="why-this-matters" className="cdirect__title">
          Why this is worth ten seconds
        </h2>
        <p className="hcheck__why-body">
          Split a headline into one element per letter and a browser still paints the word. Plenty
          of the machinery that reads the web does not run a browser: link unfurlers, feed readers,
          archivers, and the fetchers behind AI answer engines. A good number of those strip the
          tags, normalise the whitespace, and hand the result to something else. That turns your
          best string into confetti, and nobody sends you a report about it.
        </p>
        <p className="hcheck__why-body">
          I found this on my own site, which is the only reason I trust it enough to write a tool
          about it. The homepage name animated one character at a time and extracted as loose
          letters. The full write-up, including what not to do about it, is here:{" "}
          <Link className="prose__link" href={ARTICLE_PATH}>
            your split-text animation is eating your headline
          </Link>
          .
        </p>
      </section>
    </ToolPage>
  );
}
