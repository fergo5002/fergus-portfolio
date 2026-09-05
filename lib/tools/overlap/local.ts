import { entriesFrom, readConnections } from "./csv";
import type { Entry } from "./types";

export const MAX_LOCAL_BYTES = 5 * 1024 * 1024;

/** Exact intersection on one machine. No network, hashes or probabilistic matches. */
export function compareLists(a: readonly Entry[], b: readonly Entry[]) {
  const unique = (entries: readonly Entry[]) => {
    const map = new Map<string, Entry>();
    for (const entry of entries) if (!map.has(entry.slug)) map.set(entry.slug, entry);
    return map;
  };
  const left = unique(a);
  const right = unique(b);
  const sort = (entries: Entry[]) => entries.sort((x, y) => x.label.localeCompare(y.label, "en"));
  const shared = sort([...left.values()].filter(e => right.has(e.slug)));
  const onlyA = sort([...left.values()].filter(e => !right.has(e.slug)));
  const onlyB = sort([...right.values()].filter(e => !left.has(e.slug)));
  const union = left.size + right.size - shared.length;
  return { shared, onlyA, onlyB, mine: left.size, theirs: right.size, union, similarity: union ? shared.length / union : 0 };
}

export function readLocalList(text: string) {
  if (text.length > MAX_LOCAL_BYTES || new TextEncoder().encode(text).length > MAX_LOCAL_BYTES) throw new Error("too-large");
  const file = readConnections(text);
  if (file.urlColumn < 0) throw new Error("no-profiles");
  const result = entriesFrom(file, file.urlColumn);
  if (!result.entries.length) throw new Error("no-profiles");
  return result;
}

export function connectionsCsv(entries: readonly Entry[]): string {
  const cell = (text: string) => `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
  return ["Name,Profile URL", ...entries.map(e => `${cell(e.label)},${cell(`https://www.linkedin.com/in/${encodeURIComponent(e.slug)}`)}`)].join("\r\n");
}
