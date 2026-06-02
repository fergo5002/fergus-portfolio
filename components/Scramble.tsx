"use client";

import { useEffect, useState } from "react";
import { scrambleFrame, randomGlyph } from "@/lib/scramble";

/**
 * Renders `text` with a one-time "terminal decrypting" reveal: starts fully
 * scrambled and resolves a few characters per tick until the real text shows.
 * The accessible name is always the final text (aria-label); the animated glyph
 * stream is aria-hidden. Under prefers-reduced-motion it renders the text static.
 */
export default function Scramble({
  text,
  className,
  speed = 28,
  charsPerTick = 1,
}: {
  text: string;
  className?: string;
  speed?: number;
  charsPerTick?: number;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    let revealed = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setDisplay(scrambleFrame(text, Math.floor(revealed), randomGlyph()));
      revealed += charsPerTick;
      if (revealed < text.length) timer = setTimeout(tick, speed);
      else setDisplay(text);
    };
    setDisplay(scrambleFrame(text, 0, randomGlyph()));
    timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [text, speed, charsPerTick]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
