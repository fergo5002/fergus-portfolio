"use client";
import "./instrument.css";
import { useId, type CSSProperties } from "react";
import { settle, toFraction } from "@/lib/instrument/value";

/**
 * A linear control: a native `<input type="range">`, restyled completely
 * (track, fill and thumb are all drawn by `instrument.css`; nothing of the
 * stock control or its accent colour is left).
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <Slider label="Zoom" value={zoom} min={50} max={250} step={10}
 *         onChange={setZoom} format={(v) => `${v}%`} />
 * ```
 *
 * - `label` is visible and is the accessible name, so `getByLabel("Zoom")` and
 *   `getByRole("slider", { name: "Zoom" })` both reach it.
 * - `format` writes the readout and the `aria-valuetext`.
 * - Keys, pointer and touch are the browser's own. `layout="stack"` puts the
 *   label above the track for narrow columns; `hideLabel` keeps the label for
 *   assistive technology only, for a slider whose purpose is drawn beside it.
 */
export type SliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  disabled?: boolean;
  layout?: "row" | "stack";
  hideLabel?: boolean;
  id?: string;
  className?: string;
};

export default function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  disabled = false,
  layout = "row",
  hideLabel = false,
  id: given,
  className = "",
}: SliderProps) {
  const auto = useId();
  const id = given ?? `slider-${auto}`;
  const text = format(value);
  const fill = { "--fill": `${(toFraction(value, min, max) * 100).toFixed(2)}%` } as CSSProperties;
  return (
    <div className={`inst-slider inst-slider--${layout} ${className}`.trim()} data-disabled={disabled || undefined}>
      <label className={hideLabel ? "inst-slider__label inst-hidden" : "inst-slider__label"} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="inst-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        style={fill}
        onChange={(event) => onChange(settle(Number(event.target.value), { min, max, step }))}
      />
      <output className="inst-slider__value" htmlFor={id}>
        {text}
      </output>
    </div>
  );
}
