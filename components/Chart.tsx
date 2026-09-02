"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { niceTicks, seriesExtent, type ChartSpec } from "@/lib/chart";

/**
 * The figure an article draws.
 *
 * **Why hand-rolled, again.** Same reasoning as `lib/markdown.ts`: a charting
 * library is tens of kilobytes and an opinionated palette, to draw two shapes on
 * a page whose entire visual identity is one phosphor hue. Every library wants
 * to give a series its own colour, and this site has no second colour to give.
 *
 * **How identity works without colour.** A categorical palette is unavailable
 * here, so a series is identified three ways at once: a direct label, a fixed
 * position in the legend, and a dash pattern on the line. Luminance steps inside
 * the phosphor separate them further, but nothing depends on that alone, which
 * is what keeps the figure readable for a colourblind reader, in forced-colours
 * mode, and on the amber theme. `lib/chart.ts` caps the series count at four for
 * the same reason.
 *
 * **Bars are horizontal.** Not a style choice. Category labels here are words,
 * and a vertical bar chart with word labels either rotates them or truncates
 * them the moment the viewport is a phone. Horizontal bars carry a full label at
 * any width, and they read like the terminal table this site already renders.
 */

/** Fixed order, brightest first. Never cycled; `parseChart` caps the count at four. */
const STROKE = ["var(--green-bright)", "var(--green)", "var(--green-dim)", "var(--green-faint)"];
/** Secondary encoding, so the line series never rely on luminance alone. */
const DASH = ["", "7 4", "2 4", "10 3 2 3"];

const FONT = 12;
/** JetBrains Mono advance width at 12px. Used to reserve label gutters. */
const CH = 7.2;

const BAR_H = 15;
const BAR_GAP = 2; // Surface gap between bars inside a group.
const GROUP_GAP = 12;
const AXIS_H = 24;
const LINE_H = 260;

function format(value: number, unit?: string): string {
  const abs = Math.abs(value);
  // Thousands separators past 10,000 only. Below that a monospace column reads
  // fine without them and the comma is noise.
  const text =
    abs >= 10_000 ? value.toLocaleString("en-IE") : String(Number(value.toFixed(2)));
  return unit ? `${text}${unit.startsWith("%") ? "" : " "}${unit}` : text;
}

/**
 * A rectangle with only its far end rounded, so the bar stays anchored to the
 * baseline. `rx` on a `<rect>` rounds all four corners, which floats the bar off
 * its own zero line and is the small thing that makes a chart look untrustworthy.
 */
function barPath(x: number, y: number, w: number, h: number, flip: boolean): string {
  if (Math.abs(w) < 0.5) return "";
  const r = Math.min(4, Math.abs(w), h / 2);
  if (flip) {
    // Grows left from the zero line at `x`, so the rounded end is the left one.
    // Both arcs sweep 0: on screen, up to left and left to down are both
    // counterclockwise once the y axis points down.
    const end = x + w;
    return `M${x} ${y} H${end + r} A${r} ${r} 0 0 0 ${end} ${y + r} V${y + h - r} A${r} ${r} 0 0 0 ${end + r} ${y + h} H${x} Z`;
  }
  return `M${x} ${y} h${w - r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r} H${x} Z`;
}

export function Chart({ spec }: { spec: ChartSpec }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    // Floored so a sub-pixel container width cannot make the plot 0 wide. `el`
    // is a bare div with no padding of its own, so its box IS the plot width and
    // there is no padding arithmetic to get wrong.
    const measure = (w: number) => setWidth(Math.max(240, Math.floor(w)));

    // Measured once, directly, rather than waiting to be told. A browser does
    // not run rendering updates for a hidden tab, so ResizeObserver callbacks
    // are not delivered until the tab is shown, and a chart that only ever sized
    // itself from the observer would render at its server-side default width
    // until then. This read does not depend on delivery.
    measure(el.getBoundingClientRect().width);

    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { categories, series, unit, kind } = spec;
  const extent = seriesExtent(spec);
  const ticks = niceTicks(extent.min, extent.max);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((prev) => {
        const next = (prev ?? -1) + step;
        return Math.max(0, Math.min(categories.length - 1, next));
      });
    },
    [categories.length],
  );

  /**
   * The readout, which is a strip above the plot rather than a floating tooltip.
   *
   * A tooltip that follows the pointer has to solve collision with the viewport
   * edge, and it is unreachable by keyboard without reimplementing focus. A
   * fixed strip has neither problem, reads like the status bar this site already
   * has, and is announced by `aria-live` when the selection moves.
   *
   * Empty until something is selected. It briefly defaulted to the caption,
   * which then appeared twice in the same figure, once here and once under the
   * plot where it belongs. The strip holds its height either way so the figure
   * does not jump as the pointer crosses it.
   */
  const readout =
    active === null
      ? ""
      : `${categories[active]}  ${series
          .map((s) => `${series.length > 1 ? `${s.label} ` : ""}${format(s.values[active], unit)}`)
          .join("   ")}`;

  /**
   * The label gutter, and the ceiling that stops it eating the plot.
   *
   * 45% rather than a third: at a 358px phone column a third of the width was
   * narrower than "Broken, random ids", and because the labels are right
   * aligned to the gutter they ran off the left edge of the panel rather than
   * being clipped. Anything still too long for the ceiling is truncated below,
   * which is lossy, so the full text stays in the hover readout, the aria-label
   * and the table underneath.
   */
  const labelWidth = Math.min(
    Math.max(...categories.map((c) => c.length)) * CH + 8,
    Math.max(80, width * 0.45),
  );
  const labelChars = Math.max(4, Math.floor((labelWidth - 8) / CH));
  const shortLabel = (c: string) => (c.length <= labelChars ? c : `${c.slice(0, labelChars - 1)}…`);
  const valueGutter = (Math.max(...series.flatMap((s) => s.values.map((v) => format(v, unit).length))) + 1) * CH;

  const plotLeft = kind === "bar" ? labelWidth : Math.max(...ticks.map((t) => format(t).length)) * CH + 8;
  const plotRight = kind === "bar" ? valueGutter : 12;
  const plotW = Math.max(40, width - plotLeft - plotRight);

  const groupH = series.length * BAR_H + (series.length - 1) * BAR_GAP;
  const height =
    kind === "bar" ? categories.length * (groupH + GROUP_GAP) + AXIS_H : LINE_H + AXIS_H;
  const plotH = height - AXIS_H;

  const x = (v: number) => plotLeft + ((v - lo) / span) * plotW;
  const y = (v: number) => plotH - ((v - lo) / span) * plotH;
  const xAt = (i: number) =>
    plotLeft + (categories.length === 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);

  const zero = x(Math.max(lo, Math.min(0, hi)));

  return (
    <figure className="chart">
      <figcaption className="chart__title">{spec.title}</figcaption>

      <p className="chart__readout" aria-live="polite">
        {readout}
      </p>

      {/* The measured element is this bare div rather than the figure, because
          the figure carries padding and a border and the plot wants neither in
          its width. */}
      <div className="chart__plot" ref={wrap}>
      <svg
        className="chart__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${spec.title}. ${series
          .map((s) => `${s.label}: ${s.values.map((v) => format(v, unit)).join(", ")}`)
          .join(". ")}. Categories: ${categories.join(", ")}.`}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        {kind === "bar" ? (
          <>
            {/* Grid first, so every mark sits on top of it. */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={x(t)}
                x2={x(t)}
                y1={0}
                y2={plotH}
                className={t === 0 ? "chart__axis" : "chart__grid"}
              />
            ))}
            {ticks.map((t) => (
              <text key={`l${t}`} x={x(t)} y={plotH + 15} className="chart__tick" textAnchor="middle">
                {format(t)}
              </text>
            ))}

            {/* A reference line is often the whole point of the figure: the
                budget the bars are supposed to sit under. It reads vertically
                here because the bars run horizontally. */}
            {spec.baseline !== undefined && (
              <g>
                <line x1={x(spec.baseline)} x2={x(spec.baseline)} y1={0} y2={plotH} className="chart__baseline" />
                {spec.baselineLabel && (
                  <text x={x(spec.baseline) - 6} y={12} className="chart__baselabel" textAnchor="end">
                    {spec.baselineLabel}
                  </text>
                )}
              </g>
            )}

            {categories.map((cat, i) => {
              const top = i * (groupH + GROUP_GAP) + GROUP_GAP / 2;
              const on = active === i;
              return (
                <g
                  key={cat}
                  onPointerEnter={() => setActive(i)}
                  className={on ? "chart__group is-on" : "chart__group"}
                >
                  {/* Full-width hit target: the row, not the bar, so a short bar
                      is as easy to reach as a long one. */}
                  <rect x={0} y={top - GROUP_GAP / 2} width={width} height={groupH + GROUP_GAP} fill="transparent" />
                  <text x={labelWidth - 8} y={top + groupH / 2 + 4} className="chart__cat" textAnchor="end">
                    {shortLabel(cat)}
                  </text>
                  {series.map((s, si) => {
                    const v = s.values[i];
                    const yy = top + si * (BAR_H + BAR_GAP);
                    const w = x(v) - zero;
                    return (
                      <path
                        key={s.label}
                        d={barPath(zero, yy, w, BAR_H, w < 0)}
                        className="chart__bar"
                        style={{ fill: STROKE[si] }}
                      />
                    );
                  })}
                  {/* Direct value label on every bar. The chart is readable with
                      no pointer at all, which is the point. */}
                  {series.map((s, si) => {
                    const v = s.values[i];
                    const yy = top + si * (BAR_H + BAR_GAP);
                    return (
                      <text
                        key={`v${s.label}`}
                        x={Math.max(x(v), zero) + 6}
                        y={yy + BAR_H - 3}
                        className="chart__value"
                      >
                        {format(v, unit)}
                      </text>
                    );
                  })}
                </g>
              );
            })}
          </>
        ) : (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={plotLeft} x2={plotLeft + plotW} y1={y(t)} y2={y(t)} className="chart__grid" />
                <text x={plotLeft - 8} y={y(t) + 4} className="chart__tick" textAnchor="end">
                  {format(t)}
                </text>
              </g>
            ))}

            {spec.baseline !== undefined && (
              <g>
                <line
                  x1={plotLeft}
                  x2={plotLeft + plotW}
                  y1={y(spec.baseline)}
                  y2={y(spec.baseline)}
                  className="chart__baseline"
                />
                {spec.baselineLabel && (
                  <text x={plotLeft + plotW} y={y(spec.baseline) - 6} className="chart__baselabel" textAnchor="end">
                    {spec.baselineLabel}
                  </text>
                )}
              </g>
            )}

            {series.map((s, si) => (
              <path
                key={s.label}
                d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)} ${y(v)}`).join(" ")}
                className="chart__line"
                style={{ stroke: STROKE[si], strokeDasharray: DASH[si] || undefined }}
              />
            ))}

            {active !== null && (
              <line x1={xAt(active)} x2={xAt(active)} y1={0} y2={plotH} className="chart__cross" />
            )}

            {series.map((s, si) =>
              s.values.map((v, i) => (
                <circle
                  key={`${s.label}${i}`}
                  cx={xAt(i)}
                  cy={y(v)}
                  r={active === i ? 5 : 4}
                  className="chart__dot"
                  style={{ fill: active === i ? "var(--amber)" : STROKE[si] }}
                />
              )),
            )}

            {categories.map((cat, i) => (
              <text
                key={cat}
                x={xAt(i)}
                y={plotH + 16}
                className={active === i ? "chart__tick is-on" : "chart__tick"}
                textAnchor={i === 0 ? "start" : i === categories.length - 1 ? "end" : "middle"}
              >
                {cat}
              </text>
            ))}

            {/* Invisible column per category, so the whole height is a hit target. */}
            {categories.map((cat, i) => {
              const w = plotW / Math.max(1, categories.length - 1);
              return (
                <rect
                  key={`hit${cat}`}
                  x={xAt(i) - w / 2}
                  y={0}
                  width={w}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                />
              );
            })}
          </>
        )}
      </svg>
      </div>

      {series.length > 1 && (
        <ul className="chart__legend">
          {series.map((s, si) => (
            <li key={s.label} className="chart__legenditem">
              <svg width="18" height="8" aria-hidden="true">
                {kind === "line" ? (
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    style={{ stroke: STROKE[si], strokeDasharray: DASH[si] || undefined }}
                    strokeWidth="2"
                  />
                ) : (
                  <rect x="0" y="1" width="18" height="6" rx="2" style={{ fill: STROKE[si] }} />
                )}
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {/* The text alternative. Present for every chart, not only the complex
          ones: it is what a screen reader, a scraper and a printed page get. */}
      <details className="chart__data">
        <summary>Show the numbers</summary>
        <div className="prose__tablewrap">
          <table className="prose__table">
            <thead>
              <tr>
                <th className="prose__th">{unit ? `Value (${unit})` : "Value"}</th>
                {series.map((s) => (
                  <th key={s.label} className="prose__th">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <tr key={cat}>
                  <td className="prose__td">{cat}</td>
                  {series.map((s) => (
                    <td key={s.label} className="prose__td">
                      {format(s.values[i], unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {spec.caption && <p className="chart__caption">{spec.caption}</p>}
    </figure>
  );
}
