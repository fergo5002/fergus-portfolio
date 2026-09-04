import { secondVisitCopy } from "@/content/tools/second-visit";
import type { Analysis, CustomerRow } from "./analyse";

/**
 * Three lists somebody could act on this morning, and the guard a CSV needs.
 *
 * Each list is defined by the action it implies rather than by a score band,
 * and nobody appears in two of them, because a list that overlaps another is a
 * list somebody contacts twice.
 *
 * **The formula guard.** A cell starting with `=`, `+`, `-`, `@`, a tab or a
 * carriage return is a formula in Excel, LibreOffice and Sheets. These files
 * carry identifiers that came out of somebody else's system and go into a file
 * somebody will double-click. Text cells get an apostrophe; numbers never do,
 * because prefixing a negative number turns it into text and breaks every sum
 * in the sheet.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const guarded = FORMULA_START.test(value) ? "'" + value : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** CRLF, which is what RFC 4180 says and what a spreadsheet expects. */
export function toCsv(header: readonly string[], rows: readonly (string | number | null)[][]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}

const byWorth = (a: CustomerRow, b: CustomerRow) =>
  b.winnabilityCents - a.winnabilityCents || a.id.localeCompare(b.id);

/** A real rhythm, well past it, and worth something. */
export function lapsedRegulars(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits >= 3 && (row.lifecycle === "lapsed" || row.lifecycle === "at_risk"))
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

/** One visit, not yet late. The cheapest nudge in the file. */
export function secondVisitNudges(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits === 1 && row.lifecycle === "first_time")
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

/** Two or three visits and drifting: the point where a habit forms or does not. */
export function stallRisks(analysis: Analysis): CustomerRow[] {
  return analysis.rows
    .filter((row) => row.visits >= 2 && row.visits <= 3)
    .filter((row) => row.silenceRatio !== null && row.silenceRatio >= 0.75)
    .filter((row) => row.lifecycle !== "lapsed" && row.lifecycle !== "at_risk")
    .filter((row) => row.winnabilityCents > 0)
    .sort(byWorth);
}

const HEADER = [
  "customer",
  "visits",
  "first_visit",
  "last_visit",
  "days_since_last",
  "own_cadence_days",
  "expected_gap_days",
  "silence_ratio",
  "distance_band",
  "distance_km",
  "verdict",
  "verdict_before",
  "p_return",
  "expected_margin_cents",
  "winnability_cents",
];

function toRows(rows: readonly CustomerRow[]): (string | number | null)[][] {
  return rows.map((row) => [
    row.id,
    row.visits,
    row.firstIso,
    row.lastIso,
    row.daysSinceLast,
    row.visitCadenceDays,
    row.expectedGapDays,
    row.silenceRatio,
    row.distanceBand,
    row.distanceKm,
    row.lifecycle,
    row.lifecycleNaive,
    row.pReturn,
    row.expectedMarginCents,
    row.winnabilityCents,
  ]);
}

export type ExportFile = { name: string; file: string; note: string; csv: string };

export function exportFiles(analysis: Analysis): ExportFile[] {
  const copy = secondVisitCopy.exports;
  const consentNote = analysis.assumedConsent ? ` ${copy.assumesConsent}` : "";
  return [
    { spec: copy.lapsed, rows: lapsedRegulars(analysis) },
    { spec: copy.nudges, rows: secondVisitNudges(analysis) },
    { spec: copy.stalls, rows: stallRisks(analysis) },
  ].map(({ spec, rows }) => ({
    name: spec.name,
    file: spec.file,
    note: `${spec.note}${consentNote}`,
    csv: toCsv(HEADER, toRows(rows)),
  }));
}

