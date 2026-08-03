"use client";

import { useEffect, useRef, useState } from "react";
import { scrambleFrame, randomGlyph } from "@/lib/scramble";

/**
 * Renders `text` with a "terminal decrypting" reveal: starts fully scrambled and
 * resolves a few characters per tick until the real text shows.
 *
 * `trigger="mount"` runs immediately (the hero). `trigger="view"` waits until the
 * element scrolls into view, so headings decode themselves as the beam reaches
 * them. If `repeatMs` > 0, the scramble re-runs on that interval.
 *
 * The accessible name is always the final text (aria-label); the animated glyph
 * stream is aria-hidden. Under prefers-reduced-motion it renders the text static.
 */
export default function Scramble({
  text,
  className,
  speed = 28,
  charsPerTick = 1,
  repeatMs = 0,
  trigger = "mount",
}: {
  text: string;
  className?: string;
  speed?: number;
  charsPerTick?: number;
  repeatMs?: number;
  trigger?: "mount" | "view";
}) {
  const [display, setDisplay] = useState(text);
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }

    let tickTimer: ReturnType<typeof setTimeout>;
    let repeatTimer: ReturnType<typeof setInterval> | undefined;
    let io: IntersectionObserver | undefined;

    const run = () => {
      clearTimeout(tickTimer);
      let revealed = 0;
      const tick = () => {
        setDisplay(scrambleFrame(text, Math.floor(revealed), randomGlyph()));
        revealed += charsPerTick;
        if (revealed < text.length) tickTimer = setTimeout(tick, speed);
        else setDisplay(text);
      };
      setDisplay(scrambleFrame(text, 0, randomGlyph()));
      tickTimer = setTimeout(tick, speed);
    };

    const start = () => {
      run();
      if (repeatMs > 0) repeatTimer = setInterval(run, repeatMs);
    };

    if (trigger === "view" && hostRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.disconnect();
            start();
          }
        },
        { rootMargin: "-5% 0px -10% 0px", threshold: 0.2 },
      );
      io = observer;
      observer.observe(hostRef.current);
    } else {
      start();
    }

    return () => {
      clearTimeout(tickTimer);
      if (repeatTimer) clearInterval(repeatTimer);
      io?.disconnect();
    };
  }, [text, speed, charsPerTick, repeatMs, trigger]);

  return (
    <span ref={hostRef} className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
