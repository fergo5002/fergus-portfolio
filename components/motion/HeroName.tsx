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

  /**
   * The server renders the name once, as plain contiguous text. The decorative
   * per-character layer only appears after mount.
   *
   * This is about what the h1 says to something that is not a browser. The
   * character layer exists so each glyph can be magnetised, which means one
   * inline-block element per letter, which means a naive text extraction reads
   * the most important string on the domain as `P a t r i c k  F e r g u s...`.
   * Rendering both on the server fixed the extraction but left the h1 saying the
   * name twice with no separator between them, `O'ReillyPatrick`, which is a junk
   * token in the worst possible place.
   *
   * Swapping on mount gives one clean copy to every crawler and to the initial
   * paint, and the animation to everyone who runs the JavaScript. It costs
   * nothing extra: this component already replaces its own text on mount for the
   * scramble reveal, so there was already a change at exactly this moment.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    // `mounted` is in the dependency list because the character elements this
    // effect measures do not exist until it flips. Without it the effect runs
    // once against an empty charsRef, measures nothing, and the magnetism is
    // silently dead while everything still renders correctly.
    if (!mounted) return;
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
  }, [frame, onFrame, reducedMotion, mounted]);

  return (
    <span ref={hostRef} className={`heroname ${className ?? ""}`.trim()}>
      {mounted ? (
        <>
          {/*
            The contiguous copy stays in the document after mount, hidden. It is
            the accessible name (the character layer below is aria-hidden, so
            this is announced exactly once), and it means a client-rendered
            snapshot still carries the name as real text.

            Do NOT swap this for `display:none` or `visibility:hidden`. Both drop
            it from the accessibility tree, and both are reasonably read as
            content being deliberately withheld from users.
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
        </>
      ) : (
        // Server and first paint: the name, once, as plain text.
        <span className="heroname__plain">{text}</span>
      )}
    </span>
  );
}
