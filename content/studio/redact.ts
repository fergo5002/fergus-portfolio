/**
 * Every word Pocket Redact says on its stage. The limits, the method and what
 * it cannot see live in the shell's one disclosure (`content/tools/pocket-redact.ts`).
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const redactCopy = {
  upload: "Open a file",
  example: "Example invoice",
  pageAlt: (n: number) => `Page ${n} of your document`,
  proofAlt: (n: number) => `Page ${n} of the clean copy, reopened`,
  editor: "Redaction editor",
  editorHelp: "Drag to cover. N adds a mask, arrows move it, Alt and arrows resize it, Delete removes it.",
  tools: "Mask tools",
  draw: "Draw masks",
  select: "Select / move",
  undo: "Undo",
  redo: "Redo",
  delete: "Delete selected",
  lens: "Zoom",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit page",
  search: "Find text to cover",
  searchType: "Find",
  modes: { text: "Text", email: "Emails", phone: "Numbers" },
  patterns: { email: "email-shaped text", phone: "long numbers" },
  lit: (n: number) => `${n} lit`,
  apply: "Cover all",
  caveat: "Suggestions, not a complete privacy scan.",
  noText: "No text found on this page, so draw the masks yourself.",
  masks: (n: number) => plural(n, "mask", "masks"),
  pageMasks: (page: number, n: number) => `Page ${page}, ${plural(n, "mask", "masks")}`,
  page: (page: number) => `Page ${page}`,
  pages: "Pages",
  build: "Build clean PDF",
  opening: "Opening…",
  burning: "Burning the masks in…",
  cancel: "Cancel",
  reopening: "Reopening the clean copy…",
  scanning: "Reading it back…",
  /** The reading line over the reopened page, once the scan has passed. */
  reading: ({ masks, solid, before, after }: { masks: number; solid: number; before: number; after: number }) =>
    after > 0
      ? `${plural(after, "piece", "pieces")} of text survived`
      : solid < masks
        ? `${masks - solid} of ${plural(masks, "mask", "masks")} not solid black`
        : `${masks ? `${plural(masks, "mask", "masks")} solid black` : "No masks"} · text found ${before} → ${after}`,
  proofNote: "The file you'll download, reopened. Anything left uncovered is still on it.",
  inspected: "I have inspected this exported page",
  back: "Back to editing",
  exports: "Take it away",
  save: (done: number, total: number) => `Download reviewed PDF (${done}/${total})`,
  png: "Save this page as PNG",
  failed: "A mask came back less than solid black, so this copy is not offered.",
  sampleTitle: "SAMPLE INVOICE",
  sample: [
    "Client: Rowan Example",
    "Email: rowan@example.org",
    "Phone: +353 85 123 4567",
    "Address: 14 Fictional Lane, Dublin",
    "Reference: INV-2026-0042",
    "Consulting session: EUR 240.00",
    "Total due: EUR 240.00",
  ],
};

/**
 * Kept for the `studioLabels` barrel in `labels.ts`, which other studios share.
 * Pocket Redact's words are all in `redactCopy` now.
 */
export const redactLabels = {} as const;
