"use client";

import { useEffect, useState } from "react";
import { scrambleFrame, randomGlyph } from "@/lib/scramble";

/**
 * Renders `text` with a one-time "terminal decrypting" reveal: starts fully
 * scrambled and resolves a few characters per tick until the real text shows.
 * If `repeatMs` > 0, the scramble re-runs on that interval (a periodic glitch).
 * The accessible name is always the final text (aria-label); the animated glyph
 * stream is aria-hidden. Under prefers-reduced-motion it renders the text static.
 */
export default function Scramble({
  text,
  className,
  speed = 28,
  charsPerTick = 1,
  repeatMs = 0,
}: {
  text: string;
  className?: string;
  speed?: number;
  charsPerTick?: number;
  repeatMs?: number;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    let tickTimer: ReturnType<typeof setTimeout>;
    let repeatTimer: ReturnType<typeof setInterval> | undefined;

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

    run();
    if (repeatMs > 0) repeatTimer = setInterval(run, repeatMs);

    return () => {
      clearTimeout(tickTimer);
      if (repeatTimer) clearInterval(repeatTimer);
    };
  }, [text, speed, charsPerTick, repeatMs]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
