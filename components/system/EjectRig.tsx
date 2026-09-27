"use client";

import { useEffect, useRef } from "react";
import {
  EJECT_CASE,
  ejectGeometry,
  ejectLean,
  ejectScaleFor,
  ejectTransform,
  powerBand,
} from "@/lib/eject";
import { useSystem } from "./SystemProvider";
import EjectHardware from "./EjectHardware";

/**
 * Drives the CSS half of the camera pull-back.
 *
 * The shader draws the bezel, the desk and the light spill around a rectangle;
 * this scales the live DOM into that same rectangle, from the same function, on
 * the same frame. Nothing is duplicated between the two: see `lib/eject.ts`.
 *
 * The awkward part is scrolling. Once the assembly is `position: fixed` its
 * content is out of flow, so the document collapses to nothing and the page
 * cannot scroll: which would freeze a visitor mid-page the moment they pressed
 * eject. Rather than reimplementing scrolling, a spacer restores the document's
 * original height so the native scrollbar, wheel, keyboard and Lenis all keep
 * working exactly as before, and the assembly's contents are simply translated
 * by the live scroll position each frame. The site stays fully usable while you
 * are looking at it from across the room, which is most of the point.
 *
 * Since the monitor grew a channel dial (2026-09-27) the page inside it can be
 * swapped for a different route while ejected, so the spacer is no longer
 * measured once: it follows the screen's height for as long as the camera is
 * off the glass. The hardware itself is `EjectHardware`, mounted here beside the
 * spacer and outside the scaled assembly.
 */
export default function EjectRig() {
  const { frame, onFrame, ejected } = useSystem();
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const assembly = document.querySelector<HTMLElement>(".crt__assembly");
    const screen = document.querySelector<HTMLElement>(".crt__screen");
    const glass = document.querySelector<HTMLElement>(".crt__glass");
    const spacer = spacerRef.current;
    if (!assembly || !screen || !spacer) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let active = false;
    /** Whatever the document holds beyond the screen, measured while it was in flow. */
    let extra = 0;
    let lastGlass = "";

    // The page inside the monitor changes height while ejected: a channel
    // change swaps the whole route, and images and fonts land late. The spacer
    // is the document's scroll range, so it follows the screen.
    const remeasure = () => {
      if (!active) return;
      spacer.style.height = `${screen.offsetHeight + extra}px`;
    };
    const observer = new ResizeObserver(remeasure);

    // The glass's corners, clipped to the radius the shader draws its own
    // with. Pre-transform pixels: the assembly is the viewport before it is
    // scaled, and the shader's radius is a fraction of the screen's height.
    const clipCorners = () => {
      assembly.style.borderRadius = `${EJECT_CASE.glass * window.innerHeight}px`;
    };

    const engage = () => {
      if (active) return;
      active = true;
      // Freeze the document's height before taking the content out of flow.
      extra = Math.max(0, root.scrollHeight - screen.offsetHeight);
      spacer.style.height = `${root.scrollHeight}px`;
      clipCorners();
      window.addEventListener("resize", clipCorners, { passive: true });
      root.classList.add("is-ejecting");
      observer.observe(screen);
    };

    const release = () => {
      if (!active) return;
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", clipCorners);
      root.classList.remove("is-ejecting");
      spacer.style.height = "0px";
      assembly.style.transform = "";
      assembly.style.borderRadius = "";
      screen.style.transform = "";
      if (glass) glass.style.transform = "";
      lastGlass = "";
    };

    const unsubscribe = onFrame(() => {
      const f = frame.current;
      // 0.004 rather than 0: the last half-percent of an exponential ease is
      // invisible but takes another second to arrive, and the fixed-position
      // assembly should not outstay it.
      if (f.eject <= 0.004 && f.ejectTarget === 0) {
        release();
        return;
      }
      engage();

      const [px, py] = ejectLean(f.pointerX, f.pointerY, f.pointerActive, coarse);
      const g = ejectGeometry(f.eject, px, py, ejectScaleFor(window.innerWidth));
      // Squashed with the raster when the monitor's power switch is off.
      assembly.style.transform = ejectTransform(g, powerBand(f.boot));
      // Mirror the real scroll position, so the page inside the monitor is the
      // page the document actually is.
      screen.style.transform = `translate3d(0, ${-window.scrollY}px, 0)`;

      // The sheen on the glass slides with you, the same light the shader
      // catches on the rim of the case.
      if (glass) {
        const next = `translate3d(${(px * g.e * 6).toFixed(2)}%, ${(py * g.e * 3).toFixed(2)}%, 0)`;
        if (next !== lastGlass) {
          glass.style.transform = next;
          lastGlass = next;
        }
      }
    });

    return () => {
      unsubscribe();
      release();
    };
  }, [frame, onFrame]);

  // Rendered always, sized only while ejected. Creating it on demand would mean
  // adding a full-height element in the same frame the layout is being frozen.
  return (
    <>
      <div ref={spacerRef} className="eject-spacer" aria-hidden="true" data-ejected={ejected} />
      <EjectHardware />
    </>
  );
}
