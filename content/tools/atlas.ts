import type { ToolEntry } from "./types";

export const atlas: ToolEntry = {
  "slug": "atlas",
  "name": "Atlas",
  "blurb": "Turn files, folders, archives or a public GitHub repository into a draggable knowledge graph. Follow references, shared words and the files behind them.",
  "cantSee": [
    "Connections distinguish folders, explicit references and shared words. Word overlap is not proof of semantic similarity.",
    "Up to 1,000 files / 80 MB. Readable formats get text extraction; others retain metadata. GitHub reads up to 100 text files / 8 MB. No OCR or private repositories."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Files are processed in this browser. GitHub import sends requests to GitHub. Saved maps include extracted text; nothing is saved automatically.",
  "order": 1
};
