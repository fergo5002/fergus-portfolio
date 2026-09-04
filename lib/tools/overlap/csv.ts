import { normaliseSlug } from "./slug";
import type { Entry } from "./types";

/**
 * Reading LinkedIn's `Connections.csv`.
 *
 * The export does not begin with its header. It begins with `Notes:`, a
 * sentence about missing email addresses, and a blank line, and only then the
 * header row. A reader that trusts row zero finds no URL column and blames the
 * visitor's file, so `readConnections` looks for the header rather than
 * assuming where it is.
 *
 * The state machine below is RFC 4180 and nothing more: quotes, doubled
 * quotes, embedded commas and newlines, and CRLF or LF. It is deliberately not
 * shared with T2's reader, which answers a different question and ships in a
 * parallel sub-project; see the plan for why, and for the follow-up that may
 * merge them later.
 */

/** Under this many usable rows the tool refuses rather than comparing noise. */
export const MIN_USABLE_ROWS = 5;

/** Headers that have carried the profile URL across versions of the export. */
const URL_HEADER = /^(url|profile[\s_-]*url|public[\s_-]*profile[\s_-]*url)$/i;
const FIRST_HEADER = /^first[\s_-]*name$/i;
const LAST_HEADER = /^last[\s_-]*name$/i;
/** How many rows to search before giving up on finding a header. */
const HEADER_SEARCH_ROWS = 12;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') {
        field += ch;
        continue;
      }
      if (text[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      quoted = false;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type ConnectionsFile = {
  /** Index of the header row in the parsed rows, or -1 when none was found. */
  headerRow: number;
  headers: string[];
  /** Index of the profile URL column, or -1 when nothing looked like one. */
  urlColumn: number;
  nameColumns: { first: number; last: number } | null;
  /** Everything after the header. */
  rows: string[][];
};

export function readConnections(text: string): ConnectionsFile {
  const all = parseCsv(text);
  const limit = Math.min(all.length, HEADER_SEARCH_ROWS);

  for (let i = 0; i < limit; i++) {
    const cells = all[i].map((c) => c.trim());
    const url = cells.findIndex((c) => URL_HEADER.test(c));
    if (url === -1) continue;
    const first = cells.findIndex((c) => FIRST_HEADER.test(c));
    const last = cells.findIndex((c) => LAST_HEADER.test(c));
    return {
      headerRow: i,
      headers: cells,
      urlColumn: url,
      nameColumns: first !== -1 && last !== -1 ? { first, last } : null,
      rows: all.slice(i + 1),
    };
  }

  // No header the reader recognises. Hand back the widest row as the headers so
  // the page can offer a column picker, and let the visitor choose.
  let widest = 0;
  for (let i = 0; i < limit; i++) if (all[i].length > (all[widest]?.length ?? 0)) widest = i;
  const headers = (all[widest] ?? []).map((c) => c.trim());
  return {
    headerRow: all.length ? widest : -1,
    headers,
    urlColumn: -1,
    nameColumns: null,
    rows: all.length ? all.slice(widest + 1) : [],
  };
}

export type ReadCounts = {
  rows: number;
  used: number;
  empty: number;
  legacyPub: number;
  notAProfile: number;
  duplicate: number;
};

/**
 * Rows become entries. Every refusal is counted under its own reason, because
 * "skipped 812 rows" is a sentence that tells a visitor nothing, and "812 with
 * no profile link" tells them their export is normal.
 *
 * A row with fewer cells than the column index is not a fault worth stopping
 * for; the export has ragged rows when a field held a stray newline, and the
 * right answer is to count it as empty and carry on.
 */
export function entriesFrom(
  file: ConnectionsFile,
  urlColumn: number,
  nameColumns: ConnectionsFile["nameColumns"] = file.nameColumns,
): { entries: Entry[]; counts: ReadCounts } {
  const counts: ReadCounts = {
    rows: 0,
    used: 0,
    empty: 0,
    legacyPub: 0,
    notAProfile: 0,
    duplicate: 0,
  };
  const bySlug = new Map<string, Entry>();

  for (const row of file.rows) {
    if (row.length === 1 && row[0].trim() === "") continue; // a trailing blank line is not a row
    counts.rows += 1;

    const raw = row[urlColumn] ?? "";
    const result = normaliseSlug(raw);
    if (!result.ok) {
      if (result.reason === "empty") counts.empty += 1;
      else if (result.reason === "legacy-pub") counts.legacyPub += 1;
      else counts.notAProfile += 1;
      continue;
    }

    if (bySlug.has(result.slug)) {
      counts.duplicate += 1;
      continue;
    }

    const label = nameColumns
      ? [row[nameColumns.first] ?? "", row[nameColumns.last] ?? ""]
          .map((p) => p.trim())
          .filter(Boolean)
          .join(" ")
      : "";
    bySlug.set(result.slug, { slug: result.slug, label: label || result.slug });
    counts.used += 1;
  }

  return { entries: [...bySlug.values()], counts };
}
