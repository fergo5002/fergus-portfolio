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
 * only JS work per move is one rect read and four `setProperty` calls: and the
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
 * markup: deciding it during the first client render is what causes React
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
      if (reducedMotion) return;
      // A finger only steers the card while it is held down; a mouse steers by
      // being over it at all.
      if (e.pointerType === "touch" && !ref.current?.classList.contains("is-pressed")) return;
      // Touch tilt is gentler: a thumb sits much closer to the surface than a
      // cursor does, so the full angle reads as the card lurching away from it.
      applyFrom(e.clientX, e.clientY, e.pointerType === "touch" ? 0.6 : 1);
    },
    [applyFrom, reducedMotion],
  );

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion || e.pointerType !== "touch") return;
      const el = ref.current;
      if (!el) return;
      window.clearTimeout(traceTimer.current);
      el.classList.remove("is-tracing");
      el.classList.add("is-pressed");
      applyFrom(e.clientX, e.clientY, 0.6);
    },
    [applyFrom, reducedMotion],
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

  // The markup is identical whatever the motion preference, and the handlers
  // above no-op under `reduce`.
  //
  // It used to return a different tree entirely when `reducedMotion` was true.
  // That value is resolved by a `matchMedia` read during the FIRST client render
  // (SystemProvider), so the server always assumed false while a visitor with
  // "reduce motion" enabled computed true: two structurally different trees at
  // hydration, on every project card and experience entry. The general rule is
  // to render one tree and gate it in CSS, or to flip it from an effect, never
  // to branch the tree on a client-only media query. `MachineControls` carries
  // the same note.
  //
  // Nothing is lost by rendering the live tree: every `.tilt.is-live` rule in
  // globals.css sits inside `@media (prefers-reduced-motion: no-preference)`, so
  // under `reduce` the tilt, glare and trace are all inert anyway.
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
