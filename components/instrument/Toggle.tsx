"use client";
import "./instrument.css";

/**
 * An on/off setting: a native `<button>` with `role="switch"` and
 * `aria-checked`. Space and Enter toggle it because it is a button.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <Toggle label="Use pseudonyms" checked={pseudo} onChange={setPseudo} />
 * ```
 *
 * In a browser check: `getByRole("switch", { name: "Use pseudonyms" }).click()`.
 *
 * Use it for a setting that is on or off. A button whose label changes with
 * its state ("Pause" and "Resume") is a pressed button, not a switch, and
 * should stay a `<button aria-pressed>`.
 */
export type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export default function Toggle({ label, checked, onChange, disabled = false, className = "" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`inst-toggle ${className}`.trim()}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="inst-toggle__track" aria-hidden="true">
        <span className="inst-toggle__thumb" />
      </span>
      <span className="inst-toggle__label">{label}</span>
    </button>
  );
}
