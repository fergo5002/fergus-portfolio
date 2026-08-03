"use client";

import { useEffect, useRef } from "react";
import type { ElementType, ReactNode } from "react";

/**
 * The house reveal: a block paints itself in from the top down, behind a bright
 * beam line, the way a CRT draws a frame.
 *
 * Deliberately CSS-driven rather than a Motion component. The animation is
 * one-shot and non-interactive, so a JS animation runtime buys nothing — and
 * gating the hidden state behind the `.js` class (set pre-paint in the document
 * head) means a visitor without JavaScript sees the content in full rather than
 * a permanently clipped block.
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

    const reveal = () => {
      el.style.setProperty("--reveal-delay", `${delay}ms`);
      el.classList.add("is-revealed");
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      return;
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
