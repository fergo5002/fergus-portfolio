/**
 * When each page that is not an article last changed in a way a reader would
 * notice, for the sitemap's `lastmod`.
 *
 * By hand, on purpose. A date stamped at build time says "changed" on every
 * deploy, which teaches a crawler the dates mean nothing; no date at all was
 * the state of sixteen of twenty-one entries until 2026-11-28. Change the date
 * here in the same commit that changes the page. `app/sitemap.test.ts` fails
 * when a route has none.
 */
export const pageUpdated: Record<string, string> = {
  "/": "2026-11-28",
  "/projects": "2026-11-28",
  "/experience": "2026-11-28",
  "/contact": "2026-11-25",
  "/tools": "2026-11-28",
  "/mcp": "2026-11-28",
};

/** Every tool page: they share a shell, so they change together. */
export const toolsUpdated = "2026-11-28";
