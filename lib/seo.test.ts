import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  PERSON_ID,
  WEBSITE_ID,
  absolute,
  canonical,
  sameAs,
  jsonLd,
  graph,
  personSchema,
  websiteSchema,
  profilePageSchema,
  contactPageSchema,
  projectsPageSchema,
  experiencePageSchema,
  blogSchema,
  blogPostingSchema,
  breadcrumbSchema,
  faqPageSchema,
  blogReferenceSchema,
  articlePath,
  toolPath,
  toolPageSchema,
  type JsonLdObject,
} from "./seo";
import { articles } from "@/content/articles";
import { profile } from "@/content/profile";
import { questionPairs } from "@/lib/faq";

describe("absolute", () => {
  it("prefixes a site-relative path", () => {
    expect(absolute("/projects")).toBe(`${SITE_URL}/projects`);
  });

  it("tolerates a missing leading slash", () => {
    expect(absolute("projects")).toBe(`${SITE_URL}/projects`);
  });

  it("returns the bare origin for the root, with no trailing slash", () => {
    // Two spellings of the same page is precisely what a canonical exists to
    // prevent, so the root must have exactly one.
    expect(absolute("/")).toBe(SITE_URL);
    expect(absolute("/")).not.toMatch(/\/$/);
  });

  it("passes an already-absolute URL straight through", () => {
    expect(absolute("https://tighsauna.com")).toBe("https://tighsauna.com");
  });

  it("never produces a double slash", () => {
    for (const p of ["/", "/projects", "projects", "/writing/a-slug"]) {
      expect(absolute(p).replace(/^https:\/\//, "")).not.toContain("//");
    }
  });
});

describe("canonical", () => {
  it("returns an absolute canonical for the metadata block", () => {
    expect(canonical("/writing")).toEqual({ canonical: `${SITE_URL}/writing` });
  });

  it("always points at production, never at a preview host", () => {
    expect(canonical("/").canonical.startsWith("https://fergusoreilly.dev")).toBe(true);
  });
});

describe("sameAs", () => {
  it("lists only absolute profile URLs", () => {
    const links = sameAs();
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => /^https:\/\//.test(l))).toBe(true);
  });

  it("excludes the mailto contact", () => {
    expect(sameAs().some((l) => l.startsWith("mailto:"))).toBe(false);
  });
});

describe("jsonLd", () => {
  it("produces parseable JSON", () => {
    expect(JSON.parse(jsonLd({ "@type": "Thing", name: "x" }))).toEqual({
      "@type": "Thing",
      name: "x",
    });
  });

  it("escapes < so a payload cannot close the script element", () => {
    // Without this, the first </script> inside any string spills the rest of
    // the graph into the document as markup.
    const out = jsonLd({ "@type": "Thing", name: "</script><img src=x>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
    expect(JSON.parse(out).name).toBe("</script><img src=x>");
  });

  it("round-trips an array of nodes", () => {
    expect(JSON.parse(jsonLd([{ "@type": "A" }, { "@type": "B" }]))).toHaveLength(2);
  });
});

/** Every value in the graph must be defined: undefined is never valid JSON-LD. */
function assertNoUndefined(node: unknown, path = "root"): void {
  if (node === undefined) throw new Error(`undefined at ${path}`);
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoUndefined(v, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) assertNoUndefined(v, `${path}.${k}`);
  }
}

describe("personSchema", () => {
  const person = personSchema();

  it("is a Person with a stable id", () => {
    expect(person["@type"]).toBe("Person");
    expect(person["@id"]).toBe(PERSON_ID);
  });

  it("carries both the display name and the legal name", () => {
    expect(person.name).toBe(profile.shortName);
    expect(person.alternateName).toBe(profile.name);
  });

  it("has an absolute image and url", () => {
    expect(String(person.url)).toMatch(/^https:\/\//);
    expect(String(person.image)).toMatch(/^https:\/\//);
  });

  it("corroborates the entity with sameAs links", () => {
    expect(Array.isArray(person.sameAs)).toBe(true);
    expect((person.sameAs as string[]).length).toBeGreaterThan(0);
  });

  it("names the current employer, not a wound-down one", () => {
    const worksFor = person.worksFor as JsonLdObject;
    expect(worksFor.name).toBe("Tigh Sauna");
  });

  it("declares subjects it can evidence", () => {
    expect((person.knowsAbout as string[]).length).toBeGreaterThan(3);
  });

  it("emits no undefined values", () => {
    assertNoUndefined(person, "person");
  });
});

describe("websiteSchema and profilePageSchema", () => {
  it("attributes the site to the person node", () => {
    expect((websiteSchema().publisher as JsonLdObject)["@id"]).toBe(PERSON_ID);
  });

  it("points the profile page at the same person entity", () => {
    const page = profilePageSchema();
    expect((page.mainEntity as JsonLdObject)["@id"]).toBe(PERSON_ID);
    expect((page.isPartOf as JsonLdObject)["@id"]).toBe(WEBSITE_ID);
  });

  /**
   * `ContactPage` is the type an answer engine looks for when somebody asks how
   * to get in touch with a person. Pointing `mainEntity` at the shared
   * `PERSON_ID` rather than describing a new entity is what makes it an answer
   * about Fergus instead of an answer about a form.
   */
  it("declares the contact page as a ContactPage about the same person", () => {
    const page = contactPageSchema();
    expect(page["@type"]).toBe("ContactPage");
    expect((page.mainEntity as JsonLdObject)["@id"]).toBe(PERSON_ID);
    expect((page.isPartOf as JsonLdObject)["@id"]).toBe(WEBSITE_ID);
    expect(page.url).toBe(`${SITE_URL}/contact`);
  });
});

describe("collection pages", () => {
  it("lists every project as a typed CreativeWork, not a bare row", () => {
    // Changed on 2026-08-21. A bare `ListItem` says "row three of a list" and
    // stops meaning anything once it is read outside the list. Wrapping a
    // `CreativeWork` keeps it a work, and crediting the same `PERSON_ID` every
    // other node uses is what attaches the projects to the person rather than
    // leaving them as anonymous entries on a page about him.
    const list = projectsPageSchema().mainEntity as JsonLdObject;
    const items = list.itemListElement as JsonLdObject[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].position).toBe(1);
    const work = items[0].item as JsonLdObject;
    expect(work["@type"]).toBe("CreativeWork");
    expect(String(work.url)).toMatch(/^https:\/\//);
    expect(work.creator).toEqual({ "@id": PERSON_ID });
    assertNoUndefined(items, "projects");
  });

  it("keeps experience as plain rows, because a role is not a creative work", () => {
    const items = (experiencePageSchema().mainEntity as JsonLdObject)
      .itemListElement as JsonLdObject[];
    expect(items[0].item).toBeUndefined();
    expect(String(items[0].url)).toMatch(/^https:\/\//);
  });

  it("lists every role and survives an entry with no summary", () => {
    const list = experiencePageSchema().mainEntity as JsonLdObject;
    assertNoUndefined(list, "experience");
  });
});

describe("blog schemas", () => {
  it("lists every article on the blog node", () => {
    const blog = blogSchema(articles);
    expect((blog.blogPost as JsonLdObject[]).length).toBe(articles.length);
    assertNoUndefined(blog, "blog");
  });

  it("builds a BlogPosting attributed to the person", () => {
    const post = blogPostingSchema(articles[0], 900);
    expect(post["@type"]).toBe("BlogPosting");
    expect((post.author as JsonLdObject)["@id"]).toBe(PERSON_ID);
    expect(post.headline).toBe(articles[0].title);
    expect(post.wordCount).toBe(900);
    assertNoUndefined(post, "post");
  });

  it("falls back to the publish date when there is no revision", () => {
    const post = blogPostingSchema({ ...articles[0], updated: undefined }, 100);
    expect(post.dateModified).toBe(articles[0].date);
  });

  it("uses the revision date when there is one", () => {
    const post = blogPostingSchema({ ...articles[0], updated: "2026-09-01" }, 100);
    expect(post.dateModified).toBe("2026-09-01");
  });

  it("builds article paths from slugs", () => {
    expect(articlePath("a-slug")).toBe("/writing/a-slug");
  });
});

describe("breadcrumbSchema", () => {
  it("numbers the trail from one and absolutises each step", () => {
    const crumbs = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Writing", path: "/writing" },
    ]);
    const items = crumbs.itemListElement as JsonLdObject[];
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items[0].item).toBe(SITE_URL);
  });
});

describe("faqPageSchema", () => {
  const article = articles[0];

  it("returns undefined below two pairs rather than publishing a thin FAQ", () => {
    expect(faqPageSchema(article, [])).toBeUndefined();
    expect(faqPageSchema(article, [{ question: "One?", answer: "Only one." }])).toBeUndefined();
  });

  it("turns pairs into Question and Answer nodes", () => {
    const faq = faqPageSchema(article, [
      { question: "First?", answer: "Yes." },
      { question: "Second?", answer: "Also yes." },
    ]) as JsonLdObject;
    const questions = faq.mainEntity as JsonLdObject[];
    expect(faq["@type"]).toBe("FAQPage");
    expect(questions).toHaveLength(2);
    expect(questions[0]["@type"]).toBe("Question");
    expect(questions[0].name).toBe("First?");
    expect((questions[0].acceptedAnswer as JsonLdObject).text).toBe("Yes.");
  });

  it("hangs off the article it belongs to rather than floating free", () => {
    const url = absolute(articlePath(article.slug));
    const faq = faqPageSchema(article, [
      { question: "First?", answer: "Yes." },
      { question: "Second?", answer: "Also yes." },
    ]) as JsonLdObject;
    expect(faq["@id"]).toBe(`${url}#faq`);
    expect(faq.isPartOf).toEqual({ "@id": `${url}#article` });
    expect(faq.about).toEqual({ "@id": PERSON_ID });
  });

  it("publishes a real FAQ for every shipped article", () => {
    // The guard in content/articles.test.ts already requires two question
    // headings per article. This asserts the consequence the guard exists for:
    // that the requirement actually reaches the published graph, rather than
    // being satisfied in the prose and lost somewhere between here and the page.
    for (const a of articles) {
      const faq = faqPageSchema(a, questionPairs(a.body));
      expect(faq, `no FAQPage for ${a.slug}`).toBeDefined();
      assertNoUndefined(faq as JsonLdObject, `faq:${a.slug}`);
      expect(() => JSON.parse(jsonLd(faq as JsonLdObject))).not.toThrow();
    }
  });

  it("cannot break out of its script tag through an answer", () => {
    // Same reasoning as `jsonLd`'s escape: answers are lifted verbatim out of
    // prose, so an article that quotes a closing script tag would otherwise end
    // the block early and spill the graph into the document as markup.
    const faq = faqPageSchema(article, [
      { question: "Escapes?", answer: "It handles </script> fine." },
      { question: "Second?", answer: "Yes." },
    ]) as JsonLdObject;
    expect(jsonLd(faq)).not.toContain("</script>");
  });
});

describe("graph", () => {
  it("wraps nodes in one context so @id references resolve", () => {
    const g = graph([personSchema(), websiteSchema()]);
    expect(g["@context"]).toBe("https://schema.org");
    expect((g["@graph"] as JsonLdObject[]).length).toBe(2);
  });

  it("serialises the real landing page graph without undefined", () => {
    const g = graph([personSchema(), websiteSchema(), profilePageSchema()]);
    assertNoUndefined(g, "landing");
    expect(() => JSON.parse(jsonLd(g))).not.toThrow();
  });
});

describe("blogReferenceSchema", () => {
  it("resolves the isPartOf edge every BlogPosting claims", () => {
    // The dangling reference this exists to fix: a post asserting membership of
    // a node that was not in its own page's graph.
    const post = blogPostingSchema(articles[0], 900);
    const blog = blogReferenceSchema();
    expect((post.isPartOf as JsonLdObject)["@id"]).toBe(blog["@id"]);
    assertNoUndefined(blog, "blogref");
  });

  it("attributes the blog to the same person as everything else", () => {
    expect(blogReferenceSchema().author).toEqual({ "@id": PERSON_ID });
  });
});

describe("tool schemas", () => {
  it("builds tool paths from slugs", () => {
    expect(toolPath("headline-check")).toBe("/tools/headline-check");
  });

  it("declares a tool as a free WebApplication by the person, on the site", () => {
    const node = toolPageSchema({ slug: "x", name: "X", blurb: "Does x." });
    expect(node["@type"]).toBe("WebApplication");
    expect(node["@id"]).toBe(`${SITE_URL}/tools/x#app`);
    expect(node.url).toBe(`${SITE_URL}/tools/x`);
    expect(node.description).toBe("Does x.");
    expect(node.author).toEqual({ "@id": PERSON_ID });
    expect(node.isPartOf).toEqual({ "@id": WEBSITE_ID });
    expect((node.offers as JsonLdObject).price).toBe("0");
  });

  it("lets a page add an edge the registry does not carry", () => {
    // The headline checker's `isBasedOn` points at the article it came from.
    // That relationship is the page's, not the registry's.
    const node = toolPageSchema(
      { slug: "x", name: "X", blurb: "Does x." },
      { isBasedOn: absolute("/writing/y") },
    );
    expect(node.isBasedOn).toBe(`${SITE_URL}/writing/y`);
  });

  it("keeps the registry's identity even when extra tries to change it", () => {
    const node = toolPageSchema({ slug: "x", name: "X", blurb: "Does x." }, { name: "Other" });
    expect(node.name).toBe("X");
  });
});
