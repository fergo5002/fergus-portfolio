export type AtlasFile = {
  path: string;
  text: string;
  size: number;
  kind: string;
  status: "read" | "metadata";
  note?: string;
};
export type AtlasNode = AtlasFile & {
  id: string;
  label: string;
  folder: string;
  degree: number;
};
export type AtlasLink = {
  source: string;
  target: string;
  kind: "folder" | "reference" | "terms";
  evidence: string;
};
export type AtlasGraph = { nodes: AtlasNode[]; links: AtlasLink[] };
export const ATLAS_LIMITS = {
  files: 1000,
  bytes: 80_000_000,
  text: 150_000,
  totalText: 10_000_000,
};
export function canonicalPath(input: string) {
  const parts: string[] = [];
  for (const part of input.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("Path escapes the imported folder.");
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) throw new Error("A file needs a path.");
  return parts.join("/");
}
const stop = new Set(
  "this that with from have will your about into then when const return function import export default string number true false null undefined class public private async await the and for are but not you all was were can has our let var new use get set www com http https div span type name value data file files index test tests".split(
    " ",
  ),
);
export function buildGraph(files: AtlasFile[]): AtlasGraph {
  if (files.length > ATLAS_LIMITS.files)
    throw new Error("Map limit: 1,000 files. Choose a smaller folder.");
  const nodes: AtlasNode[] = [],
    links: AtlasLink[] = [],
    paths = new Map<string, AtlasNode>(),
    bases = new Map<string, string[]>();
  let totalText = 0;
  for (const f of files) {
    const id = canonicalPath(f.path);
    if (paths.has(id))
      throw new Error(`Duplicate path: ${id}. Import one root at a time.`);
    totalText += f.text.length;
    if (f.text.length > ATLAS_LIMITS.text || totalText > ATLAS_LIMITS.totalText)
      throw new Error("Extracted text exceeds the map budget.");
    const label = id.split("/").pop()!,
      folder = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
    const n = { ...f, path: id, id, label, folder, degree: 0 };
    nodes.push(n);
    paths.set(id, n);
    for (const key of [
      label.toLowerCase(),
      label.replace(/\.[^.]+$/, "").toLowerCase(),
    ])
      bases.set(key, [...new Set([...(bases.get(key) ?? []), id])]);
  }
  const seen = new Set<string>();
  function link(
    source: string,
    target: string,
    kind: AtlasLink["kind"],
    evidence: string,
  ) {
    if (source === target) return;
    const key = kind + ":" + [source, target].sort().join("\0");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source, target, kind, evidence });
    paths.get(source)!.degree++;
    paths.get(target)!.degree++;
  }
  // A folder is a real grouping node, never a claim of topical similarity.
  for (const n of [...nodes])
    if (n.folder) {
      const id = "folder:" + n.folder;
      if (!paths.has(id)) {
        const folder: AtlasNode = {
          id,
          path: n.folder,
          label: n.folder.split("/").pop()!,
          folder: n.folder,
          kind: "folder",
          text: "",
          size: 0,
          status: "metadata",
          degree: 0,
        };
        nodes.push(folder);
        paths.set(id, folder);
      }
      link(id, n.id, "folder", `In ${n.folder}`);
    }
  const lowerPaths = new Map(
    [...paths.keys()].map((p) => [p.toLowerCase(), p]),
  );
  for (const n of nodes.filter((n) => n.kind !== "folder")) {
    const refs = [
      ...n.text.matchAll(
        /\[\[([^\]|#]+)(?:[^\]]*)\]\]|\]\(([^)\s]+)(?:[^)]*)\)|(?:from\s*|import\s*|require\s*\()(["'])([^"']+)\3/g,
      ),
    ];
    for (const m of refs) {
      let ref = m[1] ?? m[2] ?? m[4];
      if (!ref || /^(https?:|data:|mailto:|#)/i.test(ref)) continue;
      try {
        ref = decodeURIComponent(ref.split("#")[0]);
        const relative = canonicalPath((n.folder ? n.folder + "/" : "") + ref);
        const candidates = [
          relative,
          relative + ".md",
          relative + ".ts",
          relative + ".tsx",
          relative + ".js",
          relative + "/index.ts",
          relative + "/index.tsx",
          ref,
        ];
        let target = candidates
          .map((p) => lowerPaths.get(p.toLowerCase()))
          .find(Boolean);
        if (!target && m[1]) {
          const matches = bases.get(ref.toLowerCase());
          if (matches?.length === 1) target = matches[0];
        }
        if (target) link(n.id, target, "reference", `Reference: ${ref}`);
      } catch {
        /* References outside the supplied root have no node. */
      }
    }
  }
  // Bounded inverted index. Shared words are labelled evidence, not inferred meaning.
  const terms = new Map<string, number[]>(),
    docs = nodes.filter((n) => n.kind !== "folder");
  docs.forEach((n, i) => {
    const counts = new Map<string, number>();
    for (const w of n.text
      .toLowerCase()
      .match(/[\p{L}][\p{L}\p{N}_-]{3,30}/gu) ?? [])
      if (!stop.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const [w] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 70))
      terms.set(w, [...(terms.get(w) ?? []), i]);
  });
  const pairs = new Map<string, string[]>();
  for (const [word, ids] of terms)
    if (
      ids.length > 1 &&
      ids.length <= Math.max(3, Math.min(24, docs.length * 0.18))
    ) {
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          const k = ids[a] + ":" + ids[b];
          const words = pairs.get(k) ?? [];
          if (words.length < 8) words.push(word);
          pairs.set(k, words);
        }
    }
  const neighbours = new Map<number, number>();
  for (const [pair, words] of [...pairs]
    .filter(([, w]) => w.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)) {
    const [a, b] = pair.split(":").map(Number);
    if ((neighbours.get(a) ?? 0) >= 4 || (neighbours.get(b) ?? 0) >= 4)
      continue;
    link(docs[a].id, docs[b].id, "terms", `Shared words: ${words.join(", ")}`);
    neighbours.set(a, (neighbours.get(a) ?? 0) + 1);
    neighbours.set(b, (neighbours.get(b) ?? 0) + 1);
  }
  return { nodes, links };
}
export function parseGraph(raw: string): AtlasFile[] {
  if (raw.length > 15_000_000) throw new Error("Saved map limit: 15 MB.");
  const data = JSON.parse(raw);
  if (
    data?.format !== "atlas-v1" ||
    !Array.isArray(data.files) ||
    data.files.length > ATLAS_LIMITS.files
  )
    throw new Error("Not a supported Atlas map.");
  const files: AtlasFile[] = data.files.map((f: AtlasFile) => {
    if (
      !f ||
      typeof f.path !== "string" ||
      typeof f.text !== "string" ||
      typeof f.kind !== "string" ||
      !Number.isFinite(f.size) ||
      f.size < 0 ||
      !["read", "metadata"].includes(f.status)
    )
      throw new Error("Invalid file in saved map.");
    return {
      path: canonicalPath(f.path),
      text: f.text,
      size: f.size,
      kind: f.kind,
      status: f.status,
      ...(typeof f.note === "string" ? { note: f.note } : {}),
    };
  });
  buildGraph(files);
  return files;
}
