import type { DateStyle } from "./types";

const MS_PER_DAY = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEPARATED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/;

export function dayFromIso(iso: string): number | null {
  const match = ISO.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  const ms = Date.UTC(year, month - 1, dayOfMonth);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== dayOfMonth
  ) return null;
  return Math.round(ms / MS_PER_DAY);
}

export function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function monthOfYear(day: number): number {
  return new Date(day * MS_PER_DAY).getUTCMonth() + 1;
}

export function isoDow(day: number): number {
  return (((day + 3) % 7) + 7) % 7 + 1;
}

export function parseDay(text: string, style: DateStyle): number | null {
  const value = text.trim();
  if (value === "") return null;
  if (style === "iso") return dayFromIso(value.slice(0, 10));
  const match = SEPARATED.exec(value);
  if (!match) return dayFromIso(value.slice(0, 10));
  const a = Number(match[1]);
  const b = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length <= 2) year += year < 70 ? 2000 : 1900;
  const day = style === "dmy" ? a : b;
  const month = style === "dmy" ? b : a;
  const pad = (value_: number) => String(value_).padStart(2, "0");
  return dayFromIso(String(year).padStart(4, "0") + "-" + pad(month) + "-" + pad(day));
}

export function detectDateStyle(samples: readonly string[]): { style: DateStyle; ambiguous: boolean } {
  let dayFirst = false;
  let monthFirst = false;
  let separated = 0;
  let iso = 0;
  for (const raw of samples) {
    const value = raw.trim();
    if (value === "") continue;
    if (ISO_LIKE.test(value)) {
      iso++;
      continue;
    }
    const match = SEPARATED.exec(value);
    if (!match) continue;
    separated++;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }
  if (separated === 0) return { style: "iso", ambiguous: false };
  if (iso > separated) return { style: "iso", ambiguous: false };
  if (dayFirst && !monthFirst) return { style: "dmy", ambiguous: false };
  if (monthFirst && !dayFirst) return { style: "mdy", ambiguous: false };
  return { style: "dmy", ambiguous: true };
}

export function percentileCont(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function medianCont(values: readonly number[]): number | null {
  return percentileCont(values, 0.5);
}

/** Closest double-precision equivalent of Postgres numeric rounding. */
export function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) return value;
  return Number(value.toFixed(digits));
}

export function widthBucket(value: number, bounds: readonly number[]): number {
  let bucket = 0;
  for (const bound of bounds) {
    if (value >= bound) bucket++;
    else break;
  }
  return bucket;
}
