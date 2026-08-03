"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * Gives a panel the feel of a physical thing sitting under glass: it tilts
 * towards the pointer, a specular phosphor glare slides across its surface, and a
 * beam traces its perimeter (see `.tilt` in globals.css).
 *
 * Everything is published as CSS custom properties and rendered by CSS, so the
 * only JS work per move is one rect read and four `setProperty` calls — and the
 * whole effect switches off by simply not attaching the handlers under
 * `prefers-reduced-motion`.
 *
 * ## Touch
 *
 * On a phone this used to be dead: the tilt was a hover affordance, and the CSS
 * disabled it outright below 768px. Now a press is the affordance. Hold the card
 * and it leans towards your thumb with the glare following it; lift and it
 * springs back while the beam runs the perimeter once, the way a tube settles
 * after something has been held against the glass.
 *
 * The touch path is chosen from `event.pointerType` rather than from a media
 * query resolved at render, so the server and the client always agree on the
 * markup — deciding it during the first client render is what causes React
 * hydration failures on exactly the devices this is meant to serve.
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
  const traceTimer = useRef<number | undefined>(undefined);
  const { reducedMotion } = useSystem();

  useEffect(() => () => window.clearTimeout(traceTimer.current), []);

  const applyFrom = useCallback(
    (clientX: number, clientY: number, strength: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      el.style.setProperty("--ry", `${((nx - 0.5) * max * 2 * strength).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - ny) * max * 2 * strength).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(nx * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(ny * 100).toFixed(1)}%`);
    },
    [max],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // A finger only steers the card while it is held down; a mouse steers by
      // being over it at all.
      if (e.pointerType === "touch" && !ref.current?.classList.contains("is-pressed")) return;
      // Touch tilt is gentler: a thumb sits much closer to the surface than a
      // cursor does, so the full angle reads as the card lurching away from it.
      applyFrom(e.clientX, e.clientY, e.pointerType === "touch" ? 0.6 : 1);
    },
    [applyFrom],
  );

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") return;
      const el = ref.current;
      if (!el) return;
      window.clearTimeout(traceTimer.current);
      el.classList.remove("is-tracing");
      el.classList.add("is-pressed");
      applyFrom(e.clientX, e.clientY, 0.6);
    },
    [applyFrom],
  );

  const release = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
    if (!el.classList.contains("is-pressed")) return;
    el.classList.remove("is-pressed");
    // The beam runs the perimeter once on release, then the class is dropped so
    // nothing is left animating on a card nobody is touching.
    el.classList.add("is-tracing");
    traceTimer.current = window.setTimeout(() => el.classList.remove("is-tracing"), 900);
  }, []);

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
      onPointerDown={onDown}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {children}
      <span className="tilt__glare" aria-hidden="true" />
      <span className="tilt__trace" aria-hidden="true" />
    </div>
  );
}
