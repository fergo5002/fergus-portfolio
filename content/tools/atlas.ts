import type { ToolEntry } from "./types";

/**
 * Atlas. The stage carries no instructions: the map, its reading line and
 * the switches along its edge say what there is to say. How to read it and
 * what it cannot do live here, in the page's one disclosure.
 */
export const atlas: ToolEntry = {
  "slug": "atlas",
  "name": "Atlas",
  "blurb": "Turn files, folders, archives or a public GitHub repository into a draggable knowledge graph. Follow references, shared words and the files behind them.",
  "purpose": "Turn files, folders or a public GitHub repository into a map of how they connect.",
  "method": [
    "Three kinds of line. A faint one joins a file to its folder. A solid one is a reference: a wiki link, a Markdown link or an import that names another file you gave it. A dashed one joins two files that share at least two uncommon words, and the inspector lists them.",
    "A filled dot is a file whose text was read; a ring is one kept as metadata only. Point at a dot to read it, select it to open it, and drag a dot, the map or two fingers to move around. Click the map first and the wheel zooms it."
  ],
  "cantSee": [
    "Connections are folders, explicit references and shared words. A shared word is not proof that two files mean the same thing.",
    "Up to 1,000 files or 80 MB. Text, code, PDF and office documents are read; other files appear with metadata only. Archives are expanded once. Scanned PDFs need OCR elsewhere.",
    "A public GitHub repository is read through GitHub's API: up to 1,000 files, reading up to 100 text files (8 MB in all). No private repositories. Upload a ZIP for fuller coverage."
  ],
  "status": "live",
  "privacy": "browser",
  "privacyLine": "Files are read in this browser. Fetching a repository sends requests to GitHub. A saved map includes the extracted text; nothing is saved unless you save it.",
  "order": 1
};
