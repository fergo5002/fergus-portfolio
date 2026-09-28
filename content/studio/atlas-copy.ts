import type { Reading, Summary } from "@/lib/studio/atlas-view";

/**
 * Atlas's words. The components import this directly; `studioCopy.atlas` in
 * the barrel still points here for anything that reads it that way.
 *
 * Kept short on purpose: the map is the explanation, the reading line is the
 * caption, and the limits live in the page's one disclosure
 * (`content/tools/atlas.ts`), not on the stage.
 */
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IE")} ${n === 1 ? one : many}`;

export const atlasCopy = {
  // ── the reading line ──
  summary: (s: Summary) =>
    `${plural(s.files, "file", "files")} · ${s.read.toLocaleString("en-IE")} read · ${plural(s.connections, "connection", "connections")}`,
  /** The example is invented notes, and the stage says so while it is showing. */
  exampleSummary: (s: Summary) => `Example notebook · ${atlasCopy.summary(s)}`,
  reading: (r: Reading) =>
    r.folder
      ? `${r.label} · folder · ${plural(r.count, "file", "files")}`
      : `${r.label} · ${r.kind} · ${plural(r.count, "connection", "connections")}`,
  readingFiles: "Reading files…",
  building: "Finding connections…",
  cancel: "Cancel",

  // ── find, on the stage ──
  find: "Search files and contents",
  findPlaceholder: "a name or a word",
  matches: (n: number) => (n ? plural(n, "match", "matches") : "no match"),
  clear: "Clear the search",

  // ── the strip on the stage's edge ──
  controls: "Map controls",
  zoom: "Zoom",
  type: "File type",
  allTypes: "All types",
  folders: "Folders",
  references: "References",
  terms: "Shared words",
  focus: "Focus neighbours",
  whole: "Whole map",
  fit: "Fit map",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  poster: "The example notebook as a map: notes in four folders, joined by references and shared words.",
  canvas:
    "Map of how the files connect. Point at a node to read it, select it to open it. Arrow keys pan, plus and minus zoom, zero fits. The file list under the map reaches every file.",

  // ── the inspector ──
  inspector: "Selected file",
  close: "Close",
  pin: "Pin node",
  unpin: "Release node",
  read: "Text read",
  metadata: "Metadata only",
  bytes: (n: number) => `${n.toLocaleString("en-IE")} bytes`,
  links: (n: number) => plural(n, "connection", "connections"),
  more: (n: number) => `and ${n.toLocaleString("en-IE")} more`,
  noLinks: "Nothing in these files points to it or shares its words.",
  clipped: "The preview stops at 14,000 characters. A saved map keeps all of it.",
  play: "Play",
  pause: "Pause",

  // ── intake, under the stage ──
  hint: "Up to 1,000 files or 80 MB.",
  repo: "Public GitHub repository",
  repoPlaceholder: "owner/repository",
  fetch: "Fetch",
  example: "Back to the example",

  // ── the list ──
  list: (shown: number, total: number) =>
    shown === total ? `Every file · ${total.toLocaleString("en-IE")}` : `Files · ${shown.toLocaleString("en-IE")} of ${total.toLocaleString("en-IE")}`,
  listMore: "Show 60 more",
  empty: "Nothing matches.",

  // ── keeping a map ──
  exports: "Save this map",
  save: "Save map",
  image: "Save image",
  open: "Open a saved map",
  keepNote: "A saved map includes the text read from your files.",

  // ── failures ──
  errors: {
    empty: "No files found in this input.",
    build: "Could not build the map. Try a smaller input.",
    mapSize: "Saved map limit: 15 MB.",
    image: "This browser could not export the map image.",
    fullscreen: "Fullscreen is unavailable in this browser window.",
    decodeImage: "This browser could not decode this image.",
    playAudio: "This browser could not play this audio format.",
    playVideo: "This browser could not play this video format.",
    paint: "This browser could not draw the map.",
  },
};

/**
 * The labels barrel (`content/studio/labels.ts`) still maps these two names.
 * Atlas reads everything from `atlasCopy` now, so they are empty; kept so the
 * barrel, which the other studios' rebuilds also touch, needs no edit.
 */
export const atlasLabels = {} as const;
export const graphLabels = {} as const;
