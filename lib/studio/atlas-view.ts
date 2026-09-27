import type { AtlasFile, AtlasGraph, AtlasLink, AtlasNode } from "./graph";

/**
 * What Atlas shows about a map, as pure functions: the command line's
 * matches, the neighbours a pointed-at node lights, the one reading line, the
 * figures and the inspector's contents. `components/studio/Atlas.tsx` is
 * wiring over these; the words themselves live in `content/studio/atlas-copy.ts`.
 */

export type LinkKind = AtlasLink["kind"];

/** The inspector shows this much of a file's text; a saved map carries all of it. */
export const PREVIEW_CHARS = 14_000;
/** The inspector lists this many neighbours and says how many more there are. */
export const RELATED_LIMIT = 50;

/** Lower-case terms, split on any run of spaces. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * The nodes a query and a type pick out. Every term must appear in the path
 * or the text. A node whose path holds every term ranks above one that needs
 * its text, and each group is in path order, so the first match (the one
 * Enter jumps to) is the one whose name the visitor was typing.
 */
export function findNodes(nodes: readonly AtlasNode[], query: string, type: string): AtlasNode[] {
  const terms = searchTerms(query);
  const byType = nodes.filter((n) => type === "all" || n.kind === type);
  if (!terms.length) return [...byType].sort((a, b) => a.path.localeCompare(b.path));
  const inPath: AtlasNode[] = [];
  const inText: AtlasNode[] = [];
  for (const n of byType) {
    const path = n.path.toLowerCase();
    const both = `${path}\n${n.text.toLowerCase()}`;
    if (terms.every((t) => path.includes(t))) inPath.push(n);
    else if (terms.every((t) => both.includes(t))) inText.push(n);
  }
  const order = (a: AtlasNode, b: AtlasNode) => a.path.localeCompare(b.path);
  return [...inPath.sort(order), ...inText.sort(order)];
}

/** The ids to light on the stage, or null when nothing is being looked for. */
export function litSet(nodes: readonly AtlasNode[], query: string, type: string): Set<string> | null {
  if (!searchTerms(query).length && type === "all") return null;
  return new Set(findNodes(nodes, query, type).map((n) => n.id));
}

/** Every type a map holds, sorted, once each. */
export function typesOf(nodes: readonly AtlasNode[]): string[] {
  return [...new Set(nodes.map((n) => n.kind))].sort();
}

/** A node and the neighbours reached by the kinds of link on show. Empty for no node. */
export function neighbourhood(graph: AtlasGraph, id: string, kinds: readonly string[]): Set<string> {
  if (!id) return new Set();
  const out = new Set([id]);
  for (const l of graph.links) {
    if (!kinds.includes(l.kind)) continue;
    if (l.source === id) out.add(l.target);
    else if (l.target === id) out.add(l.source);
  }
  return out;
}

export type Reading = { label: string; kind: string; count: number; folder: boolean };

/**
 * The one line a pointed-at node reads out. A file counts its connections
 * that are not folders (a folder is where it sits, not what it connects to);
 * a folder counts the files in it.
 */
export function readingFor(graph: AtlasGraph, id: string): Reading | null {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return null;
  const folder = node.kind === "folder";
  const count = graph.links.filter(
    (l) => (l.source === id || l.target === id) && (folder ? l.kind === "folder" && l.source === id : l.kind !== "folder"),
  ).length;
  return { label: node.label, kind: node.kind, count, folder };
}

export type Summary = { files: number; read: number; metadata: number; connections: number };

/** The map in four figures, for the reading line when nothing is pointed at. */
export function mapSummary(files: readonly AtlasFile[], graph: AtlasGraph): Summary {
  return {
    files: files.length,
    read: files.filter((f) => f.status === "read").length,
    metadata: files.filter((f) => f.status === "metadata").length,
    connections: graph.links.filter((l) => l.kind !== "folder").length,
  };
}

export type Related = { id: string; label: string; kind: LinkKind; evidence: string };

export type Inspection = {
  id: string;
  label: string;
  path: string;
  kind: string;
  folder: boolean;
  read: boolean;
  size: number;
  note?: string;
  text: string;
  clipped: boolean;
  related: Related[];
  total: number;
};

const RANK: Record<LinkKind, number> = { reference: 0, terms: 1, folder: 2 };

/** Everything the inspector shows for one node, or null for a node the map does not have. */
export function inspect(graph: AtlasGraph, id: string): Inspection | null {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return null;
  const labels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const related = graph.links
    .filter((l) => l.source === id || l.target === id)
    .map((l, order) => {
      const other = l.source === id ? l.target : l.source;
      return { id: other, label: labels.get(other) ?? other, kind: l.kind, evidence: l.evidence, order };
    })
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order)
    .map(({ order: _order, ...rest }) => rest);
  return {
    id,
    label: node.label,
    path: node.path,
    kind: node.kind,
    folder: node.kind === "folder",
    read: node.status === "read",
    size: node.size,
    ...(node.note ? { note: node.note } : {}),
    text: node.text.slice(0, PREVIEW_CHARS),
    clipped: node.text.length > PREVIEW_CHARS,
    related: related.slice(0, RELATED_LIMIT),
    total: related.length,
  };
}
