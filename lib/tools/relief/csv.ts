import { WEEKS, type ReliefEvent } from "./types";
import { weekIndex } from "./heightmap";

/**
 * Any CSV with a date column in it.
 *
 * Hand-written rather than a dependency: RFC 4180 is one state machine, the
 * tool wants the header row and one column, and a parser package would be the
 * only runtime dependency this whole tool needed.
 *
 * Two decisions worth defending. The window is anchored on the newest row in
 * the file rather than on today, so a two-year-old export draws the year it
 * covers instead of fifty-two empty weeks. And a timestamp with no offset is
 * read as wall clock, hour field verbatim, exactly as the GitHub path reads
 * the author's local hour. Both are on the tool's "can't see" list, because
 * both are places where the sheet is answering a slightly different question
 * from the one a visitor might assume.
 */

/** A phone reading a bigger file than this is a phone that stops responding. */
export const MAX_CSV_ROWS = 200_000;

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      table.push(row);
      row = [];
      if (table.length > MAX_CSV_ROWS) break;
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    table.push(row);
  }

  // A trailing newline produces one row of one empty field. It is not a row.
  const real = table.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = (real.shift() ?? []).map((h) => h.trim());
  return { headers, rows: real };
}

export type Parsed = { at: number; hour: number };

/**
 * ISO 8601, with or without an offset, and the space-separated variant every
 * spreadsheet writes. Nothing else: `14/01/2026` is either January or the
 * fourteenth of the month depending on which side of an ocean it was written
 * on, and a tool that guesses wrong draws a plausible lie.
 */
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function parseWhen(value: string): Parsed | null {
  const m = ISO.exec(value.trim());
  if (!m) return null;
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  // The instant, for the column. Offsetless input is read as UTC here, which
  // shifts a column boundary by at most half a day and never a row.
  const at = Date.parse(
    m[7] ? value.trim().replace(" ", "T") : `${value.trim().replace(" ", "T")}Z`,
  );
  if (!Number.isFinite(at)) return null;
  return { at, hour };
}

const DATE_WORDS = /date|time|when|created|at$|_at|day/i;

/** The column most rows parse in. A tie goes to the header that sounds like a date. */
export function dateColumnGuess(headers: readonly string[], rows: readonly string[][]): number {
  const sample = rows.slice(0, 50);
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < Math.max(headers.length, sample[0]?.length ?? 0); c++) {
    const hits = sample.filter((r) => parseWhen(r[c] ?? "") !== null).length;
    if (hits === 0) continue;
    const score = hits * 10 + (DATE_WORDS.test(headers[c] ?? "") ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export type CsvReading = {
  events: ReliefEvent[];
  read: number;
  skipped: number;
  /** The instant the window ends: the newest row in the file. */
  endMs: number;
};

export function eventsFromCsv(rows: readonly string[][], column: number): CsvReading {
  const parsed: Parsed[] = [];
  let skipped = 0;
  for (const row of rows) {
    const p = parseWhen(row[column] ?? "");
    if (p) parsed.push(p);
    else skipped++;
  }
  if (parsed.length === 0) return { events: [], read: 0, skipped, endMs: 0 };

  const endMs = Math.max(...parsed.map((p) => p.at));
  const events: ReliefEvent[] = [];
  for (const p of parsed) {
    const week = weekIndex(p.at, endMs);
    if (week === null || week < 0 || week >= WEEKS) {
      skipped++;
      continue;
    }
    events.push({ week, hour: p.hour });
  }
  return { events, read: events.length, skipped, endMs };
}
