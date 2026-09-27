/** Atlas's words. Read through `studioCopy.atlas` and `studioLabels.Atlas` / `.GraphCanvas`. */
export const atlasCopy = {
  limits:
    "Up to 1,000 files / 80 MB. Text, code, PDF and office documents are readable; other files still appear with metadata. Archives are expanded once. Scanned PDFs need OCR elsewhere.",
  github: "Public GitHub repository",
  githubNote:
    "Fetch sends requests to GitHub. Public repositories only, up to 1,000 tree entries; reads up to 100 text files (8 MB total). Upload a ZIP for fuller coverage.",
  fetch: "Fetch repository",
  fit: "Fit map",
  pause: "Pause physics",
  reduced: "Reduced motion · static layout",
  exportError: "The browser could not export the map image.",
  resume: "Resume physics",
  focus: "Focus neighbours",
  all: "Whole map",
  pin: "Pin node",
  unpin: "Release node",
  connections: "Why these are connected",
  noSelection:
    "Select any point to inspect the file and its connections. Drag points to reshape the map; drag empty space to pan. Scroll or pinch to zoom.",
  export: "Save map + extracted text",
  exports: "Save this map",
  image: "Save map image",
  reference: "References",
  terms: "Shared words",
  containment: "Folders",
  query: "Search files and contents",
  list: "Accessible file list",
  noLinks: "No connections found in the supplied files.",
  read: "Extracted text",
  metadata: "Metadata only",
  status: "Import coverage",
  spread: "Spacing",
  load: "Open a saved map",
  source:
    "Source files stay in this tab. A saved map includes extracted text, so review it before sharing.",
};

export const atlasLabels = {
  githubComOwnerRepository: "github.com/owner/repository",
  fileType: "File type",
  allTypes: "All types",
  bytes: " bytes",
  links: " links",
  show60MoreFiles: "Show 60 more files",
} as const;

export const graphLabels = {
  interactiveFileGraphUseTheFileList:
    "Interactive file graph. Use the file list to select nodes. Arrow keys pan; plus and minus zoom; zero fits the map.",
  nodes: " nodes · ",
  visibleConnections: " visible connections",
} as const;
