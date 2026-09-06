"use client";
import { useId, type ReactNode } from "react";
export function StudioIntro({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <header className="studio-intro">
      <p className="studio-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{intro}</p>
    </header>
  );
}
export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  display,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  display?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="lab-field">
      <label htmlFor={id}>{label}</label>
      <span className="studio-range">
        <input
          id={id}
          type="range"
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output htmlFor={id}>{display ?? Number(value.toFixed(2))}</output>
      </span>
    </div>
  );
}
export function Toggle({
  children,
  active,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="studio-toggle"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
