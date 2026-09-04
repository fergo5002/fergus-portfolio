import { ReadError } from "./types";

/**
 * A CSV reader for whatever a booking system calls an export.
 *
 * RFC 4180 in a state machine, plus three things real exports do that the RFC
 * does not mention: a byte order mark, a preamble above the header, and a
 * delimiter that is a semicolon because the file was made in a locale where a
 * comma is a decimal point.
 *
 * **Line endings are normalised inside the machine, not before it.** A
 * `replace(/\r\n/g, "\n")` over a 50 MB string is a second 50 MB string, and it
 * would also rewrite a CRLF inside a quoted field, which is content. The
 * machine treats CRLF, LF and a lone CR as one row terminator when it is not
 * inside quotes, and leaves whatever is inside quotes alone.
 */

export const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_ROWS = 500_000;

/** How many rows are looked at when guessing the delimiter and the header. */
const SNIFF_ROWS = 50;

export type Sheet = {
  header: string[];
  rows: string[][];
  /** Which parsed row the header was. Blank lines are already gone by then, so
   *  this counts rows rather than lines in the file. */
  headerIndex: number;
  skipped: number;
  delimiter: string;
  truncated: boolean;
};

export type ParseOptions = { delimiter?: string; maxRows?: number };

/**
 * The delimiter, from the first line that is not inside quotes.
 *
 * Counted outside quotes only, so `"Name, full";"Date"` is not read as a comma
 * file with two commas in it.
 */
export function detectDelimiter(text: string): string {
  const candidates = [",", ";", "\t", "|"];
  const line = firstUnquotedLine(text);
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(line, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount === 0 ? "," : best;
}

function firstUnquotedLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === "\n" || c === "\r")) return text.slice(0, i);
  }
  return text;
}

function countOutsideQuotes(line: string, needle: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === needle) count++;
  }
  return count;
}

/** Every physical row, before a header is chosen. */
function scan(text: string, delimiter: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;
  let truncated = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };
  const endRow = () => {
    if (started || row.length > 0 || field !== "") endField();
    // A blank line is not a row of one empty field, and it is not a row of no
    // fields either. Both are nothing.
    const blank = row.length === 0 || (row.length === 1 && row[0] === "");
    if (!blank) rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      started = true;
      continue;
    }
    if (c === delimiter) {
      endField();
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
      if (rows.length >= maxRows + 1) {
        truncated = true;
        break;
      }
      continue;
    }
    if (c === "\n") {
      endRow();
      if (rows.length >= maxRows + 1) {
        truncated = true;
        break;
      }
      continue;
    }
    field += c;
    started = true;
  }
  if (field !== "" || row.length > 0) endRow();
  return { rows, truncated };
}

/**
 * Which row is the header.
 *
 * The width of the table is the commonest row width in the first fifty rows.
 * The header is the first row of that width whose cells are all non-empty and
 * none of which reads as a number, because a title line ("Bookings export") is
 * narrower and a data row has numbers in it. If nothing qualifies, row zero is
 * the header and the caller is left to notice that the column names are
 * useless, which is a better failure than silently dropping the first booking.
 */
function chooseHeader(rows: string[][]): number {
  const widths = new Map<number, number>();
  for (const row of rows.slice(0, SNIFF_ROWS)) {
    widths.set(row.length, (widths.get(row.length) ?? 0) + 1);
  }
  let width = 0;
  let seen = 0;
  for (const [w, count] of widths) {
    if (count > seen || (count === seen && w > width)) {
      width = w;
      seen = count;
    }
  }
  for (let i = 0; i < Math.min(rows.length, SNIFF_ROWS); i++) {
    const row = rows[i];
    if (row.length !== width) continue;
    const everyCellNamed = row.every((cell) => cell.trim() !== "" && !isNumeric(cell));
    if (everyCellNamed) return i;
  }
  return 0;
}

function isNumeric(cell: string): boolean {
  const t = cell.trim();
  if (t === "") return false;
  return /^[-+]?[\d.,]+$/.test(t) && /\d/.test(t);
}

export function parseCsv(text: string, options: ParseOptions = {}): Sheet {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.trim() === "") throw new ReadError("empty", "no rows in that file");

  const delimiter = options.delimiter ?? detectDelimiter(body);
  const maxRows = options.maxRows ?? MAX_ROWS;
  const { rows, truncated } = scan(body, delimiter, maxRows);
  if (rows.length === 0) throw new ReadError("empty", "no rows in that file");

  const headerIndex = chooseHeader(rows);
  const header = rows[headerIndex].map((cell) => cell.trim());
  const width = header.length;
  const data: string[][] = [];
  for (let i = headerIndex + 1; i < rows.length && data.length < maxRows; i++) {
    const row = rows[i];
    if (row.length === width) data.push(row);
    else if (row.length < width) data.push([...row, ...Array(width - row.length).fill("")]);
    else data.push(row);
  }

  return {
    header,
    rows: data,
    headerIndex,
    skipped: headerIndex,
    delimiter,
    truncated: truncated || data.length >= maxRows,
  };
}

