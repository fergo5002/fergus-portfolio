"use client";
import "./instrument.css";
import { useId, type ReactNode } from "react";

/**
 * A long list of choices: a native `<select>`, styled to the machine (16px
 * text, a 44px box, a drawn chevron in the phosphor colour, no stock arrow).
 * Reach for `Segmented` first when there are five choices or fewer; this is
 * for column pickers, town lists and the like, where only the open list is
 * the browser's own.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <Select label="Which column holds the date" value={String(column)}
 *         onChange={(v) => setColumn(Number(v))}>
 *   {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
 * </Select>
 * ```
 *
 * `getByLabel(label).selectOption(...)` reaches it in a browser check.
 */
export default function Select({
  label,
  value,
  onChange,
  children,
  disabled = false,
  hideLabel = false,
  id: given,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const id = given ?? `select-${auto}`;
  return (
    <div className={`inst-select ${className}`.trim()}>
      <label className={hideLabel ? "inst-select__label inst-hidden" : "inst-select__label"} htmlFor={id}>
        {label}
      </label>
      <span className="inst-select__box">
        <select id={id} className="inst-select__input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
      </span>
    </div>
  );
}
