/**
 * Words every studio shares. Each studio's own words live in its own file
 * (`atlas-copy.ts`, `lore-copy.ts`, `music-copy.ts`, `redact.ts`, `cases.ts`)
 * so the agents rebuilding them one at a time never edit the same file;
 * `copy.ts` and `labels.ts` are barrels that keep the old imports working.
 */
export const studioSharedCopy = {
  local: "FergusOS · local studios",
  files: "Choose files",
  folder: "Choose a folder",
  example: "Explore an example",
  reset: "Reset",
  search: "Search",
  cancel: "Cancel",
  save: "Save",
  back: "Back",
  clear: "Clear",
  loading: "Reading your files…",
  empty: "Nothing matches these filters.",
};

export const studioShellCopy = {
  loading: "Loading your workbench…",
  noScript: "This tool needs JavaScript to process files and run its controls in your browser. Enable JavaScript and reload to try it.",
};
