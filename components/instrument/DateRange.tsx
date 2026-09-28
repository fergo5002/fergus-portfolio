"use client";
import "./instrument.css";
import type { CSSProperties } from "react";
import { instrumentCopy as copy } from "@/content/tool-workbench";
import {
  availablePresets,
  addDays,
  formatDay,
  moveFrom,
  moveTo,
  presetOf,
  presetRange,
  rangeIndices,
  type DayRange,
  type PresetId,
  type Span,
} from "@/lib/instrument/dates";
import Segmented from "./Segmented";

/**
 * A date range with no stock date input: presets as a `Segmented`, and two
 * thumbs on one track for anything in between. Built for chat archives, so
 * the presets count back from the last day in the data, not from today.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <DateRange span={spanOf(messages.map((m) => m.at))}
 *            value={{ start: filter.start, end: filter.end }}
 *            onChange={({ start, end }) => change({ start, end })} />
 * ```
 *
 * - Values are local calendar days, `YYYY-MM-DD`, or `undefined` for an open
 *   end, which is what `filterMessages` in `lib/studio/lore.ts` takes.
 * - The two thumbs are native range inputs named From and To, each speaking
 *   its date as `aria-valuetext`. They cannot cross.
 * - `density`, if given, is drawn behind the track as a histogram (one bar per
 *   bucket, any number of buckets), so the thumbs sit on the shape of the data.
 */
export default function DateRange({
  span,
  value,
  onChange,
  label = copy.dates.label,
  density,
  disabled = false,
  className = "",
}: {
  span: Span | null;
  value: DayRange;
  onChange: (range: DayRange) => void;
  label?: string;
  density?: readonly number[];
  disabled?: boolean;
  className?: string;
}) {
  if (!span) return null;
  const { from, to } = rangeIndices(value, span);
  const preset = presetOf(value, span);
  const days = Math.max(1, span.days);
  const style = {
    "--from": `${((from / days) * 100).toFixed(2)}%`,
    "--to": `${((to / days) * 100).toFixed(2)}%`,
  } as CSSProperties;
  const peak = density?.length ? Math.max(1, ...density) : 1;
  return (
    <div className={`inst-dates ${className}`.trim()}>
      <Segmented<PresetId | "custom">
        label={label}
        size="sm"
        value={preset ?? "custom"}
        disabled={disabled}
        options={availablePresets(span).map((id) => ({ value: id, label: copy.dates.presets[id] }))}
        onChange={(id) => {
          if (id !== "custom") onChange(presetRange(id, span));
        }}
      />
      {span.days > 0 ? (
        <div className="inst-dates__track" style={style}>
          {density?.length ? (
            <span className="inst-dates__density" aria-hidden="true">
              {density.map((n, i) => (
                <i key={i} style={{ height: `${Math.round((n / peak) * 100)}%` }} />
              ))}
            </span>
          ) : null}
          <span className="inst-dates__rail" aria-hidden="true" />
          <input
            className="inst-dates__input"
            type="range"
            aria-label={copy.dates.from}
            min={0}
            max={span.days}
            step={1}
            value={from}
            disabled={disabled}
            aria-valuetext={formatDay(addDays(span.first, from))}
            style={{ zIndex: from >= span.days - 1 ? 3 : 2 }}
            onChange={(event) => onChange(moveFrom(value, Number(event.target.value), span))}
          />
          <input
            className="inst-dates__input"
            type="range"
            aria-label={copy.dates.to}
            min={0}
            max={span.days}
            step={1}
            value={to}
            disabled={disabled}
            aria-valuetext={formatDay(addDays(span.first, to))}
            onChange={(event) => onChange(moveTo(value, Number(event.target.value), span))}
          />
        </div>
      ) : null}
      <p className="inst-dates__readout">
        <output>{formatDay(addDays(span.first, from))}</output>
        <output>{formatDay(addDays(span.first, to))}</output>
      </p>
    </div>
  );
}
