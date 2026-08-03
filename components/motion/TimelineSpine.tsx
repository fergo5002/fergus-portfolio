"use client";

import { useEffect, useRef } from "react";
import { useSystem } from "@/components/system/SystemProvider";

/**
 * The bright line that draws itself down the experience timeline as you scroll,
 * so the beam is visibly writing the history rather than the history just being
 * there. Fills from the top of the list to wherever the middle of the viewport
 * currently sits.
 *
 * Renders fully drawn under `prefers-reduced-motion` — the line is meaningful
 * furniture, only its drawing is decorative.
 */
export default function TimelineSpine() {
  const ref = useRef<HTMLSpanElement>(null);
  const { onFrame, reducedMotion } = useSystem();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reducedMotion) {
      el.style.transform = "scaleY(1)";
      return;
    }

    const parent = el.parentElement;
    if (!parent) return;

    let published = -1;
    return onFrame(() => {
      const rect = parent.getBoundingClientRect();
      const marker = window.innerHeight * 0.62;
      const progress = Math.min(1, Math.max(0, (marker - rect.top) / Math.max(1, rect.height)));
      if (Math.abs(progress - published) < 0.004) return;
      published = progress;
      el.style.transform = `scaleY(${progress.toFixed(3)})`;
    });
  }, [onFrame, reducedMotion]);

  return <span ref={ref} className="exp__spine" aria-hidden="true" />;
}
