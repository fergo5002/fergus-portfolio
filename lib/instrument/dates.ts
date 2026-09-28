import { clamp } from "./value";

/**
 * The arithmetic behind `components/instrument/DateRange`, which replaces a
 * pair of stock date inputs with presets and two thumbs on one track.
 *
 * Every day is a local calendar day written YYYY-MM-DD, because that is what
 * the tools filter on (`filterMessages` in `lib/studio/lore.ts` compares with
 * local midnight and local end of day). Days are counted through the Date
 * constructor's own year/month/day arithmetic and rounded, so a clock change
 * never adds or loses a day.
 */

export type DayRange = { start?: string; end?: string };

export type Span = { first: string; last: string; days: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** A timestamp's local calendar day. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a calendar day. */
function midnight(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = midnight(iso);
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime());
}

/** Whole days from `a` to `b`, negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86_400_000);
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A day as a person reads it: 3 Jan 2026. */
export function formatDay(iso: string): string {
  return DAY_FORMAT.format(midnight(iso));
}

/** The first and last calendar day in a set of timestamps. */
export function spanOf(timestamps: readonly number[]): Span | null {
  if (!timestamps.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of timestamps) {
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const first = isoDay(lo);
  const last = isoDay(hi);
  return { first, last, days: daysBetween(first, last) };
}

/**
 * How many timestamps fall in each of `buckets` equal slices of the span, so
 * a date range can draw the shape of the data behind its thumbs. Never more
 * buckets than days; a timestamp outside the span is left out.
 */
export function densityOf(timestamps: readonly number[], span: Span, buckets: number): number[] {
  const days = span.days + 1;
  const count = Math.max(1, Math.min(Math.floor(buckets), days));
  const out = Array<number>(count).fill(0);
  for (const t of timestamps) {
    const index = daysBetween(span.first, isoDay(t));
    if (index < 0 || index >= days) continue;
    out[Math.floor((index * count) / days)] += 1;
  }
  return out;
}

export type PresetId = "all" | "year" | "quarter" | "month";

/** Lengths in days, counted back from the last day in the archive. */
export const PRESET_DAYS: Record<Exclude<PresetId, "all">, number> = { year: 365, quarter: 90, month: 30 };

const ORDER: PresetId[] = ["all", "year", "quarter", "month"];

/**
 * A preset's range. Counted back from the archive's last day rather than from
 * today, because a chat export is usually old and "the last month" of it is
 * the month before it was exported.
 */
export function presetRange(id: PresetId, span: Span): DayRange {
  if (id === "all") return { start: undefined, end: undefined };
  return { start: addDays(span.last, -(PRESET_DAYS[id] - 1)), end: undefined };
}

/** Presets shorter than the archive. A longer one would just be everything. */
export function availablePresets(span: Span): PresetId[] {
  return ORDER.filter((id) => id === "all" || PRESET_DAYS[id] - 1 < span.days);
}

/** Which preset a range is, or null for a custom range. */
export function presetOf(range: DayRange, span: Span): PresetId | null {
  const end = range.end === span.last ? undefined : range.end;
  if (!range.start && !end) return "all";
  if (end) return null;
  for (const id of availablePresets(span)) {
    if (id !== "all" && presetRange(id, span).start === range.start) return id;
  }
  return null;
}

/** Where a range's two thumbs sit on a track of `span.days + 1` positions. */
export function rangeIndices(range: DayRange, span: Span): { from: number; to: number } {
  const from = range.start ? clamp(daysBetween(span.first, range.start), 0, span.days) : 0;
  const to = range.end ? clamp(daysBetween(span.first, range.end), 0, span.days) : span.days;
  return { from, to };
}

/** The range after the start thumb moves. It stops at the end thumb; the far left means no start. */
export function moveFrom(range: DayRange, index: number, span: Span): DayRange {
  const to = rangeIndices(range, span).to;
  const at = Math.min(clamp(Math.round(index), 0, span.days), to);
  return { start: at === 0 ? undefined : addDays(span.first, at), end: range.end };
}

/** The range after the end thumb moves. It stops at the start thumb; the far right means no end. */
export function moveTo(range: DayRange, index: number, span: Span): DayRange {
  const from = rangeIndices(range, span).from;
  const at = Math.max(clamp(Math.round(index), 0, span.days), from);
  return { start: range.start, end: at === span.days ? undefined : addDays(span.first, at) };
}
