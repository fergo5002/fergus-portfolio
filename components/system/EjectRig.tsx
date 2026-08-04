"use client";

import { useEffect, useRef } from "react";
import { ejectGeometry, ejectScaleFor, ejectTransform } from "@/lib/eject";
import { useSystem } from "./SystemProvider";

/**
 * Drives the CSS half of the camera pull-back.
 *
 * The shader draws the bezel, the desk and the light spill around a rectangle;
 * this scales the live DOM into that same rectangle, from the same function, on
 * the same frame. Nothing is duplicated between the two — see `lib/eject.ts`.
 *
 * The awkward part is scrolling. Once the assembly is `position: fixed` its
 * content is out of flow, so the document collapses to nothing and the page
 * cannot scroll — which would freeze a visitor mid-page the moment they pressed
 * eject. Rather than reimplementing scrolling, a spacer restores the document's
 * original height so the native scrollbar, wheel, keyboard and Lenis all keep
 * working exactly as before, and the assembly's contents are simply translated
 * by the live scroll position each frame. The site stays fully usable while you
 * are looking at it from across the room, which is most of the point.
 */
export default function EjectRig() {
  const { frame, onFrame, ejected } = useSystem();
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const assembly = document.querySelector<HTMLElement>(".crt__assembly");
    const screen = document.querySelector<HTMLElement>(".crt__screen");
    const spacer = spacerRef.current;
    if (!assembly || !screen || !spacer) return;

    let active = false;

    const engage = () => {
      if (active) return;
      active = true;
      // Freeze the document's height before taking the content out of flow.
      spacer.style.height = `${root.scrollHeight}px`;
      root.classList.add("is-ejecting");
    };

    const release = () => {
      if (!active) return;
      active = false;
      root.classList.remove("is-ejecting");
      spacer.style.height = "0px";
      assembly.style.transform = "";
      screen.style.transform = "";
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

      const g = ejectGeometry(
        f.eject,
        (f.pointerX - 0.5) * 2,
        (f.pointerY - 0.5) * 2,
        ejectScaleFor(window.innerWidth),
      );
      assembly.style.transform = ejectTransform(g);
      // Mirror the real scroll position, so the page inside the monitor is the
      // page the document actually is.
      screen.style.transform = `translate3d(0, ${-window.scrollY}px, 0)`;
    });

    return () => {
      unsubscribe();
      release();
    };
  }, [frame, onFrame]);

  // Rendered always, sized only while ejected. Creating it on demand would mean
  // adding a full-height element in the same frame the layout is being frozen.
  return <div ref={spacerRef} className="eject-spacer" aria-hidden="true" data-ejected={ejected} />;
}
