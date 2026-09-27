export const redactCopy = {
  upload: "Open a document or image",
  example: "Try the example invoice",
  limits:
    "PDFs up to 20 pages / 40 MB, 12 megapixels per page and 64 megapixels per document. Images up to 12 megapixels. Files stay in this browser.",
  draw: "Draw masks",
  select: "Select / move",
  undo: "Undo",
  redo: "Redo",
  zoom: "Zoom",
  fit: "Fit page",
  search: "Find text to cover",
  searchType: "Find mode",
  suggestions: "Candidates on this page",
  apply: "Cover these text boxes",
  noText:
    "This page has no extracted text. Draw masks manually; image text is not recognised automatically.",
  searchNote:
    "Candidates cover complete text boxes, sometimes a whole line. Inspect their size before applying. Email and number patterns are suggestions, not a complete privacy scan.",
  delete: "Delete selected",
  clear: "Clear this page",
  coords: "Precise mask",
  add: "Add rectangle",
  export: "Build clean PDF",
  exports: "Take it away",
  png: "Save this page as PNG",
  review: "Review the exported pixels",
  reviewNote:
    "These previews come from reopening the exact PDF bytes. Inspect every page before downloading. Rasterisation removes original text, forms, links and metadata; visible information outside your masks remains.",
  save: "Download reviewed PDF",
  reviewed: "I have inspected this exported page",
  back: "Back to editing",
  empty:
    "Open a document to start. Or try the example to practise without using a real file.",
  instruction:
    "Draw a rectangle over text to cover it. In Select / move mode, drag a mask or its bottom-right handle. The arrow keys move a selected mask; Delete removes it. Undo keeps up to 80 changes.",
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
  fields: ["Left", "Top", "Width", "Height"],
};

/** Supporting labels for Pocket Redact. Read through studioLabels.PocketRedact. */
export const redactLabels = {
  cancel: "Cancel",
  documentPages: "Document pages",
  masks: " masks",
  redactionEditor: "Redaction editor",
  drawOrMoveRedactionMasks: "Draw or move redaction masks",
  exactText: "Exact text",
  emailLikeText: "Email-like text",
  phoneLongNumbers: "Phone / long numbers",
  masksAcross: " masks across ",
  pages: " pages",
  page: "Page ",
} as const;
