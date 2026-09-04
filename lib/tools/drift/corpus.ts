import { articles } from "@/content/articles";
import { toPlainText } from "@/lib/markdown";
import { buildReference, type Reference } from "./reference";

/**
 * This site's own articles as a reference population, for one purpose: the
 * worked example on `/tools/drift`.
 *
 * A visitor's Delta is never measured against this. Theirs is built in their
 * own tab from their own pieces, because a distance in units of how much my
 * articles vary between themselves would be a number about me printed under a
 * sentence about them.
 *
 * What this is good for is a demonstration over a corpus the reader can go and
 * read: eleven articles at /writing, one of my paragraphs rewritten the way a
 * model rewrites things, and a real Delta computed at build time so the page is
 * never an empty form. `app/tools/drift/page.tsx` is the only module that
 * imports this one, and `app/tools/drift/page.test.ts` fails if the client
 * component ever does, because a value import from there would drag every
 * article body into the browser bundle.
 */

/** Every published article, as plain text. Code blocks are already dropped by `toPlainText`. */
export function referenceDocuments(): string[] {
  return articles.map((article) => toPlainText(article.body));
}

let memo: Reference | null = null;

/**
 * The worked example's table, built once. Called at module scope by the page,
 * so it runs at build time, the route being static.
 */
export function siteReference(): Reference {
  if (memo === null) memo = buildReference(referenceDocuments());
  return memo;
}
