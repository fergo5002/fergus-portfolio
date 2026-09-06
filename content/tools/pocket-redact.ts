import type { ToolEntry } from "./types";

export const pocketRedact: ToolEntry = {
  "slug": "pocket-redact",
  "name": "Pocket Redact",
  "blurb": "Cover sensitive areas of a PDF or image, then create and reopen a fresh flattened document to inspect the result.",
  "cantSee": [
    "Raster export removes text search, links, forms, signatures and accessibility structure. Maximum 20 pages, 40 MB, 12 megapixels per page and 64 megapixels per document.",
    "Only the areas you mark are covered. Review every exported page before sharing; filenames and anything visibly left on the page may still identify you."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Your inputs are processed in this browser. Nothing is saved automatically; use downloads to keep a result.",
  "order": 3
};
