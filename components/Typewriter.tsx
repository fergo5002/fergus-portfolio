"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Types an array of lines in character-by-character. Announces via aria-live so
 * screen readers get the final text once (not every keystroke). Under
 * `prefers-reduced-motion: reduce` it renders all lines instantly and calls
 * onDone immediately.
 */
export default function Typewriter({
  lines,
  speed = 18,
  startDelay = 0,
  onDone,
  className,
}: {
  lines: string[];
  /** Milliseconds per character. */
  speed?: number;
  startDelay?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [shown, setShown] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const key = lines.join("");

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || lines.length === 0) {
      setShown(lines);
      setDone(true);
      onDoneRef.current?.();
      return;
    }

    let li = 0;
    let ci = 0;
    const acc: string[] = [""];
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (li >= lines.length) {
        setDone(true);
        onDoneRef.current?.();
        return;
      }
      const line = lines[li];
      if (ci < line.length) {
        acc[li] = line.slice(0, ci + 1);
        setShown([...acc]);
        ci += 1;
      } else {
        li += 1;
        ci = 0;
        acc[li] = "";
      }
      timer = setTimeout(tick, speed);
    };

    timer = setTimeout(tick, startDelay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, speed, startDelay]);

  return (
    <div className={className} aria-live="polite">
      {shown.map((line, i) => (
        <div key={i} className="tw__line">
          {line}
          {!done && i === shown.length - 1 ? (
            <span className="cursor" aria-hidden="true">
              ▋
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
