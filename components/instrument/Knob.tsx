"use client";
import "./instrument.css";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { applyKey, knobKey } from "@/lib/instrument/keys";
import { arcPath, polar, ticks } from "@/lib/instrument/geometry";
import {
  KNOB_SWEEP,
  dragValue,
  fromFraction,
  knobAngle,
  settle,
  toFraction,
  wheelValue,
  type Scale,
} from "@/lib/instrument/value";

/**
 * A rotary control: a native `<input type="range">` with a dial drawn over it.
 *
 * **How a tool uses it**
 *
 * ```tsx
 * <Knob label="Tempo" value={bpm} min={40} max={180} onChange={setBpm}
 *       format={(v) => `${v} BPM`} />
 * ```
 *
 * - `label` is the visible label and the accessible name. `format` writes the
 *   readout under the dial and the `aria-valuetext` a screen reader speaks.
 * - Pointer: drag up to raise, down to lower (Shift for fine). Double-click
 *   returns to `resetValue` when one is given.
 * - Wheel: one notch is one step (Shift for ten), and only while the knob has
 *   focus, so scrolling the page past a row of knobs never turns one.
 * - Keys: the native range keys plus Shift for ten steps (`lib/instrument/keys.ts`).
 * - `scale="log"` makes equal travel an equal ratio (a filter cutoff). The
 *   native input then carries the position 0 to 1000 rather than the value, so
 *   `fill()` in a browser check only means the value on a linear knob.
 *
 * The input stays in the accessibility tree and in reach of Playwright
 * (`getByRole("slider")`, `getByLabel(label).fill("120")`); it sits over the
 * dial with no opacity and no pointer events, and the dial takes the pointer.
 */
export type KnobProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  scale?: Scale;
  format?: (value: number) => string;
  resetValue?: number;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  id?: string;
  className?: string;
};

const LOG_STEPS = 1000;
const TICKS = ticks(11, -KNOB_SWEEP / 2, KNOB_SWEEP / 2);

export default function Knob({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  scale = "linear",
  format = (v) => String(v),
  resetValue,
  disabled = false,
  size = "md",
  id: given,
  className = "",
}: KnobProps) {
  const auto = useId();
  const id = given ?? `knob-${auto}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ pointer: number; y: number; start: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const bounds = { min, max, step, scale };
  const latest = useRef({ value, bounds, onChange, disabled });
  latest.current = { value, bounds, onChange, disabled };

  const fraction = toFraction(value, min, max, scale);
  const angle = knobAngle(fraction);
  const text = format(value);
  const native = scale === "log" ? Math.round(fraction * LOG_STEPS) : value;
  const tip = polar(32, 32, 15, angle);
  const root = polar(32, 32, 5, angle);

  function commit(next: number) {
    if (next !== latest.current.value) latest.current.onChange(next);
  }

  /* The wheel needs a non-passive listener to be allowed to cancel the page
     scroll, which React's synthetic onWheel cannot give. Gated on focus. */
  useEffect(() => {
    const face = faceRef.current;
    const input = inputRef.current;
    if (!face || !input) return;
    const onWheel = (event: WheelEvent) => {
      const now = latest.current;
      if (now.disabled || document.activeElement !== input) return;
      event.preventDefault();
      const next = wheelValue(now.value, event.deltaY, { ...now.bounds, coarse: event.shiftKey });
      if (next !== now.value) now.onChange(next);
    };
    face.addEventListener("wheel", onWheel, { passive: false });
    return () => face.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: PointerEvent<HTMLSpanElement>) {
    if (disabled || event.button > 0) return;
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, y: event.clientY, start: value };
  }

  function onPointerMove(event: PointerEvent<HTMLSpanElement>) {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    commit(dragValue(held.start, event.clientY - held.y, { ...bounds, fine: event.shiftKey }));
  }

  function release() {
    drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const intent = knobKey(event.key, event.shiftKey);
    if (!intent || disabled) return;
    event.preventDefault();
    commit(applyKey(value, intent, bounds));
  }

  return (
    <div className={`inst-knob inst-knob--${size} ${className}`.trim()} data-disabled={disabled || undefined}>
      <label className="inst-knob__label" htmlFor={id}>
        {label}
      </label>
      <span
        ref={faceRef}
        className="inst-knob__face"
        data-lenis-prevent={focused ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onDoubleClick={() => {
          if (!disabled && resetValue !== undefined) commit(settle(resetValue, bounds));
        }}
      >
        <svg className="inst-knob__dial" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          {TICKS.map((t) => {
            const a = polar(32, 32, 29, t);
            const b = polar(32, 32, 31.5, t);
            return <line key={t} className="inst-knob__tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          <path className="inst-knob__track" d={arcPath(32, 32, 24, -KNOB_SWEEP / 2, KNOB_SWEEP / 2)} />
          <path className="inst-knob__arc" d={arcPath(32, 32, 24, -KNOB_SWEEP / 2, angle)} />
          <circle className="inst-knob__body" cx="32" cy="32" r="18" />
          <line className="inst-knob__pointer" x1={root.x} y1={root.y} x2={tip.x} y2={tip.y} />
        </svg>
        <input
          ref={inputRef}
          id={id}
          className="inst-knob__input"
          type="range"
          min={scale === "log" ? 0 : min}
          max={scale === "log" ? LOG_STEPS : max}
          step={scale === "log" ? 1 : step}
          value={native}
          disabled={disabled}
          aria-valuetext={text}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const raw = Number(event.target.value);
            commit(scale === "log" ? settle(fromFraction(raw / LOG_STEPS, min, max, "log"), bounds) : settle(raw, bounds));
          }}
        />
      </span>
      <output className="inst-knob__value" htmlFor={id}>
        {text}
      </output>
    </div>
  );
}
