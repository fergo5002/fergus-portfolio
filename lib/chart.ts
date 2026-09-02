/**
 * Chart specs for the writing surface.
 *
 * An article carries its data inline, as a fenced block tagged `chart` holding
 * JSON. `lib/markdown.ts` hands the body here; a spec that validates becomes a
 * typed `chart` block and a spec that does not returns `null`, so the fence
 * falls back to the code block the author typed. That is the same trade the
 * markdown parser already makes: a malformed document should render slightly
 * wrong, never take the route down.
 *
 * The parsing and the geometry live here rather than in the component because
 * both are pure and both are where the bugs are. A chart that draws a wrong
 * axis is worse than one that fails to draw, and an axis is arithmetic, so it
 * is tested as arithmetic.
 */

export type ChartSeries = {
  /**
   * Always required. This site renders in a single phosphor hue, so a series is
   * identified by its label and its position, never by colour alone. An
   * unlabelled series would be unreadable rather than merely untidy.
   */
  label: string;
  values: number[];
};

export type ChartSpec = {
  kind: "bar" | "line";
  /** Names what is being measured. The chart's only heading, so it is required. */
  title: string;
  /** Appended to every readout, e.g. "ms". Omit for a bare count. */
  unit?: string;
  /** x-axis labels. Every series carries exactly this many values. */
  categories: string[];
  series: ChartSeries[];
  /** The line under the chart: where the number came from, so a reader can check it. */
  caption?: string;
  /** Optional reference line, e.g. a frame budget. */
  baseline?: number;
  baselineLabel?: string;
};

/**
 * Four, because the palette is one hue.
 *
 * Identity has to come from luminance steps inside the phosphor, and a fifth
 * step is not separable from its neighbours on a CRT-styled surface at the
 * sizes this renders. Capping the count is the honest fix; inventing hues the
 * theme cannot show is not.
 */
const MAX_SERIES = 4;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Validates one fenced `chart` body. Returns `null` for anything malformed, and
 * never throws: the caller is rendering a page.
 */
export function parseChart(source: string): ChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (o.kind !== "bar" && o.kind !== "line") return null;
  if (!isNonEmptyString(o.title)) return null;

  if (!Array.isArray(o.categories) || o.categories.length === 0) return null;
  if (!o.categories.every(isNonEmptyString)) return null;
  const categories = o.categories as string[];

  if (!Array.isArray(o.series) || o.series.length === 0 || o.series.length > MAX_SERIES) return null;

  const series: ChartSeries[] = [];
  for (const entry of o.series) {
    if (typeof entry !== "object" || entry === null) return null;
    const s = entry as Record<string, unknown>;
    if (!isNonEmptyString(s.label)) return null;
    if (!Array.isArray(s.values)) return null;
    // The likeliest authoring mistake, and the one that draws a plausible but
    // wrong chart rather than an obviously broken one. So it is fatal.
    if (s.values.length !== categories.length) return null;
    if (!s.values.every(isFiniteNumber)) return null;
    series.push({ label: s.label, values: s.values as number[] });
  }

  const spec: ChartSpec = { kind: o.kind, title: o.title, categories, series };

  if (isNonEmptyString(o.unit)) spec.unit = o.unit;
  if (isNonEmptyString(o.caption)) spec.caption = o.caption;
  // A bad reference line is cosmetic. Dropping it keeps the data, which is the
  // part the reader came for.
  if (isFiniteNumber(o.baseline)) {
    spec.baseline = o.baseline;
    if (isNonEmptyString(o.baselineLabel)) spec.baselineLabel = o.baselineLabel;
  }

  return spec;
}

/**
 * The value range the plot has to cover.
 *
 * A bar chart is anchored at zero and a line chart is not, and that is not a
 * preference. A bar encodes magnitude by length, so truncating its axis makes a
 * 4% difference look like a doubling. A line encodes change over the sequence,
 * where a truncated axis is the readable choice and the shape is still true.
 */
export function seriesExtent(spec: ChartSpec): { min: number; max: number } {
  const all = spec.series.flatMap((s) => s.values);
  if (spec.baseline !== undefined) all.push(spec.baseline);

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (spec.kind === "bar") {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  return { min, max };
}

/** Rounds to the precision implied by `step`, so ticks read 0.3 rather than 0.30000000000000004. */
function quantise(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(decimals, 12)));
}

/**
 * The classic nice-number rounding: snap the range, then the step, to 1, 2 or 5
 * times a power of ten. `round` picks the nearest of those when sizing a step
 * and the next one up when sizing the whole range.
 */
function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let nice: number;
  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }
  return nice * 10 ** exponent;
}

/**
 * Axis ticks covering `[min, max]`, on round numbers, three to seven of them.
 *
 * A flat series is expanded rather than divided by, which is the degenerate case
 * that produces `NaN` ticks and an axis of blank labels.
 */
export function niceTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.2 : 1;
    min -= pad;
    max += pad;
  }

  const step = niceNum(niceNum(max - min, false) / (maxTicks - 1), true);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Counted rather than accumulated: repeated addition of a fractional step
  // drifts, and the drift lands in the axis labels.
  const count = Math.round((end - start) / step);
  for (let i = 0; i <= count; i++) ticks.push(quantise(start + i * step, step));
  return ticks;
}

/**
 * Renders one value for a reader. Thousands separators past 10,000 only: below
 * that a monospace column reads fine without them and the comma is noise. Lives
 * here rather than in the component so the figure and its text alternative can
 * never disagree about how a number is written.
 */
export function formatValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const text = abs >= 10_000 ? value.toLocaleString("en-IE") : String(Number(value.toFixed(2)));
  return unit ? `${text}${unit.startsWith("%") ? "" : " "}${unit}` : text;
}

/**
 * Past this many rows the spoken description stops enumerating and points at
 * the table instead. Forty label-and-value pairs read aloud is not an
 * accessible alternative to a chart, it is a way of burying the answer.
 */
const MAX_SPOKEN_ROWS = 12;

/**
 * The chart's text alternative, used as the `aria-label` on the figure.
 *
 * Two rules, both learnt from what shipped. Each category is paired with its
 * own value rather than the labels being read as one list and the numbers as
 * another, because re-pairing them by position is work a listener should not
 * have to do. And the pairs are separated by a semicolon, because the first
 * version joined them with ", " while the real categories on one article were
 * "Broken, random ids", "Broken, chosen ids" and "Fixed, chosen ids": commas
 * inside the labels and commas between them collapsed into one flat run of
 * nine tokens with no way to tell where a category ended.
 */
export function describeChart(spec: ChartSpec): string {
  const { kind, title, categories, series, unit } = spec;
  const head = `${kind === "bar" ? "Bar chart" : "Line chart"}. ${title}.`;
  const reference =
    spec.baseline === undefined
      ? ""
      : ` Reference line at ${formatValue(spec.baseline, unit)}${
          spec.baselineLabel ? `, ${spec.baselineLabel}` : ""
        }.`;

  if (categories.length > MAX_SPOKEN_ROWS) {
    return `${head} ${categories.length} rows; the full data is in the table below the chart.${reference}`;
  }

  const pairs = categories.map((cat, i) => {
    const values = series
      .map((s) =>
        series.length > 1
          ? `${s.label} ${formatValue(s.values[i], unit)}`
          : formatValue(s.values[i], unit),
      )
      .join(" / ");
    return `${cat}: ${values}`;
  });

  return `${head} ${pairs.join("; ")}.${reference}`;
}
