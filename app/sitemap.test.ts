import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import { SITE_URL, absolute, articlePath, toolPath } from "@/lib/seo";
import { articles } from "@/content/articles";
import { liveTools, tools } from "@/content/tools";

/**
 * Guards `/sitemap.xml` against the failure its own docblock warns about: a
 * sitemap that names a page which is not there.
 *
 * There was no test for this file, and adding `/contact` is exactly the change
 * that shows why it needed one. The route and the sitemap entry are two edits
 * in two files, and forgetting either one is silent. A missing entry means a
 * page reachable only from a call to action never gets crawled; a stale entry
 * means telling a crawler, with total confidence, that a page exists which
 * returns 404.
 *
 * The route check reads the filesystem rather than a hand-written list, so a
 * deleted page fails here instead of in somebody's search console.
 */
describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists something", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("is absolute and entirely on the production origin", () => {
    for (const url of urls) {
      expect(() => new URL(url), url).not.toThrow();
      // Never a preview hostname: the same rule the canonicals follow, and for
      // the same reason.
      expect(url.startsWith(SITE_URL), url).toBe(true);
    }
  });

  it("names no page twice", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  /**
   * Every static entry must have a real `page.tsx` behind it. Article routes
   * are checked separately below, because they come from `content/` through a
   * dynamic segment and have no file of their own.
   */
  it("only claims static routes that actually exist", () => {
    const articleUrls = new Set(articles.map((a) => absolute(articlePath(a.slug))));

    for (const url of urls) {
      if (articleUrls.has(url)) continue;
      const path = url.slice(SITE_URL.length);
      const file = join(process.cwd(), "app", path, "page.tsx");
      expect(existsSync(file), `${url} -> app${path}/page.tsx`).toBe(true);
    }
  });

  it("lists every published article, and no unpublished one", () => {
    const listed = urls.filter((u) => u.includes("/writing/"));
    expect(listed.sort()).toEqual(articles.map((a) => absolute(articlePath(a.slug))).sort());
  });

  /**
   * Named explicitly rather than left to the route check above. `/contact` is
   * the only route with no nav entry, so it is the one a crawler reaches only
   * by being told about it, and the only one whose absence from here would cost
   * something real.
   */
  it("lists /contact, which nothing in the nav links to", () => {
    expect(urls).toContain(absolute("/contact"));
  });

  /**
   * Tool routes come from the registry. A `soon` tool is a name on the index
   * and nothing else, so naming its route here would be the exact failure the
   * sitemap's docblock warns about. The `soon` half of this is vacuous until a
   * `soon` entry exists; `lib/tools/listing.test.ts` exercises that branch with
   * a fixture, and this one bites the day a real entry is added.
   */
  it("lists every live tool, and no soon one", () => {
    const listed = urls.filter((u) => u.startsWith(`${SITE_URL}/tools/`));
    expect(listed.sort()).toEqual(liveTools.map((t) => absolute(toolPath(t.slug))).sort());
    for (const t of tools) {
      if (t.status === "soon") expect(urls).not.toContain(absolute(toolPath(t.slug)));
    }
  });
});
