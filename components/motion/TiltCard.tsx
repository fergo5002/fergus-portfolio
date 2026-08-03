"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * Gives a panel the feel of a physical thing sitting under glass: it tilts
 * towards the cursor, a specular phosphor glare slides across its surface, and a
 * beam traces its perimeter (see `.tilt` in globals.css).
 *
 * Everything is published as CSS custom properties and rendered by CSS, so the
 * only JS work per move is one rect read and four `setProperty` calls — and the
 * whole effect switches off by simply not attaching the handlers under
 * `prefers-reduced-motion`.
 */
export default function TiltCard({
  children,
  className = "",
  /** Max rotation in degrees. */
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useSystem();

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      el.style.setProperty("--ry", `${((nx - 0.5) * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - ny) * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(nx * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(ny * 100).toFixed(1)}%`);
    },
    [max],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  }, []);

  if (reducedMotion) {
    return <div className={`tilt ${className}`.trim()}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={`tilt is-live ${className}`.trim()}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
      <span className="tilt__glare" aria-hidden="true" />
      <span className="tilt__trace" aria-hidden="true" />
    </div>
  );
}
