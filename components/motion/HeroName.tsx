"use client";

import { useEffect, useRef, useState } from "react";
import { randomGlyph, scrambleFrame } from "@/lib/scramble";
import { splitWordsWithOffsets } from "@/lib/text";
import { useSystem } from "@/components/system/SystemProvider";

/** How far from the cursor a character still feels the field, in px. */
const RADIUS = 170;
/** Peak displacement in px at the centre of the field. */
const STRENGTH = 26;

/**
 * The hero name as a magnetised row of characters.
 *
 * Each character is pushed away from the cursor with a quadratic falloff, and the
 * further it is pushed the further its red and blue channels separate: the tube
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
    <span ref={hostRef} className={`heroname ${className ?? ""}`.trim()}>
      {/*
        The name as one contiguous, real text node.

        This is not a duplicate for accessibility: `aria-label` on the wrapper
        already handled that correctly, and it was what used to be here. It is
        for the readers that are not a browser and not a screen reader.

        The decorative layer below renders one element per character so each
        glyph can be magnetised, and those elements are `inline-block` because
        `transform` does nothing otherwise. Anything that extracts text by
        stripping tags and normalising whitespace, which is most link
        unfurlers, aggregators and AI crawlers, then reads the most important
        string on this domain as `P a t r i c k  F e r g u s  O ' R e i l l y`.
        Verified against the live site before this was added.

        `aria-label` could not fix that. It is an accessibility property rather
        than content, so a text extractor has no reason to look at it. Real text
        in the document is the only thing that works for both audiences, which
        is why the label is gone and this is here instead: the accessible name
        is now the content, announced once, and the character layer is hidden
        from assistive technology so it is not announced a second time.

        Do NOT swap this for `display:none` or `visibility:hidden`. Both drop it
        from the accessibility tree, and both are reasonably read as content
        being deliberately withheld from users.
      */}
      <span className="vh">{text}</span>
      <span aria-hidden="true">
        {splitWordsWithOffsets(display).map(({ word, start }, w) => (
          <span key={w} className="heroname__word">
            {word.split("").map((ch, j) => {
          const i = start + j;
          return (
          <span
            key={i}
            className="heroname__ch"
            ref={(el) => {
              charsRef.current[i] = el;
            }}
          >
            {ch === " " ? " " : ch}
          </span>
          );
            })}
          </span>
        ))}
      </span>
    </span>
  );
}
