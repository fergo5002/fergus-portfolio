/**
 * The single source of truth for every URL and every schema.org object the site
 * publishes.
 *
 * Two rules hold this module together, and both were learnt the hard way
 * elsewhere in this repo:
 *
 *  1. **Nothing here is retyped.** Names, titles and links are read from
 *     `content/`, exactly as `app/layout.tsx` already derives its metadata from
 *     `content/profile.ts`. A hand-written duplicate is a claim that quietly
 *     stops being true the moment the content changes, and structured data is
 *     the worst possible place for that: search engines and answer engines
 *     treat it as the machine-readable truth about a real person.
 *  2. **Canonicals always point at production.** They are deliberately built
 *     from a constant rather than from a request host or a Vercel environment
 *     variable, because a preview deployment that canonicalises to its own
 *     `*.vercel.app` hostname invites the index to prefer a throwaway URL.
 *
 * Everything is a pure function of `content/`, so `lib/seo.test.ts` can assert
 * on the real published graph rather than on a fixture.
 */

import { profile } from "@/content/profile";
import { experience } from "@/content/experience";
import { projects } from "@/content/projects";
import type { Article } from "@/content/articles";

export const SITE_URL = "https://fergusoreilly.dev";
export const SITE_NAME = `${profile.shortName} · Terminal`;
export const SITE_LOCALE = "en_IE";

/**
 * Stable `@id` anchors. Giving the person and the site a fixed identifier lets
 * every other node on every other page point at the *same* entity instead of
 * describing a new one each time, which is the difference between one
 * well-evidenced person and five thin duplicates.
 */
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Absolute URL for a site-relative path. Idempotent on absolute input. */
export function absolute(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  // The root is published without a trailing slash, so `/` must not become
  // `https://fergusoreilly.dev/` in one place and the bare origin in another:
  // two spellings of the same page is exactly what a canonical exists to stop.
  return suffix === "/" ? SITE_URL : `${SITE_URL}${suffix}`;
}

/** The `alternates` block every route spreads into its `metadata` export. */
export function canonical(path: string) {
  return { canonical: absolute(path) } as const;
}

/**
 * The share card for a route that does not generate its own.
 *
 * Stated explicitly because, measured against a real build, `/projects`,
 * `/experience` and `/writing` emitted no `og:image` at all without it, while
 * `/` and `/writing/[slug]` did. The difference is that those two have an
 * `opengraph-image` file in their own segment; the others were relying on
 * inheriting the root one and did not get it.
 *
 * That is the observation, not a claim about the mechanism. An earlier version
 * of this comment asserted that exporting an `openGraph` block replaces the
 * file-convention image, which does not hold: `/writing/[slug]` exports one
 * without `images` and still gets its card. Whatever the precise rule, the
 * failure is silent, so state the image rather than infer it.
 */
export const OG_IMAGE = "/opengraph-image";

/**
 * Every off-site profile that corroborates the same person. `sameAs` is the
 * edge an answer engine follows to decide that the Fergus O'Reilly on this
 * domain, on GitHub and on LinkedIn are one entity rather than three. Read from
 * the contact list so adding a profile there is enough.
 */
export function sameAs(): string[] {
  return profile.contact.map((c) => c.href).filter((href) => /^https?:\/\//i.test(href));
}

type JsonLdValue = string | number | boolean | JsonLdObject | JsonLdValue[];
export type JsonLdObject = { [key: string]: JsonLdValue | undefined };

/**
 * Drops every undefined value before serialising. An `undefined` in a graph
 * becomes a missing property at best and a validation error at worst, and it is
 * far too easy to introduce one from an optional content field.
 */
function prune<T extends JsonLdObject>(obj: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

/**
 * Serialise for injection into a `<script type="application/ld+json">`.
 *
 * The `<` escape is not decoration. JSON-LD is parsed as raw text inside a
 * script element, so the first `</script>` sequence appearing anywhere in the
 * data (an article title, a link, a quote) terminates the block early and
 * spills the rest of the graph into the document as markup. Escaping `<` to its
 * unicode form is still valid JSON and cannot close the tag.
 */
export function jsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The person. This is the load-bearing node for answer engines. */
export function personSchema(): JsonLdObject {
  const current = experience[0];
  return prune({
    "@type": "Person",
    "@id": PERSON_ID,
    name: profile.shortName,
    alternateName: profile.name,
    url: absolute("/"),
    image: absolute(profile.portrait),
    jobTitle: profile.jobTitle,
    description: profile.bio[0],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Dublin",
      addressCountry: "IE",
    },
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: "Trinity College Dublin",
      url: "https://www.tcd.ie",
    },
    worksFor: current
      ? prune({
          "@type": "Organization",
          name: current.org,
          url: current.link?.href,
        })
      : undefined,
    knowsAbout: profile.knowsAbout,
    sameAs: sameAs(),
  });
}

/** The site itself, so search features can attribute pages to one publication. */
export function websiteSchema(): JsonLdObject {
  return prune({
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: absolute("/"),
    name: SITE_NAME,
    description: profile.tagline,
    inLanguage: "en",
    publisher: { "@id": PERSON_ID },
  });
}

/** The landing page, declared as what it is: a profile of the person. */
export function profilePageSchema(): JsonLdObject {
  return prune({
    "@type": "ProfilePage",
    "@id": absolute("/#profilepage"),
    url: absolute("/"),
    name: `${profile.shortName} · ${profile.jobTitle}`,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": PERSON_ID },
    mainEntity: { "@id": PERSON_ID },
  });
}

export function breadcrumbSchema(trail: { name: string; path: string }[]): JsonLdObject {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: absolute(step.path),
    })),
  };
}

/** A page that exists to list other things (projects, experience, writing). */
export function collectionPageSchema(args: {
  path: string;
  name: string;
  description: string;
  items: { name: string; url: string; description?: string }[];
}): JsonLdObject {
  return prune({
    "@type": "CollectionPage",
    "@id": `${absolute(args.path)}#page`,
    url: absolute(args.path),
    name: args.name,
    description: args.description,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": PERSON_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: args.items.length,
      itemListElement: args.items.map((item, i) =>
        prune({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          description: item.description,
          url: absolute(item.url),
        }),
      ),
    },
  });
}

/** The projects page, built from `content/projects.ts`. */
export function projectsPageSchema(): JsonLdObject {
  return collectionPageSchema({
    path: "/projects",
    name: `Projects · ${profile.shortName}`,
    description: `Things ${profile.shortName} has built.`,
    items: projects.map((p) => ({
      name: p.title,
      url: `/projects#${p.slug}`,
      description: p.tagline,
    })),
  });
}

/** The experience page, built from `content/experience.ts`. */
export function experiencePageSchema(): JsonLdObject {
  return collectionPageSchema({
    path: "/experience",
    name: `Experience · ${profile.shortName}`,
    description: `Where ${profile.shortName} has worked and what he did there.`,
    items: experience.map((e) => ({
      name: `${e.role}, ${e.org}`,
      url: `/experience#${e.id}`,
      description: e.summary,
    })),
  });
}

/** The writing index. */
export function blogSchema(articles: Article[]): JsonLdObject {
  return prune({
    "@type": "Blog",
    "@id": `${absolute("/writing")}#blog`,
    url: absolute("/writing"),
    name: `Writing · ${profile.shortName}`,
    description: `Essays on building software, shipping products, and the things that went wrong.`,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    blogPost: articles.map((a) =>
      prune({
        "@type": "BlogPosting",
        "@id": `${absolute(articlePath(a.slug))}#article`,
        headline: a.title,
        url: absolute(articlePath(a.slug)),
        datePublished: a.date,
        description: a.description,
      }),
    ),
  });
}

/** One article. */
export function blogPostingSchema(article: Article, wordCount: number): JsonLdObject {
  const url = absolute(articlePath(article.slug));
  return prune({
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: article.date,
    dateModified: article.updated ?? article.date,
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": `${absolute("/writing")}#blog` },
    keywords: article.tags,
    wordCount,
    inLanguage: "en",
    image: absolute(`${articlePath(article.slug)}/opengraph-image`),
  });
}

export function articlePath(slug: string): string {
  return `/writing/${slug}`;
}

/**
 * Wraps a set of nodes into one `@graph`. Emitting a single graph per page,
 * rather than several sibling scripts, is what lets the `@id` references above
 * resolve to each other instead of dangling.
 */
export function graph(nodes: JsonLdObject[]): JsonLdObject {
  return { "@context": "https://schema.org", "@graph": nodes };
}
