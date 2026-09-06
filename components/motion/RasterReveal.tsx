"use client";

import { useEffect, useRef } from "react";
import type { ElementType, ReactNode } from "react";
import { isLateHydration } from "@/lib/navigation";

/**
 * The house reveal: a block paints itself in from the top down, behind a bright
 * beam line, the way a CRT draws a frame.
 *
 * Deliberately CSS-driven rather than a Motion component. The animation is
 * one-shot and non-interactive, so a JS animation runtime buys nothing: and
 * gating the hidden state behind a class added during client-side navigation
 * means a visitor without JavaScript sees the content in full rather than a
 * permanently clipped block.
 *
 * **Animate only what the visitor has not seen** (2026-09-06). The pre-hide
 * used to key on `html.js`, which is set before first paint, so on a hard load
 * every block was invisible until hydration: 2.5 seconds on a desktop, 4 on a
 * throttled phone, measured. It now keys on `html.navigated`, which exists
 * only after an in-site navigation. On a hard load the server HTML is visible
 * from first paint; when this effect finally runs it reveals a block that is
 * already on screen without the animation (animating it would hide it first)
 * and marks a block below the fold `is-unseen`, so that one still paints in
 * when the visitor scrolls to it. See `lib/navigation.ts`.
 */
export default function RasterReveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms, for sequencing siblings. */
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = (instant = false) => {
      el.style.setProperty("--reveal-delay", `${delay}ms`);
      el.classList.remove("is-unseen");
      if (instant) el.classList.add("is-instant");
      el.classList.add("is-revealed");
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      return;
    }

    if (isLateHydration()) {
      // On screen, or already scrolled past while the JavaScript was on its
      // way: both have been seen, and hiding either would take away content
      // the visitor was reading a moment ago. Only what is still below the
      // fold is genuinely unseen.
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) {
        reveal(true);
        return;
      }
      el.classList.add("is-unseen");
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal();
          io.disconnect();
        }
      },
      { rootMargin: "-6% 0px -8% 0px", threshold: 0.05 },
    );

    io.observe(el);

    // Belt and braces. Content being permanently invisible is the worst failure
    // this component can have, so if the observer has not fired after a beat and
    // the block is genuinely on screen, reveal it anyway.
    const failsafe = window.setTimeout(() => {
      if (el.classList.contains("is-revealed")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        reveal();
        io.disconnect();
      }
    }, 2500);

    return () => {
      window.clearTimeout(failsafe);
      io.disconnect();
    };
  }, [delay]);

  return (
    <Tag ref={ref} className={`raster ${className}`.trim()}>
      {children}
      <span className="raster__beam" aria-hidden="true" />
    </Tag>
  );
}
