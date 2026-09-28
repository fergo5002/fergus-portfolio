/**
 * File intake rules for `components/instrument/DropSlot`.
 *
 * The native picker filters by its `accept` attribute, but a drop bypasses it
 * completely: anything can land on the stage. So the same rule is applied here,
 * by hand, and a file the tool cannot read is refused with a reason rather than
 * handed to a parser that will fail somewhere less helpful.
 *
 * Extensions win over types on purpose. Browsers disagree about types (Windows
 * with Excel installed reports a CSV as `application/vnd.ms-excel`), while the
 * extension is what the visitor can see and what the tool's accept list names.
 */

export type FileLike = { name: string; type: string; size: number };

export type AcceptRule = { extensions: string[]; types: string[]; wildcards: string[] };

/** The last extension, lower-cased with its dot. Empty for none or a dotfile. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot).toLowerCase();
}

/** An `accept` attribute, split into extensions, exact types and `family/` wildcards. */
export function parseAccept(accept: string): AcceptRule {
  const rule: AcceptRule = { extensions: [], types: [], wildcards: [] };
  for (const raw of accept.split(",")) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry.startsWith(".")) rule.extensions.push(entry);
    else if (entry.endsWith("/*")) rule.wildcards.push(entry.slice(0, -1));
    else rule.types.push(entry);
  }
  return rule;
}

function isEmpty(rule: AcceptRule): boolean {
  return !rule.extensions.length && !rule.types.length && !rule.wildcards.length;
}

/** Whether a file passes an accept rule. No rule accepts everything. */
export function acceptsFile(file: Pick<FileLike, "name" | "type">, accept: string | AcceptRule): boolean {
  const rule = typeof accept === "string" ? parseAccept(accept) : accept;
  if (isEmpty(rule)) return true;
  const ext = extensionOf(file.name);
  if (ext && rule.extensions.includes(ext)) return true;
  const type = file.type.toLowerCase();
  if (type && rule.types.includes(type)) return true;
  return Boolean(type) && rule.wildcards.some((family) => type.startsWith(family));
}

/** Types that are the same format as an extension already listed. */
const TYPE_TO_EXTENSION: Record<string, string> = {
  "text/csv": ".csv",
  "application/json": ".json",
  "text/plain": ".txt",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
};

/** Extensions that are another spelling of a format already listed. */
const ALIASES: Record<string, string> = { ".jpeg": ".jpg", ".htm": ".html", ".tif": ".tiff" };

/** Short labels for the formats a rule takes, one per format, in the rule's order. */
export function acceptChips(accept: string): string[] {
  const rule = parseAccept(accept);
  const out: string[] = [];
  const add = (label: string) => {
    if (!out.includes(label)) out.push(label);
  };
  for (const ext of rule.extensions) add((ALIASES[ext] ?? ext).slice(1).toUpperCase());
  for (const type of rule.types) {
    const ext = TYPE_TO_EXTENSION[type];
    add(ext ? ext.slice(1).toUpperCase() : (type.split("/")[1] ?? type).toUpperCase());
  }
  for (const family of rule.wildcards) add(family.replace(/\/$/, "").toUpperCase());
  return out;
}

export type Refusal = "type" | "size" | "count";

export type Screened<T> = { accepted: T[]; rejected: { file: T; reason: Refusal }[] };

/**
 * Sort an incoming batch into what the tool will read and what it refuses.
 * A single-file tool keeps the first acceptable file and refuses the rest as
 * extras, so dropping two by accident says so instead of choosing silently.
 */
export function screenFiles<T extends FileLike>(
  files: readonly T[],
  { accept = "", maxBytes, multiple = false }: { accept?: string; maxBytes?: number; multiple?: boolean },
): Screened<T> {
  const rule = parseAccept(accept);
  const result: Screened<T> = { accepted: [], rejected: [] };
  for (const file of files) {
    if (!acceptsFile(file, rule)) result.rejected.push({ file, reason: "type" });
    else if (maxBytes !== undefined && file.size > maxBytes) result.rejected.push({ file, reason: "size" });
    else if (!multiple && result.accepted.length) result.rejected.push({ file, reason: "count" });
    else result.accepted.push(file);
  }
  return result;
}
