"use client";
import "./instrument.css";
import { useId } from "react";

/**
 * One choice from a few: a `radiogroup` of real radio inputs sharing a name.
 *
 * Because they are native radios, the group already behaves as the pattern
 * asks with no script of ours: one tab stop (the checked option), the arrow
 * keys move the choice within the group, and each option's checked state is
 * what a screen reader reports. Each radio covers its whole option, fully
 * transparent, so a click or tap anywhere on the option lands on the input.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <Segmented label="Find mode" value={mode} onChange={setMode}
 *   options={[{ value: "text", label: "Exact text" }, { value: "email", label: "Email-like text" }]} />
 * ```
 *
 * - `label` names the group (visible unless `hideLabel`).
 * - In a browser check, choose an option with
 *   `getByRole("radio", { name: "Email-like text" }).check()`.
 * - Options wrap onto a second line rather than pushing the page sideways.
 */
export type SegmentedOption<T extends string> = { value: T; label: string; disabled?: boolean };

export type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  size?: "md" | "sm";
  className?: string;
};

export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  hideLabel = false,
  size = "md",
  className = "",
}: SegmentedProps<T>) {
  const auto = useId();
  const name = `seg-${auto}`;
  const labelId = `${name}-label`;
  return (
    <div className={`inst-seg-field ${className}`.trim()}>
      <span id={labelId} className={hideLabel ? "inst-seg__legend inst-hidden" : "inst-seg__legend"}>
        {label}
      </span>
      <div className={`inst-seg inst-seg--${size}`} role="radiogroup" aria-labelledby={labelId} aria-disabled={disabled || undefined}>
        {options.map((option) => (
          <label key={option.value} className="inst-seg__opt" data-checked={option.value === value || undefined}>
            <input
              className="inst-seg__input"
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              disabled={disabled || option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="inst-seg__text">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
