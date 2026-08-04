"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

/**
 * Makes a small interactive element attract towards the cursor while the pointer
 * is near it, then spring back when it leaves.
 *
 * This is the one place a physics runtime earns its keep. The ambient layers are
 * all continuous per-frame writes where a spring library only adds overhead, but
 * a discrete control that must overshoot slightly and settle is exactly what
 * `useSpring` models well: and getting that settle right by hand is fiddly.
 */
export default function Magnetic({
  children,
  className = "",
  /** How far the element travels towards the cursor, as a fraction of the offset. */
  pull = 0.35,
}: {
  children: ReactNode;
  className?: string;
  pull?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });

  // Deliberately NOT `if (reduce) return <span>…</span>`.
  //
  // `useReducedMotion` resolves during the first client render, so the server
  // always assumes false and a visitor with "reduce motion" on would render a
  // different element than the one that was sent: a hydration mismatch on every
  // nav link. Rendering the same `motion.span` either way and simply never
  // setting x/y leaves it at rest, which is exactly what `reduce` should mean.
  const onMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * pull);
    y.set((e.clientY - (rect.top + rect.height / 2)) * pull);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={ref}
      className={`magnetic ${className}`.trim()}
      style={{ x: springX, y: springY }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.span>
  );
}
