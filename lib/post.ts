/**
 * The POST's readings of the machine the site is actually running on.
 *
 * The rest of the BIOS is Fergus's joke about himself as hardware. These lines
 * are the straight man: true readings of the visitor's own computer, printed
 * the way a real POST prints what it found. That contrast is the point, so the
 * rule for every line here is that it is true or it is not printed. Nothing is
 * rounded into a nicer number, a missing reading says so, and a measurement
 * that cannot be trusted is left out rather than guessed.
 *
 * Everything is read in the browser by `BootSequence`, handed to these pure
 * functions, and written to a text node. It is never stored and never sent, and
 * the overlay carries `ph-no-capture` so that PostHog's autocapture cannot lift
 * the text off a click either.
 */

import type { PostField } from "./boot";

/** What `BootSequence` reads off the browser. Every field may be missing. */
export type HostEnv = {
  /** `navigator.hardwareConcurrency`: logical processors, as the browser reports them. */
  readonly cores?: number | null;
  /** `navigator.deviceMemory`, Chromium only. An approximation, see `memoryValue`. */
  readonly memoryGb?: number | null;
  /** `screen.width` and `screen.height`, in CSS pixels. */
  readonly screenW?: number | null;
  readonly screenH?: number | null;
  /** `devicePixelRatio`, which includes browser zoom. */
  readonly dpr?: number | null;
  /** Measured by `refreshFromGaps`, or null when it could not be trusted. */
  readonly refreshHz?: number | null;
  /** `navigator.language`. */
  readonly locale?: string | null;
  /** `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  readonly timeZone?: string | null;
};

/** Every label is padded to this, " : " included, so the values share a column. */
export const POST_LABEL_WIDTH = 16;

/**
 * The phone BIOS is sized to 44 characters a line (`app/globals.css`, pinned by
 * `app/globals.test.ts`). A longer line wraps and leaves its value stranded
 * under the label, so no line is allowed past it on any profile.
 */
export const POST_MAX_WIDTH = 44;

const LABELS: Record<PostField, string> = {
  cpu: "Host CPU",
  memory: "Host memory",
  display: "Host display",
  locale: "Host locale",
};

const label = (field: PostField) => `${LABELS[field].padEnd(POST_LABEL_WIDTH - 3)} : `;
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
const isPositive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function cpuValue(cores: HostEnv["cores"]): string {
  if (!isCount(cores)) return "not reported";
  return `${cores} logical core${cores === 1 ? "" : "s"}`;
}

/**
 * Chrome rounds the real figure to the nearest power of two and caps it at 8,
 * to make machines harder to fingerprint. So a reported 4 is anything from
 * about 3 to 6 GB, and a reported 8 is anything over about 6, including every
 * 16 and 32 GB laptop. "8 GB" would be a wrong number on most developer
 * machines, which is why the cap says what it means.
 */
function memoryValue(gb: number): string {
  if (gb >= 8) return "8 GB or more";
  if (gb >= 1) return `about ${gb} GB`;
  return `about ${Math.round(gb * 1024)} MB`;
}

/** 2 stays 2, 1.25 stays 1.25, and zoom's 1.100000023841858 becomes 1.1. */
function ratio(dpr: number): string {
  return String(Math.round(dpr * 100) / 100);
}

function displayValue(env: HostEnv): string | null {
  if (!isPositive(env.screenW) || !isPositive(env.screenH)) return null;
  let value = `${Math.round(env.screenW)} x ${Math.round(env.screenH)}`;
  if (isPositive(env.dpr)) value += ` @${ratio(env.dpr)}x`;
  if (isPositive(env.refreshHz)) value += `, ${Math.round(env.refreshHz)} Hz`;
  return value;
}

/**
 * The locale and the zone, shortened only as far as it takes to fit: the
 * locale goes first, then the zone loses its leading regions one at a time, so
 * what survives is always the part that names the place.
 */
function localeValue(env: HostEnv, room: number): string | null {
  const locale = typeof env.locale === "string" && env.locale ? env.locale : null;
  const zone = typeof env.timeZone === "string" && env.timeZone ? env.timeZone : null;
  if (!locale && !zone) return null;
  if (!zone) return locale!.slice(0, room);
  const both = locale ? `${locale}, ${zone}` : zone;
  if (both.length <= room) return both;
  const parts = zone.split("/");
  while (parts.length > 1 && parts.join("/").length > room) parts.shift();
  return parts.join("/").slice(0, room);
}

/**
 * The POST lines for one profile, in the order it lists them. A reading that
 * does not exist is left out (memory outside Chromium, a screen nobody
 * reported), except the core count, which says it was not reported, because a
 * POST that skips its own CPU line reads like a bug.
 */
export function postLines(
  env: HostEnv,
  fields: readonly PostField[] = ["cpu", "memory", "display", "locale"],
  maxWidth: number = POST_MAX_WIDTH,
): string[] {
  const room = maxWidth - POST_LABEL_WIDTH;
  const out: string[] = [];
  for (const field of fields) {
    let value: string | null = null;
    if (field === "cpu") value = cpuValue(env.cores);
    else if (field === "memory") value = isPositive(env.memoryGb) ? memoryValue(env.memoryGb) : null;
    else if (field === "display") value = displayValue(env);
    else if (field === "locale") value = localeValue(env, room);
    if (value) out.push(label(field) + value.slice(0, room));
  }
  return out;
}

/** Fewer frames than this and the refresh rate is not printed at all. */
export const MIN_REFRESH_GAPS = 20;

/** The rates panels actually run at. A reading within 5% of one is that one. */
const PANEL_RATES = [48, 50, 60, 72, 75, 85, 90, 100, 120, 144, 165, 180, 240, 360];

/**
 * The display's refresh rate, from the gaps between frames, or null.
 *
 * What the frame clock measures is the rate frames reach this page, which is
 * the panel's refresh rate on most machines and a cap below it on some (a
 * phone in low power mode runs at 30, Safari on a 120Hz iPhone at 60). So the
 * reading has to earn its place: enough frames, most of them within a fifth of
 * the median, and a rate a panel could plausibly run at. A starved main thread
 * or software WebGL fails the second test, and a phone throttled to 30 fails
 * the third, and both get no number rather than a wrong one.
 *
 * The rate itself is read from the mean of the steady gaps, not the median,
 * because some browsers round frame times to the millisecond: a 60Hz panel
 * then reports gaps of 16 and 17ms, whose median is 62.5Hz or 58.8Hz and whose
 * mean is 60. The median alone printed "63 Hz" for a 60Hz screen and "125 Hz"
 * for a 120Hz one in `lib/post.test.ts`.
 */
export function refreshFromGaps(gaps: readonly number[]): number | null {
  const usable = gaps.filter((g) => Number.isFinite(g) && g > 0);
  if (usable.length < MIN_REFRESH_GAPS) return null;
  const sorted = [...usable].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  // A fifth of the median, but never less than the millisecond and a half that
  // whole-millisecond timestamps can put between two gaps of the same panel.
  const steady = usable.filter((g) => Math.abs(g - median) <= Math.max(median * 0.2, 1.5));
  if (steady.length < usable.length * 0.75) return null;
  const hz = 1000 / (steady.reduce((sum, g) => sum + g, 0) / steady.length);
  if (hz < 45 || hz > 500) return null;
  let panel: number | null = null;
  for (const rate of PANEL_RATES) {
    const off = Math.abs(hz - rate);
    if (off <= rate * 0.05 && (panel === null || off < Math.abs(hz - panel))) panel = rate;
  }
  return panel ?? Math.round(hz);
}

/** Where in each line's slot the label finishes typing, and where the reading lands. */
const LABEL_DONE = 0.4;
const VALUE_AT = 0.62;

/**
 * The POST block `msIntoPost` milliseconds in, as the screen shows it.
 *
 * Each line gets an equal share of the block, so the block lasts the same time
 * whatever the visitor's readings are, which is what lets `bootTimeline` end at
 * a fixed floor. Within its share a line types its label, waits with the cursor
 * after it while the probe runs, and then the reading lands whole, the way a
 * real POST prints a drive it has just found.
 */
export function postReveal(lines: readonly string[], msIntoPost: number, postMs: number): string {
  if (lines.length === 0 || msIntoPost <= 0) return "";
  if (msIntoPost >= postMs) return lines.join("\n");
  const slot = postMs / lines.length;
  const current = Math.min(lines.length - 1, Math.floor(msIntoPost / slot));
  const t = (msIntoPost - current * slot) / slot;
  const shown = lines.slice(0, current);
  const line = lines[current];
  if (t >= VALUE_AT) shown.push(line);
  else {
    const typed = Math.min(POST_LABEL_WIDTH, Math.floor((t / LABEL_DONE) * POST_LABEL_WIDTH));
    if (typed > 0) shown.push(`${line.slice(0, typed)}▋`);
  }
  return shown.join("\n");
}
