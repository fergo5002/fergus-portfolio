import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { profile } from "@/content/profile";
import {
  OG_IMAGE,
  PERSON_ID,
  WEBSITE_ID,
  absolute,
  breadcrumbSchema,
  canonical,
  type JsonLdObject,
} from "@/lib/seo";
import HeadlineForm from "./HeadlineForm";
import { ARTICLE_PATH, headlineCopy } from "./state";

const PATH = "/tools/headline-check";

const DESCRIPTION =
  "Paste a URL and see how its h1 extracts for a crawler that reads HTML without running it. Catches per-character split-text animations that turn a headline into loose letters.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Headline check",
  description: DESCRIPTION,
  alternates: canonical(PATH),
  openGraph: {
    title: `Headline check · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * The tool, declared as a thing somebody can use rather than as a page about
 * one. `WebApplication` is what an answer engine looks for when the question is
 * "is there a tool that checks X", and `isBasedOn` points at the article the
 * check comes from so the two are one piece of work rather than two pages that
 * happen to link.
 */
const toolSchema: JsonLdObject = {
  "@type": "WebApplication",
  "@id": `${absolute(PATH)}#app`,
  name: "Headline check",
  url: absolute(PATH),
  description: DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  isPartOf: { "@id": WEBSITE_ID },
  author: { "@id": PERSON_ID },
  isBasedOn: absolute(ARTICLE_PATH),
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

/**
 * `/tools/headline-check`.
 *
 * The article at `ARTICLE_PATH` explains why a per-character heading animation
 * costs you the words it decorates. This is the same check, pointed at anyone's
 * page, because an argument somebody has to take on trust is worth less than
 * one they can run against their own site in ten seconds.
 */
export default function HeadlineCheckPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          toolSchema,
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
            { name: "Headline check", path: PATH },
          ]),
        ]}
      />
      <PromptLine command={headlineCopy.command} path={headlineCopy.path} />
      <h1 className="page__title">
        <Scramble text={headlineCopy.title} speed={34} />
      </h1>
      <p className="page__lede">{headlineCopy.lede}</p>

      <HeadlineForm />

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

      <Talk line="If this found something on your site, I'd genuinely like to know what it was." />
    </div>
  );
}
