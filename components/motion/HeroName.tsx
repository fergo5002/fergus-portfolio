"use client";

import { useEffect, useRef, useState } from "react";
import { randomGlyph, scrambleFrame } from "@/lib/scramble";
import { useSystem } from "@/components/system/SystemProvider";

/** How far from the cursor a character still feels the field, in px. */
const RADIUS = 170;
/** Peak displacement in px at the centre of the field. */
const STRENGTH = 26;

/**
 * The hero name as a magnetised row of characters.
 *
 * Each character is pushed away from the cursor with a quadratic falloff, and the
 * further it is pushed the further its red and blue channels separate — the tube
 * losing convergence under a magnet held against the glass. It also decodes out of
 * scramble on mount and re-glitches periodically.
 *
 * Positions are written straight to `style` from the shared frame loop; the only
 * React state is the scramble text, which changes at ~35 Hz for a fraction of a
 * second rather than every frame. One `getBoundingClientRect` per frame (on the
 * container, not per character) keeps the layout cost flat.
 */
export default function HeroName({ text, className }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(text);
  const hostRef = useRef<HTMLSpanElement>(null);
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const { frame, onFrame, reducedMotion } = useSystem();

  // ── scramble reveal on mount, then a periodic re-glitch ───────────────────
  useEffect(() => {
    if (reducedMotion) {
      setDisplay(text);
      return;
    }
    let tickTimer: ReturnType<typeof setTimeout>;
    const run = () => {
      clearTimeout(tickTimer);
      let revealed = 0;
      const tick = () => {
        setDisplay(scrambleFrame(text, revealed, randomGlyph()));
        revealed += 1;
        if (revealed < text.length) tickTimer = setTimeout(tick, 30);
        else setDisplay(text);
      };
      setDisplay(scrambleFrame(text, 0, randomGlyph()));
      tickTimer = setTimeout(tick, 30);
    };
    run();
    const repeat = setInterval(run, 20000);
    return () => {
      clearTimeout(tickTimer);
      clearInterval(repeat);
    };
  }, [text, reducedMotion]);

  // ── magnetic field ────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;
    const host = hostRef.current;
    if (!host) return;

    // Per-character offsets within the container. These are layout-relative, so
    // they survive scrolling and only need recomputing when the box resizes.
    let centres: { x: number; y: number }[] = [];
    const measure = () => {
      centres = charsRef.current.map((el) =>
        el
          ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 }
          : { x: 0, y: 0 },
      );
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(host);

    const current = charsRef.current.map(() => ({ x: 0, y: 0 }));

    const unsubscribe = onFrame(() => {
      const f = frame.current;
      const rect = host.getBoundingClientRect();
      const px = f.pointerX * window.innerWidth;
      const py = f.pointerY * window.innerHeight;

      for (let i = 0; i < charsRef.current.length; i++) {
        const el = charsRef.current[i];
        const c = centres[i];
        if (!el || !c) continue;

        const dx = px - (rect.left + c.x);
        const dy = py - (rect.top + c.y);
        const dist = Math.hypot(dx, dy) || 1;
        const falloff = Math.max(0, 1 - dist / RADIUS);
        const push = falloff * falloff * STRENGTH * f.pointerActive;

        const tx = (-dx / dist) * push;
        const ty = (-dy / dist) * push;

        const cur = current[i];
        cur.x += (tx - cur.x) * 0.16;
        cur.y += (ty - cur.y) * 0.16;

        if (Math.abs(cur.x) < 0.02 && Math.abs(cur.y) < 0.02) {
          if (el.style.transform !== "") {
            el.style.transform = "";
            el.style.setProperty("--split", "0");
          }
          continue;
        }

        el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
        el.style.setProperty("--split", (Math.hypot(cur.x, cur.y) * 0.09).toFixed(2));
      }
    });

    return () => {
      unsubscribe();
      ro.disconnect();
    };
  }, [frame, onFrame, reducedMotion]);

  return (
    <span ref={hostRef} className={`heroname ${className ?? ""}`.trim()} aria-label={text}>
      <span aria-hidden="true">
        {display.split("").map((ch, i) => (
          <span
            key={i}
            className="heroname__ch"
            ref={(el) => {
              charsRef.current[i] = el;
            }}
          >
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    </span>
  );
}
