"use client";
import type { ReactNode } from "react";

/**
 * A pressed button: `<button aria-pressed>`, for an action whose label names
 * what it does and may change with its state ("Focus neighbours" and "Whole
 * map", "Pause physics" and "Resume physics", a mode such as "Select / move").
 *
 * An on/off setting is a switch instead: `Toggle` from `components/instrument`.
 * A value is a `Knob` or a `Slider`, and one choice from a few is a
 * `Segmented`. The studios' second hero (`StudioIntro`) and the stock range
 * (`Range`) that used to live here are gone: the shell says what a tool is,
 * and the kit draws every control.
 */
export function Press({
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
    <button type="button" className="studio-toggle" aria-pressed={active} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
