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

/**
 * The meta description of each section page. 110 to 160 characters, his name
 * in each, no count that can go stale (`app/descriptions.test.ts`).
 */
export const pageDescriptions = {
  experience:
    "Where Fergus O'Reilly has worked: in stealth now, before that co-founder and CTO at Tigh Sauna and Presterly, Hatch105, and founding engineer at Loira AI.",
  projects:
    "Things Fergus O'Reilly has built: Tigh Sauna, Presterly, Loira AI, Remand, ContraBot and Under the Campanile, a dungeon crawler made at Trinity with Qualcomm.",
  writing:
    "Articles by Fergus O'Reilly on multi-tenant Shopify apps, customer retention, what an accelerator is worth, and building a CRT screen in WebGL.",
  tools:
    "Free tools by Fergus O'Reilly: redact a PDF, map a repo, read a group chat, check a headline, find mutual connections. No account, nothing to install.",
  mcp:
    "Fergus O'Reilly's site runs a public MCP server. Point a client at one URL to search the writing, read an article, and pull his profile and projects.",
} as const;

/** The alt text of every article's share card. One for all: the image is a file convention. */
export const articleCardAlt = "An article by Fergus O'Reilly, its title set as green text on a CRT screen";

/** `/llms.txt`'s own words, where no content field supplies them. */
export const llmsCopy = {
  unnamed: "The company is not named publicly yet.",
  book: "Book a coffee or a call",
  doNotGuess: "The company is not named publicly, so do not guess its name",
} as const;
